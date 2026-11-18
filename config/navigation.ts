import {
  LayoutDashboard,
  MessageSquareText,
  FileSpreadsheet,
  FileCheck2,
  Building2,
  FileSignature,
  ShieldCheck,
  BarChart3,
  History,
  Package,
  UploadCloud,
  Users,
  Layers,
  Factory,
  FileText,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { UserRole } from "@/types/auth";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  exact?: boolean;
  disabled?: boolean;
  roles: UserRole[];
  category?: string;
  description?: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export interface GlobalSearchItem {
  title: string;
  category: string;
  href: string;
  icon: LucideIcon;
  description: string;
  roles: UserRole[];
}

import {
  PROTECTED_ROUTE_PREFIXES,
  PUBLIC_PATH_PREFIXES,
  ROUTE_ROLE_PERMISSIONS,
  isPublicPath,
  isProtectedPagePath,
  isRouteAuthorizedForRole,
} from "@/lib/auth/route-permissions";

export {
  PROTECTED_ROUTE_PREFIXES,
  PUBLIC_PATH_PREFIXES,
  ROUTE_ROLE_PERMISSIONS,
  isPublicPath,
  isProtectedPagePath,
  isRouteAuthorizedForRole,
};

export const NAVIGATION_SECTIONS: NavSection[] = [
  {
    title: "WORKSPACE",
    items: [
      {
        title: "Overview",
        href: "/",
        icon: LayoutDashboard,
        exact: true,
        roles: ["REQUESTER", "BUYER", "PROCUREMENT_ADMIN"],
        category: "Workspace",
        description: "Main procurement control center",
      },
      {
        title: "Procurement Chat",
        href: "/chat",
        icon: MessageSquareText,
        roles: ["REQUESTER", "BUYER", "PROCUREMENT_ADMIN"],
        category: "Workspace",
        description: "Conversational intake and request guidance",
      },
      {
        title: "My Requisitions",
        href: "/requisitions",
        icon: FileSpreadsheet,
        roles: ["REQUESTER"],
        category: "Workspace",
        description: "Purchase requisitions and department requests",
      },
    ],
  },
  {
    title: "PROCUREMENT",
    items: [
      {
        title: "Requisitions",
        href: "/requisitions",
        icon: FileSpreadsheet,
        roles: ["BUYER", "PROCUREMENT_ADMIN"],
        category: "Procurement",
        description: "Purchase requisitions and department requests",
      },
      {
        title: "Proposed Purchase Orders",
        href: "/purchase-orders",
        icon: FileCheck2,
        roles: ["BUYER", "PROCUREMENT_ADMIN"],
        category: "Procurement",
        description: "Consolidated proposed PO groups and fulfillment tracking",
      },
      {
        title: "Sourcing Requests",
        href: "/sourcing-requests",
        icon: Layers,
        roles: ["BUYER", "PROCUREMENT_ADMIN"],
        category: "Procurement",
        description: "Competitive RFQ, RFP, and Capex sourcing events",
      },
      {
        title: "Suppliers",
        href: "/suppliers",
        icon: Building2,
        roles: ["BUYER", "PROCUREMENT_ADMIN"],
        category: "Procurement",
        description: "Supplier intelligence, OTD metrics, and preferred tiers",
      },
      {
        title: "Contracts",
        href: "/contracts",
        icon: FileSignature,
        roles: ["BUYER", "PROCUREMENT_ADMIN"],
        category: "Procurement",
        description: "Master service agreements and active rate contracts",
      },
      {
        title: "Operating Plants",
        href: "/plants",
        icon: Factory,
        roles: ["BUYER", "PROCUREMENT_ADMIN"],
        category: "Procurement",
        description: "Manufacturing locations and receiving facilities",
      },
    ],
  },
  {
    title: "INSIGHTS",
    items: [
      {
        title: "Analytics",
        href: "/analytics",
        icon: BarChart3,
        roles: ["BUYER", "PROCUREMENT_ADMIN"],
        category: "Insights",
        description: "Spend velocity and procurement route analytics",
      },
      {
        title: "Processing History",
        href: "/decisions",
        icon: History,
        badge: "v5.0",
        roles: ["BUYER", "PROCUREMENT_ADMIN"],
        category: "Insights",
        description: "Buyer decision workspace and batch audit trails",
      },
      {
        title: "Reports",
        href: "/reports",
        icon: FileText,
        roles: ["BUYER", "PROCUREMENT_ADMIN"],
        category: "Insights",
        description: "Exportable compliance audits and spend digests",
      },
    ],
  },
  {
    title: "ADMINISTRATION",
    items: [
      {
        title: "Policy Management",
        href: "/policies",
        icon: ShieldCheck,
        roles: ["BUYER", "PROCUREMENT_ADMIN"],
        category: "Administration",
        description: "Procurement compliance rules, thresholds, and versions",
      },
      {
        title: "Master Data",
        href: "/items",
        icon: Package,
        roles: ["REQUESTER", "BUYER", "PROCUREMENT_ADMIN"],
        category: "Administration",
        description: "Item master catalogue, categories, and standard pricing",
      },
      {
        title: "Master Data Import",
        href: "/import",
        icon: UploadCloud,
        roles: ["PROCUREMENT_ADMIN"],
        category: "Administration",
        description: "CSV ingestion pipeline and master data bootstrap",
      },
      {
        title: "User Management",
        href: "/admin/users",
        icon: Users,
        roles: ["PROCUREMENT_ADMIN"],
        category: "Administration",
        description: "Enterprise user provisioning and RBAC role assignments",
      },
      {
        title: "Settings",
        href: "/settings",
        icon: Settings,
        roles: ["REQUESTER", "BUYER", "PROCUREMENT_ADMIN"],
        category: "System",
        description: "Workspace configuration, diagnostics, and preferences",
      },
    ],
  },
];

/**
 * Shared Global Search catalog derived from the unified navigation & permission configuration.
 * Deduplicated by `href` so routes shared across role sections (like `/requisitions`) never duplicate.
 */
export const GLOBAL_SEARCH_ITEMS: GlobalSearchItem[] = [
  {
    title: "Overview",
    category: "Workspace",
    href: "/",
    icon: LayoutDashboard,
    description: "Main procurement control center",
    roles: ["REQUESTER", "BUYER", "PROCUREMENT_ADMIN"],
  },
  {
    title: "Procurement Chat",
    category: "Workspace",
    href: "/chat",
    icon: MessageSquareText,
    description: "Conversational intake and request guidance",
    roles: ["REQUESTER", "BUYER", "PROCUREMENT_ADMIN"],
  },
  {
    title: "Requisitions",
    category: "Workspace",
    href: "/requisitions",
    icon: FileSpreadsheet,
    description: "Purchase requisitions and department requests",
    roles: ["REQUESTER", "BUYER", "PROCUREMENT_ADMIN"],
  },
  {
    title: "Proposed Purchase Orders",
    category: "Procurement",
    href: "/purchase-orders",
    icon: FileCheck2,
    description: "Consolidated proposed PO groups and fulfillment tracking",
    roles: ["BUYER", "PROCUREMENT_ADMIN"],
  },
  {
    title: "Sourcing Requests",
    category: "Procurement",
    href: "/sourcing-requests",
    icon: Layers,
    description: "Competitive RFQ, RFP, and Capex sourcing events",
    roles: ["BUYER", "PROCUREMENT_ADMIN"],
  },
  {
    title: "Processing History / Decisions",
    category: "Insights",
    href: "/decisions",
    icon: History,
    description: "Buyer decision workspace and batch audit trails",
    roles: ["BUYER", "PROCUREMENT_ADMIN"],
  },
  {
    title: "Suppliers",
    category: "Procurement",
    href: "/suppliers",
    icon: Building2,
    description: "Supplier intelligence, OTD metrics, and preferred tiers",
    roles: ["BUYER", "PROCUREMENT_ADMIN"],
  },
  {
    title: "Contracts",
    category: "Procurement",
    href: "/contracts",
    icon: FileSignature,
    description: "Master service agreements and active rate contracts",
    roles: ["BUYER", "PROCUREMENT_ADMIN"],
  },
  {
    title: "Item Master / Master Data",
    category: "Administration",
    href: "/items",
    icon: Package,
    description: "Item master catalogue, categories, and standard pricing",
    roles: ["REQUESTER", "BUYER", "PROCUREMENT_ADMIN"],
  },
  {
    title: "Operating Plants",
    category: "Procurement",
    href: "/plants",
    icon: Factory,
    description: "Manufacturing locations and receiving facilities",
    roles: ["BUYER", "PROCUREMENT_ADMIN"],
  },
  {
    title: "Policy Management",
    category: "Administration",
    href: "/policies",
    icon: ShieldCheck,
    description: "Procurement compliance rules, thresholds, and versions",
    roles: ["BUYER", "PROCUREMENT_ADMIN"],
  },
  {
    title: "Analytics",
    category: "Insights",
    href: "/analytics",
    icon: BarChart3,
    description: "Spend velocity and procurement route analytics",
    roles: ["BUYER", "PROCUREMENT_ADMIN"],
  },
  {
    title: "Reports",
    category: "Insights",
    href: "/reports",
    icon: FileText,
    description: "Exportable compliance audits and spend digests",
    roles: ["BUYER", "PROCUREMENT_ADMIN"],
  },
  {
    title: "Master Data Import",
    category: "Administration",
    href: "/import",
    icon: UploadCloud,
    description: "CSV ingestion pipeline and master data bootstrap",
    roles: ["PROCUREMENT_ADMIN"],
  },
  {
    title: "User Management",
    category: "Administration",
    href: "/admin/users",
    icon: Users,
    description: "Enterprise user provisioning and RBAC role assignments",
    roles: ["PROCUREMENT_ADMIN"],
  },
  {
    title: "Settings",
    category: "System",
    href: "/settings",
    icon: Settings,
    description: "Workspace configuration, diagnostics, and preferences",
    roles: ["REQUESTER", "BUYER", "PROCUREMENT_ADMIN"],
  },
];

/**
 * Returns only the Global Search navigation items permitted for the given role,
 * guaranteed to have unique hrefs and valid route targets.
 */
export function getAuthorizedSearchItems(
  role?: UserRole | null
): GlobalSearchItem[] {
  if (!role) return [];

  const seenHrefs = new Set<string>();
  const result: GlobalSearchItem[] = [];

  for (const item of GLOBAL_SEARCH_ITEMS) {
    if (
      item.roles.includes(role) &&
      isRouteAuthorizedForRole(item.href, role) &&
      !seenHrefs.has(item.href)
    ) {
      seenHrefs.add(item.href);
      result.push(item);
    }
  }

  return result;
}

