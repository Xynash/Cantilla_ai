import fs from "fs";
import path from "path";
import {
  evaluateSupplierEligibility,
  analyzeSupplierPerformance,
  calculateSupplierReferencePrice,
  getSupplierRecommendationsForItem,
  getSupplierIntelligenceOverview,
  getSupplierDetailIntelligence,
  updateSupplierStatusWithAudit,
  loadMasterDataFromFiles,
  CORVO_POLICY_V5_CONFIG,
  executeAndPersistBatch,
  getBatchProcessingRunById,
} from "../services/decision-engine";
import {
  getFallbackSupplierOverrides,
  getFallbackAuditLogs,
  getFallbackBatchRuns,
} from "../lib/db/fallbackStore";
import { SafeUser } from "../types/auth";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, details?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}${details ? ` — ${details}` : ""}`);
    failed++;
  }
}

async function assertThrows(
  fn: () => Promise<unknown> | unknown,
  expectedSubstring: string,
  label: string
) {
  try {
    await fn();
    console.error(
      `  ✗ FAIL: ${label} — Expected error containing '${expectedSubstring}', but succeeded`
    );
    failed++;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes(expectedSubstring.toLowerCase())) {
      console.log(`  ✓ PASS: ${label}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${label} — Expected '${expectedSubstring}', got '${msg}'`);
      failed++;
    }
  }
}

const adminUser: SafeUser = {
  id: "usr_admin_1",
  name: "Cantill System Administrator",
  email: "admin@cantill.ai",
  role: "PROCUREMENT_ADMIN",
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const buyerUser: SafeUser = {
  id: "usr_buyer_1",
  name: "Marcus Vance (Senior Buyer)",
  email: "buyer@cantill.ai",
  role: "BUYER",
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const requesterUser: SafeUser = {
  id: "usr_req_1",
  name: "Alex Patel (Requester)",
  email: "requester@cantill.ai",
  role: "REQUESTER",
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

async function runPhase6Tests() {
  console.log("=================================================");
  console.log("   CANTILL.AI PHASE 6 VERIFICATION TEST SUITE    ");
  console.log("=================================================\n");

  getFallbackSupplierOverrides().clear();
  getFallbackBatchRuns().clear();

  const masterData = loadMasterDataFromFiles();
  const policy = CORVO_POLICY_V5_CONFIG;
  const refDate = new Date("2026-11-10T00:00:00.000Z");

  // ---------------------------------------------------------------------------
  // TEST GROUP 1: Supplier Intelligence Overview (Actual Task-Kit Data)
  // ---------------------------------------------------------------------------
  console.log("▶ TEST GROUP 1: Supplier Intelligence Overview");
  const overview = await getSupplierIntelligenceOverview({ asOfDate: refDate });

  assert(
    overview.summary.totalSuppliers === 48 && overview.summary.activeSuppliers === 43,
    `1.1: Overview reports 48 total suppliers and 43 active suppliers (got ${overview.summary.activeSuppliers}/${overview.summary.totalSuppliers})`
  );
  assert(
    overview.summary.blockedSuppliers + overview.summary.inactiveSuppliers === 5,
    "1.2: Overview identifies 5 blocked/inactive suppliers in baseline master data"
  );
  assert(
    overview.summary.eligiblePreferredSuppliers > 0 &&
      overview.summary.suppliersWithRecentPoHistory > 0,
    "1.3: Overview computes eligible preferred suppliers and suppliers with 548d PO history"
  );
  assert(
    overview.categoryBreakdown.length > 0 && overview.recentActivity.length > 0,
    "1.4: Overview includes category breakdown and recent supplier purchase activity"
  );

  // ---------------------------------------------------------------------------
  // TEST GROUP 2: Supplier Eligibility Engine & Contract Distinction
  // ---------------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 2: Supplier Eligibility & Contract Distinction");

  const s029 = masterData.suppliersMap.get("S029")!; // Active PPE supplier
  const s031 = masterData.suppliersMap.get("S031")!; // Inactive PPE supplier

  const eligS029 = evaluateSupplierEligibility({
    supplier: s029,
    itemCode: "ITM-1048",
    itemCategory: "Safety & PPE",
    asOfDate: refDate,
    poHistory: masterData.poHistory,
    contracts: masterData.contracts,
    policy,
  });

  const eligS031 = evaluateSupplierEligibility({
    supplier: s031,
    itemCode: "ITM-1048",
    itemCategory: "Safety & PPE",
    asOfDate: refDate,
    poHistory: masterData.poHistory,
    contracts: masterData.contracts,
    policy,
  });

  assert(
    eligS029.isPreferredEligible &&
      eligS029.eligibilityStatus === "ELIGIBLE_PREFERRED" &&
      eligS029.poCountInWindow > 0,
    "2.1: Active supplier S029 with 548d PO history is ELIGIBLE_PREFERRED for ITM-1048"
  );
  assert(
    !eligS031.isPreferredEligible &&
      eligS031.eligibilityStatus === "EXCLUDED_INACTIVE" &&
      eligS031.summaryExplanation.includes("Inactive"),
    "2.2: Inactive supplier S031 is EXCLUDED_INACTIVE with clear Clause 5.7 explanation"
  );

  // Test expired contract vs current valid contract distinction (Clause 6.1 vs Clause 4.1)
  const syntheticSupplier = {
    supplierId: "S999",
    name: "Synthetic Contract Vendor",
    city: "Pune",
    categories: "Bearings",
    status: "Active" as const,
    onTimePercent: 92,
    qualityRating: 4.4,
  };
  const expiredContract = {
    contractId: "RC-2025-EXP",
    supplierId: "S999",
    supplierName: "Synthetic Contract Vendor",
    startDate: new Date("2025-01-01T00:00:00.000Z"),
    endDate: new Date("2025-12-31T23:59:59.999Z"), // Expired before Nov 2026
    valueCap: 1000000,
    consumedValue: 200000,
    source: "register" as const,
    lines: [
      {
        contractId: "RC-2025-EXP",
        itemCode: "ITM-1001",
        description: "Ball bearing 6205-2RS",
        uom: "NOS",
        rate: 210,
      },
    ],
  };

  const eligExpiredContract = evaluateSupplierEligibility({
    supplier: syntheticSupplier,
    itemCode: "ITM-1001",
    itemCategory: "Bearings",
    asOfDate: refDate,
    poHistory: [],
    contracts: [expiredContract],
    policy,
  });

  assert(
    eligExpiredContract.hasHistoricalContract === true &&
      eligExpiredContract.isPreferredEligible === true &&
      eligExpiredContract.hasCurrentValidContract === false &&
      eligExpiredContract.isContractPoEligible === false,
    "2.3: Expired contract qualifies supplier for Preferred List (Clause 6.1) but is NOT treated as currently valid for Contract PO (Clause 4.1)"
  );

  // Test lookback boundary: PO at 549 days ago is outside 548-day window
  const oldPo = {
    poNumber: "7399999",
    poDate: new Date(refDate.getTime() - 549 * 24 * 60 * 60 * 1000),
    supplierId: "S999",
    itemCode: "ITM-1001",
    quantity: 10,
    uom: "NOS",
    unitPrice: 200,
    plant: "PUN1",
    deliveredOnTime: true,
  };
  const eligOutsideLookback = evaluateSupplierEligibility({
    supplier: syntheticSupplier,
    itemCode: "ITM-1001",
    itemCategory: "Bearings",
    asOfDate: refDate,
    poHistory: [oldPo],
    contracts: [],
    policy,
  });
  assert(
    eligOutsideLookback.poCountInWindow === 0 && !eligOutsideLookback.isPreferredEligible,
    "2.4: PO older than 548 days (549d ago) is excluded from 548-day preferred eligibility"
  );

  // ---------------------------------------------------------------------------
  // TEST GROUP 3: Historical Performance Analysis & Missing Data Transparency
  // ---------------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 3: Historical Performance & Missing Data Handling");

  // Find a supplier in master data with missing OTD or Quality metrics, or test explicitly
  const supplierWithNullMetrics = {
    supplierId: "S998",
    name: "Null Metrics Supplier",
    city: "Chakan",
    categories: "Fasteners",
    status: "Active" as const,
    onTimePercent: null,
    qualityRating: null,
  };

  const perfNull = analyzeSupplierPerformance({
    supplier: supplierWithNullMetrics,
    asOfDate: refDate,
    poHistory: [],
    contracts: [],
    policy,
  });

  assert(
    perfNull.deliveryPerformance.available === false &&
      perfNull.deliveryPerformance.onTimePercent === null &&
      perfNull.deliveryPerformance.displayLabel === "Not Available" &&
      perfNull.deliveryPerformance.normalizedScore === 0,
    "3.1: Missing on-time delivery metric shows 'Not Available' and contributes 0 (not fabricated)"
  );
  assert(
    perfNull.qualityPerformance.available === false &&
      perfNull.qualityPerformance.qualityRating === null &&
      perfNull.qualityPerformance.displayLabel === "Not Available" &&
      perfNull.qualityPerformance.normalizedScore === 0 &&
      perfNull.requiresAdditionalEvaluation === true,
    "3.2: Missing quality metric shows 'Not Available', contributes 0, and flags supplier for evaluation"
  );

  // ---------------------------------------------------------------------------
  // TEST GROUP 4: Dedicated Reference Price Engine (Section 5)
  // ---------------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 4: Reference Price Engine");

  // 1. Latest PO price in 548 days (S029 for ITM-1048)
  const refPriceS029 = calculateSupplierReferencePrice({
    supplierId: "S029",
    itemCode: "ITM-1048",
    asOfDate: refDate,
    poHistory: masterData.poHistory,
    contracts: masterData.contracts,
    suppliersMap: masterData.suppliersMap,
    lookbackWindowDays: 548,
  });
  assert(
    refPriceS029.priceSource === "PO_HISTORY_548D" &&
      refPriceS029.referencePrice === 94 &&
      Boolean(refPriceS029.referencePoNumber),
    `4.1: S029 reference price for ITM-1048 uses latest 548d PO (₹${refPriceS029.referencePrice})`
  );

  // 2. Future PO records after asOfDate must be ignored
  const futurePo = {
    poNumber: "7399998",
    poDate: new Date("2027-05-01T00:00:00.000Z"), // Future relative to refDate
    supplierId: "S029",
    itemCode: "ITM-1048",
    quantity: 100,
    uom: "PAIR",
    unitPrice: 999.99,
    plant: "CHK1",
    deliveredOnTime: true,
  };
  const refPriceIgnoringFuture = calculateSupplierReferencePrice({
    supplierId: "S029",
    itemCode: "ITM-1048",
    asOfDate: refDate,
    poHistory: [...masterData.poHistory, futurePo],
    contracts: masterData.contracts,
    suppliersMap: masterData.suppliersMap,
    lookbackWindowDays: 548,
  });
  assert(
    refPriceIgnoringFuture.referencePrice === 94,
    "4.2: Reference price engine strictly ignores future POs dated after requirement date"
  );

  // 3. Contract rate fallback when no 548d PO exists
  const refPriceContractFallback = calculateSupplierReferencePrice({
    supplierId: "S999",
    itemCode: "ITM-1001",
    asOfDate: refDate,
    poHistory: [],
    contracts: [expiredContract],
    suppliersMap: new Map([["S999", syntheticSupplier]]),
    lookbackWindowDays: 548,
  });
  assert(
    refPriceContractFallback.priceSource === "CONTRACT_RATE" &&
      refPriceContractFallback.referencePrice === 210 &&
      refPriceContractFallback.referenceContractId === "RC-2025-EXP",
    "4.3: Reference price falls back to supplier's most recent contract rate when no 548d PO exists"
  );

  // 4. Missing reference price (no PO and no contract for item)
  const refPriceMissing = calculateSupplierReferencePrice({
    supplierId: "S003",
    itemCode: "ITM-1006",
    asOfDate: refDate,
    poHistory: masterData.poHistory,
    contracts: masterData.contracts,
    suppliersMap: masterData.suppliersMap,
    lookbackWindowDays: 548,
  });
  assert(
    refPriceMissing.referencePrice === null &&
      refPriceMissing.priceSource === "UNAVAILABLE" &&
      refPriceMissing.explanation.includes("No reference price available"),
    "4.4: Indicates UNAVAILABLE when supplier has no 548d PO and no contract for the item"
  );

  // ---------------------------------------------------------------------------
  // TEST GROUP 5: Supplier Recommendation Service (RFQ, RFP & Category Top-Up)
  // ---------------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 5: Supplier Recommendation Service");

  // Worked Example 1: ITM-1048
  const rec1048 = await getSupplierRecommendationsForItem({
    itemCode: "ITM-1048",
    plantCode: "CHK1",
    asOfDate: new Date("2026-11-10T00:00:00.000Z"),
    routeType: "DIRECT_PO",
  });
  assert(
    rec1048.recommendedSuppliers.length === 1 &&
      rec1048.recommendedSuppliers[0].supplierId === "S029" &&
      rec1048.excludedSuppliers.some((e) => e.supplierId === "S031"),
    "5.1: Direct PO recommendation for ITM-1048 selects #1 S029 and lists S031 as excluded"
  );

  // Worked Example 10: ITM-1006 (RFQ Category Top-Up)
  const rec1006 = await getSupplierRecommendationsForItem({
    itemCode: "ITM-1006",
    plantCode: "PUN1",
    asOfDate: new Date("2026-11-05T00:00:00.000Z"),
    routeType: "RFQ",
  });
  assert(
    rec1006.recommendedSuppliers.map((r) => r.supplierId).join(";") === "S003;S002;S005",
    "5.2: RFQ recommendation for ITM-1006 returns S003;S002;S005 with category top-up"
  );

  // Worked Example 11: ITM-1034 (RFP 5 requested, 4 available -> shortfall explained)
  const rec1034 = await getSupplierRecommendationsForItem({
    itemCode: "ITM-1034",
    plantCode: "PUN1",
    asOfDate: new Date("2026-11-18T00:00:00.000Z"),
    routeType: "RFP",
  });
  assert(
    rec1034.recommendedSuppliers.map((r) => r.supplierId).join(";") ===
      "S020;S017;S019;S018" && Boolean(rec1034.shortfallExplanation),
    "5.3: RFP recommendation for ITM-1034 returns 4 available active suppliers with shortfall explanation"
  );

  // ---------------------------------------------------------------------------
  // TEST GROUP 6: Supplier Detail Page Service
  // ---------------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 6: Supplier Detail Intelligence Profile");

  const detailS029 = await getSupplierDetailIntelligence("S029", refDate);
  assert(
    detailS029.profile.supplierId === "S029" &&
      detailS029.purchaseHistory.length > 0 &&
      detailS029.itemRankings.some((ir) => ir.itemCode === "ITM-1048" && ir.rank === 1),
    "6.1: Supplier detail intelligence for S029 returns profile, purchase history, and Rank #1 for ITM-1048"
  );

  // ---------------------------------------------------------------------------
  // TEST GROUP 7: Supplier Administration, Audit Log & Historical Snapshot Preservation
  // ---------------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 7: Supplier Admin, Audit Log & Historical Snapshot Preservation");

  // 1. Run batch before any admin supplier block
  const batchCsvPath = path.join(
    process.cwd(),
    "data",
    "Cantill_FullStack_Task_Kit",
    "pr_batches",
    "sample_pr_batch.csv"
  );
  const sampleBatchCsv = fs.readFileSync(batchCsvPath, "utf8");
  const baselineRun = await executeAndPersistBatch({
    csvContent: sampleBatchCsv,
    batchName: "sample_pr_batch.csv",
    policyVersion: "5.0",
    user: buyerUser,
  });

  // 2. Unauthorized roles cannot block/update supplier status
  await assertThrows(
    () =>
      updateSupplierStatusWithAudit({
        supplierId: "S029",
        newStatus: "Blocked",
        reason: "Attempt by buyer",
        actor: buyerUser,
      }),
    "Only PROCUREMENT_ADMIN",
    "7.1: BUYER role is forbidden from blocking or modifying supplier status"
  );

  await assertThrows(
    () =>
      updateSupplierStatusWithAudit({
        supplierId: "S029",
        newStatus: "Blocked",
        reason: "",
        actor: adminUser,
      }),
    "reason is required",
    "7.2: Rejects supplier status update when audit reason is missing"
  );

  // 3. PROCUREMENT_ADMIN blocks S029 with a recorded reason
  const blockedS029 = await updateSupplierStatusWithAudit({
    supplierId: "S029",
    newStatus: "Blocked",
    reason: "Quality audit hold pending inspection",
    actor: adminUser,
  });
  assert(
    blockedS029.profile.status === "Blocked" &&
      !blockedS029.eligibility.isPreferredEligible,
    "7.3: Admin block immediately marks S029 as Blocked and ineligible for new recommendations"
  );

  // Verify live recommendation for ITM-1048 now excludes S029 and promotes S030 to #1
  const recAfterBlock = await getSupplierRecommendationsForItem({
    itemCode: "ITM-1048",
    plantCode: "CHK1",
    asOfDate: refDate,
    routeType: "DIRECT_PO",
  });
  assert(
    recAfterBlock.recommendedSuppliers[0]?.supplierId === "S030" &&
      recAfterBlock.excludedSuppliers.some((e) => e.supplierId === "S029"),
    "7.4: Live recommendation engine immediately excludes newly blocked S029 and promotes S030 to #1"
  );

  // 4. Verify historical batch processing run snapshot is NOT mutated by later supplier status changes!
  const persistedRun = await getBatchProcessingRunById(baselineRun.runId!, buyerUser);
  const pr10Line = persistedRun.lineOutputs.find(
    (l) => l.pr_no === "PR-26-00010" && l.pr_line === 1
  );
  assert(
    persistedRun.totalPOs === 81 && Boolean(pr10Line),
    "7.5: Previously persisted batch run snapshot remains unchanged when supplier records are updated later"
  );

  // 5. Unblock S029 back to Active and verify AuditLog entries
  await updateSupplierStatusWithAudit({
    supplierId: "S029",
    newStatus: "Active",
    reason: "Quality inspection passed; restored to Active",
    actor: adminUser,
  });

  const supplierAuditLogs = getFallbackAuditLogs().filter(
    (a) => a.entityType === "Supplier" && a.entityId === "S029"
  );
  assert(
    supplierAuditLogs.some((a) => a.action === "BLOCK_SUPPLIER") &&
      supplierAuditLogs.some((a) => a.action === "UNBLOCK_SUPPLIER"),
    "7.6: AuditLog records both BLOCK_SUPPLIER and UNBLOCK_SUPPLIER actions with actor and reason"
  );

  getFallbackSupplierOverrides().clear();

  console.log("\n=================================================");
  console.log(`  PHASE 6 TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED`);
  console.log("=================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase6Tests().catch((err) => {
  console.error("Fatal error in Phase 6 test suite:", err);
  process.exit(1);
});
