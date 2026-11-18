"use client";

import * as React from "react";
import {
  Search,
  RefreshCw,
  FileCheck2,
  Download,
  Upload,
  Play,
  Eye,
  ShieldCheck,
  AlertTriangle,
  Layers,
  Building2,
  Package,
  FileSignature,
  CheckCircle2,
  Clock,
  ArrowUpDown,
  History,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  BatchProcessingResult,
  LineDecisionOutput,
  RequirementDecision,
} from "@/services/decision-engine/types/engine";
import { BatchRunSummary } from "@/services/decision-engine/batch-processor/batchHistoryService";

interface EnrichedLineRow extends LineDecisionOutput {
  itemDescription: string;
  originalDescription: string;
  plant: string;
  quantity: number;
  uom: string;
  urgency: string;
  createdAt: string;
  needByDate: string;
  supplierName?: string;
  requirementDecision?: RequirementDecision;
}

export interface BuyerDecisionWorkspaceProps {
  initialTab?: "decisions" | "proposed-pos" | "sourcing";
}

export function BuyerDecisionWorkspace({
  initialTab = "decisions",
}: BuyerDecisionWorkspaceProps = {}) {
  const { toast } = useToast();

  // Run history & active batch result
  const [runs, setRuns] = React.useState<BatchRunSummary[]>([]);
  const [activeRun, setActiveRun] = React.useState<BatchProcessingResult | null>(null);
  const [selectedRunId, setSelectedRunId] = React.useState<string>("");
  const [loading, setLoading] = React.useState<boolean>(true);
  const [isProcessing, setIsProcessing] = React.useState<boolean>(false);
  const [errorBanner, setErrorBanner] = React.useState<string | null>(null);

  // Active workspace tab: "decisions" | "proposed-pos" | "sourcing"
  const [activeTab, setActiveTab] = React.useState<"decisions" | "proposed-pos" | "sourcing">(
    initialTab
  );

  // Filters & search for Decisions table
  const [searchQuery, setSearchQuery] = React.useState("");
  const [decisionFilter, setDecisionFilter] = React.useState<string>("ALL");
  const [routeFilter, setRouteFilter] = React.useState<string>("ALL");
  const [plantFilter, setPlantFilter] = React.useState<string>("ALL");
  const [sortBy, setSortBy] = React.useState<"line" | "value_desc" | "value_asc" | "route">("line");
  const [page, setPage] = React.useState(1);
  const pageSize = 15;

  // Sourcing sub-filter
  const [sourcingRouteFilter, setSourcingRouteFilter] = React.useState<string>("ALL");

  // Modals
  const [selectedLineRow, setSelectedLineRow] = React.useState<EnrichedLineRow | null>(null);
  const [detailsOpen, setDetailsOpen] = React.useState(false);

  const [selectedPoGroup, setSelectedPoGroup] = React.useState<any | null>(null);
  const [poDetailsOpen, setPoDetailsOpen] = React.useState(false);

  const [uploadDialogOpen, setUploadDialogOpen] = React.useState(false);
  const [policyVersionInput, setPolicyVersionInput] = React.useState("5.0");

  const formatInr = (val?: number | string) => {
    if (val === undefined || val === null || val === "") return "—";
    const num = typeof val === "string" ? parseFloat(val) : val;
    if (Number.isNaN(num)) return "—";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(num);
  };

  // Load run details by runId
  const loadRunById = React.useCallback(async (runId: string) => {
    setLoading(true);
    setErrorBanner(null);
    try {
      const res = await fetch(`/api/process-batch/${encodeURIComponent(runId)}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || "Failed to load batch run details");
      }
      setActiveRun(json.data);
      setSelectedRunId(json.data.runId || runId);
      setPage(1);
    } catch (err: any) {
      setErrorBanner(err.message || "Could not load batch processing run");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load processing history list
  const fetchHistory = React.useCallback(async () => {
    setLoading(true);
    setErrorBanner(null);
    try {
      const res = await fetch("/api/process-batch");
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || "Failed to load processing history");
      }
      const list: BatchRunSummary[] = json.data || [];
      setRuns(list);
      if (list.length > 0) {
        await loadRunById(list[0].runId);
      } else {
        setActiveRun(null);
        setLoading(false);
      }
    } catch (err: any) {
      setErrorBanner(err.message || "Failed to load buyer decision workspace");
      setLoading(false);
    }
  }, [loadRunById]);

  React.useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Execute bundled sample batch (186 lines)
  const handleRunSampleBatch = async () => {
    setIsProcessing(true);
    setErrorBanner(null);
    try {
      const res = await fetch("/api/process-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          useSampleBatch: true,
          policyVersion: policyVersionInput || "5.0",
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || "Failed to process sample PR batch");
      }
      const data: BatchProcessingResult = json.data;
      setActiveRun(data);
      setSelectedRunId(data.runId || "");
      setPage(1);
      toast({
        title: data.isDuplicateSubmission
          ? "Idempotent Batch Retrieved"
          : "Batch Processed Successfully",
        description: `Processed ${data.totalPrLines} PR lines into ${data.totalPOs} proposed POs and ${data.totalSourcingRequests} sourcing requests under Policy v${data.policyVersion}.`,
      });
      // Refresh run history list
      const histRes = await fetch("/api/process-batch");
      const histJson = await histRes.json();
      if (histJson.success) setRuns(histJson.data || []);
    } catch (err: any) {
      setErrorBanner(err.message || "Batch execution failed");
      toast({
        title: "Batch Processing Error",
        description: err.message || "Could not process batch",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Upload custom CSV batch
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setErrorBanner(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("policyVersion", policyVersionInput || "5.0");

      const res = await fetch("/api/process-batch", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || "CSV validation or processing failed");
      }
      const data: BatchProcessingResult = json.data;
      setActiveRun(data);
      setSelectedRunId(data.runId || "");
      setUploadDialogOpen(false);
      setPage(1);
      toast({
        title: data.isDuplicateSubmission ? "Existing Run Loaded" : "Batch Processed",
        description: `${file.name}: ${data.totalPrLines} lines processed under Policy v${data.policyVersion}.`,
      });
      const histRes = await fetch("/api/process-batch");
      const histJson = await histRes.json();
      if (histJson.success) setRuns(histJson.data || []);
    } catch (err: any) {
      toast({
        title: "Validation Error",
        description: err.message || "Invalid PR batch CSV",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      e.target.value = "";
    }
  };

  // Download CSV for current run
  const handleExportCsv = () => {
    if (!activeRun) return;
    if (activeRun.runId) {
      window.open(`/api/process-batch/${encodeURIComponent(activeRun.runId)}/export`, "_blank");
      return;
    }
    const blob = new Blob([activeRun.csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `decisions_v${activeRun.policyVersion}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Build enriched line rows by joining activeRun.lineOutputs with activeRun.requirements
  const enrichedRows: EnrichedLineRow[] = React.useMemo(() => {
    if (!activeRun) return [];

    const reqByGroupId = new Map<string, RequirementDecision>();
    const lineMetaMap = new Map<
      string,
      {
        line: any;
        reqDecision: RequirementDecision;
      }
    >();

    for (const r of activeRun.requirements || []) {
      reqByGroupId.set(r.groupId, r);
      for (const l of r.requirement?.lines || []) {
        lineMetaMap.set(`${l.pr_no}_${l.pr_line}`, {
          line: l,
          reqDecision: r,
        });
      }
    }

    return (activeRun.lineOutputs || []).map((out) => {
      const key = `${out.pr_no}_${out.pr_line}`;
      const found = lineMetaMap.get(key);
      const lineObj = found?.line;
      const reqDec = found?.reqDecision || (out.group_id ? reqByGroupId.get(out.group_id) : undefined);

      return {
        ...out,
        itemDescription:
          lineObj?.description ||
          (out.resolved_item_code === "NEW" ? "Unmatched / Custom Item" : out.resolved_item_code),
        originalDescription: lineObj?.description || out.resolved_item_code,
        plant: lineObj?.plant || reqDec?.requirement?.plant || "—",
        quantity: lineObj?.quantity ?? 0,
        uom: lineObj?.uom || reqDec?.requirement?.uom || "NOS",
        urgency: lineObj?.urgency || (reqDec?.requirement?.isEmergency ? "Emergency" : "Normal"),
        createdAt: lineObj?.created_at || "",
        needByDate: lineObj?.need_by_date || "",
        supplierName: reqDec?.supplierName,
        requirementDecision: reqDec,
      };
    });
  }, [activeRun]);

  // Overview KPI calculations
  const overviewMetrics = React.useMemo(() => {
    if (!activeRun) {
      return {
        totalLines: 0,
        proposedPoCount: 0,
        sourcingRequestCount: 0,
        newItemCount: 0,
        notProcessedCount: 0,
        totalProcurementValue: 0,
      };
    }

    const newItemCount = (activeRun.lineOutputs || []).filter(
      (l) => l.resolved_item_code === "NEW" || l.route === "NEW_ITEM_SOURCING"
    ).length;

    const notProcessedCount =
      activeRun.totalNotProcessed ??
      (activeRun.lineOutputs || []).filter((l) => l.route === "NOT_PROCESSED").length;

    const totalProcurementValue = (activeRun.requirements || []).reduce(
      (acc, r) => acc + (r.groupValueInr || 0),
      0
    );

    return {
      totalLines: activeRun.totalPrLines || 0,
      proposedPoCount: activeRun.totalPOs || 0,
      sourcingRequestCount: activeRun.totalSourcingRequests || 0,
      newItemCount,
      notProcessedCount,
      totalProcurementValue,
    };
  }, [activeRun]);

  // Filtered & sorted rows for Decision Table
  const filteredDecisionRows = React.useMemo(() => {
    let list = [...enrichedRows];

    if (decisionFilter !== "ALL") {
      list = list.filter((r) => r.decision === decisionFilter);
    }

    if (routeFilter !== "ALL") {
      list = list.filter((r) => r.route === routeFilter);
    }

    if (plantFilter !== "ALL") {
      list = list.filter((r) => r.plant === plantFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.pr_no.toLowerCase().includes(q) ||
          r.resolved_item_code.toLowerCase().includes(q) ||
          r.itemDescription.toLowerCase().includes(q) ||
          r.group_id.toLowerCase().includes(q) ||
          r.po_id.toLowerCase().includes(q) ||
          r.supplier_id.toLowerCase().includes(q)
      );
    }

    if (sortBy === "value_desc") {
      list.sort((a, b) => b.group_value_inr - a.group_value_inr);
    } else if (sortBy === "value_asc") {
      list.sort((a, b) => a.group_value_inr - b.group_value_inr);
    } else if (sortBy === "route") {
      list.sort((a, b) => a.route.localeCompare(b.route));
    }

    return list;
  }, [enrichedRows, decisionFilter, routeFilter, plantFilter, searchQuery, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredDecisionRows.length / pageSize));
  const pagedDecisionRows = filteredDecisionRows.slice((page - 1) * pageSize, page * pageSize);

  // Sourcing requirements list for Tab 3
  const sourcingRequirements = React.useMemo(() => {
    if (!activeRun) return [];
    let list = (activeRun.requirements || []).filter((r) => r.decision === "SOURCING_REQUEST");
    if (sourcingRouteFilter !== "ALL") {
      list = list.filter((r) => r.route === sourcingRouteFilter);
    }
    return list;
  }, [activeRun, sourcingRouteFilter]);

  const getRouteBadgeClass = (route: string) => {
    switch (route) {
      case "CONTRACT_PO":
        return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20";
      case "SPOT_PO":
        return "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20";
      case "EMERGENCY_PO":
        return "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20";
      case "RFQ":
        return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20";
      case "RFP":
        return "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20";
      case "CAPEX_SOURCING":
        return "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20";
      case "NEW_ITEM_SOURCING":
        return "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  return (
    <div className="space-y-6">
      {/* Workspace Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-[#EAEAEA] pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[#171717]">
            Buyer Decision Workspace
          </h1>
          <p className="text-xs sm:text-sm font-normal text-[#6B7280] mt-1">
            Review evaluated PR lines, consolidated proposed POs, and sourcing events.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Processing Run Selector */}
          {runs.length > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 h-9 text-xs font-medium">
              <History className="h-3.5 w-3.5 text-[#6938EF] shrink-0" />
              <select
                value={selectedRunId}
                onChange={(e) => loadRunById(e.target.value)}
                className="bg-transparent text-xs font-mono font-medium text-[#171717] focus:outline-none"
                aria-label="Select processing run"
              >
                {runs.map((r) => (
                  <option key={r.runId} value={r.runId}>
                    {r.runId} (v{r.policyVersion} &bull; {r.totalPrLines} lines)
                  </option>
                ))}
              </select>
            </div>
          )}

          <Button
            variant="outline"
            onClick={() => setUploadDialogOpen(true)}
            disabled={isProcessing}
            className="rounded-xl border-[#E5E7EB] bg-white h-9 text-xs font-medium gap-1.5 px-3.5"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Upload CSV</span>
          </Button>

          <Button
            variant="outline"
            onClick={handleExportCsv}
            disabled={!activeRun}
            className="rounded-xl border-[#E5E7EB] bg-white h-9 text-xs font-medium gap-1.5 px-3.5"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </Button>

          <Button
            onClick={handleRunSampleBatch}
            disabled={isProcessing}
            className="rounded-xl bg-[#6938EF] hover:bg-[#5928DF] text-white h-9 text-xs font-medium gap-1.5 px-3.5"
          >
            <Play className="h-3.5 w-3.5" />
            <span>{isProcessing ? "Processing..." : "Run Sample Batch"}</span>
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {errorBanner && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs font-medium text-red-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{errorBanner}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setErrorBanner(null)} className="h-7 text-xs font-medium">
            Dismiss
          </Button>
        </div>
      )}

      {/* Overview KPI Cards */}
      {activeRun && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl bg-[#FFF2CC] border border-amber-200/60 p-5 space-y-1.5">
            <div className="text-xs font-medium text-[#4B5563]">
              PR Lines Processed
            </div>
            <div className="text-3xl font-semibold text-[#171717] tracking-tight">
              {overviewMetrics.totalLines}
            </div>
            <div className="text-xs font-normal text-[#4B5563]">
              {activeRun.totalRequirements} requirements
              {overviewMetrics.notProcessedCount > 0
                ? ` • ${overviewMetrics.notProcessedCount} excluded`
                : ""}
            </div>
          </div>

          <div className="rounded-2xl bg-[#DDF3FF] border border-sky-200/60 p-5 space-y-1.5">
            <div className="text-xs font-medium text-[#4B5563]">
              Proposed POs
            </div>
            <div className="text-3xl font-semibold text-[#171717] tracking-tight">
              {overviewMetrics.proposedPoCount}
            </div>
            <div className="text-xs font-normal text-[#4B5563]">
              Consolidated (Pending Review)
            </div>
          </div>

          <div className="rounded-2xl bg-[#FCE3EF] border border-pink-200/60 p-5 space-y-1.5">
            <div className="text-xs font-medium text-[#4B5563]">
              Sourcing Requests
            </div>
            <div className="text-3xl font-semibold text-[#171717] tracking-tight">
              {overviewMetrics.sourcingRequestCount}
            </div>
            <div className="text-xs font-normal text-[#4B5563]">
              RFQ, RFP, Capex &amp; {overviewMetrics.newItemCount} New Item
            </div>
          </div>

          <div className="rounded-2xl bg-[#D9FAF5] border border-teal-200/60 p-5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#4B5563]">
                Total Value (INR)
              </span>
              <span className="rounded-md bg-white/90 px-2 py-0.5 text-[11px] font-medium text-[#171717]">
                v{activeRun.policyVersion}
              </span>
            </div>
            <div className="text-2xl font-semibold text-[#171717] tracking-tight truncate">
              {formatInr(overviewMetrics.totalProcurementValue)}
            </div>
            <div className="text-xs font-normal text-[#4B5563] truncate">
              Run: {activeRun.runId || "Active"}
            </div>
          </div>
        </div>
      )}

      {/* Workspace Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-[#EAEAEA]">
        <div className="flex flex-wrap items-center gap-2 pb-2.5">
          {[
            {
              id: "decisions" as const,
              label: `All PR Line Decisions (${enrichedRows.length})`,
            },
            {
              id: "proposed-pos" as const,
              label: `Proposed Purchase Orders (${activeRun?.poGroups?.length || 0})`,
            },
            {
              id: "sourcing" as const,
              label: `Sourcing Requests (${activeRun?.totalSourcingRequests || 0})`,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-xl px-4 py-2 text-xs sm:text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-[#6938EF] text-white shadow-2xs"
                  : "bg-white border border-[#EAEAEA] text-[#4B5563] hover:bg-[#F5F5F7] hover:text-[#171717]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading or Empty State */}
      {loading ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center text-xs text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 opacity-60" />
          Loading procurement decision workspace...
        </div>
      ) : !activeRun ? (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <EmptyState
            icon={FileCheck2}
            title="No Processed Procurement Decisions Yet"
            description="Execute the deterministic Corvo Engineering Policy v5.0 decision engine on the 186-line sample PR batch or upload a PR batch CSV to inspect line decisions, proposed POs, and sourcing requests."
            badge="Decision Engine Ready"
            actionLabel="Run Sample PR Batch (186 Lines)"
            onAction={handleRunSampleBatch}
            secondaryActionLabel="Upload Custom CSV"
            onSecondaryAction={() => setUploadDialogOpen(true)}
            className="border-0"
          />
        </div>
      ) : activeTab === "decisions" ? (
        /* TAB 1: DECISION TABLE */
        <div className="space-y-3">
          {/* Search & Filters Bar */}
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 items-center gap-2 max-w-md">
              <div className="relative w-full">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search by PR #, item code, description, group ID, or PO #..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  className="pl-8 h-8 text-xs"
                />
              </div>
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchQuery("");
                    setPage(1);
                  }}
                  className="h-8 text-xs px-2"
                >
                  Clear
                </Button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {/* Decision Filter */}
              <div className="flex items-center rounded-md border border-input bg-card p-0.5">
                <span className="px-2 text-[11px] text-muted-foreground font-medium">Decision:</span>
                {["ALL", "PO", "SOURCING_REQUEST", "NOT_PROCESSED"].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setDecisionFilter(d);
                      setPage(1);
                    }}
                    className={`rounded px-2 py-1 text-[10px] font-mono font-medium transition-colors ${
                      decisionFilter === d
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {d === "SOURCING_REQUEST" ? "SOURCING" : d}
                  </button>
                ))}
              </div>

              {/* Route Filter */}
              <select
                value={routeFilter}
                onChange={(e) => {
                  setRouteFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter by route"
                className="h-8 rounded-md border border-input bg-card px-2.5 text-xs font-mono text-foreground"
              >
                <option value="ALL">All Routes</option>
                <option value="CONTRACT_PO">CONTRACT_PO</option>
                <option value="SPOT_PO">SPOT_PO</option>
                <option value="EMERGENCY_PO">EMERGENCY_PO</option>
                <option value="RFQ">RFQ</option>
                <option value="RFP">RFP</option>
                <option value="CAPEX_SOURCING">CAPEX_SOURCING</option>
                <option value="NEW_ITEM_SOURCING">NEW_ITEM_SOURCING</option>
                <option value="NOT_PROCESSED">NOT_PROCESSED</option>
              </select>

              {/* Plant Filter */}
              <select
                value={plantFilter}
                onChange={(e) => {
                  setPlantFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter by plant"
                className="h-8 rounded-md border border-input bg-card px-2.5 text-xs font-mono text-foreground"
              >
                <option value="ALL">All Plants</option>
                <option value="PUN1">PUN1 (Bhosari)</option>
                <option value="CHK1">CHK1 (Chakan)</option>
                <option value="PUN2">PUN2 (Excluded)</option>
              </select>

              {/* Sort By */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                aria-label="Sort decisions"
                className="h-8 rounded-md border border-input bg-card px-2.5 text-xs text-foreground"
              >
                <option value="line">Sort: Input Order</option>
                <option value="value_desc">Sort: Value (High → Low)</option>
                <option value="value_asc">Sort: Value (Low → High)</option>
                <option value="route">Sort: Route</option>
              </select>
            </div>
          </div>

          {/* Decisions Table */}
          <div className="rounded-lg border border-border bg-card overflow-hidden shadow-xs">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">PR / Line</TableHead>
                  <TableHead>Item &amp; Description</TableHead>
                  <TableHead>Plant</TableHead>
                  <TableHead className="text-right">Qty &amp; UOM</TableHead>
                  <TableHead className="text-right">Group Value</TableHead>
                  <TableHead>Decision</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Selected / Suggested Supplier</TableHead>
                  <TableHead>Proposed PO</TableHead>
                  <TableHead>Policy</TableHead>
                  <TableHead className="text-right">Explain</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedDecisionRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="h-24 text-center text-xs text-muted-foreground">
                      No decision rows match your current search and filter criteria.
                    </TableCell>
                  </TableRow>
                ) : (
                  pagedDecisionRows.map((row) => (
                    <TableRow
                      key={`${row.pr_no}_${row.pr_line}`}
                      className="text-xs hover:bg-muted/40 cursor-pointer"
                      onClick={() => {
                        setSelectedLineRow(row);
                        setDetailsOpen(true);
                      }}
                    >
                      <TableCell className="font-mono font-semibold text-primary">
                        {row.pr_no}/{row.pr_line}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`font-mono text-[11px] font-semibold ${
                              row.resolved_item_code === "NEW"
                                ? "text-cyan-600 dark:text-cyan-400"
                                : "text-foreground"
                            }`}
                          >
                            {row.resolved_item_code}
                          </span>
                          {row.group_id && (
                            <span className="text-[10px] font-mono text-muted-foreground">
                              ({row.group_id})
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate max-w-[220px]">
                          {row.itemDescription}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono rounded bg-muted px-1.5 py-0.5 text-[11px]">
                          {row.plant}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {row.quantity} {row.uom}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatInr(row.group_value_inr)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            row.decision === "PO"
                              ? "success"
                              : row.decision === "SOURCING_REQUEST"
                              ? "default"
                              : "secondary"
                          }
                          className="text-[10px] font-mono uppercase px-1.5 py-0"
                        >
                          {row.decision}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-mono font-semibold ${getRouteBadgeClass(
                            row.route
                          )}`}
                        >
                          {row.route}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-[11px]">
                        {row.decision === "PO" ? (
                          <div>
                            <span className="font-semibold text-foreground">{row.supplier_id}</span>
                            {row.unit_price && (
                              <span className="text-muted-foreground ml-1">
                                @ ₹{row.unit_price}
                              </span>
                            )}
                          </div>
                        ) : row.suggested_supplier_ids ? (
                          <span className="text-muted-foreground">{row.suggested_supplier_ids}</span>
                        ) : (
                          <span className="text-muted-foreground italic">—</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-[11px]">
                        {row.po_id ? (
                          <span className="rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 font-semibold">
                            {row.po_id}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground">
                        v{row.policy_version}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLineRow(row);
                            setDetailsOpen(true);
                          }}
                          className="h-7 px-2 text-xs gap-1"
                        >
                          <Eye className="h-3 w-3" />
                          <span>Inspect</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {/* Pagination Footer */}
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-muted/20 text-xs text-muted-foreground">
              <div>
                Showing <span className="font-medium text-foreground">{pagedDecisionRows.length}</span>{" "}
                of <span className="font-medium text-foreground">{filteredDecisionRows.length}</span> PR
                lines
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="h-7 text-xs px-2.5"
                >
                  Previous
                </Button>
                <span className="px-2 font-mono">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="h-7 text-xs px-2.5"
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === "proposed-pos" ? (
        /* TAB 2: PROPOSED PO REVIEW */
        <div className="space-y-3">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
              <Info className="h-4 w-4 shrink-0" />
              <span>
                <strong>Proposed Purchase Orders (Not Issued):</strong> Requirements ending in a PO within
                24 hours for the same supplier, plant, and route are consolidated below for buyer review.
                No external ERP transmission or vendor dispatch has occurred.
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card overflow-hidden shadow-xs">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Proposed PO #</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Plant</TableHead>
                  <TableHead>Procurement Route</TableHead>
                  <TableHead>Included PR Lines</TableHead>
                  <TableHead className="text-right">Requirements</TableHead>
                  <TableHead className="text-right">Total Proposed Value</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(activeRun.poGroups || []).map((po) => {
                  const reqDecisions = (activeRun.requirements || []).filter((r) =>
                    po.requirementIds.includes(r.groupId)
                  );
                  const contractRefs = Array.from(
                    new Set(reqDecisions.map((r) => r.referenceContractId).filter(Boolean))
                  );

                  return (
                    <TableRow
                      key={po.poId}
                      className="text-xs hover:bg-muted/40 cursor-pointer"
                      onClick={() => {
                        setSelectedPoGroup({ po, reqDecisions, contractRefs });
                        setPoDetailsOpen(true);
                      }}
                    >
                      <TableCell className="font-mono font-bold text-primary">
                        {po.poId}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px] font-mono uppercase">
                          {po.status || "PROPOSED"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-mono font-semibold text-foreground">{po.supplierId}</div>
                        {po.supplierName && (
                          <div className="text-[11px] text-muted-foreground">{po.supplierName}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono rounded bg-muted px-1.5 py-0.5 text-[11px]">
                          {po.plant}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-mono font-semibold ${getRouteBadgeClass(
                            po.route
                          )}`}
                        >
                          {po.route}
                        </span>
                        {contractRefs.length > 0 && (
                          <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                            Contract: {contractRefs.join(", ")}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[260px]">
                          {po.prReferences.map((ref) => (
                            <span
                              key={`${ref.prNo}_${ref.prLine}`}
                              className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px]"
                            >
                              {ref.prNo}/{ref.prLine}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {po.requirementIds.length}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold text-foreground">
                        {formatInr(po.totalValueInr)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPoGroup({ po, reqDecisions, contractRefs });
                            setPoDetailsOpen(true);
                          }}
                          className="h-7 px-2 text-xs gap-1"
                        >
                          <Eye className="h-3 w-3" />
                          <span>Review PO</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        /* TAB 3: SOURCING REQUEST REVIEW */
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center rounded-md border border-input bg-card p-0.5 text-xs">
              <span className="px-2 text-[11px] text-muted-foreground font-medium">
                Sourcing Route:
              </span>
              {[
                { id: "ALL", label: "All Sourcing" },
                { id: "RFQ", label: "RFQ (3 Quotes)" },
                { id: "RFP", label: "RFP (5 Quotes)" },
                { id: "CAPEX_SOURCING", label: "Capex Sourcing (5)" },
                { id: "NEW_ITEM_SOURCING", label: "New-Item Sourcing" },
              ].map((rt) => (
                <button
                  key={rt.id}
                  type="button"
                  onClick={() => setSourcingRouteFilter(rt.id)}
                  className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    sourcingRouteFilter === rt.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {rt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card overflow-hidden shadow-xs">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[110px]">Req Group ID</TableHead>
                  <TableHead>Originating PR Lines</TableHead>
                  <TableHead>Item &amp; Category</TableHead>
                  <TableHead>Plant</TableHead>
                  <TableHead className="text-right">Total Qty</TableHead>
                  <TableHead className="text-right">Sourcing Value</TableHead>
                  <TableHead>Route &amp; Clause</TableHead>
                  <TableHead>Suggested Suppliers (Target)</TableHead>
                  <TableHead className="text-right">Explain</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sourcingRequirements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-20 text-center text-xs text-muted-foreground">
                      No sourcing requests match the selected route filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  sourcingRequirements.map((reqDec) => {
                    const req = reqDec.requirement;
                    const firstLine = req.lines[0];
                    const targetCount =
                      reqDec.route === "NEW_ITEM_SOURCING"
                        ? 0
                        : reqDec.route === "RFQ"
                        ? 3
                        : 5;

                    return (
                      <TableRow key={reqDec.groupId} className="text-xs hover:bg-muted/40">
                        <TableCell className="font-mono font-bold text-primary">
                          {reqDec.groupId}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {req.lines.map((l) => (
                              <span
                                key={`${l.pr_no}_${l.pr_line}`}
                                className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px]"
                              >
                                {l.pr_no}/{l.pr_line}
                              </span>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-mono font-semibold text-foreground">
                            {req.resolvedItemCode}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                            {firstLine?.description}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono rounded bg-muted px-1.5 py-0.5 text-[11px]">
                            {req.plant}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {req.totalQuantity} {req.uom}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {formatInr(reqDec.groupValueInr)}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-mono font-semibold ${getRouteBadgeClass(
                              reqDec.route
                            )}`}
                          >
                            {reqDec.route}
                          </span>
                          <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                            Clause {reqDec.clause}
                          </div>
                        </TableCell>
                        <TableCell>
                          {targetCount === 0 ? (
                            <span className="text-[11px] text-muted-foreground italic">
                              Manual buyer identification (New Item)
                            </span>
                          ) : (
                            <div className="space-y-1">
                              <div className="font-mono text-[11px] font-medium text-foreground">
                                {reqDec.suggestedSupplierIds.join("; ") || "None"}
                                <span className="text-[10px] text-muted-foreground ml-1.5">
                                  ({reqDec.suggestedSupplierIds.length}/{targetCount} target)
                                </span>
                              </div>
                              {reqDec.supplierShortfallExplanation && (
                                <div className="text-[10px] text-amber-600 dark:text-amber-400">
                                  {reqDec.supplierShortfallExplanation}
                                </div>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const matchingRow = enrichedRows.find(
                                (r) => r.group_id === reqDec.groupId
                              );
                              if (matchingRow) {
                                setSelectedLineRow(matchingRow);
                                setDetailsOpen(true);
                              }
                            }}
                            className="h-7 px-2 text-xs gap-1"
                          >
                            <Eye className="h-3 w-3" />
                            <span>Details</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* MODAL 1: DECISION DETAILS & EXPLAINABILITY */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="text-base font-bold font-mono flex items-center gap-2">
                <span>
                  Decision Explainability: {selectedLineRow?.pr_no}/{selectedLineRow?.pr_line}
                </span>
                {selectedLineRow?.group_id && (
                  <Badge variant="outline" className="text-xs font-mono">
                    {selectedLineRow.group_id}
                  </Badge>
                )}
              </DialogTitle>
              {selectedLineRow && (
                <span
                  className={`rounded border px-2 py-0.5 text-xs font-mono font-semibold ${getRouteBadgeClass(
                    selectedLineRow.route
                  )}`}
                >
                  {selectedLineRow.decision} &bull; {selectedLineRow.route}
                </span>
              )}
            </div>
            <DialogDescription className="text-xs">
              Complete audit trail of item resolution, clubbing, valuation, contract ceiling check,
              preferred supplier ranking, and applied Corvo Policy v{selectedLineRow?.policy_version}{" "}
              clauses.
            </DialogDescription>
          </DialogHeader>

          {selectedLineRow && (
            <div className="space-y-4 py-2 text-xs">
              {/* 1. Final Decision & Policy Clause Banner */}
              <div className="rounded-lg border border-border bg-muted/30 p-3.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-foreground flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <span>Final Decision Explanation</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-[11px]">
                    <span className="text-muted-foreground">Policy v{selectedLineRow.policy_version}</span>
                    {selectedLineRow.requirementDecision?.appliedClauses?.map((cl) => (
                      <Badge key={cl} variant="secondary" className="text-[10px] font-mono">
                        Clause {cl}
                      </Badge>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-foreground leading-relaxed">{selectedLineRow.reason}</p>
              </div>

              {/* 2. Item Resolution & Valuation Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Item Resolution Card */}
                <div className="rounded-lg border border-border bg-card p-3 space-y-1.5">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    1. Item Resolution (Section 1)
                  </div>
                  <div className="font-mono font-bold text-sm text-foreground">
                    {selectedLineRow.resolved_item_code} — {selectedLineRow.itemDescription}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Original input: &ldquo;{selectedLineRow.originalDescription}&rdquo;
                  </div>
                  {selectedLineRow.requirementDecision?.requirement?.lines?.[0] && (
                    <div className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400">
                      {selectedLineRow.requirementDecision.requirement.lines[0].matchExplanation}
                    </div>
                  )}
                </div>

                {/* Valuation & Contract Card */}
                <div className="rounded-lg border border-border bg-card p-3 space-y-1.5">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    2. Requirement Valuation (Section 3 &amp; 4)
                  </div>
                  <div className="font-mono font-bold text-sm text-foreground">
                    Group Value: {formatInr(selectedLineRow.group_value_inr)}
                  </div>
                  {selectedLineRow.requirementDecision ? (
                    <>
                      <div className="text-[11px] font-mono text-muted-foreground">
                        Source: {selectedLineRow.requirementDecision.requirement.priceSource} (
                        {selectedLineRow.requirementDecision.requirement.totalQuantity}{" "}
                        {selectedLineRow.requirementDecision.requirement.uom} &times;{" "}
                        {formatInr(selectedLineRow.requirementDecision.requirement.unitPrice)})
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {selectedLineRow.requirementDecision.requirement.priceExplanation}
                      </div>
                    </>
                  ) : (
                    <div className="text-[11px] text-muted-foreground">
                      Line excluded prior to requirement valuation.
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Clubbed PR Lines in Requirement Group */}
              {selectedLineRow.requirementDecision && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      3. Requirement Clubbing ({selectedLineRow.group_id} &bull;{" "}
                      {selectedLineRow.requirementDecision.requirement.lines.length} PR Line(s) &bull;
                      Total Qty: {selectedLineRow.requirementDecision.requirement.totalQuantity}{" "}
                      {selectedLineRow.requirementDecision.requirement.uom})
                    </span>
                    {selectedLineRow.po_id && (
                      <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold">
                        Consolidated into Proposed {selectedLineRow.po_id}
                      </span>
                    )}
                  </div>

                  <div className="rounded-md border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead>PR / Line</TableHead>
                          <TableHead>Requester &amp; Dept</TableHead>
                          <TableHead>Created Timestamp</TableHead>
                          <TableHead>Need-By Date</TableHead>
                          <TableHead>Urgency</TableHead>
                          <TableHead className="text-right">Quantity</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedLineRow.requirementDecision.requirement.lines.map((l) => (
                          <TableRow key={`${l.pr_no}_${l.pr_line}`} className="text-xs">
                            <TableCell className="font-mono font-semibold">
                              {l.pr_no}/{l.pr_line}
                            </TableCell>
                            <TableCell>
                              {l.requester} ({l.department})
                            </TableCell>
                            <TableCell className="font-mono text-[11px]">{l.created_at}</TableCell>
                            <TableCell className="font-mono text-[11px]">{l.need_by_date}</TableCell>
                            <TableCell>{l.urgency}</TableCell>
                            <TableCell className="text-right font-mono">
                              {l.quantity} {l.uom}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* 4. Preferred Supplier Ranking Table */}
              {selectedLineRow.requirementDecision && (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    4. Preferred Supplier Eligibility &amp; Ranking (Section 6)
                  </div>

                  {selectedLineRow.requirementDecision.preferredSuppliers.length === 0 ? (
                    <div className="rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                      No active suppliers had PO history in the preceding 548 days or an applicable
                      contract for this item.{" "}
                      {selectedLineRow.suggested_supplier_ids
                        ? `Category top-up suggestions selected: ${selectedLineRow.suggested_supplier_ids}.`
                        : "Manual buyer sourcing applies."}
                    </div>
                  ) : (
                    <div className="rounded-md border border-border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40">
                            <TableHead className="w-[60px]">Rank</TableHead>
                            <TableHead>Supplier</TableHead>
                            <TableHead className="text-right">Score</TableHead>
                            <TableHead className="text-right">POs (548d)</TableHead>
                            <TableHead className="text-right">Recency</TableHead>
                            <TableHead className="text-center">Contract</TableHead>
                            <TableHead className="text-right">On-Time</TableHead>
                            <TableHead className="text-right">Quality</TableHead>
                            <TableHead className="text-right">Ref Price</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedLineRow.requirementDecision.preferredSuppliers.map((sup) => (
                            <TableRow key={sup.supplierId} className="text-xs">
                              <TableCell className="font-mono font-bold">#{sup.rank}</TableCell>
                              <TableCell>
                                <span className="font-mono font-semibold">{sup.supplierId}</span> —{" "}
                                {sup.supplierName}
                              </TableCell>
                              <TableCell className="text-right font-mono font-semibold text-primary">
                                {sup.score.toFixed(4)}
                              </TableCell>
                              <TableCell className="text-right font-mono">{sup.poCount}</TableCell>
                              <TableCell className="text-right font-mono">{sup.recencyTier}</TableCell>
                              <TableCell className="text-center font-mono">
                                {sup.hasContractHistory ? "Yes" : "No"}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {sup.onTimePercent !== null ? `${sup.onTimePercent}%` : "N/A"}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {sup.qualityRating !== null ? sup.qualityRating : "N/A"}
                              </TableCell>
                              <TableCell className="text-right font-mono font-medium">
                                {formatInr(sup.referencePrice)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDetailsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: PROPOSED PO GROUP BREAKDOWN */}
      <Dialog open={poDetailsOpen} onOpenChange={setPoDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="font-mono text-base font-bold">
                Proposed Purchase Order: {selectedPoGroup?.po?.poId}
              </DialogTitle>
              <Badge variant="secondary" className="text-[10px] font-mono uppercase">
                PROPOSED (NOT ISSUED)
              </Badge>
            </div>
            <DialogDescription className="text-xs">
              Consolidated within 24 hours for supplier {selectedPoGroup?.po?.supplierId} (
              {selectedPoGroup?.po?.supplierName || "Active Vendor"}) at plant{" "}
              {selectedPoGroup?.po?.plant} via route {selectedPoGroup?.po?.route}.
            </DialogDescription>
          </DialogHeader>

          {selectedPoGroup && (
            <div className="space-y-4 py-2 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-lg border border-border bg-muted/20">
                <div>
                  <div className="text-[10px] text-muted-foreground">Supplier</div>
                  <div className="font-mono font-semibold text-foreground">
                    {selectedPoGroup.po.supplierId}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {selectedPoGroup.po.supplierName}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Plant &amp; Route</div>
                  <div className="font-mono font-semibold text-foreground">
                    {selectedPoGroup.po.plant} &bull; {selectedPoGroup.po.route}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Contract Reference</div>
                  <div className="font-mono font-semibold text-foreground">
                    {selectedPoGroup.contractRefs?.length > 0
                      ? selectedPoGroup.contractRefs.join(", ")
                      : "Spot / Preferred Ref"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Total Proposed Value</div>
                  <div className="font-mono font-bold text-sm text-foreground">
                    {formatInr(selectedPoGroup.po.totalValueInr)}
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Req Group</TableHead>
                      <TableHead>PR Lines</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Total Qty</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Requirement Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(selectedPoGroup.reqDecisions || []).map((rd: RequirementDecision) => (
                      <TableRow key={rd.groupId} className="text-xs">
                        <TableCell className="font-mono font-semibold">{rd.groupId}</TableCell>
                        <TableCell className="font-mono text-[11px]">
                          {rd.requirement.lines.map((l) => `${l.pr_no}/${l.pr_line}`).join(", ")}
                        </TableCell>
                        <TableCell>
                          <div className="font-mono font-semibold">
                            {rd.requirement.resolvedItemCode}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {rd.requirement.lines[0]?.description}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {rd.requirement.totalQuantity} {rd.requirement.uom}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatInr(rd.unitPrice)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {formatInr(rd.groupValueInr)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPoDetailsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: UPLOAD PR BATCH CSV */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Process PR Batch CSV</DialogTitle>
            <DialogDescription className="text-xs">
              Upload a PR batch CSV in the assignment format or run against a selected policy version.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <label className="font-medium text-foreground">Policy Version</label>
              <Input
                value={policyVersionInput}
                onChange={(e) => setPolicyVersionInput(e.target.value)}
                placeholder="5.0"
                className="h-8 text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-foreground">Select CSV File</label>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                disabled={isProcessing}
                className="text-xs block w-full file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setUploadDialogOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
