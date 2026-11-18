import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guard";
import { listItems } from "@/services/itemService";
import { apiSuccess, apiError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // Authenticated users (REQUESTER, BUYER, PROCUREMENT_ADMIN) can search items
    await requireAuth();

    const { searchParams } = req.nextUrl;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const search = searchParams.get("search") || undefined;
    const category = searchParams.get("category") || undefined;
    const itemType = searchParams.get("itemType") || undefined;

    const result = await listItems({ page, limit, search, category, itemType });
    return apiSuccess(result.items, {
      ...result.meta,
      categories: result.categories,
    } as any);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    return apiError("Failed to fetch items", 500);
  }
}
