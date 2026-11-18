import * as React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  ShieldAlert,
  Building2,
  CheckCircle2,
  Ban,
  FileSignature,
  Award,
  Clock,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth/guard";
import { getSupplierDetailIntelligence } from "@/services/decision-engine/preferred-suppliers/supplierIntelligenceService";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function SupplierDetailPage(context: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/signin?callbackUrl=/suppliers");
  }

  if (user.role !== "BUYER" && user.role !== "PROCUREMENT_ADMIN") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50/60 p-8 text-center space-y-2">
        <ShieldAlert className="h-8 w-8 text-red-600 mx-auto" />
        <h2 className="text-base font-semibold text-[#171717]">
          Authorization Required
        </h2>
        <p className="text-xs text-[#6B7280]">
          Only BUYER and PROCUREMENT_ADMIN users can view supplier intelligence details.
        </p>
      </div>
    );
  }

  const { id } = await context.params;
  let detail: Awaited<ReturnType<typeof getSupplierDetailIntelligence>> | null = null;
  try {
    detail = await getSupplierDetailIntelligence(decodeURIComponent(id));
  } catch {
    detail = null;
  }

  if (!detail) {
    return (
      <div className="rounded-2xl border border-[#EAEAEA] bg-white p-8 text-center space-y-3">
        <h2 className="text-base font-semibold text-[#171717]">
          Supplier Not Found
        </h2>
        <p className="text-xs text-[#6B7280]">
          Could not locate supplier record &ldquo;{decodeURIComponent(id)}&rdquo;.
        </p>
        <Link href="/suppliers">
          <Button variant="outline" size="sm" className="rounded-xl text-xs">
            Back to Supplier Intelligence
          </Button>
        </Link>
      </div>
    );
  }

  const { profile, eligibility, performance, purchaseHistory, contracts, itemRankings } =
    detail;

  return (
    <div className="space-y-6">
      {/* Top Navigation & Supplier Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#EAEAEA] pb-5">
        <div className="space-y-1">
          <Link
            href="/suppliers"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6B7280] hover:text-[#171717]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Supplier Intelligence Directory</span>
          </Link>
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[#171717]">
              {profile.supplierName}
            </h1>
            <span className="rounded-lg bg-[#F3EEFF] px-2.5 py-0.5 font-mono text-xs font-medium text-[#6938EF]">
              {profile.supplierId}
            </span>
            <Badge
              className={
                profile.status === "Active"
                  ? "bg-[#D9FAF5] text-[#171717] border-teal-300/60 text-xs font-medium"
                  : "bg-red-100 text-red-800 border-red-200 text-xs font-medium"
              }
            >
              {profile.status}
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-[#6B7280]">
            City: <span className="font-medium text-[#171717]">{profile.city}</span> &bull; Categories:{" "}
            <span className="font-medium text-[#171717]">{profile.categoriesRaw}</span>
          </p>
        </div>
      </div>

      {/* 1. Supplier Profile & Performance Pastel Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-[#FFF2CC] p-5 border border-amber-200/60 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-medium text-[#4B5563]">
            <span>Purchase Frequency (548d)</span>
            <Clock className="h-4 w-4 text-[#171717]" />
          </div>
          <div className="text-3xl font-semibold text-[#171717]">
            {performance.poCountIn548d} POs
          </div>
          <p className="text-xs text-[#4B5563]">
            {performance.poCountIn365d} in 365d &bull; Last:{" "}
            {performance.mostRecentPoDate || "None"}
          </p>
        </div>

        <div className="rounded-2xl bg-[#DDF3FF] p-5 border border-sky-200/60 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-medium text-[#4B5563]">
            <span>Delivery Performance</span>
            <Building2 className="h-4 w-4 text-[#171717]" />
          </div>
          <div className="text-3xl font-semibold text-[#171717]">
            {performance.deliveryPerformance.displayLabel}
          </div>
          <p className="text-xs text-[#4B5563]">
            Ledger: {performance.deliveryPerformance.historicalOnTimePoCount} on-time /{" "}
            {performance.deliveryPerformance.historicalLatePoCount} late
          </p>
        </div>

        <div className="rounded-2xl bg-[#FCE3EF] p-5 border border-pink-200/60 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-medium text-[#4B5563]">
            <span>Quality Performance</span>
            <Award className="h-4 w-4 text-[#171717]" />
          </div>
          <div className="text-3xl font-semibold text-[#171717]">
            {performance.qualityPerformance.displayLabel}
          </div>
          <p className="text-xs text-[#4B5563]">
            Normalized Score: {performance.qualityPerformance.normalizedScore}
          </p>
        </div>

        <div className="rounded-2xl bg-[#D9FAF5] p-5 border border-teal-200/60 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-medium text-[#4B5563]">
            <span>Contract Coverage</span>
            <FileSignature className="h-4 w-4 text-[#171717]" />
          </div>
          <div className="text-3xl font-semibold text-[#171717]">
            {performance.contractSummary.currentValidContracts} Valid
          </div>
          <p className="text-xs text-[#4B5563]">
            {performance.contractSummary.totalContracts} total historical contract(s)
          </p>
        </div>
      </div>

      {/* 2. Supplier Intelligence & Eligibility Explanation */}
      <div className="rounded-2xl border border-[#EAEAEA] bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-[#171717]">
              Supplier Intelligence &amp; Item-Level Preferred Rankings
            </h2>
            <p className="text-xs text-[#6B7280]">
              {eligibility.summaryExplanation}
            </p>
          </div>
          {eligibility.isPreferredEligible ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#D9FAF5] px-3 py-1 text-xs font-medium text-[#171717]">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
              Preferred List Eligible (Clause 6.1)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 border border-red-200 px-3 py-1 text-xs font-medium text-red-700">
              <Ban className="h-3.5 w-3.5" />
              {eligibility.eligibilityStatus}
            </span>
          )}
        </div>

        <div className="rounded-xl border border-[#EAEAEA] overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item Code &amp; Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Preferred Rank</TableHead>
                <TableHead className="text-right">Weighted Score</TableHead>
                <TableHead className="text-right">Reference Price (6.3)</TableHead>
                <TableHead>Score &amp; Price Explanation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itemRankings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-xs text-[#6B7280]">
                    No item-specific rankings available for this supplier.
                  </TableCell>
                </TableRow>
              ) : (
                itemRankings.map((ir) => (
                  <TableRow key={ir.itemCode}>
                    <TableCell>
                      <div className="font-mono font-medium text-xs text-[#171717]">
                        {ir.itemCode}
                      </div>
                      <div className="text-xs text-[#6B7280]">{ir.itemDescription}</div>
                    </TableCell>
                    <TableCell className="text-xs text-[#4B5563]">{ir.category}</TableCell>
                    <TableCell className="font-mono font-semibold text-xs">
                      {ir.rank ? `#${ir.rank} of ${ir.totalCompetitors}` : "Excluded"}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold text-xs">
                      {ir.score !== null ? ir.score.toFixed(4) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {ir.referencePrice !== null
                        ? `₹${ir.referencePrice.toLocaleString("en-IN")} (${ir.referencePriceSource})`
                        : "Not Available"}
                    </TableCell>
                    <TableCell className="text-xs text-[#4B5563] max-w-md">
                      <div>{ir.rankingExplanation}</div>
                      <div className="text-[11px] text-[#6B7280] mt-0.5">
                        {ir.referencePriceExplanation}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* 3. Related Contracts & Historical Purchase Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Contracts (5 Cols) */}
        <div className="lg:col-span-5 rounded-2xl border border-[#EAEAEA] bg-white p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-[#171717]">
              Rate Contracts ({contracts.length})
            </h2>
            <p className="text-xs text-[#6B7280]">
              Current valid vs historical/expired contracts
            </p>
          </div>

          {contracts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#EAEAEA] p-6 text-center text-xs text-[#6B7280]">
              No rate contracts held by {profile.supplierName}.
            </div>
          ) : (
            <div className="space-y-3">
              {contracts.map((c) => (
                <div
                  key={c.contractId}
                  className="rounded-xl border border-[#EAEAEA] bg-[#FAFAFC] p-3.5 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold text-[#171717]">
                      {c.contractId}
                    </span>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {c.contractValidityStatus}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-[#6B7280] font-mono">
                    {c.startDate} &rarr; {c.endDate} &bull; Remaining: ₹
                    {c.remainingCeiling.toLocaleString("en-IN")} / ₹
                    {c.valueCap.toLocaleString("en-IN")}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {c.lines.map((l) => (
                      <span
                        key={l.itemCode}
                        className="rounded bg-white border border-[#EAEAEA] px-2 py-0.5 font-mono text-[11px]"
                      >
                        {l.itemCode}: ₹{l.rate.toLocaleString("en-IN")}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Purchase History (7 Cols) */}
        <div className="lg:col-span-7 rounded-2xl border border-[#EAEAEA] bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-[#171717]">
                Historical Purchase Orders ({purchaseHistory.length})
              </h2>
              <p className="text-xs text-[#6B7280]">
                Total Historical Spend: ₹
                {performance.totalHistoricalSpendInr.toLocaleString("en-IN")}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-[#EAEAEA] overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Plant</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchaseHistory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-xs text-[#6B7280]">
                      No purchase orders found for this supplier.
                    </TableCell>
                  </TableRow>
                ) : (
                  purchaseHistory.map((po) => (
                    <TableRow key={`${po.poNumber}-${po.itemCode}`}>
                      <TableCell className="font-mono font-medium text-xs">
                        {po.poNumber}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{po.poDate}</TableCell>
                      <TableCell className="text-xs">
                        <span className="font-mono font-medium">{po.itemCode}</span> —{" "}
                        {po.itemDescription}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{po.plant}</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {po.quantity} {po.uom}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        ₹{po.unitPrice.toLocaleString("en-IN")}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}
