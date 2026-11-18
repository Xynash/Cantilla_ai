import { NextRequest } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guard";
import { getSupplierRecommendationsForItem } from "@/services/decision-engine/preferred-suppliers/supplierIntelligenceService";
import { apiSuccess, apiError } from "@/lib/api-response";
import { AppError, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RecommendationQuerySchema = z.object({
  itemCode: z.string().trim().min(1, "itemCode is required"),
  plantCode: z.string().trim().optional(),
  routeType: z.enum(["DIRECT_PO", "RFQ", "RFP", "CAPEX"]).optional(),
  asOfDate: z.string().trim().optional(),
  policyVersion: z.string().trim().optional(),
});

export async function GET(req: NextRequest) {
  try {
    await requireRole(["BUYER", "PROCUREMENT_ADMIN"]);

    const raw = {
      itemCode: req.nextUrl.searchParams.get("itemCode") || "",
      plantCode: req.nextUrl.searchParams.get("plantCode") || undefined,
      routeType: (req.nextUrl.searchParams.get("routeType") as any) || undefined,
      asOfDate: req.nextUrl.searchParams.get("asOfDate") || undefined,
      policyVersion: req.nextUrl.searchParams.get("policyVersion") || undefined,
    };

    const parsed = RecommendationQuerySchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      throw new ValidationError(`Invalid recommendation parameters: ${msg}`);
    }

    const asOfDate = parsed.data.asOfDate ? new Date(parsed.data.asOfDate) : undefined;
    if (asOfDate && Number.isNaN(asOfDate.getTime())) {
      throw new ValidationError(`Invalid asOfDate format: '${parsed.data.asOfDate}'`);
    }

    const result = await getSupplierRecommendationsForItem({
      itemCode: parsed.data.itemCode,
      plantCode: parsed.data.plantCode,
      routeType: parsed.data.routeType,
      asOfDate,
      policyVersion: parsed.data.policyVersion,
    });

    return apiSuccess(result);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    console.error("GET /api/suppliers/recommendations error:", err);
    return apiError("Failed to compute supplier recommendations", 500);
  }
}
