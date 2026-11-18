"use client";

import * as React from "react";
import Link from "next/link";
import {
  FileSpreadsheet,
  FileCheck2,
  Building2,
  FileSignature,
  ShieldCheck,
  MessageSquareText,
  ArrowRight,
  Play,
  RefreshCw,
  Clock,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { UserRole } from "@/types/auth";
import { getDashboardQuickActionsForRole } from "./quick-actions";

interface AuthenticatedDashboardProps {
  userName: string;
  userEmail: string;
  userRole: UserRole;
  initialStats: {
    requisitionsCount: number;
    recentRequisitions: Array<{
      prNo: string;
      plantCode: string;
      status: string;
      urgency: string;
      totalEstimatedAmount: number;
      linesCount: number;
      createdAt: string;
    }>;
    suppliersCount: number;
    activeSuppliersCount: number;
    contractsCount: number;
    itemsCount: number;
    activePolicyVersion: string;
    recentRuns: Array<{
      runId: string;
      batchName: string;
      policyVersion: string;
      totalPrLines: number;
      totalRequirements: number;
      totalPOs: number;
      totalSourcingRequests: number;
      totalNotProcessed: number;
      createdAt: string;
    }>;
  };
}

export function AuthenticatedDashboard({
  userName,
  userRole,
  initialStats,
}: AuthenticatedDashboardProps) {
  const { toast } = useToast();
  const [stats, setStats] = React.useState(initialStats);
  const [runningBatch, setRunningBatch] = React.useState(false);

  const isBuyerOrAdmin = userRole === "BUYER" || userRole === "PROCUREMENT_ADMIN";
  const latestRun = stats.recentRuns[0] || null;

  const handleRunSampleBatch = async () => {
    setRunningBatch(true);
    try {
      const res = await fetch("/api/process-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useSampleBatch: true }),
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error?.message || "Batch execution failed");
      }
      toast({
        title: "Sample PR Batch Processed",
        description: `Processed ${json.data.totalPrLines} PR lines into ${json.data.totalPOs} proposed POs and ${json.data.totalSourcingRequests} sourcing requests.`,
      });
      const runsRes = await fetch("/api/process-batch");
      const runsJson = await runsRes.json();
      if (runsJson.success && Array.isArray(runsJson.data)) {
        setStats((prev) => ({
          ...prev,
          recentRuns: runsJson.data,
        }));
      }
    } catch (err: unknown) {
      toast({
        title: "Batch Processing Error",
        description: err instanceof Error ? err.message : "Could not run batch",
        variant: "destructive",
      });
    } finally {
      setRunningBatch(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Welcome Banner */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#EAEAEA] pb-5">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[#171717]">
              Procurement Overview
            </h1>
            <span className="inline-flex items-center rounded-full bg-[#F3EEFF] border border-[#6938EF]/20 px-2.5 py-0.5 text-[11px] font-medium text-[#6938EF]">
              {userRole.replace("_", " ")}
            </span>
          </div>
          <p className="text-xs sm:text-sm font-normal text-[#6B7280]">
            Welcome back, <span className="font-medium text-[#171717]">{userName}</span>. Monitor requisitions, supplier evaluations, and policy decisions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Link href="/chat">
            <Button className="rounded-xl bg-[#6938EF] hover:bg-[#5928DF] text-white h-9 text-xs font-medium gap-1.5 px-4 shadow-2xs">
              <MessageSquareText className="h-3.5 w-3.5" />
              <span>New Requisition</span>
            </Button>
          </Link>

          {isBuyerOrAdmin && (
            <Link href="/decisions">
              <Button
                variant="outline"
                className="rounded-xl border-[#E5E7EB] bg-white hover:bg-[#F9FAFB] text-[#171717] h-9 text-xs font-medium gap-1.5 px-4"
              >
                <Layers className="h-3.5 w-3.5 text-[#6938EF]" />
                <span>Decision Workspace</span>
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* 4 Balanced Pastel KPI Cards (Medium/Semibold Premium Hierarchy) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Soft Yellow */}
        <div className="rounded-2xl bg-[#FFF2CC] p-5 border border-amber-200/60 flex flex-col justify-between min-h-[144px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#4B5563]">
              Requisition Lines
            </span>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/90 text-[#171717] shadow-2xs">
              <FileSpreadsheet className="h-4 w-4 stroke-[1.75]" />
            </div>
          </div>
          <div className="pt-2">
            <div className="text-3xl font-semibold text-[#171717] tracking-tight">
              {latestRun ? latestRun.totalPrLines : stats.requisitionsCount}
            </div>
            <p className="text-xs font-normal text-[#4B5563] mt-1">
              {latestRun
                ? `${latestRun.totalRequirements} clubbed requirements`
                : `${stats.requisitionsCount} requisitions submitted`}
            </p>
          </div>
        </div>

        {/* Card 2: Soft Blue */}
        <div className="rounded-2xl bg-[#DDF3FF] p-5 border border-sky-200/60 flex flex-col justify-between min-h-[144px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#4B5563]">
              Proposed POs
            </span>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/90 text-[#171717] shadow-2xs">
              <FileCheck2 className="h-4 w-4 stroke-[1.75]" />
            </div>
          </div>
          <div className="pt-2">
            <div className="text-3xl font-semibold text-[#171717] tracking-tight">
              {latestRun ? latestRun.totalPOs : 0}
            </div>
            <p className="text-xs font-normal text-[#4B5563] mt-1">
              {latestRun
                ? `${latestRun.totalSourcingRequests} sourcing events`
                : "24-hour consolidated POs"}
            </p>
          </div>
        </div>

        {/* Card 3: Soft Pink */}
        <div className="rounded-2xl bg-[#FCE3EF] p-5 border border-pink-200/60 flex flex-col justify-between min-h-[144px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#4B5563]">
              Active Suppliers
            </span>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/90 text-[#171717] shadow-2xs">
              <Building2 className="h-4 w-4 stroke-[1.75]" />
            </div>
          </div>
          <div className="pt-2">
            <div className="text-3xl font-semibold text-[#171717] tracking-tight">
              {stats.activeSuppliersCount}
              <span className="text-base font-normal text-[#6B7280]">
                {" "}
                / {stats.suppliersCount}
              </span>
            </div>
            <p className="text-xs font-normal text-[#4B5563] mt-1">
              {stats.itemsCount} master catalogue items
            </p>
          </div>
        </div>

        {/* Card 4: Soft Teal */}
        <div className="rounded-2xl bg-[#D9FAF5] p-5 border border-teal-200/60 flex flex-col justify-between min-h-[144px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#4B5563]">
              Rate Contracts
            </span>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/90 text-[#171717] shadow-2xs">
              <FileSignature className="h-4 w-4 stroke-[1.75]" />
            </div>
          </div>
          <div className="pt-2">
            <div className="flex items-center gap-2">
              <span className="text-3xl font-semibold text-[#171717] tracking-tight">
                {stats.contractsCount}
              </span>
              <span className="rounded-md bg-white/90 px-2 py-0.5 text-[11px] font-medium text-[#171717]">
                Policy v{stats.activePolicyVersion}
              </span>
            </div>
            <p className="text-xs font-normal text-[#4B5563] mt-1">
              Live ceiling consumption tracking
            </p>
          </div>
        </div>
      </div>

      {/* Main Content Grid: 8 Cols Left + 4 Cols Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left 8 Columns */}
        <div className="lg:col-span-8 space-y-5">
          {isBuyerOrAdmin && (
            <div className="rounded-2xl border border-[#EAEAEA] bg-white p-5 sm:p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-[#171717]">
                    Decision Distribution &amp; Batch Runs
                  </h2>
                  <p className="text-xs font-normal text-[#6B7280] mt-0.5">
                    Evaluated under Corvo Procurement Policy v{stats.activePolicyVersion}
                  </p>
                </div>

                <Button
                  size="sm"
                  onClick={handleRunSampleBatch}
                  disabled={runningBatch}
                  className="rounded-xl bg-[#6938EF] hover:bg-[#5928DF] text-white h-9 text-xs font-medium gap-1.5 px-3.5 shrink-0"
                >
                  {runningBatch ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {latestRun ? "Re-Verify Sample Batch" : "Run Sample Batch (186 Lines)"}
                  </span>
                </Button>
              </div>

              {latestRun ? (
                <div className="space-y-4">
                  {/* Latest Run Summary Box */}
                  <div className="rounded-xl bg-[#FAFAFC] border border-[#EAEAEA] p-4 space-y-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-medium text-[#171717]">
                        Latest Run:{" "}
                        <span className="font-mono font-semibold text-[#6938EF]">
                          {latestRun.runId}
                        </span>
                      </span>
                      <span className="rounded-md bg-white border border-[#EAEAEA] px-2 py-0.5 text-[11px] font-medium text-[#4B5563]">
                        Policy v{latestRun.policyVersion} &bull; {latestRun.totalPrLines} PR lines
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="rounded-xl bg-[#FFF2CC]/85 p-3.5">
                        <span className="text-xs font-normal text-[#4B5563] block">
                          Requirements
                        </span>
                        <span className="text-xl font-semibold text-[#171717] mt-0.5 block">
                          {latestRun.totalRequirements}
                        </span>
                      </div>
                      <div className="rounded-xl bg-[#DDF3FF]/85 p-3.5">
                        <span className="text-xs font-normal text-[#4B5563] block">
                          Proposed POs
                        </span>
                        <span className="text-xl font-semibold text-[#171717] mt-0.5 block">
                          {latestRun.totalPOs}
                        </span>
                      </div>
                      <div className="rounded-xl bg-[#FCE3EF]/85 p-3.5">
                        <span className="text-xs font-normal text-[#4B5563] block">
                          Sourcing Events
                        </span>
                        <span className="text-xl font-semibold text-[#171717] mt-0.5 block">
                          {latestRun.totalSourcingRequests}
                        </span>
                      </div>
                      <div className="rounded-xl bg-[#D9FAF5]/85 p-3.5">
                        <span className="text-xs font-normal text-[#4B5563] block">
                          Excluded Lines
                        </span>
                        <span className="text-xl font-semibold text-[#171717] mt-0.5 block">
                          {latestRun.totalNotProcessed}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-[#EAEAEA] text-xs">
                      <span className="font-normal text-[#6B7280]">
                        All proposed POs are staged as{" "}
                        <span className="font-medium text-[#171717]">PROPOSED</span> for buyer review.
                      </span>
                      <div className="flex flex-wrap items-center gap-4">
                        <Link
                          href="/purchase-orders"
                          className="font-medium text-[#6938EF] hover:underline inline-flex items-center gap-1"
                        >
                          <span>Review Proposed POs</span>
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                        <Link
                          href="/sourcing-requests"
                          className="font-medium text-[#6938EF] hover:underline inline-flex items-center gap-1"
                        >
                          <span>Review Sourcing</span>
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </div>
                  </div>

                  {/* Recent Processing Runs List */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-medium text-[#6B7280]">
                      Recent Batch History
                    </h3>
                    <div className="divide-y divide-[#EAEAEA] rounded-xl border border-[#EAEAEA]">
                      {stats.recentRuns.slice(0, 3).map((run) => (
                        <div
                          key={run.runId}
                          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 p-3.5"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-semibold text-[#171717]">
                                {run.runId}
                              </span>
                              <Badge variant="outline" className="text-[10px] font-medium">
                                v{run.policyVersion}
                              </Badge>
                            </div>
                            <div className="text-xs font-normal text-[#6B7280]">
                              {run.batchName} &bull; {run.totalPrLines} lines &rarr;{" "}
                              <span className="font-medium text-[#171717]">{run.totalPOs} POs</span>{" "}
                              &amp;{" "}
                              <span className="font-medium text-[#171717]">
                                {run.totalSourcingRequests} Sourcing
                              </span>
                            </div>
                          </div>
                          <Link href="/decisions">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-lg text-xs font-medium px-3"
                            >
                              Inspect Run
                            </Button>
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[#D1D5DB] bg-[#FAFAFC] p-7 text-center space-y-1.5">
                  <p className="text-sm font-semibold text-[#171717]">
                    No Batch Runs Processed Yet
                  </p>
                  <p className="text-xs font-normal text-[#6B7280] max-w-md mx-auto">
                    Click &ldquo;Run Sample Batch (186 Lines)&rdquo; above to evaluate the supplied requisition batch.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Recent Requisitions Activity */}
          <div className="rounded-2xl border border-[#EAEAEA] bg-white p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[#171717]">
                  Recent Requisitions
                </h2>
                <p className="text-xs font-normal text-[#6B7280]">
                  Submitted via Procurement Chat or batch import
                </p>
              </div>
              <Link href="/requisitions">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg h-8 text-xs font-medium px-3"
                >
                  View All
                </Button>
              </Link>
            </div>

            {stats.recentRequisitions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#D1D5DB] bg-[#FAFAFC] p-6 text-center space-y-2.5">
                <Clock className="h-6 w-6 text-[#6938EF] mx-auto stroke-[1.75]" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-[#171717]">
                    No Conversational Requisitions Yet
                  </p>
                  <p className="text-xs font-normal text-[#6B7280] max-w-md mx-auto">
                    Use Procurement Chat to create a new purchase requisition in plain English.
                  </p>
                </div>
                <Link href="/chat">
                  <Button size="sm" className="rounded-xl bg-[#6938EF] text-white h-8 text-xs font-medium px-4">
                    Open Procurement Chat
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-[#EAEAEA] rounded-xl border border-[#EAEAEA]">
                {stats.recentRequisitions.map((req) => (
                  <div
                    key={req.prNo}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 p-3.5"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-[#171717]">
                          {req.prNo}
                        </span>
                        <Badge variant="outline" className="text-[10px] font-medium">
                          {req.plantCode}
                        </Badge>
                        <Badge className="bg-[#D9FAF5] text-[#171717] border-0 text-[10px] font-medium">
                          {req.status}
                        </Badge>
                      </div>
                      <div className="text-xs font-normal text-[#6B7280]">
                        {req.linesCount} line(s) &bull; {req.urgency} &bull; Est. ₹
                        {(req.totalEstimatedAmount || 0).toLocaleString("en-IN")}
                      </div>
                    </div>
                    <Link href="/requisitions">
                      <Button variant="ghost" size="sm" className="h-7 text-xs font-medium">
                        Details
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right 4 Columns: Quick Actions & Policy Guardrails */}
        <div className="lg:col-span-4 space-y-5">
          <div className="rounded-2xl border border-[#EAEAEA] bg-white p-5 sm:p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-[#171717]">
                Quick Actions
              </h2>
              <p className="text-xs font-normal text-[#6B7280]">
                Shortcuts for {userRole.replace("_", " ")}
              </p>
            </div>

            <div className="space-y-2.5">
              {getDashboardQuickActionsForRole(userRole).map((action) => {
                const ActionIcon = action.icon;
                return (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="flex items-center justify-between rounded-xl border border-[#EAEAEA] bg-[#FAFAFC] p-3.5 hover:border-[#6938EF]/50 hover:bg-white transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${action.accentBg} text-[#171717]`}
                      >
                        <ActionIcon className="h-4 w-4 stroke-[1.75]" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#171717] truncate">
                          {action.title}
                        </div>
                        <div className="text-[11px] font-normal text-[#6B7280] truncate">
                          {action.description}
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-[#6B7280]" />
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Policy Governance Summary Card */}
          <div className="rounded-2xl bg-white border border-[#EAEAEA] p-5 sm:p-6 space-y-3.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#171717]">
              <ShieldCheck className="h-4 w-4 text-[#6938EF]" />
              <span>Policy v{stats.activePolicyVersion} Guardrails</span>
            </div>
            <ul className="space-y-2 text-xs">
              <li className="flex items-center justify-between">
                <span className="font-normal text-[#6B7280]">In-Scope Plants</span>
                <span className="font-mono font-medium text-[#171717]">PUN1, CHK1</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="font-normal text-[#6B7280]">Clubbing Window</span>
                <span className="font-mono font-medium text-[#171717]">14d / ±7d</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="font-normal text-[#6B7280]">Spot PO Limit</span>
                <span className="font-mono font-medium text-[#171717]">&lt; ₹2,00,000</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="font-normal text-[#6B7280]">Emergency Cap</span>
                <span className="font-mono font-medium text-[#171717]">≤ ₹5,00,000</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="font-normal text-[#6B7280]">RFQ / RFP Split</span>
                <span className="font-mono font-medium text-[#171717]">₹10,00,000</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
