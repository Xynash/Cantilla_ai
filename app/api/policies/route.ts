import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guard";
import {
  listPolicyVersions,
  listPolicyAuditLogs,
  createPolicyDraft,
} from "@/services/decision-engine/policy-config/policyService";
import { apiSuccess, apiError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole(["BUYER", "PROCUREMENT_ADMIN"]);
    const [versions, auditLogs] = await Promise.all([
      listPolicyVersions(),
      listPolicyAuditLogs(),
    ]);
    const activePolicy = versions.find((v) => v.status === "ACTIVE") || versions[0] || null;

    return apiSuccess({
      activePolicy,
      versions,
      auditLogs,
    });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    console.error("GET /api/policies error:", err);
    return apiError("Failed to fetch procurement policies", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(["PROCUREMENT_ADMIN"]);
    const body = await req.json();

    const created = await createPolicyDraft(
      {
        version: String(body.version || ""),
        policyName: body.policyName,
        documentCode: body.documentCode,
        description: body.description,
        effectiveDate: String(body.effectiveDate || ""),
        effectiveUntil: body.effectiveUntil || null,
        baseVersion: body.baseVersion,
        changeSummary: String(body.changeSummary || ""),
        policyData: body.policyData,
        sourceDocument: body.sourceDocument || null,
      },
      user
    );

    return apiSuccess(created, undefined, 201);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    console.error("POST /api/policies error:", err);
    return apiError(
      err instanceof Error ? err.message : "Failed to create policy version",
      500
    );
  }
}
