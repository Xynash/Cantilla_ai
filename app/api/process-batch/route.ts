import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { requireRole } from "@/lib/auth/guard";
import {
  executeAndPersistBatch,
  listBatchProcessingRuns,
} from "@/services/decision-engine/batch-processor/batchHistoryService";
import { apiSuccess, apiError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireRole(["BUYER", "PROCUREMENT_ADMIN"]);
    const runs = await listBatchProcessingRuns(user);
    return apiSuccess(runs);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    console.error("GET /api/process-batch error:", err);
    return apiError("Failed to fetch batch processing history", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(["BUYER", "PROCUREMENT_ADMIN"]);

    const contentType = req.headers.get("content-type") || "";
    const queryPolicyVersion = req.nextUrl.searchParams.get("policyVersion") || undefined;
    const outputFormat = req.nextUrl.searchParams.get("format") || "";

    let csvContent = "";
    let batchName = "sample_pr_batch.csv";
    let policyVersion = queryPolicyVersion;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const formPolicy = formData.get("policyVersion") as string | null;
      if (formPolicy) policyVersion = formPolicy.trim();

      if (!file) {
        return apiError("No CSV file uploaded in multipart form data", 400, "VALIDATION_ERROR");
      }
      batchName = file.name || "uploaded_pr_batch.csv";
      csvContent = await file.text();
    } else if (contentType.includes("text/csv") || contentType.includes("text/plain")) {
      csvContent = await req.text();
      batchName = req.nextUrl.searchParams.get("batchName") || "raw_pr_batch.csv";
    } else {
      const body = await req.json().catch(() => ({}));
      if (body.policyVersion) policyVersion = String(body.policyVersion).trim();
      if (body.batchName) batchName = String(body.batchName).trim();

      if (body.useSampleBatch) {
        const samplePath = path.join(
          process.cwd(),
          "data",
          "Cantill_FullStack_Task_Kit",
          "pr_batches",
          "sample_pr_batch.csv"
        );
        if (!fs.existsSync(samplePath)) {
          return apiError("Bundled sample_pr_batch.csv not found", 404, "NOT_FOUND");
        }
        csvContent = fs.readFileSync(samplePath, "utf-8");
        batchName = "sample_pr_batch.csv";
      } else {
        csvContent = body.csvContent || body.content || "";
      }
    }

    const result = await executeAndPersistBatch({
      csvContent,
      batchName,
      policyVersion,
      user,
    });

    if (outputFormat.toLowerCase() === "csv") {
      return new NextResponse(result.csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="decisions_${result.runId || "batch"}.csv"`,
        },
      });
    }

    return apiSuccess(result);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    console.error("POST /api/process-batch error:", err);
    return apiError(
      err instanceof Error ? err.message : "Failed to process PR batch",
      500
    );
  }
}
