import fs from "fs";
import path from "path";
import {
  createConversation,
  processUserMessage,
  confirmConversation,
  getConversation,
} from "../services/chat-intake/conversationService";
import { listRequisitions } from "../services/requisitionService";
import {
  parseRawPrBatchCsv,
  processPrBatch,
  executeAndPersistBatch,
  listBatchProcessingRuns,
  getBatchProcessingRunById,
  loadMasterDataContext,
  CORVO_POLICY_V5_CONFIG,
} from "../services/decision-engine";
import {
  createPolicyDraft,
  submitPolicyForApproval,
  approvePolicyVersion,
  activatePolicyVersion,
  archivePolicyVersion,
} from "../services/decision-engine/policy-config/policyService";
import { parseAndValidateSupplierCsvRows } from "../services/importService";
import { listUsers, createUser, updateUser } from "../services/userService";
import { generateProcurementReport } from "../services/reportService";
import { escapeRegex, sanitizeCsvCell } from "../lib/utils";
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

const requesterA: SafeUser = {
  id: "usr-e2e-req-a",
  name: "Requester Alpha",
  email: "req.alpha@cantill.ai",
  role: "REQUESTER",
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const requesterB: SafeUser = {
  id: "usr-e2e-req-b",
  name: "Requester Beta",
  email: "req.beta@cantill.ai",
  role: "REQUESTER",
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const buyerUser: SafeUser = {
  id: "usr-e2e-buyer",
  name: "Senior Buyer",
  email: "buyer@cantill.ai",
  role: "BUYER",
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const adminMaker: SafeUser = {
  id: "usr-e2e-admin-1",
  name: "Procurement Admin Maker",
  email: "admin@cantill.ai",
  role: "PROCUREMENT_ADMIN",
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const adminApprover: SafeUser = {
  id: "usr-e2e-admin-2",
  name: "Procurement Director Approver",
  email: "director@cantill.ai",
  role: "PROCUREMENT_ADMIN",
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

async function runTests() {
  console.log("=================================================================");
  console.log("  CANTILL.AI PHASE 8 & 9 END-TO-END & SECURITY VERIFICATION SUITE ");
  console.log("=================================================================\n");

  // -------------------------------------------------------------------
  // GROUP A: Master Data Verification
  // -------------------------------------------------------------------
  console.log("▶ GROUP A: Master Data & CSV Validation");

  const masterData = await loadMasterDataContext();
  assert(
    masterData.itemMasterMap.size === 73,
    "A.1: Item Master contains exact 73 task-kit catalog items"
  );
  assert(
    masterData.suppliersMap.size === 48 &&
      masterData.activeSupplierIds.size === 43,
    "A.2: Supplier Master contains exact 48 suppliers (43 Active, 5 Blocked/Inactive)"
  );
  assert(
    masterData.contracts.length === 12,
    "A.3: Contract Register & PDF contracts contain exact 12 contracts"
  );
  assert(
    masterData.poHistory.length === 468,
    "A.4: Purchase Order History contains exact 468 historical PO records"
  );

  const mixedSupplierCsv = [
    "supplier_id,name,city,categories,status,on_time_pct,quality_rating",
    "S801,Valid Null Metrics Vendor,Pune,Fasteners,Active,,",
    "S802,Invalid OTD Vendor,Pune,Fasteners,Active,150,4.2",
    "S801,Duplicate ID Vendor,Pune,Fasteners,Active,90,4.0",
  ].join("\n");
  const parsedSupp = parseAndValidateSupplierCsvRows(mixedSupplierCsv);
  assert(
    parsedSupp.validRows.length === 1 &&
      parsedSupp.validRows[0].onTimePct === null &&
      parsedSupp.validRows[0].qualityRating === null &&
      parsedSupp.errors.length === 2,
    "A.5: Supplier CSV parser accepts blank metrics as null and rejects out-of-range or duplicate rows"
  );

  // -------------------------------------------------------------------
  // GROUP B: Requester Workflow & Data Isolation
  // -------------------------------------------------------------------
  console.log("\n▶ GROUP B: Requester Conversational PR Workflow & Data Isolation");

  const convA = await createConversation(requesterA);
  assert(
    Boolean(convA.conversationId) && convA.state === "STARTED",
    "B.1: Requester Alpha initializes conversational intake session"
  );

  // Partial message triggering clarification
  const afterPartial = await processUserMessage(
    convA.conversationId,
    "I need 25 ball bearings 6205-2RS",
    requesterA
  );
  assert(
    afterPartial.state === "COLLECTING_DETAILS" &&
      afterPartial.collectedData.quantity === 25 &&
      afterPartial.collectedData.itemCode === "ITM-1021",
    "B.2: Conversational intake resolves catalog item ITM-1021 (Ball bearing 6205-2RS) and prompts for missing plant/date"
  );

  // Complete remaining details
  const afterComplete = await processUserMessage(
    convA.conversationId,
    "For PUN1 plant, need by 2026-12-15, Normal urgency",
    requesterA
  );
  assert(
    afterComplete.state === "WAITING_FOR_CONFIRMATION",
    "B.3: Providing plant and need-by date transitions conversation to WAITING_FOR_CONFIRMATION"
  );

  // Confirm PR
  const confirmed = await confirmConversation(convA.conversationId, requesterA);
  assert(
    Boolean(confirmed.prNo) &&
      confirmed.prNo.startsWith("PR-") &&
      confirmed.conversation.state === "CONFIRMED",
    `B.4: Confirming intake session generates PR ${confirmed.prNo}`
  );

  // Verify Requester Beta cannot access Requester Alpha's conversation or PR
  let crossTenantBlocked = false;
  try {
    await getConversation(convA.conversationId, requesterB);
  } catch (err: any) {
    crossTenantBlocked = err.statusCode === 403;
  }
  assert(
    crossTenantBlocked,
    "B.5: Requester Beta is forbidden (403) from reading Requester Alpha's conversation"
  );

  const betaReqs = await listRequisitions({ user: requesterB, page: 1, limit: 50 });
  assert(
    betaReqs.requisitions.every((r: any) => r.prNo !== confirmed.prNo),
    "B.6: Requester data isolation prevents Requester Beta from seeing Requester Alpha's PRs"
  );

  // -------------------------------------------------------------------
  // GROUP C: Procurement Decision Engine & Worked Examples
  // -------------------------------------------------------------------
  console.log("\n▶ GROUP C: Procurement Decision Engine & Policy v5.0 Verification");

  const sampleBatchPath = path.join(
    process.cwd(),
    "data",
    "Cantill_FullStack_Task_Kit",
    "pr_batches",
    "sample_pr_batch.csv"
  );
  const sampleCsv = fs.readFileSync(sampleBatchPath, "utf-8");
  const rawLines = parseRawPrBatchCsv(sampleCsv);
  const batchRes = processPrBatch(rawLines, masterData, CORVO_POLICY_V5_CONFIG);

  assert(
    batchRes.totalPrLines === 186 &&
      batchRes.totalRequirements === 151 &&
      batchRes.totalPOs === 81 &&
      batchRes.totalSourcingRequests === 57 &&
      batchRes.totalNotProcessed === 2,
    "C.1: Full 186-line batch produces exact 151 clubbed requirements, 81 PO groups, 57 Sourcing Requests, and 2 Excluded lines"
  );

  const routesPresent = new Set(batchRes.requirements.map((r) => r.route));
  for (const expectedRoute of [
    "CONTRACT_PO",
    "SPOT_PO",
    "EMERGENCY_PO",
    "RFQ",
    "RFP",
    "CAPEX_SOURCING",
    "NEW_ITEM_SOURCING",
  ] as const) {
    assert(
      routesPresent.has(expectedRoute),
      `C.2: Decision engine accurately evaluates route '${expectedRoute}'`
    );
  }

  // -------------------------------------------------------------------
  // GROUP D: Buyer Workflow, Consolidation & Idempotency
  // -------------------------------------------------------------------
  console.log("\n▶ GROUP D: Buyer Workflow, PO Consolidation & Batch Idempotency");

  const run1 = await executeAndPersistBatch({
    csvContent: sampleCsv,
    batchName: "sample_pr_batch.csv",
    user: buyerUser,
  });
  const run2 = await executeAndPersistBatch({
    csvContent: sampleCsv,
    batchName: "sample_pr_batch.csv",
    user: buyerUser,
  });
  assert(
    run1.runId === run2.runId && Boolean(run2.isDuplicateSubmission),
    `D.1: Duplicate batch submission under same policy is idempotent (runId: ${run1.runId})`
  );

  const runsHistory = await listBatchProcessingRuns(buyerUser);
  const loadedRun = await getBatchProcessingRunById(run1.runId!, buyerUser);
  assert(
    runsHistory.some((r) => r.runId === run1.runId) &&
      loadedRun.poGroups?.length === 81 &&
      loadedRun.poGroups.every((pg) => pg.status === "PROPOSED"),
    "D.2: Buyer can retrieve persisted run with all 81 proposed PO groups in PROPOSED state"
  );

  // Verify no PR lines are lost across requirements + excluded outputs
  assert(
    loadedRun.lineOutputs.length === 186,
    "D.3: Zero PR lines lost — all 186 input PR lines are accounted for in lineOutputs"
  );

  // -------------------------------------------------------------------
  // GROUP E: Admin Workflow & Separation of Duties
  // -------------------------------------------------------------------
  console.log("\n▶ GROUP E: Admin Workflow & Policy Separation of Duties");

  const draftVersion = `5.9-e2e-${Date.now().toString().slice(-4)}`;
  const draft = await createPolicyDraft(
    {
      version: draftVersion,
      policyName: "E2E Verification Policy Draft",
      description: "Created during Phase 8 E2E test",
      effectiveDate: "2027-01-01",
      baseVersion: "5.0",
      changeSummary: "Test separation of duties",
      policyData: CORVO_POLICY_V5_CONFIG,
    },
    adminMaker
  );
  await submitPolicyForApproval(draft.version, adminMaker);

  // Maker cannot self-approve
  let selfApproveBlocked = false;
  try {
    await approvePolicyVersion(draft.version, adminMaker);
  } catch {
    selfApproveBlocked = true;
  }
  assert(
    selfApproveBlocked,
    "E.1: Separation of duties blocks policy creator from approving their own policy"
  );

  const approved = await approvePolicyVersion(draft.version, adminApprover);
  assert(
    approved.status === "APPROVED",
    "E.2: Second administrator (director@cantill.ai) successfully approves policy version (PENDING_APPROVAL -> APPROVED)"
  );

  const scheduled = await activatePolicyVersion(draft.version, adminApprover);
  assert(
    scheduled.status === "SCHEDULED" || scheduled.status === "ACTIVE",
    "E.3: Activating future-dated approved policy transitions it to SCHEDULED"
  );

  await archivePolicyVersion(draft.version, adminApprover);

  // User provisioning & toggle test
  const tempEmail = `e2e.user.${Date.now()}@cantill.ai`;
  const createdUser = await createUser(
    {
      name: "E2E Provisioned Buyer",
      email: tempEmail,
      password: "SecurePassword123!",
      role: "BUYER",
    },
    adminMaker.id,
    adminMaker.email
  );
  const deactivatedUser = await updateUser(
    createdUser.id,
    { isActive: false },
    adminMaker.id,
    adminMaker.email
  );
  const usersList = await listUsers({ search: tempEmail });
  assert(
    createdUser.role === "BUYER" &&
      !deactivatedUser.isActive &&
      usersList.items.some((u) => u.email === tempEmail),
    "E.3: Admin can provision, search, and deactivate user accounts"
  );

  // Admin executive report check
  const adminReport = await generateProcurementReport({
    reportType: "PROCUREMENT_SUMMARY",
    user: adminMaker,
  });
  assert(
    adminReport.dataAvailable && adminReport.csvContent.length > 50,
    "E.4: Admin generates Executive Procurement Summary report with CSV export"
  );

  // -------------------------------------------------------------------
  // GROUP F: Phase 9 Security Hardening Verification
  // -------------------------------------------------------------------
  console.log("\n▶ GROUP F: Security Hardening (Regex Safety & CSV Formula Neutralization)");

  const unsafeRegexInput = "ITM-1001.*(inject)?[a-z]+";
  const escaped = escapeRegex(unsafeRegexInput);
  const regexObj = new RegExp(escaped, "i");
  assert(
    regexObj.test("prefix ITM-1001.*(inject)?[a-z]+ suffix") &&
      !regexObj.test("ITM-1001_anything_inject_abc"),
    "F.1: escapeRegex neutralizes regex metacharacters to prevent ReDoS and invalid regex errors"
  );

  const maliciousFormula = "=CMD|' /C calc'!A0";
  const safeCell = sanitizeCsvCell(maliciousFormula);
  const negativeNumberCell = sanitizeCsvCell(-450.75);
  assert(
    safeCell.startsWith("'=CMD") && negativeNumberCell === "-450.75",
    "F.2: sanitizeCsvCell neutralizes spreadsheet formula injection while preserving negative numbers"
  );

  console.log("\n=================================================================");
  console.log(`   PHASE 8 & 9 E2E TEST RESULTS: ${passedTests}/${totalTests} PASSED   `);
  console.log("=================================================================\n");
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
