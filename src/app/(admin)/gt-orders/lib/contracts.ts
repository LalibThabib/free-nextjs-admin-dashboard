export type ContractRow = {
  id: string; // local id
  product: string;
  destination: string;
  client: string; // NEW
  unitsPerDay: number;
  fulfilled?: boolean;
  lastFulfilledAt?: string; // ISO
};

export const LS_CONTRACTS = "gt_contracts_v1";

export function loadContracts(): ContractRow[] {
  try {
    const raw = localStorage.getItem(LS_CONTRACTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Backfill client for older saved rows
    return parsed.map((c: any) => ({
      id: String(c?.id || ""),
      product: String(c?.product || ""),
      destination: String(c?.destination || ""),
      client: String(c?.client || ""),
      unitsPerDay: Number(c?.unitsPerDay || 0),
      fulfilled: c?.fulfilled,
      lastFulfilledAt: c?.lastFulfilledAt,
    }));
  } catch {
    return [];
  }
}

export function saveContracts(rows: ContractRow[]) {
  localStorage.setItem(LS_CONTRACTS, JSON.stringify(rows));
}

export function newId() {
  return Math.random().toString(36).slice(2, 10);
}
