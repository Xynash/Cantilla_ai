import { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/guard";
import { PublicLandingPage } from "@/components/landing/public-landing-page";
import { AuthenticatedDashboard } from "@/components/dashboard/authenticated-dashboard";
import { loadMasterDataContext } from "@/services/decision-engine/utils/masterDataLoader";
import { listPolicyVersions } from "@/services/decision-engine/policy-config/policyService";
import { listBatchProcessingRuns } from "@/services/decision-engine/batch-processor/batchHistoryService";
import { listRequisitions } from "@/services/requisitionService";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cantill.ai — Smarter Procurement. Clearer Decisions.",
  description:
    "Manage procurement requests, evaluate suppliers, apply purchasing policies, and organize purchase decisions through one intelligent procurement workspace.",
};

export default async function HomePage() {
  const user = await getCurrentUser();

  // Unauthenticated visitors see the complete Public Landing Page
  if (!user) {
    return <PublicLandingPage />;
  }

  // Authenticated users see their real-data Procurement Dashboard Overview
  const [masterData, policies, requisitionsRes, runs] = await Promise.all([
    loadMasterDataContext(),
    listPolicyVersions().catch(() => []),
    listRequisitions({
      user,
      page: 1,
      limit: 5,
    }).catch(() => ({ requisitions: [], meta: { total: 0 } })),
    user.role === "BUYER" || user.role === "PROCUREMENT_ADMIN"
      ? listBatchProcessingRuns(user).catch(() => [])
      : Promise.resolve([]),
  ]);

  const activePolicy = policies.find((p: any) => p.status === "ACTIVE") || policies[0];

  return (
    <AuthenticatedDashboard
      userName={user.name || user.email}
      userEmail={user.email}
      userRole={user.role}
      initialStats={{
        requisitionsCount: requisitionsRes.meta?.total || 0,
        recentRequisitions: (requisitionsRes.requisitions || []).map((r: any) => ({
          prNo: r.prNo,
          plantCode: r.plantCode,
          status: r.status,
          urgency: r.urgency,
          totalEstimatedAmount: r.totalEstimatedAmount || 0,
          linesCount: r.linesCount || 1,
          createdAt: r.createdAt || new Date().toISOString(),
        })),
        suppliersCount: masterData.suppliersMap.size,
        activeSuppliersCount: masterData.activeSupplierIds.size,
        contractsCount: masterData.contracts.length,
        itemsCount: masterData.itemMasterMap.size,
        activePolicyVersion: activePolicy?.version || "5.0",
        recentRuns: runs.map((r: any) => ({
          runId: r.runId,
          batchName: r.batchName,
          policyVersion: r.policyVersion,
          totalPrLines: r.totalPrLines,
          totalRequirements: r.totalRequirements,
          totalPOs: r.totalPOs,
          totalSourcingRequests: r.totalSourcingRequests,
          totalNotProcessed: r.totalNotProcessed,
          createdAt: r.createdAt,
        })),
      }}
    />
  );
}
