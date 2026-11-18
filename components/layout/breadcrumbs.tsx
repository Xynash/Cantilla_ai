"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";

const ROUTE_LABELS: Record<string, string> = {
  chat: "Procurement Chat",
  requisitions: "Requisitions",
  "purchase-orders": "Proposed Purchase Orders",
  "sourcing-requests": "Sourcing Requests",
  decisions: "Processing History & Decisions",
  suppliers: "Suppliers",
  contracts: "Contracts",
  policies: "Policy Management",
  items: "Master Data",
  import: "Data Import",
  analytics: "Analytics",
  reports: "Reports",
  settings: "Settings",
};

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  return (
    <nav aria-label="Breadcrumb" className="flex items-center text-xs sm:text-sm text-[#6B7280]">
      <Link
        href="/"
        className="flex items-center gap-1.5 transition-colors hover:text-[#171717] font-medium"
      >
        <Home className="h-3.5 w-3.5 text-[#6938EF]" />
        <span className="hidden sm:inline">Workspace</span>
      </Link>

      {segments.length === 0 ? (
        <>
          <ChevronRight className="mx-1.5 h-3.5 w-3.5 text-[#9CA3AF]" />
          <span className="font-medium text-[#171717]">Overview</span>
        </>
      ) : (
        segments.map((seg, idx) => {
          const href = "/" + segments.slice(0, idx + 1).join("/");
          const isLast = idx === segments.length - 1;
          const label = ROUTE_LABELS[seg] || seg.replace(/-/g, " ");

          return (
            <span key={href} className="flex items-center">
              <ChevronRight className="mx-1.5 h-3.5 w-3.5 text-[#9CA3AF]" />
              {isLast ? (
                <span className="font-medium text-[#171717] capitalize">{label}</span>
              ) : (
                <Link
                  href={href}
                  className="transition-colors hover:text-[#171717] font-normal capitalize"
                >
                  {label}
                </Link>
              )}
            </span>
          );
        })
      )}
    </nav>
  );
}
