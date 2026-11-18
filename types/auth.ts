/**
 * Enterprise Authentication & RBAC Types for Cantill.ai
 */

export type UserRole = "REQUESTER" | "BUYER" | "PROCUREMENT_ADMIN";

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserSession {
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    isActive: boolean;
  };
  expires: string;
}

export type Permission =
  | "chat:access"
  | "requisition:create"
  | "requisition:view_own"
  | "requisition:view_all"
  | "requisition:approve"
  | "buyer:workspace"
  | "supplier:read"
  | "supplier:manage"
  | "contract:read"
  | "contract:manage"
  | "purchase_order:read"
  | "purchase_order:manage"
  | "plant:read"
  | "plant:manage"
  | "master_data:import"
  | "policy:manage"
  | "audit:view"
  | "user:manage";

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  REQUESTER: [
    "chat:access",
    "requisition:create",
    "requisition:view_own",
  ],
  BUYER: [
    "chat:access",
    "requisition:create",
    "requisition:view_own",
    "requisition:view_all",
    "buyer:workspace",
    "supplier:read",
    "contract:read",
    "purchase_order:read",
    "purchase_order:manage",
    "plant:read",
  ],
  PROCUREMENT_ADMIN: [
    "chat:access",
    "requisition:create",
    "requisition:view_own",
    "requisition:view_all",
    "requisition:approve",
    "buyer:workspace",
    "supplier:read",
    "supplier:manage",
    "contract:read",
    "contract:manage",
    "purchase_order:read",
    "purchase_order:manage",
    "plant:read",
    "plant:manage",
    "master_data:import",
    "policy:manage",
    "audit:view",
    "user:manage",
  ],
};
