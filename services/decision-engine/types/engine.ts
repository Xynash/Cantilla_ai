export type DecisionType = "PO" | "SOURCING_REQUEST" | "NOT_PROCESSED";

export type DecisionRoute =
  | "CONTRACT_PO"
  | "EMERGENCY_PO"
  | "SPOT_PO"
  | "RFQ"
  | "RFP"
  | "CAPEX_SOURCING"
  | "NEW_ITEM_SOURCING"
  | "NOT_PROCESSED";

export interface RawPrLine {
  pr_no: string;
  pr_line: number;
  created_at: string;
  requester: string;
  department: string;
  plant: string;
  item_code?: string;
  description: string;
  quantity: number;
  uom: string;
  estimated_unit_price?: number;
  need_by_date: string;
  urgency: "Normal" | "Urgent" | "Emergency";
}

export interface ResolvedPrLine extends RawPrLine {
  resolvedItemCode: string; // valid itemCode or "NEW"
  isNewItem: boolean;
  matchExplanation: string;
  standardPrice?: number;
  itemCategory?: string;
  itemType?: string;
  parsedCreatedAt: Date;
  parsedNeedByDate: Date;
}

export interface RequirementGroup {
  groupId: string;
  plant: string;
  resolvedItemCode: string;
  isNewItem: boolean;
  isEmergency: boolean;
  requirementDate: Date; // creation date of its first line
  firstLineNeedByDate: Date; // need-by date of first line
  earliestNeedByDate: Date;
  lines: ResolvedPrLine[];
  totalQuantity: number;
  uom: string;
  unitPrice: number;
  priceSource: "CONTRACT_RATE" | "LOWEST_APPLICABLE_RATE" | "RECENT_PO_PRICE" | "STANDARD_PRICE" | "REQUESTER_ESTIMATE";
  priceExplanation: string;
  groupValueInr: number;
  selectedContractId?: string;
  selectedContractRate?: number;
}

export interface PreferredSupplierRank {
  supplierId: string;
  supplierName: string;
  rank: number;
  score: number;
  scoreBreakdown: {
    frequencyScore: number;
    recencyScore: number;
    contractScore: number;
    onTimeScore: number;
    qualityScore: number;
  };
  poCount: number;
  lastPurchaseDate?: string;
  recencyTier: number;
  hasContractHistory: boolean;
  onTimePercent: number | null;
  qualityRating: number | null;
  referencePrice: number;
  priceSource: "PO_HISTORY" | "CONTRACT_RATE";
  referencePoNumber?: string;
  referenceContractId?: string;
  rankingExplanation: string;
}

export interface RequirementDecision {
  groupId: string;
  requirement: RequirementGroup;
  prReferences?: Array<{ prNo: string; prLine: number }>;
  resolvedItemCode?: string;
  plant?: string;
  decision: DecisionType;
  route: DecisionRoute;
  supplierId?: string;
  supplierName?: string;
  unitPrice?: number;
  valuationSource?: string;
  valuationUnitPrice?: number;
  groupValueInr: number;
  suggestedSupplierIds: string[];
  supplierShortfallExplanation?: string;
  policyVersion: string;
  clause: string;
  appliedClauses?: string[];
  referenceContractId?: string;
  referencePoNumber?: string;
  reason: string;
  poId?: string;
  preferredSuppliers: PreferredSupplierRank[];
}

export interface LineDecisionOutput {
  pr_no: string;
  pr_line: number;
  resolved_item_code: string;
  group_id: string;
  po_id: string;
  decision: DecisionType;
  route: DecisionRoute;
  supplier_id: string;
  unit_price: string;
  group_value_inr: number;
  suggested_supplier_ids: string;
  policy_version: string;
  reason: string;
}

export interface BatchProcessingResult {
  runId?: string;
  batchName?: string;
  contentHash?: string;
  isDuplicateSubmission?: boolean;
  policyVersion: string;
  policySnapshot?: Record<string, any>;
  totalPrLines: number;
  totalRequirements: number;
  totalPOs: number;
  totalSourcingRequests: number;
  totalNotProcessed?: number;
  lineOutputs: LineDecisionOutput[];
  requirements: RequirementDecision[];
  poGroups?: Array<{
    poId: string;
    supplierId: string;
    supplierName?: string;
    plant: string;
    route: string;
    status: "PROPOSED";
    firstRequirementDate: Date | string;
    requirementIds: string[];
    prReferences: Array<{ prNo: string; prLine: number }>;
    totalValueInr: number;
  }>;
  csvContent: string;
  executedAt: string;
}
