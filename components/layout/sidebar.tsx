"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { NAVIGATION_SECTIONS } from "@/config/navigation";
import { APP_CONFIG } from "@/config/constants";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, X, Shield } from "lucide-react";
import { UserRole } from "@/types/auth";

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onMobileClose,
}: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();

  const userRole =
    ((session?.user as unknown as { role?: UserRole })?.role) || "REQUESTER";

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          onClick={onMobileClose}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs lg:hidden"
        />
      )}

      {/* Main Sidebar Container */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex shrink-0 flex-col border-r border-[#EAEAEA] bg-[#FFFFFF] transition-all duration-300 ease-in-out lg:static lg:z-30",
          collapsed ? "w-16" : "w-60",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Brand Section */}
        <div className="flex h-16 items-center justify-between border-b border-[#EAEAEA] px-4">
          <Link
            href="/"
            className="flex items-center gap-2.5 overflow-hidden transition-opacity hover:opacity-90"
            onClick={onMobileClose}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#6938EF] text-white font-semibold shadow-2xs">
              <span className="text-base tracking-tight">C</span>
            </div>

            {!collapsed && (
              <div className="flex flex-col">
                <span className="text-sm font-semibold tracking-tight text-[#171717]">
                  {APP_CONFIG.name}
                </span>
                <span className="text-[11px] font-normal text-[#6B7280] leading-tight">
                  Procurement OS
                </span>
              </div>
            )}
          </Link>

          {/* Mobile close button */}
          <button
            onClick={onMobileClose}
            className="rounded-lg p-1.5 text-[#6B7280] hover:bg-[#F3F4F6] lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation Sections */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          <TooltipProvider delayDuration={150}>
            {NAVIGATION_SECTIONS.map((section) => {
              const filteredItems = section.items.filter((item) => {
                if (!item.roles) return true;
                return item.roles.includes(userRole);
              });

              if (filteredItems.length === 0) return null;

              return (
                <div key={section.title} className="space-y-1.5">
                  {!collapsed ? (
                    <p className="px-3 text-[11px] font-medium tracking-wider text-[#6B7280] uppercase">
                      {section.title}
                    </p>
                  ) : (
                    <div className="h-2" />
                  )}

                  <div className="space-y-0.5">
                    {filteredItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = item.exact
                        ? pathname === item.href
                        : pathname === item.href || pathname.startsWith(`${item.href}/`);

                      const navButton = (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={onMobileClose}
                          className={cn(
                            "group flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] transition-all select-none",
                            isActive
                              ? "bg-[#F3EEFF] text-[#6938EF] font-medium"
                              : "text-[#4B5563] font-normal hover:bg-[#F5F5F7] hover:text-[#171717]",
                            collapsed && "justify-center px-0 h-10 w-full"
                          )}
                        >
                          <Icon
                            className={cn(
                              "h-4 w-4 shrink-0 transition-colors",
                              isActive
                                ? "text-[#6938EF]"
                                : "text-[#6B7280] group-hover:text-[#171717]"
                            )}
                            strokeWidth={isActive ? 2 : 1.75}
                          />

                          {!collapsed && (
                            <span className="truncate">{item.title}</span>
                          )}

                          {!collapsed && item.badge && (
                            <span className="ml-auto rounded-md bg-[#FFF2CC] px-1.5 py-0.5 text-[10px] font-mono font-medium text-[#171717]">
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      );

                      if (collapsed) {
                        return (
                          <Tooltip key={item.href}>
                            <TooltipTrigger asChild>{navButton}</TooltipTrigger>
                            <TooltipContent side="right" className="font-medium text-xs">
                              {item.title}
                            </TooltipContent>
                          </Tooltip>
                        );
                      }

                      return <div key={item.href}>{navButton}</div>;
                    })}
                  </div>
                </div>
              );
            })}
          </TooltipProvider>
        </div>

        {/* Role & Policy Footer */}
        {!collapsed ? (
          <div className="border-t border-[#EAEAEA] p-3.5">
            <div className="rounded-xl bg-[#FAFAFC] border border-[#EAEAEA] p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#171717]">
                  <Shield className="h-3.5 w-3.5 text-[#6938EF]" />
                  <span>{userRole.replace("_", " ")}</span>
                </span>
                <span className="rounded-md bg-[#D9FAF5] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#171717]">
                  v5.0
                </span>
              </div>
              <p className="text-[11px] font-normal text-[#6B7280] truncate">
                {session?.user?.email || "Corvo Engineering"}
              </p>
            </div>
          </div>
        ) : (
          <div className="border-t border-[#EAEAEA] py-3 flex justify-center">
            <div className="h-2.5 w-2.5 rounded-full bg-[#6938EF]" title="Policy v5.0 Active" />
          </div>
        )}

        {/* Desktop Collapse Toggle */}
        <div className="hidden lg:flex items-center justify-end border-t border-[#EAEAEA] p-2">
          <button
            onClick={onToggleCollapse}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#6B7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#171717]"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
