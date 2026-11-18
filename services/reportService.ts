import { SafeUser } from "@/types/auth";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import { sanitizeCsvCell } from "@/lib/utils";
import { loadMasterDataContext } from "./decision-engine/utils/masterDataLoader";
import { getPolicyConfig } from "./decision-engine/policy-config/policyService";
import {
  DEFAULT_INTELLIGENCE_REFERENCE_DATE,
  evaluateSupplierEligibility,
  analyzeSupplierPerformance,
} from "./supplierService";
import {
  listBatchProcessingRuns,
  getBatchProcessingRunById,
} from "./decision-engine/batch-processor/batchHistoryService";
import { LineDecisionOutput } from "./decision-engine/types/engine";
import { listRequisitions } from "./requisitionService";

export type ReportType =
  | "PROCUREMENT_SUMMARY"
  | "PURCHASE_ORDER_SUMMARY"
  | "SUPPLIER_PERFORMANCE_SUMMARY"
  | "REQUISITION_SUMMARY"
  | "SOURCING_ACTIVITY_SUMMARY";

export const VALID_REPORT_TYPES: ReportType[] = [
  "PROCUREMENT_SUMMARY",
  "PURCHASE_ORDER_SUMMARY",
  "SUPPLIER_PERFORMANCE_SUMMARY",
  "REQUISITION_SUMMARY",
  "SOURCING_ACTIVITY_SUMMARY",
];

export interface GenerateReportParams {
  reportType: ReportType;
  startDate?: string;
  endDate?: string;
  user: SafeUser;
}

export interface GeneratedReportResult {
  reportId: string;
  reportType: ReportType;
  title: string;
  description: string;
  generatedAt: string;
  generatedBy: string;
  dateRange: {
    startDate: string | null;
    endDate: string | null;
  };
  dataAvailable: boolean;
  unavailableReason?: string;
  summaryMetrics: Array<{
    label: string;
    value: string | number;
  }>;
  columns: string[];
  rows: Array<Record<string, string | number | null>>;
  csvContent: string;
}

/**
 * Validates optional startDate and endDate strings (YYYY-MM-DD or ISO).
 * Throws ValidationError if invalid or if startDate > endDate.
 */
export function parseAndValidateDateRange(
  startDateStr?: string,
  endDateStr?: string
): { startDate: Date | null; endDate: Date | null } {
  let startDate: Date | null = null;
  let endDate: Date | null = null;

  if (startDateStr && startDateStr.trim()) {
    const parsed = new Date(startDateStr.trim());
    if (Number.isNaN(parsed.getTime())) {
      throw new ValidationError(`Invalid startDate '${startDateStr}'. Expected YYYY-MM-DD.`);
    }
    parsed.setUTCHours(0, 0, 0, 0);
    startDate = parsed;
  }

  if (endDateStr && endDateStr.trim()) {
    const parsed = new Date(endDateStr.trim());
    if (Number.isNaN(parsed.getTime())) {
      throw new ValidationError(`Invalid endDate '${endDateStr}'. Expected YYYY-MM-DD.`);
    }
    parsed.setUTCHours(23, 59, 59, 999);
    endDate = parsed;
  }

  if (startDate && endDate && startDate.getTime() > endDate.getTime()) {
    throw new ValidationError(
      `Invalid date range: startDate (${startDateStr}) cannot be after endDate (${endDateStr}).`
    );
  }

  return { startDate, endDate };
}

function isWithinDateRange(
  dateVal: Date | string | null | undefined,
  startDate: Date | null,
  endDate: Date | null
): boolean {
  if (!startDate && !endDate) return true;
  if (!dateVal) return false;
  const d = typeof dateVal === "string" ? new Date(dateVal) : dateVal;
  if (Number.isNaN(d.getTime())) return false;
  if (startDate && d.getTime() < startDate.getTime()) return false;
  if (endDate && d.getTime() > endDate.getTime()) return false;
  return true;
}

function escapeCsvCell(value: string | number | null | undefined): string {
  return sanitizeCsvCell(value);
}

export function serializeReportToCsv(
  columns: string[],
  rows: Array<Record<string, string | number | null>>
): string {
  const headerLine = columns.map(escapeCsvCell).join(",");
  const dataLines = rows.map((row) =>
    columns.map((col) => escapeCsvCell(row[col])).join(",")
  );
  return [headerLine, ...dataLines].join("\n");
}

/**
 * Generates an accurate, non-fabricated report from live MongoDB / master-data / batch records.
 */
export async function generateProcurementReport(
  params: GenerateReportParams
): Promise<GeneratedReportResult> {
  const { reportType, startDate: rawStart, endDate: rawEnd, user } = params;

  if (!user || (user.role !== "BUYER" && user.role !== "PROCUREMENT_ADMIN")) {
    throw new ForbiddenError(
      "Access denied: Only BUYER and PROCUREMENT_ADMIN roles can generate compliance and spend reports."
    );
  }

  if (!VALID_REPORT_TYPES.includes(reportType)) {
    throw new ValidationError(`Unsupported reportType '${reportType}'.`);
  }

  const { startDate, endDate } = parseAndValidateDateRange(rawStart, rawEnd);

  const [masterData, policy, runsList, reqsResult] = await Promise.all([
    loadMasterDataContext(),
    getPolicyConfig(),
    listBatchProcessingRuns(user).catch(() => []),
    listRequisitions({ user, page: 1, limit: 200 }).catch(() => ({
      requisitions: [],
      meta: { total: 0 },
    })),
  ]);

  let latestRunDetail: Awaited<ReturnType<typeof getBatchProcessingRunById>> | null = null;
  if (runsList.length > 0) {
    latestRunDetail = await getBatchProcessingRunById(runsList[0].runId, user).catch(
      () => null
    );
  }

  const nowIso = new Date().toISOString();
  const reportId = `RPT-${reportType.slice(0, 4)}-${Date.now()}`;
  const dateRangeMeta = {
    startDate: startDate ? startDate.toISOString().slice(0, 10) : null,
    endDate: endDate ? endDate.toISOString().slice(0, 10) : null,
  };

  // 1. SUPPLIER_PERFORMANCE_SUMMARY
  if (reportType === "SUPPLIER_PERFORMANCE_SUMMARY") {
    const asOfDate = endDate || DEFAULT_INTELLIGENCE_REFERENCE_DATE;
    const suppliers = Array.from(masterData.suppliersMap.values()).sort((a, b) =>
      a.supplierId.localeCompare(b.supplierId)
    );

    const filteredPoHistory = masterData.poHistory.filter((po) =>
      isWithinDateRange(po.poDate, startDate, endDate)
    );

    const columns = [
      "supplier_id",
      "supplier_name",
      "city",
      "status",
      "categories",
      "preferred_eligible",
      "po_count_in_period",
      "po_count_548d",
      "historical_spend_inr",
      "on_time_pct",
      "quality_rating",
      "current_valid_contracts",
      "historical_contracts",
    ];

    const rows = suppliers.map((supp) => {
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
      const periodPos = filteredPoHistory.filter(
        (po) => po.supplierId.toUpperCase() === supp.supplierId.toUpperCase()
      );
      const periodSpend = periodPos.reduce(
        (sum, po) => sum + po.quantity * po.unitPrice,
        0
      );

      return {
        supplier_id: supp.supplierId,
        supplier_name: supp.name,
        city: supp.city || "",
        status: supp.status,
        categories: supp.categories,
        preferred_eligible: elig.isPreferredEligible ? "Yes" : "No",
        po_count_in_period: periodPos.length,
        po_count_548d: perf.poCountIn548d,
        historical_spend_inr: Math.round(periodSpend * 100) / 100,
        on_time_pct: perf.deliveryPerformance.available
          ? perf.deliveryPerformance.onTimePercent
          : "Not Available",
        quality_rating: perf.qualityPerformance.available
          ? perf.qualityPerformance.qualityRating
          : "Not Available",
        current_valid_contracts: perf.contractSummary.currentValidContracts,
        historical_contracts: perf.contractSummary.totalContracts,
      };
    });

    const activeCount = suppliers.filter((s) => s.status === "Active").length;
    const blockedCount = suppliers.filter((s) => s.status === "Blocked").length;
    const totalPeriodSpend = rows.reduce(
      (sum, r) => sum + Number(r.historical_spend_inr || 0),
      0
    );

    return {
      reportId,
      reportType,
      title: "Supplier Performance & Eligibility Summary",
      description:
        "Supplier master statuses, OTD & quality metrics (null preserved as Not Available), contract counts, and historical spend.",
      generatedAt: nowIso,
      generatedBy: user.email,
      dateRange: dateRangeMeta,
      dataAvailable: rows.length > 0,
      summaryMetrics: [
        { label: "Total Suppliers", value: rows.length },
        { label: "Active Suppliers", value: activeCount },
        { label: "Blocked Suppliers", value: blockedCount },
        {
          label: "Period PO Spend (INR)",
          value: `₹${Math.round(totalPeriodSpend).toLocaleString("en-IN")}`,
        },
      ],
      columns,
      rows,
      csvContent: serializeReportToCsv(columns, rows),
    };
  }

  // 2. PURCHASE_ORDER_SUMMARY
  if (reportType === "PURCHASE_ORDER_SUMMARY") {
    const filteredHistoryPos = masterData.poHistory
      .filter((po) => isWithinDateRange(po.poDate, startDate, endDate))
      .sort(
        (a, b) =>
          b.poDate.getTime() - a.poDate.getTime() ||
          b.poNumber.localeCompare(a.poNumber)
      );

    const proposedPoGroups = (latestRunDetail?.poGroups || []).filter((pg) =>
      isWithinDateRange(pg.firstRequirementDate, startDate, endDate)
    );

    const columns = [
      "record_type",
      "po_identifier",
      "po_date",
      "supplier_id",
      "supplier_name",
      "plant",
      "route_or_item",
      "line_count",
      "total_value_inr",
      "status_or_delivery",
    ];

    const rows: Array<Record<string, string | number | null>> = [
      ...proposedPoGroups.map((pg) => ({
        record_type: "PROPOSED_PO_GROUP",
        po_identifier: pg.poId,
        po_date: new Date(pg.firstRequirementDate).toISOString().slice(0, 10),
        supplier_id: pg.supplierId,
        supplier_name: pg.supplierName || pg.supplierId,
        plant: pg.plant,
        route_or_item: pg.route,
        line_count: pg.prReferences.length,
        total_value_inr: Math.round(pg.totalValueInr * 100) / 100,
        status_or_delivery: pg.status || "PROPOSED",
      })),
      ...filteredHistoryPos.map((po) => {
        const supp = masterData.suppliersMap.get(po.supplierId);
        return {
          record_type: "HISTORICAL_PO",
          po_identifier: po.poNumber,
          po_date: po.poDate.toISOString().slice(0, 10),
          supplier_id: po.supplierId,
          supplier_name: supp?.name || po.supplierId,
          plant: po.plant,
          route_or_item: po.itemCode,
          line_count: 1,
          total_value_inr: Math.round(po.quantity * po.unitPrice * 100) / 100,
          status_or_delivery: po.deliveredOnTime
            ? "DELIVERED_ON_TIME"
            : "DELIVERED_LATE",
        };
      }),
    ];

    const totalValueInr = rows.reduce(
      (sum, r) => sum + Number(r.total_value_inr || 0),
      0
    );

    return {
      reportId,
      reportType,
      title: "Purchase Order Summary Report",
      description:
        "Consolidated proposed PO groups and historical purchase order transactions within the selected date window.",
      generatedAt: nowIso,
      generatedBy: user.email,
      dateRange: dateRangeMeta,
      dataAvailable: rows.length > 0,
      unavailableReason:
        rows.length === 0
          ? "No purchase orders matched the selected date range."
          : undefined,
      summaryMetrics: [
        { label: "Total PO Records", value: rows.length },
        { label: "Proposed PO Groups", value: proposedPoGroups.length },
        { label: "Historical POs", value: filteredHistoryPos.length },
        {
          label: "Total Value (INR)",
          value: `₹${Math.round(totalValueInr).toLocaleString("en-IN")}`,
        },
      ],
      columns,
      rows,
      csvContent: serializeReportToCsv(columns, rows),
    };
  }

  // 3. REQUISITION_SUMMARY
  if (reportType === "REQUISITION_SUMMARY") {
    const dbRequisitions = (reqsResult.requisitions || []).filter((r: any) =>
      isWithinDateRange(r.createdAt, startDate, endDate)
    );

    const lineDecisionMap = new Map<string, LineDecisionOutput>();
    for (const lo of latestRunDetail?.lineOutputs || []) {
      lineDecisionMap.set(`${lo.pr_no}:${lo.pr_line}`, lo);
    }

    const batchEvaluatedLines: Array<{
      prNo: string;
      prLine: number;
      createdAt: Date | string;
      plant: string;
      itemCode: string;
      description: string;
      quantity: number;
      uom: string;
      urgency: string;
      estimatedValueInr: number;
      decisionStatus: string;
    }> = [];

    const includedPrLineKeys = new Set<string>();
    for (const reqDec of latestRunDetail?.requirements || []) {
      for (const line of reqDec.requirement?.lines || []) {
        includedPrLineKeys.add(`${line.pr_no}:${line.pr_line}`);
        if (isWithinDateRange(line.created_at, startDate, endDate)) {
          const lo = lineDecisionMap.get(`${line.pr_no}:${line.pr_line}`);
          const unitVal =
            reqDec.unitPrice ||
            reqDec.requirement.unitPrice ||
            line.estimated_unit_price ||
            0;
          batchEvaluatedLines.push({
            prNo: line.pr_no,
            prLine: line.pr_line,
            createdAt: line.created_at,
            plant: line.plant,
            itemCode: line.resolvedItemCode || line.item_code || "UNMATCHED",
            description: line.description,
            quantity: line.quantity,
            uom: line.uom,
            urgency: line.urgency,
            estimatedValueInr: Math.round(line.quantity * unitVal * 100) / 100,
            decisionStatus: lo
              ? `${lo.decision} (${lo.route})`
              : `${reqDec.decision} (${reqDec.route})`,
          });
        }
      }
    }

    // Also include NOT_PROCESSED lines from lineOutputs when no restrictive date filter excludes them
    if (!startDate && !endDate) {
      for (const lo of latestRunDetail?.lineOutputs || []) {
        const key = `${lo.pr_no}:${lo.pr_line}`;
        if (!includedPrLineKeys.has(key)) {
          batchEvaluatedLines.push({
            prNo: lo.pr_no,
            prLine: lo.pr_line,
            createdAt: latestRunDetail?.executedAt || nowIso,
            plant: "OUT_OF_SCOPE",
            itemCode: lo.resolved_item_code || "N/A",
            description: lo.reason || "Excluded line",
            quantity: 0,
            uom: "N/A",
            urgency: "Normal",
            estimatedValueInr: 0,
            decisionStatus: `${lo.decision} (${lo.route})`,
          });
        }
      }
    }

    const columns = [
      "source",
      "pr_no",
      "pr_line",
      "created_at",
      "plant",
      "item_code",
      "description",
      "quantity",
      "uom",
      "urgency",
      "estimated_value_inr",
      "decision_or_status",
    ];

    const rows: Array<Record<string, string | number | null>> = [
      ...dbRequisitions.map((r: any) => ({
        source: String(r.source || "chat"),
        pr_no: String(r.prNo),
        pr_line: Number(r.linesCount || 1),
        created_at: r.createdAt
          ? new Date(r.createdAt).toISOString().slice(0, 10)
          : "",
        plant: String(r.plantCode || "PUN1"),
        item_code: "MULTI_LINE",
        description: `${r.department || "General"} requisition (${
          r.requesterName || "Requester"
        })`,
        quantity: Number(r.linesCount || 1),
        uom: "LINES",
        urgency: String(r.urgency || "Normal"),
        estimated_value_inr:
          Math.round(Number(r.totalEstimatedAmount || 0) * 100) / 100,
        decision_or_status: String(r.status || "SUBMITTED"),
      })),
      ...batchEvaluatedLines.map((l) => ({
        source: "batch_evaluation",
        pr_no: l.prNo,
        pr_line: l.prLine,
        created_at: new Date(l.createdAt).toISOString().slice(0, 10),
        plant: l.plant,
        item_code: l.itemCode,
        description: l.description,
        quantity: l.quantity,
        uom: l.uom,
        urgency: l.urgency,
        estimated_value_inr: l.estimatedValueInr,
        decision_or_status: l.decisionStatus,
      })),
    ];

    const totalEstimatedInr = rows.reduce(
      (sum, r) => sum + Number(r.estimated_value_inr || 0),
      0
    );

    return {
      reportId,
      reportType,
      title: "Purchase Requisition Summary Report",
      description:
        "Submitted purchase requisitions and evaluated batch PR lines with plant, urgency, and valuation breakdown.",
      generatedAt: nowIso,
      generatedBy: user.email,
      dateRange: dateRangeMeta,
      dataAvailable: rows.length > 0,
      unavailableReason:
        rows.length === 0
          ? "No purchase requisitions or evaluated PR lines found for the selected date range."
          : undefined,
      summaryMetrics: [
        { label: "Total Requisition Rows", value: rows.length },
        { label: "Intake Requisitions", value: dbRequisitions.length },
        { label: "Evaluated Batch Lines", value: batchEvaluatedLines.length },
        {
          label: "Total Estimated Value",
          value: `₹${Math.round(totalEstimatedInr).toLocaleString("en-IN")}`,
        },
      ],
      columns,
      rows,
      csvContent: serializeReportToCsv(columns, rows),
    };
  }

  // 4. SOURCING_ACTIVITY_SUMMARY
  if (reportType === "SOURCING_ACTIVITY_SUMMARY") {
    const sourcingReqs = (latestRunDetail?.requirements || []).filter(
      (req) =>
        req.decision === "SOURCING_REQUEST" &&
        isWithinDateRange(
          req.requirement?.requirementDate,
          startDate,
          endDate
        )
    );

    const columns = [
      "requirement_id",
      "created_date",
      "plant",
      "item_code",
      "description",
      "total_quantity",
      "uom",
      "group_value_inr",
      "sourcing_route",
      "suggested_suppliers",
      "source_pr_lines",
    ];

    const rows: Array<Record<string, string | number | null>> = sourcingReqs.map(
      (req) => ({
        requirement_id: req.groupId,
        created_date: req.requirement?.requirementDate
          ? new Date(req.requirement.requirementDate)
              .toISOString()
              .slice(0, 10)
          : "",
        plant: req.plant || req.requirement?.plant || "PUN1",
        item_code:
          req.resolvedItemCode ||
          req.requirement?.resolvedItemCode ||
          "UNMATCHED",
        description:
          req.requirement?.lines?.[0]?.description ||
          req.resolvedItemCode ||
          "Sourcing Requirement",
        total_quantity: req.requirement?.totalQuantity || 0,
        uom: req.requirement?.uom || "NOS",
        group_value_inr: Math.round(req.groupValueInr * 100) / 100,
        sourcing_route: req.route,
        suggested_suppliers:
          (req.suggestedSupplierIds || []).join("; ") || "None",
        source_pr_lines: (req.prReferences || [])
          .map((ref) => `${ref.prNo}-${ref.prLine}`)
          .join("; "),
      })
    );

    const totalSourcingValue = rows.reduce(
      (sum, r) => sum + Number(r.group_value_inr || 0),
      0
    );

    return {
      reportId,
      reportType,
      title: "Sourcing Activity Summary (RFQ / RFP / Capex)",
      description:
        "Requirements routed to competitive sourcing events with suggested suppliers and clubbed valuations.",
      generatedAt: nowIso,
      generatedBy: user.email,
      dateRange: dateRangeMeta,
      dataAvailable: rows.length > 0,
      unavailableReason: !latestRunDetail
        ? "No processed batch run exists yet. Execute a batch run in Decision Workspace to populate sourcing events."
        : rows.length === 0
        ? "No sourcing requests matched the selected date range."
        : undefined,
      summaryMetrics: [
        { label: "Sourcing Events", value: rows.length },
        {
          label: "RFQ Count",
          value: sourcingReqs.filter((r) => r.route.includes("RFQ")).length,
        },
        {
          label: "RFP / Capex Count",
          value: sourcingReqs.filter(
            (r) => r.route.includes("RFP") || r.route.includes("CAPEX")
          ).length,
        },
        {
          label: "Total Sourcing Spend",
          value: `₹${Math.round(totalSourcingValue).toLocaleString("en-IN")}`,
        },
      ],
      columns,
      rows,
      csvContent: serializeReportToCsv(columns, rows),
    };
  }

  // 5. PROCUREMENT_SUMMARY (Executive Overview across routes, plants, contracts, and suppliers)
  const requirements = (latestRunDetail?.requirements || []).filter((req) =>
    isWithinDateRange(req.requirement?.requirementDate, startDate, endDate)
  );

  const routeMap = new Map<
    string,
    { route: string; decision: string; count: number; totalValueInr: number }
  >();

  for (const req of requirements) {
    const key = `${req.decision}:${req.route}`;
    const existing = routeMap.get(key) || {
      route: req.route,
      decision: req.decision,
      count: 0,
      totalValueInr: 0,
    };
    existing.count += 1;
    existing.totalValueInr += req.groupValueInr || 0;
    routeMap.set(key, existing);
  }

  const columns = [
    "category_type",
    "metric_or_route",
    "decision_outcome",
    "record_count",
    "total_value_inr",
    "policy_version",
  ];

  const rows: Array<Record<string, string | number | null>> = [
    ...Array.from(routeMap.values()).map((r) => ({
      category_type: "DECISION_ROUTE",
      metric_or_route: r.route,
      decision_outcome: r.decision,
      record_count: r.count,
      total_value_inr: Math.round(r.totalValueInr * 100) / 100,
      policy_version: latestRunDetail?.policyVersion || policy.version,
    })),
    {
      category_type: "MASTER_DATA",
      metric_or_route: "ACTIVE_SUPPLIERS",
      decision_outcome: "ELIGIBLE_POOL",
      record_count: masterData.activeSupplierIds.size,
      total_value_inr: 0,
      policy_version: policy.version,
    },
    {
      category_type: "MASTER_DATA",
      metric_or_route: "RATE_CONTRACTS",
      decision_outcome: "REGISTERED",
      record_count: masterData.contracts.length,
      total_value_inr: Math.round(
        masterData.contracts.reduce((s, c) => s + c.valueCap, 0) * 100
      ) / 100,
      policy_version: policy.version,
    },
  ];

  const totalEvaluatedSpend = requirements.reduce(
    (sum, r) => sum + (r.groupValueInr || 0),
    0
  );

  return {
    reportId,
    reportType,
    title: "Executive Procurement Summary Report",
    description:
      "Aggregated procurement route distribution, active supplier capacity, and contract ceiling commitments.",
    generatedAt: nowIso,
    generatedBy: user.email,
    dateRange: dateRangeMeta,
    dataAvailable: rows.length > 0,
    summaryMetrics: [
      { label: "Evaluated Requirements", value: requirements.length },
      { label: "Active Suppliers", value: masterData.activeSupplierIds.size },
      { label: "Rate Contracts", value: masterData.contracts.length },
      {
        label: "Evaluated Spend (INR)",
        value: `₹${Math.round(totalEvaluatedSpend).toLocaleString("en-IN")}`,
      },
    ],
    columns,
    rows,
    csvContent: serializeReportToCsv(columns, rows),
  };
}
