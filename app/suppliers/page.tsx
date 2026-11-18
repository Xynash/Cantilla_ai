import * as React from "react";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/guard";
import { SupplierIntelligenceWorkspace } from "@/components/suppliers/supplier-intelligence-workspace";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/signin?callbackUrl=/suppliers");
  }

  if (user.role !== "BUYER" && user.role !== "PROCUREMENT_ADMIN") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50/60 p-8 text-center space-y-2">
        <ShieldAlert className="h-8 w-8 text-red-600 mx-auto" />
        <h2 className="text-base font-semibold text-[#171717]">
          Buyer or Procurement Admin Authorization Required
        </h2>
        <p className="text-xs text-[#6B7280] max-w-md mx-auto">
          Access to the Preferred Supplier Engine &amp; Supplier Intelligence is restricted to{" "}
          <span className="font-medium text-[#171717]">BUYER</span> and{" "}
          <span className="font-medium text-[#171717]">PROCUREMENT_ADMIN</span> roles.
        </p>
      </div>
    );
  }

  return <SupplierIntelligenceWorkspace userRole={user.role} />;
}
