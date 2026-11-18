import { connectToDatabase } from "@/lib/db";
import { Item } from "@/models/Item";
import { loadMasterDataFromFiles } from "../decision-engine/utils/masterDataLoader";

export interface ItemCandidate {
  itemCode: string;
  description: string;
  uom: string;
  category: string;
  itemType: string;
  standardPrice: number;
  confidence: number;
}

export interface ItemMatchResult {
  matchType: "EXACT" | "CANDIDATES" | "UNKNOWN" | "NONE";
  matchedItem?: ItemCandidate;
  candidates?: ItemCandidate[];
  originalDescription: string;
  confidence: number;
}

const COMMON_ITEM_ALIASES: Record<string, string[]> = {
  brg: ["bearing", "ball bearing"],
  bearing: ["ball bearing", "roller bearing"],
  gloves: ["hand gloves", "cotton hand gloves"],
  "nitrile gloves": ["cotton hand gloves"],
  "safety gloves": ["cotton hand gloves"],
  "v belt": ["v-belt"],
  "v-belt": ["v-belt b-54"],
  wire: ["mig wire"],
  "mig wire": ["mig wire er70s-6"],
  grease: ["grease ep2"],
  bolt: ["hex bolt"],
  nut: ["hex nut"],
  washer: ["spring washer", "plain washer"],
  plate: ["aluminium plate", "ms plate"],
  sheet: ["ms sheet", "ss 304 sheet"],
  bar: ["en8 round bar", "bright bar"],
};

/**
 * Calculates a token overlap similarity score between query tokens and item text.
 */
function calculateSimilarity(queryText: string, itemText: string): number {
  const cleanQ = queryText.toLowerCase().replace(/[^a-z0-9]/g, " ").trim();
  const cleanI = itemText.toLowerCase().replace(/[^a-z0-9]/g, " ").trim();

  if (cleanQ === cleanI) return 1.0;
  if (cleanI.includes(cleanQ)) return 0.9;

  const qTokens = cleanQ.split(/\s+/).filter((t) => t.length > 1);
  const iTokens = new Set(cleanI.split(/\s+/).filter((t) => t.length > 1));

  if (qTokens.length === 0) return 0;

  let matchCount = 0;
  for (const q of qTokens) {
    if (iTokens.has(q)) {
      matchCount++;
    } else {
      // Check partial token match (e.g. "6308" inside "6308-zz")
      for (const it of iTokens) {
        if (it.includes(q) || q.includes(it)) {
          matchCount += 0.7;
          break;
        }
      }
    }
  }

  return matchCount / Math.max(qTokens.length, 1);
}

/**
 * Matches requested item against MongoDB Item catalog.
 */
export async function matchItem(itemQuery: string): Promise<ItemMatchResult> {
  const query = itemQuery.trim();
  if (!query) {
    return {
      matchType: "NONE",
      originalDescription: "",
      confidence: 0,
    };
  }

  // 1. Load catalog items from MongoDB, falling back to local master data files
  let allItems: Array<{
    itemCode: string;
    description: string;
    uom: string;
    category: string;
    itemType: string;
    standardPrice: number;
  }> = [];

  try {
    await connectToDatabase();
    const dbItems = await Item.find().lean();
    if (dbItems.length > 0) {
      allItems = dbItems.map((it) => ({
        itemCode: it.itemCode,
        description: it.description,
        uom: it.uom,
        category: it.category,
        itemType: it.itemType,
        standardPrice: it.standardPrice,
      }));
    }
  } catch {
    // Fallback to local master data files
  }

  if (allItems.length === 0) {
    const md = loadMasterDataFromFiles();
    allItems = Array.from(md.itemMasterMap.values()).map((it) => ({
      itemCode: it.itemCode,
      description: it.description,
      uom: it.uom,
      category: it.category,
      itemType: it.itemType,
      standardPrice: it.standardPrice || 0,
    }));
  }

  // Check for exact Item Code (e.g. ITM-1001)
  const itemCodeMatch = query.toUpperCase().match(/\b(ITM-\d{4})\b/);
  if (itemCodeMatch) {
    const code = itemCodeMatch[1];
    const item = allItems.find((it) => it.itemCode.toUpperCase() === code);
    if (item) {
      return {
        matchType: "EXACT",
        matchedItem: {
          itemCode: item.itemCode,
          description: item.description,
          uom: item.uom,
          category: item.category,
          itemType: item.itemType,
          standardPrice: item.standardPrice,
          confidence: 1.0,
        },
        originalDescription: query,
        confidence: 1.0,
      };
    }
  }

  // 2. Candidate matching across catalog
  try {
    if (allItems.length > 0) {
      // Check aliases expansion
      let expandedQuery = query.toLowerCase();
      for (const [aliasKey, targetWords] of Object.entries(COMMON_ITEM_ALIASES)) {
        if (expandedQuery.includes(aliasKey)) {
          expandedQuery += " " + targetWords.join(" ");
        }
      }

      const scoredItems: ItemCandidate[] = allItems
        .map((it) => {
          const simDesc = calculateSimilarity(query, it.description);
          const simExp = calculateSimilarity(expandedQuery, it.description);
          const simCode = calculateSimilarity(query, it.itemCode);
          const score = Math.max(simDesc, simExp, simCode);

          return {
            itemCode: it.itemCode,
            description: it.description,
            uom: it.uom,
            category: it.category,
            itemType: it.itemType,
            standardPrice: it.standardPrice,
            confidence: Math.min(1.0, Math.round(score * 100) / 100),
          };
        })
        .filter((c) => c.confidence >= 0.45)
        .sort((a, b) => b.confidence - a.confidence);

      // Check single high confidence exact match
      if (scoredItems.length === 1 && scoredItems[0].confidence >= 0.8) {
        return {
          matchType: "EXACT",
          matchedItem: scoredItems[0],
          originalDescription: query,
          confidence: scoredItems[0].confidence,
        };
      }

      // If top candidate has decisive lead (e.g. 0.95 vs 0.5)
      if (
        scoredItems.length > 1 &&
        scoredItems[0].confidence >= 0.9 &&
        scoredItems[0].confidence - scoredItems[1].confidence > 0.25
      ) {
        return {
          matchType: "EXACT",
          matchedItem: scoredItems[0],
          originalDescription: query,
          confidence: scoredItems[0].confidence,
        };
      }

      // If multiple good matches exist, return candidates for clarification
      if (scoredItems.length > 0) {
        const topCandidates = scoredItems.slice(0, 4);
        return {
          matchType: "CANDIDATES",
          candidates: topCandidates,
          originalDescription: query,
          confidence: topCandidates[0].confidence,
        };
      }
    }
  } catch (err) {
    console.error("Item matching error:", err);
  }

  // 3. If no matching item found in catalog, treat as UNKNOWN item
  // "Support unknown/new items without inventing item codes. Preserve the original requester description."
  return {
    matchType: "UNKNOWN",
    originalDescription: query,
    confidence: 0,
  };
}

export const matchItemInCatalog = matchItem;
