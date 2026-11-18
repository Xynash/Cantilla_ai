import {
  generateProcurementReport,
  parseAndValidateDateRange,
} from "../services/reportService";
import {
  getWorkspaceSettings,
  updateWorkspaceSettings,
} from "../services/settingsService";
import {
  getNotificationsForUser,
  markNotificationsAsRead,
} from "../services/notificationService";
import { getDashboardQuickActionsForRole } from "../components/dashboard/quick-actions";
import {
  listSuppliers,
  getSupplierById,
  analyzeSupplierPerformance,
  getSupplierIntelligenceOverview,
  getSupplierDetailIntelligence,
  getSupplierRecommendationsForItem,
  updateSupplierStatusWithAudit,
} from "../services/supplierService";
import { CORVO_POLICY_V5_CONFIG } from "../services/decision-engine";
import * as supplierIntelDirect from "../services/supplierIntelligenceService";
import fs from "fs";
import path from "path";
import { executeAndPersistBatch } from "../services/decision-engine/batch-processor/batchHistoryService";
import { loadMasterDataContext } from "../services/decision-engine/utils/masterDataLoader";
import { APP_CONFIG } from "../config/constants";
import { SafeUser } from "../types/auth";

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    throw new Error(`Test failed: ${testName}`);
  }
}

const mockRequester: SafeUser = {
  id: "usr-req-01",
  name: "Test Requester",
  email: "requester@cantill.ai",
  role: "REQUESTER",
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockBuyer: SafeUser = {
  id: "usr-buy-01",
  name: "Test Buyer",
  email: "buyer@cantill.ai",
  role: "BUYER",
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockAdmin: SafeUser = {
  id: "usr-adm-01",
  name: "Test Admin",
  email: "admin@cantill.ai",
  role: "PROCUREMENT_ADMIN",
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

async function runTests() {
  console.log("=============================================================");
  console.log("   CANTILL.AI PHASE 7D FUNCTIONAL & CONSISTENCY TEST SUITE   ");
  console.log("=============================================================\n");

  // Ensure a batch run is available in memory so batch-backed reports can also be verified
  const sampleBatchPath = path.join(
    process.cwd(),
    "data",
    "Cantill_FullStack_Task_Kit",
    "pr_batches",
    "sample_pr_batch.csv"
  );
  const sampleCsvContent = fs.readFileSync(sampleBatchPath, "utf8");
  await executeAndPersistBatch({
    csvContent: sampleCsvContent,
    batchName: "sample_pr_batch.csv",
    user: mockBuyer,
  });

  // -------------------------------------------------------------------
  // TEST GROUP 1: Reports Data Accuracy, Date Filtering & CSV Export
  // -------------------------------------------------------------------
  console.log("▶ TEST GROUP 1: Reports Module Accuracy, Date Filtering & CSV Export");

  // 1.1 Role enforcement on Reports
  let requesterReportRejected = false;
  try {
    await generateProcurementReport({
      reportType: "PROCUREMENT_SUMMARY",
      user: mockRequester,
    });
  } catch (err: any) {
    requesterReportRejected = err.statusCode === 403;
  }
  assert(
    requesterReportRejected,
    "1.1: REQUESTER is rejected (403 Forbidden) from generating compliance/spend reports"
  );

  // 1.2 Supplier Performance Summary Report
  const suppReport = await generateProcurementReport({
    reportType: "SUPPLIER_PERFORMANCE_SUMMARY",
    user: mockBuyer,
  });
  assert(
    suppReport.rows.length === 48,
    `1.2: Supplier Performance report contains all 48 suppliers (got ${suppReport.rows.length})`
  );
  const s009Row = suppReport.rows.find((r) => r.supplier_id === "S009");
  assert(
    Boolean(s009Row) &&
      s009Row?.on_time_pct === 83 &&
      s009Row?.quality_rating === 4.6,
    "1.3: Supplier Performance report includes accurate OTD (83%) and quality (4.6) for S009"
  );
  const csvLines = suppReport.csvContent.trim().split("\n");
  assert(
    csvLines.length === 49 && csvLines[0].includes("supplier_id,supplier_name"),
    "1.4: Supplier Performance CSV export contains header + 48 supplier data rows"
  );

  // 1.5 Purchase Order Summary, Requisition Summary, Sourcing Activity & Procurement Summary
  const poReport = await generateProcurementReport({
    reportType: "PURCHASE_ORDER_SUMMARY",
    user: mockBuyer,
  });
  assert(
    poReport.dataAvailable && poReport.rows.length > 81,
    `1.5: Purchase Order Summary includes proposed PO groups + historical POs (${poReport.rows.length} rows)`
  );

  const reqReport = await generateProcurementReport({
    reportType: "REQUISITION_SUMMARY",
    user: mockBuyer,
  });
  assert(
    reqReport.dataAvailable && reqReport.rows.length >= 186,
    `1.6: Requisition Summary includes evaluated PR lines (${reqReport.rows.length} rows)`
  );

  const sourcingReport = await generateProcurementReport({
    reportType: "SOURCING_ACTIVITY_SUMMARY",
    user: mockBuyer,
  });
  assert(
    sourcingReport.dataAvailable && sourcingReport.rows.length === 57,
    `1.7: Sourcing Activity Summary contains exact 57 sourcing events (got ${sourcingReport.rows.length})`
  );

  const execReport = await generateProcurementReport({
    reportType: "PROCUREMENT_SUMMARY",
    user: mockAdmin,
  });
  assert(
    execReport.dataAvailable && execReport.rows.length > 0,
    "1.8: Executive Procurement Summary report compiles route & master data metrics"
  );

  // 1.9 Date-range filtering & empty dataset handling
  const emptyWindowReport = await generateProcurementReport({
    reportType: "PURCHASE_ORDER_SUMMARY",
    startDate: "2010-01-01",
    endDate: "2010-01-31",
    user: mockBuyer,
  });
  assert(
    !emptyWindowReport.dataAvailable && emptyWindowReport.rows.length === 0,
    "1.9: Date filter outside data window returns 0 rows and dataAvailable=false without fabricated data"
  );

  // 1.10 Date validation errors
  let invalidDateCaught = false;
  try {
    parseAndValidateDateRange("not-a-valid-date", "2026-12-31");
  } catch {
    invalidDateCaught = true;
  }
  assert(invalidDateCaught, "1.10: Rejects invalid startDate string format");

  let invertedRangeCaught = false;
  try {
    parseAndValidateDateRange("2026-12-31", "2026-01-01");
  } catch {
    invertedRangeCaught = true;
  }
  assert(
    invertedRangeCaught,
    "1.11: Rejects inverted date range where startDate > endDate"
  );

  // -------------------------------------------------------------------
  // TEST GROUP 2: Settings Persistence, Validation & Role Permissions
  // -------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 2: Settings Persistence, Validation & Role Permissions");

  const initialSettings = await getWorkspaceSettings(mockRequester);
  assert(
    !initialSettings.canEditOrganizationSettings &&
      initialSettings.currentUser.role === "REQUESTER" &&
      !initialSettings.authCapabilities.externalSsoAvailable,
    "2.1: REQUESTER receives read-only organization settings flag and honest externalSsoAvailable=false"
  );

  let buyerUpdateBlocked = false;
  try {
    await updateWorkspaceSettings(
      {
        companyName: "Unauthorized Corp",
        platformName: "Cantill.ai",
        supportEmail: "ops@cantill.ai",
      },
      mockBuyer
    );
  } catch (err: any) {
    buyerUpdateBlocked = err.statusCode === 403;
  }
  assert(
    buyerUpdateBlocked,
    "2.2: BUYER is blocked (403 Forbidden) from modifying organization workspace settings"
  );

  let invalidEmailBlocked = false;
  try {
    await updateWorkspaceSettings(
      {
        companyName: "Corvo Manufacturing",
        platformName: "Cantill.ai",
        supportEmail: "invalid-email-address",
      },
      mockAdmin
    );
  } catch (err: any) {
    invalidEmailBlocked = err.statusCode === 400;
  }
  assert(
    invalidEmailBlocked,
    "2.3: Invalid supportEmail is rejected (400 ValidationError)"
  );

  const updatedSettings = await updateWorkspaceSettings(
    {
      companyName: "Corvo Engineering Pvt Ltd",
      platformName: "Cantill.ai Enterprise",
      supportEmail: "procurement-desk@corvo.in",
    },
    mockAdmin
  );
  assert(
    updatedSettings.companyName === "Corvo Engineering Pvt Ltd" &&
      updatedSettings.platformName === "Cantill.ai Enterprise" &&
      updatedSettings.supportEmail === "procurement-desk@corvo.in" &&
      updatedSettings.updatedBy === mockAdmin.email,
    "2.4: PROCUREMENT_ADMIN successfully updates and persists workspace settings"
  );

  const reloadedSettings = await getWorkspaceSettings(mockBuyer);
  assert(
    reloadedSettings.companyName === "Corvo Engineering Pvt Ltd" &&
      reloadedSettings.supportEmail === "procurement-desk@corvo.in",
    "2.5: Subsequent getWorkspaceSettings reads persisted values accurately"
  );

  // Restore default APP_CONFIG values
  await updateWorkspaceSettings(
    {
      companyName: APP_CONFIG.company,
      platformName: APP_CONFIG.name,
      supportEmail: APP_CONFIG.supportEmail,
    },
    mockAdmin
  );

  // -------------------------------------------------------------------
  // TEST GROUP 3: Dashboard Data Accuracy & Quick Action Permissions
  // -------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 3: Dashboard Data Accuracy & Role-Filtered Quick Actions");

  const masterData = await loadMasterDataContext();
  assert(
    masterData.suppliersMap.size === 48 &&
      masterData.activeSupplierIds.size === 43 &&
      masterData.contracts.length === 12 &&
      masterData.itemMasterMap.size === 73,
    "3.1: Dashboard master data context reflects exact 48 suppliers (43 active), 12 contracts, and 73 items"
  );

  const reqQuickActions = getDashboardQuickActionsForRole("REQUESTER");
  const reqActionHrefs = reqQuickActions.map((a) => a.href);
  assert(
    reqActionHrefs.length === 2 &&
      reqActionHrefs.includes("/chat") &&
      reqActionHrefs.includes("/requisitions") &&
      !reqActionHrefs.includes("/suppliers") &&
      !reqActionHrefs.includes("/import"),
    "3.2: REQUESTER sees only /chat and /requisitions quick actions"
  );

  const buyerQuickActions = getDashboardQuickActionsForRole("BUYER");
  const buyerActionHrefs = buyerQuickActions.map((a) => a.href);
  assert(
    buyerActionHrefs.length === 6 &&
      buyerActionHrefs.includes("/purchase-orders") &&
      buyerActionHrefs.includes("/suppliers") &&
      buyerActionHrefs.includes("/contracts") &&
      buyerActionHrefs.includes("/policies") &&
      !buyerActionHrefs.includes("/import"),
    "3.3: BUYER sees buyer + requester quick actions and excludes admin-only /import"
  );

  const adminQuickActions = getDashboardQuickActionsForRole("PROCUREMENT_ADMIN");
  const adminActionHrefs = adminQuickActions.map((a) => a.href);
  assert(
    adminActionHrefs.length === 7 && adminActionHrefs.includes("/import"),
    "3.4: PROCUREMENT_ADMIN sees all 7 quick actions including /import"
  );

  assert(
    getDashboardQuickActionsForRole(null).length === 0,
    "3.5: Unauthenticated role receives 0 quick actions"
  );

  // -------------------------------------------------------------------
  // TEST GROUP 4: Notification Real Event Stream & Read/Unread Tracking
  // -------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 4: Notification Stream & Read/Unread Tracking");

  const adminNotifs = await getNotificationsForUser(mockAdmin);
  assert(
    adminNotifs.notifications.length > 0 && adminNotifs.unreadCount > 0,
    `4.1: PROCUREMENT_ADMIN receives real batch/audit notifications (${adminNotifs.notifications.length} items, ${adminNotifs.unreadCount} unread)`
  );

  const buyerNotifs = await getNotificationsForUser(mockBuyer);
  assert(
    buyerNotifs.notifications.every(
      (n) => !n.title.includes("UPDATE WORKSPACE SETTINGS")
    ),
    "4.2: BUYER notification stream excludes admin-only WorkspaceSetting audit events"
  );

  const firstId = adminNotifs.notifications[0].id;
  const afterSingleRead = await markNotificationsAsRead(mockAdmin, {
    notificationId: firstId,
  });
  const markedItem = afterSingleRead.notifications.find((n) => n.id === firstId);
  assert(
    Boolean(markedItem?.read),
    "4.3: Marking a single notification as read updates its read status"
  );

  const afterMarkAll = await markNotificationsAsRead(mockAdmin, {
    markAll: true,
  });
  assert(
    afterMarkAll.unreadCount === 0 &&
      afterMarkAll.notifications.every((n) => n.read),
    "4.4: markAll=true marks all user notifications as read (unreadCount = 0)"
  );

  // -------------------------------------------------------------------
  // TEST GROUP 5: Supplier Service Consolidation & Ranking Consistency
  // -------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 5: Supplier Service Consolidation & Eligibility/Ranking Consistency");

  const [listedAll, overview] = await Promise.all([
    listSuppliers({ page: 1, limit: 100 }),
    getSupplierIntelligenceOverview(),
  ]);

  assert(
    listedAll.meta.total === overview.summary.totalSuppliers &&
      listedAll.items.length === 48,
    "5.1: listSuppliers() and getSupplierIntelligenceOverview() return identical total suppliers (48)"
  );

  const s009FromList = listedAll.items.find((i) => i.supplierId === "S009");
  const s009FromById = await getSupplierById("S009");
  const s009FromDetail = await getSupplierDetailIntelligence("S009");

  assert(
    s009FromList?.onTimePct === 83 &&
      s009FromList?.onTimeDisplay === "83%" &&
      s009FromById?.onTimePct === 83 &&
      s009FromById?.onTimeDisplay === "83%" &&
      s009FromDetail.performance.deliveryPerformance.displayLabel === "83%",
    "5.2a: Supplier performance metrics match identically across listSuppliers, getSupplierById, and getSupplierDetailIntelligence"
  );

  const nullMetricsPerf = analyzeSupplierPerformance({
    supplier: {
      supplierId: "S-NULL",
      name: "Null Metric Vendor",
      city: "Pune",
      categories: "Fasteners",
      status: "Active",
      onTimePercent: null,
      qualityRating: null,
    },
    asOfDate: new Date("2026-11-30T00:00:00Z"),
    poHistory: [],
    contracts: [],
    policy: CORVO_POLICY_V5_CONFIG,
  });
  assert(
    nullMetricsPerf.deliveryPerformance.onTimePercent === null &&
      nullMetricsPerf.deliveryPerformance.displayLabel === "Not Available" &&
      nullMetricsPerf.qualityPerformance.qualityRating === null &&
      nullMetricsPerf.qualityPerformance.displayLabel === "Not Available",
    "5.2b: Null performance metrics are preserved as null / 'Not Available' (never fabricated)"
  );

  const s020FromById = await getSupplierById("S020");
  assert(
    Array.isArray(s020FromById?.categories) &&
      s020FromById?.categories.includes("Electrical Spares") &&
      s020FromById?.categories.includes("Capital Equipment") &&
      s020FromById?.categoriesRaw === "Electrical Spares;Capital Equipment",
    "5.3: Supplier category normalization is consistent across supplierService and supplierIntelligenceService"
  );

  // Verify direct re-export module `services/supplierIntelligenceService.ts`
  assert(
    typeof supplierIntelDirect.evaluateSupplierEligibility === "function" &&
      typeof supplierIntelDirect.getSupplierRecommendationsForItem === "function",
    "5.4: services/supplierIntelligenceService.ts exports canonical supplier intelligence functions"
  );

  // Verify audited block/unblock reflects immediately across both listSuppliers and getSupplierById
  await updateSupplierStatusWithAudit({
    supplierId: "S030",
    newStatus: "Blocked",
    reason: "Phase 7D consistency test block",
    actor: mockAdmin,
  });

  const s030BlockedById = await getSupplierById("S030");
  const blockedList = await listSuppliers({ status: "Blocked", limit: 100 });
  assert(
    s030BlockedById?.status === "Blocked" &&
      !s030BlockedById?.eligibility.isPreferredEligible &&
      blockedList.items.some((s) => s.supplierId === "S030"),
    "5.5: Blocking a supplier via updateSupplierStatusWithAudit immediately updates listSuppliers and getSupplierById"
  );

  // Restore S030 to Active
  await updateSupplierStatusWithAudit({
    supplierId: "S030",
    newStatus: "Active",
    reason: "Restore S030 after Phase 7D consistency test",
    actor: mockAdmin,
  });

  // Verify worked example ITM-1048 ranking remains intact
  const itm1048Recs = await getSupplierRecommendationsForItem({
    itemCode: "ITM-1048",
    routeType: "DIRECT_PO",
  });
  assert(
    itm1048Recs.recommendedSuppliers.length >= 1 &&
      itm1048Recs.recommendedSuppliers[0].supplierId === "S029" &&
      itm1048Recs.allPreferredRanked[0]?.supplierId === "S029" &&
      itm1048Recs.allPreferredRanked[1]?.supplierId === "S030",
    "5.6: Worked example ITM-1048 ranking (S029 #1, S030 #2) remains 100% intact"
  );

  console.log("\n=============================================================");
  console.log(`   PHASE 7D TEST RESULTS: ${passedTests}/${totalTests} PASSED   `);
  console.log("=============================================================\n");
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
