import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guard";
import { listUsers, createUser } from "@/services/userService";
import { apiSuccess, apiBadRequest, apiError, apiForbidden, apiUnauthorized } from "@/lib/api-response";
import { z } from "zod";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["REQUESTER", "BUYER", "PROCUREMENT_ADMIN"]),
});

export async function GET(req: NextRequest) {
  try {
    await requireRole(["PROCUREMENT_ADMIN"]);
    const { searchParams } = req.nextUrl;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const search = searchParams.get("search") || undefined;
    const role = searchParams.get("role") || undefined;

    const result = await listUsers({ page, limit, search, role });
    return apiSuccess(result.items, result.meta);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    return apiError("Failed to fetch users", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireRole(["PROCUREMENT_ADMIN"]);
    const body = await req.json();
    const parsed = createUserSchema.safeParse(body);

    if (!parsed.success) {
      return apiBadRequest("Invalid user payload", parsed.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      })));
    }

    const created = await createUser(parsed.data, admin.id, admin.email);
    return apiSuccess(created, undefined, 201);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return apiError(err.message, err.statusCode, err.code);
    }
    return apiError("Failed to create user", 500);
  }
}
