import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guard";
import { listImportHistory, bootstrapAllTaskKitData } from "@/services/importService";
import { apiSuccess, apiError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  try {
    await requireRole(["PROCUREMENT_ADMIN"]);
    const history = await listImportHistory(50);
    return apiSuccess(history);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    return apiError("Failed to fetch import history", 500);
  }
}

export async function POST(_req: NextRequest) {
  try {
    const admin = await requireRole(["PROCUREMENT_ADMIN"]);
    const reports = await bootstrapAllTaskKitData(admin.email);
    return apiSuccess({
      message: "Task Kit dataset imported successfully",
      reports,
    });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    return apiError(err instanceof Error ? err.message : "Bootstrap import failed", 500);
  }
}
