export type UrgencyLevel = "Normal" | "Urgent" | "Emergency";

export interface UrgencyParseResult {
  urgency?: UrgencyLevel;
  confidence: number;
  rawMatched?: string;
}

/**
 * Extracts explicitly stated urgency level from procurement chat messages.
 * Only tags Emergency or Urgent if explicitly requested as such.
 */
export function parseUrgency(text: string): UrgencyParseResult {
  const normalized = text.toLowerCase();

  // 1. Explicit Emergency
  if (/\b(?:emergency|critical\s+breakdown|line\s+stoppage|plant\s+shutdown|sos)\b/i.test(normalized)) {
    return {
      urgency: "Emergency",
      confidence: 1.0,
      rawMatched: "emergency",
    };
  }

  // 2. Explicit Urgent
  if (/\b(?:urgent|urgently|high\s+priority|immediate|rush|expedite)\b/i.test(normalized)) {
    return {
      urgency: "Urgent",
      confidence: 0.95,
      rawMatched: "urgent",
    };
  }

  // 3. Explicit Normal / Standard
  if (/\b(?:normal|standard|routine|regular|medium|low)\b/i.test(normalized)) {
    return {
      urgency: "Normal",
      confidence: 1.0,
      rawMatched: "normal",
    };
  }

  return { confidence: 0 };
}
