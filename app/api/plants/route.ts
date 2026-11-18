import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guard";
import { listPlants } from "@/services/plantService";
import { apiSuccess, apiError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  try {
    await requireAuth();
    const plants = await listPlants();
    return apiSuccess(plants);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    return apiError("Failed to fetch plants", 500);
  }
}
