import { connectToDatabase } from "@/lib/db";
import { Plant } from "@/models/Plant";

export interface PlantMatchResult {
  plantCode: string;
  plantName: string;
  confidence: number;
  matchedText?: string;
}

const KNOWN_PLANT_ALIASES: Record<string, { code: string; name: string }> = {
  pun1: { code: "PUN1", name: "Pune - Bhosari plant" },
  chk1: { code: "CHK1", name: "Chakan plant" },
  pune: { code: "PUN1", name: "Pune - Bhosari plant" },
  bhosari: { code: "PUN1", name: "Pune - Bhosari plant" },
  "bhosari plant": { code: "PUN1", name: "Pune - Bhosari plant" },
  "pune plant": { code: "PUN1", name: "Pune - Bhosari plant" },
  chakan: { code: "CHK1", name: "Chakan plant" },
  "chakan plant": { code: "CHK1", name: "Chakan plant" },
};

/**
 * Resolves a plant reference against MongoDB plant records and known aliases.
 */
export async function matchPlant(text: string): Promise<PlantMatchResult | null> {
  const normalized = text.toLowerCase();

  // 1. Check known aliases directly
  for (const [alias, target] of Object.entries(KNOWN_PLANT_ALIASES)) {
    const regex = new RegExp(`\\b${alias}\\b`, "i");
    if (regex.test(normalized)) {
      return {
        plantCode: target.code,
        plantName: target.name,
        confidence: 1.0,
        matchedText: alias,
      };
    }
  }

  // 2. Query MongoDB plants dynamically
  try {
    await connectToDatabase();
    const plants = await Plant.find().lean();

    for (const p of plants) {
      if (normalized.includes(p.plantCode.toLowerCase())) {
        return {
          plantCode: p.plantCode,
          plantName: p.plantName,
          confidence: 1.0,
          matchedText: p.plantCode,
        };
      }

      const pNameLower = p.plantName.toLowerCase();
      if (normalized.includes(pNameLower)) {
        return {
          plantCode: p.plantCode,
          plantName: p.plantName,
          confidence: 0.95,
          matchedText: p.plantName,
        };
      }
    }
  } catch (err) {
    // If DB is offline, fall back to alias results
  }

  return null;
}
