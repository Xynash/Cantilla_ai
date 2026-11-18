"use client";

import * as React from "react";
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  History,
  FileText,
  Sparkles,
  ArrowRight,
  Database,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import Papa from "papaparse";

type ImportType =
  | "items"
  | "suppliers"
  | "plants"
  | "purchase-history"
  | "contracts"
  | "contract-lines";

interface ImportHistoryRecord {
  id: string;
  entityType: string;
  filename: string;
  totalRows: number;
  inserted: number;
  updated: number;
  failed: number;
  status: string;
  errors: Array<{ row: number; error: string }>;
  importedBy: string;
  createdAt: string;
}

export default function ImportPage() {
  const { toast } = useToast();

  const [selectedType, setSelectedType] = React.useState<ImportType>("items");
  const [file, setFile] = React.useState<File | null>(null);
  const [csvPreview, setCsvPreview] = React.useState<Array<Record<string, string>>>([]);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [isImporting, setIsImporting] = React.useState(false);
  const [lastResult, setLastResult] = React.useState<any | null>(null);

  const [history, setHistory] = React.useState<ImportHistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [isBootstrapping, setIsBootstrapping] = React.useState(false);

  const fetchHistory = React.useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/import/history");
      const json = await res.json();
      if (json.success) {
        setHistory(json.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (!selected.name.endsWith(".csv")) {
      toast({
        title: "Invalid file format",
        description: "Please upload a standard CSV file.",
        variant: "destructive",
      });
      return;
    }

    setFile(selected);
    setLastResult(null);

    // Parse preview
    Papa.parse<Record<string, string>>(selected, {
      header: true,
      preview: 5,
      skipEmptyLines: "greedy",
      complete: (results) => {
        setHeaders(results.meta.fields || []);
        setCsvPreview(results.data || []);
      },
    });
  };

  const handleExecuteImport = async () => {
    if (!file) return;

    setIsImporting(true);
    setLastResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const endpoint = `/api/import/${selectedType}`;
      const res = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      const json = await res.json();

      if (json.success) {
        setLastResult(json.data);
        toast({
          title: "Import Finished",
          description: `Processed ${json.data.totalRows} rows: ${json.data.inserted} inserted, ${json.data.updated} updated, ${json.data.failed} failed.`,
          variant: json.data.failed === 0 ? "success" : "warning",
        });
        fetchHistory();
      } else {
        toast({
          title: "Import Error",
          description: json.error?.message || "Failed to import CSV",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Execution Error",
        description: "Failed to communicate with import API",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleBootstrapAll = async () => {
    setIsBootstrapping(true);
    try {
      const res = await fetch("/api/import/bootstrap", { method: "POST" });
      const json = await res.json();

      if (json.success) {
        toast({
          title: "Task Kit Dataset Ingested",
          description: "Items, suppliers, plants, contracts, lines, and purchase orders imported.",
          variant: "success",
        });
        fetchHistory();
      } else {
        toast({
          title: "Bootstrap Error",
          description: json.error?.message || "Failed to bootstrap data",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Network Error",
        description: "Failed to connect to bootstrap API",
        variant: "destructive",
      });
    } finally {
      setIsBootstrapping(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Master Data Import Management
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Idempotent CSV data ingestion, validation pipelines, error diagnostics, and audit tracking
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick One-Click Bootstrap */}
          <Button
            size="sm"
            onClick={handleBootstrapAll}
            disabled={isBootstrapping}
            className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Sparkles className={`h-3.5 w-3.5 ${isBootstrapping ? "animate-spin" : ""}`} />
            <span>Load Task Kit Dataset</span>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="upload" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-sm">
          <TabsTrigger value="upload">Upload & Ingest</TabsTrigger>
          <TabsTrigger value="history">Import History</TabsTrigger>
        </TabsList>

        {/* Tab 1: Upload and Ingest */}
        <TabsContent value="upload" className="space-y-6 mt-4">
          {/* Step 1: Type Selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">1. Select Target Master Entity</CardTitle>
              <CardDescription className="text-xs">
                Choose the target collection to ingest and validate against
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {[
                  { id: "items", label: "Item Master", file: "item_master.csv" },
                  { id: "suppliers", label: "Suppliers", file: "supplier_master.csv" },
                  { id: "plants", label: "Plants", file: "plants.csv" },
                  { id: "contracts", label: "Contracts", file: "contract_register.csv" },
                  { id: "contract-lines", label: "Contract Lines", file: "contract_lines.csv" },
                  { id: "purchase-history", label: "PO History", file: "po_history.csv" },
                ].map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => {
                      setSelectedType(type.id as ImportType);
                      setFile(null);
                      setCsvPreview([]);
                      setLastResult(null);
                    }}
                    className={`flex flex-col items-start p-3 rounded-lg border text-left transition-all ${
                      selectedType === type.id
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border bg-card hover:bg-muted/40"
                    }`}
                  >
                    <span className="text-xs font-semibold text-foreground">{type.label}</span>
                    <span className="text-[10px] text-muted-foreground font-mono mt-0.5">{type.file}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Step 2: File Upload Zone */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">2. Choose CSV File</CardTitle>
              <CardDescription className="text-xs">
                Upload CSV file matching {selectedType} format. Duplicate records will be safely updated (upsert).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-6 hover:bg-muted/20 transition-colors">
                <UploadCloud className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-xs font-medium text-foreground">
                  Select a CSV file to preview and validate
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  UTF-8 encoded standard comma-separated values (.csv)
                </p>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="mt-4 text-xs file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-primary file:text-primary-foreground hover:file:opacity-90"
                />
              </div>

              {/* Data Preview */}
              {csvPreview.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">
                      File Preview: {file?.name} (First 5 Rows)
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Columns detected: {headers.join(", ")}
                    </span>
                  </div>

                  <div className="rounded border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          {headers.map((h) => (
                            <TableHead key={h} className="text-[11px] font-mono">
                              {h}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {csvPreview.map((row, idx) => (
                          <TableRow key={idx} className="text-xs">
                            {headers.map((h) => (
                              <TableCell key={h} className="font-mono text-[11px]">
                                {row[h] || "—"}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter className="border-t bg-muted/20 px-5 py-3 flex justify-between items-center">
              <span className="text-xs text-muted-foreground">
                Target: /api/import/{selectedType}
              </span>
              <Button
                onClick={handleExecuteImport}
                disabled={!file || isImporting}
                size="sm"
                className="text-xs gap-1.5"
              >
                {isImporting ? (
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                    Ingesting Data...
                  </span>
                ) : (
                  <>
                    <span>Confirm & Execute Import</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>

          {/* Last Result Box */}
          {lastResult && (
            <Card className="border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  {lastResult.failed === 0 ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  )}
                  <CardTitle className="text-sm font-semibold">
                    Import Execution Summary: {lastResult.status.toUpperCase()}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-4 gap-3 text-center">
                  <div className="p-3 border rounded bg-card">
                    <span className="text-[10px] text-muted-foreground uppercase font-medium">Total Rows</span>
                    <p className="font-mono text-lg font-bold text-foreground">{lastResult.totalRows}</p>
                  </div>
                  <div className="p-3 border rounded bg-card">
                    <span className="text-[10px] text-emerald-600 font-medium uppercase">Inserted (New)</span>
                    <p className="font-mono text-lg font-bold text-emerald-600">{lastResult.inserted}</p>
                  </div>
                  <div className="p-3 border rounded bg-card">
                    <span className="text-[10px] text-primary font-medium uppercase">Updated (Upsert)</span>
                    <p className="font-mono text-lg font-bold text-primary">{lastResult.updated}</p>
                  </div>
                  <div className="p-3 border rounded bg-card">
                    <span className="text-[10px] text-destructive font-medium uppercase">Failed Rows</span>
                    <p className="font-mono text-lg font-bold text-destructive">{lastResult.failed}</p>
                  </div>
                </div>

                {/* Errors Table if any */}
                {lastResult.errors?.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                      <XCircle className="h-3.5 w-3.5" />
                      Detailed Row Rejections ({lastResult.errors.length} issues)
                    </h5>
                    <div className="max-h-48 overflow-y-auto border rounded divide-y text-xs">
                      {lastResult.errors.map((err: any, idx: number) => (
                        <div key={idx} className="p-2.5 bg-destructive/5 text-destructive flex items-start gap-2">
                          <span className="font-mono font-bold shrink-0">Row {err.row}:</span>
                          <span>{err.error}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tab 2: History */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <History className="h-4 w-4 text-muted-foreground" />
                  Import Execution Audit History
                </CardTitle>
                <CardDescription className="text-xs">
                  Historical log of all master data batch ingestions and idempotency checks
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={fetchHistory}
                className="h-8 w-8"
                title="Refresh history"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${historyLoading ? "animate-spin" : ""}`} />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="rounded border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 text-xs">
                      <TableHead>Entity</TableHead>
                      <TableHead>File Name</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Inserted</TableHead>
                      <TableHead className="text-right">Updated</TableHead>
                      <TableHead className="text-right">Failed</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Executed At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="py-6 text-center text-xs text-muted-foreground">
                          No previous import records logged.
                        </TableCell>
                      </TableRow>
                    ) : (
                      history.map((h) => (
                        <TableRow key={h.id} className="text-xs">
                          <TableCell className="font-semibold">{h.entityType}</TableCell>
                          <TableCell className="font-mono text-muted-foreground">{h.filename}</TableCell>
                          <TableCell className="text-right font-mono">{h.totalRows}</TableCell>
                          <TableCell className="text-right font-mono text-emerald-600">{h.inserted}</TableCell>
                          <TableCell className="text-right font-mono text-primary">{h.updated}</TableCell>
                          <TableCell className="text-right font-mono text-destructive">{h.failed}</TableCell>
                          <TableCell>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                h.status === "success"
                                  ? "bg-emerald-500/10 text-emerald-600"
                                  : "bg-amber-500/10 text-amber-600"
                              }`}
                            >
                              {h.status}
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-[11px]">
                            {new Date(h.createdAt).toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
