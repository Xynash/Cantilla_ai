import Papa from "papaparse";
import {
  RawPrLine,
  ResolvedPrLine,
  RequirementGroup,
  RequirementDecision,
  LineDecisionOutput,
  BatchProcessingResult,
} from "../types/engine";
import { StructuredPolicyConfig } from "../types/policy";
import { ItemMasterRecord, resolvePrLineItem } from "../item-resolution/resolver";
import { clubPrLines } from "../requirement-clubbing/clubber";
import { ContractRecord } from "../contract-evaluation/pdfContracts";
import { evaluateRequirementContract } from "../contract-evaluation/contractEvaluator";
import { PoHistoryRecord, calculateRequirementValuation } from "../valuation/valuator";
import {
  SupplierMasterRecord,
  calculatePreferredSuppliers,
} from "../preferred-suppliers/preferredSupplierEngine";
import { evaluateRequirementDecision } from "../decision-rules/ruleEvaluator";
import { consolidatePurchaseOrders } from "../po-consolidation/consolidator";
import { ValidationError } from "@/lib/errors";

export interface MasterDataContext {
  itemMasterMap: Map<string, ItemMasterRecord>;
  suppliersMap: Map<string, SupplierMasterRecord>;
  activeSupplierIds: Set<string>;
  poHistory: PoHistoryRecord[];
  poHistoryByItem?: Map<string, PoHistoryRecord[]>;
  contracts: ContractRecord[];
}

export const REQUIRED_OUTPUT_CSV_COLUMNS = [
  "pr_no",
  "pr_line",
  "resolved_item_code",
  "group_id",
  "po_id",
  "decision",
  "route",
  "supplier_id",
  "unit_price",
  "group_value_inr",
  "suggested_supplier_ids",
  "policy_version",
  "reason",
] as const;

/**
 * Formats a single CSV cell per RFC 4180:
 * Wraps in double quotes and doubles internal quotes whenever the value contains
 * commas, double quotes, or newline characters.
 */
function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Converts LineDecisionOutput array into a machine-readable CSV string
 * with exact required headers and RFC 4180 escaping for commas, quotes, and newlines.
 */
export function formatDecisionOutputsToCsv(rows: LineDecisionOutput[]): string {
  const headerLine = REQUIRED_OUTPUT_CSV_COLUMNS.join(",");
  const dataLines = rows.map((row) =>
    REQUIRED_OUTPUT_CSV_COLUMNS.map((col) => escapeCsvCell(row[col])).join(",")
  );
  return [headerLine, ...dataLines].join("\n");
}

/**
 * Evaluates whether a resolved PR line must be excluded as NOT_PROCESSED
 * under documented data-quality and policy-scope rules.
 */
function checkLineExclusionReason(
  line: ResolvedPrLine,
  policy: StructuredPolicyConfig
): string | null {
  if (Number.isNaN(line.quantity) || line.quantity <= 0) {
    return `Excluded (NOT_PROCESSED): Non-positive or invalid quantity (${line.quantity}) on PR line ${line.pr_no}/${line.pr_line}.`;
  }

  if (
    Array.isArray(policy.appliesToPlants) &&
    policy.appliesToPlants.length > 0 &&
    !policy.appliesToPlants.map((p) => p.toUpperCase()).includes(line.plant.toUpperCase())
  ) {
    return `Excluded (NOT_PROCESSED): Plant '${line.plant}' is outside policy scope (Policy v${policy.version} applies to ${policy.appliesToPlants.join(", ")}).`;
  }

  if (Number.isNaN(line.parsedCreatedAt.getTime())) {
    return `Excluded (NOT_PROCESSED): Invalid creation timestamp '${line.created_at}' on PR line ${line.pr_no}/${line.pr_line}.`;
  }

  if (Number.isNaN(line.parsedNeedByDate.getTime())) {
    return `Excluded (NOT_PROCESSED): Invalid need-by date '${line.need_by_date}' on PR line ${line.pr_no}/${line.pr_line}.`;
  }

  return null;
}

/**
 * Main batch processing pipeline executing Policy v5.0 deterministically
 */
export function processPrBatch(
  rawLines: RawPrLine[],
  masterData: MasterDataContext,
  policy: StructuredPolicyConfig
): BatchProcessingResult {
  // Clone contracts so running ceiling consumption is isolated to this batch run
  const clonedContracts: ContractRecord[] = masterData.contracts.map((c) => ({
    ...c,
    lines: c.lines.map((l) => ({ ...l })),
  }));

  // Map to preserve original order of input lines
  const originalLineKeys = rawLines.map((l) => `${l.pr_no}_${l.pr_line}`);

  // 1. Resolve Items (Policy Section 1)
  const allResolvedLines: ResolvedPrLine[] = rawLines.map((line) =>
    resolvePrLineItem(line, masterData.itemMasterMap)
  );

  // Separate valid lines from excluded (NOT_PROCESSED) lines
  const validResolvedLines: ResolvedPrLine[] = [];
  const excludedLinesMap = new Map<string, { resolvedItemCode: string; reason: string }>();

  for (const line of allResolvedLines) {
    const exclusionReason = checkLineExclusionReason(line, policy);
    const key = `${line.pr_no}_${line.pr_line}`;
    if (exclusionReason) {
      excludedLinesMap.set(key, {
        resolvedItemCode: line.resolvedItemCode,
        reason: exclusionReason,
      });
    } else {
      validResolvedLines.push(line);
    }
  }

  // 2. Club Requirements (Policy Section 2)
  const requirements: RequirementGroup[] = clubPrLines(validResolvedLines, policy.clubbing);

  // 3. Process Requirements in Requirement Date order (Policy Section 4.2)
  // Requirements consume ceiling in order of requirement date
  requirements.sort((a, b) => {
    const timeA = a.requirementDate.getTime();
    const timeB = b.requirementDate.getTime();
    if (timeA !== timeB) return timeA - timeB;
    return a.groupId.localeCompare(b.groupId);
  });

  const decisions: RequirementDecision[] = [];

  for (const req of requirements) {
    const itemPoHistory = masterData.poHistoryByItem
      ? masterData.poHistoryByItem.get(req.resolvedItemCode.toUpperCase()) || []
      : masterData.poHistory.filter(
          (p) => p.itemCode.toUpperCase() === req.resolvedItemCode.toUpperCase()
        );

    // 3a. Evaluate Rate Contracts (Policy Section 4)
    const contractResult = evaluateRequirementContract(
      req,
      clonedContracts,
      masterData.activeSupplierIds
    );

    // 3b. Calculate Valuation (Policy Section 3)
    const valuation = calculateRequirementValuation(
      req,
      contractResult,
      itemPoHistory,
      masterData.itemMasterMap,
      masterData.activeSupplierIds,
      policy.valuation.poHistoryWindowDays
    );

    req.unitPrice = valuation.unitPrice;
    req.groupValueInr = valuation.groupValueInr;
    req.priceSource = valuation.priceSource;
    req.priceExplanation = valuation.explanation;

    // 3c. Consume Contract Ceiling if valid contract will be used (Policy 4.2)
    if (
      contractResult.hasValidContract &&
      contractResult.selectedContract &&
      contractResult.requirementCostAtContractRate
    ) {
      req.selectedContractId = contractResult.selectedContract.contractId;
      req.selectedContractRate = contractResult.selectedRate;
      contractResult.selectedContract.consumedValue +=
        contractResult.requirementCostAtContractRate;
    }

    // 3d. Calculate Preferred Suppliers as of requirement date (Policy Section 6)
    const preferredSuppliers = !req.isNewItem
      ? calculatePreferredSuppliers(
          req.resolvedItemCode,
          req.requirementDate,
          itemPoHistory,
          clonedContracts,
          masterData.suppliersMap,
          policy.preferredSuppliers
        )
      : [];

    // 3e. Evaluate Decision Rules (Policy Section 5)
    const decision = evaluateRequirementDecision({
      requirement: req,
      contractResult,
      preferredSuppliers,
      poHistory: itemPoHistory,
      suppliersMap: masterData.suppliersMap,
      activeSupplierIds: masterData.activeSupplierIds,
      policy,
    });

    decisions.push(decision);
  }

  // 4. Consolidate POs (Policy Section 7)
  const { decisionsWithPoId, poGroups } = consolidatePurchaseOrders(
    decisions,
    policy.consolidation.poWindowHours || 24
  );

  // Map groupId -> RequirementDecision
  const decisionByGroupId = new Map<string, RequirementDecision>();
  for (const d of decisionsWithPoId) {
    decisionByGroupId.set(d.groupId, d);
  }

  // Map line key -> groupId
  const lineToGroupMap = new Map<string, { groupId: string; resolvedItemCode: string }>();
  for (const d of decisionsWithPoId) {
    for (const l of d.requirement.lines) {
      lineToGroupMap.set(`${l.pr_no}_${l.pr_line}`, {
        groupId: d.groupId,
        resolvedItemCode: l.resolvedItemCode,
      });
    }
  }

  // 5. Produce one row per original PR line in exact input order (Task Brief Section 4)
  const lineOutputs: LineDecisionOutput[] = originalLineKeys.map((key) => {
    const raw = rawLines.find((l) => `${l.pr_no}_${l.pr_line}` === key)!;

    // Check if this line was marked NOT_PROCESSED
    if (excludedLinesMap.has(key)) {
      const excl = excludedLinesMap.get(key)!;
      return {
        pr_no: raw.pr_no,
        pr_line: raw.pr_line,
        resolved_item_code: excl.resolvedItemCode,
        group_id: "",
        po_id: "",
        decision: "NOT_PROCESSED",
        route: "NOT_PROCESSED",
        supplier_id: "",
        unit_price: "",
        group_value_inr: 0,
        suggested_supplier_ids: "",
        policy_version: policy.version,
        reason: excl.reason,
      };
    }

    const mapping = lineToGroupMap.get(key)!;
    const decision = decisionByGroupId.get(mapping.groupId)!;

    const unitPriceStr =
      decision.decision === "PO" && decision.unitPrice !== undefined
        ? (Math.round(decision.unitPrice * 100) / 100).toString()
        : "";
    const suggestedStr =
      decision.decision === "SOURCING_REQUEST" && decision.suggestedSupplierIds
        ? decision.suggestedSupplierIds.join(";")
        : "";

    return {
      pr_no: raw.pr_no,
      pr_line: raw.pr_line,
      resolved_item_code: mapping.resolvedItemCode,
      group_id: decision.groupId,
      po_id: decision.decision === "PO" ? decision.poId || "" : "",
      decision: decision.decision,
      route: decision.route,
      supplier_id: decision.decision === "PO" ? decision.supplierId || "" : "",
      unit_price: unitPriceStr,
      group_value_inr: Math.round(decision.groupValueInr * 100) / 100,
      suggested_supplier_ids: suggestedStr,
      policy_version: decision.policyVersion,
      reason: decision.reason,
    };
  });

  // Generate downloadable CSV string with RFC 4180 escaping
  const csvContent = formatDecisionOutputsToCsv(lineOutputs);

  const totalPOs = poGroups.length;
  const totalSourcingRequests = decisionsWithPoId.filter(
    (d) => d.decision === "SOURCING_REQUEST"
  ).length;
  const totalNotProcessed = excludedLinesMap.size;

  return {
    policyVersion: policy.version,
    totalPrLines: rawLines.length,
    totalRequirements: decisionsWithPoId.length,
    totalPOs,
    totalSourcingRequests,
    totalNotProcessed,
    lineOutputs,
    requirements: decisionsWithPoId,
    poGroups,
    csvContent,
    executedAt: new Date().toISOString(),
  };
}

/**
 * Validates and parses raw CSV content into typed RawPrLine array.
 * Throws ValidationError before any processing if headers or mandatory row identifiers are invalid.
 */
export function parseRawPrBatchCsv(csvContent: string): RawPrLine[] {
  if (!csvContent || typeof csvContent !== "string" || !csvContent.trim()) {
    throw new ValidationError("PR batch CSV content cannot be empty.");
  }

  const parsed = Papa.parse<Record<string, string>>(csvContent.trim(), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const requiredHeaders = ["pr_no", "pr_line", "description", "quantity", "plant"];
  const headers = parsed.meta.fields || [];
  const missing = requiredHeaders.filter((rh) => !headers.includes(rh));
  if (missing.length > 0) {
    throw new ValidationError(`CSV missing required headers: ${missing.join(", ")}`);
  }

  if (!parsed.data || parsed.data.length === 0) {
    throw new ValidationError("PR batch CSV contains no data rows.");
  }

  const seenKeys = new Set<string>();
  const rows: RawPrLine[] = [];

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    const rowNum = i + 2; // 1-based + header row
    const prNo = row.pr_no?.trim();
    const prLineRaw = row.pr_line?.trim();
    const description = row.description?.trim();
    const plant = row.plant?.trim().toUpperCase();
    const qtyRaw = row.quantity?.trim();

    if (!prNo) {
      throw new ValidationError(`Row ${rowNum}: Missing mandatory field 'pr_no'.`);
    }
    const prLine = prLineRaw ? parseInt(prLineRaw, 10) : NaN;
    if (Number.isNaN(prLine) || prLine < 1) {
      throw new ValidationError(
        `Row ${rowNum} (${prNo}): Invalid or missing 'pr_line' ('${prLineRaw}').`
      );
    }
    if (!description) {
      throw new ValidationError(
        `Row ${rowNum} (${prNo}/${prLine}): Missing mandatory field 'description'.`
      );
    }
    if (!plant) {
      throw new ValidationError(
        `Row ${rowNum} (${prNo}/${prLine}): Missing mandatory field 'plant'.`
      );
    }
    if (qtyRaw === undefined || qtyRaw === "") {
      throw new ValidationError(
        `Row ${rowNum} (${prNo}/${prLine}): Missing mandatory field 'quantity'.`
      );
    }
    const quantity = Number(qtyRaw);
    if (Number.isNaN(quantity)) {
      throw new ValidationError(
        `Row ${rowNum} (${prNo}/${prLine}): Non-numeric 'quantity' ('${qtyRaw}').`
      );
    }

    const lineKey = `${prNo}_${prLine}`;
    if (seenKeys.has(lineKey)) {
      throw new ValidationError(
        `Row ${rowNum}: Duplicate PR line identifier '${prNo}/${prLine}' in batch.`
      );
    }
    seenKeys.add(lineKey);

    rows.push({
      pr_no: prNo,
      pr_line: prLine,
      created_at: row.created_at?.trim() || new Date().toISOString(),
      requester: row.requester?.trim() || "Unknown",
      department: row.department?.trim() || "General",
      plant,
      item_code: row.item_code?.trim().toUpperCase() || undefined,
      description,
      quantity,
      uom: row.uom?.trim().toUpperCase() || "NOS",
      estimated_unit_price: row.estimated_unit_price?.trim()
        ? parseFloat(row.estimated_unit_price.trim())
        : undefined,
      need_by_date: row.need_by_date?.trim() || new Date().toISOString(),
      urgency: (row.urgency?.trim().toLowerCase().includes("emerg")
        ? "Emergency"
        : row.urgency?.trim().toLowerCase().includes("urg")
        ? "Urgent"
        : "Normal") as "Normal" | "Urgent" | "Emergency",
    });
  }

  return rows;
}
