"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import {
  isProtectedPagePath,
  isRouteAuthorizedForRole,
} from "@/lib/auth/route-permissions";
import { UserRole } from "@/types/auth";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const userRole =
    ((session?.user as unknown as { role?: UserRole })?.role) || null;

  // Full-bleed layout for Sign In page OR Public Landing Page (unauthenticated on "/")
  const isAuthRoute = pathname.startsWith("/auth/");
  const isPublicLanding = pathname === "/" && status !== "authenticated";

  if (isAuthRoute || isPublicLanding) {
    return (
      <div className="min-h-screen bg-[#FFFFFF] text-[#171717] font-sans">
        {children}
      </div>
    );
  }

  // Enforce role-based authorization on direct URL navigation
  const isRestrictedForRole =
    status === "authenticated" &&
    isProtectedPagePath(pathname) &&
    !isRouteAuthorizedForRole(pathname, userRole);

  return (
    <div className="relative flex min-h-screen w-full overflow-x-hidden bg-[#FAFAFC] text-[#171717] font-sans">
      {/* Sidebar */}
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((prev) => !prev)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Main Content Area with Balanced Margins */}
      <div className="flex flex-1 flex-col min-w-0 overflow-x-hidden">
        <Header onMobileMenuToggle={() => setMobileOpen((prev) => !prev)} />
        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1340px] space-y-6">
            {isRestrictedForRole ? (
              <div className="rounded-3xl border border-[#EAEAEA] bg-white p-10 text-center space-y-4 max-w-xl mx-auto mt-10">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FCE3EF] text-[#171717]">
                  <ShieldAlert className="h-6 w-6 text-[#6938EF]" />
                </div>
                <div className="space-y-1.5">
                  <h1 className="text-lg font-semibold text-[#171717]">
                    Access Restricted for Current Role
                  </h1>
                  <p className="text-xs text-[#6B7280] leading-relaxed">
                    Your current role ({userRole || "REQUESTER"}) does not have permission to view{" "}
                    <span className="font-mono font-medium text-[#171717]">{pathname}</span>.
                    Please contact a Procurement Administrator if you require elevated access.
                  </p>
                </div>
                <div className="pt-2">
                  <Link
                    href="/"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#6938EF] px-4 py-2 text-xs font-medium text-white hover:bg-[#5928DF] transition-colors"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Return to Overview</span>
                  </Link>
                </div>
              </div>
            ) : (
              children
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
