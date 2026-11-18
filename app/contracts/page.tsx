"use client";

import * as React from "react";
import { Search, RefreshCw, FileSignature, ChevronLeft, ChevronRight, Eye, AlertCircle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface ContractRecord {
  id: string;
  contractId: string;
  supplierId: string;
  supplierName: string;
  startDate: string;
  endDate: string;
  valueCap: number;
  consumedValue: number;
  status: string;
  currency: string;
  linesCount: number;
}

interface ContractDetails extends ContractRecord {
  lines: Array<{
    id: string;
    itemCode: string;
    description: string;
    uom: string;
    contractedPrice: number;
  }>;
}

export default function ContractsPage() {
  const { toast } = useToast();
  const [contracts, setContracts] = React.useState<ContractRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("ALL");
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [selectedContract, setSelectedContract] = React.useState<ContractDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = React.useState(false);

  const fetchContracts = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "10",
      });
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter !== "ALL") params.set("status", statusFilter);

      const res = await fetch(`/api/contracts?${params.toString()}`);
      const json = await res.json();

      if (json.success) {
        setContracts(json.data || []);
        setTotalPages(json.meta?.totalPages || 1);
        setTotal(json.meta?.total || 0);
      } else {
        toast({
          title: "Failed to load contracts",
          description: json.error?.message || "Ensure you are signed in as Buyer or Admin",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Network Error",
        description: "Could not connect to contracts API",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, toast]);

  React.useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

  const handleOpenDetails = async (cId: string) => {
    setDetailsLoading(true);
    try {
      const res = await fetch(`/api/contracts/${cId}`);
      const json = await res.json();
      if (json.success) {
        setSelectedContract(json.data);
      } else {
        toast({
          title: "Failed to load details",
          description: json.error?.message,
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to fetch contract lines",
        variant: "destructive",
      });
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchContracts();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Rate Contract Register
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Active master service agreements, contracted price caps, and cumulative spend commitments
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-md border border-border bg-muted/60 px-2.5 py-1 text-xs font-mono text-muted-foreground">
            {total} registered contracts
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={fetchContracts}
            className="h-8 w-8"
            title="Refresh contracts"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={handleSearchSubmit} className="flex flex-1 items-center gap-2 max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by contract ID, vendor name, or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <Button type="submit" size="sm" variant="secondary" className="h-8 text-xs">
            Search
          </Button>
          {search && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setPage(1);
              }}
              className="h-8 text-xs px-2"
            >
              Clear
            </Button>
          )}
        </form>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-input bg-card p-0.5 text-xs text-muted-foreground">
            <span className="px-2 font-medium">Status:</span>
            {["ALL", "Active", "Expired"].map((status) => (
              <button
                key={status}
                onClick={() => {
                  setStatusFilter(status);
                  setPage(1);
                }}
                className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  statusFilter === status
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "hover:text-foreground"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="rounded-lg border border-border bg-card overflow-hidden shadow-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Contract ID</TableHead>
              <TableHead>Counterparty Supplier</TableHead>
              <TableHead>Validity Window</TableHead>
              <TableHead className="text-right">Value Ceiling</TableHead>
              <TableHead className="text-right">Consumed</TableHead>
              <TableHead className="text-right">Lines</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-48 text-center text-xs text-muted-foreground">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <span>Loading contract register...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : contracts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="p-0">
                  <EmptyState
                    icon={FileSignature}
                    title="No Contracts in Database"
                    description={
                      total === 0
                        ? "The contract register is empty. Import contract_register.csv and contract_lines.csv from Master Data Import."
                        : "No contracts match your search parameters."
                    }
                    badge={total === 0 ? "Awaiting Master Data Import" : "0 Results"}
                    actionLabel={total === 0 ? "Go to Data Import" : "Reset Filter"}
                    onAction={() => {
                      if (total === 0) {
                        window.location.href = "/import";
                      } else {
                        setSearch("");
                        setStatusFilter("ALL");
                        setPage(1);
                      }
                    }}
                    className="border-0 rounded-none bg-transparent"
                  />
                </TableCell>
              </TableRow>
            ) : (
              contracts.map((c) => {
                const percentConsumed = c.valueCap > 0 ? (c.consumedValue / c.valueCap) * 100 : 0;
                return (
                  <TableRow key={c.id} className="hover:bg-muted/40 transition-colors">
                    <TableCell className="font-mono text-xs font-semibold text-foreground">
                      {c.contractId}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-semibold text-xs text-foreground">{c.supplierName}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">{c.supplierId}</p>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {c.startDate} &rarr; {c.endDate}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs font-bold text-foreground">
                      {formatCurrency(c.valueCap, c.currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-foreground">
                      <div>
                        <span>{formatCurrency(c.consumedValue, c.currency)}</span>
                        <div className="w-16 ml-auto mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              percentConsumed > 90 ? "bg-destructive" : "bg-emerald-500"
                            }`}
                            style={{ width: `${Math.min(100, percentConsumed)}%` }}
                          />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {c.linesCount} items
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-sm px-2 py-0.5 text-[11px] font-semibold ${
                          c.status === "Expired"
                            ? "bg-muted text-muted-foreground"
                            : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                        }`}
                      >
                        {c.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleOpenDetails(c.contractId)}
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        title="View contract lines"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {total > 0 && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground bg-muted/20">
            <span>
              Showing Page {page} of {totalPages} ({total} contracts)
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="h-7 px-2 text-xs"
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="h-7 px-2 text-xs"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Contract Lines Modal */}
      {selectedContract && (
        <Dialog open={!!selectedContract} onOpenChange={() => setSelectedContract(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-bold">
                  {selectedContract.contractId}
                </span>
                <DialogTitle className="text-base">{selectedContract.supplierName}</DialogTitle>
              </div>
              <DialogDescription>
                Validity: {selectedContract.startDate} to {selectedContract.endDate} &bull; Ceiling:{" "}
                {formatCurrency(selectedContract.valueCap, selectedContract.currency)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Contracted Item Price Schedule ({selectedContract.lines?.length || 0} lines)
                </h4>
              </div>

              <div className="rounded border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 text-[11px]">
                      <TableHead>Item Code</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>UOM</TableHead>
                      <TableHead className="text-right">Contracted Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(!selectedContract.lines || selectedContract.lines.length === 0) ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-4 text-center text-xs text-muted-foreground">
                          No item lines linked to this contract register entry.
                        </TableCell>
                      </TableRow>
                    ) : (
                      selectedContract.lines.map((line) => (
                        <TableRow key={line.id} className="text-xs">
                          <TableCell className="font-mono font-semibold">{line.itemCode}</TableCell>
                          <TableCell className="text-muted-foreground">{line.description}</TableCell>
                          <TableCell className="font-mono">{line.uom}</TableCell>
                          <TableCell className="text-right font-mono font-bold text-foreground">
                            {formatCurrency(line.contractedPrice, selectedContract.currency)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <DialogFooter>
              <Button size="sm" variant="outline" onClick={() => setSelectedContract(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
