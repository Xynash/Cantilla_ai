"use client";

import * as React from "react";
import Link from "next/link";
import {
  Search,
  RefreshCw,
  Building2,
  Eye,
  Star,
  Clock,
  ShieldCheck,
  ShieldAlert,
  FileSignature,
  Package,
  Award,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Ban,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { UserRole } from "@/types/auth";

interface SupplierIntelligenceWorkspaceProps {
  userRole: UserRole;
}

export function SupplierIntelligenceWorkspace({
  userRole,
}: SupplierIntelligenceWorkspaceProps) {
  const { toast } = useToast();
  const isAdmin = userRole === "PROCUREMENT_ADMIN";

  const [activeTab, setActiveTab] = React.useState<
    "overview" | "recommendations" | "directory"
  >("overview");

  const [loading, setLoading] = React.useState(true);
  const [overviewData, setOverviewData] = React.useState<any | null>(null);

  // Directory filters
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("ALL");
  const [eligibilityFilter, setEligibilityFilter] = React.useState("ALL");
  const [categoryFilter, setCategoryFilter] = React.useState("ALL");

  // Recommendation Explorer state
  const [selectedItemCode, setSelectedItemCode] = React.useState("ITM-1048");
  const [selectedPlant, setSelectedPlant] = React.useState("CHK1");
  const [selectedRouteType, setSelectedRouteType] = React.useState<
    "DIRECT_PO" | "RFQ" | "RFP" | "CAPEX"
  >("RFQ");
  const [recData, setRecData] = React.useState<any | null>(null);
  const [loadingRec, setLoadingRec] = React.useState(false);

  // Supplier Detail Modal state
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [supplierDetail, setSupplierDetail] = React.useState<any | null>(null);
  const [detailTab, setDetailTab] = React.useState<
    "profile" | "history" | "performance" | "contracts" | "intelligence"
  >("intelligence");

  // Admin Block / Status Update state
  const [adminStatusTarget, setAdminStatusTarget] = React.useState<
    "Active" | "Inactive" | "Blocked"
  >("Blocked");
  const [adminReason, setAdminReason] = React.useState("");
  const [updatingStatus, setUpdatingStatus] = React.useState(false);

  const loadOverview = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/suppliers/intelligence");
      const json = await res.json();
      if (json.success && json.data) {
        setOverviewData(json.data);
      } else {
        toast({
          title: "Error Loading Supplier Intelligence",
          description: json.error?.message || "Ensure you are signed in as Buyer or Admin",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Network Error",
        description: "Could not load supplier intelligence data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadRecommendations = React.useCallback(
    async (itemCode: string, plant: string, routeType: string) => {
      if (!itemCode) return;
      setLoadingRec(true);
      try {
        const params = new URLSearchParams({
          itemCode,
          plantCode: plant,
          routeType,
        });
        const res = await fetch(`/api/suppliers/recommendations?${params.toString()}`);
        const json = await res.json();
        if (json.success && json.data) {
          setRecData(json.data);
        }
      } catch (err) {
        console.error("Failed to fetch recommendations:", err);
      } finally {
        setLoadingRec(false);
      }
    },
    []
  );

  React.useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  React.useEffect(() => {
    loadRecommendations(selectedItemCode, selectedPlant, selectedRouteType);
  }, [selectedItemCode, selectedPlant, selectedRouteType, loadRecommendations]);

  const openSupplierDetailModal = async (supplierId: string) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailTab("intelligence");
    try {
      const res = await fetch(`/api/suppliers/${encodeURIComponent(supplierId)}`);
      const json = await res.json();
      if (json.success && json.data) {
        setSupplierDetail(json.data);
        setAdminStatusTarget(
          json.data.profile.status === "Active" ? "Blocked" : "Active"
        );
        setAdminReason("");
      }
    } catch {
      toast({
        title: "Failed to Load Supplier Details",
        description: "Could not retrieve supplier profile.",
        variant: "destructive",
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const handleAdminStatusUpdate = async () => {
    if (!supplierDetail) return;
    if (!adminReason.trim() || adminReason.trim().length < 3) {
      toast({
        title: "Audit Reason Required",
        description: "Please enter a clear reason (min 3 characters) for the audit log.",
        variant: "destructive",
      });
      return;
    }

    setUpdatingStatus(true);
    try {
      const res = await fetch(
        `/api/suppliers/${encodeURIComponent(supplierDetail.profile.supplierId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: adminStatusTarget,
            reason: adminReason.trim(),
          }),
        }
      );
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error?.message || "Failed to update supplier status");
      }
      setSupplierDetail(json.data);
      setAdminReason("");
      toast({
        title: `Supplier ${json.data.profile.supplierId} Updated`,
        description: `Status set to '${json.data.profile.status}' and recorded in AuditLog.`,
      });
      await loadOverview();
      await loadRecommendations(selectedItemCode, selectedPlant, selectedRouteType);
    } catch (err: unknown) {
      toast({
        title: "Status Update Failed",
        description: err instanceof Error ? err.message : "Operation failed",
        variant: "destructive",
      });
    } finally {
      setUpdatingStatus(false);
    }
  };

  const filteredSuppliers = React.useMemo(() => {
    if (!overviewData?.suppliers) return [];
    let list = [...overviewData.suppliers];

    if (statusFilter !== "ALL") {
      list = list.filter((s) => s.status === statusFilter);
    }

    if (eligibilityFilter === "PREFERRED") {
      list = list.filter((s) => s.isPreferredEligible);
    } else if (eligibilityFilter === "EVALUATION_NEEDED") {
      list = list.filter((s) => s.requiresAdditionalEvaluation);
    } else if (eligibilityFilter === "EXCLUDED") {
      list = list.filter((s) => s.status !== "Active");
    }

    if (categoryFilter !== "ALL") {
      list = list.filter((s) => s.categories.includes(categoryFilter));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.supplierId.toLowerCase().includes(q) ||
          s.supplierName.toLowerCase().includes(q) ||
          s.city.toLowerCase().includes(q) ||
          s.categoriesRaw.toLowerCase().includes(q)
      );
    }

    return list;
  }, [
    overviewData,
    statusFilter,
    eligibilityFilter,
    categoryFilter,
    searchQuery,
  ]);

  const summary = overviewData?.summary || {
    totalSuppliers: 0,
    activeSuppliers: 0,
    eligiblePreferredSuppliers: 0,
    blockedSuppliers: 0,
    inactiveSuppliers: 0,
    suppliersWithRecentPoHistory: 0,
    suppliersWithPerformanceData: 0,
    suppliersRequiringEvaluation: 0,
  };

  const renderStatusBadge = (status: string) => {
    if (status === "Active") {
      return (
        <Badge className="bg-[#D9FAF5] text-[#171717] border-teal-300/60 font-medium text-[11px]">
          Active
        </Badge>
      );
    }
    if (status === "Blocked") {
      return (
        <Badge className="bg-red-100 text-red-800 border-red-200 font-medium text-[11px]">
          Blocked
        </Badge>
      );
    }
    return (
      <Badge className="bg-[#FCE3EF] text-[#171717] border-pink-200 font-medium text-[11px]">
        Inactive
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#EAEAEA] pb-5">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[#171717]">
              Preferred Supplier Engine &amp; Supplier Intelligence
            </h1>
            <span className="inline-flex items-center rounded-full bg-[#F3EEFF] border border-[#6938EF]/20 px-2.5 py-0.5 text-[11px] font-medium text-[#6938EF]">
              Policy v{overviewData?.policyVersion || "5.0"} (548d Window)
            </span>
          </div>
          <p className="text-xs sm:text-sm font-normal text-[#6B7280] mt-1">
            Centralized supplier eligibility, 5-factor preferred ranking, reference pricing, and historical performance telemetry.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            onClick={loadOverview}
            className="rounded-xl border-[#E5E7EB] bg-white h-9 text-xs font-medium gap-1.5 px-3.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh Intelligence</span>
          </Button>
        </div>
      </div>

      {/* 4 Primary Pastel Summary Cards + Secondary Intelligence Strip */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Soft Yellow */}
          <div className="rounded-2xl bg-[#FFF2CC] p-5 border border-amber-200/60 flex flex-col justify-between min-h-[136px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#4B5563]">
                Active Suppliers
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-[#171717]">
                <Building2 className="h-4 w-4 stroke-[1.75]" />
              </div>
            </div>
            <div className="pt-2">
              <div className="text-3xl font-semibold text-[#171717] tracking-tight">
                {summary.activeSuppliers}
                <span className="text-base font-normal text-[#6B7280]">
                  {" "}
                  / {summary.totalSuppliers}
                </span>
              </div>
              <p className="text-xs font-normal text-[#4B5563] mt-1">
                {summary.inactiveSuppliers} inactive &bull; {summary.blockedSuppliers} blocked
              </p>
            </div>
          </div>

          {/* Card 2: Soft Blue */}
          <div className="rounded-2xl bg-[#DDF3FF] p-5 border border-sky-200/60 flex flex-col justify-between min-h-[136px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#4B5563]">
                Eligible Preferred Suppliers
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-[#171717]">
                <Award className="h-4 w-4 stroke-[1.75]" />
              </div>
            </div>
            <div className="pt-2">
              <div className="text-3xl font-semibold text-[#171717] tracking-tight">
                {summary.eligiblePreferredSuppliers}
              </div>
              <p className="text-xs font-normal text-[#4B5563] mt-1">
                {summary.suppliersWithRecentPoHistory} with POs in 548-day window
              </p>
            </div>
          </div>

          {/* Card 3: Soft Teal */}
          <div className="rounded-2xl bg-[#D9FAF5] p-5 border border-teal-200/60 flex flex-col justify-between min-h-[136px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#4B5563]">
                Complete Performance Data
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-[#171717]">
                <CheckCircle2 className="h-4 w-4 stroke-[1.75]" />
              </div>
            </div>
            <div className="pt-2">
              <div className="text-3xl font-semibold text-[#171717] tracking-tight">
                {summary.suppliersWithPerformanceData}
              </div>
              <p className="text-xs font-normal text-[#4B5563] mt-1">
                Verified On-Time % and Quality Rating
              </p>
            </div>
          </div>

          {/* Card 4: Soft Pink */}
          <div className="rounded-2xl bg-[#FCE3EF] p-5 border border-pink-200/60 flex flex-col justify-between min-h-[136px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#4B5563]">
                Requiring Evaluation / Excluded
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-[#171717]">
                <AlertTriangle className="h-4 w-4 stroke-[1.75]" />
              </div>
            </div>
            <div className="pt-2">
              <div className="text-3xl font-semibold text-[#171717] tracking-tight">
                {summary.suppliersRequiringEvaluation}
              </div>
              <p className="text-xs font-normal text-[#4B5563] mt-1">
                Missing OTD/Quality metrics or 0 history
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#EAEAEA] pb-2.5">
        {[
          {
            id: "overview",
            label: "Supplier Intelligence & Directory",
            icon: Building2,
          },
          {
            id: "recommendations",
            label: "Item Recommendation & Reference Price Engine",
            icon: Award,
          },
          {
            id: "directory",
            label: "Performance, Categories & Activity",
            icon: Sliders,
          },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-medium transition-all ${
                active
                  ? "bg-[#6938EF] text-white shadow-2xs"
                  : "bg-white border border-[#EAEAEA] text-[#4B5563] hover:bg-[#F5F5F7] hover:text-[#171717]"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: SUPPLIER INTELLIGENCE & SEARCHABLE DIRECTORY TABLE */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 rounded-2xl border border-[#EAEAEA] bg-white p-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#6B7280]" />
              <Input
                placeholder="Search by supplier ID, name, city, or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 rounded-xl border-[#E5E7EB] text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-medium text-[#171717]"
              >
                <option value="ALL">All Statuses</option>
                <option value="Active">Active ({summary.activeSuppliers})</option>
                <option value="Inactive">Inactive ({summary.inactiveSuppliers})</option>
                <option value="Blocked">Blocked ({summary.blockedSuppliers})</option>
              </select>

              <select
                aria-label="Filter by eligibility"
                value={eligibilityFilter}
                onChange={(e) => setEligibilityFilter(e.target.value)}
                className="h-9 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-medium text-[#171717]"
              >
                <option value="ALL">All Eligibility Tiers</option>
                <option value="PREFERRED">
                  Eligible Preferred ({summary.eligiblePreferredSuppliers})
                </option>
                <option value="EVALUATION_NEEDED">
                  Requires Evaluation ({summary.suppliersRequiringEvaluation})
                </option>
                <option value="EXCLUDED">
                  Excluded (Blocked / Inactive)
                </option>
              </select>

              <select
                aria-label="Filter by category"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="h-9 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-medium text-[#171717]"
              >
                <option value="ALL">All Categories</option>
                {(overviewData?.categoryBreakdown || []).map((c: any) => (
                  <option key={c.category} value={c.category}>
                    {c.category} ({c.totalSuppliers})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Supplier Directory Table */}
          <div className="rounded-2xl border border-[#EAEAEA] bg-white overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[90px]">ID</TableHead>
                  <TableHead>Supplier Name &amp; City</TableHead>
                  <TableHead>Categories</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Preferred Eligibility (6.1)</TableHead>
                  <TableHead className="text-right">548d POs</TableHead>
                  <TableHead>Contracts</TableHead>
                  <TableHead className="text-right">On-Time %</TableHead>
                  <TableHead className="text-right">Quality</TableHead>
                  <TableHead className="text-right">Intelligence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-10 text-xs text-[#6B7280]">
                      Loading supplier intelligence records...
                    </TableCell>
                  </TableRow>
                ) : filteredSuppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-10 text-xs text-[#6B7280]">
                      No suppliers match the selected filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSuppliers.map((sup: any) => (
                    <TableRow key={sup.supplierId}>
                      <TableCell className="font-mono font-medium text-xs text-[#6938EF]">
                        <Link
                          href={`/suppliers/${sup.supplierId}`}
                          className="hover:underline"
                        >
                          {sup.supplierId}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-xs sm:text-sm text-[#171717]">
                          {sup.supplierName}
                        </div>
                        <div className="text-[11px] text-[#6B7280]">{sup.city}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {sup.categories.map((cat: string, idx: number) => (
                            <span
                              key={idx}
                              className="rounded-md bg-[#FAFAFC] border border-[#EAEAEA] px-1.5 py-0.5 text-[10px] font-normal text-[#4B5563]"
                            >
                              {cat}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>{renderStatusBadge(sup.status)}</TableCell>
                      <TableCell>
                        {sup.isPreferredEligible ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#DDF3FF] px-2 py-0.5 text-[11px] font-medium text-[#171717]">
                            <CheckCircle2 className="h-3 w-3 text-[#6938EF]" />
                            Preferred Eligible
                          </span>
                        ) : sup.status !== "Active" ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-red-50 border border-red-200 px-2 py-0.5 text-[11px] font-medium text-red-700">
                            <Ban className="h-3 w-3" />
                            Excluded (5.7)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#FFF2CC] px-2 py-0.5 text-[11px] font-medium text-[#171717]">
                            Category Top-Up Only
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {sup.poCountIn548d}
                        <span className="text-[10px] text-[#6B7280] block">
                          ({sup.poCountIn365d} in 365d)
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {sup.hasCurrentValidContract ? (
                          <span className="font-mono text-[11px] font-medium text-emerald-700">
                            Valid ({sup.contractIds.join(", ")})
                          </span>
                        ) : sup.hasHistoricalContract ? (
                          <span className="font-mono text-[11px] text-[#6B7280]">
                            Historical ({sup.contractIds.join(", ")})
                          </span>
                        ) : (
                          <span className="text-[11px] text-[#6B7280]">None</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {sup.onTimePercent !== null ? (
                          <span>{sup.onTimePercent}%</span>
                        ) : (
                          <span className="text-[11px] text-amber-700 font-sans">
                            Not Available
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {sup.qualityRating !== null ? (
                          <span className="inline-flex items-center justify-end gap-1">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            {sup.qualityRating.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-[11px] text-amber-700 font-sans">
                            Not Available
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openSupplierDetailModal(sup.supplierId)}
                            className="h-8 rounded-lg text-xs font-medium px-2.5 gap-1"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Inspect</span>
                          </Button>
                          <Link href={`/suppliers/${sup.supplierId}`}>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="h-8 w-8 rounded-lg text-[#6B7280] hover:text-[#171717]"
                              title="Open full supplier detail page"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* TAB 2: ITEM RECOMMENDATION & REFERENCE PRICE ENGINE */}
      {activeTab === "recommendations" && (
        <div className="space-y-5">
          {/* Selector Controls */}
          <div className="rounded-2xl border border-[#EAEAEA] bg-white p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-[#171717]">
                  Supplier Recommendation &amp; Reference Price Evaluator
                </h2>
                <p className="text-xs font-normal text-[#6B7280]">
                  Select any catalogue item, plant, and procurement route to inspect preferred supplier rankings, 5-factor score breakdowns, and Clause 6.3 reference prices.
                </p>
              </div>

              {/* Worked Example Presets */}
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { code: "ITM-1048", label: "ITM-1048 (Worked Ex. 1)" },
                  { code: "ITM-1036", label: "ITM-1036 (Worked Ex. 2)" },
                  { code: "ITM-1016", label: "ITM-1016 (Worked Ex. 3)" },
                  { code: "ITM-1006", label: "ITM-1006 (Category Top-Up)" },
                  { code: "ITM-1034", label: "ITM-1034 (Shortfall 4/5)" },
                ].map((preset) => (
                  <button
                    key={preset.code}
                    type="button"
                    onClick={() => {
                      setSelectedItemCode(preset.code);
                      if (preset.code === "ITM-1034") setSelectedRouteType("RFP");
                      else setSelectedRouteType("RFQ");
                    }}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-mono font-medium transition-colors ${
                      selectedItemCode === preset.code
                        ? "bg-[#6938EF] text-white"
                        : "bg-[#FAFAFC] border border-[#EAEAEA] text-[#4B5563] hover:text-[#171717]"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-[#EAEAEA]">
              <div>
                <label className="text-xs font-medium text-[#4B5563] block mb-1">
                  Target Item (Item Master)
                </label>
                <select
                  aria-label="Select item for supplier recommendations"
                  value={selectedItemCode}
                  onChange={(e) => setSelectedItemCode(e.target.value)}
                  className="w-full h-9 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-medium text-[#171717]"
                >
                  {(overviewData?.itemsCatalog || []).map((itm: any) => (
                    <option key={itm.itemCode} value={itm.itemCode}>
                      {itm.itemCode} — {itm.description} ({itm.category})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-[#4B5563] block mb-1">
                  Plant Scope
                </label>
                <select
                  aria-label="Select plant"
                  value={selectedPlant}
                  onChange={(e) => setSelectedPlant(e.target.value)}
                  className="w-full h-9 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-medium text-[#171717]"
                >
                  <option value="PUN1">PUN1 — Pune Main Plant (Bhosari)</option>
                  <option value="CHK1">CHK1 — Chakan Plant</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-[#4B5563] block mb-1">
                  Procurement Route Mode
                </label>
                <select
                  aria-label="Select route mode"
                  value={selectedRouteType}
                  onChange={(e) => setSelectedRouteType(e.target.value as any)}
                  className="w-full h-9 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-medium text-[#171717]"
                >
                  <option value="DIRECT_PO">Direct PO (Top 1 Preferred Supplier)</option>
                  <option value="RFQ">RFQ Sourcing (Up to 3 Suppliers)</option>
                  <option value="RFP">RFP Sourcing (Up to 5 Suppliers)</option>
                  <option value="CAPEX">Capex Sourcing (Up to 5 Suppliers)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Recommendation Results */}
          {loadingRec ? (
            <div className="rounded-2xl border border-[#EAEAEA] bg-white p-10 text-center text-xs text-[#6B7280]">
              Computing supplier rankings and reference prices...
            </div>
          ) : (
            recData && (
              <div className="space-y-5">
                {recData.shortfallExplanation && (
                  <div className="rounded-2xl border border-amber-300/70 bg-[#FFF2CC] p-4 text-xs text-[#171717] flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">Supplier Shortfall Note (Clause 6.4): </span>
                      <span>{recData.shortfallExplanation}</span>
                    </div>
                  </div>
                )}

                <div className="rounded-2xl border border-[#EAEAEA] bg-white overflow-hidden">
                  <div className="p-4 border-b border-[#EAEAEA] bg-[#FAFAFC] flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs sm:text-sm font-semibold text-[#171717]">
                      Recommended Suppliers for {recData.itemCode} ({recData.itemDescription}) &bull; Category:{" "}
                      <span className="text-[#6938EF]">{recData.category}</span>
                    </div>
                    <span className="text-xs text-[#6B7280] font-mono">
                      Showing {recData.recommendedSuppliers.length} of {recData.requestedSupplierCount} requested
                    </span>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[70px]">Rank</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Basis</TableHead>
                        <TableHead className="text-right">Total Score</TableHead>
                        <TableHead>Score Breakdown (F / R / C / OTD / Q)</TableHead>
                        <TableHead className="text-right">Reference Price (6.3)</TableHead>
                        <TableHead>Explanation</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recData.recommendedSuppliers.map((item: any) => (
                        <TableRow key={item.supplierId}>
                          <TableCell className="font-mono font-semibold text-xs">
                            #{item.rank}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-xs sm:text-sm text-[#171717]">
                              {item.supplierName}
                            </div>
                            <div className="font-mono text-[11px] text-[#6938EF]">
                              {item.supplierId} &bull; {item.city}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={
                                item.recommendationType === "PREFERRED_RANKED"
                                  ? "bg-[#DDF3FF] text-[#171717] border-0 text-[10px] font-medium"
                                  : "bg-[#FFF2CC] text-[#171717] border-0 text-[10px] font-medium"
                              }
                            >
                              {item.recommendationType === "PREFERRED_RANKED"
                                ? "Preferred List (6.1)"
                                : "Category Top-Up (6.4)"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold text-sm text-[#171717]">
                            {item.totalScore.toFixed(4)}
                          </TableCell>
                          <TableCell className="font-mono text-[11px] text-[#4B5563]">
                            F:{item.scoreBreakdown.frequencyScore} | R:
                            {item.scoreBreakdown.recencyScore} | C:
                            {item.scoreBreakdown.contractScore} | OTD:
                            {item.scoreBreakdown.onTimeScore} | Q:
                            {item.scoreBreakdown.qualityScore}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.referencePrice !== null ? (
                              <div>
                                <div className="font-mono font-semibold text-xs text-[#171717]">
                                  ₹{item.referencePrice.toLocaleString("en-IN")}
                                </div>
                                <div className="text-[10px] text-[#6B7280] font-mono">
                                  {item.referencePriceSource}
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-[#6B7280]">Not Available</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-[#4B5563] max-w-xs">
                            <div>{item.recommendationExplanation}</div>
                            <div className="text-[11px] text-[#6B7280] mt-0.5">
                              {item.referencePriceExplanation}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Excluded Suppliers Section */}
                {recData.excludedSuppliers && recData.excludedSuppliers.length > 0 && (
                  <div className="rounded-2xl border border-red-200 bg-red-50/40 p-4 space-y-2.5">
                    <div className="text-xs font-semibold text-red-800 flex items-center gap-1.5">
                      <ShieldAlert className="h-4 w-4" />
                      <span>
                        Excluded Suppliers for {recData.itemCode} (Policy Clause 5.7)
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {recData.excludedSuppliers.map((ex: any) => (
                        <div
                          key={ex.supplierId}
                          className="rounded-xl bg-white border border-red-200/80 p-3 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-[#171717]">
                              {ex.supplierName} ({ex.supplierId})
                            </span>
                            {renderStatusBadge(ex.status)}
                          </div>
                          <p className="text-[11px] text-[#4B5563]">{ex.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}

      {/* TAB 3: PERFORMANCE DISTRIBUTION, CATEGORY BREAKDOWN & RECENT ACTIVITY */}
      {activeTab === "directory" && overviewData && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left 6 Cols: Category Breakdown */}
          <div className="lg:col-span-6 rounded-2xl border border-[#EAEAEA] bg-white p-5 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-[#171717]">
                Supplier Category Breakdown
              </h2>
              <p className="text-xs text-[#6B7280]">
                Active vs total registered suppliers per procurement category
              </p>
            </div>
            <div className="space-y-2.5">
              {overviewData.categoryBreakdown.map((cat: any) => (
                <div
                  key={cat.category}
                  className="flex items-center justify-between rounded-xl border border-[#EAEAEA] bg-[#FAFAFC] p-3 text-xs"
                >
                  <span className="font-medium text-[#171717]">{cat.category}</span>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="rounded-md bg-[#D9FAF5] px-2 py-0.5 text-[11px] font-medium text-[#171717]">
                      {cat.activeSuppliers} Active
                    </span>
                    <span className="text-[#6B7280]">/ {cat.totalSuppliers} Total</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right 6 Cols: Recent Supplier PO Activity */}
          <div className="lg:col-span-6 rounded-2xl border border-[#EAEAEA] bg-white p-5 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-[#171717]">
                Recent Supplier Purchase Activity
              </h2>
              <p className="text-xs text-[#6B7280]">
                Most recent purchase orders recorded in historical ledger
              </p>
            </div>
            <div className="divide-y divide-[#EAEAEA] rounded-xl border border-[#EAEAEA]">
              {overviewData.recentActivity.map((act: any) => (
                <div
                  key={`${act.poNumber}-${act.itemCode}`}
                  className="p-3.5 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-[#171717]">
                        PO {act.poNumber}
                      </span>
                      <span className="text-[#6938EF] font-medium truncate">
                        {act.supplierName} ({act.supplierId})
                      </span>
                    </div>
                    <div className="text-[11px] text-[#6B7280] truncate">
                      {act.itemCode}: {act.itemDescription} &bull; {act.quantity} {act.uom} @ ₹
                      {act.unitPrice.toLocaleString("en-IN")}
                    </div>
                  </div>
                  <div className="text-right shrink-0 font-mono">
                    <div className="font-semibold text-[#171717]">
                      ₹{act.totalValueInr.toLocaleString("en-IN")}
                    </div>
                    <div className="text-[10px] text-[#6B7280]">
                      {act.poDate} &bull; {act.plant}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUPPLIER INTELLIGENCE DETAIL MODAL */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-lg font-semibold">
              <span>
                {supplierDetail?.profile?.supplierName || "Supplier Intelligence"} (
                {supplierDetail?.profile?.supplierId})
              </span>
              {supplierDetail?.profile &&
                renderStatusBadge(supplierDetail.profile.status)}
            </DialogTitle>
            <DialogDescription className="text-xs">
              City: {supplierDetail?.profile?.city} &bull; Categories:{" "}
              {supplierDetail?.profile?.categoriesRaw}
            </DialogDescription>
          </DialogHeader>

          {detailLoading || !supplierDetail ? (
            <div className="py-10 text-center text-xs text-[#6B7280]">
              Loading supplier intelligence profile...
            </div>
          ) : (
            <div className="space-y-4 py-2 text-xs">
              {/* Sub-navigation tabs inside modal */}
              <div className="flex flex-wrap items-center gap-1.5 border-b border-[#EAEAEA] pb-2">
                {[
                  { id: "intelligence", label: "Supplier Intelligence & Rankings" },
                  { id: "profile", label: "Profile & Eligibility" },
                  {
                    id: "history",
                    label: `Purchase History (${supplierDetail.purchaseHistory.length})`,
                  },
                  { id: "performance", label: "Performance Metrics" },
                  {
                    id: "contracts",
                    label: `Contracts (${supplierDetail.contracts.length})`,
                  },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setDetailTab(t.id as any)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      detailTab === t.id
                        ? "bg-[#6938EF] text-white"
                        : "bg-[#FAFAFC] text-[#4B5563] hover:text-[#171717]"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Modal Tab 1: Supplier Intelligence & Item Rankings */}
              {detailTab === "intelligence" && (
                <div className="space-y-4">
                  <div className="rounded-xl bg-[#DDF3FF]/60 border border-sky-200 p-3.5 space-y-1">
                    <div className="font-semibold text-[#171717]">
                      Eligibility Verdict ({supplierDetail.eligibility.eligibilityStatus})
                    </div>
                    <p className="text-[#4B5563]">
                      {supplierDetail.eligibility.summaryExplanation}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-semibold text-[#171717]">
                      Item-Level Preferred Rankings &amp; Reference Prices
                    </h4>
                    <div className="rounded-xl border border-[#EAEAEA] overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item</TableHead>
                            <TableHead>Rank</TableHead>
                            <TableHead className="text-right">Score</TableHead>
                            <TableHead className="text-right">Reference Price</TableHead>
                            <TableHead>Explanation</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {supplierDetail.itemRankings.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center py-6 text-[#6B7280]">
                                No historical item POs or contract lines recorded for this supplier.
                              </TableCell>
                            </TableRow>
                          ) : (
                            supplierDetail.itemRankings.map((ir: any) => (
                              <TableRow key={ir.itemCode}>
                                <TableCell>
                                  <div className="font-mono font-medium text-[#171717]">
                                    {ir.itemCode}
                                  </div>
                                  <div className="text-[11px] text-[#6B7280]">
                                    {ir.itemDescription}
                                  </div>
                                </TableCell>
                                <TableCell className="font-mono font-semibold">
                                  {ir.rank ? `#${ir.rank} of ${ir.totalCompetitors}` : "Excluded"}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {ir.score !== null ? ir.score.toFixed(4) : "—"}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {ir.referencePrice !== null
                                    ? `₹${ir.referencePrice.toLocaleString("en-IN")} (${ir.referencePriceSource})`
                                    : "Not Available"}
                                </TableCell>
                                <TableCell className="text-[11px] text-[#4B5563] max-w-xs">
                                  {ir.rankingExplanation}
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

              {/* Modal Tab 2: Profile, Eligibility & Admin Block/Unblock */}
              {detailTab === "profile" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-xl bg-[#FAFAFC] border border-[#EAEAEA] p-3">
                      <span className="text-[#6B7280] block">Supplier ID</span>
                      <span className="font-mono font-semibold text-sm text-[#171717]">
                        {supplierDetail.profile.supplierId}
                      </span>
                    </div>
                    <div className="rounded-xl bg-[#FAFAFC] border border-[#EAEAEA] p-3">
                      <span className="text-[#6B7280] block">Current Status</span>
                      <span className="font-semibold text-sm text-[#171717]">
                        {supplierDetail.profile.status}
                      </span>
                    </div>
                    <div className="rounded-xl bg-[#FAFAFC] border border-[#EAEAEA] p-3">
                      <span className="text-[#6B7280] block">548d PO Count</span>
                      <span className="font-mono font-semibold text-sm text-[#171717]">
                        {supplierDetail.eligibility.poCountInWindow}
                      </span>
                    </div>
                    <div className="rounded-xl bg-[#FAFAFC] border border-[#EAEAEA] p-3">
                      <span className="text-[#6B7280] block">Direct PO (365d)</span>
                      <span className="font-semibold text-sm text-[#171717]">
                        {supplierDetail.eligibility.isDirectPoEligible365d ? "Eligible" : "No"}
                      </span>
                    </div>
                  </div>

                  {/* Admin Block / Unblock Controls */}
                  {isAdmin && (
                    <div className="rounded-2xl border border-[#EAEAEA] bg-[#FAFAFC] p-4 space-y-3">
                      <div className="font-semibold text-[#171717] flex items-center gap-1.5">
                        <ShieldCheck className="h-4 w-4 text-[#6938EF]" />
                        <span>Supplier Administration (Block / Unblock / Status Update)</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="text-[11px] font-medium text-[#4B5563] block mb-1">
                            Target Status
                          </label>
                          <select
                            aria-label="Select new supplier status"
                            value={adminStatusTarget}
                            onChange={(e) => setAdminStatusTarget(e.target.value as any)}
                            className="w-full h-9 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-medium"
                          >
                            <option value="Active">Active (Eligible)</option>
                            <option value="Blocked">Blocked (Excluded per 5.7)</option>
                            <option value="Inactive">Inactive (Excluded per 6.1)</option>
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-[11px] font-medium text-[#4B5563] block mb-1">
                            Mandatory Audit Reason
                          </label>
                          <div className="flex items-center gap-2">
                            <Input
                              placeholder="Enter reason for blocking, unblocking, or status change..."
                              value={adminReason}
                              onChange={(e) => setAdminReason(e.target.value)}
                              className="h-9 rounded-xl text-xs"
                            />
                            <Button
                              size="sm"
                              disabled={updatingStatus}
                              onClick={handleAdminStatusUpdate}
                              className="rounded-xl bg-[#6938EF] text-white h-9 text-xs font-medium px-4 shrink-0"
                            >
                              {updatingStatus ? "Saving..." : "Update Status"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Modal Tab 3: Purchase History */}
              {detailTab === "history" && (
                <div className="rounded-xl border border-[#EAEAEA] overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>PO Number</TableHead>
                        <TableHead>PO Date</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead>Plant</TableHead>
                        <TableHead className="text-right">Qty &amp; UOM</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Total (INR)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {supplierDetail.purchaseHistory.map((po: any) => (
                        <TableRow key={`${po.poNumber}-${po.itemCode}`}>
                          <TableCell className="font-mono font-medium">
                            {po.poNumber}
                          </TableCell>
                          <TableCell className="font-mono">{po.poDate}</TableCell>
                          <TableCell>
                            <span className="font-mono font-medium">{po.itemCode}</span> —{" "}
                            {po.itemDescription}
                          </TableCell>
                          <TableCell className="font-mono">{po.plant}</TableCell>
                          <TableCell className="text-right font-mono">
                            {po.quantity} {po.uom}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            ₹{po.unitPrice.toLocaleString("en-IN")}
                          </TableCell>
                          <TableCell className="text-right font-mono font-medium">
                            ₹{po.totalAmountInr.toLocaleString("en-IN")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Modal Tab 4: Performance Metrics */}
              {detailTab === "performance" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="rounded-2xl bg-[#FFF2CC] p-4 space-y-1">
                      <span className="text-[11px] font-medium text-[#4B5563]">
                        On-Time Delivery (Master)
                      </span>
                      <div className="text-2xl font-semibold text-[#171717]">
                        {supplierDetail.performance.deliveryPerformance.displayLabel}
                      </div>
                      <p className="text-[11px] text-[#4B5563]">
                        PO Ledger: {supplierDetail.performance.deliveryPerformance.historicalOnTimePoCount} on-time /{" "}
                        {supplierDetail.performance.deliveryPerformance.historicalLatePoCount} late
                      </p>
                    </div>

                    <div className="rounded-2xl bg-[#FCE3EF] p-4 space-y-1">
                      <span className="text-[11px] font-medium text-[#4B5563]">
                        Quality Rating (Master)
                      </span>
                      <div className="text-2xl font-semibold text-[#171717]">
                        {supplierDetail.performance.qualityPerformance.displayLabel}
                      </div>
                      <p className="text-[11px] text-[#4B5563]">
                        Normalized Score:{" "}
                        {supplierDetail.performance.qualityPerformance.normalizedScore}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-[#D9FAF5] p-4 space-y-1">
                      <span className="text-[11px] font-medium text-[#4B5563]">
                        Historical Spend &amp; Recency
                      </span>
                      <div className="text-2xl font-semibold text-[#171717]">
                        ₹
                        {supplierDetail.performance.totalHistoricalSpendInr.toLocaleString(
                          "en-IN"
                        )}
                      </div>
                      <p className="text-[11px] text-[#4B5563]">
                        Last PO: {supplierDetail.performance.mostRecentPoDate || "None"} (Tier:{" "}
                        {supplierDetail.performance.recencyScore})
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Modal Tab 5: Contracts */}
              {detailTab === "contracts" && (
                <div className="space-y-3">
                  {supplierDetail.contracts.length === 0 ? (
                    <div className="rounded-xl border border-[#EAEAEA] p-6 text-center text-[#6B7280]">
                      No rate contracts held by this supplier.
                    </div>
                  ) : (
                    supplierDetail.contracts.map((c: any) => (
                      <div
                        key={c.contractId}
                        className="rounded-xl border border-[#EAEAEA] p-4 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-mono font-semibold text-sm text-[#171717]">
                            {c.contractId}{" "}
                            <span className="text-xs font-normal text-[#6B7280]">
                              ({c.startDate} to {c.endDate})
                            </span>
                          </div>
                          <Badge
                            variant={
                              c.contractValidityStatus === "CURRENT_VALID"
                                ? "default"
                                : "secondary"
                            }
                            className="text-[10px] font-mono"
                          >
                            {c.contractValidityStatus}
                          </Badge>
                        </div>
                        <div className="text-xs text-[#4B5563] font-mono">
                          Ceiling: ₹{c.valueCap.toLocaleString("en-IN")} &bull; Consumed: ₹
                          {c.consumedValue.toLocaleString("en-IN")} &bull; Remaining: ₹
                          {c.remainingCeiling.toLocaleString("en-IN")}
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          {c.lines.map((l: any) => (
                            <span
                              key={l.itemCode}
                              className="rounded-md bg-[#FAFAFC] border border-[#EAEAEA] px-2 py-1 font-mono text-[11px]"
                            >
                              {l.itemCode}: ₹{l.rate.toLocaleString("en-IN")} / {l.uom}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex items-center justify-between">
            {supplierDetail && (
              <Link href={`/suppliers/${supplierDetail.profile.supplierId}`}>
                <Button variant="outline" size="sm" className="rounded-xl text-xs gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Open Full Supplier Page</span>
                </Button>
              </Link>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDetailOpen(false)}
              className="rounded-xl text-xs"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
