import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guard";
import { getBatchProcessingRunById } from "@/services/decision-engine/batch-processor/batchHistoryService";
import { apiSuccess, apiError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireRole(["BUYER", "PROCUREMENT_ADMIN"]);
    const { id } = await params;
    if (!id || typeof id !== "string" || !/^[A-Za-z0-9._-]+$/.test(id.trim())) {
      return apiError("Invalid batch run identifier", 400, "VALIDATION_ERROR");
    }
    const run = await getBatchProcessingRunById(id.trim(), user);
    return apiSuccess(run);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    console.error("GET /api/process-batch/[id] error:", err);
    return apiError("Failed to fetch batch processing run", 500);
  }
}
