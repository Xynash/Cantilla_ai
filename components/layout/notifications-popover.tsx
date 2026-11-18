"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Bell,
  CheckCheck,
  Clock,
  ShieldAlert,
  FileSpreadsheet,
  Layers,
  Building2,
  RefreshCw,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { RealNotificationItem } from "@/services/notificationService";

export function NotificationsPopover() {
  const { status } = useSession();
  const router = useRouter();
  const { toast } = useToast();

  const [notifications, setNotifications] = React.useState<RealNotificationItem[]>(
    []
  );
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [loading, setLoading] = React.useState(false);

  const fetchNotifications = React.useCallback(async () => {
    if (status !== "authenticated") return;
    setLoading(true);
    try {
      const res = await fetch("/api/notifications");
      const json = await res.json();
      if (json.success && json.data) {
        setNotifications(json.data.notifications || []);
        setUnreadCount(json.data.unreadCount || 0);
      }
    } catch {
      // Fail gracefully without fabricated data
    } finally {
      setLoading(false);
    }
  }, [status]);

  React.useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAllAsRead = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setNotifications(json.data.notifications || []);
        setUnreadCount(json.data.unreadCount || 0);
        toast({
          title: "Notifications Marked as Read",
          description: "All workspace activity notifications updated.",
        });
      }
    } catch {
      // Ignore network error
    }
  };

  const handleNotificationClick = async (item: RealNotificationItem) => {
    if (!item.read) {
      try {
        const res = await fetch("/api/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notificationId: item.id }),
        });
        const json = await res.json();
        if (json.success && json.data) {
          setNotifications(json.data.notifications || []);
          setUnreadCount(json.data.unreadCount || 0);
        }
      } catch {
        // Ignore network error
      }
    }
    if (item.href) {
      router.push(item.href);
    }
  };

  if (status !== "authenticated") {
    return null;
  }

  const getIcon = (type: RealNotificationItem["type"]) => {
    switch (type) {
      case "policy":
        return <ShieldAlert className="h-3.5 w-3.5 text-[#6938EF]" />;
      case "requisition":
        return <FileSpreadsheet className="h-3.5 w-3.5 text-[#6938EF]" />;
      case "batch":
        return <Layers className="h-3.5 w-3.5 text-[#6938EF]" />;
      case "supplier":
        return <Building2 className="h-3.5 w-3.5 text-[#6938EF]" />;
      default:
        return <Clock className="h-3.5 w-3.5 text-[#6938EF]" />;
    }
  };

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) fetchNotifications();
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative text-[#6B7280] hover:text-[#171717] h-8 w-8 rounded-lg"
          aria-label="View notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#6938EF]" />
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0 shadow-lg rounded-2xl border-[#EAEAEA]">
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[#EAEAEA]">
          <DropdownMenuLabel className="p-0 text-xs font-semibold text-[#171717]">
            Workspace Activity ({unreadCount} unread)
          </DropdownMenuLabel>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllAsRead}
              className="text-[11px] text-[#6938EF] hover:underline flex items-center gap-1 font-medium"
            >
              <CheckCheck className="h-3 w-3" />
              Mark all read
            </button>
          )}
        </div>

        <div className="max-h-72 overflow-y-auto divide-y divide-[#EAEAEA]">
          {loading && notifications.length === 0 ? (
            <div className="py-6 text-center text-xs text-[#6B7280] flex items-center justify-center gap-2">
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-[#6938EF]" />
              <span>Loading activity...</span>
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-8 px-4 text-center space-y-1">
              <p className="text-xs font-medium text-[#171717]">
                No Recent Notifications
              </p>
              <p className="text-[11px] text-[#6B7280]">
                Real requisition submissions, batch evaluations, and policy audit events will appear here.
              </p>
            </div>
          ) : (
            notifications.map((item) => (
              <DropdownMenuItem
                key={item.id}
                onClick={() => handleNotificationClick(item)}
                className={`flex items-start gap-3 p-3 cursor-pointer ${
                  !item.read ? "bg-[#F3EEFF]/40" : ""
                }`}
              >
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#F3EEFF]">
                  {getIcon(item.type)}
                </div>
                <div className="flex-1 space-y-0.5 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={`text-xs truncate ${
                        !item.read
                          ? "font-semibold text-[#171717]"
                          : "font-normal text-[#4B5563]"
                      }`}
                    >
                      {item.title}
                    </p>
                    <span className="text-[10px] font-mono text-[#6B7280] shrink-0">
                      {new Date(item.timestamp).toLocaleDateString("en-IN", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#6B7280] leading-snug line-clamp-2">
                    {item.description}
                  </p>
                </div>
              </DropdownMenuItem>
            ))
          )}
        </div>

        <DropdownMenuSeparator className="m-0" />
        <div className="p-2 text-center bg-[#FAFAFC]">
          <span className="text-[10px] text-[#6B7280]">
            Synced with AuditLog &amp; Requisition Registry
          </span>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
