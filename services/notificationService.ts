import { connectToDatabase } from "@/lib/db";
import {
  getFallbackAuditLogs,
  getFallbackReadNotificationIds,
} from "@/lib/db/fallbackStore";
import { AuditLog } from "@/models/AuditLog";
import { listRequisitions } from "./requisitionService";
import { listBatchProcessingRuns } from "./decision-engine/batch-processor/batchHistoryService";
import { SafeUser } from "@/types/auth";

export interface RealNotificationItem {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  read: boolean;
  type: "policy" | "approval" | "requisition" | "batch" | "supplier" | "system";
  href?: string;
}

/**
 * Derives real, role-filtered notifications from actual AuditLog records, Requisitions, and Batch Runs.
 * Never fabricates placeholder notifications.
 */
export async function getNotificationsForUser(
  user: SafeUser
): Promise<{
  notifications: RealNotificationItem[];
  unreadCount: number;
}> {
  const readSet = getFallbackReadNotificationIds(user.id);
  const items: RealNotificationItem[] = [];

  // 1. Requisition events (REQUESTER sees own; BUYER/ADMIN sees recent requisitions)
  try {
    const reqsRes = await listRequisitions({ user, page: 1, limit: 5 });
    for (const r of reqsRes.requisitions || []) {
      const id = `NOTIF-PR-${r.prNo}`;
      items.push({
        id,
        title: `Requisition ${r.prNo} (${r.status})`,
        description: `Plant ${r.plantCode} • ${r.linesCount || 1} line(s) • Est. ₹${Number(
          r.totalEstimatedAmount || 0
        ).toLocaleString("en-IN")}`,
        timestamp: r.createdAt
          ? new Date(r.createdAt).toISOString()
          : new Date().toISOString(),
        read: readSet.has(id),
        type: "requisition",
        href: "/requisitions",
      });
    }
  } catch {
    // Ignore if unavailable
  }

  // 2. Batch processing runs (BUYER and PROCUREMENT_ADMIN only)
  if (user.role === "BUYER" || user.role === "PROCUREMENT_ADMIN") {
    try {
      const runs = await listBatchProcessingRuns(user);
      for (const run of runs.slice(0, 4)) {
        const id = `NOTIF-RUN-${run.runId}`;
        items.push({
          id,
          title: `Batch Run ${run.runId} Completed`,
          description: `${run.totalPrLines} PR lines → ${run.totalPOs} Proposed POs & ${run.totalSourcingRequests} Sourcing Requests (Policy v${run.policyVersion})`,
          timestamp: run.createdAt
            ? new Date(run.createdAt).toISOString()
            : new Date().toISOString(),
          read: readSet.has(id),
          type: "batch",
          href: "/decisions",
        });
      }
    } catch {
      // Ignore if unavailable
    }
  }

  // 3. AuditLog events (Policy lifecycle, Supplier status overrides, Workspace settings)
  if (user.role === "BUYER" || user.role === "PROCUREMENT_ADMIN") {
    const auditRecords: Array<{
      id: string;
      action: string;
      entityType: string;
      entityId: string;
      actorEmail?: string;
      timestamp: Date | string;
    }> = [];

    for (const fb of getFallbackAuditLogs().slice(0, 10)) {
      auditRecords.push({
        id: fb.id,
        action: fb.action,
        entityType: fb.entityType,
        entityId: fb.entityId,
        actorEmail: fb.actorEmail,
        timestamp: fb.timestamp,
      });
    }

    try {
      await connectToDatabase();
      const dbLogs = await AuditLog.find({})
        .sort({ timestamp: -1 })
        .limit(10)
        .lean();
      for (const log of dbLogs) {
        const logId = log._id.toString();
        if (!auditRecords.some((a) => a.id === logId)) {
          auditRecords.push({
            id: logId,
            action: log.action,
            entityType: log.entityType,
            entityId: log.entityId,
            actorEmail: log.actorEmail,
            timestamp: log.timestamp,
          });
        }
      }
    } catch {
      // Fallback logs already included
    }

    for (const log of auditRecords) {
      // Admin-only audit events (WorkspaceSetting, User) hidden from BUYER
      if (
        user.role !== "PROCUREMENT_ADMIN" &&
        (log.entityType === "WorkspaceSetting" || log.entityType === "User")
      ) {
        continue;
      }

      const id = `NOTIF-AUD-${log.id}`;
      const href =
        log.entityType === "PolicyVersion"
          ? "/policies"
          : log.entityType === "Supplier"
          ? `/suppliers/${log.entityId}`
          : log.entityType === "WorkspaceSetting"
          ? "/settings"
          : "/decisions";

      items.push({
        id,
        title: `${log.action.replace(/_/g, " ")}`,
        description: `${log.entityType} ${log.entityId} by ${
          log.actorEmail || "system"
        }`,
        timestamp: new Date(log.timestamp).toISOString(),
        read: readSet.has(id),
        type:
          log.entityType === "PolicyVersion"
            ? "policy"
            : log.entityType === "Supplier"
            ? "supplier"
            : "system",
        href,
      });
    }
  }

  // Deduplicate by id and sort newest first
  const seen = new Set<string>();
  const unique = items
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
    .slice(0, 12);

  const unreadCount = unique.filter((n) => !n.read).length;

  return {
    notifications: unique,
    unreadCount,
  };
}

/**
 * Marks a single notification or all notifications as read for the given user.
 */
export async function markNotificationsAsRead(
  user: SafeUser,
  options: { notificationId?: string; markAll?: boolean }
): Promise<{
  notifications: RealNotificationItem[];
  unreadCount: number;
}> {
  const readSet = getFallbackReadNotificationIds(user.id);

  if (options.markAll) {
    const current = await getNotificationsForUser(user);
    for (const n of current.notifications) {
      readSet.add(n.id);
    }
  } else if (options.notificationId) {
    readSet.add(options.notificationId);
  }

  return getNotificationsForUser(user);
}
