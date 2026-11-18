"use client";

import * as React from "react";
import {
  ShieldCheck,
  History,
  Sliders,
  Upload,
  FileText,
  GitCompare,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Archive,
  Send,
  Play,
  Copy,
  RefreshCw,
  Lock,
  Eye,
  Save,
  Sparkles,
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
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { StructuredPolicyConfig } from "@/services/decision-engine/types/policy";
import { PolicyVersionRecordDto } from "@/services/decision-engine/policy-config/policyService";
import { PolicyComparisonResult } from "@/services/decision-engine/policy-config/policyComparator";
import { PolicyPdfExtractionResult } from "@/services/decision-engine/policy-config/pdfPolicyExtractor";
import { UserRole } from "@/types/auth";

interface PolicyManagementWorkspaceProps {
  userRole: UserRole;
  userEmail: string;
}

export function PolicyManagementWorkspace({
  userRole,
  userEmail,
}: PolicyManagementWorkspaceProps) {
  const { toast } = useToast();
  const isAdmin = userRole === "PROCUREMENT_ADMIN";

  const [activeTab, setActiveTab] = React.useState<
    "versions" | "editor" | "pdf-extract" | "compare"
  >("versions");

  const [loading, setLoading] = React.useState(true);
  const [versions, setVersions] = React.useState<PolicyVersionRecordDto[]>([]);
  const [activePolicy, setActivePolicy] = React.useState<PolicyVersionRecordDto | null>(null);
  const [auditLogs, setAuditLogs] = React.useState<any[]>([]);

  // Selected version in structured editor
  const [selectedVersionId, setSelectedVersionId] = React.useState<string>("5.0");
  const [editorMode, setEditorMode] = React.useState<"VIEW_OR_EDIT" | "CREATE_NEW">(
    "VIEW_OR_EDIT"
  );

  // Editable form state
  const [formVersion, setFormVersion] = React.useState("5.1");
  const [formPolicyName, setFormPolicyName] = React.useState(
    "Corvo Engineering Procurement Policy (PR to PO)"
  );
  const [formDocCode, setFormDocCode] = React.useState("CORVO-PROC-POL-04");
  const [formDescription, setFormDescription] = React.useState("");
  const [formEffectiveDate, setFormEffectiveDate] = React.useState("2026-10-01");
  const [formEffectiveUntil, setFormEffectiveUntil] = React.useState("");
  const [formChangeSummary, setFormChangeSummary] = React.useState("");
  const [formBaseVersion, setFormBaseVersion] = React.useState("5.0");
  const [formConfig, setFormConfig] = React.useState<StructuredPolicyConfig | null>(null);
  const [formSourceDoc, setFormSourceDoc] = React.useState<any | null>(null);
  const [savingPolicy, setSavingPolicy] = React.useState(false);

  // Approval dialog state (supports separation of duties sign-off)
  const [approveDialogOpen, setApproveDialogOpen] = React.useState(false);
  const [approvingVersion, setApprovingVersion] = React.useState<PolicyVersionRecordDto | null>(
    null
  );
  const [approvalComment, setApprovalComment] = React.useState("");
  const [secondaryEmail, setSecondaryEmail] = React.useState("director@cantill.ai");
  const [secondaryPassword, setSecondaryPassword] = React.useState("Director2026!");
  const [submittingWorkflow, setSubmittingWorkflow] = React.useState(false);

  // PDF Extraction state
  const [extractingPdf, setExtractingPdf] = React.useState(false);
  const [extractionPreview, setExtractionPreview] =
    React.useState<PolicyPdfExtractionResult | null>(null);
  const [extractedDraftVersion, setExtractedDraftVersion] = React.useState("5.1");
  const [extractedEffectiveDate, setExtractedEffectiveDate] = React.useState("2026-04-01");
  const [extractedSpotLimit, setExtractedSpotLimit] = React.useState(200000);
  const [extractedEmergencyLimit, setExtractedEmergencyLimit] = React.useState(500000);
  const [extractedRfqLimit, setExtractedRfqLimit] = React.useState(1000000);
  const [extractedClubbingDays, setExtractedClubbingDays] = React.useState(14);
  const [extractedNeedByDays, setExtractedNeedByDays] = React.useState(7);
  const [extractedPoWindowHours, setExtractedPoWindowHours] = React.useState(24);
  const [extractedChangeSummary, setExtractedChangeSummary] = React.useState(
    "Extracted from uploaded Corvo Procurement Policy PDF and verified by Procurement Admin."
  );

  // Comparison state
  const [compareBaseVer, setCompareBaseVer] = React.useState("4.0");
  const [compareTargetVer, setCompareTargetVer] = React.useState("5.0");
  const [comparisonResult, setComparisonResult] =
    React.useState<PolicyComparisonResult | null>(null);
  const [comparing, setComparing] = React.useState(false);
  const [showOnlyChanges, setShowOnlyChanges] = React.useState(true);

  const loadPolicies = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/policies");
      const json = await res.json();
      if (json.success && json.data) {
        const list: PolicyVersionRecordDto[] = json.data.versions || [];
        setVersions(list);
        setActivePolicy(json.data.activePolicy || list[0] || null);
        setAuditLogs(json.data.auditLogs || []);

        const currentSelected =
          list.find((v) => v.version === selectedVersionId) ||
          json.data.activePolicy ||
          list[0];
        if (currentSelected && editorMode === "VIEW_OR_EDIT") {
          populateEditorFromRecord(currentSelected);
        }
      }
    } catch (err) {
      console.error("Failed to load policies:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedVersionId, editorMode]);

  React.useEffect(() => {
    loadPolicies();
  }, [loadPolicies]);

  const populateEditorFromRecord = (rec: PolicyVersionRecordDto) => {
    setSelectedVersionId(rec.version);
    setFormVersion(rec.version);
    setFormPolicyName(rec.policyName);
    setFormDocCode(rec.documentCode);
    setFormDescription(rec.description);
    setFormEffectiveDate(rec.effectiveDate);
    setFormEffectiveUntil(rec.effectiveUntil || "");
    setFormChangeSummary(rec.changeSummary);
    setFormBaseVersion(rec.baseVersion || "5.0");
    setFormConfig(JSON.parse(JSON.stringify(rec.policyData)));
    setFormSourceDoc(rec.sourceDocument || null);
  };

  const handleStartNewDraftFrom = (sourceRec: PolicyVersionRecordDto) => {
    // Suggest next minor version number
    const parts = sourceRec.version.split(".");
    const major = parseInt(parts[0] || "5", 10);
    const minor = parseInt(parts[1] || "0", 10) + 1;
    let candidate = `${major}.${minor}`;
    while (versions.some((v) => v.version === candidate)) {
      candidate = `${major}.${parseInt(candidate.split(".")[1], 10) + 1}`;
    }

    setEditorMode("CREATE_NEW");
    setFormVersion(candidate);
    setFormPolicyName(sourceRec.policyName);
    setFormDocCode(sourceRec.documentCode);
    setFormDescription(sourceRec.description);
    setFormEffectiveDate(new Date().toISOString().slice(0, 10));
    setFormEffectiveUntil("");
    setFormBaseVersion(sourceRec.version);
    setFormChangeSummary(`Cloned from Policy v${sourceRec.version} for threshold/rule revision.`);
    const clonedConfig: StructuredPolicyConfig = JSON.parse(
      JSON.stringify(sourceRec.policyData)
    );
    clonedConfig.version = candidate;
    setFormConfig(clonedConfig);
    setFormSourceDoc(sourceRec.sourceDocument || null);
    setActiveTab("editor");
  };

  const runComparison = React.useCallback(
    async (baseV: string, targetV: string) => {
      if (!baseV || !targetV) return;
      setComparing(true);
      try {
        const res = await fetch(
          `/api/policies/compare?baseVersion=${encodeURIComponent(
            baseV
          )}&targetVersion=${encodeURIComponent(targetV)}`
        );
        const json = await res.json();
        if (json.success) {
          setComparisonResult(json.data);
        } else {
          toast({
            title: "Comparison Failed",
            description: json.error?.message || "Could not compare selected versions.",
            variant: "destructive",
          });
        }
      } catch {
        toast({
          title: "Comparison Error",
          description: "Failed to fetch policy diff.",
          variant: "destructive",
        });
      } finally {
        setComparing(false);
      }
    },
    [toast]
  );

  React.useEffect(() => {
    if (activeTab === "compare" && compareBaseVer && compareTargetVer) {
      runComparison(compareBaseVer, compareTargetVer);
    }
  }, [activeTab, compareBaseVer, compareTargetVer, runComparison]);

  const handleSavePolicy = async () => {
    if (!formConfig) return;
    setSavingPolicy(true);
    try {
      if (editorMode === "CREATE_NEW") {
        const res = await fetch("/api/policies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            version: formVersion.trim(),
            policyName: formPolicyName,
            documentCode: formDocCode,
            description: formDescription,
            effectiveDate: formEffectiveDate,
            effectiveUntil: formEffectiveUntil || null,
            baseVersion: formBaseVersion,
            changeSummary: formChangeSummary,
            policyData: {
              ...formConfig,
              version: formVersion.trim(),
              documentName: formDocCode,
              effectiveDate: formEffectiveDate,
            },
            sourceDocument: formSourceDoc,
          }),
        });
        const json = await res.json();
        if (!json.success) {
          throw new Error(json.error?.message || "Failed to create draft policy version.");
        }
        toast({
          title: `Draft Policy v${json.data.version} Created`,
          description: "Saved as DRAFT. Submit for approval when ready.",
        });
        setEditorMode("VIEW_OR_EDIT");
        setSelectedVersionId(json.data.version);
        await loadPolicies();
      } else {
        const res = await fetch(`/api/policies/${encodeURIComponent(selectedVersionId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "UPDATE_DRAFT",
            policyName: formPolicyName,
            documentCode: formDocCode,
            description: formDescription,
            effectiveDate: formEffectiveDate,
            effectiveUntil: formEffectiveUntil || null,
            changeSummary: formChangeSummary,
            policyData: {
              ...formConfig,
              version: selectedVersionId,
              documentName: formDocCode,
              effectiveDate: formEffectiveDate,
            },
          }),
        });
        const json = await res.json();
        if (!json.success) {
          throw new Error(json.error?.message || "Failed to update draft policy.");
        }
        toast({
          title: `Draft Policy v${selectedVersionId} Updated`,
          description: "Configuration validated and saved.",
        });
        await loadPolicies();
      }
    } catch (err: unknown) {
      toast({
        title: "Validation Error",
        description: err instanceof Error ? err.message : "Failed to save policy",
        variant: "destructive",
      });
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleWorkflowAction = async (
    version: string,
    action: "SUBMIT" | "ACTIVATE" | "ARCHIVE",
    extra?: Record<string, unknown>
  ) => {
    setSubmittingWorkflow(true);
    try {
      const res = await fetch(`/api/policies/${encodeURIComponent(version)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...extra,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error?.message || `Action ${action} failed`);
      }
      toast({
        title: "Policy Workflow Updated",
        description: json.message || `Policy v${version} transitioned (${action}).`,
      });
      await loadPolicies();
    } catch (err: unknown) {
      toast({
        title: "Workflow Action Blocked",
        description: err instanceof Error ? err.message : "Operation failed",
        variant: "destructive",
      });
    } finally {
      setSubmittingWorkflow(false);
    }
  };

  const handleConfirmApproval = async () => {
    if (!approvingVersion) return;
    setSubmittingWorkflow(true);
    try {
      const isSelfSubmitted =
        (approvingVersion.submittedBy || approvingVersion.createdBy || "").toLowerCase() ===
        userEmail.toLowerCase();

      const res = await fetch(
        `/api/policies/${encodeURIComponent(approvingVersion.version)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "APPROVE",
            comment: approvalComment,
            ...(isSelfSubmitted
              ? {
                  secondaryApproverEmail: secondaryEmail,
                  secondaryApproverPassword: secondaryPassword,
                }
              : {}),
          }),
        }
      );
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error?.message || "Failed to approve policy version.");
      }
      toast({
        title: `Policy v${approvingVersion.version} Approved`,
        description: `Approved by ${json.data?.approvedBy}. Ready for activation or scheduling.`,
      });
      setApproveDialogOpen(false);
      setApprovingVersion(null);
      await loadPolicies();
    } catch (err: unknown) {
      toast({
        title: "Approval Rejected",
        description: err instanceof Error ? err.message : "Approval failed",
        variant: "destructive",
      });
    } finally {
      setSubmittingWorkflow(false);
    }
  };

  const handleExtractSuppliedPdf = async () => {
    setExtractingPdf(true);
    try {
      const res = await fetch("/api/policies/extract-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useSuppliedPolicyPdf: true }),
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error?.message || "PDF extraction failed");
      }
      applyExtractionPreview(json.data);
      toast({
        title: "PDF Policy Extracted",
        description: `Extracted ${json.data.extractedClauses.length} clauses across ${json.data.pageCount} pages. Review before saving as Draft.`,
      });
    } catch (err: unknown) {
      toast({
        title: "Extraction Failed",
        description: err instanceof Error ? err.message : "Could not extract PDF",
        variant: "destructive",
      });
    } finally {
      setExtractingPdf(false);
    }
  };

  const handleUploadPdfFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtractingPdf(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/policies/extract-pdf", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error?.message || "PDF upload failed");
      }
      applyExtractionPreview(json.data);
      toast({
        title: "Uploaded PDF Extracted",
        description: `Extracted ${json.data.extractedClauses.length} clauses from ${file.name}.`,
      });
    } catch (err: unknown) {
      toast({
        title: "Upload / Extraction Failed",
        description: err instanceof Error ? err.message : "Invalid PDF file",
        variant: "destructive",
      });
    } finally {
      setExtractingPdf(false);
      e.target.value = "";
    }
  };

  const applyExtractionPreview = (ext: PolicyPdfExtractionResult) => {
    setExtractionPreview(ext);
    // Suggest a unique draft version number if detected version already exists
    let nextVer = ext.detectedMetadata.version;
    if (versions.some((v) => v.version === nextVer)) {
      nextVer = "5.1";
      while (versions.some((v) => v.version === nextVer)) {
        const minor = parseInt(nextVer.split(".")[1] || "1", 10) + 1;
        nextVer = `5.${minor}`;
      }
    }
    setExtractedDraftVersion(nextVer);
    setExtractedEffectiveDate(ext.detectedMetadata.effectiveDate);
    setExtractedSpotLimit(ext.detectedThresholds.spotValueLimitInr);
    setExtractedEmergencyLimit(ext.detectedThresholds.emergencyValueLimitInr);
    setExtractedRfqLimit(ext.detectedThresholds.rfqValueLimitInr);
    setExtractedClubbingDays(ext.detectedThresholds.clubbingCreationDays);
    setExtractedNeedByDays(ext.detectedThresholds.clubbingNeedByDays);
    setExtractedPoWindowHours(ext.detectedThresholds.poConsolidationWindowHours);
  };

  const handleSaveExtractedAsDraft = async () => {
    if (!extractionPreview) return;
    setSavingPolicy(true);
    try {
      const updatedConfig: StructuredPolicyConfig = JSON.parse(
        JSON.stringify(extractionPreview.draftPolicyConfig)
      );
      updatedConfig.version = extractedDraftVersion.trim();
      updatedConfig.effectiveDate = extractedEffectiveDate;
      updatedConfig.clubbing.creationWindowDays = Number(extractedClubbingDays);
      updatedConfig.clubbing.needByWindowDays = Number(extractedNeedByDays);
      updatedConfig.consolidation.poWindowHours = Number(extractedPoWindowHours);

      updatedConfig.rules = updatedConfig.rules.map((r) => {
        if (r.route === "EMERGENCY_PO") {
          return {
            ...r,
            conditions: r.conditions.map((c) =>
              c.field === "valueInr"
                ? { ...c, value: Number(extractedEmergencyLimit) }
                : c
            ),
          };
        }
        if (r.route === "SPOT_PO") {
          return {
            ...r,
            conditions: r.conditions.map((c) =>
              c.field === "valueInr" ? { ...c, value: Number(extractedSpotLimit) } : c
            ),
          };
        }
        if (r.route === "RFQ" || r.route === "RFP") {
          return {
            ...r,
            conditions: r.conditions.map((c) =>
              c.field === "valueInr" ? { ...c, value: Number(extractedRfqLimit) } : c
            ),
          };
        }
        return r;
      });

      const res = await fetch("/api/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: extractedDraftVersion.trim(),
          policyName: "Corvo Engineering Procurement Policy (PR to PO)",
          documentCode: extractionPreview.detectedMetadata.documentCode,
          description: `Extracted from ${extractionPreview.fileName} (${extractionPreview.pageCount} pages, SHA-256: ${extractionPreview.sha256.slice(0, 12)}) and verified by admin.`,
          effectiveDate: extractedEffectiveDate,
          baseVersion: activePolicy?.version || "5.0",
          changeSummary: extractedChangeSummary,
          policyData: updatedConfig,
          sourceDocument: {
            fileName: extractionPreview.fileName,
            fileSize: extractionPreview.fileSize,
            mimeType: extractionPreview.mimeType,
            sha256: extractionPreview.sha256,
            storagePath: extractionPreview.storagePath,
            uploadedAt: extractionPreview.uploadedAt,
            uploadedBy: extractionPreview.uploadedBy,
            pageCount: extractionPreview.pageCount,
            extractedTextPreview: extractionPreview.extractedText.slice(0, 500),
          },
        }),
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error?.message || "Failed to save extracted draft");
      }
      toast({
        title: `Draft Policy v${json.data.version} Created from PDF`,
        description:
          "Staged as DRAFT with original PDF reference preserved. Submit for approval when ready.",
      });
      await loadPolicies();
      setActiveTab("versions");
    } catch (err: unknown) {
      toast({
        title: "Save Extracted Draft Failed",
        description: err instanceof Error ? err.message : "Validation failed",
        variant: "destructive",
      });
    } finally {
      setSavingPolicy(false);
    }
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 font-semibold text-[10px]">
            ACTIVE
          </Badge>
        );
      case "DRAFT":
        return (
          <Badge variant="outline" className="text-amber-600 border-amber-500/40 text-[10px]">
            DRAFT
          </Badge>
        );
      case "PENDING_APPROVAL":
        return (
          <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30 text-[10px]">
            PENDING APPROVAL
          </Badge>
        );
      case "APPROVED":
        return (
          <Badge className="bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/30 text-[10px]">
            APPROVED
          </Badge>
        );
      case "SCHEDULED":
        return (
          <Badge className="bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30 text-[10px]">
            SCHEDULED
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="text-muted-foreground text-[10px]">
            ARCHIVED
          </Badge>
        );
    }
  };

  const selectedRecord = versions.find((v) => v.version === selectedVersionId) || activePolicy;
  const isSelectedEditable =
    isAdmin && (editorMode === "CREATE_NEW" || selectedRecord?.status === "DRAFT");

  const weightSum = formConfig
    ? formConfig.preferredSuppliers.weights.frequency +
      formConfig.preferredSuppliers.weights.recency +
      formConfig.preferredSuppliers.weights.contractHistory +
      formConfig.preferredSuppliers.weights.onTimeDelivery +
      formConfig.preferredSuppliers.weights.qualityRating
    : 1.0;

  const updateRuleConditionValue = (
    route: string,
    field: string,
    newVal: number
  ) => {
    if (!formConfig) return;
    setFormConfig({
      ...formConfig,
      rules: formConfig.rules.map((r) => {
        if (r.route !== route) return r;
        return {
          ...r,
          conditions: r.conditions.map((c) =>
            c.field === field ? { ...c, value: newVal } : c
          ),
        };
      }),
    });
  };

  const updateRuleSuggestCount = (route: string, newCount: number) => {
    if (!formConfig) return;
    setFormConfig({
      ...formConfig,
      rules: formConfig.rules.map((r) => {
        if (r.route !== route) return r;
        return {
          ...r,
          supplierSelection: {
            ...r.supplierSelection,
            suggestCount: newCount,
          },
        };
      }),
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-[#EAEAEA] pb-5">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[#171717]">
              Policy Management
            </h1>
            {activePolicy && (
              <span className="inline-flex items-center rounded-full bg-[#D9FAF5] px-2.5 py-0.5 font-mono text-xs font-medium text-[#171717]">
                Active: v{activePolicy.version}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm font-normal text-[#6B7280] mt-1">
            Configure purchasing thresholds, extract policy PDFs, and manage version approvals.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={loadPolicies}
            className="rounded-xl border-[#E5E7EB] bg-white h-9 text-xs font-medium gap-1.5 px-3.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </Button>

          <Button
            variant="outline"
            onClick={() => setActiveTab("compare")}
            className="rounded-xl border-[#E5E7EB] bg-white h-9 text-xs font-medium gap-1.5 px-3.5"
          >
            <GitCompare className="h-3.5 w-3.5" />
            <span>Compare Versions</span>
          </Button>

          {isAdmin && (
            <>
              <Button
                variant="outline"
                onClick={() => setActiveTab("pdf-extract")}
                className="rounded-xl border-[#E5E7EB] bg-white h-9 text-xs font-medium gap-1.5 px-3.5"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Extract PDF</span>
              </Button>

              <Button
                onClick={() =>
                  activePolicy && handleStartNewDraftFrom(activePolicy)
                }
                className="rounded-xl bg-[#6938EF] hover:bg-[#5928DF] text-white h-9 text-xs font-medium gap-1.5 px-3.5"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>New Draft Version</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Active Policy Overview Strip */}
      {activePolicy && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl bg-[#D9FAF5] border border-teal-200/60 p-5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#4B5563]">
                Active Version
              </span>
              {renderStatusBadge(activePolicy.status)}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold font-mono text-[#171717]">
                v{activePolicy.version}
              </span>
              <span className="text-xs font-mono font-normal text-[#4B5563]">
                {activePolicy.documentCode}
              </span>
            </div>
            <p className="text-xs font-normal text-[#4B5563] truncate">
              {activePolicy.policyName}
            </p>
          </div>

          <div className="rounded-2xl bg-[#FFF2CC] border border-amber-200/60 p-5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#4B5563]">
                Effective Scope
              </span>
              <Clock className="h-4 w-4 text-[#4B5563]" />
            </div>
            <div className="text-2xl font-semibold text-[#171717]">
              {activePolicy.effectiveDate}
            </div>
            <p className="text-xs font-normal text-[#4B5563]">
              Plants: {activePolicy.appliesToPlants.join(", ")}
            </p>
          </div>

          <div className="rounded-2xl bg-[#DDF3FF] border border-sky-200/60 p-5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#4B5563]">
                Direct PO Limits
              </span>
              <Sliders className="h-4 w-4 text-[#4B5563]" />
            </div>
            <div className="text-base font-semibold text-[#171717]">
              Spot &lt; ₹2L &bull; Emerg ≤ ₹5L
            </div>
            <p className="text-xs font-normal text-[#4B5563]">
              RFQ &lt; ₹10L (3) &bull; RFP ≥ ₹10L (5)
            </p>
          </div>

          <div className="rounded-2xl bg-[#FCE3EF] border border-pink-200/60 p-5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#4B5563]">
                Governance
              </span>
              <ShieldCheck className="h-4 w-4 text-[#4B5563]" />
            </div>
            <div className="text-base font-semibold text-[#171717] truncate">
              {activePolicy.approvedBy || "Head of Procurement"}
            </div>
            <p className="text-xs font-normal text-[#4B5563]">
              {versions.length} versions &bull; {auditLogs.length} audit logs
            </p>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#EAEAEA] pb-2.5">
        {[
          { id: "versions", label: "Version History & Workflow", icon: History },
          {
            id: "editor",
            label:
              editorMode === "CREATE_NEW"
                ? `Create Draft (v${formVersion})`
                : `Structured Rules (v${selectedVersionId})`,
            icon: Sliders,
          },
          { id: "pdf-extract", label: "PDF Upload & Extraction", icon: FileText },
          { id: "compare", label: "Side-by-Side Comparison & Audit", icon: GitCompare },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
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

      {/* TAB 1: VERSION REGISTRY & WORKFLOW */}
      {activeTab === "versions" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card overflow-hidden shadow-xs">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[90px]">Version</TableHead>
                  <TableHead>Document & Policy Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Effective Window</TableHead>
                  <TableHead>Governance Trail</TableHead>
                  <TableHead>Change Summary</TableHead>
                  <TableHead className="text-right">Workflow Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground">
                      Loading procurement policy versions...
                    </TableCell>
                  </TableRow>
                ) : (
                  versions.map((ver) => (
                    <TableRow key={ver.version}>
                      <TableCell className="font-mono font-bold text-xs">
                        v{ver.version}
                        {ver.baseVersion && (
                          <div className="text-[10px] font-normal text-muted-foreground">
                            from v{ver.baseVersion}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs font-semibold text-foreground">
                          {ver.documentCode}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {ver.policyName}
                        </div>
                        {ver.sourceDocument && (
                          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                            PDF: {ver.sourceDocument.fileName}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{renderStatusBadge(ver.status)}</TableCell>
                      <TableCell className="text-xs font-mono">
                        <div>From: {ver.effectiveDate}</div>
                        <div className="text-[10px] text-muted-foreground">
                          Until: {ver.effectiveUntil || "Present / Open"}
                        </div>
                      </TableCell>
                      <TableCell className="text-[11px] text-muted-foreground">
                        <div>Created: {ver.createdBy}</div>
                        {ver.submittedBy && <div>Submitted: {ver.submittedBy}</div>}
                        {ver.approvedBy && (
                          <div className="text-foreground font-medium">
                            Approved: {ver.approvedBy}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[260px] text-xs text-muted-foreground">
                        <p className="line-clamp-2">{ver.changeSummary}</p>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px] px-2 gap-1"
                            onClick={() => {
                              setEditorMode("VIEW_OR_EDIT");
                              populateEditorFromRecord(ver);
                              setActiveTab("editor");
                            }}
                          >
                            <Eye className="h-3 w-3" />
                            <span>{ver.status === "DRAFT" && isAdmin ? "Edit" : "Inspect"}</span>
                          </Button>

                          {activePolicy && ver.version !== activePolicy.version && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-[11px] px-2 gap-1"
                              onClick={() => {
                                setCompareBaseVer(ver.version);
                                setCompareTargetVer(activePolicy.version);
                                setActiveTab("compare");
                              }}
                            >
                              <GitCompare className="h-3 w-3" />
                              <span>Diff</span>
                            </Button>
                          )}

                          {isAdmin && ver.status === "DRAFT" && (
                            <Button
                              size="sm"
                              className="h-7 text-[11px] px-2 gap-1"
                              disabled={submittingWorkflow}
                              onClick={() => handleWorkflowAction(ver.version, "SUBMIT")}
                            >
                              <Send className="h-3 w-3" />
                              <span>Submit for Approval</span>
                            </Button>
                          )}

                          {isAdmin && ver.status === "PENDING_APPROVAL" && (
                            <Button
                              size="sm"
                              className="h-7 text-[11px] px-2 gap-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                              disabled={submittingWorkflow}
                              onClick={() => {
                                setApprovingVersion(ver);
                                setApprovalComment(
                                  `Verified thresholds and clauses for Policy v${ver.version}.`
                                );
                                setApproveDialogOpen(true);
                              }}
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              <span>Approve</span>
                            </Button>
                          )}

                          {isAdmin &&
                            (ver.status === "APPROVED" || ver.status === "SCHEDULED") && (
                              <Button
                                size="sm"
                                className="h-7 text-[11px] px-2 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                disabled={submittingWorkflow}
                                onClick={() =>
                                  handleWorkflowAction(ver.version, "ACTIVATE", {
                                    forceImmediate: true,
                                  })
                                }
                              >
                                <Play className="h-3 w-3" />
                                <span>Activate</span>
                              </Button>
                            )}

                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[11px] px-2 gap-1"
                              onClick={() => handleStartNewDraftFrom(ver)}
                              title="Clone into a new draft version"
                            >
                              <Copy className="h-3 w-3" />
                              <span>Clone</span>
                            </Button>
                          )}

                          {isAdmin &&
                            ver.status !== "ARCHIVED" &&
                            ver.status !== "ACTIVE" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-[11px] px-2 text-muted-foreground hover:text-destructive"
                                disabled={submittingWorkflow}
                                onClick={() =>
                                  handleWorkflowAction(ver.version, "ARCHIVE", {
                                    reason: "Archived by Procurement Admin",
                                  })
                                }
                              >
                                <Archive className="h-3 w-3" />
                              </Button>
                            )}
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

      {/* TAB 2: STRUCTURED POLICY CONFIGURATION EDITOR */}
      {activeTab === "editor" && formConfig && (
        <div className="space-y-6">
          {/* Top bar: Version selector + Immutability banner */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3.5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-xs font-semibold">
                {editorMode === "CREATE_NEW" ? (
                  <span className="text-amber-600 dark:text-amber-400">
                    Creating New Draft Version: v{formVersion} (derived from v{formBaseVersion})
                  </span>
                ) : (
                  <span>
                    Inspecting Policy Version:{" "}
                    <span className="font-mono font-bold">v{selectedVersionId}</span>
                  </span>
                )}
              </div>
              {editorMode === "VIEW_OR_EDIT" && selectedRecord && (
                <div className="flex items-center gap-2">
                  {renderStatusBadge(selectedRecord.status)}
                  <select
                    aria-label="Select policy version"
                    className="h-7 rounded border border-input bg-background px-2 text-xs font-mono"
                    value={selectedVersionId}
                    onChange={(e) => {
                      const found = versions.find((v) => v.version === e.target.value);
                      if (found) {
                        setEditorMode("VIEW_OR_EDIT");
                        populateEditorFromRecord(found);
                      }
                    }}
                  >
                    {versions.map((v) => (
                      <option key={v.version} value={v.version}>
                        v{v.version} ({v.status})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {!isSelectedEditable ? (
                <>
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Lock className="h-3.5 w-3.5" />
                    Read-only ({selectedRecord?.status} versions are immutable)
                  </span>
                  {isAdmin && selectedRecord && (
                    <Button
                      size="sm"
                      onClick={() => handleStartNewDraftFrom(selectedRecord)}
                      className="h-8 text-xs gap-1.5"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      <span>Clone to New Draft to Edit</span>
                    </Button>
                  )}
                </>
              ) : (
                <>
                  {editorMode === "CREATE_NEW" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditorMode("VIEW_OR_EDIT");
                        if (activePolicy) populateEditorFromRecord(activePolicy);
                      }}
                      className="h-8 text-xs"
                    >
                      Cancel
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={handleSavePolicy}
                    disabled={savingPolicy || Math.abs(weightSum - 1.0) > 0.001}
                    className="h-8 text-xs gap-1.5"
                  >
                    <Save className="h-3.5 w-3.5" />
                    <span>
                      {savingPolicy
                        ? "Saving..."
                        : editorMode === "CREATE_NEW"
                        ? `Create Draft v${formVersion}`
                        : `Save Draft v${selectedVersionId}`}
                    </span>
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Grid of Structured Policy Sections */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Section 1: Metadata & Effective Dates */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">
                  1. Version Metadata & Effective Scope
                </CardTitle>
                <CardDescription className="text-xs">
                  Version identifier, document code, plant scope, and effective dates
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-medium text-muted-foreground block mb-1">
                      Policy Version Number
                    </label>
                    <Input
                      value={formVersion}
                      disabled={editorMode !== "CREATE_NEW"}
                      onChange={(e) => setFormVersion(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-medium text-muted-foreground block mb-1">
                      Document Code
                    </label>
                    <Input
                      value={formDocCode}
                      disabled={!isSelectedEditable}
                      onChange={(e) => setFormDocCode(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-medium text-muted-foreground block mb-1">
                      Effective From Date
                    </label>
                    <Input
                      type="date"
                      value={formEffectiveDate}
                      disabled={!isSelectedEditable}
                      onChange={(e) => setFormEffectiveDate(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-medium text-muted-foreground block mb-1">
                      Effective Until (Optional)
                    </label>
                    <Input
                      type="date"
                      value={formEffectiveUntil}
                      disabled={!isSelectedEditable}
                      onChange={(e) => setFormEffectiveUntil(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-medium text-muted-foreground block mb-1">
                      In-Scope Plants (comma-separated)
                    </label>
                    <Input
                      value={formConfig.appliesToPlants.join(", ")}
                      disabled={!isSelectedEditable}
                      onChange={(e) =>
                        setFormConfig({
                          ...formConfig,
                          appliesToPlants: e.target.value
                            .split(",")
                            .map((s) => s.trim().toUpperCase())
                            .filter(Boolean),
                        })
                      }
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-medium text-muted-foreground block mb-1">
                      Policy Owner
                    </label>
                    <Input
                      value={formConfig.owner}
                      disabled={!isSelectedEditable}
                      onChange={(e) =>
                        setFormConfig({ ...formConfig, owner: e.target.value })
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-medium text-muted-foreground block mb-1">
                    Change Summary (Audit Note)
                  </label>
                  <Input
                    value={formChangeSummary}
                    disabled={!isSelectedEditable}
                    onChange={(e) => setFormChangeSummary(e.target.value)}
                    placeholder="Summarize what changed in this policy version..."
                    className="h-8 text-xs"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Section 2: Clubbing, Valuation & PO Consolidation Windows */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">
                  2. Clubbing, Valuation & Consolidation Windows
                </CardTitle>
                <CardDescription className="text-xs">
                  Clauses 2.2 (Clubbing), 3.1 (Valuation), and 7.1 (PO Consolidation)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-medium text-muted-foreground block mb-1">
                      Clubbing Creation Window (Days)
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={90}
                      value={formConfig.clubbing.creationWindowDays}
                      disabled={!isSelectedEditable}
                      onChange={(e) =>
                        setFormConfig({
                          ...formConfig,
                          clubbing: {
                            ...formConfig.clubbing,
                            creationWindowDays: Number(e.target.value),
                          },
                        })
                      }
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-medium text-muted-foreground block mb-1">
                      Clubbing Need-By Window (± Days)
                    </label>
                    <Input
                      type="number"
                      min={0}
                      max={60}
                      value={formConfig.clubbing.needByWindowDays}
                      disabled={!isSelectedEditable}
                      onChange={(e) =>
                        setFormConfig({
                          ...formConfig,
                          clubbing: {
                            ...formConfig.clubbing,
                            needByWindowDays: Number(e.target.value),
                          },
                        })
                      }
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-medium text-muted-foreground block mb-1">
                      Valuation PO Lookback (Days)
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={1825}
                      value={formConfig.valuation.poHistoryWindowDays}
                      disabled={!isSelectedEditable}
                      onChange={(e) =>
                        setFormConfig({
                          ...formConfig,
                          valuation: {
                            ...formConfig.valuation,
                            poHistoryWindowDays: Number(e.target.value),
                          },
                        })
                      }
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-medium text-muted-foreground block mb-1">
                      PO Consolidation Window (Hours)
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={168}
                      value={formConfig.consolidation.poWindowHours}
                      disabled={!isSelectedEditable}
                      onChange={(e) =>
                        setFormConfig({
                          ...formConfig,
                          consolidation: {
                            ...formConfig.consolidation,
                            poWindowHours: Number(e.target.value),
                          },
                        })
                      }
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="rounded border border-border bg-muted/20 p-2.5 text-[11px] text-muted-foreground">
                  Contract Ceiling Exhausted Fallback:{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {formConfig.valuation.contractExhaustedFallback}
                  </span>{" "}
                  (Clause 3.1a) · Cross-Plant Clubbing:{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {formConfig.clubbing.allowAcrossPlants ? "Allowed" : "Disallowed"}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Section 3: Preferred Supplier Eligibility & Scoring Weights */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <CardTitle className="text-sm font-semibold">
                    3. Preferred Supplier Eligibility & Scoring Weights (Section 6)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    548-day PO eligibility window, active lookback, and 5-factor weighted scoring formula
                  </CardDescription>
                </div>
                <Badge
                  variant={Math.abs(weightSum - 1.0) <= 0.001 ? "outline" : "destructive"}
                  className="font-mono text-xs"
                >
                  Weight Sum: {(weightSum * 100).toFixed(1)}% (Required: 100.0%)
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
                <div>
                  <label className="font-medium text-muted-foreground block mb-1">
                    Eligibility Window (d)
                  </label>
                  <Input
                    type="number"
                    value={formConfig.preferredSuppliers.poHistoryWindowDays}
                    disabled={!isSelectedEditable}
                    onChange={(e) =>
                      setFormConfig({
                        ...formConfig,
                        preferredSuppliers: {
                          ...formConfig.preferredSuppliers,
                          poHistoryWindowDays: Number(e.target.value),
                        },
                      })
                    }
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="font-medium text-muted-foreground block mb-1">
                    Direct PO Lookback (d)
                  </label>
                  <Input
                    type="number"
                    value={formConfig.preferredSuppliers.activeLookbackDays}
                    disabled={!isSelectedEditable}
                    onChange={(e) =>
                      setFormConfig({
                        ...formConfig,
                        preferredSuppliers: {
                          ...formConfig.preferredSuppliers,
                          activeLookbackDays: Number(e.target.value),
                        },
                      })
                    }
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="font-medium text-muted-foreground block mb-1">
                    Frequency Weight
                  </label>
                  <Input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={formConfig.preferredSuppliers.weights.frequency}
                    disabled={!isSelectedEditable}
                    onChange={(e) =>
                      setFormConfig({
                        ...formConfig,
                        preferredSuppliers: {
                          ...formConfig.preferredSuppliers,
                          weights: {
                            ...formConfig.preferredSuppliers.weights,
                            frequency: Number(e.target.value),
                          },
                        },
                      })
                    }
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="font-medium text-muted-foreground block mb-1">
                    Recency Weight
                  </label>
                  <Input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={formConfig.preferredSuppliers.weights.recency}
                    disabled={!isSelectedEditable}
                    onChange={(e) =>
                      setFormConfig({
                        ...formConfig,
                        preferredSuppliers: {
                          ...formConfig.preferredSuppliers,
                          weights: {
                            ...formConfig.preferredSuppliers.weights,
                            recency: Number(e.target.value),
                          },
                        },
                      })
                    }
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="font-medium text-muted-foreground block mb-1">
                    Contract Weight
                  </label>
                  <Input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={formConfig.preferredSuppliers.weights.contractHistory}
                    disabled={!isSelectedEditable}
                    onChange={(e) =>
                      setFormConfig({
                        ...formConfig,
                        preferredSuppliers: {
                          ...formConfig.preferredSuppliers,
                          weights: {
                            ...formConfig.preferredSuppliers.weights,
                            contractHistory: Number(e.target.value),
                          },
                        },
                      })
                    }
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="font-medium text-muted-foreground block mb-1">
                    On-Time Weight
                  </label>
                  <Input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={formConfig.preferredSuppliers.weights.onTimeDelivery}
                    disabled={!isSelectedEditable}
                    onChange={(e) =>
                      setFormConfig({
                        ...formConfig,
                        preferredSuppliers: {
                          ...formConfig.preferredSuppliers,
                          weights: {
                            ...formConfig.preferredSuppliers.weights,
                            onTimeDelivery: Number(e.target.value),
                          },
                        },
                      })
                    }
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="font-medium text-muted-foreground block mb-1">
                    Quality Weight
                  </label>
                  <Input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={formConfig.preferredSuppliers.weights.qualityRating}
                    disabled={!isSelectedEditable}
                    onChange={(e) =>
                      setFormConfig({
                        ...formConfig,
                        preferredSuppliers: {
                          ...formConfig.preferredSuppliers,
                          weights: {
                            ...formConfig.preferredSuppliers.weights,
                            qualityRating: Number(e.target.value),
                          },
                        },
                      })
                    }
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 4: Decision Rules & Financial Thresholds (Clauses 5.1 - 5.6) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                4. Procurement Decision Rules & Financial Thresholds (Clauses 5.1 – 5.6)
              </CardTitle>
              <CardDescription className="text-xs">
                Evaluated in strict priority order. Boundary conditions (e.g., Spot &lt; ₹2,00,000, Emergency ≤ ₹5,00,000, RFQ &lt; ₹10,00,000, RFP ≥ ₹10,00,000) are preserved.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[70px]">Clause</TableHead>
                    <TableHead>Rule Name & Route</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Financial Threshold (INR)</TableHead>
                    <TableHead>Required Suppliers</TableHead>
                    <TableHead>Rule Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {formConfig.rules.map((rule) => {
                    const valCond = rule.conditions.find((c) => c.field === "valueInr");
                    return (
                      <TableRow key={rule.id}>
                        <TableCell className="font-mono font-bold text-xs">
                          {rule.clause}
                        </TableCell>
                        <TableCell>
                          <div className="text-xs font-semibold">{rule.name}</div>
                          <div className="text-[10px] font-mono text-muted-foreground">
                            {rule.route} (Priority {rule.priority})
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={rule.decision === "PO" ? "default" : "secondary"}
                            className="text-[10px] font-mono"
                          >
                            {rule.decision}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {valCond ? (
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs text-muted-foreground">
                                {valCond.operator === "lt"
                                  ? "< ₹"
                                  : valCond.operator === "lte"
                                  ? "≤ ₹"
                                  : valCond.operator === "gte"
                                  ? "≥ ₹"
                                  : "= ₹"}
                              </span>
                              <Input
                                type="number"
                                step="10000"
                                value={valCond.value}
                                disabled={!isSelectedEditable}
                                onChange={(e) =>
                                  updateRuleConditionValue(
                                    rule.route,
                                    "valueInr",
                                    Number(e.target.value)
                                  )
                                }
                                className="h-7 w-32 text-xs font-mono"
                              />
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              No value cap
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {rule.supplierSelection.suggestCount !== undefined ? (
                            <Input
                              type="number"
                              min={1}
                              max={10}
                              value={rule.supplierSelection.suggestCount}
                              disabled={!isSelectedEditable}
                              onChange={(e) =>
                                updateRuleSuggestCount(
                                  rule.route,
                                  Number(e.target.value)
                                )
                              }
                              className="h-7 w-20 text-xs font-mono"
                            />
                          ) : (
                            <span className="text-xs font-mono text-muted-foreground">
                              {rule.supplierSelection.type}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-xs">
                          {rule.description}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 3: PDF UPLOAD & DETERMINISTIC EXTRACTION */}
      {activeTab === "pdf-extract" && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Upload className="h-4 w-4 text-primary" />
                Deterministic Procurement Policy PDF Upload & Rule Extraction
              </CardTitle>
              <CardDescription className="text-xs">
                Upload a policy PDF document or load the supplied task-kit Corvo_Procurement_Policy.pdf. Extracted text and parameters are staged as a draft preview requiring human confirmation before saving.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-xs font-medium cursor-pointer hover:bg-muted">
                  <Upload className="h-3.5 w-3.5" />
                  <span>Upload Policy PDF (.pdf, max 10 MB)</span>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handleUploadPdfFile}
                    disabled={!isAdmin || extractingPdf}
                    className="hidden"
                  />
                </label>

                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!isAdmin || extractingPdf}
                  onClick={handleExtractSuppliedPdf}
                  className="h-8 text-xs gap-1.5"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>
                    {extractingPdf
                      ? "Extracting PDF..."
                      : "Extract Supplied Corvo_Procurement_Policy.pdf"}
                  </span>
                </Button>
              </div>

              {extractionPreview && (
                <div className="space-y-5 pt-2 border-t">
                  {/* Verification Banner */}
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-1">
                    <div className="font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4" />
                      <span>Human Verification Required Before Saving Draft</span>
                    </div>
                    <ul className="list-disc pl-5 text-[11px] text-muted-foreground space-y-0.5">
                      {extractionPreview.reviewNotes.map((note, idx) => (
                        <li key={idx}>{note}</li>
                      ))}
                    </ul>
                    <div className="text-[10px] font-mono text-muted-foreground pt-1">
                      Stored File: {extractionPreview.storagePath} · Size:{" "}
                      {(extractionPreview.fileSize / 1024).toFixed(1)} KB · SHA-256:{" "}
                      {extractionPreview.sha256.slice(0, 16)}...
                    </div>
                  </div>

                  {/* Manual Correction Form for Extracted Thresholds */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="p-4 space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Verify & Correct Extracted Parameters
                      </h3>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="font-medium text-muted-foreground block mb-1">
                            Target Draft Version Number
                          </label>
                          <Input
                            value={extractedDraftVersion}
                            onChange={(e) => setExtractedDraftVersion(e.target.value)}
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="font-medium text-muted-foreground block mb-1">
                            Extracted Effective Date
                          </label>
                          <Input
                            type="date"
                            value={extractedEffectiveDate}
                            onChange={(e) => setExtractedEffectiveDate(e.target.value)}
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="font-medium text-muted-foreground block mb-1">
                            Spot PO Limit (INR, Rule 5.4)
                          </label>
                          <Input
                            type="number"
                            value={extractedSpotLimit}
                            onChange={(e) => setExtractedSpotLimit(Number(e.target.value))}
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="font-medium text-muted-foreground block mb-1">
                            Emergency PO Limit (INR, Rule 5.3)
                          </label>
                          <Input
                            type="number"
                            value={extractedEmergencyLimit}
                            onChange={(e) =>
                              setExtractedEmergencyLimit(Number(e.target.value))
                            }
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="font-medium text-muted-foreground block mb-1">
                            RFQ / RFP Boundary (INR, 5.5/5.6)
                          </label>
                          <Input
                            type="number"
                            value={extractedRfqLimit}
                            onChange={(e) => setExtractedRfqLimit(Number(e.target.value))}
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="font-medium text-muted-foreground block mb-1">
                            PO Consolidation Window (Hours)
                          </label>
                          <Input
                            type="number"
                            value={extractedPoWindowHours}
                            onChange={(e) =>
                              setExtractedPoWindowHours(Number(e.target.value))
                            }
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="font-medium text-muted-foreground block mb-1">
                            Clubbing Creation Window (Days)
                          </label>
                          <Input
                            type="number"
                            value={extractedClubbingDays}
                            onChange={(e) =>
                              setExtractedClubbingDays(Number(e.target.value))
                            }
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="font-medium text-muted-foreground block mb-1">
                            Clubbing Need-By Window (± Days)
                          </label>
                          <Input
                            type="number"
                            value={extractedNeedByDays}
                            onChange={(e) =>
                              setExtractedNeedByDays(Number(e.target.value))
                            }
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-muted-foreground block mb-1">
                          Admin Confirmation Summary
                        </label>
                        <Input
                          value={extractedChangeSummary}
                          onChange={(e) => setExtractedChangeSummary(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>

                      <div className="pt-2 flex justify-end">
                        <Button
                          size="sm"
                          disabled={savingPolicy}
                          onClick={handleSaveExtractedAsDraft}
                          className="h-8 text-xs gap-1.5"
                        >
                          <Save className="h-3.5 w-3.5" />
                          <span>
                            {savingPolicy
                              ? "Saving Draft..."
                              : `Confirm & Save as Draft v${extractedDraftVersion}`}
                          </span>
                        </Button>
                      </div>
                    </Card>

                    {/* Extracted Clauses Preview */}
                    <Card className="p-4 space-y-3 max-h-[420px] overflow-y-auto">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Identified Policy Clauses ({extractionPreview.extractedClauses.length})
                      </h3>
                      <div className="space-y-2">
                        {extractionPreview.extractedClauses.map((cl) => (
                          <div
                            key={cl.clauseId}
                            className="rounded border border-border bg-muted/20 p-2 text-xs"
                          >
                            <span className="font-mono font-bold text-primary mr-2">
                              Clause {cl.clauseId}
                            </span>
                            <span className="text-muted-foreground">{cl.text}</span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 4: SIDE-BY-SIDE COMPARISON & AUDIT TRAIL */}
      {activeTab === "compare" && (
        <div className="space-y-6">
          <Card className="p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-muted-foreground">Base Version:</span>
                  <select
                    aria-label="Base policy version"
                    value={compareBaseVer}
                    onChange={(e) => setCompareBaseVer(e.target.value)}
                    className="h-8 rounded border border-input bg-background px-2 font-mono text-xs"
                  >
                    {versions.map((v) => (
                      <option key={v.version} value={v.version}>
                        v{v.version} ({v.status})
                      </option>
                    ))}
                  </select>
                </div>

                <span className="text-muted-foreground font-bold">→</span>

                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-muted-foreground">Target Version:</span>
                  <select
                    aria-label="Target policy version"
                    value={compareTargetVer}
                    onChange={(e) => setCompareTargetVer(e.target.value)}
                    className="h-8 rounded border border-input bg-background px-2 font-mono text-xs"
                  >
                    {versions.map((v) => (
                      <option key={v.version} value={v.version}>
                        v{v.version} ({v.status})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant={showOnlyChanges ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowOnlyChanges(!showOnlyChanges)}
                  className="h-8 text-xs"
                >
                  {showOnlyChanges ? "Showing Differences Only" : "Showing All Parameters"}
                </Button>
              </div>
            </div>

            {comparing ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Computing policy comparison...
              </div>
            ) : (
              comparisonResult && (
                <div className="space-y-4">
                  <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
                    <div className="font-semibold text-foreground">
                      Change Summary (v{comparisonResult.baseVersion} → v
                      {comparisonResult.targetVersion}):{" "}
                      <span className="text-primary">
                        {comparisonResult.totalDifferences} substantive difference(s)
                      </span>
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      {comparisonResult.summaryText}
                    </p>
                  </div>

                  <div className="rounded-lg border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Policy Category</TableHead>
                          <TableHead>Parameter / Rule</TableHead>
                          <TableHead>Change Type</TableHead>
                          <TableHead>
                            Base (v{comparisonResult.baseVersion})
                          </TableHead>
                          <TableHead>
                            Target (v{comparisonResult.targetVersion})
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(showOnlyChanges
                          ? comparisonResult.changedDiffs
                          : comparisonResult.diffs
                        ).map((diff) => (
                          <TableRow key={diff.fieldPath}>
                            <TableCell className="font-mono text-[10px] text-muted-foreground">
                              {diff.category}
                            </TableCell>
                            <TableCell className="text-xs font-medium">
                              {diff.label}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  diff.changeType === "UNCHANGED"
                                    ? "secondary"
                                    : "default"
                                }
                                className="text-[10px]"
                              >
                                {diff.changeType}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {diff.formattedOld}
                            </TableCell>
                            <TableCell
                              className={`font-mono text-xs ${
                                diff.changeType !== "UNCHANGED"
                                  ? "font-bold text-emerald-600 dark:text-emerald-400"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {diff.formattedNew}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )
            )}
          </Card>

          {/* Policy Lifecycle Audit Log */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Policy Governance Audit Log (AuditLog)
              </CardTitle>
              <CardDescription className="text-xs">
                Immutable audit trail of policy draft creation, PDF extraction, submission, approval, activation, and archival
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLogs.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center py-6 text-xs text-muted-foreground"
                      >
                        No policy lifecycle actions recorded yet in this session.
                      </TableCell>
                    </TableRow>
                  ) : (
                    auditLogs.slice(0, 20).map((log, i) => (
                      <TableRow key={log.id || i}>
                        <TableCell className="font-mono text-[11px] text-muted-foreground">
                          {new Date(log.timestamp).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {log.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono font-bold text-xs">
                          v{log.entityId}
                        </TableCell>
                        <TableCell className="text-xs">
                          {log.actorEmail || log.actorId}
                        </TableCell>
                        <TableCell className="text-[11px] font-mono text-muted-foreground max-w-md truncate">
                          {JSON.stringify(log.newValue)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Approval Modal with Separation of Duties Verification */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Approve Policy Version v{approvingVersion?.version}
            </DialogTitle>
            <DialogDescription>
              Human approval transitions this version from PENDING_APPROVAL to APPROVED.
            </DialogDescription>
          </DialogHeader>

          {approvingVersion && (
            <div className="space-y-3 py-2 text-xs">
              <div className="rounded border border-border bg-muted/30 p-2.5 space-y-1">
                <div>
                  <span className="text-muted-foreground">Submitted By:</span>{" "}
                  <span className="font-mono font-semibold">
                    {approvingVersion.submittedBy || approvingVersion.createdBy}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Effective Date:</span>{" "}
                  <span className="font-mono font-semibold">
                    {approvingVersion.effectiveDate}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Summary:</span>{" "}
                  {approvingVersion.changeSummary}
                </div>
              </div>

              {(approvingVersion.submittedBy || approvingVersion.createdBy || "").toLowerCase() ===
                userEmail.toLowerCase() && (
                <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
                  <div className="font-semibold text-amber-800 dark:text-amber-300">
                    Separation of Duties Required
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    You ({userEmail}) created/submitted this policy version. Provide secondary Procurement Admin sign-off credentials (e.g. Head of Procurement `director@cantill.ai` / `Director2026!`) to authorize approval:
                  </p>
                  <div className="space-y-2 pt-1">
                    <Input
                      placeholder="Secondary Admin Email"
                      value={secondaryEmail}
                      onChange={(e) => setSecondaryEmail(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                    <Input
                      type="password"
                      placeholder="Secondary Admin Password"
                      value={secondaryPassword}
                      onChange={(e) => setSecondaryPassword(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="font-medium text-muted-foreground block mb-1">
                  Approval Sign-off Note
                </label>
                <Input
                  value={approvalComment}
                  onChange={(e) => setApprovalComment(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setApproveDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={submittingWorkflow}
              onClick={handleConfirmApproval}
            >
              {submittingWorkflow ? "Approving..." : "Confirm Approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
