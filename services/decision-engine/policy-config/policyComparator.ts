import { StructuredPolicyConfig, PolicyRuleDefinition } from "../types/policy";

export type PolicyDiffCategory =
  | "METADATA_EFFECTIVE_DATES"
  | "CLUBBING_WINDOWS"
  | "VALUATION_CONTRACTS"
  | "SUPPLIER_ELIGIBILITY_SCORING"
  | "PO_CONSOLIDATION"
  | "DECISION_RULES_THRESHOLDS";

export interface PolicyFieldDiff {
  category: PolicyDiffCategory;
  fieldPath: string;
  label: string;
  changeType: "ADDED" | "REMOVED" | "MODIFIED" | "UNCHANGED";
  oldValue: unknown;
  newValue: unknown;
  formattedOld: string;
  formattedNew: string;
}

export interface PolicyComparisonResult {
  baseVersion: string;
  targetVersion: string;
  hasDifferences: boolean;
  totalDifferences: number;
  summaryText: string;
  bulletSummary: string[];
  diffs: PolicyFieldDiff[];
  changedDiffs: PolicyFieldDiff[];
  categoryCounts: Record<PolicyDiffCategory, number>;
}

function formatDiffVal(val: unknown, isCurrency = false, isPercent = false): string {
  if (val === undefined || val === null) return "—";
  if (Array.isArray(val)) return val.join(", ");
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (typeof val === "number") {
    if (isCurrency) return `₹${val.toLocaleString("en-IN")}`;
    if (isPercent) return `${(val * 100).toFixed(1)}%`;
    return String(val);
  }
  return String(val);
}

function summarizeRule(rule: PolicyRuleDefinition): string {
  const condStr = rule.conditions
    .map((c) => {
      if (c.field === "valueInr") {
        return `${c.field} ${c.operator} ₹${Number(c.value).toLocaleString("en-IN")}`;
      }
      return `${c.field} ${c.operator} ${String(c.value)}`;
    })
    .join(" AND ");
  const suppCount = rule.supplierSelection.suggestCount
    ? ` (${rule.supplierSelection.suggestCount} suppliers)`
    : "";
  return `[${rule.clause}] ${rule.decision} → ${rule.route}${suppCount} when (${condStr || "always"})`;
}

/**
 * Compares two StructuredPolicyConfig versions side-by-side and generates a detailed diff & human-readable summary.
 */
export function comparePolicyConfigs(
  baseConfig: StructuredPolicyConfig,
  targetConfig: StructuredPolicyConfig
): PolicyComparisonResult {
  const diffs: PolicyFieldDiff[] = [];

  const addScalarDiff = (
    category: PolicyDiffCategory,
    fieldPath: string,
    label: string,
    oldVal: unknown,
    newVal: unknown,
    opts?: { isCurrency?: boolean; isPercent?: boolean }
  ) => {
    const oldStr = JSON.stringify(oldVal);
    const newStr = JSON.stringify(newVal);
    const changeType = oldStr === newStr ? "UNCHANGED" : "MODIFIED";
    diffs.push({
      category,
      fieldPath,
      label,
      changeType,
      oldValue: oldVal,
      newValue: newVal,
      formattedOld: formatDiffVal(oldVal, opts?.isCurrency, opts?.isPercent),
      formattedNew: formatDiffVal(newVal, opts?.isCurrency, opts?.isPercent),
    });
  };

  // 1. Metadata & Effective Dates
  addScalarDiff(
    "METADATA_EFFECTIVE_DATES",
    "version",
    "Policy Version Number",
    baseConfig.version,
    targetConfig.version
  );
  addScalarDiff(
    "METADATA_EFFECTIVE_DATES",
    "documentName",
    "Document Code",
    baseConfig.documentName,
    targetConfig.documentName
  );
  addScalarDiff(
    "METADATA_EFFECTIVE_DATES",
    "effectiveDate",
    "Effective From Date",
    baseConfig.effectiveDate,
    targetConfig.effectiveDate
  );
  addScalarDiff(
    "METADATA_EFFECTIVE_DATES",
    "owner",
    "Policy Owner",
    baseConfig.owner,
    targetConfig.owner
  );
  addScalarDiff(
    "METADATA_EFFECTIVE_DATES",
    "appliesToPlants",
    "In-Scope Plants",
    baseConfig.appliesToPlants,
    targetConfig.appliesToPlants
  );

  // 2. Requirement Clubbing Windows
  addScalarDiff(
    "CLUBBING_WINDOWS",
    "clubbing.creationWindowDays",
    "Clubbing Creation Window (Days)",
    baseConfig.clubbing.creationWindowDays,
    targetConfig.clubbing.creationWindowDays
  );
  addScalarDiff(
    "CLUBBING_WINDOWS",
    "clubbing.needByWindowDays",
    "Clubbing Need-By Window (± Days)",
    baseConfig.clubbing.needByWindowDays,
    targetConfig.clubbing.needByWindowDays
  );
  addScalarDiff(
    "CLUBBING_WINDOWS",
    "clubbing.allowAcrossPlants",
    "Allow Clubbing Across Plants",
    baseConfig.clubbing.allowAcrossPlants,
    targetConfig.clubbing.allowAcrossPlants
  );
  addScalarDiff(
    "CLUBBING_WINDOWS",
    "clubbing.allowNewItems",
    "Allow Clubbing New Items",
    baseConfig.clubbing.allowNewItems,
    targetConfig.clubbing.allowNewItems
  );

  // 3. Valuation & Contract Conditions
  addScalarDiff(
    "VALUATION_CONTRACTS",
    "valuation.poHistoryWindowDays",
    "Valuation PO History Lookback (Days)",
    baseConfig.valuation.poHistoryWindowDays,
    targetConfig.valuation.poHistoryWindowDays
  );
  addScalarDiff(
    "VALUATION_CONTRACTS",
    "valuation.contractExhaustedFallback",
    "Contract Exhausted Fallback Rule",
    baseConfig.valuation.contractExhaustedFallback,
    targetConfig.valuation.contractExhaustedFallback
  );
  addScalarDiff(
    "VALUATION_CONTRACTS",
    "valuation.currency",
    "Base Currency",
    baseConfig.valuation.currency,
    targetConfig.valuation.currency
  );

  // 4. Preferred Supplier Eligibility & Scoring Weights
  addScalarDiff(
    "SUPPLIER_ELIGIBILITY_SCORING",
    "preferredSuppliers.poHistoryWindowDays",
    "Supplier Eligibility PO Window (Days)",
    baseConfig.preferredSuppliers.poHistoryWindowDays,
    targetConfig.preferredSuppliers.poHistoryWindowDays
  );
  addScalarDiff(
    "SUPPLIER_ELIGIBILITY_SCORING",
    "preferredSuppliers.activeLookbackDays",
    "Direct PO Active Supplier Lookback (Days)",
    baseConfig.preferredSuppliers.activeLookbackDays,
    targetConfig.preferredSuppliers.activeLookbackDays
  );
  addScalarDiff(
    "SUPPLIER_ELIGIBILITY_SCORING",
    "preferredSuppliers.weights.frequency",
    "Supplier Weight: Purchase Frequency",
    baseConfig.preferredSuppliers.weights.frequency,
    targetConfig.preferredSuppliers.weights.frequency,
    { isPercent: true }
  );
  addScalarDiff(
    "SUPPLIER_ELIGIBILITY_SCORING",
    "preferredSuppliers.weights.recency",
    "Supplier Weight: Purchase Recency",
    baseConfig.preferredSuppliers.weights.recency,
    targetConfig.preferredSuppliers.weights.recency,
    { isPercent: true }
  );
  addScalarDiff(
    "SUPPLIER_ELIGIBILITY_SCORING",
    "preferredSuppliers.weights.contractHistory",
    "Supplier Weight: Contract History",
    baseConfig.preferredSuppliers.weights.contractHistory,
    targetConfig.preferredSuppliers.weights.contractHistory,
    { isPercent: true }
  );
  addScalarDiff(
    "SUPPLIER_ELIGIBILITY_SCORING",
    "preferredSuppliers.weights.onTimeDelivery",
    "Supplier Weight: On-Time Delivery",
    baseConfig.preferredSuppliers.weights.onTimeDelivery,
    targetConfig.preferredSuppliers.weights.onTimeDelivery,
    { isPercent: true }
  );
  addScalarDiff(
    "SUPPLIER_ELIGIBILITY_SCORING",
    "preferredSuppliers.weights.qualityRating",
    "Supplier Weight: Quality Rating",
    baseConfig.preferredSuppliers.weights.qualityRating,
    targetConfig.preferredSuppliers.weights.qualityRating,
    { isPercent: true }
  );

  // 5. PO Consolidation
  addScalarDiff(
    "PO_CONSOLIDATION",
    "consolidation.poWindowHours",
    "PO Consolidation Window (Hours)",
    baseConfig.consolidation.poWindowHours,
    targetConfig.consolidation.poWindowHours
  );
  addScalarDiff(
    "PO_CONSOLIDATION",
    "consolidation.matchFields",
    "PO Consolidation Match Keys",
    baseConfig.consolidation.matchFields,
    targetConfig.consolidation.matchFields
  );

  // 6. Decision Rules & Financial Thresholds
  const baseRulesById = new Map<string, PolicyRuleDefinition>();
  for (const r of baseConfig.rules) baseRulesById.set(r.id, r);

  const targetRulesById = new Map<string, PolicyRuleDefinition>();
  for (const r of targetConfig.rules) targetRulesById.set(r.id, r);

  const allRuleIds = Array.from(
    new Set([...baseRulesById.keys(), ...targetRulesById.keys()])
  ).sort();

  for (const ruleId of allRuleIds) {
    const oldRule = baseRulesById.get(ruleId);
    const newRule = targetRulesById.get(ruleId);

    if (!oldRule && newRule) {
      diffs.push({
        category: "DECISION_RULES_THRESHOLDS",
        fieldPath: `rules[${ruleId}]`,
        label: `Rule ${newRule.id} (${newRule.name})`,
        changeType: "ADDED",
        oldValue: null,
        newValue: newRule,
        formattedOld: "Not present",
        formattedNew: summarizeRule(newRule),
      });
      continue;
    }

    if (oldRule && !newRule) {
      diffs.push({
        category: "DECISION_RULES_THRESHOLDS",
        fieldPath: `rules[${ruleId}]`,
        label: `Rule ${oldRule.id} (${oldRule.name})`,
        changeType: "REMOVED",
        oldValue: oldRule,
        newValue: null,
        formattedOld: summarizeRule(oldRule),
        formattedNew: "Removed",
      });
      continue;
    }

    if (oldRule && newRule) {
      // Compare valueInr threshold if present
      const oldValCond = oldRule.conditions.find((c) => c.field === "valueInr");
      const newValCond = newRule.conditions.find((c) => c.field === "valueInr");
      if (oldValCond || newValCond) {
        addScalarDiff(
          "DECISION_RULES_THRESHOLDS",
          `rules[${ruleId}].valueThreshold`,
          `Rule ${ruleId} (${newRule.name}) Value Threshold (${newValCond?.operator || oldValCond?.operator})`,
          oldValCond?.value,
          newValCond?.value,
          { isCurrency: true }
        );
      }

      // Compare boughtInLastDays condition if present
      const oldDaysCond = oldRule.conditions.find((c) => c.field === "boughtInLastDays");
      const newDaysCond = newRule.conditions.find((c) => c.field === "boughtInLastDays");
      if (oldDaysCond || newDaysCond) {
        addScalarDiff(
          "DECISION_RULES_THRESHOLDS",
          `rules[${ruleId}].boughtInLastDays`,
          `Rule ${ruleId} (${newRule.name}) PO History Requirement (Days)`,
          oldDaysCond?.value,
          newDaysCond?.value
        );
      }

      // Compare suggestCount if present
      if (
        oldRule.supplierSelection.suggestCount !== undefined ||
        newRule.supplierSelection.suggestCount !== undefined
      ) {
        addScalarDiff(
          "DECISION_RULES_THRESHOLDS",
          `rules[${ruleId}].suggestCount`,
          `Rule ${ruleId} (${newRule.name}) Required Supplier Count`,
          oldRule.supplierSelection.suggestCount,
          newRule.supplierSelection.suggestCount
        );
      }

      // Compare priority or route
      if (oldRule.priority !== newRule.priority || oldRule.route !== newRule.route) {
        addScalarDiff(
          "DECISION_RULES_THRESHOLDS",
          `rules[${ruleId}].routePriority`,
          `Rule ${ruleId} (${newRule.name}) Route & Priority`,
          `${oldRule.route} (Priority ${oldRule.priority})`,
          `${newRule.route} (Priority ${newRule.priority})`
        );
      }
    }
  }

  // Filter changed items (excluding version number itself when counting substantive changes, or include all)
  const changedDiffs = diffs.filter(
    (d) => d.changeType !== "UNCHANGED" && d.fieldPath !== "version"
  );

  const categoryCounts: Record<PolicyDiffCategory, number> = {
    METADATA_EFFECTIVE_DATES: 0,
    CLUBBING_WINDOWS: 0,
    VALUATION_CONTRACTS: 0,
    SUPPLIER_ELIGIBILITY_SCORING: 0,
    PO_CONSOLIDATION: 0,
    DECISION_RULES_THRESHOLDS: 0,
  };

  const bulletSummary: string[] = [];
  for (const d of changedDiffs) {
    categoryCounts[d.category] = (categoryCounts[d.category] || 0) + 1;
    if (d.changeType === "ADDED") {
      bulletSummary.push(`Added ${d.label}: ${d.formattedNew}`);
    } else if (d.changeType === "REMOVED") {
      bulletSummary.push(`Removed ${d.label}: ${d.formattedOld}`);
    } else {
      bulletSummary.push(`${d.label}: changed from ${d.formattedOld} to ${d.formattedNew}`);
    }
  }

  const summaryText =
    changedDiffs.length === 0
      ? `No rule, threshold, or parameter differences between Policy v${baseConfig.version} and v${targetConfig.version}.`
      : `Comparing v${baseConfig.version} → v${targetConfig.version}: ${changedDiffs.length} configuration change(s) detected (${bulletSummary.slice(0, 4).join("; ")}${changedDiffs.length > 4 ? `; +${changedDiffs.length - 4} more` : ""}).`;

  return {
    baseVersion: baseConfig.version,
    targetVersion: targetConfig.version,
    hasDifferences: changedDiffs.length > 0,
    totalDifferences: changedDiffs.length,
    summaryText,
    bulletSummary,
    diffs,
    changedDiffs,
    categoryCounts,
  };
}
