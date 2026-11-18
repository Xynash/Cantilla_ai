import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guard";
import { importSamplePrBatch } from "@/services/requisitionService";
import { apiSuccess, apiError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(["BUYER", "PROCUREMENT_ADMIN"]);

    const contentType = req.headers.get("content-type") || "";
    let csvContent = "";
    let filename = "sample_pr_batch.csv";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return apiError("No file uploaded in form data", 400);
      }
      filename = file.name;
      csvContent = await file.text();
    } else {
      const body = await req.json();
      csvContent = body.csvContent || body.content || "";
      if (body.filename) filename = body.filename;
    }

    if (!csvContent || !csvContent.trim()) {
      return apiError("CSV content cannot be empty", 400);
    }

    const result = await importSamplePrBatch(csvContent, filename, user.email || user.name);
    return apiSuccess(result);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    console.error("POST /api/requisitions/batch-import error:", err);
    return apiError("Failed to import PR batch CSV", 500);
  }
}
