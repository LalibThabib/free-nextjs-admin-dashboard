import fs from "node:fs/promises";

const BASE = "https://api.g2.galactictycoons.com";
const OUT_PATH = "public/images/company-directory.json";

const API_KEY = process.env.GT_API_KEY?.trim();
if (!API_KEY) {
  console.error("Missing GT_API_KEY env var. Example: GT_API_KEY=xxxx node scripts/buildCompanyDirectory.mjs");
  process.exit(1);
}

async function fetchJson(url) {
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) {
    const retryAfter = r.headers.get("Retry-After");
    throw new Error(
      retryAfter
        ? `HTTP ${r.status} for ${url} (Retry-After: ${retryAfter}s)`
        : `HTTP ${r.status} for ${url}`
    );
  }
  return r.json();
}

async function main() {
  // 0) Load existing directory if present
  let existing = { ts: 0, companies: [] };
  try {
    const raw = await fs.readFile(OUT_PATH, "utf8");
    existing = JSON.parse(raw);
  } catch {
    // file might not exist yet — that's fine
  }

  const byId = new Map();

  // seed with existing companies
  for (const c of existing.companies || []) {
    const id = Number(c?.id);
    const name = String(c?.name || "").trim();
    if (!id || !name) continue;
    byId.set(id, {
      id,
      name,
      lastSeenAt: c?.lastSeenAt || null,
      firstSeenAt: c?.firstSeenAt || null,
    });
  }

  // 1) Fetch latest snapshot (active offers)
  const data = await fetchJson(`${BASE}/public/exchange/mat-details`);

  const nowIso = new Date().toISOString();

  for (const mat of data.materials || []) {
    for (const o of mat.orders || []) {
      const id = Number(o?.cId);
      const name = String(o?.cName || "").trim();
      if (!id || !name) continue;

      const prev = byId.get(id);
      byId.set(id, {
        id,
        name, // keep latest name
        firstSeenAt: prev?.firstSeenAt || nowIso,
        lastSeenAt: nowIso,
      });
    }
  }

  const companies = Array.from(byId.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const payload = { ts: Date.now(), companies };

  await fs.writeFile(OUT_PATH, JSON.stringify(payload, null, 2), "utf8");
  console.log(`Wrote ${companies.length} companies -> ${OUT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
