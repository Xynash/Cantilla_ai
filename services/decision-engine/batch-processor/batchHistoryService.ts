import crypto from "crypto";
import { connectToDatabase } from "@/lib/db";
import { getFallbackBatchRuns, FallbackBatchRunRecord } from "@/lib/db/fallbackStore";
import { BatchProcessingRun } from "@/models/BatchProcessingRun";
import { AuditLog } from "@/models/AuditLog";
import { BatchProcessingResult } from "../types/engine";
import { getPolicyConfig } from "../policy-config/policyService";
import { loadMasterDataContext } from "../utils/masterDataLoader";
import { parseRawPrBatchCsv, processPrBatch } from "./batchProcessor";
import { SafeUser } from "@/types/auth";
import { ForbiddenError, NotFoundError } from "@/lib/errors";

export interface ExecuteBatchParams {
  csvContent: string;
  batchName?: string;
  policyVersion?: string;
  user: SafeUser;
}

export interface BatchRunSummary {
  id: string;
  runId: string;
  batchName: string;
  contentHash: string;
  policyVersion: string;
  status: "COMPLETED" | "FAILED";
  totalPrLines: number;
  totalRequirements: number;
  totalPOs: number;
  totalSourcingRequests: number;
  totalNotProcessed: number;
  processedBy: string;
  createdAt: string;
}

/**
 * Ensures only authorized procurement roles (BUYER, PROCUREMENT_ADMIN) can execute or view batch runs.
 */
export function assertAuthorizedProcurementUser(user: SafeUser | null | undefined): void {
  if (!user) {
    throw new ForbiddenError("Authentication required to access batch processing.");
  }
  if (user.role !== "BUYER" && user.role !== "PROCUREMENT_ADMIN") {
    throw new ForbiddenError(
      `Role '${user.role}' is not authorized for procurement batch processing or decision history.`
    );
  }
}

/**
 * Computes a deterministic SHA-256 content hash for idempotency per (CSV content + policyVersion).
 */
export function computeBatchContentHash(csvContent: string, policyVersion: string): string {
  const normalizedCsv = csvContent.replace(/\r\n/g, "\n").trim();
  return crypto
    .createHash("sha256")
    .update(`${policyVersion}::${normalizedCsv}`, "utf8")
    .digest("hex");
}

/**
 * Validates, processes, and idempotently persists a PR batch run.
 * Prevents duplicate processing when the same batch is submitted again under the same policy version.
 */
export async function executeAndPersistBatch(
  params: ExecuteBatchParams
): Promise<BatchProcessingResult> {
  const { csvContent, batchName = "sample_pr_batch.csv", policyVersion, user } = params;

  // 1. Authorization check
  assertAuthorizedProcurementUser(user);

  // 2. Validate CSV structure and mandatory fields up front (throws ValidationError before any writes)
  const rawLines = parseRawPrBatchCsv(csvContent);

  // 3. Load target policy configuration
  const policy = await getPolicyConfig(policyVersion);
  const contentHash = computeBatchContentHash(csvContent, policy.version);
  const runId = `RUN-V${policy.version.replace(/[^A-Za-z0-9]/g, "_")}-${contentHash
    .slice(0, 10)
    .toUpperCase()}`;

  // 4. Idempotency check: return existing run if already processed for this (contentHash, policyVersion)
  try {
    await connectToDatabase();
    const existingDbRun = await BatchProcessingRun.findOne({
      contentHash,
      policyVersion: policy.version,
    }).lean();

    if (existingDbRun) {
      return {
        runId: existingDbRun.runId,
        batchName: existingDbRun.batchName,
        contentHash: existingDbRun.contentHash,
        isDuplicateSubmission: true,
        policyVersion: existingDbRun.policyVersion,
        policySnapshot: (existingDbRun as any).policySnapshot || undefined,
        totalPrLines: existingDbRun.totalPrLines,
        totalRequirements: existingDbRun.totalRequirements,
        totalPOs: existingDbRun.totalPOs,
        totalSourcingRequests: existingDbRun.totalSourcingRequests,
        totalNotProcessed: existingDbRun.totalNotProcessed,
        lineOutputs: existingDbRun.lineOutputs,
        requirements: existingDbRun.requirements,
        poGroups: existingDbRun.poGroups,
        csvContent: existingDbRun.csvContent,
        executedAt: existingDbRun.createdAt.toISOString(),
      };
    }
  } catch {
    // Check fallback store when local DB is offline
    const fallbackExisting = Array.from(getFallbackBatchRuns().values()).find(
      (r) => r.contentHash === contentHash && r.policyVersion === policy.version
    );
    if (fallbackExisting) {
      return {
        runId: fallbackExisting.runId,
        batchName: fallbackExisting.batchName,
        contentHash: fallbackExisting.contentHash,
        isDuplicateSubmission: true,
        policyVersion: fallbackExisting.policyVersion,
        policySnapshot: fallbackExisting.policySnapshot,
        totalPrLines: fallbackExisting.totalPrLines,
        totalRequirements: fallbackExisting.totalRequirements,
        totalPOs: fallbackExisting.totalPOs,
        totalSourcingRequests: fallbackExisting.totalSourcingRequests,
        totalNotProcessed: fallbackExisting.totalNotProcessed,
        lineOutputs: fallbackExisting.lineOutputs,
        requirements: fallbackExisting.requirements,
        poGroups: fallbackExisting.poGroups,
        csvContent: fallbackExisting.csvContent,
        executedAt: fallbackExisting.createdAt.toISOString(),
      };
    }
  }

  // 5. Load master data context and run deterministic decision + PO consolidation pipeline
  const masterData = await loadMasterDataContext();
  const policySnapshot = JSON.parse(JSON.stringify(policy));
  const result = processPrBatch(rawLines, masterData, policySnapshot);

  const now = new Date();
  const processedBy = user.email || user.name || user.id;

  // 6. Persist run record in MongoDB (and fallback store if offline)
  try {
    await connectToDatabase();
    await BatchProcessingRun.create({
      runId,
      batchName,
      contentHash,
      policyVersion: policy.version,
      policySnapshot,
      status: "COMPLETED",
      totalPrLines: result.totalPrLines,
      totalRequirements: result.totalRequirements,
      totalPOs: result.totalPOs,
      totalSourcingRequests: result.totalSourcingRequests,
      totalNotProcessed: result.totalNotProcessed || 0,
      lineOutputs: result.lineOutputs,
      requirements: result.requirements,
      poGroups: result.poGroups || [],
      csvContent: result.csvContent,
      processedBy,
    });

    await AuditLog.create({
      actorId: processedBy,
      action: "PROCESS_PR_BATCH",
      entityType: "BatchProcessingRun",
      entityId: runId,
      newValue: {
        batchName,
        policyVersion: policy.version,
        totalPrLines: result.totalPrLines,
        totalRequirements: result.totalRequirements,
        totalPOs: result.totalPOs,
        totalSourcingRequests: result.totalSourcingRequests,
        totalNotProcessed: result.totalNotProcessed || 0,
      },
      timestamp: now,
    });
  } catch {
    // Save in fallback runtime store when local MongoDB is unreachable
    const record: FallbackBatchRunRecord = {
      id: runId,
      runId,
      batchName,
      contentHash,
      policyVersion: policy.version,
      policySnapshot,
      status: "COMPLETED",
      totalPrLines: result.totalPrLines,
      totalRequirements: result.totalRequirements,
      totalPOs: result.totalPOs,
      totalSourcingRequests: result.totalSourcingRequests,
      totalNotProcessed: result.totalNotProcessed || 0,
      lineOutputs: result.lineOutputs,
      requirements: result.requirements,
      poGroups: (result.poGroups as any) || [],
      csvContent: result.csvContent,
      processedBy,
      createdAt: now,
      updatedAt: now,
    };
    getFallbackBatchRuns().set(runId, record);
  }

  return {
    ...result,
    runId,
    batchName,
    contentHash,
    policySnapshot,
    isDuplicateSubmission: false,
    executedAt: now.toISOString(),
  };
}

/**
 * Lists previous batch processing runs for authorized procurement users.
 */
export async function listBatchProcessingRuns(user: SafeUser): Promise<BatchRunSummary[]> {
  assertAuthorizedProcurementUser(user);

  try {
    await connectToDatabase();
    const runs = await BatchProcessingRun.find({})
      .select(
        "runId batchName contentHash policyVersion status totalPrLines totalRequirements totalPOs totalSourcingRequests totalNotProcessed processedBy createdAt"
      )
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    if (runs.length > 0) {
      return runs.map((r) => ({
        id: r._id.toString(),
        runId: r.runId,
        batchName: r.batchName,
        contentHash: r.contentHash,
        policyVersion: r.policyVersion,
        status: r.status,
        totalPrLines: r.totalPrLines,
        totalRequirements: r.totalRequirements,
        totalPOs: r.totalPOs,
        totalSourcingRequests: r.totalSourcingRequests,
        totalNotProcessed: r.totalNotProcessed || 0,
        processedBy: r.processedBy,
        createdAt: r.createdAt.toISOString(),
      }));
    }
  } catch {
    // Fallback to in-memory store
  }

  const fallbackList = Array.from(getFallbackBatchRuns().values()).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );

  return fallbackList.map((r) => ({
    id: r.id,
    runId: r.runId,
    batchName: r.batchName,
    contentHash: r.contentHash,
    policyVersion: r.policyVersion,
    status: r.status,
    totalPrLines: r.totalPrLines,
    totalRequirements: r.totalRequirements,
    totalPOs: r.totalPOs,
    totalSourcingRequests: r.totalSourcingRequests,
    totalNotProcessed: r.totalNotProcessed,
    processedBy: r.processedBy,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Retrieves a specific batch processing run by runId for authorized procurement users.
 */
export async function getBatchProcessingRunById(
  runId: string,
  user: SafeUser
): Promise<BatchProcessingResult> {
  assertAuthorizedProcurementUser(user);

  try {
    await connectToDatabase();
    const run = await BatchProcessingRun.findOne({ runId }).lean();
    if (run) {
      return {
        runId: run.runId,
        batchName: run.batchName,
        contentHash: run.contentHash,
        policyVersion: run.policyVersion,
        policySnapshot: (run as any).policySnapshot || undefined,
        totalPrLines: run.totalPrLines,
        totalRequirements: run.totalRequirements,
        totalPOs: run.totalPOs,
        totalSourcingRequests: run.totalSourcingRequests,
        totalNotProcessed: run.totalNotProcessed,
        lineOutputs: run.lineOutputs,
        requirements: run.requirements,
        poGroups: run.poGroups,
        csvContent: run.csvContent,
        executedAt: run.createdAt.toISOString(),
      };
    }
  } catch {
    // Check fallback store
  }

  const fallback = getFallbackBatchRuns().get(runId);
  if (!fallback) {
    throw new NotFoundError(`Batch processing run '${runId}' not found.`);
  }

  return {
    runId: fallback.runId,
    batchName: fallback.batchName,
    contentHash: fallback.contentHash,
    policyVersion: fallback.policyVersion,
    policySnapshot: fallback.policySnapshot,
    totalPrLines: fallback.totalPrLines,
    totalRequirements: fallback.totalRequirements,
    totalPOs: fallback.totalPOs,
    totalSourcingRequests: fallback.totalSourcingRequests,
    totalNotProcessed: fallback.totalNotProcessed,
    lineOutputs: fallback.lineOutputs,
    requirements: fallback.requirements,
    poGroups: fallback.poGroups,
    csvContent: fallback.csvContent,
    executedAt: fallback.createdAt.toISOString(),
  };
}
