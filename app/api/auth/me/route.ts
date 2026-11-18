import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/guard";
import { apiSuccess, apiUnauthorized } from "@/lib/api-response";
import { ROLE_PERMISSIONS } from "@/types/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return apiUnauthorized("No active session");
  }

  const permissions = ROLE_PERMISSIONS[user.role] || [];

  return apiSuccess({
    user,
    permissions,
  });
}
