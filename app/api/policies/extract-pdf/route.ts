import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { requireRole } from "@/lib/auth/guard";
import { storeAndExtractPolicyPdf } from "@/services/decision-engine/policy-config/pdfPolicyExtractor";
import { recordPolicyAuditLog } from "@/services/decision-engine/policy-config/policyService";
import { apiSuccess, apiError } from "@/lib/api-response";
import { AppError, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(["PROCUREMENT_ADMIN"]);
    const actorEmail = user.email || user.name || user.id;
    const contentType = req.headers.get("content-type") || "";

    let fileName = "Corvo_Procurement_Policy.pdf";
    let mimeType = "application/pdf";
    let buffer: Buffer | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file");
      if (!file || !(file instanceof File)) {
        throw new ValidationError("No PDF file provided in form field 'file'.");
      }
      fileName = file.name || "policy_upload.pdf";
      mimeType = file.type || "application/pdf";
      const arrayBuf = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuf);
    } else {
      const body = await req.json().catch(() => ({}));
      if (body.useSuppliedPolicyPdf) {
        const kitPath = path.join(
          process.cwd(),
          "data",
          "Cantill_FullStack_Task_Kit",
          "Corvo_Procurement_Policy.pdf"
        );
        if (!fs.existsSync(kitPath)) {
          throw new ValidationError(
            "Supplied Corvo_Procurement_Policy.pdf not found in task kit directory."
          );
        }
        buffer = fs.readFileSync(kitPath);
        fileName = "Corvo_Procurement_Policy.pdf";
        mimeType = "application/pdf";
      } else if (body.base64Pdf && typeof body.base64Pdf === "string") {
        fileName = String(body.fileName || "uploaded_policy.pdf");
        mimeType = String(body.mimeType || "application/pdf");
        buffer = Buffer.from(body.base64Pdf, "base64");
      } else {
        throw new ValidationError(
          "Provide a PDF file via multipart/form-data or set { useSuppliedPolicyPdf: true }."
        );
      }
    }

    const extraction = storeAndExtractPolicyPdf({
      fileName,
      mimeType,
      buffer: buffer!,
      uploadedBy: actorEmail,
    });

    await recordPolicyAuditLog({
      actorId: user.id,
      actorEmail,
      action: "EXTRACT_POLICY_PDF",
      version: extraction.detectedMetadata.version,
      previousValue: null,
      newValue: {
        fileName: extraction.fileName,
        fileSize: extraction.fileSize,
        sha256: extraction.sha256,
        detectedVersion: extraction.detectedMetadata.version,
        extractedClausesCount: extraction.extractedClauses.length,
      },
    });

    return apiSuccess(extraction);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    console.error("POST /api/policies/extract-pdf error:", err);
    return apiError(
      err instanceof Error ? err.message : "Failed to extract policy PDF",
      500
    );
  }
}
