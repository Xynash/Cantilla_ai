import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guard";
import { createConversation, listUserConversations } from "@/services/chat-intake/conversationService";
import { apiSuccess, apiError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireAuth();
    const conversations = await listUserConversations(user);
    return apiSuccess(conversations);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    console.error("GET /api/chat/conversations error:", err);
    return apiError("Failed to fetch conversations", 500);
  }
}

export async function POST() {
  try {
    const user = await requireAuth();
    const conv = await createConversation(user);
    return apiSuccess(conv);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    console.error("POST /api/chat/conversations error:", err);
    return apiError("Failed to create conversation", 500);
  }
}
