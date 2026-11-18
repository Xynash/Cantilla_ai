import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/guard";
import {
  generateProcurementReport,
  ReportType,
  VALID_REPORT_TYPES,
} from "@/services/reportService";
import { apiSuccess, apiError } from "@/lib/api-response";
import { AppError, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(["BUYER", "PROCUREMENT_ADMIN"]);

    const { searchParams } = req.nextUrl;
    const rawType = (searchParams.get("reportType") ||
      "PROCUREMENT_SUMMARY") as ReportType;
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    const format = searchParams.get("format") || "json";

    if (!VALID_REPORT_TYPES.includes(rawType)) {
      throw new ValidationError(
        `Invalid reportType '${rawType}'. Valid types: ${VALID_REPORT_TYPES.join(", ")}`
      );
    }

    const report = await generateProcurementReport({
      reportType: rawType,
      startDate,
      endDate,
      user,
    });

    if (format === "csv") {
      return new NextResponse(report.csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${report.reportType.toLowerCase()}_${report.generatedAt.slice(0, 10)}.csv"`,
        },
      });
    }

    return apiSuccess(report);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    console.error("GET /api/reports error:", err);
    return apiError("Failed to generate procurement report", 500);
  }
}
