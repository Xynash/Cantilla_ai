import { z } from "zod";
import { connectToDatabase } from "@/lib/db";
import {
  getFallbackWorkspaceSettings,
  setFallbackWorkspaceSettings,
  getFallbackAuditLogs,
} from "@/lib/db/fallbackStore";
import { WorkspaceSetting } from "@/models/WorkspaceSetting";
import { AuditLog } from "@/models/AuditLog";
import { APP_CONFIG } from "@/config/constants";
import { SafeUser, ROLE_PERMISSIONS } from "@/types/auth";
import { ForbiddenError, ValidationError } from "@/lib/errors";

export const WorkspaceSettingsInputSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(2, "Company name must be at least 2 characters.")
    .max(120, "Company name cannot exceed 120 characters."),
  platformName: z
    .string()
    .trim()
    .min(2, "Platform name must be at least 2 characters.")
    .max(80, "Platform name cannot exceed 80 characters."),
  supportEmail: z
    .string()
    .trim()
    .email("Support desk email must be a valid email address."),
});

export type WorkspaceSettingsInput = z.infer<typeof WorkspaceSettingsInputSchema>;

export interface WorkspaceSettingsResponse {
  companyName: string;
  platformName: string;
  supportEmail: string;
  updatedBy: string;
  updatedAt: string;
  canEditOrganizationSettings: boolean;
  currentUser: {
    id: string;
    name: string;
    email: string;
    role: string;
    permissions: string[];
  };
  authCapabilities: {
    sessionStrategy: "jwt";
    credentialsProviderActive: boolean;
    externalSsoAvailable: boolean;
    externalSsoStatusReason: string;
    supportedRoles: Array<"REQUESTER" | "BUYER" | "PROCUREMENT_ADMIN">;
  };
}

/**
 * Retrieves current persisted workspace settings from MongoDB or fallback store.
 */
export async function getWorkspaceSettings(
  user: SafeUser
): Promise<WorkspaceSettingsResponse> {
  let companyName: string = APP_CONFIG.company;
  let platformName: string = APP_CONFIG.name;
  let supportEmail: string = APP_CONFIG.supportEmail;
  let updatedBy = "system@cantill.ai";
  let updatedAt = new Date().toISOString();

  const fallback = getFallbackWorkspaceSettings();
  if (fallback) {
    companyName = fallback.companyName;
    platformName = fallback.platformName;
    supportEmail = fallback.supportEmail;
    updatedBy = fallback.updatedBy;
    updatedAt = fallback.updatedAt.toISOString();
  }

  try {
    await connectToDatabase();
    const doc = await WorkspaceSetting.findOne({
      key: "DEFAULT_WORKSPACE",
    }).lean();
    if (doc) {
      companyName = doc.companyName;
      platformName = doc.platformName;
      supportEmail = doc.supportEmail;
      updatedBy = doc.updatedBy;
      updatedAt = doc.updatedAt.toISOString();
    }
  } catch {
    // Use fallback or default APP_CONFIG
  }

  return {
    companyName,
    platformName,
    supportEmail,
    updatedBy,
    updatedAt,
    canEditOrganizationSettings: user.role === "PROCUREMENT_ADMIN",
    currentUser: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: ROLE_PERMISSIONS[user.role] || [],
    },
    authCapabilities: {
      sessionStrategy: "jwt",
      credentialsProviderActive: true,
      externalSsoAvailable: false,
      externalSsoStatusReason:
        "External SAML 2.0 / OIDC identity provider configuration is not enabled in this deployment. Authentication runs on Auth.js v5 JWT Credentials with MongoDB RBAC.",
      supportedRoles: ["REQUESTER", "BUYER", "PROCUREMENT_ADMIN"],
    },
  };
}

/**
 * Validates and persists organization workspace settings.
 * Restricted to PROCUREMENT_ADMIN.
 */
export async function updateWorkspaceSettings(
  input: unknown,
  actor: SafeUser
): Promise<WorkspaceSettingsResponse> {
  if (!actor || actor.role !== "PROCUREMENT_ADMIN") {
    throw new ForbiddenError(
      "Only PROCUREMENT_ADMIN users are permitted to update organization workspace settings."
    );
  }

  const parsed = WorkspaceSettingsInputSchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join(" ");
    throw new ValidationError(msg);
  }

  const { companyName, platformName, supportEmail } = parsed.data;
  const now = new Date();
  const actorLabel = actor.email || actor.name || actor.id;

  const previous = await getWorkspaceSettings(actor);

  setFallbackWorkspaceSettings({
    key: "DEFAULT_WORKSPACE",
    companyName,
    platformName,
    supportEmail,
    updatedBy: actorLabel,
    updatedAt: now,
  });

  try {
    await connectToDatabase();
    await WorkspaceSetting.findOneAndUpdate(
      { key: "DEFAULT_WORKSPACE" },
      {
        $set: {
          companyName,
          platformName,
          supportEmail,
          updatedBy: actorLabel,
        },
      },
      { upsert: true, new: true }
    );
  } catch {
    // Fallback store already updated
  }

  const auditEntry = {
    id: `AUD-SET-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    actorId: actor.id,
    actorEmail: actorLabel,
    action: "UPDATE_WORKSPACE_SETTINGS",
    entityType: "WorkspaceSetting",
    entityId: "DEFAULT_WORKSPACE",
    previousValue: {
      companyName: previous.companyName,
      platformName: previous.platformName,
      supportEmail: previous.supportEmail,
    },
    newValue: {
      companyName,
      platformName,
      supportEmail,
    },
    metadata: {},
    timestamp: now,
    createdAt: now,
    updatedAt: now,
  };

  getFallbackAuditLogs().unshift(auditEntry);

  try {
    await connectToDatabase();
    await AuditLog.create({
      actorId: actor.id,
      actorEmail: actorLabel,
      action: "UPDATE_WORKSPACE_SETTINGS",
      entityType: "WorkspaceSetting",
      entityId: "DEFAULT_WORKSPACE",
      previousValue: auditEntry.previousValue,
      newValue: auditEntry.newValue,
      timestamp: now,
    });
  } catch {
    // Fallback audit log already stored
  }

  return getWorkspaceSettings(actor);
}
