export type ConditionOperator =
  | "eq"
  | "neq"
  | "in"
  | "nin"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "exists";

export interface PolicyRuleCondition {
  field:
    | "itemType"
    | "isEmergency"
    | "hasValidContract"
    | "valueInr"
    | "boughtInLastDays"
    | "plantCode"
    | "category";
  operator: ConditionOperator;
  value: any;
}

export interface PolicyRuleDefinition {
  id: string; // e.g. "5.1", "5.2", "5.3", "5.4", "5.5", "5.6"
  name: string;
  priority: number;
  conditions: PolicyRuleCondition[];
  decision: "PO" | "SOURCING_REQUEST";
  route:
    | "CAPEX_SOURCING"
    | "CONTRACT_PO"
    | "EMERGENCY_PO"
    | "SPOT_PO"
    | "RFQ"
    | "RFP"
    | "NEW_ITEM_SOURCING";
  supplierSelection: {
    type: "CONTRACT_SUPPLIER" | "FIRST_PREFERRED" | "SUGGEST_PREFERRED" | "MANUAL_SOURCING";
    suggestCount?: number;
  };
  priceSelection?: {
    type: "CONTRACT_RATE" | "PREFERRED_REFERENCE_PRICE" | "ESTIMATED_PRICE" | "NONE";
  };
  requiresApproval?: boolean;
  clause: string;
  description: string;
}

export interface PolicyClubbingConfig {
  creationWindowDays: number; // 14
  needByWindowDays: number; // 7
  allowAcrossPlants: boolean; // false
  allowNewItems: boolean; // false
}

export interface PolicyValuationConfig {
  contractExhaustedFallback: "LOWEST_APPLICABLE_RATE";
  poHistoryWindowDays: number; // 365
  currency: string; // "INR"
}

export interface PolicyPreferredSuppliersConfig {
  poHistoryWindowDays: number; // 548
  activeLookbackDays: number; // 365
  qualityScaleMax?: number; // 5.0
  recencyThresholdsDays?: {
    recent: number; // 90
    moderate: number; // 365
  };
  weights: {
    frequency: number; // 0.35
    recency: number; // 0.25
    contractHistory: number; // 0.15
    onTimeDelivery: number; // 0.15
    qualityRating: number; // 0.10
  };
  recencyTiers: {
    within90Days: number; // 1.0
    within365Days: number; // 0.5
    olderThan365Days: number; // 0.0
  };
  categoryTopUpWeights?: {
    onTimeDelivery: number; // 0.5
    qualityRating: number; // 0.5
  };
}

export interface PolicyConsolidationConfig {
  poWindowHours: number; // 24
  matchFields: string[]; // ["supplierId", "plantCode", "route"]
}

export interface StructuredPolicyConfig {
  version: string;
  documentName: string;
  effectiveDate: string; // ISO date string e.g. "2026-04-01"
  owner: string;
  appliesToPlants: string[];
  clubbing: PolicyClubbingConfig;
  valuation: PolicyValuationConfig;
  preferredSuppliers: PolicyPreferredSuppliersConfig;
  consolidation: PolicyConsolidationConfig;
  rules: PolicyRuleDefinition[];
}
