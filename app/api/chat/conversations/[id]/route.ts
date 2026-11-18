import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guard";
import { getConversation } from "@/services/chat-intake/conversationService";
import { apiSuccess, apiError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const conversation = await getConversation(id, user);
    return apiSuccess(conversation);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    console.error("GET /api/chat/conversations/[id] error:", err);
    return apiError("Failed to fetch conversation", 500);
  }
}
