"use client";

import { Breadcrumbs } from "./breadcrumbs";
import { GlobalSearchDialog } from "./global-search-dialog";
import { NotificationsPopover } from "./notifications-popover";
import { UserNav } from "./user-nav";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  onMobileMenuToggle: () => void;
}

export function Header({ onMobileMenuToggle }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-[#EAEAEA] bg-[#FFFFFF]/95 px-4 md:px-8 backdrop-blur-sm">
      {/* Left: Mobile Toggle + Breadcrumbs */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onMobileMenuToggle}
          className="lg:hidden text-[#6B7280] hover:text-[#171717] h-9 w-9 rounded-xl border border-[#EAEAEA]"
          aria-label="Toggle navigation menu"
        >
          <Menu className="h-4 w-4" />
        </Button>

        <div className="hidden sm:block">
          <Breadcrumbs />
        </div>
      </div>

      {/* Right: Search, Notifications & User Profile Menu */}
      <div className="flex items-center gap-2.5">
        <GlobalSearchDialog />
        <NotificationsPopover />
        <div className="h-4 w-px bg-[#EAEAEA]" />
        <UserNav />
      </div>
    </header>
  );
}
