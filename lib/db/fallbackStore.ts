import { ICollectedData, IConversationMessage } from "@/models/Conversation";
import { LineDecisionOutput, RequirementDecision } from "@/services/decision-engine/types/engine";
import { PoGroup } from "@/services/decision-engine/po-consolidation/consolidator";
import { IPolicySourceDocument, PolicyLifecycleStatus } from "@/models/PolicyVersion";
import { StructuredPolicyConfig } from "@/services/decision-engine/types/policy";

export interface FallbackPolicyVersionRecord {
  id: string;
  version: string;
  policyName: string;
  documentCode: string;
  description: string;
  effectiveDate: Date;
  effectiveUntil?: Date | null;
  status: PolicyLifecycleStatus;
  baseVersion?: string;
  changeSummary: string;
  policyData: StructuredPolicyConfig;
  sourceDocument?: IPolicySourceDocument | null;
  createdBy: string;
  updatedBy?: string;
  submittedBy?: string;
  submittedAt?: Date | null;
  approvedBy?: string;
  approvedAt?: Date | null;
  activatedBy?: string;
  activatedAt?: Date | null;
  archivedBy?: string;
  archivedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FallbackAuditLogRecord {
  id: string;
  actorId: string;
  actorEmail?: string;
  action: string;
  entityType: string;
  entityId: string;
  previousValue?: unknown;
  newValue?: unknown;
  metadata?: Record<string, unknown>;
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface FallbackBatchRunRecord {
  id: string;
  runId: string;
  batchName: string;
  contentHash: string;
  policyVersion: string;
  policySnapshot?: Record<string, any>;
  status: "COMPLETED" | "FAILED";
  totalPrLines: number;
  totalRequirements: number;
  totalPOs: number;
  totalSourcingRequests: number;
  totalNotProcessed: number;
  lineOutputs: LineDecisionOutput[];
  requirements: RequirementDecision[];
  poGroups: PoGroup[];
  csvContent: string;
  processedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FallbackConversationRecord {
  id: string;
  conversationId: string;
  requesterId: string;
  requesterName: string;
  requesterEmail: string;
  department: string;
  title: string;
  state:
    | "STARTED"
    | "COLLECTING_DETAILS"
    | "ITEM_CLARIFICATION"
    | "WAITING_FOR_CONFIRMATION"
    | "CONFIRMED"
    | "CANCELLED";
  collectedData: ICollectedData;
  messages: IConversationMessage[];
  createdPrNo?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FallbackRequisitionRecord {
  id: string;
  prNo: string;
  requesterId: string;
  requesterName: string;
  department: string;
  plantCode: string;
  source: "chat" | "csv_batch" | "manual";
  status: string;
  totalEstimatedAmount: number;
  currency: string;
  conversationId?: string;
  urgency: "Normal" | "Urgent" | "Emergency";
  needByDate?: Date;
  linesCount: number;
  rawSource?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface FallbackRequisitionLineRecord {
  id: string;
  prNo: string;
  prLine: number;
  originalDescription: string;
  itemCode?: string;
  matchedItemDescription?: string;
  quantity: number;
  uom: string;
  estimatedUnitPrice?: number;
  totalPrice?: number;
  needByDate?: Date;
  urgency: "Normal" | "Urgent" | "Emergency";
  itemMatchStatus: "CATALOGUE_MATCH" | "CUSTOM_ITEM" | "PENDING_CLASSIFICATION";
  rawSource?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface FallbackSupplierOverrideRecord {
  supplierId: string;
  status: "Active" | "Inactive" | "Blocked";
  reason: string;
  updatedBy: string;
  updatedAt: Date;
}

export interface FallbackWorkspaceSettingsRecord {
  key: string;
  companyName: string;
  platformName: string;
  supportEmail: string;
  updatedBy: string;
  updatedAt: Date;
}

declare global {
  var fallbackConversations: Map<string, FallbackConversationRecord> | undefined;
  var fallbackRequisitions: Map<string, FallbackRequisitionRecord> | undefined;
  var fallbackRequisitionLines: Map<string, FallbackRequisitionLineRecord> | undefined;
  var fallbackBatchRuns: Map<string, FallbackBatchRunRecord> | undefined;
  var fallbackPolicyVersions: Map<string, FallbackPolicyVersionRecord> | undefined;
  var fallbackAuditLogs: FallbackAuditLogRecord[] | undefined;
  var fallbackSupplierOverrides: Map<string, FallbackSupplierOverrideRecord> | undefined;
  var fallbackWorkspaceSettings: FallbackWorkspaceSettingsRecord | undefined;
  var fallbackReadNotificationIds: Map<string, Set<string>> | undefined;
}

export function getFallbackConversations(): Map<string, FallbackConversationRecord> {
  if (!global.fallbackConversations) {
    global.fallbackConversations = new Map();
  }
  return global.fallbackConversations;
}

export function getFallbackRequisitions(): Map<string, FallbackRequisitionRecord> {
  if (!global.fallbackRequisitions) {
    global.fallbackRequisitions = new Map();
  }
  return global.fallbackRequisitions;
}

export function getFallbackRequisitionLines(): Map<string, FallbackRequisitionLineRecord> {
  if (!global.fallbackRequisitionLines) {
    global.fallbackRequisitionLines = new Map();
  }
  return global.fallbackRequisitionLines;
}

export function getFallbackBatchRuns(): Map<string, FallbackBatchRunRecord> {
  if (!global.fallbackBatchRuns) {
    global.fallbackBatchRuns = new Map();
  }
  return global.fallbackBatchRuns;
}

export function getFallbackPolicyVersions(): Map<string, FallbackPolicyVersionRecord> {
  if (!global.fallbackPolicyVersions) {
    global.fallbackPolicyVersions = new Map();
  }
  return global.fallbackPolicyVersions;
}

export function getFallbackAuditLogs(): FallbackAuditLogRecord[] {
  if (!global.fallbackAuditLogs) {
    global.fallbackAuditLogs = [];
  }
  return global.fallbackAuditLogs;
}

export function getFallbackSupplierOverrides(): Map<string, FallbackSupplierOverrideRecord> {
  if (!global.fallbackSupplierOverrides) {
    global.fallbackSupplierOverrides = new Map();
  }
  return global.fallbackSupplierOverrides;
}

export function getFallbackWorkspaceSettings(): FallbackWorkspaceSettingsRecord | undefined {
  return global.fallbackWorkspaceSettings;
}

export function setFallbackWorkspaceSettings(
  record: FallbackWorkspaceSettingsRecord
): FallbackWorkspaceSettingsRecord {
  global.fallbackWorkspaceSettings = record;
  return global.fallbackWorkspaceSettings;
}

export function getFallbackReadNotificationIds(userId: string): Set<string> {
  if (!global.fallbackReadNotificationIds) {
    global.fallbackReadNotificationIds = new Map();
  }
  let set = global.fallbackReadNotificationIds.get(userId);
  if (!set) {
    set = new Set<string>();
    global.fallbackReadNotificationIds.set(userId, set);
  }
  return set;
}
