"use client";

import * as React from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  Filter,
  RefreshCw,
  FileSpreadsheet,
  Download,
  Upload,
  MessageSquareText,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  MapPin,
  Calendar,
  Package,
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

interface IRequisitionItem {
  id: string;
  prNo: string;
  requesterName: string;
  department: string;
  plantCode: string;
  source: string;
  status: string;
  totalEstimatedAmount: number;
  urgency: "Normal" | "Urgent" | "Emergency";
  needByDate?: string;
  linesCount: number;
  createdAt: string;
}

interface ILineItem {
  id: string;
  prNo: string;
  prLine: number;
  originalDescription: string;
  itemCode?: string;
  matchedItemDescription?: string;
  quantity: number;
  uom: string;
  estimatedUnitPrice?: number;
  totalPrice?: number;
  needByDate?: string;
  urgency: string;
  itemMatchStatus: string;
}

export default function RequisitionsPage() {
  const { toast } = useToast();
  const [requisitions, setRequisitions] = React.useState<IRequisitionItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("ALL");
  const [plantFilter, setPlantFilter] = React.useState("ALL");
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [totalCount, setTotalCount] = React.useState(0);

  // Details Modal
  const [selectedPr, setSelectedPr] = React.useState<IRequisitionItem | null>(null);
  const [prLines, setPrLines] = React.useState<ILineItem[]>([]);
  const [loadingLines, setLoadingLines] = React.useState(false);
  const [detailsOpen, setDetailsOpen] = React.useState(false);

  // Batch Import Modal
  const [importOpen, setImportOpen] = React.useState(false);
  const [isImporting, setIsImporting] = React.useState(false);
  const [importSummary, setImportSummary] = React.useState<any>(null);

  // Fetch Requisitions
  const fetchRequisitions = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("limit", "15");
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (plantFilter !== "ALL") params.set("plantCode", plantFilter);

      const res = await fetch(`/api/requisitions?${params.toString()}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setRequisitions(json.data);
        setTotalPages(json.meta?.totalPages || 1);
        setTotalCount(json.meta?.total || 0);
      }
    } catch (err) {
      console.error("Failed to load requisitions:", err);
      toast({
        title: "Error",
        description: "Failed to fetch requisitions list",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, statusFilter, plantFilter, toast]);

  React.useEffect(() => {
    fetchRequisitions();
  }, [fetchRequisitions]);

  // View Details
  const handleViewDetails = async (req: IRequisitionItem) => {
    setSelectedPr(req);
    setDetailsOpen(true);
    setLoadingLines(true);
    try {
      const res = await fetch(`/api/requisitions/${req.prNo}`);
      const json = await res.json();
      if (json.success && json.data) {
        setPrLines(json.data.lines || []);
      }
    } catch (err) {
      console.error("Failed to load PR lines:", err);
    } finally {
      setLoadingLines(false);
    }
  };

  // Bootstrap Sample Batch
  const handleBootstrapSample = async () => {
    setIsImporting(true);
    setImportSummary(null);
    try {
      const res = await fetch("/api/requisitions/bootstrap-sample-batch", {
        method: "POST",
      });
      const json = await res.json();
      if (json.success && json.data) {
        setImportSummary(json.data);
        toast({
          title: "Batch Ingest Completed",
          description: `Imported ${json.data.linesInsertedOrUpdated} lines across ${json.data.uniquePrs} PRs.`,
          variant: "default",
        });
        fetchRequisitions();
      } else {
        toast({
          title: "Import Error",
          description: json.error?.message || "Failed to import sample batch",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Error bootstrapping batch:", err);
      toast({
        title: "Network Error",
        description: "Could not execute sample batch import",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  // Custom File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportSummary(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/requisitions/batch-import", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (json.success && json.data) {
        setImportSummary(json.data);
        toast({
          title: "Batch Ingest Completed",
          description: `Imported ${json.data.linesInsertedOrUpdated} lines across ${json.data.uniquePrs} PRs.`,
          variant: "default",
        });
        fetchRequisitions();
      } else {
        toast({
          title: "Import Error",
          description: json.error?.message || "Failed to import CSV",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("File upload error:", err);
    } finally {
      setIsImporting(false);
      e.target.value = "";
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    if (requisitions.length === 0) {
      toast({
        title: "No Data",
        description: "No requisitions available to export.",
        variant: "default",
      });
      return;
    }

    const headers = ["PR Number", "Requester", "Department", "Plant", "Source", "Urgency", "Need By Date", "Est Amount", "Status"];
    const rows = requisitions.map((r) => [
      r.prNo,
      r.requesterName,
      r.department,
      r.plantCode,
      r.source,
      r.urgency,
      r.needByDate ? new Date(r.needByDate).toLocaleDateString() : "",
      r.totalEstimatedAmount,
      r.status,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `requisitions_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatCurrency = (val?: number) => {
    if (val === undefined || val === null) return "—";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Purchase Requisitions
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Department purchase requests, catalog matching, cost estimation &amp; fulfillment intake
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            className="h-8 text-xs gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
            className="h-8 text-xs gap-1.5"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Batch CSV Import</span>
          </Button>

          <Link href="/chat">
            <Button size="sm" className="h-8 text-xs gap-1.5">
              <MessageSquareText className="h-3.5 w-3.5" />
              <span>Create via Chat</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2 max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by PR number, requester, or department..."
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
              onClick={() => setSearchQuery("")}
              className="h-8 text-xs px-2 text-muted-foreground"
            >
              Clear
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <div className="flex items-center rounded-md border border-input bg-card p-0.5 text-xs text-muted-foreground">
            <span className="px-2 font-medium">Status:</span>
            {["ALL", "SUBMITTED", "APPROVED", "DRAFT"].map((st) => (
              <button
                key={st}
                onClick={() => {
                  setStatusFilter(st);
                  setPage(1);
                }}
                className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                  statusFilter === st
                    ? "bg-primary text-primary-foreground"
                    : "hover:text-foreground"
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Plant Filter */}
          <div className="flex items-center rounded-md border border-input bg-card p-0.5 text-xs text-muted-foreground">
            <span className="px-2 font-medium">Plant:</span>
            {["ALL", "PUN1", "CHK1", "BHO1"].map((pl) => (
              <button
                key={pl}
                onClick={() => {
                  setPlantFilter(pl);
                  setPage(1);
                }}
                className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                  plantFilter === pl
                    ? "bg-primary text-primary-foreground"
                    : "hover:text-foreground"
                }`}
              >
                {pl}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="icon-sm"
            onClick={fetchRequisitions}
            className="h-8 w-8"
            title="Refresh table"
            aria-label="Refresh table"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Table Container */}
      <div className="rounded-lg border border-border bg-card overflow-hidden shadow-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[125px]">PR Number</TableHead>
              <TableHead>Requester</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Plant</TableHead>
              <TableHead>Urgency</TableHead>
              <TableHead>Need-By</TableHead>
              <TableHead className="text-right">Lines</TableHead>
              <TableHead className="text-right">Estimated Value</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} className="h-32 text-center text-xs text-muted-foreground">
                  <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 opacity-50" />
                  Loading purchase requisitions...
                </TableCell>
              </TableRow>
            ) : requisitions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="p-0">
                  <EmptyState
                    icon={FileSpreadsheet}
                    title="No Requisitions Found"
                    description={
                      searchQuery || statusFilter !== "ALL" || plantFilter !== "ALL"
                        ? "No requisitions match your current filter criteria."
                        : "No purchase requisitions found in the database. Use Procurement Chat to create your first PR or load the sample batch."
                    }
                    badge="Intake Register Active"
                    actionLabel="Create via Chat"
                    onAction={() => (window.location.href = "/chat")}
                    secondaryActionLabel="Load Sample Batch"
                    onSecondaryAction={() => setImportOpen(true)}
                    className="border-0 rounded-none bg-transparent"
                  />
                </TableCell>
              </TableRow>
            ) : (
              requisitions.map((req) => (
                <TableRow key={req.id || req.prNo} className="hover:bg-muted/40 text-xs">
                  <TableCell className="font-mono font-semibold text-primary">
                    {req.prNo}
                  </TableCell>
                  <TableCell className="font-medium text-foreground">
                    {req.requesterName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {req.department}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono rounded bg-muted px-1.5 py-0.5 text-[11px]">
                      {req.plantCode}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        req.urgency === "Emergency"
                          ? "bg-rose-500/10 text-rose-700 dark:text-rose-400"
                          : req.urgency === "Urgent"
                          ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {req.urgency}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-[11px]">
                    {req.needByDate
                      ? new Date(req.needByDate).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {req.linesCount || 1}
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium">
                    {formatCurrency(req.totalEstimatedAmount)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        req.status === "SUBMITTED"
                          ? "default"
                          : req.status === "APPROVED"
                          ? "success"
                          : "secondary"
                      }
                      className="text-[10px] font-mono uppercase px-1.5 py-0"
                    >
                      {req.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewDetails(req)}
                      className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                    >
                      <Eye className="h-3 w-3" />
                      <span>Details</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination Footer */}
        {totalCount > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-muted/20 text-xs text-muted-foreground">
            <div>
              Showing <span className="font-medium text-foreground">{requisitions.length}</span> of{" "}
              <span className="font-medium text-foreground">{totalCount}</span> requisitions
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
              <span className="px-2 text-xs font-mono">
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
        )}
      </div>

      {/* PR Details Modal */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-base font-bold font-mono">
                {selectedPr?.prNo}
              </DialogTitle>
              <Badge variant="default" className="text-[10px] font-mono uppercase">
                {selectedPr?.status}
              </Badge>
            </div>
            <DialogDescription className="text-xs">
              Requisition originated via {selectedPr?.source === "chat" ? "Conversational Chat Intake" : "Batch CSV Ingestion"}
            </DialogDescription>
          </DialogHeader>

          {selectedPr && (
            <div className="space-y-4 py-2 text-xs">
              {/* Header Overview Card */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-lg border border-border bg-muted/20">
                <div>
                  <div className="text-[10px] text-muted-foreground">Requester</div>
                  <div className="font-semibold text-foreground">{selectedPr.requesterName}</div>
                  <div className="text-[10px] text-muted-foreground">{selectedPr.department}</div>
                </div>

                <div>
                  <div className="text-[10px] text-muted-foreground">Plant</div>
                  <div className="font-semibold font-mono text-foreground">{selectedPr.plantCode}</div>
                </div>

                <div>
                  <div className="text-[10px] text-muted-foreground">Urgency & Need-By</div>
                  <div className="font-semibold text-foreground">{selectedPr.urgency}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">
                    {selectedPr.needByDate ? new Date(selectedPr.needByDate).toLocaleDateString() : "Not set"}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-muted-foreground">Estimated Total</div>
                  <div className="font-semibold font-mono text-foreground text-sm">
                    {formatCurrency(selectedPr.totalEstimatedAmount)}
                  </div>
                </div>
              </div>

              {/* Line Items Table */}
              <div className="space-y-2">
                <div className="font-semibold text-xs text-foreground flex items-center justify-between">
                  <span>Line Items ({prLines.length})</span>
                </div>

                <div className="rounded-md border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead className="w-[45px] text-center">#</TableHead>
                        <TableHead>Original Request</TableHead>
                        <TableHead>Catalog Item</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Total Price</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingLines ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                            Loading line items...
                          </TableCell>
                        </TableRow>
                      ) : prLines.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-16 text-center text-muted-foreground italic">
                            No lines found for this PR.
                          </TableCell>
                        </TableRow>
                      ) : (
                        prLines.map((line) => (
                          <TableRow key={line.id || line.prLine} className="text-xs">
                            <TableCell className="text-center font-mono text-muted-foreground">
                              {line.prLine}
                            </TableCell>
                            <TableCell className="font-medium text-foreground">
                              {line.originalDescription}
                            </TableCell>
                            <TableCell>
                              {line.itemCode ? (
                                <div>
                                  <div className="font-mono text-[11px] text-primary font-semibold">
                                    {line.itemCode}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                                    {line.matchedItemDescription}
                                  </div>
                                </div>
                              ) : (
                                <Badge variant="secondary" className="text-[9px] font-mono">
                                  Custom Item
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono font-medium">
                              {line.quantity} {line.uom}
                            </TableCell>
                            <TableCell className="text-right font-mono text-muted-foreground">
                              {formatCurrency(line.estimatedUnitPrice)}
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold text-foreground">
                              {formatCurrency(line.totalPrice)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDetailsOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Import Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-primary" />
              <span>Import Purchase Requisitions Batch</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Ingest bulk PR batch CSV files with automatic item catalog resolution and multi-line grouping.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            {/* Quick Option: Load Bundled Sample PR Batch */}
            <div className="p-3.5 rounded-lg border border-border bg-muted/20 space-y-2">
              <div className="font-semibold text-xs text-foreground flex items-center justify-between">
                <span>Task Kit Sample Batch</span>
                <span className="font-mono text-[10px] text-muted-foreground">sample_pr_batch.csv (186 lines)</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Loads the 186-row sample PR batch provided in the test kit. Automatically parses multi-line PRs and performs catalog lookup for items with missing codes.
              </p>
              <Button
                size="sm"
                onClick={handleBootstrapSample}
                disabled={isImporting}
                className="text-xs h-7 gap-1.5 mt-1"
              >
                <Package className="h-3.5 w-3.5" />
                <span>{isImporting ? "Processing Batch..." : "Load Bundled Sample Batch"}</span>
              </Button>
            </div>

            {/* Upload Custom CSV */}
            <div className="p-3.5 rounded-lg border border-border bg-background space-y-2">
              <div className="font-semibold text-xs text-foreground">
                Upload Custom CSV File
              </div>
              <p className="text-[11px] text-muted-foreground">
                Accepts CSV with headers: <code>pr_no, pr_line, created_at, requester, department, plant, item_code, description, quantity, uom, estimated_unit_price, need_by_date, urgency</code>
              </p>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                disabled={isImporting}
                className="text-xs block w-full file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
              />
            </div>

            {/* Ingestion Report */}
            {importSummary && (
              <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 space-y-1.5 text-[11px] text-emerald-900 dark:text-emerald-200">
                <div className="font-semibold flex items-center gap-1.5 text-xs text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Batch Ingest Summary</span>
                </div>
                <div className="grid grid-cols-2 gap-2 font-mono mt-1 text-[11px]">
                  <div>Total Rows: {importSummary.totalRows}</div>
                  <div>Unique PRs: {importSummary.uniquePrs}</div>
                  <div>Lines Ingested: {importSummary.linesInsertedOrUpdated}</div>
                  <div>Catalog Matches: {importSummary.catalogMatchedLines}</div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportOpen(false)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
