export type PriceRow = {
  matId: number;
  matName: string;
  currentPrice: number;
  avgPrice: number;
};

export type Company = {
  name: string;
  cash: number;
  pr: number;
  bases: { id: number; name: string; warehouseId: number; planetId: number }[];
  ships: { id: number; name: string; warehouseId: number }[];
  exWhId?: number;
};

export type Warehouse = {
  cap?: number;
  mats?: { id: number; am: number }[];
};

export type StockRow = {
  locationType: "Base" | "Ship" | "Market";
  locationName: string;
  warehouseId: number;
  capacity: number | null;
  matId: number;
  amount: number;
};

const BASE = "https://api.g2.galactictycoons.com";
const COMPANY_CACHE_KEY = "gt_company_cache_v1";
const COMPANY_TTL_MS = 60_000; // 60s cache
let companyInFlight: Promise<Company> | null = null;

const PRICES_CACHE_KEY = "gt_prices_cache_v1";
const PRICES_TTL_MS = 60_000; // 60s cache
let pricesInFlight: Promise<PriceRow[]> | null = null;


async function fetchJson<T>(url: string, apiKey?: string): Promise<T> {
  const r = await fetch(url, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return (await r.json()) as T;
}

export async function fetchCompany(apiKey: string): Promise<Company> {
  // 1) Serve from cache (client only)
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(COMPANY_CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as { ts: number; company: Company };
        if (cached?.ts && cached.company && Date.now() - cached.ts < COMPANY_TTL_MS) {
          return cached.company;
        }
      }
    } catch {
      // ignore cache parse issues
    }
  }

  // 2) De-dupe concurrent calls
  if (companyInFlight) return companyInFlight;

  const url = `${BASE}/public/company`;

  const run = async () => {
    const r = await fetch(url, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    });

    if (!r.ok) {
      if (r.status === 429) {
        const ra = r.headers.get("Retry-After");
        throw new Error(
          ra
            ? `HTTP 429 (rate limited). Try again in ${ra} seconds.`
            : `HTTP 429 (rate limited). Try again in a bit.`
        );
      }
      throw new Error(`HTTP ${r.status} for ${url}`);
    }

    const company = (await r.json()) as Company;

    // write cache (client only)
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(COMPANY_CACHE_KEY, JSON.stringify({ ts: Date.now(), company }));
      } catch {
        // ignore storage issues
      }
    }

    return company;
  };

  companyInFlight = run().finally(() => {
    companyInFlight = null;
  });

  return companyInFlight;
}


export async function fetchWarehouse(warehouseId: number, apiKey: string): Promise<Warehouse> {
  return fetchJson<Warehouse>(`${BASE}/public/company/warehouse/${warehouseId}`, apiKey);
}

/**
 * Builds a Stocks_All-like array (no matName yet; we’ll map that later via prices).
 */
export async function fetchAllStocks(apiKey: string): Promise<StockRow[]> {
  const company = await fetchCompany(apiKey);

  const locations: { type: StockRow["locationType"]; name: string; warehouseId: number }[] = [];
  (company.bases || []).forEach((b) => locations.push({ type: "Base", name: b.name, warehouseId: b.warehouseId }));
  (company.ships || []).forEach((s) => locations.push({ type: "Ship", name: s.name, warehouseId: s.warehouseId }));
  if (company.exWhId) locations.push({ type: "Market", name: "Exchange", warehouseId: company.exWhId });

  const rows: StockRow[] = [];

  // Fetch in parallel
  const whs = await Promise.all(
    locations.map(async (loc) => {
      const wh = await fetchWarehouse(loc.warehouseId, apiKey);
      return { loc, wh };
    })
  );

  for (const { loc, wh } of whs) {
    const cap = typeof wh.cap === "number" ? wh.cap : null;
    for (const m of wh.mats || []) {
      const matId = Number(m.id);
      const amount = Number(m.am ?? 0);
      if (!matId || !amount) continue;
      rows.push({
        locationType: loc.type,
        locationName: loc.name,
        warehouseId: loc.warehouseId,
        capacity: cap,
        matId,
        amount,
      });
    }
  }

  return rows;
}

export async function fetchPrices(): Promise<PriceRow[]> {
  // 1) Serve from cache (client only)
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(PRICES_CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as { ts: number; prices: PriceRow[] };
        if (
          cached?.ts &&
          Array.isArray(cached.prices) &&
          Date.now() - cached.ts < PRICES_TTL_MS
        ) {
          return cached.prices;
        }
      }
    } catch {
      // ignore cache parse issues
    }
  }

  // 2) De-dupe concurrent calls
  if (pricesInFlight) return pricesInFlight;

  const url = `${BASE}/public/exchange/mat-prices`;

  const run = async () => {
    // Use your stored API key if present (better rate limit than IP-based)
    const apiKey =
      typeof window !== "undefined"
        ? (localStorage.getItem("gt_api_key_v1") || "").trim()
        : "";

    const r = await fetch(url, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    });

    if (!r.ok) {
      if (r.status === 429) {
        const ra = r.headers.get("Retry-After");
        throw new Error(
          ra
            ? `HTTP 429 (rate limited). Try again in ${ra} seconds.`
            : `HTTP 429 (rate limited). Try again in a bit.`
        );
      }
      throw new Error(`HTTP ${r.status} for ${url}`);
    }

    const data = (await r.json()) as { prices: PriceRow[] };
    const prices = (data?.prices ?? []) as PriceRow[];

    // write cache (client only)
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(
          PRICES_CACHE_KEY,
          JSON.stringify({ ts: Date.now(), prices })
        );
      } catch {
        // ignore storage quota issues
      }
    }

    return prices;
  };

  pricesInFlight = run().finally(() => {
    pricesInFlight = null;
  });

  return pricesInFlight;
}

// -------- Company directory (best-effort) --------
// Built by deduping company ids/names found in Exchange order books.
// Source: GET /public/exchange/mat-details (costly endpoint; don’t call often).

export type KnownCompany = {
  id: number;
  name: string;
  lastSeenAt: string; // ISO
};

const LS_COMPANY_DIR = "gt_company_dir_v1";
const COMPANY_DIR_TTL_MS = 24 * 60 * 60 * 1000; // 24h

type ExchangeOrder = { cId: number; cName: string };
type ExchangeMatDetails = { orders?: ExchangeOrder[] };
type ExchangeAllDetails = { materials?: ExchangeMatDetails[] };

export function loadCompanyDirectory(): { ts: number; companies: KnownCompany[] } {
  try {
    const raw = localStorage.getItem(LS_COMPANY_DIR);
    if (!raw) return { ts: 0, companies: [] };
    const parsed = JSON.parse(raw) as { ts: number; companies: KnownCompany[] };
    if (!parsed || !Array.isArray(parsed.companies)) return { ts: 0, companies: [] };
    return { ts: Number(parsed.ts || 0), companies: parsed.companies };
  } catch {
    return { ts: 0, companies: [] };
  }
}

function saveCompanyDirectory(ts: number, companies: KnownCompany[]) {
  localStorage.setItem(LS_COMPANY_DIR, JSON.stringify({ ts, companies }));
}

export async function refreshCompanyDirectoryFromExchange(
  apiKey?: string,
  force = false
): Promise<KnownCompany[]> {
  if (typeof window === "undefined") return [];

  const cached = loadCompanyDirectory();
  const fresh = Date.now() - cached.ts < COMPANY_DIR_TTL_MS;
  if (!force && fresh && cached.companies.length) return cached.companies;

  // Pull all market details (includes active orders with cId/cName)
  const data = await fetchJson<ExchangeAllDetails>(`${BASE}/public/exchange/mat-details`, apiKey);

  const byId = new Map<number, KnownCompany>();

  // start with what we already know
  for (const c of cached.companies) {
    if (Number.isFinite(c.id) && c.name) byId.set(c.id, c);
  }

  const nowIso = new Date().toISOString();

  for (const mat of data.materials || []) {
    for (const o of mat.orders || []) {
      const id = Number((o as any).cId);
      const name = String((o as any).cName || "").trim();
      if (!id || !name) continue;

      const existing = byId.get(id);
      if (!existing) {
        byId.set(id, { id, name, lastSeenAt: nowIso });
      } else {
        // keep latest name in case it changes formatting, and update last seen
        byId.set(id, { ...existing, name, lastSeenAt: nowIso });
      }
    }
  }

  const companies = Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  saveCompanyDirectory(Date.now(), companies);
  return companies;
}
