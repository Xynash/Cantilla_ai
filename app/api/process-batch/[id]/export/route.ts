import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/guard";
import { getBatchProcessingRunById } from "@/services/decision-engine/batch-processor/batchHistoryService";
import { apiError } from "@/lib/api-response";
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

    return new NextResponse(run.csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="decisions_${run.runId}.csv"`,
      },
    });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    console.error("GET /api/process-batch/[id]/export error:", err);
    return apiError("Failed to export batch processing CSV", 500);
  }
}
