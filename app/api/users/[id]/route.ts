import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guard";
import { updateUser } from "@/services/userService";
import { apiSuccess, apiBadRequest, apiError } from "@/lib/api-response";
import { z } from "zod";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(["REQUESTER", "BUYER", "PROCUREMENT_ADMIN"]).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireRole(["PROCUREMENT_ADMIN"]);
    const { id } = await context.params;
    const body = await req.json();
    const parsed = updateUserSchema.safeParse(body);

    if (!parsed.success) {
      return apiBadRequest("Invalid update payload", parsed.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      })));
    }

    const updated = await updateUser(id, parsed.data, admin.id, admin.email);
    return apiSuccess(updated);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    return apiError("Failed to update user", 500);
  }
}
