"use client";

import * as React from "react";
import {
  FileText,
  Download,
  RefreshCw,
  Calendar,
  Building2,
  FileCheck2,
  FileSpreadsheet,
  Layers,
  BarChart3,
  AlertCircle,
} from "lucide-react";
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
import {
  ReportType,
  GeneratedReportResult,
} from "@/services/reportService";

const REPORT_TEMPLATES: Array<{
  type: ReportType;
  title: string;
  description: string;
  icon: React.ElementType;
  accentBg: string;
}> = [
  {
    type: "PROCUREMENT_SUMMARY",
    title: "Procurement Summary",
    description: "Route distribution, active supplier pool, and contract commitments",
    icon: BarChart3,
    accentBg: "bg-[#FFF2CC]",
  },
  {
    type: "PURCHASE_ORDER_SUMMARY",
    title: "Purchase Order Summary",
    description: "Proposed PO groups and historical purchase order dispatches",
    icon: FileCheck2,
    accentBg: "bg-[#DDF3FF]",
  },
  {
    type: "SUPPLIER_PERFORMANCE_SUMMARY",
    title: "Supplier Performance",
    description: "OTD %, quality ratings, 548-day PO counts, and eligibility status",
    icon: Building2,
    accentBg: "bg-[#FCE3EF]",
  },
  {
    type: "REQUISITION_SUMMARY",
    title: "Requisition Summary",
    description: "Submitted PRs and evaluated batch PR lines with plant breakdown",
    icon: FileSpreadsheet,
    accentBg: "bg-[#D9FAF5]",
  },
  {
    type: "SOURCING_ACTIVITY_SUMMARY",
    title: "Sourcing Activity",
    description: "Competitive RFQ, RFP, and Capex sourcing events and suggested suppliers",
    icon: Layers,
    accentBg: "bg-[#F3EEFF]",
  },
];

export default function ReportsPage() {
  const { toast } = useToast();
  const [selectedType, setSelectedType] = React.useState<ReportType>(
    "PROCUREMENT_SUMMARY"
  );
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<GeneratedReportResult | null>(null);

  const fetchReport = React.useCallback(
    async (typeToLoad: ReportType, start?: string, end?: string) => {
      setLoading(true);
      setErrorMessage(null);

      if (start && end && new Date(start).getTime() > new Date(end).getTime()) {
        const msg = "Start date cannot be after end date.";
        setErrorMessage(msg);
        setLoading(false);
        toast({
          title: "Invalid Date Range",
          description: msg,
          variant: "destructive",
        });
        return;
      }

      try {
        const params = new URLSearchParams({ reportType: typeToLoad });
        if (start?.trim()) params.set("startDate", start.trim());
        if (end?.trim()) params.set("endDate", end.trim());

        const res = await fetch(`/api/reports?${params.toString()}`);
        const json = await res.json();

        if (!json.success) {
          const msg = json.error?.message || "Failed to generate report";
          setErrorMessage(msg);
          toast({
            title: "Report Error",
            description: msg,
            variant: "destructive",
          });
          return;
        }

        setReport(json.data);
      } catch {
        const msg = "Network error while generating report.";
        setErrorMessage(msg);
        toast({
          title: "Network Error",
          description: msg,
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  React.useEffect(() => {
    fetchReport(selectedType, startDate, endDate);
  }, [selectedType, fetchReport]);

  const handleApplyDateFilter = (e: React.FormEvent) => {
    e.preventDefault();
    fetchReport(selectedType, startDate, endDate);
  };

  const handleResetDates = () => {
    setStartDate("");
    setEndDate("");
    fetchReport(selectedType, "", "");
  };

  const handleDownloadCsv = () => {
    if (!report || report.rows.length === 0) {
      toast({
        title: "No Data to Export",
        description: "The current report contains 0 matching records.",
        variant: "destructive",
      });
      return;
    }

    const blob = new Blob([report.csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `${report.reportType.toLowerCase()}_${report.generatedAt.slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "CSV Export Downloaded",
      description: `Exported ${report.rows.length} rows for ${report.title}.`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#EAEAEA] pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[#171717]">
            Reports &amp; Compliance Audits
          </h1>
          <p className="text-xs sm:text-sm text-[#6B7280] mt-0.5">
            Live data reports, date-range filtering, and verifiable CSV exports across procurement operations
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchReport(selectedType, startDate, endDate)}
            disabled={loading}
            className="rounded-xl border-[#EAEAEA] h-9 text-xs font-medium gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh Data</span>
          </Button>

          <Button
            size="sm"
            onClick={handleDownloadCsv}
            disabled={loading || !report || report.rows.length === 0}
            className="rounded-xl bg-[#6938EF] hover:bg-[#5928DF] text-white h-9 text-xs font-medium gap-1.5 px-4"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV ({report?.rows.length || 0})</span>
          </Button>
        </div>
      </div>

      {/* 5 Report Selector Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {REPORT_TEMPLATES.map((tpl) => {
          const Icon = tpl.icon;
          const active = selectedType === tpl.type;
          return (
            <button
              key={tpl.type}
              type="button"
              onClick={() => setSelectedType(tpl.type)}
              className={`rounded-2xl border p-4 text-left transition-all flex flex-col justify-between ${
                active
                  ? "border-[#6938EF] bg-white ring-2 ring-[#6938EF]/15 shadow-xs"
                  : "border-[#EAEAEA] bg-white hover:border-[#6938EF]/40"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-xl ${tpl.accentBg} text-[#171717]`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                {active && (
                  <span className="rounded-full bg-[#F3EEFF] px-2 py-0.5 text-[10px] font-medium text-[#6938EF]">
                    Active
                  </span>
                )}
              </div>
              <div>
                <div className="text-xs font-semibold text-[#171717]">
                  {tpl.title}
                </div>
                <p className="text-[11px] text-[#6B7280] mt-1 leading-snug">
                  {tpl.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Date Range Filter Bar */}
      <form
        onSubmit={handleApplyDateFilter}
        className="rounded-2xl border border-[#EAEAEA] bg-white p-4 flex flex-col sm:flex-row sm:items-end justify-between gap-4"
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label
              htmlFor="report-start-date"
              className="text-[11px] font-medium text-[#4B5563] flex items-center gap-1"
            >
              <Calendar className="h-3 w-3 text-[#6938EF]" />
              <span>Start Date (From)</span>
            </label>
            <Input
              id="report-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-8 text-xs w-40 rounded-lg"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="report-end-date"
              className="text-[11px] font-medium text-[#4B5563] flex items-center gap-1"
            >
              <Calendar className="h-3 w-3 text-[#6938EF]" />
              <span>End Date (To)</span>
            </label>
            <Input
              id="report-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-8 text-xs w-40 rounded-lg"
            />
          </div>

          <Button
            type="submit"
            size="sm"
            disabled={loading}
            className="h-8 rounded-lg bg-[#6938EF] hover:bg-[#5928DF] text-white text-xs font-medium px-3.5"
          >
            Apply Date Filter
          </Button>

          {(startDate || endDate) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleResetDates}
              className="h-8 text-xs text-[#6B7280]"
            >
              Clear Dates
            </Button>
          )}
        </div>

        {report && (
          <div className="text-[11px] font-mono text-[#6B7280]">
            Report ID: <span className="text-[#171717] font-medium">{report.reportId}</span>
          </div>
        )}
      </form>

      {/* Error Banner */}
      {errorMessage && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 flex items-center gap-2.5 text-xs text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Summary Metrics + Data Table */}
      {loading ? (
        <div className="rounded-2xl border border-[#EAEAEA] bg-white p-12 text-center text-xs text-[#6B7280] space-y-2">
          <RefreshCw className="h-5 w-5 animate-spin text-[#6938EF] mx-auto" />
          <p>Compiling live procurement report records...</p>
        </div>
      ) : report ? (
        <div className="space-y-5">
          {/* 4 Pastel Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {report.summaryMetrics.map((m, idx) => {
              const colors = [
                "bg-[#FFF2CC] border-amber-200/60",
                "bg-[#DDF3FF] border-sky-200/60",
                "bg-[#FCE3EF] border-pink-200/60",
                "bg-[#D9FAF5] border-teal-200/60",
              ];
              return (
                <div
                  key={m.label}
                  className={`rounded-2xl border p-4 ${colors[idx % colors.length]}`}
                >
                  <span className="text-xs font-medium text-[#4B5563]">
                    {m.label}
                  </span>
                  <div className="text-2xl font-semibold text-[#171717] mt-1 font-mono">
                    {m.value}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Report Table Card */}
          <div className="rounded-2xl border border-[#EAEAEA] bg-white overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-5 py-4 border-b border-[#EAEAEA]">
              <div>
                <h2 className="text-sm font-semibold text-[#171717]">
                  {report.title}
                </h2>
                <p className="text-xs text-[#6B7280]">{report.description}</p>
              </div>
              <span className="rounded-lg bg-[#FAFAFC] border border-[#EAEAEA] px-2.5 py-1 text-xs font-mono text-[#4B5563] self-start sm:self-auto">
                {report.rows.length} record(s)
              </span>
            </div>

            {report.rows.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={FileText}
                  title="No Matching Records for Report"
                  description={
                    report.unavailableReason ||
                    "No source records matched the selected report parameters or date range."
                  }
                  badge="0 Rows Returned"
                  actionLabel={startDate || endDate ? "Clear Date Filter" : undefined}
                  onAction={startDate || endDate ? handleResetDates : undefined}
                />
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[480px]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-[#FAFAFC]">
                      {report.columns.map((col) => (
                        <TableHead
                          key={col}
                          className="text-[11px] font-mono uppercase text-[#4B5563] whitespace-nowrap"
                        >
                          {col.replace(/_/g, " ")}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.rows.slice(0, 100).map((row, idx) => (
                      <TableRow key={idx} className="text-xs hover:bg-[#FAFAFC]">
                        {report.columns.map((col) => (
                          <TableCell
                            key={col}
                            className="font-mono text-[11px] text-[#171717] whitespace-nowrap"
                          >
                            {row[col] !== null && row[col] !== undefined
                              ? String(row[col])
                              : "—"}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
