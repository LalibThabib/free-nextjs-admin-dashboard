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

    const locs: string[] = [...bases];
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
      const lines = await fetchRecipeLines();
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

useEffect(() => {
  if (typeof window === "undefined") return;

  // load cached weights first (if any)
  try {
    const raw = localStorage.getItem(LS_MAT_WEIGHTS);
    if (raw) setWeightByName(new Map(JSON.parse(raw)));
  } catch {
    // ignore
  }

  if (!apiKey?.trim()) return;

  // refresh weights from API (best-effort)
  fetch("https://api.g2.galactictycoons.com/public/exchange/mat-details", {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
    .then((r) => r.json())
    .then((data) => {
      const m = new Map<string, number>();
      for (const mat of data?.materials || []) {
        const name = String(mat?.matName ?? mat?.name ?? "").trim();
        const rawW = mat?.weight ?? mat?.mass ?? mat?.w ?? mat?.unitWeight;
        const w = typeof rawW === "string" ? parseFloat(rawW) : Number(rawW);
        if (name && Number.isFinite(w)) m.set(name, w);
      }
      if (m.size) {
        setWeightByName(m);
        localStorage.setItem(LS_MAT_WEIGHTS, JSON.stringify(Array.from(m.entries())));
      }
    })
    .catch(() => {});
}, [apiKey]);

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


useEffect(() => {
  setRightContent(
    <div className="flex items-center gap-3">
      <button
        className="rounded border px-3 py-2 text-sm"
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

if (!mounted) return null;

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



<div className="rounded-xl border border-gray-200 bg-white/70 p-4 backdrop-blur dark:border-gray-800 dark:bg-gray-900/60">
  <div className="mb-3 flex items-center justify-between">
    <div className="font-semibold">Contracts</div>

    <button
      className="rounded border px-3 py-2 text-sm"
      onClick={() => {
        if (draftContract) return;
        setDraftContract({ id: newId(), product: "", destination: "", client: "", unitsPerDay: 0 });
      }}
    >
      + Create contract
    </button>
  </div>

  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b">
          <th className="py-2 text-left">Product</th>
          <th className="py-2 text-left">Destination</th>
          <th className="py-2 text-left">Client</th>
          <th className="py-2 text-right">Status</th>
          <th className="py-2 text-right">Missing</th>
          <th className="py-2 text-right">Value</th>
          <th className="py-2 text-right">Actions</th>
        </tr>
      </thead>

      <tbody>
        {draftContract && (
          <tr className="border-b">
            <td className="py-2">
              <input
                list="materials"
                value={draftContract.product}
                placeholder="Product"
                className="w-56 rounded border px-2 py-1"
                onChange={(e) =>
                  setDraftContract({ ...draftContract, product: e.target.value })
                }
              />
            </td>

            <td className="py-2">
              <input
                list="locations"
                value={draftContract.destination}
                placeholder="Destination"
                className="w-56 rounded border px-2 py-1"
                onChange={(e) =>
                  setDraftContract({ ...draftContract, destination: e.target.value })
                }
              />
            </td>
            <td className="py-2">
            <input
                list="clients"
                value={draftContract.client}
                placeholder="Client"
                className="w-56 rounded border px-2 py-1"
                onChange={(e) => setDraftContract({ ...draftContract, client: e.target.value })}
              />

            </td>

            <td className="py-2 text-right">
              <div className="flex items-center justify-end gap-2">
                <input
                  type="number"
                  value={Number(draftContract.unitsPerDay || 0)}
                  className="w-28 rounded border px-2 py-1 text-right"
                  onChange={(e) =>
                    setDraftContract({
                      ...draftContract,
                      unitsPerDay: Number(e.target.value || 0),
                    })
                  }
                />
                <span className="text-xs opacity-70">Units/day</span>
              </div>
            </td>

            <td className="py-2 text-right">—</td>

            <td className="py-2 text-right">
              <div className="flex justify-end gap-2">
                <button
                  className="rounded border px-2 py-1 text-sm"
                  onClick={() => setDraftContract(null)}
                  title="Cancel"
                >
                  ✕
                </button>

                <button
                  className="rounded border px-2 py-1 text-sm"
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
            <td className="py-4 text-sm opacity-70" colSpan={7}>
              No contracts yet.
            </td>
          </tr>
        ) : (


  contractStatus.map((r) => {
 const c = contracts.find((x) => x.id === r.id);
const rowId = r.id;
const isEditing = editingId === rowId;


  return (
    <tr key={rowId} className="border-b">
      <td className="py-2">
        {isEditing && c ? (
          <input
  list="materials"
  className="w-56 rounded border px-2 py-1"
  value={editDraft?.product || ""}
  onChange={(e) =>
    setEditDraft((d) => (d ? { ...d, product: e.target.value } : d))
  }
/>

        ) : (
  <MaterialLabel name={r.product} />
        )}

      </td>
     <td className="py-2">
  {isEditing && c ? (
    <input
      list="locations"
      className="w-56 rounded border px-2 py-1"
      value={editDraft?.destination || ""}
      onChange={(e) =>
        setEditDraft((d) => (d ? { ...d, destination: e.target.value } : d))
      }
    />
  ) : (
    r.destination
  )}
</td>

<td className="py-2">
  {isEditing && c ? (
            <input
          list="clients"
          className="w-56 rounded border px-2 py-1"
          value={editDraft?.client || ""}
          onChange={(e) =>
            setEditDraft((d) => (d ? { ...d, client: e.target.value } : d))
          }
        />

  ) : (
    c?.client || ""
  )}
</td>


      <td className="py-2 text-right">
        {isEditing && c ? (
          <div className="flex items-center justify-end gap-2">
            <input
  type="number"
  className="w-28 rounded border px-2 py-1 text-right"
  value={Number(editDraft?.unitsPerDay || 0)}
  onChange={(e) =>
    setEditDraft((d) =>
      d ? { ...d, unitsPerDay: Number(e.target.value || 0) } : d
    )
  }
/>

            <span className="text-xs opacity-70">Units/day</span>
          </div>
        ) : (
          `${r.availAtDestination}/${r.unitsPerDay}`
        )}
      </td>

      <td className="py-2 text-right">{r.missing}</td>

<td className="py-2 text-right">
  {fmtMoney(
    (() => {
      const px = priceMap.get(r.product);
      const unit = px?.avg ?? px?.current ?? null;
      return unit === null ? null : r.unitsPerDay * unit;
    })()
  )}
</td>

      <td className="py-2 text-right">
        {isEditing && c ? (
          <div className="flex justify-end gap-2">
            <button
              className="rounded border px-2 py-1 text-sm"
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
              className="rounded border px-2 py-1 text-sm"
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
  className="rounded border px-2 py-1 text-xs"
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
    </table>
  </div>
</div>

<div className="mt-6 rounded-lg border p-4 bg-white">
  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
    <div className="font-semibold">Actions</div>

    <div className="flex flex-wrap gap-2">
      <button
        className="rounded border px-3 py-1 text-sm"
        onClick={() => setShowTransport((v) => !v)}
      >
        {showTransport ? "Hide" : "Show"} Transport
      </button>

      <button
        className="rounded border px-3 py-1 text-sm"
        onClick={() => setShowProduction((v) => !v)}
      >
        {showProduction ? "Hide" : "Show"} Production
      </button>

      <button
        className="rounded border px-3 py-1 text-sm"
        onClick={() => setShowBuy((v) => !v)}
      >
        {showBuy ? "Hide" : "Show"} Buy
      </button>
    </div>
  </div>

{showTransport && (
  <div className="py-4">
<div className="mt-6 rounded-lg border p-4">
  <div className="font-semibold mb-2">Transport needed</div>

  {transportNeeded.length === 0 ? (
    <div className="text-sm opacity-70">
      No transport needed (based on current contracts + stocks).
    </div>
  ) : (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
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
  <tr className="border-b">
    <th className="py-2 text-left">Material</th>
    <th className="py-2 text-left">Units</th>
    <th className="py-2 text-left">Weight</th>
    <th className="py-2 text-left">Location</th>

    <th className="py-2"></th>
    <th className="py-2"></th>
    <th className="py-2"></th>

    <th className="py-2 text-left">Notes</th>
  </tr>
</thead>

<tbody>
  {transportNeeded.slice(0, 30).map((r, idx) => (
    <tr key={`${r.material}|${r.from}|${r.to}|${idx}`} className="border-b">
      <td className="py-2 text-left"><MaterialLabel name={r.material} /></td>
      <td className="py-2 text-left">{r.units}</td>
      <td className="py-2 text-left">
  {(() => {
    const w = weightByName.get(r.material);
    return w == null ? "—" : `${(r.units * w).toFixed(2)} kg`;
  })()}
</td>


      
      <td className="py-2 text-left">{r.from} → {r.to}</td>

      <td className="py-2"></td>
      <td className="py-2"></td>
      <td className="py-2"></td>

      <td className="py-2 text-left">{r.notes}</td>
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

<div className="mt-6 rounded-lg border p-4">
  <div className="font-semibold mb-2">Production needed</div>

  {productionNeeded.length === 0 ? (
    <div className="text-sm opacity-70">
      No production needed (or recipes not loaded / Make table incomplete).
    </div>
  ) : (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">

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
          <tr className="border-b">
            <th className="py-2 text-left">Material</th>
            <th className="py-2 text-left">Units</th>
            <th className="py-2 text-left">Location</th>

            <th className="py-2 text-left">Inputs status</th>
            <th className="py-2"></th>
            <th className="py-2"></th>

            <th className="py-2 text-left">Notes</th>
          </tr>
        </thead>

          <tbody>
            {productionNeeded.slice(0, 30).map((r, idx) => (
              <tr key={`${r.product}|${idx}`} className="border-b">
                  <td className="py-2 text-left">
                  <MaterialLabel name={r.product} />
                    </td>

                  <td className="py-2 text-left">{r.unitsPerDay}</td>
                  <td className="py-2 text-left">{r.produceAt}</td>

                  <td className="py-2 text-left">{r.inputsStatus}</td>
                  <td className="py-2"></td>
                  <td className="py-2"></td>

                  <td className="py-2 text-left">{r.notes}</td>


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
<div className="mt-6 rounded-lg border p-4">
  <div className="font-semibold mb-2">
  Buy needed
  {priceMap.size === 0 ? (
    <span className="ml-2 text-xs opacity-70">(prices unavailable — rate limited)</span>
  ) : null}
</div>


  {buyNeeded.length === 0 ? (
    <div className="text-sm opacity-70">No buys needed.</div>
  ) : (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">

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
  <tr className="border-b">
    <th className="py-2 text-left">Material</th>
    <th className="py-2 text-left">Units</th>
    <th className="py-2 text-left">Location</th>

    <th className="py-2 text-left">Current</th>
    <th className="py-2 text-left">Average</th>
    <th className="py-2 text-left">Total</th>

    <th className="py-2 text-left">Notes</th>
  </tr>
</thead>


          <tbody>
  {buyNeeded.slice(0, 40).map((r, idx) => {
    const px = priceMap.get(r.material);
    const cur = px?.current ?? null;
    const avg = px?.avg ?? null;
    const total = cur !== null ? cur * r.unitsPerDay : null;

    return (
      <tr key={`${r.material}|${idx}`} className="border-b">
        <td className="py-2 text-left">
          <MaterialLabel name={r.material} />
        </td>

        <td className="py-2 text-left">{r.unitsPerDay}</td>
        <td className="py-2 text-left">Exchange Station</td>

        <td className="py-2 text-left">{fmtMoney(cur)}</td>
        <td className="py-2 text-left">{fmtMoney(avg)}</td>
        <td className="py-2 text-left">{fmtMoney(total)}</td>


        <td className="py-2 text-left">{r.notes}</td>

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
