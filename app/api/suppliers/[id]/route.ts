import { NextRequest } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guard";
import {
  getSupplierDetailIntelligence,
  updateSupplierStatusWithAudit,
} from "@/services/decision-engine/preferred-suppliers/supplierIntelligenceService";
import { apiSuccess, apiError } from "@/lib/api-response";
import { AppError, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UpdateStatusSchema = z.object({
  status: z.enum(["Active", "Inactive", "Blocked"]),
  reason: z.string().trim().min(3, "A written audit reason (min 3 characters) is required."),
});

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(["BUYER", "PROCUREMENT_ADMIN"]);
    const { id } = await context.params;
    const asOfDateStr = req.nextUrl.searchParams.get("asOfDate");
    const asOfDate = asOfDateStr ? new Date(asOfDateStr) : undefined;

    if (asOfDate && Number.isNaN(asOfDate.getTime())) {
      throw new ValidationError(`Invalid asOfDate format: '${asOfDateStr}'`);
    }

    const detail = await getSupplierDetailIntelligence(decodeURIComponent(id), asOfDate);
    return apiSuccess(detail);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    console.error("GET /api/suppliers/[id] error:", err);
    return apiError("Failed to retrieve supplier intelligence details", 500);
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(["PROCUREMENT_ADMIN"]);
    const { id } = await context.params;
    const body = await req.json();

    const parsed = UpdateStatusSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      throw new ValidationError(msg);
    }

    const updated = await updateSupplierStatusWithAudit({
      supplierId: decodeURIComponent(id),
      newStatus: parsed.data.status,
      reason: parsed.data.reason,
      actor: user,
    });

    return apiSuccess(updated);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    console.error("PATCH /api/suppliers/[id] error:", err);
    return apiError("Failed to update supplier status", 500);
  }
}
