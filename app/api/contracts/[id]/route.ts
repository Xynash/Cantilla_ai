import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guard";
import { getContractDetails } from "@/services/contractService";
import { apiSuccess, apiNotFound, apiError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(["BUYER", "PROCUREMENT_ADMIN"]);
    const { id } = await context.params;
    const contract = await getContractDetails(id);

    if (!contract) {
      return apiNotFound(`Contract '${id}' not found`);
    }

    return apiSuccess(contract);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    return apiError("Failed to fetch contract details", 500);
  }
}
