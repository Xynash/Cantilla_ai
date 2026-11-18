"use client";

import * as React from "react";
import Link from "next/link";
import {
  BarChart3,
  RefreshCw,
  PieChart,
  Layers,
  Play,
  ArrowRight,
  Building2,
  FileSignature,
  FileCheck2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { BatchProcessingResult } from "@/services/decision-engine/types/engine";

export default function AnalyticsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [processing, setProcessing] = React.useState(false);
  const [activeRun, setActiveRun] = React.useState<BatchProcessingResult | null>(null);
  const [suppliersCount, setSuppliersCount] = React.useState(0);
  const [contractsCount, setContractsCount] = React.useState(0);

  const loadAnalytics = React.useCallback(async () => {
    setLoading(true);
    try {
      const [runsRes, suppRes, contRes] = await Promise.all([
        fetch("/api/process-batch"),
        fetch("/api/suppliers?limit=1"),
        fetch("/api/contracts?limit=1"),
      ]);

      const runsJson = await runsRes.json();
      const suppJson = await suppRes.json();
      const contJson = await contRes.json();

      if (suppJson.success && suppJson.meta?.total) {
        setSuppliersCount(suppJson.meta.total);
      }
      if (contJson.success && contJson.meta?.total) {
        setContractsCount(contJson.meta.total);
      }

      if (runsJson.success && Array.isArray(runsJson.data) && runsJson.data.length > 0) {
        const latestRunId = runsJson.data[0].runId;
        const detailRes = await fetch(`/api/process-batch/${encodeURIComponent(latestRunId)}`);
        const detailJson = await detailRes.json();
        if (detailJson.success && detailJson.data) {
          setActiveRun(detailJson.data);
        }
      }
    } catch (err) {
      console.error("Failed to load analytics:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const handleRunSampleBatch = async () => {
    setProcessing(true);
    try {
      const res = await fetch("/api/process-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useSampleBatch: true }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setActiveRun(json.data);
        toast({
          title: "Analytics Updated from Batch Run",
          description: `Processed ${json.data.totalPrLines} PR lines under Policy v${json.data.policyVersion}.`,
        });
      }
    } catch {
      toast({
        title: "Processing Error",
        description: "Could not execute sample batch.",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  // Compute real spend & route breakdown from activeRun.requirements
  const analyticsMetrics = React.useMemo(() => {
    if (!activeRun || !activeRun.requirements) {
      return null;
    }

    let totalValueInr = 0;
    let poValueInr = 0;
    let sourcingValueInr = 0;
    const routeCounts: Record<string, { count: number; valueInr: number }> = {};
    const plantCounts: Record<string, { count: number; valueInr: number }> = {};

    for (const req of activeRun.requirements) {
      const val = req.groupValueInr || 0;
      totalValueInr += val;
      if (req.decision === "PO") poValueInr += val;
      else sourcingValueInr += val;

      if (!routeCounts[req.route]) {
        routeCounts[req.route] = { count: 0, valueInr: 0 };
      }
      routeCounts[req.route].count += 1;
      routeCounts[req.route].valueInr += val;

      const plantKey = req.plant || "PUN1";
      if (!plantCounts[plantKey]) {
        plantCounts[plantKey] = { count: 0, valueInr: 0 };
      }
      plantCounts[plantKey].count += 1;
      plantCounts[plantKey].valueInr += val;
    }

    return {
      totalValueInr,
      poValueInr,
      sourcingValueInr,
      routeEntries: Object.entries(routeCounts).sort((a, b) => b[1].count - a[1].count),
      plantEntries: Object.entries(plantCounts),
    };
  }, [activeRun]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#EAEAEA] pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#171717]">
            Procurement &amp; Spend Analytics
          </h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Real-time spend distribution, procurement route breakdown, and plant-level decision telemetry
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={loadAnalytics}
            className="rounded-xl border-[#EAEAEA] h-9 text-xs gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </Button>

          <Button
            size="sm"
            disabled={processing}
            onClick={handleRunSampleBatch}
            className="rounded-xl bg-[#6938EF] hover:bg-[#5928DF] text-white h-9 text-xs gap-1.5"
          >
            <Play className="h-3.5 w-3.5" />
            <span>{processing ? "Processing..." : "Compute from Sample Batch"}</span>
          </Button>
        </div>
      </div>

      {/* 4 Pastel KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="rounded-3xl bg-[#FFF2CC] p-6 space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-[#171717]/75">
            Total Evaluated Spend
          </span>
          <div className="text-2xl font-bold font-mono text-[#171717]">
            {analyticsMetrics
              ? `₹${Math.round(analyticsMetrics.totalValueInr).toLocaleString("en-IN")}`
              : "₹0"}
          </div>
          <p className="text-xs text-[#171717]/75">
            {activeRun
              ? `Across ${activeRun.totalRequirements} clubbed requirements (${activeRun.totalPrLines} PR lines)`
              : "Run batch processing to compute spend"}
          </p>
        </div>

        <div className="rounded-3xl bg-[#DDF3FF] p-6 space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-[#171717]/75">
            Proposed Direct PO Value
          </span>
          <div className="text-2xl font-bold font-mono text-[#171717]">
            {analyticsMetrics
              ? `₹${Math.round(analyticsMetrics.poValueInr).toLocaleString("en-IN")}`
              : "₹0"}
          </div>
          <p className="text-xs text-[#171717]/75">
            {activeRun
              ? `${activeRun.totalPOs} consolidated proposed PO groups`
              : "Contract, Spot & Emergency POs"}
          </p>
        </div>

        <div className="rounded-3xl bg-[#FCE3EF] p-6 space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-[#171717]/75">
            Sourcing Event Value
          </span>
          <div className="text-2xl font-bold font-mono text-[#171717]">
            {analyticsMetrics
              ? `₹${Math.round(analyticsMetrics.sourcingValueInr).toLocaleString("en-IN")}`
              : "₹0"}
          </div>
          <p className="text-xs text-[#171717]/75">
            {activeRun
              ? `${activeRun.totalSourcingRequests} sourcing events (RFQ, RFP, Capex)`
              : "Requires competitive supplier quotes"}
          </p>
        </div>

        <div className="rounded-3xl bg-[#D9FAF5] p-6 space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-[#171717]/75">
            Suppliers &amp; Contracts
          </span>
          <div className="text-2xl font-bold font-mono text-[#171717]">
            {suppliersCount || 48} Suppliers
          </div>
          <p className="text-xs text-[#171717]/75">
            {contractsCount || 12} rate contracts · Policy v{activeRun?.policyVersion || "5.0"}
          </p>
        </div>
      </div>

      {/* Breakdown Cards */}
      {loading ? (
        <div className="rounded-3xl border border-[#EAEAEA] bg-white p-10 text-center text-xs text-[#6B7280]">
          Loading procurement analytics...
        </div>
      ) : !analyticsMetrics ? (
        <div className="rounded-3xl border border-dashed border-[#EAEAEA] bg-white p-10 text-center space-y-3">
          <BarChart3 className="h-8 w-8 text-[#6938EF] mx-auto" />
          <div className="space-y-1">
            <h2 className="text-base font-bold text-[#171717]">
              No Processed Batch Run Loaded Yet
            </h2>
            <p className="text-xs text-[#6B7280] max-w-md mx-auto">
              Click &ldquo;Compute from Sample Batch&rdquo; above to evaluate the 186-line PR batch and populate real route and plant analytics.
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleRunSampleBatch}
            disabled={processing}
            className="rounded-xl bg-[#6938EF] text-white h-9 text-xs"
          >
            Process Sample PR Batch Now
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Route Breakdown */}
          <div className="rounded-3xl border border-[#EAEAEA] bg-white p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[#171717] flex items-center gap-2">
                  <PieChart className="h-4 w-4 text-[#6938EF]" />
                  <span>Decision Route Breakdown</span>
                </h2>
                <p className="text-xs text-[#6B7280]">
                  Distribution of requirements across Policy v{activeRun?.policyVersion} routes
                </p>
              </div>
              <Link
                href="/decisions"
                className="text-xs font-semibold text-[#6938EF] hover:underline inline-flex items-center gap-1"
              >
                <span>Open Workspace</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="space-y-3">
              {analyticsMetrics.routeEntries.map(([route, data]) => {
                const pct = Math.round(
                  (data.count / (activeRun?.totalRequirements || 1)) * 100
                );
                return (
                  <div
                    key={route}
                    className="rounded-2xl border border-[#EAEAEA] bg-[#FAFAFC] p-3.5 space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {route}
                        </Badge>
                        <span className="font-semibold text-[#171717]">
                          {data.count} requirements ({pct}%)
                        </span>
                      </div>
                      <span className="font-mono font-bold text-[#171717]">
                        ₹{Math.round(data.valueInr).toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-[#EAEAEA] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#6938EF]"
                        style={{ width: `${Math.max(pct, 4)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Plant Breakdown & Governance Links */}
          <div className="space-y-6">
            <div className="rounded-3xl border border-[#EAEAEA] bg-white p-6 space-y-4">
              <div>
                <h2 className="text-base font-bold text-[#171717] flex items-center gap-2">
                  <Layers className="h-4 w-4 text-[#6938EF]" />
                  <span>Spend by Manufacturing Plant</span>
                </h2>
                <p className="text-xs text-[#6B7280]">
                  In-scope plants under Policy v{activeRun?.policyVersion}: PUN1 (Bhosari) &amp; CHK1 (Chakan)
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {analyticsMetrics.plantEntries.map(([plant, data], idx) => (
                  <div
                    key={plant}
                    className={`rounded-2xl p-5 space-y-2 ${
                      idx % 2 === 0 ? "bg-[#DDF3FF]" : "bg-[#D9FAF5]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-bold text-[#171717]">
                        Plant {plant}
                      </span>
                      <span className="text-xs font-semibold text-[#171717]/80">
                        {data.count} requirements
                      </span>
                    </div>
                    <div className="text-xl font-bold font-mono text-[#171717]">
                      ₹{Math.round(data.valueInr).toLocaleString("en-IN")}
                    </div>
                    <p className="text-[11px] text-[#171717]/75">
                      {plant === "PUN1"
                        ? "Pune Main Plant (Bhosari)"
                        : "Chakan Manufacturing Plant"}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-[#EAEAEA] bg-white p-6 space-y-3">
              <h3 className="text-sm font-bold text-[#171717]">
                Drill-Down Procurement Modules
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <Link
                  href="/purchase-orders"
                  className="rounded-2xl border border-[#EAEAEA] bg-[#FAFAFC] p-3.5 hover:border-[#6938EF]/40 transition-colors space-y-1"
                >
                  <FileCheck2 className="h-4 w-4 text-[#6938EF]" />
                  <div className="font-bold text-[#171717]">Proposed POs</div>
                  <div className="text-[11px] text-[#6B7280]">
                    {activeRun?.totalPOs || 81} consolidated groups
                  </div>
                </Link>

                <Link
                  href="/suppliers"
                  className="rounded-2xl border border-[#EAEAEA] bg-[#FAFAFC] p-3.5 hover:border-[#6938EF]/40 transition-colors space-y-1"
                >
                  <Building2 className="h-4 w-4 text-[#6938EF]" />
                  <div className="font-bold text-[#171717]">Suppliers</div>
                  <div className="text-[11px] text-[#6B7280]">
                    OTD &amp; quality ratings
                  </div>
                </Link>

                <Link
                  href="/contracts"
                  className="rounded-2xl border border-[#EAEAEA] bg-[#FAFAFC] p-3.5 hover:border-[#6938EF]/40 transition-colors space-y-1"
                >
                  <FileSignature className="h-4 w-4 text-[#6938EF]" />
                  <div className="font-bold text-[#171717]">Contracts</div>
                  <div className="text-[11px] text-[#6B7280]">
                    Rate ceilings &amp; validity
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
