"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  FileSpreadsheet,
  MessageSquareText,
  FileCheck2,
  Building2,
  FileSignature,
  ShieldCheck,
  UploadCloud,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { isRouteAuthorizedForRole } from "@/lib/auth/route-permissions";
import { UserRole } from "@/types/auth";

export interface DashboardQuickActionItem {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  accentBg: string;
  roles: UserRole[];
}

export const DASHBOARD_QUICK_ACTIONS: DashboardQuickActionItem[] = [
  {
    title: "Procurement Chat",
    description: "Create a PR in plain English",
    href: "/chat",
    icon: MessageSquareText,
    accentBg: "bg-[#FFF2CC]",
    roles: ["REQUESTER", "BUYER", "PROCUREMENT_ADMIN"],
  },
  {
    title: "Requisitions Registry",
    description: "Track submitted PRs & lines",
    href: "/requisitions",
    icon: FileSpreadsheet,
    accentBg: "bg-[#FCE3EF]",
    roles: ["REQUESTER", "BUYER", "PROCUREMENT_ADMIN"],
  },
  {
    title: "Proposed POs",
    description: "24-hour consolidated groups",
    href: "/purchase-orders",
    icon: FileCheck2,
    accentBg: "bg-[#DDF3FF]",
    roles: ["BUYER", "PROCUREMENT_ADMIN"],
  },
  {
    title: "Supplier Intelligence",
    description: "OTD %, quality & preferred tiers",
    href: "/suppliers",
    icon: Building2,
    accentBg: "bg-[#D9FAF5]",
    roles: ["BUYER", "PROCUREMENT_ADMIN"],
  },
  {
    title: "Rate Contracts",
    description: "Review active MSAs & ceilings",
    href: "/contracts",
    icon: FileSignature,
    accentBg: "bg-[#FFF2CC]",
    roles: ["BUYER", "PROCUREMENT_ADMIN"],
  },
  {
    title: "Policy Management",
    description: "Rules, PDF extract & versions",
    href: "/policies",
    icon: ShieldCheck,
    accentBg: "bg-[#D9FAF5]",
    roles: ["BUYER", "PROCUREMENT_ADMIN"],
  },
  {
    title: "Master Data Import",
    description: "Items, suppliers & contracts",
    href: "/import",
    icon: UploadCloud,
    accentBg: "bg-[#F3EEFF]",
    roles: ["PROCUREMENT_ADMIN"],
  },
];

/**
 * Pure helper returning only the quick actions permitted for the given user role.
 */
export function getDashboardQuickActionsForRole(
  role?: UserRole | null
): DashboardQuickActionItem[] {
  if (!role) return [];
  return DASHBOARD_QUICK_ACTIONS.filter(
    (act) =>
      act.roles.includes(role) && isRouteAuthorizedForRole(act.href, role)
  );
}

export function QuickNavigationActions({
  roleOverride,
}: {
  roleOverride?: UserRole;
} = {}) {
  const router = useRouter();
  const { data: session } = useSession();

  const userRole =
    roleOverride ||
    ((session?.user as unknown as { role?: UserRole })?.role) ||
    null;

  const actions = React.useMemo(
    () => getDashboardQuickActionsForRole(userRole),
    [userRole]
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">
          Procurement Quick Actions
        </CardTitle>
        <CardDescription className="text-xs">
          Authorized shortcuts for {userRole ? userRole.replace("_", " ") : "workspace"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {actions.map((act) => {
            const Icon = act.icon;
            return (
              <button
                key={act.href}
                onClick={() => router.push(act.href)}
                className="group flex flex-col justify-between rounded-lg border border-border bg-card p-3.5 text-left transition-all hover:border-foreground/30 hover:shadow-xs active:scale-[0.99]"
              >
                <div className="flex items-start justify-between w-full">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted/60 text-muted-foreground group-hover:text-foreground">
                    <Icon className="h-4 w-4" />
                  </div>
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-50 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="mt-3">
                  <p className="text-xs font-semibold text-foreground group-hover:text-primary">
                    {act.title}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground leading-snug">
                    {act.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
