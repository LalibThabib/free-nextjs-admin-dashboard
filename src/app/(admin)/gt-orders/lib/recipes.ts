export type RecipeLine = {
  output: string;
  outputQty: number;
  input: string;
  inputQty: number;
};

type GameData = {
  materials?: { id: number; name: string }[];
  recipes?: any[];
};

const GAME_DATA_URL = "https://api.g2.galactictycoons.com/gamedata.json";

export async function fetchRecipeLines(): Promise<RecipeLine[]> {
  const r = await fetch(GAME_DATA_URL);
  if (!r.ok) throw new Error(`HTTP ${r.status} for gamedata.json`);
  const data = (await r.json()) as GameData;

  const idToName = new Map<number, string>();
  for (const m of data.materials || []) {
    idToName.set(Number(m.id), String(m.name));
  }

  const out: RecipeLine[] = [];

  for (const rec of data.recipes || []) {
    const outs = rec.outputs || rec.outs || (rec.output ? [rec.output] : []);
    const ins = rec.inputs || rec.ins || [];

    const normOuts = (outs || []).map((o: any) => ({
      id: Number(o.id ?? o.matId ?? o.mId),
      am: Number(o.am ?? o.amount ?? o.qty ?? 1),
    }));

    const normIns = (ins || []).map((i: any) => ({
      id: Number(i.id ?? i.matId ?? i.mId),
      am: Number(i.am ?? i.amount ?? i.qty ?? 1),
    }));

    for (const o of normOuts) {
      const outName = idToName.get(o.id) || String(o.id);
      for (const i of normIns) {
        const inName = idToName.get(i.id) || String(i.id);

        // skip self-reference, like your sheet
        if (outName === inName) continue;

        out.push({
          output: outName,
          outputQty: o.am,
          input: inName,
          inputQty: i.am,
        });
      }
    }
  }

  return out;
}

export function buildRecipeMap(lines: RecipeLine[]) {
  // output -> { outQty, inputs[] }
  const recMap = new Map<string, { outQty: number; inputs: { name: string; qty: number }[] }>();

  for (const l of lines) {
    if (!l.output || !l.input || !l.outputQty || !l.inputQty) continue;

    if (!recMap.has(l.output)) recMap.set(l.output, { outQty: l.outputQty, inputs: [] });
    const r = recMap.get(l.output)!;

    // keep first outQty seen (should be consistent)
    if (!r.outQty) r.outQty = l.outputQty;

    r.inputs.push({ name: l.input, qty: l.inputQty });
  }

  return recMap;
}
