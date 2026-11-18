import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guard";
import {
  getWorkspaceSettings,
  updateWorkspaceSettings,
} from "@/services/settingsService";
import { apiSuccess, apiError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  try {
    const user = await requireAuth();
    const settings = await getWorkspaceSettings(user);
    return apiSuccess(settings);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    return apiError("Failed to load workspace settings", 500);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const updated = await updateWorkspaceSettings(body, user);
    return apiSuccess(updated);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    return apiError("Failed to update workspace settings", 500);
  }
}
