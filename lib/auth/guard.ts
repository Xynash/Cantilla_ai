import { auth } from "@/lib/auth";
import { UserRole, Permission, ROLE_PERMISSIONS, SafeUser } from "@/types/auth";
import { UnauthorizedError, ForbiddenError } from "@/lib/errors";

/**
 * Retrieves the currently authenticated user from session or returns null
 */
export async function getCurrentUser(): Promise<SafeUser | null> {
  try {
    const session = await auth();
    if (!session?.user) {
      return null;
    }

    const userObj = session.user as unknown as {
      id: string;
      name: string;
      email: string;
      role: UserRole;
      isActive: boolean;
    };

    if (!userObj.isActive) {
      return null;
    }

    return {
      id: userObj.id,
      name: userObj.name || "",
      email: userObj.email || "",
      role: userObj.role || "REQUESTER",
      isActive: userObj.isActive ?? true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("Failed to retrieve current user session:", err);
    return null;
  }
}

/**
 * Server-side guard: requires a valid authenticated session
 */
export async function requireAuth(): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new UnauthorizedError("Authentication required to access this resource");
  }
  return user;
}

/**
 * Server-side guard: requires specific role membership
 */
export async function requireRole(allowedRoles: UserRole[]): Promise<SafeUser> {
  const user = await requireAuth();
  if (!allowedRoles.includes(user.role)) {
    throw new ForbiddenError(
      `Access denied. Requires one of roles: ${allowedRoles.join(", ")}`
    );
  }
  return user;
}

/**
 * Server-side guard: checks if user has permission
 */
export async function requirePermission(permission: Permission): Promise<SafeUser> {
  const user = await requireAuth();
  const permissions = ROLE_PERMISSIONS[user.role] || [];
  if (!permissions.includes(permission)) {
    throw new ForbiddenError(`Missing required permission: ${permission}`);
  }
  return user;
}

/**
 * Checks if a role has a given permission
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
