import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guard";
import { compareRegisteredPolicyVersions } from "@/services/decision-engine/policy-config/policyService";
import { apiSuccess, apiError } from "@/lib/api-response";
import { AppError, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireRole(["BUYER", "PROCUREMENT_ADMIN"]);
    const baseVersion = req.nextUrl.searchParams.get("baseVersion")?.trim();
    const targetVersion = req.nextUrl.searchParams.get("targetVersion")?.trim();

    if (!baseVersion || !targetVersion) {
      throw new ValidationError(
        "Both 'baseVersion' and 'targetVersion' query parameters are required."
      );
    }

    const comparison = await compareRegisteredPolicyVersions(baseVersion, targetVersion);
    return apiSuccess(comparison);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    console.error("GET /api/policies/compare error:", err);
    return apiError("Failed to compare policy versions", 500);
  }
}
