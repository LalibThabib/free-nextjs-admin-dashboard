export type MakeRow = {
  material: string;
  base: string;
};

export const LS_MAKE = "gt_make_v1";

export function loadMake(): MakeRow[] {
  try {
    const raw = localStorage.getItem(LS_MAKE);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr;
  } catch {
    return [];
  }
}

export function saveMake(rows: MakeRow[]) {
  localStorage.setItem(LS_MAKE, JSON.stringify(rows));
}
