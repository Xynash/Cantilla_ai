import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guard";
import { processUserMessage } from "@/services/chat-intake/conversationService";
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
    const body = await req.json();

    if (!body?.message || typeof body.message !== "string" || !body.message.trim()) {
      return apiError("A valid non-empty message string is required", 400);
    }

    const updated = await processUserMessage(id, body.message.trim(), user);
    return apiSuccess(updated);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    console.error("POST /api/chat/conversations/[id]/messages error:", err);
    return apiError("Failed to process message", 500);
  }
}
