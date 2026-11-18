import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guard";
import { listRequisitions } from "@/services/requisitionService";
import { apiSuccess, apiError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();

    const { searchParams } = req.nextUrl;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const search = searchParams.get("search") || undefined;
    const status = searchParams.get("status") || undefined;
    const plantCode = searchParams.get("plantCode") || undefined;

    const result = await listRequisitions({
      page,
      limit,
      search,
      status,
      plantCode,
      user,
    });

    return apiSuccess(result.requisitions, result.meta as any);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    console.error("GET /api/requisitions error:", err);
    return apiError("Failed to fetch requisitions", 500);
  }
}
