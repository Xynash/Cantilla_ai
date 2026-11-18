import { PreferredSupplierRank } from "../types/engine";
import { PolicyPreferredSuppliersConfig } from "../types/policy";
import { PoHistoryRecord } from "../valuation/valuator";
import { ContractRecord } from "../contract-evaluation/pdfContracts";

export interface SupplierMasterRecord {
  supplierId: string;
  name: string;
  city?: string;
  categories: string;
  status: "Active" | "Inactive" | "Blocked";
  onTimePercent: number | null; // 0-100, null if missing
  qualityRating: number | null; // 0-5.0, null if missing
}

export interface SupplierSuggestionsResult {
  suggestions: string[];
  shortfallExplanation?: string;
}

/**
 * Calculates preferred supplier ranking for a specific item as of a requirement date (Policy Section 6).
 * Uses policy-configured weights and thresholds without inventing missing supplier performance data.
 */
export function calculatePreferredSuppliers(
  itemCode: string,
  asOfDate: Date,
  poHistory: PoHistoryRecord[],
  contracts: ContractRecord[],
  suppliersMap: Map<string, SupplierMasterRecord>,
  config: PolicyPreferredSuppliersConfig
): PreferredSupplierRank[] {
  const reqTime = asOfDate.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const windowMs = config.poHistoryWindowDays * dayMs; // 548 days
  const cutoffTime = reqTime - windowMs;

  const recentThresholdDays = config.recencyThresholdsDays?.recent ?? 90;
  const moderateThresholdDays = config.recencyThresholdsDays?.moderate ?? 365;
  const recentWindowMs = recentThresholdDays * dayMs;
  const moderateWindowMs = moderateThresholdDays * dayMs;
  const qualityScaleMax = config.qualityScaleMax ?? 5.0;

  // 1. Gather all suppliers that meet Eligibility Condition 6.1:
  // - Active in supplier master (Policy 6.1, 5.7)
  // AND either:
  // (a) at least one PO for the item in the 548 days before date
  // OR (b) a contract covering the item that started on or before date (even if expired)
  const candidateMap = new Map<
    string,
    {
      supplier: SupplierMasterRecord;
      pos: PoHistoryRecord[];
      latestContractRate?: number;
      latestContractStartDate?: Date;
      latestContractId?: string;
      hasContract: boolean;
      mostRecentPoDate?: Date;
      mostRecentPoPrice?: number;
      mostRecentPoNumber?: string;
    }
  >();

  // Collect PO history within configured window (548 days)
  for (const po of poHistory) {
    if (po.itemCode.toUpperCase() !== itemCode.toUpperCase()) continue;
    const t = po.poDate.getTime();
    if (t < cutoffTime || t > reqTime) continue;

    const supp = suppliersMap.get(po.supplierId.toUpperCase());
    // Exclude Blocked or Inactive suppliers (Policy 5.7, 6.1)
    if (!supp || supp.status !== "Active") continue;

    const existing = candidateMap.get(supp.supplierId) || {
      supplier: supp,
      pos: [],
      hasContract: false,
    };

    existing.pos.push(po);
    const isNewerPo =
      !existing.mostRecentPoDate ||
      t > existing.mostRecentPoDate.getTime() ||
      (t === existing.mostRecentPoDate.getTime() &&
        po.poNumber.localeCompare(existing.mostRecentPoNumber || "") > 0);

    if (isNewerPo) {
      existing.mostRecentPoDate = po.poDate;
      existing.mostRecentPoPrice = po.unitPrice;
      existing.mostRecentPoNumber = po.poNumber;
    }
    candidateMap.set(supp.supplierId, existing);
  }

  // Check Contract history started on or before asOfDate
  for (const c of contracts) {
    const startMs = c.startDate.getTime();
    if (startMs > reqTime) continue; // must start on or before requirement date

    const supp = suppliersMap.get(c.supplierId.toUpperCase());
    if (!supp || supp.status !== "Active") continue;

    const line = c.lines.find((l) => l.itemCode.toUpperCase() === itemCode.toUpperCase());
    if (!line) continue;

    const existing = candidateMap.get(supp.supplierId) || {
      supplier: supp,
      pos: [],
      hasContract: false,
    };

    existing.hasContract = true;
    const isNewerContract =
      !existing.latestContractStartDate ||
      startMs > existing.latestContractStartDate.getTime() ||
      (startMs === existing.latestContractStartDate.getTime() &&
        c.contractId.localeCompare(existing.latestContractId || "") > 0);

    if (isNewerContract) {
      existing.latestContractStartDate = c.startDate;
      existing.latestContractRate = line.rate;
      existing.latestContractId = c.contractId;
    }
    candidateMap.set(supp.supplierId, existing);
  }

  const eligibleCandidates = Array.from(candidateMap.values());
  if (eligibleCandidates.length === 0) {
    return [];
  }

  // Max PO count for frequency normalization
  const maxPoCount = Math.max(...eligibleCandidates.map((c) => c.pos.length), 1);

  // 2. Score each candidate (Policy 6.2)
  const scored = eligibleCandidates.map((cand) => {
    const supp = cand.supplier;
    const poCount = cand.pos.length;

    // Frequency Score: normalized against max PO count
    const frequencyScore = poCount / maxPoCount;

    // Recency Score (Policy-configured tiers):
    // 1.0: within recentThresholdDays (90d)
    // 0.5: within moderateThresholdDays (365d)
    // 0.0: older than 365 days (within 548d) or no PO (contract-only)
    let recencyTier = 0.0;
    if (cand.mostRecentPoDate) {
      const diffMs = reqTime - cand.mostRecentPoDate.getTime();
      if (diffMs <= recentWindowMs) {
        recencyTier = config.recencyTiers.within90Days;
      } else if (diffMs <= moderateWindowMs) {
        recencyTier = config.recencyTiers.within365Days;
      } else {
        recencyTier = config.recencyTiers.olderThan365Days;
      }
    }
    const recencyScore = recencyTier;

    // Contract History Score: 1 if held contract, else 0
    const contractScore = cand.hasContract ? 1.0 : 0.0;

    // On-Time Delivery Score: normalized to 0-1 (do not invent missing data)
    const hasValidOnTime =
      supp.onTimePercent !== null &&
      supp.onTimePercent !== undefined &&
      !Number.isNaN(supp.onTimePercent);
    const onTimeScore = hasValidOnTime
      ? Math.max(0, Math.min(1.0, (supp.onTimePercent as number) / 100))
      : 0;

    // Quality Rating Score: normalized to 0-1 (do not invent missing data)
    const hasValidQuality =
      supp.qualityRating !== null &&
      supp.qualityRating !== undefined &&
      !Number.isNaN(supp.qualityRating);
    const qualityScore = hasValidQuality
      ? Math.max(0, Math.min(1.0, (supp.qualityRating as number) / qualityScaleMax))
      : 0;

    // Weighted Combined Score
    const totalScore =
      config.weights.frequency * frequencyScore +
      config.weights.recency * recencyScore +
      config.weights.contractHistory * contractScore +
      config.weights.onTimeDelivery * onTimeScore +
      config.weights.qualityRating * qualityScore;

    // Reference Price (Policy 6.3):
    // (1) Price on supplier's most recent PO within 548 days
    // (2) Otherwise supplier's most recent contract rate for item
    let referencePrice = 0;
    let priceSource: "PO_HISTORY" | "CONTRACT_RATE" = "PO_HISTORY";
    let referencePoNumber: string | undefined;
    let referenceContractId: string | undefined;

    if (cand.mostRecentPoPrice !== undefined) {
      referencePrice = cand.mostRecentPoPrice;
      priceSource = "PO_HISTORY";
      referencePoNumber = cand.mostRecentPoNumber;
    } else if (cand.latestContractRate !== undefined) {
      referencePrice = cand.latestContractRate;
      priceSource = "CONTRACT_RATE";
      referenceContractId = cand.latestContractId;
    }

    return {
      supplierId: supp.supplierId,
      supplierName: supp.name,
      score: Math.round(totalScore * 10000) / 10000,
      scoreBreakdown: {
        frequencyScore: Math.round(frequencyScore * 100) / 100,
        recencyScore: Math.round(recencyScore * 100) / 100,
        contractScore: Math.round(contractScore * 100) / 100,
        onTimeScore: Math.round(onTimeScore * 100) / 100,
        qualityScore: Math.round(qualityScore * 100) / 100,
      },
      poCount,
      lastPurchaseDate: cand.mostRecentPoDate?.toISOString().slice(0, 10),
      recencyTier,
      hasContractHistory: cand.hasContract,
      onTimePercent: hasValidOnTime ? (supp.onTimePercent as number) : null,
      qualityRating: hasValidQuality ? (supp.qualityRating as number) : null,
      referencePrice,
      priceSource,
      referencePoNumber,
      referenceContractId,
    };
  });

  // 3. Sort by score descending with deterministic tie-breaking (Policy 6.2)
  scored.sort((a, b) => {
    // Primary: Score descending
    if (Math.abs(b.score - a.score) > 0.0001) {
      return b.score - a.score;
    }
    // Tie-break 1: On-time delivery descending (nulls last)
    const onTimeA = a.onTimePercent ?? -1;
    const onTimeB = b.onTimePercent ?? -1;
    if (onTimeB !== onTimeA) {
      return onTimeB - onTimeA;
    }
    // Tie-break 2: Quality rating descending (nulls last)
    const qualA = a.qualityRating ?? -1;
    const qualB = b.qualityRating ?? -1;
    if (qualB !== qualA) {
      return qualB - qualA;
    }
    // Tie-break 3: Supplier ID ascending
    return a.supplierId.localeCompare(b.supplierId);
  });

  return scored.map((item, index) => ({
    ...item,
    rank: index + 1,
    rankingExplanation: `Rank ${index + 1}: Score ${item.score} (Freq: ${item.poCount} POs, Recency: ${item.recencyTier}, Contract: ${item.hasContractHistory ? "Yes" : "No"}, On-Time: ${item.onTimePercent !== null ? `${item.onTimePercent}%` : "N/A"}, Quality: ${item.qualityRating !== null ? item.qualityRating : "N/A"})`,
  }));
}

/**
 * Suggests suppliers for sourcing events with shortfall explanation (Policy Section 6.4):
 * Take preferred list in order. If fewer than needed, add other Active suppliers listing item's category.
 */
export function getSupplierSuggestionsWithExplanation(
  itemCode: string,
  category: string,
  preferredList: PreferredSupplierRank[],
  suppliersMap: Map<string, SupplierMasterRecord>,
  neededCount: number,
  config?: PolicyPreferredSuppliersConfig
): SupplierSuggestionsResult {
  const suggestions: string[] = [];
  const addedSet = new Set<string>();

  // 1. Take suppliers from the preferred list in rank order
  for (const p of preferredList) {
    if (!addedSet.has(p.supplierId)) {
      suggestions.push(p.supplierId);
      addedSet.add(p.supplierId);
      if (suggestions.length === neededCount) {
        return { suggestions };
      }
    }
  }

  // 2. If fewer suppliers than needed, add other Active category suppliers (Policy 6.4)
  const normCategory = category.trim().toLowerCase();
  const itemCatTokens = normCategory.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  const onTimeWeight = config?.categoryTopUpWeights?.onTimeDelivery ?? 0.5;
  const qualityWeight = config?.categoryTopUpWeights?.qualityRating ?? 0.5;
  const qualityScaleMax = config?.qualityScaleMax ?? 5.0;

  const additionalCategorySuppliers: Array<{
    supplier: SupplierMasterRecord;
    performanceScore: number;
  }> = [];

  for (const supp of suppliersMap.values()) {
    if (addedSet.has(supp.supplierId)) continue;
    if (supp.status !== "Active") continue; // Exclude Blocked/Inactive

    const suppCategories = supp.categories.toLowerCase();
    const categoryMatches =
      suppCategories.includes(normCategory) ||
      (itemCatTokens.length > 0 && itemCatTokens.every((t) => suppCategories.includes(t)));

    if (categoryMatches) {
      const hasValidOnTime =
        supp.onTimePercent !== null &&
        supp.onTimePercent !== undefined &&
        !Number.isNaN(supp.onTimePercent);
      const hasValidQuality =
        supp.qualityRating !== null &&
        supp.qualityRating !== undefined &&
        !Number.isNaN(supp.qualityRating);

      const onTimeNorm = hasValidOnTime ? (supp.onTimePercent as number) / 100 : 0;
      const qualityNorm = hasValidQuality ? (supp.qualityRating as number) / qualityScaleMax : 0;

      const performanceScore = onTimeWeight * onTimeNorm + qualityWeight * qualityNorm;

      additionalCategorySuppliers.push({
        supplier: supp,
        performanceScore,
      });
    }
  }

  // Sort additional category suppliers by performance descending, then supplierId ascending
  additionalCategorySuppliers.sort((a, b) => {
    if (Math.abs(b.performanceScore - a.performanceScore) > 0.0001) {
      return b.performanceScore - a.performanceScore;
    }
    return a.supplier.supplierId.localeCompare(b.supplier.supplierId);
  });

  for (const add of additionalCategorySuppliers) {
    suggestions.push(add.supplier.supplierId);
    addedSet.add(add.supplier.supplierId);
    if (suggestions.length === neededCount) {
      break;
    }
  }

  const shortfallExplanation =
    suggestions.length < neededCount
      ? `Only ${suggestions.length} of ${neededCount} requested active suppliers available in preferred list and category '${category}' (blocked/inactive suppliers excluded per Policy 5.7).`
      : undefined;

  return {
    suggestions,
    shortfallExplanation,
  };
}

/**
 * Suggests supplier IDs for sourcing events (Policy Section 6.4)
 */
export function getSupplierSuggestions(
  itemCode: string,
  category: string,
  preferredList: PreferredSupplierRank[],
  suppliersMap: Map<string, SupplierMasterRecord>,
  neededCount: number,
  config?: PolicyPreferredSuppliersConfig
): string[] {
  return getSupplierSuggestionsWithExplanation(
    itemCode,
    category,
    preferredList,
    suppliersMap,
    neededCount,
    config
  ).suggestions;
}
