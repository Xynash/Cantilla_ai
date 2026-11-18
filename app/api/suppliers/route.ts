import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guard";
import { listSuppliers } from "@/services/supplierService";
import { apiSuccess, apiError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireRole(["BUYER", "PROCUREMENT_ADMIN"]);

    const { searchParams } = req.nextUrl;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const search = searchParams.get("search") || undefined;
    const status = searchParams.get("status") || undefined;
    const city = searchParams.get("city") || undefined;

    const result = await listSuppliers({ page, limit, search, status, city });
    return apiSuccess(result.items, {
      ...result.meta,
      cities: result.cities,
    } as any);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    return apiError("Failed to fetch suppliers", 500);
  }
}
