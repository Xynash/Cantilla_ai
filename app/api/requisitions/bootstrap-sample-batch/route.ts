import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guard";
import { bootstrapSamplePrBatch } from "@/services/requisitionService";
import { apiSuccess, apiError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const user = await requireRole(["BUYER", "PROCUREMENT_ADMIN"]);
    const result = await bootstrapSamplePrBatch(user.email || user.name);
    return apiSuccess(result);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    console.error("POST /api/requisitions/bootstrap-sample-batch error:", err);
    return apiError("Failed to bootstrap sample PR batch", 500);
  }
}
