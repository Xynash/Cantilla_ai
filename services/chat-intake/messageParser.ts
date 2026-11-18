import { extractQuantity, QuantityParseResult } from "./quantityParser";
import { matchPlant, PlantMatchResult } from "./plantMatcher";
import { parseNeedByDate, DateParseResult } from "./dateParser";
import { parseUrgency, UrgencyParseResult } from "./urgencyParser";
import { matchItem, ItemMatchResult } from "./itemMatcher";

export interface ParsedIntakeMessage {
  rawText: string;
  quantityResult: QuantityParseResult;
  plantResult: PlantMatchResult | null;
  dateResult: DateParseResult;
  urgencyResult: UrgencyParseResult;
  itemResult: ItemMatchResult;
  extractedItemQuery: string;
}

/**
 * Strips conversational filler and non-item tokens to isolate the core item query.
 */
function extractItemSubstring(
  text: string,
  qtyMatched?: string,
  plantMatched?: string,
  dateMatched?: string,
  urgencyMatched?: string
): string {
  let cleaned = text;

  // Remove known non-item matches
  if (qtyMatched) {
    cleaned = cleaned.replace(new RegExp(`\\b${qtyMatched}\\b`, "gi"), " ");
  }
  if (plantMatched) {
    cleaned = cleaned.replace(new RegExp(`\\b${plantMatched}\\b`, "gi"), " ");
  }
  if (dateMatched) {
    cleaned = cleaned.replace(new RegExp(`\\b${dateMatched}\\b`, "gi"), " ");
  }
  if (urgencyMatched) {
    cleaned = cleaned.replace(new RegExp(`\\b${urgencyMatched}\\b`, "gi"), " ");
  }

  // Remove common procurement conversational filler prefixes/suffixes
  const fillerPatterns = [
    /\b(?:i\s+need|need\s+to\s+order|please\s+order|can\s+you\s+order|we\s+need|require|i\s+require|request|requesting)\b/gi,
    /\b(?:for\s+the|for|at\s+the|at|in|to)\s+(?:plant|facility|location|warehouse)?\b/gi,
    /\b(?:by|before|deliver\s+by|delivery\s+by|need\s+by|required\s+by|on)\b/gi,
    /\b(?:urgent|urgently|emergency|normal|standard)\b/gi,
    /\b(?:plant|location)\b/gi,
  ];

  for (const pat of fillerPatterns) {
    cleaned = cleaned.replace(pat, " ");
  }

  // Clean extra punctuation and spaces
  cleaned = cleaned.replace(/[,\.;:!\?]/g, " ").replace(/\s+/g, " ").trim();

  return cleaned;
}

/**
 * Main deterministic message parser
 */
export async function parseIncomingIntakeMessage(
  text: string
): Promise<ParsedIntakeMessage> {
  const trimmed = text.trim();

  // 1. Extract Quantity & Unit
  const quantityResult = extractQuantity(trimmed);

  // 2. Extract Plant
  const plantResult = await matchPlant(trimmed);

  // 3. Extract Date
  const dateResult = parseNeedByDate(trimmed);

  // 4. Extract Urgency
  const urgencyResult = parseUrgency(trimmed);

  // 5. Isolate Item Text
  const itemQuery = extractItemSubstring(
    trimmed,
    quantityResult.rawMatched,
    plantResult?.matchedText,
    dateResult.rawMatched,
    urgencyResult.rawMatched
  );

  // 6. Match Item against MongoDB Catalog
  const itemResult = await matchItem(itemQuery || trimmed);

  return {
    rawText: trimmed,
    quantityResult,
    plantResult,
    dateResult,
    urgencyResult,
    itemResult,
    extractedItemQuery: itemQuery,
  };
}
