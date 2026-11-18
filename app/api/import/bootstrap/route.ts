import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guard";
import { bootstrapAllTaskKitData } from "@/services/importService";
import { apiSuccess, apiError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  try {
    const admin = await requireRole(["PROCUREMENT_ADMIN"]);
    const reports = await bootstrapAllTaskKitData(admin.email);
    return apiSuccess(reports);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    return apiError(
      err instanceof Error ? err.message : "Failed to bootstrap task kit dataset",
      500
    );
  }
}
