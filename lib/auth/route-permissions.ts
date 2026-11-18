import { UserRole } from "@/types/auth";

/**
 * All authenticated application route prefixes requiring a valid session in middleware.
 */
export const PROTECTED_ROUTE_PREFIXES = [
  "/chat",
  "/requisitions",
  "/decisions",
  "/purchase-orders",
  "/sourcing-requests",
  "/suppliers",
  "/contracts",
  "/items",
  "/plants",
  "/policies",
  "/analytics",
  "/reports",
  "/settings",
  "/import",
  "/admin/users",
  "/admin",
] as const;

/**
 * Public paths that do not require authentication in middleware.
 */
export const PUBLIC_PATH_PREFIXES = [
  "/auth/signin",
  "/api/auth",
  "/api/health",
  "/_next",
  "/icon.svg",
  "/favicon.ico",
] as const;

/**
 * Canonical role permissions for every application route prefix.
 * Order matters for prefix matching (more specific prefixes first).
 */
export const ROUTE_ROLE_PERMISSIONS: Array<{
  prefix: string;
  exact?: boolean;
  roles: UserRole[];
}> = [
  { prefix: "/", exact: true, roles: ["REQUESTER", "BUYER", "PROCUREMENT_ADMIN"] },
  { prefix: "/chat", roles: ["REQUESTER", "BUYER", "PROCUREMENT_ADMIN"] },
  { prefix: "/requisitions", roles: ["REQUESTER", "BUYER", "PROCUREMENT_ADMIN"] },
  { prefix: "/items", roles: ["REQUESTER", "BUYER", "PROCUREMENT_ADMIN"] },
  { prefix: "/settings", roles: ["REQUESTER", "BUYER", "PROCUREMENT_ADMIN"] },
  { prefix: "/decisions", roles: ["BUYER", "PROCUREMENT_ADMIN"] },
  { prefix: "/purchase-orders", roles: ["BUYER", "PROCUREMENT_ADMIN"] },
  { prefix: "/sourcing-requests", roles: ["BUYER", "PROCUREMENT_ADMIN"] },
  { prefix: "/suppliers", roles: ["BUYER", "PROCUREMENT_ADMIN"] },
  { prefix: "/contracts", roles: ["BUYER", "PROCUREMENT_ADMIN"] },
  { prefix: "/plants", roles: ["BUYER", "PROCUREMENT_ADMIN"] },
  { prefix: "/policies", roles: ["BUYER", "PROCUREMENT_ADMIN"] },
  { prefix: "/analytics", roles: ["BUYER", "PROCUREMENT_ADMIN"] },
  { prefix: "/reports", roles: ["BUYER", "PROCUREMENT_ADMIN"] },
  { prefix: "/import", roles: ["PROCUREMENT_ADMIN"] },
  { prefix: "/admin/users", roles: ["PROCUREMENT_ADMIN"] },
  { prefix: "/admin", roles: ["PROCUREMENT_ADMIN"] },
];

/**
 * Checks whether a given pathname is a public path or static asset.
 */
export function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix)
  );
}

/**
 * Checks whether a given pathname requires authentication as an application page route.
 */
export function isProtectedPagePath(pathname: string): boolean {
  return PROTECTED_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * Checks whether an authenticated user with `role` is permitted to access `pathname`.
 */
export function isRouteAuthorizedForRole(
  pathname: string,
  role?: UserRole | null
): boolean {
  if (!role) return false;

  for (const rule of ROUTE_ROLE_PERMISSIONS) {
    if (rule.exact) {
      if (pathname === rule.prefix) {
        return rule.roles.includes(role);
      }
    } else if (
      pathname === rule.prefix ||
      pathname.startsWith(`${rule.prefix}/`)
    ) {
      return rule.roles.includes(role);
    }
  }

  return false;
}
