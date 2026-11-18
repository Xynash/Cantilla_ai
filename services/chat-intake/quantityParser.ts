export interface QuantityParseResult {
  quantity?: number;
  uom?: string;
  rawMatched?: string;
}

const UOM_NORMALIZATION_MAP: Record<string, string> = {
  nos: "NOS",
  no: "NOS",
  piece: "NOS",
  pieces: "NOS",
  pcs: "NOS",
  unit: "NOS",
  units: "NOS",
  kg: "KG",
  kgs: "KG",
  kilogram: "KG",
  kilograms: "KG",
  kilo: "KG",
  ltr: "LTR",
  litre: "LTR",
  litres: "LTR",
  liter: "LTR",
  liters: "LTR",
  mtr: "MTR",
  meter: "MTR",
  meters: "MTR",
  metre: "MTR",
  metres: "MTR",
  pair: "PAIR",
  pairs: "PAIR",
  bkt: "BKT",
  bucket: "BKT",
  buckets: "BKT",
  pkt: "PKT",
  packet: "PKT",
  packets: "PKT",
  box: "BOX",
  boxes: "BOX",
  set: "SET",
  sets: "SET",
  mon: "MON",
  month: "MON",
  months: "MON",
  roll: "ROL",
  rolls: "ROL",
  brl: "BRL",
  barrel: "BRL",
  barrels: "BRL",
};

/**
 * Extracts quantity and optional unit of measure from user text.
 * Handles forms like:
 * - "200 nitrile gloves"
 * - "50 litres of hydraulic oil"
 * - "10.5 kg steel"
 * - "quantity 500"
 * - "need 5 boxes"
 */
export function extractQuantity(text: string): QuantityParseResult {
  const normalized = text.toLowerCase();

  // Pattern 1: Number + optional spaces + unit (e.g. "200 nos", "50 litres", "10.5 kg", "200 pairs")
  const unitKeys = Object.keys(UOM_NORMALIZATION_MAP).sort((a, b) => b.length - a.length);
  const unitRegexPattern = unitKeys.join("|");

  const numWithUnitRegex = new RegExp(
    `\\b(\\d+(?:\\.\\d+)?)\\s*(?:of\\s+)?(?:the\\s+)?(${unitRegexPattern})\\b`,
    "i"
  );
  const matchWithUnit = normalized.match(numWithUnitRegex);

  if (matchWithUnit) {
    const qty = parseFloat(matchWithUnit[1]);
    const rawUnit = matchWithUnit[2].toLowerCase();
    const uom = UOM_NORMALIZATION_MAP[rawUnit] || rawUnit.toUpperCase();
    return {
      quantity: qty,
      uom,
      rawMatched: matchWithUnit[0],
    };
  }

  // Pattern 2: Explicit keyword e.g. "qty 200", "quantity: 50"
  const explicitQtyRegex = /\b(?:qty|quantity|count|amount)[\s:=]+(\d+(?:\.\d+)?)\b/i;
  const explicitMatch = normalized.match(explicitQtyRegex);
  if (explicitMatch) {
    return {
      quantity: parseFloat(explicitMatch[1]),
      rawMatched: explicitMatch[0],
    };
  }

  // Pattern 3: Standalone number preceding item words (e.g. "need 200 gloves", "order 5 bearings")
  // Exclude numbers that look like dates or years (e.g. 2026, 2025) or item codes (e.g. 6308, 1001)
  const standaloneRegex = /\b(\d+(?:\.\d+)?)\b/g;
  let match: RegExpExecArray | null;

  while ((match = standaloneRegex.exec(normalized)) !== null) {
    const num = parseFloat(match[1]);
    // Skip years or item model numbers often > 1000 unless specified
    if (num >= 1900 && num <= 2100) continue; // likely a year
    if (num === 6205 || num === 6308 || num === 32210 || num === 6061) continue; // common bearing/alloy specs

    return {
      quantity: num,
      rawMatched: match[0],
    };
  }

  return {};
}

export const parseQuantityAndUom = extractQuantity;
