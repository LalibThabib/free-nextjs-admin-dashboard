"use client";

import { fetchCompany } from "./lib/gtApi";
import { useEffect, useRef, useState } from "react";
import { loadContracts, saveContracts, newId } from "./lib/contracts";
import type { ContractRow } from "./lib/contracts";
import { fetchAllStocks, fetchPrices } from "./lib/gtApi";
import { buildStockMap } from "./lib/planner";
import { computeContractStatus } from "./lib/planner";
import { fetchRecipeLines, buildRecipeMap } from "./lib/recipes";
import { computeTransportNeeded } from "./lib/planner";
import { loadMake, saveMake } from "./lib/make";
import type { MakeRow } from "./lib/planner";
import { computeProductionNeeded } from "./lib/planner";
import { computeBuyNeeded } from "./lib/planner";
import { computeIngredientTransportNeeded } from "./lib/planner";
import { useHeaderSlot } from "@/context/HeaderSlotContext";
import { MaterialLabel } from "@/components/common/MaterialLabel";
import { loadCompanyDirectory } from "./lib/gtApi";
import Link from "next/link";
import React from "react";


const BASE_PATH = process.env.NODE_ENV === "production" ? "/free-nextjs-admin-dashboard" : "";
const SORT_ICON = `${BASE_PATH}/images/icons/sorting-arrow.svg`;

export default function ContractsEditor() {


  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const LS_API_KEY = "gt_api_key_v1";
const [apiKey, setApiKey] = useState("");

useEffect(() => {
  if (typeof window === "undefined") return;

  const k = localStorage.getItem(LS_API_KEY) || "";
  if (!k.trim()) return;

  setApiKey(k);

fetchCompany(k)
  .then((company) => {
    const bases: string[] = [];
    company.bases?.forEach((b) => bases.push(b.name));

    const locs: string[] = ["Exchange Station", ...bases];
    company.ships?.forEach((s) => locs.push(s.name));

    setLocations(locs);

    localStorage.setItem("gt_locations_v1", JSON.stringify(locs)); // bases + ships
    localStorage.setItem("gt_bases_v1", JSON.stringify(bases)); // bases only
  })
  .catch((e) => {
    console.warn("fetchCompany failed (likely rate limit):", e);

    // fallback: use last known locations so the UI still works
    try {
      const cached = localStorage.getItem("gt_locations_v1");
      if (cached) setLocations(JSON.parse(cached));
    } catch {}
  });


}, []);

useEffect(() => {
  (async () => {
    const LS_KEY = "gt_recipes_cache_v1";
    const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

    try {
      // 1) Try cache first
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as { ts: number; lines: any[] };
        if (
          cached?.ts &&
          Array.isArray(cached.lines) &&
          Date.now() - cached.ts < TTL_MS
        ) {
          setRecipeMap(buildRecipeMap(cached.lines));
          return;
        }
      }
    } catch {
      // ignore cache issues
    }

    try {
      // 2) Fetch + cache
      const base = process.env.NODE_ENV === "production" ? "/free-nextjs-admin-dashboard" : "";
const lines = await fetch(`${base}/data/recipes.json`).then((r) => r.json());
setRecipeMap(buildRecipeMap(lines));

      localStorage.setItem(LS_KEY, JSON.stringify({ ts: Date.now(), lines }));
      setRecipeMap(buildRecipeMap(lines));
    } catch (e) {
      console.error("Recipe load failed", e);
    }
  })();
}, []);




const [contractStatus, setContractStatus] = useState<
  {
    id: string;
    client: string;
    product: string;
    destination: string;
    unitsPerDay: number;
    availAtDestination: number;
    missing: number;
    daysCovered: number;
    status: "OK" | "SHORT";
  }[]
>([]);

const [stocksErr, setStocksErr] = useState<string | null>(null);
const [stocksCount, setStocksCount] = useState<number | null>(null);
const [stocksPreview, setStocksPreview] = useState<string[]>([]);
const [lastStockMap, setLastStockMap] = useState<Map<string, Map<string, number>> | null>(null);
const [materials, setMaterials] = useState<string[]>([]);
const [locations, setLocations] = useState<string[]>([]);
const [recipeMap, setRecipeMap] = useState<
  Map<string, { outQty: number; inputs: { name: string; qty: number }[] }> | null
>(null);
const [productionNeeded, setProductionNeeded] = useState<
  {
    product: string;
    unitsPerDay: number;
    produceAt: string;
    inputsStatus: string;
    notes: string;
  }[]
>([]);
const [draftContract, setDraftContract] = useState<ContractRow | null>(null);
const [editingId, setEditingId] = useState<string | null>(null);
const [editDraft, setEditDraft] = useState<ContractRow | null>(null);
const [showTransport, setShowTransport] = useState(true);
const [showProduction, setShowProduction] = useState(true);
const [showBuy, setShowBuy] = useState(true);
const [companyDir, setCompanyDir] = useState<string[]>([]);


const [transportNeeded, setTransportNeeded] = useState<
  { material: string; units: number; from: string; to: string; notes: string }[]
>([]);
const [makeRows, setMakeRows] = useState<MakeRow[]>(() => loadMake());
const didLoadCompanyRef = useRef(false);
const [mounted, setMounted] = useState(false);
const [buyNeeded, setBuyNeeded] = useState<
  { material: string; unitsPerDay: number; notes: string }[]
>([]);
const [isRefreshing, setIsRefreshing] = useState(false);
const [lastRefreshedAt, setLastRefreshedAt] = useState<string>("");
const [priceMap, setPriceMap] = useState<Map<string, { current: number | null; avg: number | null }>>(
  () => new Map()
);


const LS_MAT_WEIGHTS = "gt_mat_weights_v1";
const [weightByName, setWeightByName] = useState<Map<string, number>>(new Map());
type SortKey = "client" | "destination" | "material" | "status" | "missing" | "value";

const [sortKey, setSortKey] = useState<SortKey>("material");
const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

type TransportSortKey = "material" | "units" | "weight" | "location";
const [transportSortKey, setTransportSortKey] = useState<TransportSortKey>("material");
const [transportSortDir, setTransportSortDir] = useState<"asc" | "desc">("asc");

const handleTransportSort = (k: TransportSortKey) => {
  if (transportSortKey !== k) {
    setTransportSortKey(k);
    setTransportSortDir("asc");
  } else {
    setTransportSortDir((d) => (d === "asc" ? "desc" : "asc"));
  }
};

type ProductionSortKey = "material" | "units" | "location" | "inputsStatus";
const [productionSortKey, setProductionSortKey] = useState<ProductionSortKey>("material");
const [productionSortDir, setProductionSortDir] = useState<"asc" | "desc">("asc");

const handleProductionSort = (k: ProductionSortKey) => {
  if (productionSortKey !== k) {
    setProductionSortKey(k);
    setProductionSortDir("asc");
  } else {
    setProductionSortDir((d) => (d === "asc" ? "desc" : "asc"));
  }
};

type BuySortKey = "material" | "units" | "location" | "current" | "average" | "total";
const [buySortKey, setBuySortKey] = useState<BuySortKey>("material");
const [buySortDir, setBuySortDir] = useState<"asc" | "desc">("asc");

const handleBuySort = (k: BuySortKey) => {
  if (buySortKey !== k) {
    setBuySortKey(k);
    setBuySortDir("asc");
  } else {
    setBuySortDir((d) => (d === "asc" ? "desc" : "asc"));
  }
};

const calcWeightT = (material: string, units: number): number | null => {
  const w = weightByName.get(material); // tonnes per unit
  if (w == null) return null;
  return Number(units || 0) * w;
};

const fmtWeightT = (material: string, units: number) => {
  const total = calcWeightT(material, units);
  if (total == null) return "—";
  const rounded1 = Math.round(total * 10) / 10;
  const text = Number.isInteger(rounded1) ? String(rounded1) : rounded1.toFixed(1);
  return `${text} t`;
};

const handleSort = (k: SortKey) => {
  if (sortKey !== k) {
    setSortKey(k);
    setSortDir("asc");
  } else {
    setSortDir((d) => (d === "asc" ? "desc" : "asc"));
  }
};

const normSort = (s: string) => (s || "").trim().toLowerCase();

const getRowRatio = (r: { availAtDestination: number; unitsPerDay: number }) => {
  const needed = Number(r.unitsPerDay || 0);
  const available = Number(r.availAtDestination || 0);
  return needed > 0 ? available / needed : 1;
};

const getRowValue = (r: { product: string; unitsPerDay: number }) => {
  const px = priceMap.get(r.product);
  const unit = px?.avg ?? px?.current ?? null;
  return unit === null ? null : Number(r.unitsPerDay || 0) * unit;
};

useEffect(() => {
  if (typeof window === "undefined") return;

  // 1) load cached weights first (if any)
  try {
    const raw = localStorage.getItem(LS_MAT_WEIGHTS);
    if (raw) setWeightByName(new Map(JSON.parse(raw)));
  } catch {
    // ignore
  }

  // 2) refresh from static game data (no API key needed)
  fetch("https://api.g2.galactictycoons.com/gamedata.json")
    .then((r) => r.json())
    .then((data) => {
      const m = new Map<string, number>();
      for (const mat of data?.materials ?? []) {
        const name = String(mat?.name ?? mat?.sName ?? "").trim();
        const w = Number(mat?.weight); // tonnes per unit
        if (name && Number.isFinite(w)) m.set(name, w);
      }
      if (m.size) {
        setWeightByName(m);
        localStorage.setItem(LS_MAT_WEIGHTS, JSON.stringify(Array.from(m.entries())));
      }
    })
    .catch(() => {});
}, []);


const materialByName = React.useMemo(() => {
  // Uses the same cache you already write: localStorage.setItem("gt_materials_v1", JSON.stringify(mats))
  if (typeof window === "undefined") return new Map<string, any>();

  try {
    const raw = localStorage.getItem("gt_materials_v1");
    const list = raw ? (JSON.parse(raw) as any[]) : [];
    return new Map(list.map((m: any) => [m.name, m]));
  } catch {
    return new Map<string, any>();
  }
}, []);

const contractByKey = (product: string, destination: string) =>
  contracts.find(
    (c) =>
      (c.product || "").trim() === (product || "").trim() &&
      (c.destination || "").trim() === (destination || "").trim()
  );

const { setRightContent } = useHeaderSlot();

const refresh = async (overrideKey?: string) => {
  try {
    setIsRefreshing(true);
    setStocksErr(null);

   const key = (overrideKey ?? apiKey ?? "").trim();
  if (!key) {
  setStocksErr(`No API key set yet. Go to Settings and paste your API key.`);
  return;
}


    if (!key) {
      setStocksErr(`No API key found in localStorage (${LS_API_KEY}).`);
      return;
    }

   const [rowsRes, pricesRes] = await Promise.allSettled([
  fetchAllStocks(key),
  fetchPrices(),
]);

if (rowsRes.status !== "fulfilled") throw rowsRes.reason;

const rows = rowsRes.value;
const prices = pricesRes.status === "fulfilled" ? pricesRes.value : [];
if (pricesRes.status !== "fulfilled") {
  console.warn("fetchPrices failed (likely rate limit):", pricesRes.reason);
}





    const pm = new Map<string, { current: number | null; avg: number | null }>();

for (const p of prices || []) {
  const name = String((p as any).matName || "").trim();
  if (!name) continue;

  // Use only fields that exist; fall back to null if missing
 const currentRaw = (p as any).currentPrice;
const avgRaw = (p as any).avgPrice;
const current = Number.isFinite(Number(currentRaw)) ? Number(currentRaw) / 100 : null;
const avg = Number.isFinite(Number(avgRaw)) ? Number(avgRaw) / 100 : null;


  pm.set(name, { current, avg });
}


    setPriceMap(pm);
    const mats = (prices ?? [])
  .map((p: any) => String(p.matName || "").trim())
  .filter(Boolean)
  .sort((a: string, b: string) => a.localeCompare(b));

setMaterials(mats);
localStorage.setItem("gt_materials_v1", JSON.stringify(mats));


    const idToName = new Map(prices.map((p: any) => [p.matId, p.matName]));

    const namedStocks = rows.map((r: any) => ({
      locationName: r.locationName,
      matName: idToName.get(r.matId) ?? String(r.matId),
      amount: r.amount,
    }));

    const stockMap = buildStockMap(namedStocks);
    setLastStockMap(stockMap);
    
    const status = computeContractStatus(contracts, stockMap);
    setContractStatus(status);
    
    const baseTransport = computeTransportNeeded(contracts, stockMap);

    if (recipeMap) {
  setProductionNeeded(computeProductionNeeded(contracts, stockMap, makeRows, recipeMap));
} else {
  setProductionNeeded([]);
}
if (recipeMap) {
  setBuyNeeded(computeBuyNeeded(contracts, stockMap, makeRows, recipeMap, productionNeeded)
  );
  

} else {
  setBuyNeeded([]);
}

    setStocksErr(null);

    setStocksCount(rows.length);
    setStocksPreview(
      namedStocks.slice(0, 8).map((r: any) => `${r.locationName}: ${r.matName} = ${r.amount}`)
    );
    setLastRefreshedAt(new Date().toLocaleTimeString());

  } catch (e: any) {
    setStocksErr(e?.message ?? String(e));
     } finally {
    setIsRefreshing(false);
  }
};

const fmtMoney = (v: number | null) => {
  if (v === null || !Number.isFinite(v)) return "-";
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k$`;
  return `${v.toFixed(2)}$`;
};

// ...inside ContractsEditor component, BEFORE the useEffect that uses it:
const btnBaseCls =
  "rounded-md border border-white/10 bg-[#2b2b2b] text-[#e2e2e2] hover:bg-[#333333] active:bg-[#2a2a2a]";

useEffect(() => {
  setRightContent(
    <div className="flex items-center gap-3">
      <button
        className={"px-3 py-2 text-sm " + btnBaseCls}
        onClick={() => refresh()}
        disabled={isRefreshing}
        style={{
          opacity: isRefreshing ? 0.6 : 1,
          cursor: isRefreshing ? "not-allowed" : "pointer",
        }}
      >
        {isRefreshing ? "Refreshing…" : "Refresh"}
      </button>

     <div className="flex flex-col text-xs opacity-70 leading-tight">
  {lastRefreshedAt ? <div>Last: {lastRefreshedAt}</div> : <div>Last: —</div>}
  <div>{companyDir.length} companies</div>
    </div>


    </div>
  );


  return () => setRightContent(null);
}, [setRightContent, isRefreshing, lastRefreshedAt, companyDir.length]);

useEffect(() => {
  setMounted(true);
}, []);

useEffect(() => {
  setContracts(loadContracts());
 // Load shared directory shipped with the app + merge with local cached directory
(async () => {
  try {
    const shipped = await fetch(`${BASE_PATH}/images/company-directory.json`).then((r) => r.json());
    const shippedNames: string[] = (shipped?.companies || []).map((c: any) => String(c?.name || "").trim());

    const localNames = loadCompanyDirectory().companies.map((c) => c.name);

    setCompanyDir(
      Array.from(new Set([...localNames, ...shippedNames].filter(Boolean))).sort((a, b) =>
        a.localeCompare(b)
      )
    );
  } catch (e) {
    // If the shipped file isn't available for some reason, fall back to local
    setCompanyDir(loadCompanyDirectory().companies.map((c) => c.name));
  }
})();



  const k = (localStorage.getItem(LS_API_KEY) || "").trim();
  if (!k) return;

 setApiKey(k);
refresh(k);

}, []);


useEffect(() => {
  if (!lastStockMap) return;
  const stockMap = lastStockMap;

  setContractStatus(computeContractStatus(contracts, stockMap));
  const baseTransport = computeTransportNeeded(contracts, stockMap);
setTransportNeeded(baseTransport);


let prod: { product: string; unitsPerDay: number; produceAt: string }[] = [];

if (recipeMap) {
  const fullProd = computeProductionNeeded(contracts, stockMap, makeRows, recipeMap);
  setProductionNeeded(fullProd);

  // computeBuyNeeded only needs {product, unitsPerDay, produceAt}
  prod = fullProd.map((p) => ({
    product: p.product,
    unitsPerDay: p.unitsPerDay,
    produceAt: p.produceAt,
  }));

  setBuyNeeded(computeBuyNeeded(contracts, stockMap, makeRows, recipeMap, prod));
  const ing = computeIngredientTransportNeeded(
  stockMap,
  contracts,
  makeRows,
  recipeMap,
  prod
);

const ingAsTransport = ing.map((r) => ({
  material: r.ingredient,
  units: r.units,
  from: r.from,
  to: r.to,
  notes: r.notes,
}));

setTransportNeeded([...baseTransport, ...ingAsTransport]);

} else {
  setProductionNeeded([]);
  setBuyNeeded([]);
  setTransportNeeded(baseTransport);
}


}, [contracts, lastStockMap, makeRows, recipeMap]);

const totalValueInfo = (() => {
  let sum = 0;
  let unknown = false;
  for (const r of contractStatus) {
    const v = getRowValue(r);
    if (v === null) unknown = true;
    else sum += v;
  }
  return { sum, unknown };
})();

const totalValueText = `${fmtMoney(totalValueInfo.sum)}${totalValueInfo.unknown ? " + ?" : ""}`;

const sortedTransportNeeded = React.useMemo(() => {
  const rows = [...transportNeeded];
  const dir = transportSortDir;

  const cmpStr = (a: string, b: string) => normSort(a).localeCompare(normSort(b));
  const cmpNum = (a: number, b: number) => (a === b ? 0 : a < b ? -1 : 1);
  const cmpNullable = (a: number | null, b: number | null) => {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    const base = cmpNum(a, b);
    return dir === "asc" ? base : -base;
  };

  rows.sort((a, b) => {
    let cmp = 0;

    if (transportSortKey === "material") cmp = cmpStr(a.material, b.material);
    else if (transportSortKey === "units") cmp = cmpNum(Number(a.units || 0), Number(b.units || 0));
    else if (transportSortKey === "weight")
      return cmpNullable(calcWeightT(a.material, a.units), calcWeightT(b.material, b.units));
    else cmp = cmpStr(`${a.from} → ${a.to}`, `${b.from} → ${b.to}`);

    if (cmp !== 0) return dir === "asc" ? cmp : -cmp;

    // Tie-breakers for stable sorting
    return (
      cmpStr(a.material, b.material) ||
      cmpStr(`${a.from} → ${a.to}`, `${b.from} → ${b.to}`) ||
      String(a.units).localeCompare(String(b.units))
    );
  });

  return rows;
}, [transportNeeded, transportSortKey, transportSortDir, weightByName]);

const sortedProductionNeeded = React.useMemo(() => {
  const rows = [...productionNeeded];
  const dir = productionSortDir;

  const cmpStr = (a: string, b: string) => normSort(a).localeCompare(normSort(b));
  const cmpNum = (a: number, b: number) => (a === b ? 0 : a < b ? -1 : 1);

  rows.sort((a, b) => {
    let cmp = 0;

    if (productionSortKey === "material") cmp = cmpStr(a.product, b.product);
    else if (productionSortKey === "units") cmp = cmpNum(Number(a.unitsPerDay || 0), Number(b.unitsPerDay || 0));
    else if (productionSortKey === "location") cmp = cmpStr(a.produceAt, b.produceAt);
    else cmp = cmpStr(a.inputsStatus, b.inputsStatus);

    if (cmp !== 0) return dir === "asc" ? cmp : -cmp;

    return (
      cmpStr(a.product, b.product) ||
      cmpStr(a.produceAt, b.produceAt) ||
      String(a.unitsPerDay).localeCompare(String(b.unitsPerDay))
    );
  });

  return rows;
}, [productionNeeded, productionSortKey, productionSortDir]);

const sortedBuyNeeded = React.useMemo(() => {
  const rows = [...buyNeeded];
  const dir = buySortDir;

  const cmpStr = (a: string, b: string) => normSort(a).localeCompare(normSort(b));
  const cmpNum = (a: number, b: number) => (a === b ? 0 : a < b ? -1 : 1);
  const cmpNullable = (a: number | null, b: number | null) => {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    const base = cmpNum(a, b);
    return dir === "asc" ? base : -base;
  };

  const getCur = (mat: string) => priceMap.get(mat)?.current ?? null;
  const getAvg = (mat: string) => priceMap.get(mat)?.avg ?? null;

  rows.sort((a, b) => {
    let cmp = 0;

    if (buySortKey === "material") cmp = cmpStr(a.material, b.material);
    else if (buySortKey === "units") cmp = cmpNum(Number(a.unitsPerDay || 0), Number(b.unitsPerDay || 0));
    else if (buySortKey === "location") cmp = 0; // fixed to Exchange Station for now
    else if (buySortKey === "current") return cmpNullable(getCur(a.material), getCur(b.material));
    else if (buySortKey === "average") return cmpNullable(getAvg(a.material), getAvg(b.material));
    else {
      const ta = (() => {
        const cur = getCur(a.material);
        return cur === null ? null : cur * Number(a.unitsPerDay || 0);
      })();
      const tb = (() => {
        const cur = getCur(b.material);
        return cur === null ? null : cur * Number(b.unitsPerDay || 0);
      })();
      return cmpNullable(ta, tb);
    }

    if (cmp !== 0) return dir === "asc" ? cmp : -cmp;

    return (
      cmpStr(a.material, b.material) ||
      String(a.unitsPerDay).localeCompare(String(b.unitsPerDay))
    );
  });

  return rows;
}, [buyNeeded, buySortKey, buySortDir, priceMap]);


  // IMPORTANT: keep all hooks above any conditional returns.
  if (!mounted) return null;

  // Table styling (matched to GT UI)
  const panelCls =
    "rounded-lg border border-[#3a3a3a] bg-[#2b2b2b] p-4 text-[#e2e2e2] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";
  const tableShellCls =
    "overflow-x-auto rounded-md border border-[#3a3a3a] bg-[#242424]";
  const tableCls = "w-full text-sm text-[#e2e2e2]";
  const theadRowCls = "border-b border-[#3a3a3a] bg-[#2a2a2a]";
  const thLeftCls =
    "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[#b7b7b7]";
  const thRightCls =
    "px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-[#b7b7b7]";
  const tdLeftCls = "px-3 py-2 text-left";
  const tdRightCls = "px-3 py-2 text-right";
  const rowCls = "border-b border-[#333333] hover:bg-[#2d2d2d]";
  const inputBaseCls =
    "rounded-md border border-[#3a3a3a] bg-[#1f1f1f] px-2 py-1 text-[#e2e2e2] placeholder:text-[#777] focus:outline-none focus:ring-1 focus:ring-[#375b7f]";

return (

  <div className="space-y-6">

      {stocksErr && (
  <div className="mt-3 flex items-center gap-3 text-sm text-red-600">
    <span>{stocksErr}</span>
    {stocksErr.includes("API key") ? (
      <Link href="/settings" className="rounded border px-2 py-1 text-xs text-red-600">
  Go to Settings
</Link>
    ) : null}
  </div>
)}



<div className={panelCls}>
  <div className="mb-3 flex items-center justify-between">
    <div className="font-semibold">Contracts</div>

    <button
      className={"px-3 py-2 text-sm " + btnBaseCls}
      onClick={() => {
        if (draftContract) return;
        setDraftContract({ id: newId(), product: "", destination: "", client: "", unitsPerDay: 0 });
      }}
    >
      + Create contract
    </button>
  </div>

  <div className={tableShellCls}>
    <table className={tableCls}>
      <thead>
        <tr className={theadRowCls}>
          <th className={thLeftCls}>
            <button
              className="inline-flex items-center gap-1 hover:opacity-80"
              onClick={() => handleSort("client")}
            >
              Client
              <img
                src={SORT_ICON}
                alt=""
                className={`h-2.5 w-2.5 translate-y-[1.5px] ${sortKey === "client" ? "opacity-70" : "opacity-40"} ${sortKey === "client" && sortDir === "asc" ? "rotate-180" : ""}`}
              />
            </button>
          </th>

          <th className={thLeftCls}>
            <button
              className="inline-flex items-center gap-1 hover:opacity-80"
              onClick={() => handleSort("destination")}
            >
              Destination
              <img
                src={SORT_ICON}
                alt=""
                className={`h-2.5 w-2.5 translate-y-[1.5px] ${sortKey === "destination" ? "opacity-70" : "opacity-40"} ${sortKey === "destination" && sortDir === "asc" ? "rotate-180" : ""}`}
              />
            </button>
          </th>

          <th className={thLeftCls}>
            <button
              className="inline-flex items-center gap-1 hover:opacity-80"
              onClick={() => handleSort("material")}
            >
              Material
              <img
                src={SORT_ICON}
                alt=""
                className={`h-2.5 w-2.5 translate-y-[1.5px] ${sortKey === "material" ? "opacity-70" : "opacity-40"} ${sortKey === "material" && sortDir === "asc" ? "rotate-180" : ""}`}
              />
            </button>
          </th>

          <th className={thRightCls}>
            <button
              className="inline-flex w-full items-center justify-end gap-1 hover:opacity-80"
              onClick={() => handleSort("status")}
            >
              Status
              <img
                src={SORT_ICON}
                alt=""
                className={`h-2.5 w-2.5 translate-y-[1.5px] ${sortKey === "status" ? "opacity-70" : "opacity-40"} ${sortKey === "status" && sortDir === "asc" ? "rotate-180" : ""}`}
              />
            </button>
          </th>

          <th className={thRightCls}>
            <button
              className="inline-flex w-full items-center justify-end gap-1 hover:opacity-80"
              onClick={() => handleSort("missing")}
            >
              Missing
              <img
                src={SORT_ICON}
                alt=""
                className={`h-2.5 w-2.5 translate-y-[1.5px] ${sortKey === "missing" ? "opacity-70" : "opacity-40"} ${sortKey === "missing" && sortDir === "asc" ? "rotate-180" : ""}`}
              />
            </button>
          </th>

          <th className={thRightCls}>
            <button
              className="inline-flex w-full items-center justify-end gap-1 hover:opacity-80"
              onClick={() => handleSort("value")}
            >
              Value
              <img
                src={SORT_ICON}
                alt=""
                className={`h-2.5 w-2.5 translate-y-[1.5px] ${sortKey === "value" ? "opacity-70" : "opacity-40"} ${sortKey === "value" && sortDir === "asc" ? "rotate-180" : ""}`}
              />
            </button>
          </th>

          <th className={thRightCls}>Edit</th>
        </tr>
      </thead>

      <tbody>
        {draftContract && (
          <tr className={rowCls + " bg-[#232323]"}>
            <td className={tdLeftCls}>
              <input
                list="clients"
                value={draftContract.client}
                placeholder="Client"
                className={"w-full min-w-0 " + inputBaseCls}
                onChange={(e) => setDraftContract({ ...draftContract, client: e.target.value })}
              />
            </td>

            <td className={tdLeftCls}>
              <input
                list="locations"
                value={draftContract.destination}
                placeholder="Destination"
                className={"w-full min-w-0 " + inputBaseCls}
                onChange={(e) =>
                  setDraftContract({ ...draftContract, destination: e.target.value })
                }
              />
            </td>

            <td className={tdLeftCls}>
              <input
                list="materials"
                value={draftContract.product}
                placeholder="Material"
                className={"w-full min-w-0 " + inputBaseCls}
                onChange={(e) =>
                  setDraftContract({ ...draftContract, product: e.target.value })
                }
              />
            </td>

            <td className={tdRightCls}>
              <div className="flex items-center justify-end gap-2">
                <input
                  type="number"
                  value={Number(draftContract.unitsPerDay || 0)}
                  className={"w-28 text-right " + inputBaseCls}
                  onChange={(e) =>
                    setDraftContract({
                      ...draftContract,
                      unitsPerDay: Number(e.target.value || 0),
                    })
                  }
                />
                <span className="hidden sm:inline text-xs opacity-70">Units/day</span>
              </div>
            </td>

            <td className={tdRightCls}>—</td>
            <td className={tdRightCls}>—</td>

            <td className={tdRightCls}>
              <div className="flex justify-end gap-2">
                <button
                  className={"px-2 py-1 text-sm " + btnBaseCls}
                  onClick={() => setDraftContract(null)}
                  title="Cancel"
                >
                  ✕
                </button>

                <button
                  className={"px-2 py-1 text-sm " + btnBaseCls}
                  onClick={() => {
                    const product = (draftContract.product || "").trim();
                    const destination = (draftContract.destination || "").trim();
                    const unitsPerDay = Math.ceil(Number(draftContract.unitsPerDay || 0));

                    if (!product || !destination || unitsPerDay <= 0) return;

                    const client = (draftContract.client || "").trim();

                    const next = [
                      ...contracts,
                      { id: newId(), product, destination, client, unitsPerDay },
                    ];

                    setContracts(next);
                    saveContracts(next);
                    setDraftContract(null);
                  }}
                  title="Confirm"
                >
                  ✓
                </button>
              </div>
            </td>
          </tr>
        )}

        {contractStatus.length === 0 && !draftContract ? (
          <tr>
            <td className="px-3 py-4 text-sm opacity-70" colSpan={7}>
              No contracts yet.
            </td>
          </tr>
        ) : (
          [...contractStatus]
            .sort((a, b) => {
              const cmpStr = (x: string, y: string) => normSort(x).localeCompare(normSort(y));
              const cmpNum = (x: number, y: number) => (x === y ? 0 : x < y ? -1 : 1);

              // For Value: keep nulls at the bottom in BOTH directions.
              const cmpNullableValue = (x: number | null, y: number | null) => {
                if (x === null && y === null) return 0;
                if (x === null) return 1;
                if (y === null) return -1;
                const base = cmpNum(x, y);
                return sortDir === "asc" ? base : -base;
              };

              let cmp = 0;

              if (sortKey === "client") cmp = cmpStr(a.client, b.client);
              else if (sortKey === "destination") cmp = cmpStr(a.destination, b.destination);
              else if (sortKey === "material") cmp = cmpStr(a.product, b.product);
              else if (sortKey === "status") cmp = cmpNum(getRowRatio(a), getRowRatio(b));
              else if (sortKey === "missing") cmp = cmpNum(Number(a.missing || 0), Number(b.missing || 0));
              else cmp = cmpNullableValue(getRowValue(a), getRowValue(b));

              if (cmp !== 0) {
                if (sortKey === "value") return cmp;
                return sortDir === "asc" ? cmp : -cmp;
              }

              // Tie-breakers for stable sorting
              return (
                cmpStr(a.client, b.client) ||
                cmpStr(a.destination, b.destination) ||
                cmpStr(a.product, b.product) ||
                String(a.id).localeCompare(String(b.id))
              );
            })
            .map((r) => {
              const c = contracts.find((x) => x.id === r.id);
              const rowId = r.id;
              const isEditing = editingId === rowId;

              return (
                <tr key={rowId} className={rowCls}>
                  <td className={tdLeftCls}>
                    {isEditing && c ? (
                      <input
                        list="clients"
                        className={"w-full min-w-0 " + inputBaseCls}
                        value={editDraft?.client || ""}
                        onChange={(e) =>
                          setEditDraft((d) => (d ? { ...d, client: e.target.value } : d))
                        }
                      />
                    ) : (
                      c?.client || ""
                    )}
                  </td>

                  <td className={tdLeftCls}>
                    {isEditing && c ? (
                      <input
                        list="locations"
                        className={"w-full min-w-0 " + inputBaseCls}
                        value={editDraft?.destination || ""}
                        onChange={(e) =>
                          setEditDraft((d) => (d ? { ...d, destination: e.target.value } : d))
                        }
                      />
                    ) : (
                      r.destination
                    )}
                  </td>

                  <td className={tdLeftCls}>
                    {isEditing && c ? (
                      <input
                        list="materials"
                        className={"w-full min-w-0 " + inputBaseCls}
                        value={editDraft?.product || ""}
                        onChange={(e) =>
                          setEditDraft((d) => (d ? { ...d, product: e.target.value } : d))
                        }
                      />
                    ) : (
                      <MaterialLabel name={r.product} />
                    )}
                  </td>

                  <td className={tdRightCls}>
                    {isEditing && c ? (
                      <div className="flex items-center justify-end gap-2">
                        <input
                          type="number"
                          className={"w-28 text-right " + inputBaseCls}
                          value={Number(editDraft?.unitsPerDay || 0)}
                          onChange={(e) =>
                            setEditDraft((d) =>
                              d ? { ...d, unitsPerDay: Number(e.target.value || 0) } : d
                            )
                          }
                        />
                        <span className="hidden sm:inline text-xs opacity-70">Units/day</span>
                      </div>
                    ) : (
                      (() => {
                        const available = r.availAtDestination;
                        const needed = r.unitsPerDay;
                        const ratio = needed > 0 ? available / needed : 1;

                        const cls =
                          ratio < 0.3
                            ? "text-[#e74d3d]"
                            : ratio < 1
                            ? "text-[#d06c1a]"
                            : "text-[#00bc8c]";

                        return (
                          <span>
                            <span className={cls}>{available}</span>
                            <span className="text-[#e2e2e2]">/</span>
                            <span className="text-[#e2e2e2]">{needed}</span>
                          </span>
                        );
                      })()
                    )}
                  </td>

                  <td className={tdRightCls}>{r.missing}</td>

                  <td className={tdRightCls}>
                    {fmtMoney(
                      (() => {
                        const v = getRowValue(r);
                        return v === null ? null : v;
                      })()
                    )}
                  </td>

                  <td className={tdRightCls}>
                    {isEditing && c ? (
                      <div className="flex justify-end gap-2">
                        <button
                          className={"px-2 py-1 text-sm " + btnBaseCls}
                          onClick={() => {
                            if (!c) return;
                            const next = contracts.filter((x) => x.id !== c.id);
                            setContracts(next);
                            saveContracts(next);
                            setEditingId(null);
                            setEditDraft(null);
                          }}
                          title="Cancel"
                        >
                          ✕
                        </button>

                        <button
                          className={"px-2 py-1 text-sm " + btnBaseCls}
                          onClick={() => {
                            if (!editDraft) return;

                            const product = (editDraft.product || "").trim();
                            const destination = (editDraft.destination || "").trim();
                            const unitsPerDay = Math.ceil(Number(editDraft.unitsPerDay || 0));

                            if (!product || !destination || unitsPerDay <= 0) return;

                            const client = (editDraft.client || "").trim();

                            const next = contracts.map((x) =>
                              x.id === editDraft.id ? { ...x, product, destination, client, unitsPerDay } : x
                            );

                            setContracts(next);
                            saveContracts(next);

                            setEditingId(null);
                            setEditDraft(null);
                          }}
                          title="Confirm"
                        >
                          ✓
                        </button>
                      </div>
                    ) : (
                      <button
                        className={"px-2 py-1 text-xs " + btnBaseCls}
                        onClick={() => {
                          if (!c) return;
                          setEditingId(c.id);
                          setEditDraft({ ...c });
                        }}
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              );
            })
        )}
      </tbody>

      <tfoot>
        <tr className="border-t border-[#3a3a3a] bg-[#1f1f1f]">
          <td className="px-3 py-2 font-semibold" colSpan={5}>
            Total
          </td>
          <td className="px-3 py-2 text-right font-semibold">{totalValueText}</td>
          <td className="px-3 py-2"></td>
        </tr>
      </tfoot>
    </table>
  </div>
</div>

<div className={"mt-6 " + panelCls}>
  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
    <div className="font-semibold">Actions</div>

    <div className="flex flex-wrap gap-2">
      <button
        className={"px-3 py-1 text-sm " + btnBaseCls}
        onClick={() => setShowTransport((v) => !v)}
      >
        {showTransport ? "Hide" : "Show"} Transport
      </button>

      <button
        className={"px-3 py-1 text-sm " + btnBaseCls}
        onClick={() => setShowProduction((v) => !v)}
      >
        {showProduction ? "Hide" : "Show"} Production
      </button>

      <button
        className={"px-3 py-1 text-sm " + btnBaseCls}
        onClick={() => setShowBuy((v) => !v)}
      >
        {showBuy ? "Hide" : "Show"} Buy
      </button>
    </div>
  </div>

{showTransport && (
  <div className="py-4">
<div className={"mt-6 " + panelCls}>
  <div className="font-semibold mb-2">Transport needed</div>

  {transportNeeded.length === 0 ? (
    <div className="text-sm opacity-70">
      No transport needed (based on current contracts + stocks).
    </div>
  ) : (
    <>
      <div className={tableShellCls}>
        <table className={tableCls}>
          <colgroup>
  <col style={{ width: "11%" }} />
  <col style={{ width: "9%" }} />
  <col style={{ width: "10%" }} />
  <col style={{ width: "15%" }} />
  <col style={{ width: "11%" }} />
  <col style={{ width: "11%" }} />
  <col style={{ width: "11%" }} />
  <col style={{ width: "22%" }} />
</colgroup>


<thead>
  <tr className={theadRowCls}>
    <th className={thLeftCls}>
      <button
        className="inline-flex items-center gap-1 hover:opacity-80"
        onClick={() => handleTransportSort("material")}
      >
        Material
        <img
          src={SORT_ICON}
          alt=""
          className={`h-2.5 w-2.5 translate-y-[1.5px] ${transportSortKey === "material" ? "opacity-70" : "opacity-40"} ${transportSortKey === "material" && transportSortDir === "asc" ? "rotate-180" : ""}`}
        />
      </button>
    </th>

    <th className={thLeftCls}>
      <button
        className="inline-flex items-center gap-1 hover:opacity-80"
        onClick={() => handleTransportSort("units")}
      >
        Units
        <img
          src={SORT_ICON}
          alt=""
          className={`h-2.5 w-2.5 translate-y-[1.5px] ${transportSortKey === "units" ? "opacity-70" : "opacity-40"} ${transportSortKey === "units" && transportSortDir === "asc" ? "rotate-180" : ""}`}
        />
      </button>
    </th>

    <th className={thLeftCls}>
      <button
        className="inline-flex items-center gap-1 hover:opacity-80"
        onClick={() => handleTransportSort("weight")}
      >
        Weight
        <img
          src={SORT_ICON}
          alt=""
          className={`h-2.5 w-2.5 translate-y-[1.5px] ${transportSortKey === "weight" ? "opacity-70" : "opacity-40"} ${transportSortKey === "weight" && transportSortDir === "asc" ? "rotate-180" : ""}`}
        />
      </button>
    </th>

    <th className={thLeftCls}>
      <button
        className="inline-flex items-center gap-1 hover:opacity-80"
        onClick={() => handleTransportSort("location")}
      >
        Location
        <img
          src={SORT_ICON}
          alt=""
          className={`h-2.5 w-2.5 translate-y-[1.5px] ${transportSortKey === "location" ? "opacity-70" : "opacity-40"} ${transportSortKey === "location" && transportSortDir === "asc" ? "rotate-180" : ""}`}
        />
      </button>
    </th>

    <th className={thLeftCls}></th>
    <th className={thLeftCls}></th>
    <th className={thLeftCls}></th>

    <th className={thLeftCls}>Notes</th>
  </tr>
</thead>

<tbody>
  {sortedTransportNeeded.slice(0, 30).map((r, idx) => (
    <tr key={`${r.material}|${r.from}|${r.to}|${idx}`} className={rowCls}>
      <td className={tdLeftCls}><MaterialLabel name={r.material} /></td>
      <td className={tdLeftCls}>{r.units}</td>
     <td className={tdLeftCls}>{fmtWeightT(r.material, r.units)}</td>



      
      <td className={tdLeftCls}>{r.from} → {r.to}</td>

      <td className="px-3 py-2"></td>
      <td className="px-3 py-2"></td>
      <td className="px-3 py-2"></td>

      <td className={tdLeftCls}>{r.notes}</td>
    </tr>
  ))}
</tbody>

        </table>
      </div>

    
    </>
  )}
</div>

  </div>
)}

{showProduction && (
 <div className="py-4">

<div className={"mt-6 " + panelCls}>
  <div className="font-semibold mb-2">Production needed</div>

  {productionNeeded.length === 0 ? (
    <div className="text-sm opacity-70">
      No production needed (or recipes not loaded / Make table incomplete).
    </div>
  ) : (
    <>
      <div className={tableShellCls}>
        <table className={tableCls}>

              <colgroup>
      <col style={{ width: "11%" }} />
      <col style={{ width: "11%" }} />
      <col style={{ width: "11%" }} />
      <col style={{ width: "11%" }} />
      <col style={{ width: "11%" }} />
      <col style={{ width: "11%" }} />
      <col style={{ width: "34%" }} />
       </colgroup>

                  <thead>
          <tr className={theadRowCls}>
            <th className={thLeftCls}>
              <button
                className="inline-flex items-center gap-1 hover:opacity-80"
                onClick={() => handleProductionSort("material")}
              >
                Material
                <img
                  src={SORT_ICON}
                  alt=""
                  className={`h-2.5 w-2.5 translate-y-[1.5px] ${productionSortKey === "material" ? "opacity-70" : "opacity-40"} ${productionSortKey === "material" && productionSortDir === "asc" ? "rotate-180" : ""}`}
                />
              </button>
            </th>

            <th className={thLeftCls}>
              <button
                className="inline-flex items-center gap-1 hover:opacity-80"
                onClick={() => handleProductionSort("units")}
              >
                Units
                <img
                  src={SORT_ICON}
                  alt=""
                  className={`h-2.5 w-2.5 translate-y-[1.5px] ${productionSortKey === "units" ? "opacity-70" : "opacity-40"} ${productionSortKey === "units" && productionSortDir === "asc" ? "rotate-180" : ""}`}
                />
              </button>
            </th>

            <th className={thLeftCls}>
              <button
                className="inline-flex items-center gap-1 hover:opacity-80"
                onClick={() => handleProductionSort("location")}
              >
                Location
                <img
                  src={SORT_ICON}
                  alt=""
                  className={`h-2.5 w-2.5 translate-y-[1.5px] ${productionSortKey === "location" ? "opacity-70" : "opacity-40"} ${productionSortKey === "location" && productionSortDir === "asc" ? "rotate-180" : ""}`}
                />
              </button>
            </th>

            <th className={thLeftCls}>
              <button
                className="inline-flex items-center gap-1 hover:opacity-80"
                onClick={() => handleProductionSort("inputsStatus")}
              >
                Inputs status
                <img
                  src={SORT_ICON}
                  alt=""
                  className={`h-2.5 w-2.5 translate-y-[1.5px] ${productionSortKey === "inputsStatus" ? "opacity-70" : "opacity-40"} ${productionSortKey === "inputsStatus" && productionSortDir === "asc" ? "rotate-180" : ""}`}
                />
              </button>
            </th>

            <th className={thLeftCls}></th>
            <th className={thLeftCls}></th>

            <th className={thLeftCls}>Notes</th>
          </tr>
        </thead>

          <tbody>
            {sortedProductionNeeded.slice(0, 30).map((r, idx) => (
              <tr key={`${r.product}|${idx}`} className={rowCls}>
                  <td className={tdLeftCls}>
                  <MaterialLabel name={r.product} />
                    </td>

                  <td className={tdLeftCls}>{r.unitsPerDay}</td>
                  <td className={tdLeftCls}>{r.produceAt}</td>

                  <td className={tdLeftCls}>{r.inputsStatus}</td>
                  <td className={tdLeftCls}></td>
                  <td className={tdLeftCls}></td>

                  <td className={tdLeftCls}>{r.notes}</td>


              </tr>
            ))}
          </tbody>
        </table>
      </div>

     
    </>
  )}
</div>

  </div>
)}

{showBuy && (
<div className="py-4">
<div className={"mt-6 " + panelCls}>
  <div className="font-semibold mb-2">
  Buy needed
  {priceMap.size === 0 ? (
    <span className="hidden sm:inline text-xs opacity-70">(prices unavailable — rate limited)</span>
  ) : null}
</div>


  {buyNeeded.length === 0 ? (
    <div className="text-sm opacity-70">No buys needed.</div>
  ) : (
    <>
      <div className={tableShellCls}>
        <table className={tableCls}>

          <colgroup>
  <col style={{ width: "11%" }} />
  <col style={{ width: "11%" }} />
  <col style={{ width: "11%" }} />
  <col style={{ width: "11%" }} />
  <col style={{ width: "11%" }} />
  <col style={{ width: "11%" }} />
  <col style={{ width: "34%" }} />
</colgroup>

          <thead>
  <tr className={theadRowCls}>
    <th className={thLeftCls}>
      <button
        className="inline-flex items-center gap-1 hover:opacity-80"
        onClick={() => handleBuySort("material")}
      >
        Material
        <img
          src={SORT_ICON}
          alt=""
          className={`h-2.5 w-2.5 translate-y-[1.5px] ${buySortKey === "material" ? "opacity-70" : "opacity-40"} ${buySortKey === "material" && buySortDir === "asc" ? "rotate-180" : ""}`}
        />
      </button>
    </th>

    <th className={thLeftCls}>
      <button
        className="inline-flex items-center gap-1 hover:opacity-80"
        onClick={() => handleBuySort("units")}
      >
        Units
        <img
          src={SORT_ICON}
          alt=""
          className={`h-2.5 w-2.5 translate-y-[1.5px] ${buySortKey === "units" ? "opacity-70" : "opacity-40"} ${buySortKey === "units" && buySortDir === "asc" ? "rotate-180" : ""}`}
        />
      </button>
    </th>

    <th className={thLeftCls}>
      <button
        className="inline-flex items-center gap-1 hover:opacity-80"
        onClick={() => handleBuySort("location")}
      >
        Location
        <img
          src={SORT_ICON}
          alt=""
          className={`h-2.5 w-2.5 translate-y-[1.5px] ${buySortKey === "location" ? "opacity-70" : "opacity-40"} ${buySortKey === "location" && buySortDir === "asc" ? "rotate-180" : ""}`}
        />
      </button>
    </th>

    <th className={thLeftCls}>
      <button
        className="inline-flex items-center gap-1 hover:opacity-80"
        onClick={() => handleBuySort("current")}
      >
        Current
        <img
          src={SORT_ICON}
          alt=""
          className={`h-2.5 w-2.5 translate-y-[1.5px] ${buySortKey === "current" ? "opacity-70" : "opacity-40"} ${buySortKey === "current" && buySortDir === "asc" ? "rotate-180" : ""}`}
        />
      </button>
    </th>

    <th className={thLeftCls}>
      <button
        className="inline-flex items-center gap-1 hover:opacity-80"
        onClick={() => handleBuySort("average")}
      >
        Average
        <img
          src={SORT_ICON}
          alt=""
          className={`h-2.5 w-2.5 translate-y-[1.5px] ${buySortKey === "average" ? "opacity-70" : "opacity-40"} ${buySortKey === "average" && buySortDir === "asc" ? "rotate-180" : ""}`}
        />
      </button>
    </th>

    <th className={thLeftCls}>
      <button
        className="inline-flex items-center gap-1 hover:opacity-80"
        onClick={() => handleBuySort("total")}
      >
        Total
        <img
          src={SORT_ICON}
          alt=""
          className={`h-2.5 w-2.5 translate-y-[1.5px] ${buySortKey === "total" ? "opacity-70" : "opacity-40"} ${buySortKey === "total" && buySortDir === "asc" ? "rotate-180" : ""}`}
        />
      </button>
    </th>

    <th className={thLeftCls}>Notes</th>
  </tr>
</thead>


          <tbody>
  {sortedBuyNeeded.slice(0, 40).map((r, idx) => {
    const px = priceMap.get(r.material);
    const cur = px?.current ?? null;
    const avg = px?.avg ?? null;
    const total = cur !== null ? cur * r.unitsPerDay : null;

    return (
      <tr key={`${r.material}|${idx}`} className={rowCls}>
        <td className={tdLeftCls}>
          <MaterialLabel name={r.material} />
        </td>

        <td className={tdLeftCls}>{r.unitsPerDay}</td>
        <td className={tdLeftCls}>Exchange Station</td>

        <td className={tdLeftCls}>{fmtMoney(cur)}</td>
        <td className={tdLeftCls}>{fmtMoney(avg)}</td>
        <td className={tdLeftCls}>{fmtMoney(total)}</td>


        <td className={tdLeftCls}>{r.notes}</td>

      </tr>
    );
  })}
</tbody>

        </table>
      </div>

     
    </>
  )}
</div>
  </div>
)}
</div>

<datalist id="materials">
  {materials.map((m) => (
    <option key={m} value={m} />
  ))}
</datalist>

<datalist id="locations">
  {locations.map((l) => (
    <option key={l} value={l} />
  ))}
</datalist>

<datalist id="clients">
  {Array.from(
    new Set([
      ...contracts.map((c) => (c.client || "").trim()),
      ...companyDir.map((n) => (n || "").trim()),
    ].filter(Boolean))
  )
    .sort((a, b) => a.localeCompare(b))
    .map((name) => (
      <option key={name} value={name} />
    ))}
</datalist>



    </div>
  );
}
