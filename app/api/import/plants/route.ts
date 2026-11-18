import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guard";
import { importPlants } from "@/services/importService";
import { apiSuccess, apiBadRequest, apiError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const admin = await requireRole(["PROCUREMENT_ADMIN"]);

    let csvContent = "";
    let filename = "plants.csv";

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) return apiBadRequest("No file uploaded");
      if (!file.name.endsWith(".csv")) return apiBadRequest("Only CSV files allowed");
      filename = file.name;
      csvContent = await file.text();
    } else {
      const body = await req.json();
      csvContent = body.csv;
      if (body.filename) filename = body.filename;
    }

    if (!csvContent) return apiBadRequest("Missing CSV content");

    const report = await importPlants(csvContent, filename, admin.email);
    return apiSuccess(report);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    return apiError(err instanceof Error ? err.message : "Import failed", 500);
  }
}
