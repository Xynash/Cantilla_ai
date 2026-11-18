import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guard";
import { cancelConversation } from "@/services/chat-intake/conversationService";
import { apiSuccess, apiError } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const result = await cancelConversation(id, user);
    return apiSuccess(result);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    console.error("POST /api/chat/conversations/[id]/cancel error:", err);
    return apiError("Failed to cancel conversation", 500);
  }
}
