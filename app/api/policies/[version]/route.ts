import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guard";
import { authenticateUserCredentials } from "@/lib/auth/bootstrap";
import {
  getPolicyVersionById,
  listPolicyAuditLogs,
  updatePolicyDraft,
  submitPolicyForApproval,
  approvePolicyVersion,
  activatePolicyVersion,
  archivePolicyVersion,
} from "@/services/decision-engine/policy-config/policyService";
import { apiSuccess, apiError } from "@/lib/api-response";
import { AppError, ForbiddenError, ValidationError } from "@/lib/errors";
import { SafeUser } from "@/types/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ version: string }> }
) {
  try {
    await requireRole(["BUYER", "PROCUREMENT_ADMIN"]);
    const { version } = await context.params;
    const decodedVersion = decodeURIComponent(version);

    const [policy, auditLogs] = await Promise.all([
      getPolicyVersionById(decodedVersion),
      listPolicyAuditLogs(decodedVersion),
    ]);

    return apiSuccess({
      policy,
      auditLogs,
    });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    console.error("GET /api/policies/[version] error:", err);
    return apiError("Failed to retrieve policy version", 500);
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ version: string }> }
) {
  try {
    const user = await requireRole(["PROCUREMENT_ADMIN"]);
    const { version } = await context.params;
    const decodedVersion = decodeURIComponent(version);
    const body = await req.json();

    const action = String(body.action || "UPDATE_DRAFT").toUpperCase();

    if (action === "UPDATE_DRAFT") {
      const updated = await updatePolicyDraft(
        decodedVersion,
        {
          policyName: body.policyName,
          documentCode: body.documentCode,
          description: body.description,
          effectiveDate: body.effectiveDate,
          effectiveUntil: body.effectiveUntil,
          changeSummary: body.changeSummary,
          policyData: body.policyData,
          sourceDocument: body.sourceDocument,
        },
        user
      );
      return apiSuccess(updated);
    }

    if (action === "SUBMIT") {
      const submitted = await submitPolicyForApproval(
        decodedVersion,
        user,
        body.comment || body.changeSummary
      );
      return apiSuccess(submitted);
    }

    if (action === "APPROVE") {
      let approvingActor: SafeUser = user;

      // Support secondary admin sign-off credentials in UI when separation-of-duties requires a second admin
      if (body.secondaryApproverEmail && body.secondaryApproverPassword) {
        const verified = await authenticateUserCredentials(
          String(body.secondaryApproverEmail),
          String(body.secondaryApproverPassword)
        );
        if (!verified) {
          throw new ForbiddenError("Invalid secondary approver credentials.");
        }
        if (verified.role !== "PROCUREMENT_ADMIN") {
          throw new ForbiddenError("Secondary approver must have the PROCUREMENT_ADMIN role.");
        }
        approvingActor = {
          ...verified,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }

      const approved = await approvePolicyVersion(
        decodedVersion,
        approvingActor,
        body.comment
      );
      return apiSuccess(approved);
    }

    if (action === "ACTIVATE") {
      const activated = await activatePolicyVersion(decodedVersion, user, {
        forceImmediate: Boolean(body.forceImmediate),
      });
      return apiSuccess(activated);
    }

    if (action === "ARCHIVE") {
      const archived = await archivePolicyVersion(decodedVersion, user, body.reason);
      return apiSuccess(archived);
    }

    throw new ValidationError(`Unsupported policy workflow action: '${action}'.`);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    console.error("PATCH /api/policies/[version] error:", err);
    return apiError(
      err instanceof Error ? err.message : "Failed to update policy version",
      500
    );
  }
}
