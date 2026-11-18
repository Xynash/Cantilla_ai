import { RequirementGroup, RequirementDecision, PreferredSupplierRank } from "../types/engine";
import { StructuredPolicyConfig, PolicyRuleDefinition, ConditionOperator } from "../types/policy";
import { ContractEvaluationResult } from "../contract-evaluation/contractEvaluator";
import {
  getSupplierSuggestionsWithExplanation,
  SupplierMasterRecord,
} from "../preferred-suppliers/preferredSupplierEngine";
import { PoHistoryRecord } from "../valuation/valuator";

export interface RuleEvaluationContext {
  requirement: RequirementGroup;
  contractResult: ContractEvaluationResult;
  preferredSuppliers: PreferredSupplierRank[];
  poHistory: PoHistoryRecord[];
  suppliersMap: Map<string, SupplierMasterRecord>;
  activeSupplierIds: Set<string>;
  policy: StructuredPolicyConfig;
}

/**
 * Checks if a numeric or string value satisfies a condition operator
 */
function evaluateConditionOperator(
  actualValue: any,
  operator: ConditionOperator,
  targetValue: any
): boolean {
  switch (operator) {
    case "eq":
      return actualValue === targetValue;
    case "neq":
      return actualValue !== targetValue;
    case "in":
      return Array.isArray(targetValue) && targetValue.includes(actualValue);
    case "nin":
      return Array.isArray(targetValue) && !targetValue.includes(actualValue);
    case "lt":
      return typeof actualValue === "number" && actualValue < targetValue;
    case "lte":
      return typeof actualValue === "number" && actualValue <= targetValue;
    case "gt":
      return typeof actualValue === "number" && actualValue > targetValue;
    case "gte":
      return typeof actualValue === "number" && actualValue >= targetValue;
    case "exists":
      return actualValue !== undefined && actualValue !== null;
    default:
      return false;
  }
}

/**
 * Checks if the item was bought from an Active supplier within the specified days before requirement date
 */
export function checkBoughtInLastDays(
  itemCode: string,
  reqDate: Date,
  poHistory: PoHistoryRecord[],
  activeSupplierIds: Set<string>,
  days: number
): boolean {
  const reqTime = reqDate.getTime();
  const windowMs = days * 24 * 60 * 60 * 1000;
  const cutoff = reqTime - windowMs;

  return poHistory.some((po) => {
    if (po.itemCode.toUpperCase() !== itemCode.toUpperCase()) return false;
    const t = po.poDate.getTime();
    if (t < cutoff || t > reqTime) return false;
    return activeSupplierIds.has(po.supplierId.toUpperCase());
  });
}

/**
 * Evaluates decision rules for a requirement group in exact priority order (Policy Section 5)
 */
export function evaluateRequirementDecision(context: RuleEvaluationContext): RequirementDecision {
  const {
    requirement,
    contractResult,
    preferredSuppliers,
    poHistory,
    suppliersMap,
    activeSupplierIds,
    policy,
  } = context;

  const prReferences = requirement.lines.map((l) => ({
    prNo: l.pr_no,
    prLine: l.pr_line,
  }));

  // 1. Policy Section 1.2: New Item Special Handling
  if (requirement.isNewItem || requirement.resolvedItemCode === "NEW") {
    return {
      groupId: requirement.groupId,
      requirement,
      prReferences,
      resolvedItemCode: "NEW",
      plant: requirement.plant,
      decision: "SOURCING_REQUEST",
      route: "NEW_ITEM_SOURCING",
      supplierId: undefined,
      unitPrice: undefined,
      valuationSource: requirement.priceSource,
      valuationUnitPrice: requirement.unitPrice,
      groupValueInr: requirement.groupValueInr,
      suggestedSupplierIds: [],
      policyVersion: policy.version,
      clause: "1.2",
      appliedClauses: ["1.2"],
      reason:
        "Not in item master (1.2). Sourcing request, valued at the requester's estimate, never clubbed, and no supplier suggestions.",
      preferredSuppliers: [],
    };
  }

  // Extract first line's itemType and category for rule conditions
  const firstLine = requirement.lines[0];
  const itemType = firstLine?.itemType || "Material";
  const itemCategory = firstLine?.itemCategory || "General";

  // Pre-calculate whether bought in last 365 days from active supplier
  const boughtInLast365Days = checkBoughtInLastDays(
    requirement.resolvedItemCode,
    requirement.requirementDate,
    poHistory,
    activeSupplierIds,
    policy.preferredSuppliers.activeLookbackDays || 365
  );

  // 2. Evaluate Policy Rules in priority order (Policy Section 5)
  const sortedRules = [...policy.rules].sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    let ruleMatches = true;

    for (const cond of rule.conditions) {
      let actualValue: any;

      switch (cond.field) {
        case "itemType":
          actualValue = itemType;
          break;
        case "isEmergency":
          actualValue = requirement.isEmergency;
          break;
        case "hasValidContract":
          actualValue = contractResult.hasValidContract;
          break;
        case "valueInr":
          actualValue = requirement.groupValueInr;
          break;
        case "boughtInLastDays":
          actualValue = boughtInLast365Days ? 0 : 9999; // 0 if bought in window, 9999 if not
          break;
        case "plantCode":
          actualValue = requirement.plant;
          break;
        case "category":
          actualValue = itemCategory;
          break;
      }

      if (!evaluateConditionOperator(actualValue, cond.operator, cond.value)) {
        ruleMatches = false;
        break;
      }
    }

    // Ensure FIRST_PREFERRED rules have at least one eligible active preferred supplier
    if (
      ruleMatches &&
      rule.decision === "PO" &&
      rule.supplierSelection.type === "FIRST_PREFERRED" &&
      preferredSuppliers.length === 0
    ) {
      ruleMatches = false;
    }

    if (ruleMatches) {
      return buildDecisionFromRule(rule, context, itemCategory, boughtInLast365Days);
    }
  }

  // Fallback if no rule matched (default to RFP if high value or RFQ if low value)
  const fallbackRoute = requirement.groupValueInr >= 1000000 ? "RFP" : "RFQ";
  const suggestCount = fallbackRoute === "RFP" ? 5 : 3;
  const suggestionResult = getSupplierSuggestionsWithExplanation(
    requirement.resolvedItemCode,
    itemCategory,
    preferredSuppliers,
    suppliersMap,
    suggestCount,
    policy.preferredSuppliers
  );

  const fallbackClause = fallbackRoute === "RFP" ? "5.6" : "5.5";
  const baseReason = `Fallback sourcing rule ${fallbackRoute} (${fallbackClause}) applied for value ₹${requirement.groupValueInr.toLocaleString("en-IN")}.`;
  const fullReason = suggestionResult.shortfallExplanation
    ? `${baseReason} ${suggestionResult.shortfallExplanation}`
    : baseReason;

  return {
    groupId: requirement.groupId,
    requirement,
    prReferences,
    resolvedItemCode: requirement.resolvedItemCode,
    plant: requirement.plant,
    decision: "SOURCING_REQUEST",
    route: fallbackRoute,
    valuationSource: requirement.priceSource,
    valuationUnitPrice: requirement.unitPrice,
    groupValueInr: requirement.groupValueInr,
    suggestedSupplierIds: suggestionResult.suggestions,
    supplierShortfallExplanation: suggestionResult.shortfallExplanation,
    policyVersion: policy.version,
    clause: fallbackClause,
    appliedClauses: [fallbackClause, "6.4"],
    reason: fullReason,
    preferredSuppliers,
  };
}

/**
 * Builds the concrete RequirementDecision structure from the matched PolicyRuleDefinition
 */
function buildDecisionFromRule(
  rule: PolicyRuleDefinition,
  context: RuleEvaluationContext,
  itemCategory: string,
  boughtInLast365Days: boolean
): RequirementDecision {
  const { requirement, contractResult, preferredSuppliers, suppliersMap, policy } = context;

  const prReferences = requirement.lines.map((l) => ({
    prNo: l.pr_no,
    prLine: l.pr_line,
  }));

  let supplierId: string | undefined;
  let supplierName: string | undefined;
  let unitPrice: number | undefined;
  let suggestedSupplierIds: string[] = [];
  let supplierShortfallExplanation: string | undefined;
  let referenceContractId: string | undefined;
  let referencePoNumber: string | undefined;
  const appliedClauses: string[] = [rule.clause];
  let reason = "";

  if (rule.decision === "PO") {
    // 1. CONTRACT_PO (Rule 5.2)
    if (rule.route === "CONTRACT_PO") {
      const contract = contractResult.selectedContract!;
      supplierId = contract.supplierId;
      supplierName = contract.supplierName;
      unitPrice = contractResult.selectedRate;
      referenceContractId = contract.contractId;
      appliedClauses.push("4.1", "4.2", "4.3");
      reason = `The item is covered by rate contract ${contract.contractId} with ${supplierName} (${supplierId}), valid on the requirement date, supplier Active, and the ceiling has room (4.1, 4.2). Rule 5.2 applies before any value limit, so it is a PO at the contract rate.`;
    }
    // 2. EMERGENCY_PO (Rule 5.3)
    else if (rule.route === "EMERGENCY_PO") {
      const topSupp = preferredSuppliers[0];
      supplierId = topSupp?.supplierId;
      supplierName = topSupp?.supplierName;
      unitPrice = topSupp?.referencePrice;
      referencePoNumber = topSupp?.referencePoNumber;
      referenceContractId = topSupp?.referenceContractId;
      appliedClauses.push("6.1", "6.2", "6.3");
      reason = `Marked Emergency, worth ₹${requirement.groupValueInr.toLocaleString("en-IN")} (at or below ₹5 lakh), with purchase history in the last 365 days, so rule 5.3 allows a PO to the 1st preferred supplier (${supplierId}) at reference price ₹${unitPrice} without quotes.`;
    }
    // 3. SPOT_PO (Rule 5.4)
    else if (rule.route === "SPOT_PO") {
      const topSupp = preferredSuppliers[0];
      supplierId = topSupp?.supplierId;
      supplierName = topSupp?.supplierName;
      unitPrice = topSupp?.referencePrice;
      referencePoNumber = topSupp?.referencePoNumber;
      referenceContractId = topSupp?.referenceContractId;
      appliedClauses.push("6.1", "6.2", "6.3");
      reason = `No contract, value ₹${requirement.groupValueInr.toLocaleString("en-IN")} is below ₹2 lakh and bought in the last 365 days, so rule 5.4 allows a spot PO to the 1st preferred supplier (${supplierId}) at reference price ₹${unitPrice}.`;
    }
  } else {
    // SOURCING_REQUEST
    const suggestCount = rule.supplierSelection.suggestCount || (rule.route === "RFP" ? 5 : 3);
    const suggestionResult = getSupplierSuggestionsWithExplanation(
      requirement.resolvedItemCode,
      itemCategory,
      preferredSuppliers,
      suppliersMap,
      suggestCount,
      policy.preferredSuppliers
    );
    suggestedSupplierIds = suggestionResult.suggestions;
    supplierShortfallExplanation = suggestionResult.shortfallExplanation;
    appliedClauses.push("6.4");

    if (rule.route === "CAPEX_SOURCING") {
      reason = `Capex items always go to sourcing with 5 suggested suppliers (${rule.clause}), checked before contracts and value limits.`;
    } else if (rule.route === "RFQ") {
      if (contractResult.allContractsExhausted) {
        appliedClauses.push("3.1", "4.2");
        reason = `Rate contract ceiling is exhausted (4.2). Requirement valued at lowest applicable contract rate (3.1) at ₹${requirement.groupValueInr.toLocaleString("en-IN")}, which is at or above ₹2 lakh and below ₹10 lakh, so quotes are needed (5.5).`;
      } else if (!boughtInLast365Days) {
        reason = `Value ₹${requirement.groupValueInr.toLocaleString("en-IN")} is below ₹2 lakh, but the item has not been bought from an Active supplier in the last 365 days, so rule 5.4 does not apply. It goes to quotes (5.5).`;
      } else {
        reason = `No contract, and worth ₹${requirement.groupValueInr.toLocaleString("en-IN")}, which is at or above ₹2 lakh and below ₹10 lakh, so quotes are needed (5.5).`;
      }
    } else if (rule.route === "RFP") {
      reason = `Requirement value ₹${requirement.groupValueInr.toLocaleString("en-IN")} is at or above ₹10 lakh, so a formal RFP with 5 suggested suppliers is required (${rule.clause}).`;
    }

    if (supplierShortfallExplanation) {
      reason = `${reason} ${supplierShortfallExplanation}`;
    }
  }

  return {
    groupId: requirement.groupId,
    requirement,
    prReferences,
    resolvedItemCode: requirement.resolvedItemCode,
    plant: requirement.plant,
    decision: rule.decision,
    route: rule.route,
    supplierId,
    supplierName,
    unitPrice,
    valuationSource: requirement.priceSource,
    valuationUnitPrice: requirement.unitPrice,
    groupValueInr: requirement.groupValueInr,
    suggestedSupplierIds,
    supplierShortfallExplanation,
    policyVersion: policy.version,
    clause: rule.clause,
    appliedClauses,
    referenceContractId,
    referencePoNumber,
    reason,
    preferredSuppliers,
  };
}
