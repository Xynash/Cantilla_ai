import { RawPrLine, ResolvedPrLine } from "../types/engine";

export interface ItemMasterRecord {
  itemCode: string;
  description: string;
  uom: string;
  category: string;
  itemType: string;
  standardPrice?: number;
}

// Known common abbreviations and industrial aliases in Corvo Engineering operations
const KNOWN_DESCRIPTION_ALIASES: Record<string, string> = {
  "v-belt b-54": "ITM-1024",
  "v belt b 54": "ITM-1024",
  "brg 6308 zz for maintenance": "ITM-1022",
  "brg 6308 zz": "ITM-1022",
  "bearing 6308-zz": "ITM-1022",
  "brg 6205 2rs": "ITM-1021",
  "bearing 6205-2rs": "ITM-1021",
  "taper roller brg 32210": "ITM-1023",
  "mig wire er70s-6 1.2mm": "ITM-1016",
  "welding rod e6013 3.15mm": "ITM-1015",
  "anchor fastener m12x100 - urgent": "ITM-1013",
  "anchor fastener m12x100": "ITM-1013",
  "vci bag 600x900": "ITM-1044",
  "hyd hose 1/2 inch 2 wire": "ITM-1035",
  "pneu cylinder 50x100": "ITM-1036",
  "monitor 24\"": "ITM-1057",
  "forklift electric 2 ton - urgent": "ITM-1073",
  "drinking water purifier 50 lph": "NEW",
  "ultrasonic thickness gauge": "NEW",
};

/**
 * Resolves an individual PR line against the Item Master list
 */
export function resolvePrLineItem(
  line: RawPrLine,
  itemMasterMap: Map<string, ItemMasterRecord>
): ResolvedPrLine {
  const parsedCreatedAt = new Date(line.created_at);
  const parsedNeedByDate = new Date(line.need_by_date);

  const rawCode = line.item_code?.trim().toUpperCase();
  const rawDesc = line.description?.trim();
  const normalizedDesc = rawDesc.toLowerCase();

  // 1. If explicit item code provided and exists in master
  if (rawCode && itemMasterMap.has(rawCode)) {
    const item = itemMasterMap.get(rawCode)!;
    return {
      ...line,
      resolvedItemCode: item.itemCode,
      isNewItem: false,
      matchExplanation: `Matched via item code ${item.itemCode}`,
      standardPrice: item.standardPrice,
      itemCategory: item.category,
      itemType: item.itemType,
      parsedCreatedAt,
      parsedNeedByDate,
    };
  }

  // 2. Exact matching on item description (case-insensitive)
  for (const item of itemMasterMap.values()) {
    if (item.description.toLowerCase() === normalizedDesc) {
      return {
        ...line,
        resolvedItemCode: item.itemCode,
        isNewItem: false,
        matchExplanation: `Matched description to ${item.itemCode}`,
        standardPrice: item.standardPrice,
        itemCategory: item.category,
        itemType: item.itemType,
        parsedCreatedAt,
        parsedNeedByDate,
      };
    }
  }

  // 3. Direct exact alias lookup
  if (KNOWN_DESCRIPTION_ALIASES[normalizedDesc]) {
    const targetCode = KNOWN_DESCRIPTION_ALIASES[normalizedDesc];
    if (targetCode === "NEW") {
      return {
        ...line,
        resolvedItemCode: "NEW",
        isNewItem: true,
        matchExplanation: `Not in item master (1.2): "${line.description}". Route to NEW_ITEM_SOURCING.`,
        parsedCreatedAt,
        parsedNeedByDate,
      };
    }

    if (itemMasterMap.has(targetCode)) {
      const item = itemMasterMap.get(targetCode)!;
      return {
        ...line,
        resolvedItemCode: item.itemCode,
        isNewItem: false,
        matchExplanation: `Matched alias "${rawDesc}" to ${item.itemCode} (${item.description})`,
        standardPrice: item.standardPrice,
        itemCategory: item.category,
        itemType: item.itemType,
        parsedCreatedAt,
        parsedNeedByDate,
      };
    }
  }

  // 4. Token-based substring/similarity search across item master
  // Clean description of common filler
  const cleanTokens = normalizedDesc
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !["for", "the", "and", "urgent", "maintenance", "service"].includes(t));

  let bestMatch: ItemMasterRecord | null = null;
  let bestScore = 0;

  for (const item of itemMasterMap.values()) {
    const itemTokens = item.description
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1);

    let matchCount = 0;
    for (const token of cleanTokens) {
      if (itemTokens.includes(token)) {
        matchCount++;
      }
    }

    const score = matchCount / Math.max(cleanTokens.length, itemTokens.length);
    if (score > bestScore && score >= 0.6) {
      bestScore = score;
      bestMatch = item;
    }
  }

  if (bestMatch) {
    return {
      ...line,
      resolvedItemCode: bestMatch.itemCode,
      isNewItem: false,
      matchExplanation: `Matched query tokens to ${bestMatch.itemCode} (${bestMatch.description})`,
      standardPrice: bestMatch.standardPrice,
      itemCategory: bestMatch.category,
      itemType: bestMatch.itemType,
      parsedCreatedAt,
      parsedNeedByDate,
    };
  }

  // 5. If no item matches, classify as NEW ITEM
  // Policy Section 1.2: "A line that matches no item master item is a new item. It always goes to sourcing (route NEW_ITEM_SOURCING), is never clubbed with other lines, and is valued at quantity * requester's estimated unit price."
  return {
    ...line,
    resolvedItemCode: "NEW",
    isNewItem: true,
    matchExplanation: `Not in item master (1.2): "${line.description}". Route to NEW_ITEM_SOURCING.`,
    parsedCreatedAt,
    parsedNeedByDate,
  };
}
