import { connectToDatabase } from "@/lib/db";
import {
  getFallbackSupplierOverrides,
  getFallbackAuditLogs,
  FallbackAuditLogRecord,
} from "@/lib/db/fallbackStore";
import { Supplier } from "@/models/Supplier";
import { AuditLog } from "@/models/AuditLog";
import { PreferredSupplierRank } from "../types/engine";
import { StructuredPolicyConfig } from "../types/policy";
import { getPolicyConfig } from "../policy-config/policyService";
import { loadMasterDataContext } from "../utils/masterDataLoader";
import {
  SupplierMasterRecord,
  calculatePreferredSuppliers,
  getSupplierSuggestionsWithExplanation,
} from "./preferredSupplierEngine";
import { PoHistoryRecord } from "../valuation/valuator";
import { ContractRecord } from "../contract-evaluation/pdfContracts";
import { SafeUser } from "@/types/auth";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";

// Default reference date matching the task kit evaluation window (Nov 2026)
export const DEFAULT_INTELLIGENCE_REFERENCE_DATE = new Date("2026-11-30T23:59:59.999Z");

export interface SupplierEligibilityResult {
  supplierId: string;
  supplierName: string;
  status: "Active" | "Inactive" | "Blocked";
  isActive: boolean;
  isBlocked: boolean;
  isInactive: boolean;
  itemCode?: string;
  category?: string;
  asOfDate: string;
  lookbackWindowDays: number;
  poCountInWindow: number;
  poCountIn365Days: number;
  mostRecentPoDate: string | null;
  daysSinceLastPurchase: number | null;
  hasHistoricalContract: boolean;
  historicalContractIds: string[];
  hasCurrentValidContract: boolean;
  currentValidContractIds: string[];
  categoryCompatible: boolean;
  isPreferredEligible: boolean;
  isDirectPoEligible365d: boolean;
  isContractPoEligible: boolean;
  isCategoryTopUpEligible: boolean;
  eligibilityStatus:
    | "ELIGIBLE_PREFERRED"
    | "ELIGIBLE_CATEGORY_TOP_UP"
    | "EXCLUDED_BLOCKED"
    | "EXCLUDED_INACTIVE"
    | "EXCLUDED_NO_HISTORY_OR_CONTRACT";
  reasons: string[];
  summaryExplanation: string;
}

export interface SupplierReferencePriceResult {
  supplierId: string;
  supplierName: string;
  itemCode: string;
  asOfDate: string;
  lookbackWindowDays: number;
  currency: "INR";
  referencePrice: number | null;
  priceSource: "PO_HISTORY_548D" | "CONTRACT_RATE" | "UNAVAILABLE";
  referencePoNumber?: string;
  referencePoDate?: string;
  referenceContractId?: string;
  referenceContractStartDate?: string;
  explanation: string;
}

export interface SupplierPerformanceSummary {
  supplierId: string;
  supplierName: string;
  status: "Active" | "Inactive" | "Blocked";
  totalHistoricalPos: number;
  poCountIn548d: number;
  poCountIn365d: number;
  totalHistoricalSpendInr: number;
  distinctItemsSupplied: string[];
  plantsServed: string[];
  mostRecentPoDate: string | null;
  mostRecentPoNumber: string | null;
  daysSinceLastPurchase: number | null;
  recencyScore: number;
  contractSummary: {
    totalContracts: number;
    currentValidContracts: number;
    expiredContracts: number;
    exhaustedContracts: number;
    contractIds: string[];
  };
  deliveryPerformance: {
    available: boolean;
    onTimePercent: number | null;
    displayLabel: string;
    historicalOnTimePoCount: number;
    historicalLatePoCount: number;
    normalizedScore: number;
  };
  qualityPerformance: {
    available: boolean;
    qualityRating: number | null;
    scaleMax: number;
    displayLabel: string;
    normalizedScore: number;
  };
  requiresAdditionalEvaluation: boolean;
  evaluationFlags: string[];
}

export interface SupplierRecommendationItem {
  rank: number;
  supplierId: string;
  supplierName: string;
  city?: string;
  status: "Active" | "Inactive" | "Blocked";
  recommendationType: "PREFERRED_RANKED" | "CATEGORY_TOP_UP";
  totalScore: number;
  scoreBreakdown: {
    frequencyScore: number;
    recencyScore: number;
    contractScore: number;
    onTimeScore: number;
    qualityScore: number;
  };
  poCountIn548d: number;
  lastPurchaseDate: string | null;
  referencePrice: number | null;
  referencePriceSource: "PO_HISTORY_548D" | "CONTRACT_RATE" | "UNAVAILABLE";
  referencePriceExplanation: string;
  hasHistoricalContract: boolean;
  hasCurrentValidContract: boolean;
  relevantContractIds: string[];
  deliveryPerformanceAvailable: boolean;
  onTimePercent: number | null;
  qualityPerformanceAvailable: boolean;
  qualityRating: number | null;
  eligibilityExplanation: string;
  recommendationExplanation: string;
}

export interface ItemSupplierRecommendationResponse {
  itemCode: string;
  itemDescription: string;
  category: string;
  plantCode?: string;
  asOfDate: string;
  policyVersion: string;
  routeType: "DIRECT_PO" | "RFQ" | "RFP" | "CAPEX";
  requestedSupplierCount: number;
  recommendedSuppliers: SupplierRecommendationItem[];
  allPreferredRanked: PreferredSupplierRank[];
  excludedSuppliers: Array<{
    supplierId: string;
    supplierName: string;
    status: string;
    reason: string;
  }>;
  shortfallExplanation?: string;
}

/**
 * 1. Centralized Supplier Eligibility Engine (Policy Clauses 4.1, 4.2, 5.7, 6.1, 6.4)
 */
export function evaluateSupplierEligibility(params: {
  supplier: SupplierMasterRecord;
  itemCode?: string;
  itemCategory?: string;
  asOfDate: Date;
  poHistory: PoHistoryRecord[];
  contracts: ContractRecord[];
  policy: StructuredPolicyConfig;
}): SupplierEligibilityResult {
  const { supplier, itemCode, itemCategory, asOfDate, poHistory, contracts, policy } = params;
  const reqTime = asOfDate.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const lookbackDays = policy.preferredSuppliers.poHistoryWindowDays || 548;
  const activeLookbackDays = policy.preferredSuppliers.activeLookbackDays || 365;
  const cutoff548 = reqTime - lookbackDays * dayMs;
  const cutoff365 = reqTime - activeLookbackDays * dayMs;

  const isActive = supplier.status === "Active";
  const isBlocked = supplier.status === "Blocked";
  const isInactive = supplier.status === "Inactive";

  // Filter relevant POs up to asOfDate (never use future POs)
  const matchingPos = poHistory
    .filter((po) => {
      if (po.supplierId.toUpperCase() !== supplier.supplierId.toUpperCase()) return false;
      if (itemCode && po.itemCode.toUpperCase() !== itemCode.toUpperCase()) return false;
      const t = po.poDate.getTime();
      return t <= reqTime;
    })
    .sort((a, b) => b.poDate.getTime() - a.poDate.getTime() || b.poNumber.localeCompare(a.poNumber));

  const posIn548d = matchingPos.filter((po) => po.poDate.getTime() >= cutoff548);
  const posIn365d = matchingPos.filter((po) => po.poDate.getTime() >= cutoff365);

  const mostRecentPo = posIn548d[0] || matchingPos[0] || null;
  const mostRecentPoDate = mostRecentPo ? mostRecentPo.poDate.toISOString().slice(0, 10) : null;
  const daysSinceLastPurchase = mostRecentPo
    ? Math.max(0, Math.floor((reqTime - mostRecentPo.poDate.getTime()) / dayMs))
    : null;

  // Evaluate Contracts: distinguish historical contracts (Clause 6.1) from currently valid contracts (Clause 4.1-4.2)
  const historicalContractIds: string[] = [];
  const currentValidContractIds: string[] = [];

  for (const c of contracts) {
    if (c.supplierId.toUpperCase() !== supplier.supplierId.toUpperCase()) continue;
    if (itemCode) {
      const coversItem = c.lines.some((l) => l.itemCode.toUpperCase() === itemCode.toUpperCase());
      if (!coversItem) continue;
    }

    const startMs = c.startDate.getTime();
    const endMs = c.endDate.getTime();

    if (startMs <= reqTime) {
      historicalContractIds.push(c.contractId);
      const isDateValid = reqTime >= startMs && reqTime <= endMs;
      const hasCeilingLeft = c.consumedValue < c.valueCap;
      if (isActive && isDateValid && hasCeilingLeft) {
        currentValidContractIds.push(c.contractId);
      }
    }
  }

  const hasHistoricalContract = historicalContractIds.length > 0;
  const hasCurrentValidContract = currentValidContractIds.length > 0;

  // Category compatibility check
  let categoryCompatible = true;
  if (itemCategory) {
    const normCat = itemCategory.trim().toLowerCase();
    const tokens = normCat.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
    const suppCats = supplier.categories.toLowerCase();
    categoryCompatible =
      suppCats.includes(normCat) ||
      (tokens.length > 0 && tokens.every((t) => suppCats.includes(t)));
  }

  const reasons: string[] = [];
  let eligibilityStatus: SupplierEligibilityResult["eligibilityStatus"];

  if (isBlocked) {
    eligibilityStatus = "EXCLUDED_BLOCKED";
    reasons.push(
      `Excluded per Policy Clause 5.7: Supplier ${supplier.supplierId} (${supplier.name}) is Blocked and must never receive a PO or sourcing recommendation.`
    );
  } else if (isInactive) {
    eligibilityStatus = "EXCLUDED_INACTIVE";
    reasons.push(
      `Excluded per Policy Clauses 5.7 & 6.1: Supplier ${supplier.supplierId} (${supplier.name}) is Inactive in the supplier master.`
    );
  } else if (posIn548d.length > 0 || hasHistoricalContract) {
    eligibilityStatus = "ELIGIBLE_PREFERRED";
    const parts: string[] = [];
    if (posIn548d.length > 0) {
      parts.push(`${posIn548d.length} PO(s) within the ${lookbackDays}-day lookback window`);
    }
    if (hasHistoricalContract) {
      parts.push(
        `contract history (${historicalContractIds.join(", ")}${
          hasCurrentValidContract ? " — currently valid" : " — historical/expired"
        })`
      );
    }
    reasons.push(
      `Eligible for Preferred Supplier List (Clause 6.1): Active status with ${parts.join(" and ")}.`
    );
  } else if (categoryCompatible) {
    eligibilityStatus = "ELIGIBLE_CATEGORY_TOP_UP";
    reasons.push(
      `Eligible for Category Top-Up only (Clause 6.4): Active supplier in category '${
        itemCategory || supplier.categories
      }', but has 0 POs in the ${lookbackDays}-day window and no prior contract.`
    );
  } else {
    eligibilityStatus = "EXCLUDED_NO_HISTORY_OR_CONTRACT";
    reasons.push(
      `Not eligible: No PO history within ${lookbackDays} days, no prior contract, and category '${supplier.categories}' does not match requested scope.`
    );
  }

  return {
    supplierId: supplier.supplierId,
    supplierName: supplier.name,
    status: supplier.status,
    isActive,
    isBlocked,
    isInactive,
    itemCode,
    category: itemCategory || supplier.categories,
    asOfDate: asOfDate.toISOString().slice(0, 10),
    lookbackWindowDays: lookbackDays,
    poCountInWindow: posIn548d.length,
    poCountIn365Days: posIn365d.length,
    mostRecentPoDate,
    daysSinceLastPurchase,
    hasHistoricalContract,
    historicalContractIds,
    hasCurrentValidContract,
    currentValidContractIds,
    categoryCompatible,
    isPreferredEligible: eligibilityStatus === "ELIGIBLE_PREFERRED",
    isDirectPoEligible365d: isActive && posIn365d.length > 0,
    isContractPoEligible: isActive && hasCurrentValidContract,
    isCategoryTopUpEligible:
      isActive &&
      (eligibilityStatus === "ELIGIBLE_PREFERRED" ||
        eligibilityStatus === "ELIGIBLE_CATEGORY_TOP_UP"),
    eligibilityStatus,
    reasons,
    summaryExplanation: reasons.join(" "),
  };
}

/**
 * 2. Historical Performance Analysis (Section 3 — never fabricates missing OTD or quality metrics)
 */
export function analyzeSupplierPerformance(params: {
  supplier: SupplierMasterRecord;
  asOfDate: Date;
  poHistory: PoHistoryRecord[];
  contracts: ContractRecord[];
  policy: StructuredPolicyConfig;
}): SupplierPerformanceSummary {
  const { supplier, asOfDate, poHistory, contracts, policy } = params;
  const reqTime = asOfDate.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const cutoff548 = reqTime - (policy.preferredSuppliers.poHistoryWindowDays || 548) * dayMs;
  const cutoff365 = reqTime - (policy.preferredSuppliers.activeLookbackDays || 365) * dayMs;
  const recentWindowMs = (policy.preferredSuppliers.recencyThresholdsDays?.recent ?? 90) * dayMs;
  const moderateWindowMs =
    (policy.preferredSuppliers.recencyThresholdsDays?.moderate ?? 365) * dayMs;
  const qualityScaleMax = policy.preferredSuppliers.qualityScaleMax ?? 5.0;

  const supplierPos = poHistory
    .filter(
      (po) =>
        po.supplierId.toUpperCase() === supplier.supplierId.toUpperCase() &&
        po.poDate.getTime() <= reqTime
    )
    .sort((a, b) => b.poDate.getTime() - a.poDate.getTime() || b.poNumber.localeCompare(a.poNumber));

  const posIn548d = supplierPos.filter((po) => po.poDate.getTime() >= cutoff548);
  const posIn365d = supplierPos.filter((po) => po.poDate.getTime() >= cutoff365);

  const totalHistoricalSpendInr = supplierPos.reduce(
    (sum, po) => sum + po.quantity * po.unitPrice,
    0
  );
  const distinctItemsSupplied = Array.from(new Set(supplierPos.map((po) => po.itemCode))).sort();
  const plantsServed = Array.from(new Set(supplierPos.map((po) => po.plant))).sort();

  const mostRecentPo = posIn548d[0] || supplierPos[0] || null;
  const mostRecentPoDate = mostRecentPo ? mostRecentPo.poDate.toISOString().slice(0, 10) : null;
  const mostRecentPoNumber = mostRecentPo ? mostRecentPo.poNumber : null;
  const daysSinceLastPurchase = mostRecentPo
    ? Math.max(0, Math.floor((reqTime - mostRecentPo.poDate.getTime()) / dayMs))
    : null;

  let recencyScore = 0.0;
  if (posIn548d.length > 0 && mostRecentPo) {
    const diffMs = reqTime - mostRecentPo.poDate.getTime();
    if (diffMs <= recentWindowMs) {
      recencyScore = policy.preferredSuppliers.recencyTiers.within90Days;
    } else if (diffMs <= moderateWindowMs) {
      recencyScore = policy.preferredSuppliers.recencyTiers.within365Days;
    } else {
      recencyScore = policy.preferredSuppliers.recencyTiers.olderThan365Days;
    }
  }

  // Contracts analysis
  const suppContracts = contracts.filter(
    (c) =>
      c.supplierId.toUpperCase() === supplier.supplierId.toUpperCase() &&
      c.startDate.getTime() <= reqTime
  );
  let currentValidContracts = 0;
  let expiredContracts = 0;
  let exhaustedContracts = 0;

  for (const c of suppContracts) {
    if (c.endDate.getTime() < reqTime) {
      expiredContracts++;
    } else if (c.consumedValue >= c.valueCap) {
      exhaustedContracts++;
    } else {
      currentValidContracts++;
    }
  }

  // Delivery & Quality performance — never fabricate missing values
  const hasOnTime =
    supplier.onTimePercent !== null &&
    supplier.onTimePercent !== undefined &&
    !Number.isNaN(supplier.onTimePercent);
  const hasQuality =
    supplier.qualityRating !== null &&
    supplier.qualityRating !== undefined &&
    !Number.isNaN(supplier.qualityRating);

  const historicalOnTimePoCount = supplierPos.filter((p) => p.deliveredOnTime).length;
  const historicalLatePoCount = supplierPos.length - historicalOnTimePoCount;

  const evaluationFlags: string[] = [];
  if (!hasOnTime) {
    evaluationFlags.push("On-time delivery metric Not Available in supplier master");
  }
  if (!hasQuality) {
    evaluationFlags.push("Quality rating Not Available in supplier master");
  }
  if (posIn548d.length === 0 && suppContracts.length === 0) {
    evaluationFlags.push("No purchase history in 548 days and no contract history");
  }

  return {
    supplierId: supplier.supplierId,
    supplierName: supplier.name,
    status: supplier.status,
    totalHistoricalPos: supplierPos.length,
    poCountIn548d: posIn548d.length,
    poCountIn365d: posIn365d.length,
    totalHistoricalSpendInr: Math.round(totalHistoricalSpendInr * 100) / 100,
    distinctItemsSupplied,
    plantsServed,
    mostRecentPoDate,
    mostRecentPoNumber,
    daysSinceLastPurchase,
    recencyScore,
    contractSummary: {
      totalContracts: suppContracts.length,
      currentValidContracts,
      expiredContracts,
      exhaustedContracts,
      contractIds: suppContracts.map((c) => c.contractId),
    },
    deliveryPerformance: {
      available: hasOnTime,
      onTimePercent: hasOnTime ? supplier.onTimePercent : null,
      displayLabel: hasOnTime ? `${supplier.onTimePercent}%` : "Not Available",
      historicalOnTimePoCount,
      historicalLatePoCount,
      normalizedScore: hasOnTime
        ? Math.round(((supplier.onTimePercent as number) / 100) * 10000) / 10000
        : 0,
    },
    qualityPerformance: {
      available: hasQuality,
      qualityRating: hasQuality ? supplier.qualityRating : null,
      scaleMax: qualityScaleMax,
      displayLabel: hasQuality ? `${supplier.qualityRating} / ${qualityScaleMax}` : "Not Available",
      normalizedScore: hasQuality
        ? Math.round(((supplier.qualityRating as number) / qualityScaleMax) * 10000) / 10000
        : 0,
    },
    requiresAdditionalEvaluation: evaluationFlags.length > 0,
    evaluationFlags,
  };
}

/**
 * 3. Dedicated Reference Price Engine (Policy Clause 6.3)
 * - Uses latest PO price for (supplierId, itemCode) within 548-day lookback window up to asOfDate.
 * - Otherwise uses latest contract rate for (supplierId, itemCode) started on or before asOfDate.
 * - Strictly ignores future POs (poDate > asOfDate).
 * - Never fabricates prices or substitutes unrelated item prices.
 */
export function calculateSupplierReferencePrice(params: {
  supplierId: string;
  itemCode: string;
  asOfDate: Date;
  poHistory: PoHistoryRecord[];
  contracts: ContractRecord[];
  suppliersMap: Map<string, SupplierMasterRecord>;
  lookbackWindowDays?: number;
}): SupplierReferencePriceResult {
  const {
    supplierId,
    itemCode,
    asOfDate,
    poHistory,
    contracts,
    suppliersMap,
    lookbackWindowDays = 548,
  } = params;

  const normSuppId = supplierId.trim().toUpperCase();
  const normItemCode = itemCode.trim().toUpperCase();
  const supp = suppliersMap.get(normSuppId);
  const supplierName = supp?.name || normSuppId;

  const reqTime = asOfDate.getTime();
  const cutoffTime = reqTime - lookbackWindowDays * 24 * 60 * 60 * 1000;

  // 1. Check PO history in [cutoffTime, reqTime] (ignore future records > reqTime)
  const eligiblePos = poHistory
    .filter((po) => {
      if (po.supplierId.toUpperCase() !== normSuppId) return false;
      if (po.itemCode.toUpperCase() !== normItemCode) return false;
      const t = po.poDate.getTime();
      return t >= cutoffTime && t <= reqTime;
    })
    .sort((a, b) => {
      const diff = b.poDate.getTime() - a.poDate.getTime();
      if (diff !== 0) return diff;
      return b.poNumber.localeCompare(a.poNumber);
    });

  if (eligiblePos.length > 0) {
    const latestPo = eligiblePos[0];
    const poDateStr = latestPo.poDate.toISOString().slice(0, 10);
    return {
      supplierId: normSuppId,
      supplierName,
      itemCode: normItemCode,
      asOfDate: asOfDate.toISOString().slice(0, 10),
      lookbackWindowDays,
      currency: "INR",
      referencePrice: Math.round(latestPo.unitPrice * 100) / 100,
      priceSource: "PO_HISTORY_548D",
      referencePoNumber: latestPo.poNumber,
      referencePoDate: poDateStr,
      explanation: `Reference price ₹${latestPo.unitPrice.toLocaleString("en-IN")} derived from most recent eligible PO ${latestPo.poNumber} on ${poDateStr} within the ${lookbackWindowDays}-day lookback window (Clause 6.3).`,
    };
  }

  // 2. Check contracts covering itemCode started on or before asOfDate
  const eligibleContracts: Array<{
    contractId: string;
    startDate: Date;
    rate: number;
  }> = [];

  for (const c of contracts) {
    if (c.supplierId.toUpperCase() !== normSuppId) continue;
    if (c.startDate.getTime() > reqTime) continue;
    const line = c.lines.find((l) => l.itemCode.toUpperCase() === normItemCode);
    if (line) {
      eligibleContracts.push({
        contractId: c.contractId,
        startDate: c.startDate,
        rate: line.rate,
      });
    }
  }

  eligibleContracts.sort((a, b) => {
    const diff = b.startDate.getTime() - a.startDate.getTime();
    if (diff !== 0) return diff;
    return b.contractId.localeCompare(a.contractId);
  });

  if (eligibleContracts.length > 0) {
    const latestContract = eligibleContracts[0];
    const startDateStr = latestContract.startDate.toISOString().slice(0, 10);
    return {
      supplierId: normSuppId,
      supplierName,
      itemCode: normItemCode,
      asOfDate: asOfDate.toISOString().slice(0, 10),
      lookbackWindowDays,
      currency: "INR",
      referencePrice: Math.round(latestContract.rate * 100) / 100,
      priceSource: "CONTRACT_RATE",
      referenceContractId: latestContract.contractId,
      referenceContractStartDate: startDateStr,
      explanation: `No PO in the ${lookbackWindowDays}-day window; reference price ₹${latestContract.rate.toLocaleString("en-IN")} derived from most recent contract ${latestContract.contractId} (effective ${startDateStr}) covering ${normItemCode} (Clause 6.3).`,
    };
  }

  // 3. No reference price available
  return {
    supplierId: normSuppId,
    supplierName,
    itemCode: normItemCode,
    asOfDate: asOfDate.toISOString().slice(0, 10),
    lookbackWindowDays,
    currency: "INR",
    referencePrice: null,
    priceSource: "UNAVAILABLE",
    explanation: `No reference price available: Supplier ${normSuppId} (${supplierName}) has no PO in the ${lookbackWindowDays}-day lookback window and no contract covering ${normItemCode} on or before ${asOfDate.toISOString().slice(0, 10)}.`,
  };
}

/**
 * 4. Reusable Supplier Recommendation Service (Section 6)
 */
export async function getSupplierRecommendationsForItem(params: {
  itemCode: string;
  plantCode?: string;
  asOfDate?: Date;
  policyVersion?: string;
  routeType?: "DIRECT_PO" | "RFQ" | "RFP" | "CAPEX";
}): Promise<ItemSupplierRecommendationResponse> {
  const normItemCode = params.itemCode.trim().toUpperCase();
  const asOfDate = params.asOfDate || DEFAULT_INTELLIGENCE_REFERENCE_DATE;
  const routeType = params.routeType || "RFQ";
  const policy = await getPolicyConfig(params.policyVersion);
  const masterData = await loadMasterDataContext([normItemCode]);

  const itemRecord = masterData.itemMasterMap.get(normItemCode);
  if (!itemRecord) {
    throw new NotFoundError(`Item '${normItemCode}' not found in Item Master.`);
  }

  const requestedSupplierCount =
    routeType === "DIRECT_PO" ? 1 : routeType === "RFP" || routeType === "CAPEX" ? 5 : 3;

  const itemPos = masterData.poHistoryByItem?.get(normItemCode) || [];

  // 1. Calculate ranked preferred suppliers via Phase 4B engine
  const preferredRanked = calculatePreferredSuppliers(
    normItemCode,
    asOfDate,
    itemPos,
    masterData.contracts,
    masterData.suppliersMap,
    policy.preferredSuppliers
  );

  // 2. Get full sourcing suggestions (including category top-up if needed)
  const suggestionResult = getSupplierSuggestionsWithExplanation(
    normItemCode,
    itemRecord.category,
    preferredRanked,
    masterData.suppliersMap,
    requestedSupplierCount,
    policy.preferredSuppliers
  );

  const recommendedIds =
    routeType === "DIRECT_PO"
      ? preferredRanked.slice(0, 1).map((p) => p.supplierId)
      : suggestionResult.suggestions;

  const preferredById = new Map<string, PreferredSupplierRank>();
  for (const p of preferredRanked) {
    preferredById.set(p.supplierId, p);
  }

  const recommendedSuppliers: SupplierRecommendationItem[] = recommendedIds.map(
    (suppId, idx) => {
      const supp = masterData.suppliersMap.get(suppId)!;
      const pref = preferredById.get(suppId);
      const elig = evaluateSupplierEligibility({
        supplier: supp,
        itemCode: normItemCode,
        itemCategory: itemRecord.category,
        asOfDate,
        poHistory: itemPos,
        contracts: masterData.contracts,
        policy,
      });
      const refPrice = calculateSupplierReferencePrice({
        supplierId: suppId,
        itemCode: normItemCode,
        asOfDate,
        poHistory: itemPos,
        contracts: masterData.contracts,
        suppliersMap: masterData.suppliersMap,
        lookbackWindowDays: policy.preferredSuppliers.poHistoryWindowDays,
      });

      const hasOnTime = supp.onTimePercent !== null && supp.onTimePercent !== undefined;
      const hasQuality = supp.qualityRating !== null && supp.qualityRating !== undefined;

      if (pref) {
        return {
          rank: idx + 1,
          supplierId: supp.supplierId,
          supplierName: supp.name,
          city: supp.city,
          status: supp.status,
          recommendationType: "PREFERRED_RANKED",
          totalScore: pref.score,
          scoreBreakdown: pref.scoreBreakdown!,
          poCountIn548d: pref.poCount,
          lastPurchaseDate: pref.lastPurchaseDate || null,
          referencePrice: refPrice.referencePrice,
          referencePriceSource: refPrice.priceSource,
          referencePriceExplanation: refPrice.explanation,
          hasHistoricalContract: elig.hasHistoricalContract,
          hasCurrentValidContract: elig.hasCurrentValidContract,
          relevantContractIds: elig.historicalContractIds,
          deliveryPerformanceAvailable: hasOnTime,
          onTimePercent: supp.onTimePercent,
          qualityPerformanceAvailable: hasQuality,
          qualityRating: supp.qualityRating,
          eligibilityExplanation: elig.summaryExplanation,
          recommendationExplanation:
            pref.rankingExplanation ||
            `Ranked #${idx + 1} on Preferred Supplier List with weighted score ${pref.score}.`,
        };
      }

      // Category Top-Up Supplier (Clause 6.4)
      const onTimeNorm = hasOnTime ? (supp.onTimePercent as number) / 100 : 0;
      const qualNorm = hasQuality ? (supp.qualityRating as number) / 5.0 : 0;
      const topUpScore = Math.round((0.5 * onTimeNorm + 0.5 * qualNorm) * 10000) / 10000;

      return {
        rank: idx + 1,
        supplierId: supp.supplierId,
        supplierName: supp.name,
        city: supp.city,
        status: supp.status,
        recommendationType: "CATEGORY_TOP_UP",
        totalScore: topUpScore,
        scoreBreakdown: {
          frequencyScore: 0,
          recencyScore: 0,
          contractScore: 0,
          onTimeScore: Math.round(onTimeNorm * 100) / 100,
          qualityScore: Math.round(qualNorm * 100) / 100,
        },
        poCountIn548d: 0,
        lastPurchaseDate: null,
        referencePrice: refPrice.referencePrice,
        referencePriceSource: refPrice.priceSource,
        referencePriceExplanation: refPrice.explanation,
        hasHistoricalContract: false,
        hasCurrentValidContract: false,
        relevantContractIds: [],
        deliveryPerformanceAvailable: hasOnTime,
        onTimePercent: supp.onTimePercent,
        qualityPerformanceAvailable: hasQuality,
        qualityRating: supp.qualityRating,
        eligibilityExplanation: elig.summaryExplanation,
        recommendationExplanation: `Added as Category Top-Up #${idx + 1} (Clause 6.4) for category '${itemRecord.category}' based on delivery (${hasOnTime ? `${supp.onTimePercent}%` : "N/A"}) and quality (${hasQuality ? supp.qualityRating : "N/A"}) score ${topUpScore}.`,
      };
    }
  );

  // Identify excluded suppliers that had prior POs/contracts or matching category but are Blocked/Inactive
  const excludedSuppliers: ItemSupplierRecommendationResponse["excludedSuppliers"] = [];
  for (const supp of masterData.suppliersMap.values()) {
    if (supp.status !== "Active") {
      const hadPo = itemPos.some(
        (p) => p.supplierId.toUpperCase() === supp.supplierId.toUpperCase()
      );
      const hadContract = masterData.contracts.some(
        (c) =>
          c.supplierId.toUpperCase() === supp.supplierId.toUpperCase() &&
          c.lines.some((l) => l.itemCode.toUpperCase() === normItemCode)
      );
      const catMatch = supp.categories
        .toLowerCase()
        .includes(itemRecord.category.toLowerCase());

      if (hadPo || hadContract || catMatch) {
        excludedSuppliers.push({
          supplierId: supp.supplierId,
          supplierName: supp.name,
          status: supp.status,
          reason: `Excluded per Policy Clause 5.7: Supplier status is '${supp.status}' (${
            hadPo ? "had historical POs for this item" : "listed in item category"
          }).`,
        });
      }
    }
  }

  return {
    itemCode: normItemCode,
    itemDescription: itemRecord.description,
    category: itemRecord.category,
    plantCode: params.plantCode,
    asOfDate: asOfDate.toISOString().slice(0, 10),
    policyVersion: policy.version,
    routeType,
    requestedSupplierCount,
    recommendedSuppliers,
    allPreferredRanked: preferredRanked,
    excludedSuppliers,
    shortfallExplanation: suggestionResult.shortfallExplanation,
  };
}

/**
 * 5. Supplier Intelligence Overview Dashboard Service (Section 1)
 */
export async function getSupplierIntelligenceOverview(params?: {
  asOfDate?: Date;
  policyVersion?: string;
}) {
  const asOfDate = params?.asOfDate || DEFAULT_INTELLIGENCE_REFERENCE_DATE;
  const policy = await getPolicyConfig(params?.policyVersion);
  const masterData = await loadMasterDataContext();

  const allSuppliers = Array.from(masterData.suppliersMap.values()).sort((a, b) =>
    a.supplierId.localeCompare(b.supplierId)
  );

  let activeCount = 0;
  let eligiblePreferredCount = 0;
  let blockedCount = 0;
  let inactiveCount = 0;
  let recentPoHistoryCount = 0;
  let completePerformanceDataCount = 0;
  let requiringEvaluationCount = 0;

  const categoryBreakdownMap = new Map<
    string,
    { category: string; totalSuppliers: number; activeSuppliers: number }
  >();

  const enrichedSuppliers = allSuppliers.map((supp) => {
    const elig = evaluateSupplierEligibility({
      supplier: supp,
      asOfDate,
      poHistory: masterData.poHistory,
      contracts: masterData.contracts,
      policy,
    });

    const perf = analyzeSupplierPerformance({
      supplier: supp,
      asOfDate,
      poHistory: masterData.poHistory,
      contracts: masterData.contracts,
      policy,
    });

    if (supp.status === "Active") activeCount++;
    if (supp.status === "Blocked") blockedCount++;
    if (supp.status === "Inactive") inactiveCount++;
    if (elig.isPreferredEligible) eligiblePreferredCount++;
    if (perf.poCountIn548d > 0) recentPoHistoryCount++;
    if (perf.deliveryPerformance.available && perf.qualityPerformance.available) {
      completePerformanceDataCount++;
    }
    if (perf.requiresAdditionalEvaluation) {
      requiringEvaluationCount++;
    }

    const cats = supp.categories
      .split(/[;,]/)
      .map((c) => c.trim())
      .filter(Boolean);
    for (const c of cats) {
      const existing = categoryBreakdownMap.get(c) || {
        category: c,
        totalSuppliers: 0,
        activeSuppliers: 0,
      };
      existing.totalSuppliers++;
      if (supp.status === "Active") existing.activeSuppliers++;
      categoryBreakdownMap.set(c, existing);
    }

    return {
      supplierId: supp.supplierId,
      supplierName: supp.name,
      city: supp.city || "",
      categories: cats,
      categoriesRaw: supp.categories,
      status: supp.status,
      isPreferredEligible: elig.isPreferredEligible,
      eligibilityStatus: elig.eligibilityStatus,
      eligibilityReason: elig.summaryExplanation,
      poCountIn548d: perf.poCountIn548d,
      poCountIn365d: perf.poCountIn365d,
      totalHistoricalPos: perf.totalHistoricalPos,
      totalSpendInr: perf.totalHistoricalSpendInr,
      mostRecentPoDate: perf.mostRecentPoDate,
      hasHistoricalContract: elig.hasHistoricalContract,
      hasCurrentValidContract: elig.hasCurrentValidContract,
      contractIds: elig.historicalContractIds,
      onTimePercent: perf.deliveryPerformance.onTimePercent,
      onTimeDisplay: perf.deliveryPerformance.displayLabel,
      qualityRating: perf.qualityPerformance.qualityRating,
      qualityDisplay: perf.qualityPerformance.displayLabel,
      requiresAdditionalEvaluation: perf.requiresAdditionalEvaluation,
      evaluationFlags: perf.evaluationFlags,
    };
  });

  // Recent supplier PO activity (latest 8 POs up to asOfDate)
  const recentActivity = [...masterData.poHistory]
    .filter((po) => po.poDate.getTime() <= asOfDate.getTime())
    .sort((a, b) => b.poDate.getTime() - a.poDate.getTime() || b.poNumber.localeCompare(a.poNumber))
    .slice(0, 8)
    .map((po) => {
      const supp = masterData.suppliersMap.get(po.supplierId);
      const item = masterData.itemMasterMap.get(po.itemCode);
      return {
        poNumber: po.poNumber,
        poDate: po.poDate.toISOString().slice(0, 10),
        supplierId: po.supplierId,
        supplierName: supp?.name || po.supplierId,
        itemCode: po.itemCode,
        itemDescription: item?.description || po.itemCode,
        quantity: po.quantity,
        uom: po.uom,
        unitPrice: po.unitPrice,
        totalValueInr: Math.round(po.quantity * po.unitPrice * 100) / 100,
        plant: po.plant,
        deliveredOnTime: po.deliveredOnTime,
      };
    });

  // Performance distribution tiers
  const performanceDistribution = {
    highPerformers: enrichedSuppliers.filter(
      (s) =>
        s.status === "Active" &&
        s.onTimePercent !== null &&
        s.onTimePercent >= 90 &&
        s.qualityRating !== null &&
        s.qualityRating >= 4.2
    ).length,
    standardPerformers: enrichedSuppliers.filter(
      (s) =>
        s.status === "Active" &&
        s.onTimePercent !== null &&
        s.qualityRating !== null &&
        !(s.onTimePercent >= 90 && s.qualityRating >= 4.2)
    ).length,
    missingMetrics: enrichedSuppliers.filter(
      (s) => s.onTimePercent === null || s.qualityRating === null
    ).length,
    blockedOrInactive: blockedCount + inactiveCount,
  };

  return {
    asOfDate: asOfDate.toISOString().slice(0, 10),
    policyVersion: policy.version,
    summary: {
      totalSuppliers: allSuppliers.length,
      activeSuppliers: activeCount,
      eligiblePreferredSuppliers: eligiblePreferredCount,
      blockedSuppliers: blockedCount,
      inactiveSuppliers: inactiveCount,
      suppliersWithRecentPoHistory: recentPoHistoryCount,
      suppliersWithPerformanceData: completePerformanceDataCount,
      suppliersRequiringEvaluation: requiringEvaluationCount,
    },
    performanceDistribution,
    categoryBreakdown: Array.from(categoryBreakdownMap.values()).sort(
      (a, b) => b.totalSuppliers - a.totalSuppliers
    ),
    recentActivity,
    suppliers: enrichedSuppliers,
    itemsCatalog: Array.from(masterData.itemMasterMap.values()).map((i) => ({
      itemCode: i.itemCode,
      description: i.description,
      category: i.category,
      uom: i.uom,
    })),
  };
}

/**
 * 6. Detailed Supplier Intelligence Profile for a Single Supplier (Section 7)
 */
export async function getSupplierDetailIntelligence(
  supplierId: string,
  asOfDate: Date = DEFAULT_INTELLIGENCE_REFERENCE_DATE
) {
  const normId = supplierId.trim().toUpperCase();
  const policy = await getPolicyConfig();
  const masterData = await loadMasterDataContext();

  const supp = masterData.suppliersMap.get(normId);
  if (!supp) {
    throw new NotFoundError(`Supplier '${normId}' not found.`);
  }

  const eligibility = evaluateSupplierEligibility({
    supplier: supp,
    asOfDate,
    poHistory: masterData.poHistory,
    contracts: masterData.contracts,
    policy,
  });

  const performance = analyzeSupplierPerformance({
    supplier: supp,
    asOfDate,
    poHistory: masterData.poHistory,
    contracts: masterData.contracts,
    policy,
  });

  // Historical PO records for this supplier
  const purchaseHistory = masterData.poHistory
    .filter(
      (po) =>
        po.supplierId.toUpperCase() === normId &&
        po.poDate.getTime() <= asOfDate.getTime()
    )
    .sort((a, b) => b.poDate.getTime() - a.poDate.getTime() || b.poNumber.localeCompare(a.poNumber))
    .map((po) => {
      const item = masterData.itemMasterMap.get(po.itemCode);
      return {
        poNumber: po.poNumber,
        poDate: po.poDate.toISOString().slice(0, 10),
        itemCode: po.itemCode,
        itemDescription: item?.description || po.itemCode,
        category: item?.category || "General",
        quantity: po.quantity,
        uom: po.uom,
        unitPrice: po.unitPrice,
        totalAmountInr: Math.round(po.quantity * po.unitPrice * 100) / 100,
        plant: po.plant,
        deliveredOnTime: po.deliveredOnTime,
      };
    });

  // Contracts held by this supplier
  const supplierContracts = masterData.contracts
    .filter((c) => c.supplierId.toUpperCase() === normId)
    .map((c) => {
      const reqTime = asOfDate.getTime();
      const isDateValid =
        reqTime >= c.startDate.getTime() && reqTime <= c.endDate.getTime();
      const remainingCeiling = Math.max(0, c.valueCap - c.consumedValue);
      let contractValidityStatus: "CURRENT_VALID" | "EXPIRED" | "EXHAUSTED" | "FUTURE" =
        "CURRENT_VALID";
      if (c.startDate.getTime() > reqTime) contractValidityStatus = "FUTURE";
      else if (c.endDate.getTime() < reqTime) contractValidityStatus = "EXPIRED";
      else if (remainingCeiling <= 0) contractValidityStatus = "EXHAUSTED";

      return {
        contractId: c.contractId,
        startDate: c.startDate.toISOString().slice(0, 10),
        endDate: c.endDate.toISOString().slice(0, 10),
        valueCap: c.valueCap,
        consumedValue: c.consumedValue,
        remainingCeiling,
        source: c.source,
        contractValidityStatus,
        isCurrentlyValidForPo:
          supp.status === "Active" && contractValidityStatus === "CURRENT_VALID",
        lines: c.lines,
      };
    });

  // Per-Item Preferred Ranking & Reference Price Intelligence
  // Gather all items this supplier has supplied or contracted for
  const associatedItemCodes = new Set<string>();
  for (const po of purchaseHistory) associatedItemCodes.add(po.itemCode);
  for (const c of supplierContracts) {
    for (const l of c.lines) associatedItemCodes.add(l.itemCode.toUpperCase());
  }

  const itemRankings = Array.from(associatedItemCodes)
    .sort()
    .map((itemCode) => {
      const item = masterData.itemMasterMap.get(itemCode);
      const itemPos = masterData.poHistoryByItem?.get(itemCode) || [];
      const rankedList = calculatePreferredSuppliers(
        itemCode,
        asOfDate,
        itemPos,
        masterData.contracts,
        masterData.suppliersMap,
        policy.preferredSuppliers
      );
      const myRank = rankedList.find((r) => r.supplierId === normId);
      const refPrice = calculateSupplierReferencePrice({
        supplierId: normId,
        itemCode,
        asOfDate,
        poHistory: itemPos,
        contracts: masterData.contracts,
        suppliersMap: masterData.suppliersMap,
        lookbackWindowDays: policy.preferredSuppliers.poHistoryWindowDays,
      });

      return {
        itemCode,
        itemDescription: item?.description || itemCode,
        category: item?.category || "General",
        isRankedPreferred: Boolean(myRank),
        rank: myRank?.rank ?? null,
        totalCompetitors: rankedList.length,
        score: myRank?.score ?? null,
        scoreBreakdown: myRank?.scoreBreakdown ?? null,
        poCountIn548d: myRank?.poCount ?? 0,
        referencePrice: refPrice.referencePrice,
        referencePriceSource: refPrice.priceSource,
        referencePriceExplanation: refPrice.explanation,
        rankingExplanation:
          myRank?.rankingExplanation ||
          (supp.status !== "Active"
            ? `Excluded from ranking because supplier status is '${supp.status}' (Clause 5.7).`
            : `Not on 548-day preferred list for ${itemCode}.`),
      };
    });

  const adminOverride = getFallbackSupplierOverrides().get(normId) || null;

  return {
    profile: {
      supplierId: supp.supplierId,
      supplierName: supp.name,
      city: supp.city || "",
      categories: supp.categories
        .split(/[;,]/)
        .map((c) => c.trim())
        .filter(Boolean),
      categoriesRaw: supp.categories,
      status: supp.status,
      isBlocked: supp.status === "Blocked",
      isInactive: supp.status === "Inactive",
      adminOverride,
    },
    eligibility,
    performance,
    purchaseHistory,
    contracts: supplierContracts,
    itemRankings,
    policyWeights: policy.preferredSuppliers.weights,
  };
}

/**
 * 7. Supplier Administration: Block / Unblock / Status Update with Audit Logging (Section 9)
 */
export async function updateSupplierStatusWithAudit(params: {
  supplierId: string;
  newStatus: "Active" | "Inactive" | "Blocked";
  reason: string;
  actor: SafeUser;
}) {
  const { supplierId, newStatus, reason, actor } = params;

  if (!actor || actor.role !== "PROCUREMENT_ADMIN") {
    throw new ForbiddenError(
      "Only PROCUREMENT_ADMIN users are authorized to modify supplier status or block/unblock suppliers."
    );
  }

  if (!reason || !reason.trim()) {
    throw new ValidationError(
      "A written audit reason is required when updating supplier status or blocking/unblocking a supplier."
    );
  }

  const normId = supplierId.trim().toUpperCase();
  const masterData = await loadMasterDataContext();
  const existing = masterData.suppliersMap.get(normId);
  if (!existing) {
    throw new NotFoundError(`Supplier '${normId}' does not exist.`);
  }

  const previousStatus = existing.status;
  const now = new Date();
  const actorLabel = actor.email || actor.name || actor.id;

  // Store in fallback override store so immediate evaluations use the updated status
  getFallbackSupplierOverrides().set(normId, {
    supplierId: normId,
    status: newStatus,
    reason: reason.trim(),
    updatedBy: actorLabel,
    updatedAt: now,
  });

  // Update MongoDB Supplier document if connected
  try {
    await connectToDatabase();
    await Supplier.findOneAndUpdate(
      { supplierId: normId },
      { $set: { supplierStatus: newStatus } }
    );
  } catch {
    // Fallback override store already updated
  }

  const action =
    newStatus === "Blocked"
      ? "BLOCK_SUPPLIER"
      : previousStatus === "Blocked" && newStatus === "Active"
      ? "UNBLOCK_SUPPLIER"
      : "UPDATE_SUPPLIER_STATUS";

  const auditEntry: FallbackAuditLogRecord = {
    id: `AUD-SUP-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    actorId: actor.id,
    actorEmail: actorLabel,
    action,
    entityType: "Supplier",
    entityId: normId,
    previousValue: { status: previousStatus },
    newValue: { status: newStatus, reason: reason.trim() },
    metadata: { supplierName: existing.name },
    timestamp: now,
    createdAt: now,
    updatedAt: now,
  };
  getFallbackAuditLogs().unshift(auditEntry);

  try {
    await connectToDatabase();
    await AuditLog.create({
      actorId: actor.id,
      actorEmail: actorLabel,
      action,
      entityType: "Supplier",
      entityId: normId,
      previousValue: { status: previousStatus },
      newValue: { status: newStatus, reason: reason.trim() },
      metadata: { supplierName: existing.name },
      timestamp: now,
    });
  } catch {
    // Stored in fallbackAuditLogs
  }

  return getSupplierDetailIntelligence(normId);
}
