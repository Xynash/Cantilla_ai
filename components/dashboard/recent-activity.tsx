"use client";

import * as React from "react";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Activity, History, RefreshCw, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RealNotificationItem } from "@/services/notificationService";

export function RecentActivitySection() {
  const [events, setEvents] = React.useState<RealNotificationItem[]>([]);
  const [isRefreshing, setIsRefreshing] = React.useState(true);

  const loadEvents = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/notifications");
      const json = await res.json();
      if (json.success && json.data?.notifications) {
        setEvents(json.data.notifications);
      }
    } catch {
      // Fail gracefully
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            Recent Activity &amp; Audit Trail
          </CardTitle>
          <CardDescription className="text-xs">
            Real-time event stream of requisitions, batch evaluations, and policy audit logs
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadEvents}
            disabled={isRefreshing}
            className="h-8 text-xs"
          >
            <RefreshCw
              className={`mr-1.5 h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
            />
            Refresh Stream
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <EmptyState
            icon={History}
            title="No Recent Activity Logged"
            description="Operational events populate here automatically as requisitions are submitted, batch evaluations run, or policies are updated."
            badge="Audit Stream Active"
            className="min-h-[200px]"
          />
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border">
            {events.slice(0, 6).map((ev) => (
              <div
                key={ev.id}
                className="flex items-center justify-between gap-3 p-3.5 text-xs"
              >
                <div className="space-y-0.5 min-w-0">
                  <p className="font-semibold text-foreground truncate">
                    {ev.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {ev.description}
                  </p>
                </div>
                {ev.href && (
                  <Link
                    href={ev.href}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#6938EF] hover:underline shrink-0"
                  >
                    <span>Open</span>
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
