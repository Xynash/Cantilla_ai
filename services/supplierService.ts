import {
  loadMasterDataContext,
  normalizeSupplierCategories,
} from "./decision-engine/utils/masterDataLoader";
import { getPolicyConfig } from "./decision-engine/policy-config/policyService";
import {
  DEFAULT_INTELLIGENCE_REFERENCE_DATE,
  evaluateSupplierEligibility,
  analyzeSupplierPerformance,
  calculateSupplierReferencePrice,
  getSupplierRecommendationsForItem,
  getSupplierIntelligenceOverview,
  getSupplierDetailIntelligence,
  updateSupplierStatusWithAudit,
} from "./decision-engine/preferred-suppliers/supplierIntelligenceService";

export {
  DEFAULT_INTELLIGENCE_REFERENCE_DATE,
  evaluateSupplierEligibility,
  analyzeSupplierPerformance,
  calculateSupplierReferencePrice,
  getSupplierRecommendationsForItem,
  getSupplierIntelligenceOverview,
  getSupplierDetailIntelligence,
  updateSupplierStatusWithAudit,
};

export interface ListSuppliersParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  city?: string;
  asOfDate?: Date;
}

/**
 * Unified Supplier Directory & Intelligence Listing
 * Uses the canonical `loadMasterDataContext()` + `evaluateSupplierEligibility()` + `analyzeSupplierPerformance()`
 * so MongoDB records, CSV fallback, category normalization, null performance metrics, and audited status overrides
 * always come from one single source of truth.
 */
export async function listSuppliers(params: ListSuppliersParams = {}) {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 10));
  const skip = (page - 1) * limit;
  const asOfDate = params.asOfDate || DEFAULT_INTELLIGENCE_REFERENCE_DATE;

  const [masterData, policy] = await Promise.all([
    loadMasterDataContext(),
    getPolicyConfig(),
  ]);

  let list = Array.from(masterData.suppliersMap.values()).sort((a, b) =>
    a.supplierId.localeCompare(b.supplierId)
  );

  const cities = Array.from(
    new Set(list.map((s) => s.city).filter(Boolean) as string[])
  ).sort();

  if (params.search && params.search.trim()) {
    const s = params.search.trim().toLowerCase();
    list = list.filter((sup) => {
      const catStr = normalizeSupplierCategories(sup.categories).toLowerCase();
      return (
        sup.supplierId.toLowerCase().includes(s) ||
        sup.name.toLowerCase().includes(s) ||
        (sup.city || "").toLowerCase().includes(s) ||
        catStr.includes(s)
      );
    });
  }

  if (params.status && params.status !== "ALL") {
    list = list.filter((sup) => sup.status === params.status);
  }

  if (params.city && params.city !== "ALL") {
    list = list.filter((sup) => sup.city === params.city);
  }

  const total = list.length;
  const paged = list.slice(skip, skip + limit);
  const now = new Date().toISOString();

  return {
    items: paged.map((s) => {
      const normalizedCategoriesStr = normalizeSupplierCategories(s.categories);
      const categoriesArray = normalizedCategoriesStr
        .split(/[;,]/)
        .map((c) => c.trim())
        .filter(Boolean);

      const eligibility = evaluateSupplierEligibility({
        supplier: s,
        asOfDate,
        poHistory: masterData.poHistory,
        contracts: masterData.contracts,
        policy,
      });

      const performance = analyzeSupplierPerformance({
        supplier: s,
        asOfDate,
        poHistory: masterData.poHistory,
        contracts: masterData.contracts,
        policy,
      });

      return {
        id: s.supplierId,
        supplierId: s.supplierId,
        name: s.name,
        supplierName: s.name,
        city: s.city || "",
        categories: categoriesArray,
        categoriesRaw: normalizedCategoriesStr,
        status: s.status,
        supplierStatus: s.status,
        onTimePct: s.onTimePercent,
        onTimeDisplay: performance.deliveryPerformance.displayLabel,
        qualityRating: s.qualityRating,
        qualityDisplay: performance.qualityPerformance.displayLabel,
        isPreferredEligible: eligibility.isPreferredEligible,
        eligibilityStatus: eligibility.eligibilityStatus,
        poCountIn548d: performance.poCountIn548d,
        hasCurrentValidContract: eligibility.hasCurrentValidContract,
        hasHistoricalContract: eligibility.hasHistoricalContract,
        createdAt: now,
        updatedAt: now,
      };
    }),
    cities,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      timestamp: now,
    },
  };
}

/**
 * Unified single-supplier lookup delegating to canonical master data & intelligence engine.
 */
export async function getSupplierById(
  supplierId: string,
  asOfDate: Date = DEFAULT_INTELLIGENCE_REFERENCE_DATE
) {
  const code = supplierId.toUpperCase().trim();
  const [masterData, policy] = await Promise.all([
    loadMasterDataContext(),
    getPolicyConfig(),
  ]);

  const sup = masterData.suppliersMap.get(code);
  if (!sup) return null;

  const normalizedCategoriesStr = normalizeSupplierCategories(sup.categories);
  const categoriesArray = normalizedCategoriesStr
    .split(/[;,]/)
    .map((c) => c.trim())
    .filter(Boolean);

  const eligibility = evaluateSupplierEligibility({
    supplier: sup,
    asOfDate,
    poHistory: masterData.poHistory,
    contracts: masterData.contracts,
    policy,
  });

  const performance = analyzeSupplierPerformance({
    supplier: sup,
    asOfDate,
    poHistory: masterData.poHistory,
    contracts: masterData.contracts,
    policy,
  });

  const now = new Date().toISOString();

  return {
    id: sup.supplierId,
    supplierId: sup.supplierId,
    name: sup.name,
    supplierName: sup.name,
    city: sup.city || "",
    categories: categoriesArray,
    categoriesRaw: normalizedCategoriesStr,
    status: sup.status,
    supplierStatus: sup.status,
    onTimePct: sup.onTimePercent,
    onTimeDisplay: performance.deliveryPerformance.displayLabel,
    qualityRating: sup.qualityRating,
    qualityDisplay: performance.qualityPerformance.displayLabel,
    eligibility,
    performance,
    createdAt: now,
    updatedAt: now,
  };
}

