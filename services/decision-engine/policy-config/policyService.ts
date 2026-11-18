import { connectToDatabase } from "@/lib/db";
import {
  getFallbackPolicyVersions,
  getFallbackAuditLogs,
  FallbackPolicyVersionRecord,
  FallbackAuditLogRecord,
} from "@/lib/db/fallbackStore";
import {
  PolicyVersion,
  IPolicySourceDocument,
  PolicyLifecycleStatus,
} from "@/models/PolicyVersion";
import { AuditLog } from "@/models/AuditLog";
import { StructuredPolicyConfig } from "../types/policy";
import { CORVO_POLICY_V5_CONFIG } from "./baseline-v5";
import { validateStructuredPolicyConfig } from "./policyValidation";
import { comparePolicyConfigs, PolicyComparisonResult } from "./policyComparator";
import { SafeUser } from "@/types/auth";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";

export interface PolicyVersionRecordDto {
  id: string;
  version: string;
  policyName: string;
  documentCode: string;
  description: string;
  effectiveDate: string;
  effectiveUntil: string | null;
  status: PolicyLifecycleStatus;
  baseVersion?: string;
  changeSummary: string;
  owner: string;
  appliesToPlants: string[];
  policyData: StructuredPolicyConfig;
  sourceDocument?: IPolicySourceDocument | null;
  createdBy: string;
  updatedBy?: string;
  submittedBy?: string;
  submittedAt?: string | null;
  approvedBy?: string;
  approvedAt?: string | null;
  activatedBy?: string;
  activatedAt?: string | null;
  archivedBy?: string;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Historical Corvo Policy v4.0 (superseded by v5.0 on 2026-04-01) for comparison & revision history
 */
export const CORVO_POLICY_V4_ARCHIVED_CONFIG: StructuredPolicyConfig = {
  ...JSON.parse(JSON.stringify(CORVO_POLICY_V5_CONFIG)),
  version: "4.0",
  documentName: "CORVO-PROC-POL-03",
  effectiveDate: "2025-04-01",
  owner: "Head of Procurement",
  appliesToPlants: ["PUN1", "CHK1"],
  clubbing: {
    creationWindowDays: 10,
    needByWindowDays: 5,
    allowAcrossPlants: false,
    allowNewItems: false,
  },
  valuation: {
    contractExhaustedFallback: "LOWEST_APPLICABLE_RATE",
    poHistoryWindowDays: 365,
    currency: "INR",
  },
  preferredSuppliers: {
    ...JSON.parse(JSON.stringify(CORVO_POLICY_V5_CONFIG.preferredSuppliers)),
    poHistoryWindowDays: 365,
    weights: {
      frequency: 0.4,
      recency: 0.2,
      contractHistory: 0.15,
      onTimeDelivery: 0.15,
      qualityRating: 0.1,
    },
  },
  consolidation: {
    poWindowHours: 12,
    matchFields: ["supplierId", "plantCode", "route"],
  },
  rules: CORVO_POLICY_V5_CONFIG.rules.map((r) => {
    if (r.id === "5.3") {
      return {
        ...r,
        description:
          "Emergency requisition with value <= ₹3,00,000 bought from active supplier in last 365 days.",
        conditions: r.conditions.map((c) =>
          c.field === "valueInr" ? { ...c, value: 300000 } : c
        ),
      };
    }
    if (r.id === "5.4") {
      return {
        ...r,
        description:
          "Requirement value strictly below ₹1,50,000 bought from active supplier in last 365 days.",
        conditions: r.conditions.map((c) =>
          c.field === "valueInr" ? { ...c, value: 150000 } : c
        ),
      };
    }
    return r;
  }),
};

/**
 * Normalizes legacy lowercase status strings ("active", "draft", "archived") into PolicyLifecycleStatus
 */
function normalizeStatus(rawStatus: string | undefined): PolicyLifecycleStatus {
  const upper = (rawStatus || "DRAFT").toUpperCase();
  if (
    upper === "DRAFT" ||
    upper === "PENDING_APPROVAL" ||
    upper === "APPROVED" ||
    upper === "SCHEDULED" ||
    upper === "ACTIVE" ||
    upper === "ARCHIVED"
  ) {
    return upper;
  }
  if (upper === "DEPRECATED") return "ARCHIVED";
  return "DRAFT";
}

function toDto(rec: any): PolicyVersionRecordDto {
  const pData = (rec.policyData || CORVO_POLICY_V5_CONFIG) as StructuredPolicyConfig;
  const effDate =
    rec.effectiveDate instanceof Date
      ? rec.effectiveDate.toISOString().slice(0, 10)
      : String(rec.effectiveDate || pData.effectiveDate).slice(0, 10);
  const effUntil = rec.effectiveUntil
    ? rec.effectiveUntil instanceof Date
      ? rec.effectiveUntil.toISOString().slice(0, 10)
      : String(rec.effectiveUntil).slice(0, 10)
    : null;

  return {
    id: rec._id ? rec._id.toString() : rec.id || rec.version,
    version: rec.version,
    policyName: rec.policyName || "Corvo Engineering Procurement Policy (PR to PO)",
    documentCode: rec.documentCode || pData.documentName || "CORVO-PROC-POL-04",
    description:
      rec.description ||
      "Deterministic PR-to-PO procurement decision rules, contract ceiling governance, preferred supplier scoring, and PO consolidation policy.",
    effectiveDate: effDate,
    effectiveUntil: effUntil,
    status: normalizeStatus(rec.status),
    baseVersion: rec.baseVersion,
    changeSummary: rec.changeSummary || "Baseline policy configuration.",
    owner: pData.owner || "Head of Procurement",
    appliesToPlants: pData.appliesToPlants || ["PUN1", "CHK1"],
    policyData: pData,
    sourceDocument: rec.sourceDocument || null,
    createdBy: rec.createdBy || "system",
    updatedBy: rec.updatedBy || rec.createdBy || "system",
    submittedBy: rec.submittedBy,
    submittedAt: rec.submittedAt ? new Date(rec.submittedAt).toISOString() : null,
    approvedBy: rec.approvedBy,
    approvedAt: rec.approvedAt ? new Date(rec.approvedAt).toISOString() : null,
    activatedBy: rec.activatedBy,
    activatedAt: rec.activatedAt ? new Date(rec.activatedAt).toISOString() : null,
    archivedBy: rec.archivedBy,
    archivedAt: rec.archivedAt ? new Date(rec.archivedAt).toISOString() : null,
    createdAt: rec.createdAt ? new Date(rec.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: rec.updatedAt ? new Date(rec.updatedAt).toISOString() : new Date().toISOString(),
  };
}

/**
 * Ensures only PROCUREMENT_ADMIN can perform mutating policy management operations.
 */
export function assertPolicyAdmin(user: SafeUser | null | undefined): SafeUser {
  if (!user) {
    throw new ForbiddenError("Authentication required for policy management.");
  }
  if (user.role !== "PROCUREMENT_ADMIN") {
    throw new ForbiddenError(
      `Role '${user.role}' is not authorized to modify or approve procurement policies. Requires PROCUREMENT_ADMIN.`
    );
  }
  return user;
}

/**
 * Ensures BUYER or PROCUREMENT_ADMIN can view policy versions and comparisons.
 */
export function assertPolicyViewer(user: SafeUser | null | undefined): SafeUser {
  if (!user) {
    throw new ForbiddenError("Authentication required to view procurement policies.");
  }
  if (user.role !== "BUYER" && user.role !== "PROCUREMENT_ADMIN") {
    throw new ForbiddenError(
      `Role '${user.role}' is not authorized to access procurement policy administration.`
    );
  }
  return user;
}

/**
 * Records a policy lifecycle event in both MongoDB AuditLog and fallback audit log store.
 */
export async function recordPolicyAuditLog(params: {
  actorId: string;
  actorEmail?: string;
  action: string;
  version: string;
  previousValue?: unknown;
  newValue?: unknown;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const now = new Date();
  const fallbackEntry: FallbackAuditLogRecord = {
    id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    actorId: params.actorId,
    actorEmail: params.actorEmail || params.actorId,
    action: params.action,
    entityType: "PolicyVersion",
    entityId: params.version,
    previousValue: params.previousValue,
    newValue: params.newValue,
    metadata: params.metadata || {},
    timestamp: now,
    createdAt: now,
    updatedAt: now,
  };
  getFallbackAuditLogs().unshift(fallbackEntry);

  try {
    await connectToDatabase();
    await AuditLog.create({
      actorId: params.actorId,
      actorEmail: params.actorEmail || params.actorId,
      action: params.action,
      entityType: "PolicyVersion",
      entityId: params.version,
      previousValue: params.previousValue,
      newValue: params.newValue,
      metadata: params.metadata || {},
      timestamp: now,
    });
  } catch {
    // Stored in fallbackAuditLogs when local MongoDB is offline
  }
}

/**
 * Ensures baseline v5.0 (ACTIVE) and historical v4.0 (ARCHIVED) are seeded in fallback and MongoDB
 */
export async function ensureBaselinePoliciesSeeded(): Promise<void> {
  const store = getFallbackPolicyVersions();

  if (!store.has("4.0")) {
    store.set("4.0", {
      id: "pol-v4-0",
      version: "4.0",
      policyName: "Corvo Engineering Procurement Policy (PR to PO)",
      documentCode: "CORVO-PROC-POL-03",
      description:
        "Prior FY2025-26 procurement policy (Spot limit ₹1.5L, Emergency limit ₹3.0L, 12h PO consolidation). Superseded by v5.0.",
      effectiveDate: new Date("2025-04-01T00:00:00.000Z"),
      effectiveUntil: new Date("2026-03-31T23:59:59.999Z"),
      status: "ARCHIVED",
      changeSummary: "FY2025-26 baseline policy; archived upon v5.0 activation on 2026-04-01.",
      policyData: JSON.parse(JSON.stringify(CORVO_POLICY_V4_ARCHIVED_CONFIG)),
      sourceDocument: null,
      createdBy: "director@cantill.ai",
      updatedBy: "director@cantill.ai",
      submittedBy: "director@cantill.ai",
      submittedAt: new Date("2025-03-20T10:00:00.000Z"),
      approvedBy: "Head of Procurement",
      approvedAt: new Date("2025-03-25T14:30:00.000Z"),
      activatedBy: "Head of Procurement",
      activatedAt: new Date("2025-04-01T00:00:00.000Z"),
      archivedBy: "Head of Procurement",
      archivedAt: new Date("2026-04-01T00:00:00.000Z"),
      createdAt: new Date("2025-03-15T09:00:00.000Z"),
      updatedAt: new Date("2026-04-01T00:00:00.000Z"),
    });
  }

  if (!store.has("5.0")) {
    store.set("5.0", {
      id: "pol-v5-0",
      version: "5.0",
      policyName: "Corvo Engineering Procurement Policy (PR to PO)",
      documentCode: "CORVO-PROC-POL-04",
      description:
        "Active Corvo Engineering Procurement Policy v5.0 governing PUN1 (Bhosari) and CHK1 (Chakan) PR-to-PO decisions.",
      effectiveDate: new Date("2026-04-01T00:00:00.000Z"),
      effectiveUntil: null,
      status: "ACTIVE",
      baseVersion: "4.0",
      changeSummary:
        "Raised Spot PO threshold to ₹2,00,000, Emergency PO limit to ₹5,00,000, supplier lookback to 548 days, clubbing window to 14d/±7d, and PO consolidation window to 24 hours.",
      policyData: JSON.parse(JSON.stringify(CORVO_POLICY_V5_CONFIG)),
      sourceDocument: {
        fileName: "Corvo_Procurement_Policy.pdf",
        fileSize: 127239,
        mimeType: "application/pdf",
        sha256: "baseline-corvo-proc-pol-04-v5",
        storagePath: "data/Cantill_FullStack_Task_Kit/Corvo_Procurement_Policy.pdf",
        uploadedAt: "2026-03-28T09:00:00.000Z",
        uploadedBy: "admin@cantill.ai",
        pageCount: 3,
      },
      createdBy: "admin@cantill.ai",
      updatedBy: "admin@cantill.ai",
      submittedBy: "admin@cantill.ai",
      submittedAt: new Date("2026-03-28T11:00:00.000Z"),
      approvedBy: "Head of Procurement",
      approvedAt: new Date("2026-03-30T16:00:00.000Z"),
      activatedBy: "Head of Procurement",
      activatedAt: new Date("2026-04-01T00:00:00.000Z"),
      createdAt: new Date("2026-03-28T09:00:00.000Z"),
      updatedAt: new Date("2026-04-01T00:00:00.000Z"),
    });
  }

  try {
    await connectToDatabase();
    const existingV5 = await PolicyVersion.findOne({ version: "5.0" });
    if (!existingV5) {
      const v5Fallback = store.get("5.0")!;
      await PolicyVersion.create({
        version: "5.0",
        policyName: v5Fallback.policyName,
        documentCode: v5Fallback.documentCode,
        description: v5Fallback.description,
        effectiveDate: v5Fallback.effectiveDate,
        effectiveUntil: null,
        status: "ACTIVE",
        baseVersion: "4.0",
        changeSummary: v5Fallback.changeSummary,
        policyData: v5Fallback.policyData as any,
        sourceDocument: v5Fallback.sourceDocument,
        createdBy: v5Fallback.createdBy,
        updatedBy: v5Fallback.updatedBy,
        submittedBy: v5Fallback.submittedBy,
        submittedAt: v5Fallback.submittedAt,
        approvedBy: v5Fallback.approvedBy,
        approvedAt: v5Fallback.approvedAt,
        activatedBy: v5Fallback.activatedBy,
        activatedAt: v5Fallback.activatedAt,
      });
    } else if ((existingV5.status as string) === "active") {
      existingV5.status = "ACTIVE";
      await existingV5.save();
    }

    const existingV4 = await PolicyVersion.findOne({ version: "4.0" });
    if (!existingV4) {
      const v4Fallback = store.get("4.0")!;
      await PolicyVersion.create({
        version: "4.0",
        policyName: v4Fallback.policyName,
        documentCode: v4Fallback.documentCode,
        description: v4Fallback.description,
        effectiveDate: v4Fallback.effectiveDate,
        effectiveUntil: v4Fallback.effectiveUntil,
        status: "ARCHIVED",
        changeSummary: v4Fallback.changeSummary,
        policyData: v4Fallback.policyData as any,
        createdBy: v4Fallback.createdBy,
        updatedBy: v4Fallback.updatedBy,
        submittedBy: v4Fallback.submittedBy,
        submittedAt: v4Fallback.submittedAt,
        approvedBy: v4Fallback.approvedBy,
        approvedAt: v4Fallback.approvedAt,
        activatedBy: v4Fallback.activatedBy,
        activatedAt: v4Fallback.activatedAt,
        archivedBy: v4Fallback.archivedBy,
        archivedAt: v4Fallback.archivedAt,
      });
    }
  } catch {
    // Offline fallback store already populated
  }
}

export async function seedBaselinePolicy(actorId: string = "system") {
  await ensureBaselinePoliciesSeeded();
  return getPolicyVersionById("5.0");
}

/**
 * Evaluates any SCHEDULED policies whose effectiveDate <= asOfDate and promotes them to ACTIVE,
 * automatically archiving the superseded ACTIVE policy so there is never an overlap.
 */
export async function evaluateScheduledPolicies(asOfDate: Date = new Date()): Promise<void> {
  await ensureBaselinePoliciesSeeded();
  const store = getFallbackPolicyVersions();

  // Check fallback store first
  const scheduledDue = Array.from(store.values())
    .filter(
      (p) =>
        p.status === "SCHEDULED" &&
        p.effectiveDate.getTime() <= asOfDate.getTime() &&
        (!p.effectiveUntil || p.effectiveUntil.getTime() >= asOfDate.getTime())
    )
    .sort((a, b) => a.effectiveDate.getTime() - b.effectiveDate.getTime());

  for (const due of scheduledDue) {
    // Archive any currently ACTIVE policy
    for (const [, existing] of store.entries()) {
      if (existing.status === "ACTIVE" && existing.version !== due.version) {
        existing.status = "ARCHIVED";
        existing.effectiveUntil = new Date(due.effectiveDate.getTime() - 1);
        existing.archivedBy = "system:scheduler";
        existing.archivedAt = asOfDate;
        existing.updatedAt = asOfDate;
      }
    }
    due.status = "ACTIVE";
    due.activatedBy = due.activatedBy || "system:scheduler";
    due.activatedAt = asOfDate;
    due.updatedAt = asOfDate;

    await recordPolicyAuditLog({
      actorId: "system:scheduler",
      action: "AUTO_ACTIVATE_SCHEDULED_POLICY",
      version: due.version,
      previousValue: { status: "SCHEDULED" },
      newValue: { status: "ACTIVE", effectiveDate: due.effectiveDate.toISOString() },
    });
  }

  try {
    await connectToDatabase();
    const dbScheduled = await PolicyVersion.find({
      status: "SCHEDULED",
      effectiveDate: { $lte: asOfDate },
    }).sort({ effectiveDate: 1 });

    for (const dueDoc of dbScheduled) {
      await PolicyVersion.updateMany(
        { status: { $in: ["ACTIVE", "active"] }, version: { $ne: dueDoc.version } },
        {
          $set: {
            status: "ARCHIVED",
            effectiveUntil: new Date(dueDoc.effectiveDate.getTime() - 1),
            archivedBy: "system:scheduler",
            archivedAt: asOfDate,
          },
        }
      );
      dueDoc.status = "ACTIVE";
      dueDoc.activatedAt = asOfDate;
      await dueDoc.save();
    }
  } catch {
    // Handled in fallback store
  }
}

/**
 * Lists all policy versions ordered by version / effectiveDate descending.
 */
export async function listPolicyVersions(asOfDate?: Date): Promise<PolicyVersionRecordDto[]> {
  await evaluateScheduledPolicies(asOfDate || new Date());

  try {
    await connectToDatabase();
    const docs = await PolicyVersion.find({}).sort({ effectiveDate: -1, createdAt: -1 }).lean();
    if (docs.length > 0) {
      // Sync into fallback store as well
      const store = getFallbackPolicyVersions();
      const dtos = docs.map((d) => toDto(d));
      for (const dto of dtos) {
        if (!store.has(dto.version)) {
          store.set(dto.version, {
            id: dto.id,
            version: dto.version,
            policyName: dto.policyName,
            documentCode: dto.documentCode,
            description: dto.description,
            effectiveDate: new Date(dto.effectiveDate),
            effectiveUntil: dto.effectiveUntil ? new Date(dto.effectiveUntil) : null,
            status: dto.status,
            baseVersion: dto.baseVersion,
            changeSummary: dto.changeSummary,
            policyData: dto.policyData,
            sourceDocument: dto.sourceDocument,
            createdBy: dto.createdBy,
            updatedBy: dto.updatedBy,
            submittedBy: dto.submittedBy,
            submittedAt: dto.submittedAt ? new Date(dto.submittedAt) : null,
            approvedBy: dto.approvedBy,
            approvedAt: dto.approvedAt ? new Date(dto.approvedAt) : null,
            activatedBy: dto.activatedBy,
            activatedAt: dto.activatedAt ? new Date(dto.activatedAt) : null,
            archivedBy: dto.archivedBy,
            archivedAt: dto.archivedAt ? new Date(dto.archivedAt) : null,
            createdAt: new Date(dto.createdAt),
            updatedAt: new Date(dto.updatedAt),
          });
        }
      }
      return dtos;
    }
  } catch {
    // Use fallback store
  }

  const all = Array.from(getFallbackPolicyVersions().values()).sort(
    (a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime() || b.version.localeCompare(a.version)
  );
  return all.map((r) => toDto(r));
}

/**
 * Retrieves a single policy version record by version identifier (e.g., "5.0").
 * Throws NotFoundError if the version does not exist.
 */
export async function getPolicyVersionById(version: string): Promise<PolicyVersionRecordDto> {
  await ensureBaselinePoliciesSeeded();
  const cleanVer = version.trim();

  try {
    await connectToDatabase();
    const doc = await PolicyVersion.findOne({ version: cleanVer }).lean();
    if (doc) {
      return toDto(doc);
    }
  } catch {
    // Fallback
  }

  const fallback = getFallbackPolicyVersions().get(cleanVer);
  if (!fallback) {
    throw new NotFoundError(`Policy version '${cleanVer}' does not exist.`);
  }
  return toDto(fallback);
}

/**
 * Retrieves the StructuredPolicyConfig for the decision engine.
 * - If `version` is omitted, returns the currently ACTIVE policy configuration (promoting any due SCHEDULED policy first).
 * - If `version` is provided, validates that the version exists and is eligible for execution (ACTIVE, APPROVED, SCHEDULED, or ARCHIVED for historical replay).
 * - Never silently falls back to arbitrary defaults when an unknown or unapproved version is requested.
 */
export async function getPolicyConfig(
  version?: string,
  options?: { asOfDate?: Date; allowDraft?: boolean }
): Promise<StructuredPolicyConfig> {
  await evaluateScheduledPolicies(options?.asOfDate || new Date());

  if (!version) {
    // Return currently ACTIVE policy
    try {
      await connectToDatabase();
      const activeDoc = await PolicyVersion.findOne({
        status: { $in: ["ACTIVE", "active"] },
      })
        .sort({ effectiveDate: -1 })
        .lean();
      if (activeDoc && activeDoc.policyData) {
        return JSON.parse(JSON.stringify(activeDoc.policyData)) as StructuredPolicyConfig;
      }
    } catch {
      // Fallback
    }

    const activeFallback = Array.from(getFallbackPolicyVersions().values()).find(
      (p) => p.status === "ACTIVE"
    );
    if (activeFallback) {
      return JSON.parse(JSON.stringify(activeFallback.policyData));
    }

    throw new NotFoundError("No active procurement policy version is currently configured.");
  }

  // Specific version requested
  const record = await getPolicyVersionById(version);

  if (
    !options?.allowDraft &&
    (record.status === "DRAFT" || record.status === "PENDING_APPROVAL")
  ) {
    throw new ValidationError(
      `Policy version '${version}' is in '${record.status}' status and has not been approved for batch decision processing.`
    );
  }

  return JSON.parse(JSON.stringify(record.policyData));
}

export interface CreatePolicyDraftInput {
  version: string;
  policyName?: string;
  documentCode?: string;
  description?: string;
  effectiveDate: string;
  effectiveUntil?: string | null;
  baseVersion?: string;
  changeSummary: string;
  policyData: StructuredPolicyConfig;
  sourceDocument?: IPolicySourceDocument | null;
}

/**
 * Creates a new DRAFT policy version.
 * Never overwrites an existing policy version.
 */
export async function createPolicyDraft(
  input: CreatePolicyDraftInput,
  actor: SafeUser
): Promise<PolicyVersionRecordDto> {
  assertPolicyAdmin(actor);
  await ensureBaselinePoliciesSeeded();

  const cleanVersion = input.version.trim();
  if (!cleanVersion) {
    throw new ValidationError("Policy version number is required.");
  }

  if (!input.changeSummary || !input.changeSummary.trim()) {
    throw new ValidationError("Change summary is required when creating a new policy version.");
  }

  // Check if version already exists
  const store = getFallbackPolicyVersions();
  if (store.has(cleanVersion)) {
    throw new ValidationError(
      `Policy version '${cleanVersion}' already exists. Every policy update must use a new version number.`
    );
  }

  try {
    await connectToDatabase();
    const existingDb = await PolicyVersion.findOne({ version: cleanVersion }).lean();
    if (existingDb) {
      throw new ValidationError(
        `Policy version '${cleanVersion}' already exists. Every policy update must use a new version number.`
      );
    }
  } catch (err) {
    if (err instanceof ValidationError) throw err;
  }

  // Validate effectiveUntil >= effectiveDate if provided
  const effFrom = new Date(input.effectiveDate);
  if (Number.isNaN(effFrom.getTime())) {
    throw new ValidationError(`Invalid effective-from date: '${input.effectiveDate}'.`);
  }
  let effUntil: Date | null = null;
  if (input.effectiveUntil) {
    effUntil = new Date(input.effectiveUntil);
    if (Number.isNaN(effUntil.getTime())) {
      throw new ValidationError(`Invalid effective-until date: '${input.effectiveUntil}'.`);
    }
    if (effUntil.getTime() < effFrom.getTime()) {
      throw new ValidationError("Effective-until date cannot be earlier than effective-from date.");
    }
  }

  // Synchronize top-level metadata into policyData and run Zod validation
  const mergedPolicyData: StructuredPolicyConfig = {
    ...input.policyData,
    version: cleanVersion,
    documentName: input.documentCode?.trim() || input.policyData.documentName || "CORVO-PROC-POL-04",
    effectiveDate: effFrom.toISOString().slice(0, 10),
  };

  const validatedPolicyData = validateStructuredPolicyConfig(mergedPolicyData);
  const actorIdentity = actor.email || actor.name || actor.id;
  const now = new Date();

  const fallbackRecord: FallbackPolicyVersionRecord = {
    id: `pol-v${cleanVersion.replace(/[^a-zA-Z0-9]/g, "-")}`,
    version: cleanVersion,
    policyName:
      input.policyName?.trim() || "Corvo Engineering Procurement Policy (PR to PO)",
    documentCode: validatedPolicyData.documentName,
    description:
      input.description?.trim() ||
      "Deterministic PR-to-PO procurement decision rules, contract ceiling governance, preferred supplier scoring, and PO consolidation policy.",
    effectiveDate: effFrom,
    effectiveUntil: effUntil,
    status: "DRAFT",
    baseVersion: input.baseVersion || "5.0",
    changeSummary: input.changeSummary.trim(),
    policyData: validatedPolicyData,
    sourceDocument: input.sourceDocument || null,
    createdBy: actorIdentity,
    updatedBy: actorIdentity,
    createdAt: now,
    updatedAt: now,
  };

  store.set(cleanVersion, fallbackRecord);

  try {
    await connectToDatabase();
    await PolicyVersion.create({
      version: cleanVersion,
      policyName: fallbackRecord.policyName,
      documentCode: fallbackRecord.documentCode,
      description: fallbackRecord.description,
      effectiveDate: effFrom,
      effectiveUntil: effUntil,
      status: "DRAFT",
      baseVersion: fallbackRecord.baseVersion,
      changeSummary: fallbackRecord.changeSummary,
      policyData: validatedPolicyData as any,
      sourceDocument: fallbackRecord.sourceDocument,
      createdBy: actorIdentity,
      updatedBy: actorIdentity,
    });
  } catch {
    // Fallback store already updated
  }

  await recordPolicyAuditLog({
    actorId: actor.id,
    actorEmail: actorIdentity,
    action: "CREATE_POLICY_DRAFT",
    version: cleanVersion,
    previousValue: null,
    newValue: {
      version: cleanVersion,
      status: "DRAFT",
      baseVersion: fallbackRecord.baseVersion,
      effectiveDate: validatedPolicyData.effectiveDate,
      changeSummary: fallbackRecord.changeSummary,
    },
  });

  return toDto(fallbackRecord);
}

export interface UpdatePolicyDraftInput {
  policyName?: string;
  documentCode?: string;
  description?: string;
  effectiveDate?: string;
  effectiveUntil?: string | null;
  changeSummary?: string;
  policyData?: StructuredPolicyConfig;
  sourceDocument?: IPolicySourceDocument | null;
}

/**
 * Updates an existing DRAFT policy version.
 * Throws ValidationError if the policy version is already Pending Approval, Approved, Scheduled, Active, or Archived.
 */
export async function updatePolicyDraft(
  version: string,
  input: UpdatePolicyDraftInput,
  actor: SafeUser
): Promise<PolicyVersionRecordDto> {
  assertPolicyAdmin(actor);
  const existing = await getPolicyVersionById(version);

  if (existing.status !== "DRAFT") {
    throw new ValidationError(
      `Cannot edit policy version '${version}' because its status is '${existing.status}'. Historical and approved versions are immutable—create a new draft version instead.`
    );
  }

  const nextEffectiveDateStr = input.effectiveDate || existing.effectiveDate;
  const effFrom = new Date(nextEffectiveDateStr);
  if (Number.isNaN(effFrom.getTime())) {
    throw new ValidationError(`Invalid effectiveDate: '${nextEffectiveDateStr}'.`);
  }

  let effUntil: Date | null = existing.effectiveUntil ? new Date(existing.effectiveUntil) : null;
  if (input.effectiveUntil !== undefined) {
    effUntil = input.effectiveUntil ? new Date(input.effectiveUntil) : null;
    if (effUntil && effUntil.getTime() < effFrom.getTime()) {
      throw new ValidationError("Effective-until date cannot be earlier than effective-from date.");
    }
  }

  const mergedPolicyData: StructuredPolicyConfig = {
    ...(input.policyData || existing.policyData),
    version: existing.version,
    documentName:
      input.documentCode?.trim() ||
      input.policyData?.documentName ||
      existing.documentCode,
    effectiveDate: effFrom.toISOString().slice(0, 10),
  };

  const validatedPolicyData = validateStructuredPolicyConfig(mergedPolicyData);
  const actorIdentity = actor.email || actor.name || actor.id;
  const now = new Date();

  const store = getFallbackPolicyVersions();
  const currentFallback = store.get(existing.version);
  const updatedRecord: FallbackPolicyVersionRecord = {
    ...(currentFallback || ({} as FallbackPolicyVersionRecord)),
    id: existing.id,
    version: existing.version,
    policyName: input.policyName?.trim() || existing.policyName,
    documentCode: validatedPolicyData.documentName,
    description: input.description?.trim() || existing.description,
    effectiveDate: effFrom,
    effectiveUntil: effUntil,
    status: "DRAFT",
    baseVersion: existing.baseVersion,
    changeSummary: input.changeSummary?.trim() || existing.changeSummary,
    policyData: validatedPolicyData,
    sourceDocument:
      input.sourceDocument !== undefined ? input.sourceDocument : existing.sourceDocument,
    createdBy: existing.createdBy,
    updatedBy: actorIdentity,
    createdAt: new Date(existing.createdAt),
    updatedAt: now,
  };
  store.set(existing.version, updatedRecord);

  try {
    await connectToDatabase();
    await PolicyVersion.findOneAndUpdate(
      { version: existing.version },
      {
        $set: {
          policyName: updatedRecord.policyName,
          documentCode: updatedRecord.documentCode,
          description: updatedRecord.description,
          effectiveDate: effFrom,
          effectiveUntil: effUntil,
          changeSummary: updatedRecord.changeSummary,
          policyData: validatedPolicyData as any,
          sourceDocument: updatedRecord.sourceDocument,
          updatedBy: actorIdentity,
        },
      }
    );
  } catch {
    // Fallback updated
  }

  await recordPolicyAuditLog({
    actorId: actor.id,
    actorEmail: actorIdentity,
    action: "UPDATE_POLICY_DRAFT",
    version: existing.version,
    previousValue: {
      changeSummary: existing.changeSummary,
      effectiveDate: existing.effectiveDate,
    },
    newValue: {
      changeSummary: updatedRecord.changeSummary,
      effectiveDate: validatedPolicyData.effectiveDate,
    },
  });

  return toDto(updatedRecord);
}

/**
 * Transitions a DRAFT policy version to PENDING_APPROVAL.
 */
export async function submitPolicyForApproval(
  version: string,
  actor: SafeUser,
  submissionNotes?: string
): Promise<PolicyVersionRecordDto> {
  assertPolicyAdmin(actor);
  const existing = await getPolicyVersionById(version);

  if (existing.status !== "DRAFT") {
    throw new ValidationError(
      `Only DRAFT policies can be submitted for approval (current status: '${existing.status}').`
    );
  }

  // Re-validate policyData before submission
  validateStructuredPolicyConfig(existing.policyData);

  const actorIdentity = actor.email || actor.name || actor.id;
  const now = new Date();

  const store = getFallbackPolicyVersions();
  const rec = store.get(existing.version);
  if (rec) {
    rec.status = "PENDING_APPROVAL";
    rec.submittedBy = actorIdentity;
    rec.submittedAt = now;
    rec.updatedBy = actorIdentity;
    if (submissionNotes?.trim()) {
      rec.changeSummary = submissionNotes.trim();
    }
    rec.updatedAt = now;
  }

  try {
    await connectToDatabase();
    await PolicyVersion.findOneAndUpdate(
      { version: existing.version },
      {
        $set: {
          status: "PENDING_APPROVAL",
          submittedBy: actorIdentity,
          submittedAt: now,
          updatedBy: actorIdentity,
          ...(submissionNotes?.trim() ? { changeSummary: submissionNotes.trim() } : {}),
        },
      }
    );
  } catch {
    // Fallback updated
  }

  await recordPolicyAuditLog({
    actorId: actor.id,
    actorEmail: actorIdentity,
    action: "SUBMIT_POLICY_FOR_APPROVAL",
    version: existing.version,
    previousValue: { status: "DRAFT" },
    newValue: {
      status: "PENDING_APPROVAL",
      submittedBy: actorIdentity,
      submittedAt: now.toISOString(),
    },
  });

  return getPolicyVersionById(existing.version);
}

/**
 * Approves a PENDING_APPROVAL policy version -> APPROVED.
 * Enforces separation of duties: a user cannot approve a policy version they created or submitted.
 */
export async function approvePolicyVersion(
  version: string,
  actor: SafeUser,
  approvalNotes?: string
): Promise<PolicyVersionRecordDto> {
  assertPolicyAdmin(actor);
  const existing = await getPolicyVersionById(version);

  if (existing.status !== "PENDING_APPROVAL") {
    throw new ValidationError(
      `Policy version '${version}' must be in 'PENDING_APPROVAL' status before approval (current status: '${existing.status}').`
    );
  }

  const actorIdentity = (actor.email || actor.name || actor.id).toLowerCase();
  const creatorIdentity = (existing.createdBy || "").toLowerCase();
  const submitterIdentity = (existing.submittedBy || "").toLowerCase();

  if (actorIdentity === creatorIdentity || actorIdentity === submitterIdentity) {
    throw new ForbiddenError(
      `Separation of duties violation: Administrator '${actor.email || actor.id}' created or submitted policy version '${version}' and cannot self-approve it. A second Procurement Admin must approve.`
    );
  }

  const now = new Date();
  const approverLabel = actor.email || actor.name || actor.id;

  const store = getFallbackPolicyVersions();
  const rec = store.get(existing.version);
  if (rec) {
    rec.status = "APPROVED";
    rec.approvedBy = approverLabel;
    rec.approvedAt = now;
    rec.updatedBy = approverLabel;
    rec.updatedAt = now;
  }

  try {
    await connectToDatabase();
    await PolicyVersion.findOneAndUpdate(
      { version: existing.version },
      {
        $set: {
          status: "APPROVED",
          approvedBy: approverLabel,
          approvedAt: now,
          updatedBy: approverLabel,
        },
      }
    );
  } catch {
    // Fallback updated
  }

  await recordPolicyAuditLog({
    actorId: actor.id,
    actorEmail: approverLabel,
    action: "APPROVE_POLICY_VERSION",
    version: existing.version,
    previousValue: { status: "PENDING_APPROVAL" },
    newValue: {
      status: "APPROVED",
      approvedBy: approverLabel,
      approvedAt: now.toISOString(),
      approvalNotes,
    },
  });

  return getPolicyVersionById(existing.version);
}

/**
 * Activates or schedules an APPROVED policy version:
 * - Rejects unapproved (DRAFT or PENDING_APPROVAL) policies.
 * - If effectiveDate > referenceDate (and !forceImmediate), transitions to SCHEDULED.
 * - Otherwise transitions to ACTIVE and automatically archives any previously ACTIVE policy version
 *   so there are never overlapping active policy versions.
 */
export async function activatePolicyVersion(
  version: string,
  actor: SafeUser,
  options?: { referenceDate?: Date; forceImmediate?: boolean }
): Promise<PolicyVersionRecordDto> {
  assertPolicyAdmin(actor);
  const existing = await getPolicyVersionById(version);

  if (existing.status === "DRAFT" || existing.status === "PENDING_APPROVAL") {
    throw new ValidationError(
      `Cannot activate unapproved policy version '${version}' (status: '${existing.status}'). Policy must be APPROVED first.`
    );
  }

  if (existing.status === "ARCHIVED") {
    throw new ValidationError(
      `Cannot re-activate an ARCHIVED policy version '${version}'. Clone it into a new version instead.`
    );
  }

  const refDate = options?.referenceDate || new Date();
  const effDate = new Date(existing.effectiveDate);
  const actorLabel = actor.email || actor.name || actor.id;
  const store = getFallbackPolicyVersions();

  // Check if effectiveDate is strictly in the future (by day comparison)
  const refDay = new Date(refDate.toISOString().slice(0, 10)).getTime();
  const effDay = new Date(effDate.toISOString().slice(0, 10)).getTime();

  if (effDay > refDay && !options?.forceImmediate) {
    // Schedule for future activation
    const rec = store.get(existing.version);
    if (rec) {
      rec.status = "SCHEDULED";
      rec.activatedBy = actorLabel;
      rec.updatedBy = actorLabel;
      rec.updatedAt = refDate;
    }

    try {
      await connectToDatabase();
      await PolicyVersion.findOneAndUpdate(
        { version: existing.version },
        {
          $set: {
            status: "SCHEDULED",
            activatedBy: actorLabel,
            updatedBy: actorLabel,
          },
        }
      );
    } catch {
      // Fallback updated
    }

    await recordPolicyAuditLog({
      actorId: actor.id,
      actorEmail: actorLabel,
      action: "SCHEDULE_POLICY_VERSION",
      version: existing.version,
      previousValue: { status: existing.status },
      newValue: {
        status: "SCHEDULED",
        effectiveDate: existing.effectiveDate,
      },
    });

    return getPolicyVersionById(existing.version);
  }

  // Immediate activation: archive any currently ACTIVE policy version to prevent overlap
  const archivedVersions: string[] = [];
  for (const [, other] of store.entries()) {
    if (other.status === "ACTIVE" && other.version !== existing.version) {
      other.status = "ARCHIVED";
      other.effectiveUntil = new Date(Math.min(effDate.getTime(), refDate.getTime()));
      other.archivedBy = actorLabel;
      other.archivedAt = refDate;
      other.updatedAt = refDate;
      archivedVersions.push(other.version);
    }
  }

  const targetRec = store.get(existing.version);
  if (targetRec) {
    targetRec.status = "ACTIVE";
    targetRec.activatedBy = actorLabel;
    targetRec.activatedAt = refDate;
    targetRec.updatedBy = actorLabel;
    targetRec.updatedAt = refDate;
  }

  try {
    await connectToDatabase();
    await PolicyVersion.updateMany(
      { status: { $in: ["ACTIVE", "active"] }, version: { $ne: existing.version } },
      {
        $set: {
          status: "ARCHIVED",
          effectiveUntil: refDate,
          archivedBy: actorLabel,
          archivedAt: refDate,
        },
      }
    );
    await PolicyVersion.findOneAndUpdate(
      { version: existing.version },
      {
        $set: {
          status: "ACTIVE",
          activatedBy: actorLabel,
          activatedAt: refDate,
          updatedBy: actorLabel,
        },
      }
    );
  } catch {
    // Fallback updated
  }

  await recordPolicyAuditLog({
    actorId: actor.id,
    actorEmail: actorLabel,
    action: "ACTIVATE_POLICY_VERSION",
    version: existing.version,
    previousValue: { status: existing.status, supersededActiveVersions: archivedVersions },
    newValue: {
      status: "ACTIVE",
      activatedBy: actorLabel,
      activatedAt: refDate.toISOString(),
    },
  });

  return getPolicyVersionById(existing.version);
}

/**
 * Archives a policy version.
 */
export async function archivePolicyVersion(
  version: string,
  actor: SafeUser,
  reason?: string
): Promise<PolicyVersionRecordDto> {
  assertPolicyAdmin(actor);
  const existing = await getPolicyVersionById(version);

  if (existing.status === "ARCHIVED") {
    return existing;
  }

  const store = getFallbackPolicyVersions();
  if (existing.status === "ACTIVE") {
    const otherActive = Array.from(store.values()).find(
      (p) => p.status === "ACTIVE" && p.version !== existing.version
    );
    if (!otherActive) {
      throw new ValidationError(
        `Cannot archive the sole ACTIVE policy version ('${version}'). Activate replacement policy version first.`
      );
    }
  }

  const now = new Date();
  const actorLabel = actor.email || actor.name || actor.id;
  const rec = store.get(existing.version);
  if (rec) {
    rec.status = "ARCHIVED";
    rec.effectiveUntil = now;
    rec.archivedBy = actorLabel;
    rec.archivedAt = now;
    rec.updatedBy = actorLabel;
    rec.updatedAt = now;
  }

  try {
    await connectToDatabase();
    await PolicyVersion.findOneAndUpdate(
      { version: existing.version },
      {
        $set: {
          status: "ARCHIVED",
          effectiveUntil: now,
          archivedBy: actorLabel,
          archivedAt: now,
          updatedBy: actorLabel,
        },
      }
    );
  } catch {
    // Fallback updated
  }

  await recordPolicyAuditLog({
    actorId: actor.id,
    actorEmail: actorLabel,
    action: "ARCHIVE_POLICY_VERSION",
    version: existing.version,
    previousValue: { status: existing.status },
    newValue: {
      status: "ARCHIVED",
      archivedBy: actorLabel,
      archivedAt: now.toISOString(),
      reason,
    },
  });

  return getPolicyVersionById(existing.version);
}

/**
 * Compares any two registered policy versions side-by-side.
 */
export async function compareRegisteredPolicyVersions(
  baseVersion: string,
  targetVersion: string
): Promise<PolicyComparisonResult> {
  const baseDto = await getPolicyVersionById(baseVersion);
  const targetDto = await getPolicyVersionById(targetVersion);
  return comparePolicyConfigs(baseDto.policyData, targetDto.policyData);
}

/**
 * Lists audit log entries for PolicyVersion lifecycle operations.
 */
export async function listPolicyAuditLogs(version?: string): Promise<FallbackAuditLogRecord[]> {
  await ensureBaselinePoliciesSeeded();
  try {
    await connectToDatabase();
    const query: Record<string, unknown> = { entityType: "PolicyVersion" };
    if (version) query.entityId = version;
    const docs = await AuditLog.find(query).sort({ timestamp: -1 }).limit(100).lean();
    if (docs.length > 0) {
      return docs.map((d) => ({
        id: d._id.toString(),
        actorId: d.actorId,
        actorEmail: d.actorEmail,
        action: d.action,
        entityType: d.entityType,
        entityId: d.entityId,
        previousValue: d.previousValue,
        newValue: d.newValue,
        metadata: d.metadata,
        timestamp: d.timestamp,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      }));
    }
  } catch {
    // Fallback
  }

  const all = getFallbackAuditLogs();
  if (version) {
    return all.filter((a) => a.entityId === version);
  }
  return all;
}

/**
 * Legacy helper preserved for backward compatibility
 */
export async function createPolicyVersion(
  config: StructuredPolicyConfig,
  actorId: string = "admin@cantill.ai"
) {
  await ensureBaselinePoliciesSeeded();
  const actor: SafeUser = {
    id: actorId,
    name: actorId,
    email: actorId,
    role: "PROCUREMENT_ADMIN",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return createPolicyDraft(
    {
      version: config.version,
      documentCode: config.documentName,
      effectiveDate: config.effectiveDate,
      changeSummary: `Created policy version ${config.version}`,
      policyData: config,
    },
    actor
  );
}
