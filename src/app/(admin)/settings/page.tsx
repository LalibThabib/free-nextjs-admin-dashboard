"use client";

import { useEffect, useState } from "react";
import { loadMake, saveMake } from "@/app/(admin)/gt-orders/lib/make";
import type { MakeRow } from "@/app/(admin)/gt-orders/lib/planner";
import { MaterialLabel } from "@/components/common/MaterialLabel";


const LS_API_KEY = "gt_api_key_v1";

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState("");
  const [makeRows, setMakeRows] = useState<MakeRow[]>([]);
const [materials, setMaterials] = useState<string[]>([]);
const [locations, setLocations] = useState<string[]>([]);
const [mounted, setMounted] = useState(false);
useEffect(() => {
  setMounted(true);
}, []);

useEffect(() => {
  if (!mounted) return;

  // API key
  const k = (localStorage.getItem(LS_API_KEY) || "").trim();
  if (k) setApiKey(k);

  // Make rows
  setMakeRows(loadMake());

  // Autocomplete lists
  const mats = JSON.parse(localStorage.getItem("gt_materials_v1") || "[]");
  const bases = JSON.parse(localStorage.getItem("gt_bases_v1") || "[]")
  setMaterials(Array.isArray(mats) ? mats : []);
  setLocations(Array.isArray(bases) ? bases : []);
}, [mounted]);


if (!mounted) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <div className="rounded-lg border p-4">
        <div className="font-semibold">API Key</div>
        <div className="mt-2 flex gap-2">
          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste your GT API key…"
            className="w-full rounded border px-3 py-2 font-mono text-sm"
          />
          <button
            className="rounded border px-3 py-2"
            onClick={() => {
              localStorage.setItem(LS_API_KEY, apiKey.trim());
              alert("Saved.");
            }}
          >
            Save
          </button>
        </div>
      </div>

      <div className="rounded-lg border p-4">
  <div className="font-semibold mb-2">Make table</div>

  <button
    className="mb-2 rounded border px-2 py-1 text-sm"
    onClick={() => {
      const next = [...makeRows, { material: "", base: "" }];
      setMakeRows(next);
      saveMake(next);
    }}
  >
    + Add make row
  </button>

  <div className="grid gap-2">
    {makeRows.map((r, idx) => (
      <div key={idx} className="flex gap-2 items-center">
         <MaterialLabel name={r.material} size={18} showText={false} />
        <input
          list="materials"
          value={r.material}
          placeholder="Material"
          className="rounded border px-2 py-1"
          onChange={(e) => {
            const next = makeRows.map((x, i) =>
              i === idx ? { ...x, material: e.target.value } : x
            );
            setMakeRows(next);
            saveMake(next);
          }}
        />
        <MaterialLabel name={r.base} size={18} showText={false} />
        <input
          list="locations"
          value={r.base}
          placeholder="Base"
          className="rounded border px-2 py-1"
          onChange={(e) => {
            const next = makeRows.map((x, i) =>
              i === idx ? { ...x, base: e.target.value } : x
            );
            setMakeRows(next);
            saveMake(next);
          }}
        />
    

        <button
          className="rounded border px-2 py-1 text-sm"
          onClick={() => {
            const next = makeRows.filter((_, i) => i !== idx);
            setMakeRows(next);
            saveMake(next);
          }}
        >
          ×
        </button>
      </div>
    ))}
  </div>
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

    </div>
    
  );
}
