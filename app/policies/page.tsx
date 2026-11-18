import * as React from "react";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/guard";
import { PolicyManagementWorkspace } from "@/components/policies/policy-management-workspace";

export const dynamic = "force-dynamic";

export default async function PoliciesPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/signin?callbackUrl=/policies");
  }

  if (user.role !== "PROCUREMENT_ADMIN" && user.role !== "BUYER") {
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 p-6 text-center space-y-2">
        <ShieldAlert className="h-8 w-8 text-red-600 dark:text-red-400 mx-auto" />
        <h2 className="text-base font-bold text-foreground">
          Procurement Administration Authorization Required
        </h2>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">
          Access to Procurement Policy Management &amp; Version Control is restricted to{" "}
          <span className="font-semibold text-foreground">PROCUREMENT_ADMIN</span> and{" "}
          <span className="font-semibold text-foreground">BUYER</span> roles.
        </p>
      </div>
    );
  }

  return <PolicyManagementWorkspace userRole={user.role} userEmail={user.email} />;
}
