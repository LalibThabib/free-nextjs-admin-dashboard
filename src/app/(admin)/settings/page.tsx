"use client";

import { useEffect, useMemo, useState } from "react";
import { loadMake, saveMake } from "@/app/(admin)/gt-orders/lib/make";
import type { MakeRow } from "@/app/(admin)/gt-orders/lib/planner";
import { MaterialLabel } from "@/components/common/MaterialLabel";

const LS_API_KEY = "gt_api_key_v1";

const BASE_PATH = process.env.NODE_ENV === "production" ? "/free-nextjs-admin-dashboard" : "";
const SORT_ICON = `${BASE_PATH}/images/icons/sorting-arrow.svg`;


type EditMode =
  | { kind: "none" }
  | { kind: "edit"; idx: number }
  | { kind: "new" };

const panelCls = "rounded-md border border-white/10 bg-[#303030] p-4";
const panelTitleCls = "text-sm font-semibold tracking-wide uppercase text-white/80";

const apiInputCls =
  "w-full rounded-sm border border-white/10 bg-[#1f1f1f] px-3 py-2 font-mono text-sm text-[#e2e2e2] placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/20";

const tableShellCls = "overflow-hidden rounded-md border border-white/10 bg-[#262626]";
const tableCls = "w-full text-sm";
const thCls = "px-3 py-2 text-left text-xs font-semibold tracking-wider uppercase text-white/60";
const tdCls = "px-3 py-2";
const rowCls = "border-t border-white/10 hover:bg-[#323232]";

const btnCls =
  "rounded-sm border border-white/10 bg-[#2b2b2b] px-3 py-2 text-sm text-[#e2e2e2] hover:bg-[#353535] active:bg-[#2a2a2a] disabled:opacity-50 disabled:hover:bg-[#2b2b2b]";
const btnSmCls =
  "rounded-sm border border-white/10 bg-[#2b2b2b] px-2 py-1 text-xs text-[#e2e2e2] hover:bg-[#353535] active:bg-[#2a2a2a] disabled:opacity-50 disabled:hover:bg-[#2b2b2b]";

const inputCellCls =
  "w-full rounded-sm border border-white/10 bg-[#1f1f1f] px-2 py-1 text-[#e2e2e2] placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/20";

function PinIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={`h-4 w-4 shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s7-4.35 7-11a7 7 0 1 0-14 0c0 6.65 7 11 7 11z" />
      <circle cx="12" cy="11" r="2" />
    </svg>
  );
}

export default function SettingsPage() {
  const [mounted, setMounted] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [makeRows, setMakeRows] = useState<MakeRow[]>([]);
  const [materials, setMaterials] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);

  const [editMode, setEditMode] = useState<EditMode>({ kind: "none" });
  const [draft, setDraft] = useState<MakeRow>({ material: "", base: "" });

  const [makeSortKey, setMakeSortKey] = useState<"material" | "base">("material");
const [makeSortDir, setMakeSortDir] = useState<"asc" | "desc">("asc");


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
    const bases = JSON.parse(localStorage.getItem("gt_bases_v1") || "[]");
    setMaterials(Array.isArray(mats) ? mats : []);
    setLocations(Array.isArray(bases) ? bases : []);
  }, [mounted]);

  const toggleMakeSort = (key: "material" | "base") => {
  if (makeSortKey !== key) {
    setMakeSortKey(key);
    setMakeSortDir("asc");
  } else {
    setMakeSortDir((d) => (d === "asc" ? "desc" : "asc"));
  }
};

const norm = (s: string) => (s || "").trim().toLowerCase();

const sortedMakeView = useMemo(() => {
  const rows = makeRows.map((r, idx) => ({ r, idx }));

  rows.sort((a, b) => {
    const av = norm(makeSortKey === "material" ? a.r.material : a.r.base);
    const bv = norm(makeSortKey === "material" ? b.r.material : b.r.base);

    let cmp = av.localeCompare(bv);
    if (cmp !== 0) return makeSortDir === "asc" ? cmp : -cmp;

    // stable tie-breakers
    cmp =
      norm(a.r.material).localeCompare(norm(b.r.material)) ||
      norm(a.r.base).localeCompare(norm(b.r.base)) ||
      (a.idx - b.idx);

    return makeSortDir === "asc" ? cmp : -cmp;
  });

  return rows;
}, [makeRows, makeSortKey, makeSortDir]);


  const canSaveDraft = useMemo(() => {
    const m = (draft.material || "").trim();
    const b = (draft.base || "").trim();
    return Boolean(m) && Boolean(b);
  }, [draft.material, draft.base]);

  const startNewRow = () => {
    setEditMode({ kind: "new" });
    setDraft({ material: "", base: "" });
  };

  const startEditRow = (idx: number) => {
    const row = makeRows[idx] || { material: "", base: "" };
    setEditMode({ kind: "edit", idx });
    setDraft({ material: row.material || "", base: row.base || "" });
  };

  const cancelEdit = () => {
    setEditMode({ kind: "none" });
    setDraft({ material: "", base: "" });
  };

  const commitEdit = () => {
    const nextRow: MakeRow = {
      material: (draft.material || "").trim(),
      base: (draft.base || "").trim(),
    };

    if (!nextRow.material || !nextRow.base) return;

    if (editMode.kind === "new") {
      const next = [...makeRows, nextRow];
      setMakeRows(next);
      saveMake(next);
      setEditMode({ kind: "none" });
      return;
    }

    if (editMode.kind === "edit") {
      const idx = editMode.idx;
      const next = makeRows.map((r, i) => (i === idx ? nextRow : r));
      setMakeRows(next);
      saveMake(next);
      setEditMode({ kind: "none" });
    }
  };

  const removeRow = (idx: number) => {
    const next = makeRows.filter((_, i) => i !== idx);
    setMakeRows(next);
    saveMake(next);
    if (editMode.kind === "edit" && editMode.idx === idx) {
      cancelEdit();
    }
  };

  const isLocked = editMode.kind !== "none";

  if (!mounted) return null;

  return (
    <div className="space-y-6 text-[#e2e2e2]">
      <h1 className="text-2xl font-semibold">Settings</h1>

      {/* API KEY */}
      <div className={panelCls}>
        <div className="flex items-center justify-between gap-3">
          <div className={panelTitleCls}>API Key</div>
          <button
            className={btnCls}
            onClick={() => {
              localStorage.setItem(LS_API_KEY, apiKey.trim());
              alert("Saved.");
            }}
          >
            Save
          </button>
        </div>

        <div className="mt-3">
          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste your GT API key…"
            className={apiInputCls}
          />
          <div className="mt-2 text-xs text-white/50">Stored locally in your browser.</div>
        </div>
      </div>

      {/* MAKE TABLE */}
      <div className={panelCls}>
        <div className="flex items-center justify-between gap-3">
          <div className={panelTitleCls}>Make table</div>
          <button className={btnCls} onClick={startNewRow} disabled={isLocked}>
            + Add row
          </button>
        </div>

        <div className="mt-3">
          <div className={tableShellCls}>
            <table className={tableCls}>
              <thead className="bg-[#333333]">
                <tr>
                  <th className={thCls}>
  <button
    className="inline-flex items-center gap-1 hover:opacity-80"
    onClick={() => toggleMakeSort("material")}
  >
    Material
    <img
      src={SORT_ICON}
      alt=""
      className={`h-2.5 w-2.5 translate-y-[1.5px] ${
        makeSortKey === "material" ? "opacity-70" : "opacity-40"
      } ${makeSortKey === "material" && makeSortDir === "asc" ? "rotate-180" : ""}`}
    />
  </button>
</th>

<th className={thCls}>
  <button
    className="inline-flex items-center gap-1 hover:opacity-80"
    onClick={() => toggleMakeSort("base")}
  >
    Base
    <img
      src={SORT_ICON}
      alt=""
      className={`h-2.5 w-2.5 translate-y-[1.5px] ${
        makeSortKey === "base" ? "opacity-70" : "opacity-40"
      } ${makeSortKey === "base" && makeSortDir === "asc" ? "rotate-180" : ""}`}
    />
  </button>
</th>

                  <th className={`${thCls} text-right`}>Actions</th>
                </tr>
              </thead>

              <tbody className="bg-[#2b2b2b]">

                {editMode.kind === "new" ? (
                  <tr className={rowCls}>
                    <td className={tdCls}>
                      <div className="flex items-center gap-2">
                        <MaterialLabel name={draft.material} size={18} showText={false} />
                        <input
                          list="materials"
                          value={draft.material}
                          placeholder="Material"
                          className={inputCellCls}
                          onChange={(e) => setDraft((d) => ({ ...d, material: e.target.value }))}
                        />
                      </div>
                    </td>
                    <td className={tdCls}>
                      <div className="flex items-center gap-2">
                        <PinIcon className="opacity-70" />
                        <input
                          list="locations"
                          value={draft.base}
                          placeholder="Base"
                          className={inputCellCls}
                          onChange={(e) => setDraft((d) => ({ ...d, base: e.target.value }))}
                        />
                      </div>
                    </td>
                    <td className={`${tdCls} text-right`}>
                      <div className="flex items-center justify-end gap-2">
                        <button className={btnSmCls} onClick={commitEdit} disabled={!canSaveDraft}>
                          Add
                        </button>
                        <button className={btnSmCls} onClick={cancelEdit}>
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : null}

                {sortedMakeView.map(({ r, idx }) => {
                  const isEditing = editMode.kind === "edit" && editMode.idx === idx;

                  return (
                    <tr key={idx} className={rowCls}>
                      <td className={tdCls}>
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <MaterialLabel name={draft.material} size={18} showText={false} />
                            <input
                              list="materials"
                              value={draft.material}
                              placeholder="Material"
                              className={inputCellCls}
                              onChange={(e) =>
                                setDraft((d) => ({ ...d, material: e.target.value }))
                              }
                            />
                          </div>
                        ) : r.material ? (
                          <MaterialLabel
                            name={r.material}
                            size={18}
                            className="text-[#4da3ff]"
                            showText
                          />
                        ) : (
                          <span className="text-white/40">—</span>
                        )}
                      </td>

                      <td className={tdCls}>
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <PinIcon className="opacity-70" />
                            <input
                              list="locations"
                              value={draft.base}
                              placeholder="Base"
                              className={inputCellCls}
                              onChange={(e) => setDraft((d) => ({ ...d, base: e.target.value }))}
                            />
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-2 text-white/90">
                            <PinIcon className="opacity-60" />
                            {r.base ? <span>{r.base}</span> : <span className="text-white/40">—</span>}
                          </span>
                        )}
                      </td>

                      <td className={`${tdCls} text-right`}>
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-2">
                            <button className={btnSmCls} onClick={commitEdit} disabled={!canSaveDraft}>
                              Save
                            </button>
                            <button className={btnSmCls} onClick={cancelEdit}>
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              className={btnSmCls}
                              onClick={() => startEditRow(idx)}
                              disabled={isLocked}
                            >
                              Edit
                            </button>
                            <button
                              className={btnSmCls}
                              onClick={() => removeRow(idx)}
                              disabled={isLocked}
                              title="Remove"
                            >
                              ×
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {makeRows.length === 0 && editMode.kind !== "new" ? (
                  <tr className="border-t border-white/10">
                    <td className={`${tdCls} text-white/50`} colSpan={3}>
                      No rows yet. Click <span className="text-white/70">+ Add row</span> to create one.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-2 text-xs text-white/50">Saved locally in your browser.</div>
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
