import * as React from "react";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/guard";
import { BuyerDecisionWorkspace } from "@/components/decisions/buyer-decision-workspace";

export const dynamic = "force-dynamic";

export default async function SourcingRequestsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/signin?callbackUrl=/sourcing-requests");
  }

  const role = user.role;
  if (role !== "BUYER" && role !== "PROCUREMENT_ADMIN") {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50/60 p-8 text-center space-y-2">
        <ShieldAlert className="h-8 w-8 text-red-600 mx-auto" />
        <h2 className="text-base font-bold text-[#171717]">
          Buyer Authorization Required
        </h2>
        <p className="text-xs text-[#6B7280] max-w-md mx-auto">
          Access to Sourcing Requests (RFQ, RFP, Capex, and New Item Sourcing) is restricted to{" "}
          <span className="font-semibold text-[#171717]">BUYER</span> and{" "}
          <span className="font-semibold text-[#171717]">PROCUREMENT_ADMIN</span> roles.
        </p>
      </div>
    );
  }

  return <BuyerDecisionWorkspace initialTab="sourcing" />;
}
