import { NextRequest } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guard";
import { getSupplierIntelligenceOverview } from "@/services/decision-engine/preferred-suppliers/supplierIntelligenceService";
import { apiSuccess, apiError } from "@/lib/api-response";
import { AppError, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  asOfDate: z.string().optional(),
  policyVersion: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    await requireRole(["BUYER", "PROCUREMENT_ADMIN"]);
    const rawParams = {
      asOfDate: req.nextUrl.searchParams.get("asOfDate") || undefined,
      policyVersion: req.nextUrl.searchParams.get("policyVersion") || undefined,
    };

    const parsed = QuerySchema.safeParse(rawParams);
    if (!parsed.success) {
      throw new ValidationError("Invalid query parameters for supplier intelligence overview.");
    }

    const asOfDate = parsed.data.asOfDate ? new Date(parsed.data.asOfDate) : undefined;
    if (asOfDate && Number.isNaN(asOfDate.getTime())) {
      throw new ValidationError(`Invalid asOfDate parameter: '${parsed.data.asOfDate}'.`);
    }

    const overview = await getSupplierIntelligenceOverview({
      asOfDate,
      policyVersion: parsed.data.policyVersion,
    });

    return apiSuccess(overview);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    console.error("GET /api/suppliers/intelligence error:", err);
    return apiError("Failed to load supplier intelligence overview", 500);
  }
}
