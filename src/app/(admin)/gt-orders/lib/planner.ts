import type { ContractRow } from "./contracts";

export type StockRowNamed = {
  locationName: string;
  matName: string;
  amount: number;
};

export type ContractStatusRow = {
  id: string;
  client: string;
  product: string;
  destination: string;
  unitsPerDay: number;
  availAtDestination: number; // allocated to this contract
  missing: number;            // allocated shortage for this contract
  daysCovered: number; // avail / unitsPerDay
  status: "OK" | "SHORT";
};


// Helpers
const norm = (x: string) => (x || "").trim();

export function buildStockMap(stocks: StockRowNamed[]) {
  // stock[mat][loc] = amount
  const stock = new Map<string, Map<string, number>>();

  for (const r of stocks) {
    const loc = norm(r.locationName);
    const mat = norm(r.matName);
    const amt = Number(r.amount || 0);
    if (!loc || !mat || !amt) continue;

    if (!stock.has(mat)) stock.set(mat, new Map());
    const m = stock.get(mat)!;
    m.set(loc, (m.get(loc) || 0) + amt);
  }

  return stock;
}

export function stockAt(stock: Map<string, Map<string, number>>, mat: string, loc: string) {
  return Number(stock.get(mat)?.get(loc) || 0);
}

export function aggregateContracts(contracts: ContractRow[]) {
  // agg["Product||Destination"] = units/day (ceil)
  const agg = new Map<string, number>();

  for (const c of contracts) {
    const product = norm(c.product);
    const dest = norm(c.destination);
    const perDay = Math.ceil(Number(c.unitsPerDay || 0));
    if (!product || !dest || perDay <= 0) continue;

    const key = `${product}||${dest}`;
    agg.set(key, (agg.get(key) || 0) + perDay);
  }

  return agg;
}

export function computeContractStatus(
  contracts: ContractRow[],
  stock: Map<string, Map<string, number>>
): ContractStatusRow[] {
  const out: ContractStatusRow[] = [];

  // Group by product+destination so we can allocate destination stock across multiple contracts
  const groups = new Map<string, ContractRow[]>();

  for (const c of contracts) {
    const product = norm(c.product);
    const destination = norm(c.destination);
    const perDay = Math.ceil(Number(c.unitsPerDay || 0));
    if (!product || !destination || perDay <= 0) continue;

    const k = `${product}||${destination}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(c);
  }

  for (const [k, cs] of groups.entries()) {
    const [product, destination] = k.split("||");

    // Total stock at destination for this product
    let remaining = stockAt(stock, product, destination);

    // Stable deterministic allocation: by id (so results don't jump around)
    const sorted = [...cs].sort((a, b) => String(a.id).localeCompare(String(b.id)));

    for (const c of sorted) {
      const perDay = Math.ceil(Number(c.unitsPerDay || 0));

      const allocatedAvail = Math.max(0, Math.min(remaining, perDay));
      remaining = Math.max(0, remaining - allocatedAvail);

      const missing = Math.max(0, perDay - allocatedAvail);
      const daysCovered = perDay > 0 ? allocatedAvail / perDay : 0;

      out.push({
        id: c.id,
        client: norm((c as any).client || ""),
        product,
        destination,
        unitsPerDay: perDay,
        availAtDestination: allocatedAvail,
        missing,
        daysCovered,
        status: missing === 0 ? "OK" : "SHORT",
      });
    }
  }

  // Sort: most missing first, then product
  out.sort((a, b) => (b.missing - a.missing) || a.product.localeCompare(b.product));
  return out;



  // Sort like your sheet: most missing first
  out.sort((a, b) => (b.missing - a.missing) || a.product.localeCompare(b.product));
  return out;
}

export type TransportRow = {
  material: string;
  units: number;
  from: string;
  to: string;
  notes: string;
};

export function computeTransportNeeded(
  contracts: ContractRow[],
  stock: Map<string, Map<string, number>>
): TransportRow[] {
  const agg = aggregateContracts(contracts);

  // Helper: total stock of a material across all locations
  const totalStock = (mat: string) => {
    const m = stock.get(mat);
    if (!m) return 0;
    let t = 0;
    for (const v of m.values()) t += Number(v || 0);
    return t;
  };

  // Reserve stock needed “locally” for that location’s own contract target
  const requiredAtLoc = (material: string, location: string) => {
    const k = `${material}||${location}`;
    return Number(agg.get(k) || 0); // target for that destination (1 day)
  };

  // Compute total shippable to dest (after reserving each source’s local requirement)
  const shippableToDest = (material: string, dest: string) => {
    const m = stock.get(material) || new Map<string, number>();
    let total = 0;
    for (const [loc, amt] of m.entries()) {
      if (loc === dest) continue;
      const have = Number(amt || 0);
      const reserve = requiredAtLoc(material, loc);
      total += Math.max(0, have - reserve);
    }
    return total;
  };

  // Choose best source (highest shippable) for a given dest
  const bestSource = (material: string, dest: string) => {
    const m = stock.get(material) || new Map<string, number>();
    let bestLoc = "";
    let bestShip = 0;
    for (const [loc, amt] of m.entries()) {
      if (loc === dest) continue;
      const have = Number(amt || 0);
      const reserve = requiredAtLoc(material, loc);
      const shipAvail = Math.max(0, have - reserve);
      if (shipAvail > bestShip) {
        bestShip = shipAvail;
        bestLoc = loc;
      }
    }
    return { bestLoc, bestShip };
  };

  // Aggregate transport tasks: mat|from|to -> qty
  const tAgg = new Map<string, number>();

  for (const [key, perDay] of agg.entries()) {
    const [mat, dest] = key.split("||");

    const availDest = stockAt(stock, mat, dest);
    const missing = Math.max(0, perDay - availDest);
    if (missing <= 0) continue;

    // Only transport if overall stock is sufficient (otherwise production will handle later)
    if (totalStock(mat) < perDay) continue;

    // All-or-nothing: must be able to cover the full missing via shippable stock
    const shipTotal = shippableToDest(mat, dest);
    if (shipTotal < missing) continue;

    const { bestLoc, bestShip } = bestSource(mat, dest);
    if (!bestLoc || bestShip <= 0) continue;

    const k2 = `${mat}|${bestLoc}|${dest}`;
    tAgg.set(k2, (tAgg.get(k2) || 0) + Math.ceil(missing));
  }

  const rows: TransportRow[] = Array.from(tAgg.entries()).map(([k, qty]) => {
    const [material, from, to] = k.split("|");
    return {
      material,
      units: Number(qty),
      from,
      to,
      notes: "Move to cover destination shortage (overall stock sufficient)",
    };
  });

  const netted = netOpposingMoves(
  rows,
  (r) => r.material,
  (r) => r.units,
  (r, q) => (r.units = q),
  (mat, from, to, qty, notes) => ({ material: mat, units: qty, from, to, notes })
);

netted.sort((a, b) => (b.units - a.units) || a.material.localeCompare(b.material));
return netted;

}

export type MakeRow = { material: string; base: string };

export type ProductionRow = {
  product: string;
  unitsPerDay: number;
  produceAt: string;
  inputsStatus: string;
  notes: string;
};


export function computeProductionNeeded(
  contracts: ContractRow[],
  stock: Map<string, Map<string, number>>,
  makeRows: MakeRow[],
  recipeMap: Map<string, { outQty: number; inputs: { name: string; qty: number }[] }>
): ProductionRow[] {
  const agg = aggregateContracts(contracts);

  // Make map: product -> base
  const madeAtMap = new Map<string, string>();
  for (const r of makeRows) {
    const mat = (r.material || "").trim();
    const base = (r.base || "").trim();
    if (mat && base) madeAtMap.set(mat, base);
  }

  const isMake = (mat: string) => madeAtMap.has(mat);

  // Reserve: keep enough at each location to satisfy its own contract target
  const requiredAtLoc = (material: string, location: string) => {
    const k = `${material}||${location}`;
    return Number(agg.get(k) || 0);
  };

  const shippableToDest = (material: string, dest: string) => {
    const m = stock.get(material) || new Map<string, number>();
    let total = 0;
    for (const [loc, amt] of m.entries()) {
      if (loc === dest) continue;
      const have = Number(amt || 0);
      const reserve = requiredAtLoc(material, loc);
      total += Math.max(0, have - reserve);
    }
    return total;
  };
// --- Primary production: cover remainder after shippable stock ---
const prodAgg = new Map<string, number>(); // product -> qty/day to produce
const prodReason = new Map<string, string>(); // product -> note


  for (const [key, perDay] of agg.entries()) {
    const [product, dest] = key.split("||");

    const availDest = stockAt(stock, product, dest);
    const missingDest = Math.max(0, perDay - availDest);
    if (missingDest <= 0) continue;

    const shipAvail = shippableToDest(product, dest);
    const needProduce = Math.max(0, Math.ceil(missingDest - shipAvail));
   
    if (needProduce > 0) {
  if (!isMake(product)) continue;
  prodAgg.set(product, (prodAgg.get(product) || 0) + needProduce);
  prodReason.set(product, "Final product for contracts");
}


  }

  // --- One extra cascade level: if inputs are Make, add them to secondary production ---
  const prodAgg2 = new Map<string, number>();

  const addTo = (mp: Map<string, number>, k: string, v: number) =>
    mp.set(k, (mp.get(k) || 0) + Math.ceil(Number(v) || 0));

  for (const [product, qtyToProduce] of prodAgg.entries()) {
    const recipe = recipeMap.get(product);
    if (!recipe) continue;

    for (const ing of recipe.inputs) {
      const needIngTotal = Math.ceil((Number(qtyToProduce) * ing.qty) / recipe.outQty);
      if (isMake(ing.name)) {
  addTo(prodAgg2, ing.name, needIngTotal);
  prodReason.set(ing.name, `Ingredient for ${product}`);
}

    }
  }

  // Merge primary + secondary
  const prodPlan = new Map(prodAgg);
  for (const [mat, qty] of prodAgg2.entries()) {
    prodPlan.set(mat, (prodPlan.get(mat) || 0) + Math.ceil(Number(qty) || 0));
  }

  // Build rows with input readiness status at producing base
  const rows: ProductionRow[] = [];

  for (const [product, qty] of prodPlan.entries()) {
    const base = madeAtMap.get(product) || "";
    const recipe = recipeMap.get(product);

    let status = "UNKNOWN";
    if (!base) {
      status = "NO BASE (check Make)";
    } else if (!recipe) {
      status = "NO RECIPE (cannot verify inputs)";
    } else {
      const missingList: string[] = [];
      for (const ing of recipe.inputs) {
        const need = Math.ceil((Number(qty) * ing.qty) / recipe.outQty);
        const have = stockAt(stock, ing.name, base);
        const miss = Math.max(0, need - have);
        if (miss > 0) missingList.push(`${ing.name} (${have}/${need})`);
      }
      status = missingList.length === 0 ? "READY" : `NEEDS INPUTS: ${missingList.join(", ")}`;
    }

  rows.push({
  product,
  unitsPerDay: Number(qty),
  produceAt: base,
  inputsStatus: status,
  notes: prodReason.get(product) || "",
});


  }

  rows.sort((a, b) => (b.unitsPerDay - a.unitsPerDay) || a.product.localeCompare(b.product));
  return rows;
}

export type BuyRow = { material: string; unitsPerDay: number; notes: string };


export function computeBuyNeeded(
  contracts: ContractRow[],
  stock: Map<string, Map<string, number>>,
  makeRows: MakeRow[],
  recipeMap: Map<string, { outQty: number; inputs: { name: string; qty: number }[] }>,
  productionNeeded: { product: string; unitsPerDay: number; produceAt: string }[]
): BuyRow[] {
  // Make map
  const madeAtMap = new Map<string, string>();
  for (const r of makeRows) {
    const mat = (r.material || "").trim();
    const base = (r.base || "").trim();
    if (mat && base) madeAtMap.set(mat, base);
  }
  const isMake = (mat: string) => madeAtMap.has(mat);

  // Helper: total global stock of material
  const totalHave = (mat: string) => {
    const m = stock.get(mat);
    if (!m) return 0;
    let t = 0;
    for (const v of m.values()) t += Number(v || 0);
    return t;
  };

  // Production set (only buy for outputs produced today)
  const prodSet = new Set(productionNeeded.map((p) => p.product));

  // Map product -> {qty, base}
  const prodMap = new Map<string, { qty: number; base: string }>();
  for (const p of productionNeeded) {
    prodMap.set(p.product, { qty: Math.ceil(Number(p.unitsPerDay) || 0), base: p.produceAt });
  }

  // Demand-derived buys (net against global stock)
  const buyAgg = new Map<string, number>();

  const buyNotes = new Map<string, Set<string>>();
const addNote = (mat: string, note: string) => {
  if (!note) return;
  if (!buyNotes.has(mat)) buyNotes.set(mat, new Set());
  buyNotes.get(mat)!.add(note);
};

  // Production-blocking buys (do NOT net first; we add them after)
  const buyAggProd = new Map<string, number>();

  
  const addTo = (mp: Map<string, number>, k: string, v: number) =>
    mp.set(k, (mp.get(k) || 0) + Math.ceil(Number(v) || 0));
    // --- Direct contract buys (for products that are NOT MAKE) ---
  // If destination is short, and we can't fully cover via transport (all-or-nothing),
  // then buy the remaining amount (later netted vs global stock).
  const aggContracts = aggregateContracts(contracts);

  const requiredAtLoc = (material: string, location: string) => {
    const k = `${material}||${location}`;
    return Number(aggContracts.get(k) || 0);
  };

  const shippableToDest = (material: string, dest: string) => {
    const m = stock.get(material) || new Map<string, number>();
    let total = 0;
    for (const [loc, amt] of m.entries()) {
      if (loc === dest) continue;
      const have = Number(amt || 0);
      const reserve = requiredAtLoc(material, loc);
      total += Math.max(0, have - reserve);
    }
    return total;
  };

  for (const [key, perDay] of aggContracts.entries()) {
    const [product, dest] = key.split("||");

    // Only buy final products that we do NOT make
    if (isMake(product)) continue;

    const availDest = stockAt(stock, product, dest);
    const missingDest = Math.max(0, perDay - availDest);
    if (missingDest <= 0) continue;

    const shipAvail = shippableToDest(product, dest);
    const needBuy = Math.max(0, Math.ceil(missingDest - shipAvail));
    if (needBuy > 0) {
  addTo(buyAgg, product, needBuy);
  addNote(product, "Final product for contracts");
}

  }

  
  // 1) Demand-derived buys: for each produced output, include its BUY inputs from recipe
  // (This mirrors your “filter Demand_L1–L3 by prodSet” outcome, but without needing Demand sheets.)
  for (const [product, { qty, base }] of prodMap.entries()) {
    if (!prodSet.has(product)) continue;

    const recipe = recipeMap.get(product);
    if (!recipe) continue;

    for (const ing of recipe.inputs) {
      if (isMake(ing.name)) continue; // not a BUY input
      const need = Math.ceil((qty * ing.qty) / recipe.outQty);
      addTo(buyAgg, ing.name, need);
      addNote(ing.name, `Ingredient for ${product}`);

    }
  }

  // Helper: shippable to a base (all-or-nothing check)
  const shipAvailToBase = (material: string, base: string) => {
    const m = stock.get(material) || new Map<string, number>();
    let total = 0;
    for (const [loc, amt] of m.entries()) {
      if (loc === base) continue;
      total += Math.max(0, Number(amt || 0));
    }
    return total;
  };

  // 2) Production-blocking buys:
  // If a BUY input is missing at the producing base AND cannot be fully covered via transport,
  // buy the missing amount to unblock production.
  for (const [product, { qty, base }] of prodMap.entries()) {
    const recipe = recipeMap.get(product);
    if (!recipe || !base) continue;

    for (const ing of recipe.inputs) {
      if (isMake(ing.name)) continue; // only BUY inputs here

      const need = Math.ceil((qty * ing.qty) / recipe.outQty);
      const haveAtBase = stockAt(stock, ing.name, base);
      const missingAtBase = Math.max(0, need - haveAtBase);
      if (missingAtBase <= 0) continue;

      // all-or-nothing: if we can fully cover via transport from elsewhere, don’t buy
      const shipTotal = shipAvailToBase(ing.name, base);
      if (shipTotal >= missingAtBase) continue;

      addTo(buyAggProd, ing.name, missingAtBase);
      addNote(ing.name, `Unblock ${product} at ${base}`);

    }
  }

  // 3) Net demand-derived buys against global stock
  for (const [mat, qty] of Array.from(buyAgg.entries())) {
    const remaining = Math.max(0, Number(qty) - totalHave(mat));
    if (remaining > 0) buyAgg.set(mat, remaining);
    else buyAgg.delete(mat);
  }

  // 4) Add production-blocking buys on top (your “do not net” behavior)
  for (const [mat, qty] of buyAggProd.entries()) {
    buyAgg.set(mat, (buyAgg.get(mat) || 0) + Math.ceil(Number(qty) || 0));
  }

  const rows: BuyRow[] = Array.from(buyAgg.entries())
    .map(([material, unitsPerDay]) => ({
  material,
  unitsPerDay: Number(unitsPerDay),
  notes: Array.from(buyNotes.get(material) || []).join("; "),
}))

    .sort((a, b) => (b.unitsPerDay - a.unitsPerDay) || a.material.localeCompare(b.material));

  return rows;
}

export type IngredientTransportRow = {
  ingredient: string;
  units: number;
  from: string;
  to: string;
  notes: string; // e.g. "Transport to unlock Epoxy production"
};

export function computeIngredientTransportNeeded(
  stock: Map<string, Map<string, number>>,
  contracts: ContractRow[],
  makeRows: MakeRow[],
  recipeMap: Map<string, { outQty: number; inputs: { name: string; qty: number }[] }>,
  productionNeeded: { product: string; unitsPerDay: number; produceAt: string }[]
): IngredientTransportRow[] {
  // Build madeAt map (material -> base)
  const madeAtMap = new Map<string, string>();
  for (const r of makeRows) {
    const mat = (r.material || "").trim();
    const base = (r.base || "").trim();
    if (mat && base) madeAtMap.set(mat, base);
  }
  const isMake = (mat: string) => madeAtMap.has(mat);
  
  // Contract aggregation for reservation (same as sheet)
  const agg = aggregateContracts(contracts);
  const requiredAtLoc = (material: string, location: string) => {
    const k = `${material}||${location}`;
    return Number(agg.get(k) || 0);
  };

  // Helpers: stockAt already exists above, using same stock map
  const shipAvailNowAtSource = (material: string, source: string) => {
    const have = stockAt(stock, material, source);
    const reserve = requiredAtLoc(material, source);
    return Math.max(0, have - reserve);
  };

  const shipTotalToBaseAllSources = (material: string, base: string) => {
    const m = stock.get(material) || new Map<string, number>();
    let total = 0;
    for (const [loc, amt] of m.entries()) {
      if (loc === base) continue;
      const have = Number(amt || 0);
      const reserve = requiredAtLoc(material, loc);
      total += Math.max(0, have - reserve);
    }
    return total;
  };

  const bestSourceToBase = (material: string, base: string) => {
    const m = stock.get(material) || new Map<string, number>();
    let bestLoc = "";
    let bestShip = 0;
    for (const [loc, amt] of m.entries()) {
      if (loc === base) continue;
      const have = Number(amt || 0);
      const reserve = requiredAtLoc(material, loc);
      const ship = Math.max(0, have - reserve);
      if (ship > bestShip) {
        bestShip = ship;
        bestLoc = loc;
      }
    }
    return { bestLoc, bestShip };
  };

  // Aggregate: ingredient|from|to|product -> qty
  const ingTAgg = new Map<string, number>();
  const addTo = (k: string, v: number) =>
    ingTAgg.set(k, (ingTAgg.get(k) || 0) + Math.ceil(Number(v) || 0));

  for (const p of productionNeeded) {
    const product = p.product;
    const prodQty = Math.ceil(Number(p.unitsPerDay) || 0);
    const base = (p.produceAt || "").trim();
    const recipe = recipeMap.get(product);
    if (!base || !recipe || prodQty <= 0) continue;

    for (const ing of recipe.inputs) {
      const needAtBase = Math.ceil((prodQty * ing.qty) / recipe.outQty);
      const haveAtBase = stockAt(stock, ing.name, base);
      const missingAtBase = Math.max(0, needAtBase - haveAtBase);
      if (missingAtBase <= 0) continue;

      // If ingredient is MAKE: ship from its production base ONLY if source base has enough NOW (all-or-nothing)
      if (isMake(ing.name)) {
        const srcBase = madeAtMap.get(ing.name) || "";
        if (srcBase && srcBase !== base) {
          const shippableNow = shipAvailNowAtSource(ing.name, srcBase);
          if (shippableNow >= missingAtBase) {
            addTo(`${ing.name}|${srcBase}|${base}|${product}`, missingAtBase);
          }
        }
        continue;
      }

      // If ingredient is BUY: we can also suggest transport from elsewhere,
      // but only if total shippable across all sources can cover full missing (all-or-nothing),
      // and we pick best source.
      const shipTotal = shipTotalToBaseAllSources(ing.name, base);
      if (shipTotal < missingAtBase) continue;

      const { bestLoc, bestShip } = bestSourceToBase(ing.name, base);
      if (!bestLoc || bestShip <= 0) continue;

      addTo(`${ing.name}|${bestLoc}|${base}|${product}`, missingAtBase);
    }
  }

  const rows: IngredientTransportRow[] = Array.from(ingTAgg.entries())
    .map(([k, qty]) => {
      const [ingredient, from, to, product] = k.split("|");
      return {
        ingredient,
        units: Number(qty),
        from,
        to,
        notes: `Transport to unlock ${product} production`,
      };
    })
   const netted = netOpposingMoves(
  rows,
  (r) => r.ingredient,
  (r) => r.units,
  (r, q) => (r.units = q),
  (mat, from, to, qty, notes) => ({ ingredient: mat, units: qty, from, to, notes })
);

netted.sort((a, b) => (b.units - a.units) || a.ingredient.localeCompare(b.ingredient));
return netted;

}

function netOpposingMoves<T extends { from: string; to: string; notes: string }>(
  rows: T[],
  getMat: (r: T) => string,
  getQty: (r: T) => number,
  setQty: (r: T, q: number) => void,
  makeRow: (mat: string, from: string, to: string, qty: number, notes: string) => T
): T[] {
  const agg = new Map<string, { mat: string; from: string; to: string; qty: number; notes: string }>();

  // 1) Aggregate same-direction rows
  for (const r of rows) {
    const mat = String(getMat(r) || "").trim();
    const from = String(r.from || "").trim();
    const to = String(r.to || "").trim();
    const qty = Math.ceil(Number(getQty(r) || 0));
    if (!mat || !from || !to || qty <= 0) continue;

    const k = `${mat}|${from}|${to}`;
    const cur = agg.get(k);
    if (!cur) agg.set(k, { mat, from, to, qty, notes: r.notes || "" });
    else {
      cur.qty += qty;
      if (r.notes && cur.notes && !cur.notes.includes(r.notes)) cur.notes += `; ${r.notes}`;
      else if (r.notes && !cur.notes) cur.notes = r.notes;
    }
  }

  // 2) Net opposites
  const out = new Map<string, { mat: string; from: string; to: string; qty: number; notes: string }>();

  for (const [k, v] of agg.entries()) {
    const oppositeKey = `${v.mat}|${v.to}|${v.from}`;

    // If we've already kept the opposite direction, net against it
    const opp = out.get(oppositeKey);
    if (opp) {
      if (opp.qty > v.qty) {
        opp.qty -= v.qty; // reduce opposite
      } else if (opp.qty < v.qty) {
        // replace opposite with remainder in this direction
        out.delete(oppositeKey);
        out.set(k, { ...v, qty: v.qty - opp.qty });
      } else {
        // equal — cancel both
        out.delete(oppositeKey);
      }
    } else {
      out.set(k, { ...v });
    }
  }

  // 3) Rebuild rows
  const rebuilt: T[] = [];
  for (const v of out.values()) {
    rebuilt.push(makeRow(v.mat, v.from, v.to, v.qty, v.notes));
  }
  return rebuilt;
}
