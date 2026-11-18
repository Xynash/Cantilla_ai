import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guard";
import {
  getNotificationsForUser,
  markNotificationsAsRead,
} from "@/services/notificationService";
import { apiSuccess, apiError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  try {
    const user = await requireAuth();
    const result = await getNotificationsForUser(user);
    return apiSuccess(result);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    return apiError("Failed to fetch notifications", 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json().catch(() => ({}));
    const result = await markNotificationsAsRead(user, {
      notificationId: body.notificationId,
      markAll: Boolean(body.markAll),
    });
    return apiSuccess(result);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    return apiError("Failed to update notifications", 500);
  }
}
