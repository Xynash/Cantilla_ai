import fs from "fs";
import path from "path";
import {
  ensureBaselinePoliciesSeeded,
  listPolicyVersions,
  getPolicyVersionById,
  getPolicyConfig,
  createPolicyDraft,
  updatePolicyDraft,
  submitPolicyForApproval,
  approvePolicyVersion,
  activatePolicyVersion,
  archivePolicyVersion,
  evaluateScheduledPolicies,
  compareRegisteredPolicyVersions,
  listPolicyAuditLogs,
} from "../services/decision-engine/policy-config/policyService";
import { validateStructuredPolicyConfig } from "../services/decision-engine/policy-config/policyValidation";
import { storeAndExtractPolicyPdf } from "../services/decision-engine/policy-config/pdfPolicyExtractor";
import { CORVO_POLICY_V5_CONFIG } from "../services/decision-engine/policy-config/baseline-v5";
import {
  executeAndPersistBatch,
  getBatchProcessingRunById,
} from "../services/decision-engine/batch-processor/batchHistoryService";
import { getFallbackPolicyVersions, getFallbackBatchRuns } from "../lib/db/fallbackStore";
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
    console.error(`  ✗ FAIL: ${label} — Expected error containing '${expectedSubstring}', but succeeded`);
    failed++;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes(expectedSubstring.toLowerCase())) {
      console.log(`  ✓ PASS: ${label}`);
      passed++;
    } else {
      console.error(
        `  ✗ FAIL: ${label} — Expected '${expectedSubstring}', got '${msg}'`
      );
      failed++;
    }
  }
}

const adminCreator: SafeUser = {
  id: "usr_admin_1",
  name: "Cantill System Administrator",
  email: "admin@cantill.ai",
  role: "PROCUREMENT_ADMIN",
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const adminApprover: SafeUser = {
  id: "usr_director_2",
  name: "Priya Deshmukh (Head of Procurement)",
  email: "director@cantill.ai",
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

async function runPhase5Tests() {
  console.log("=================================================");
  console.log("   CANTILL.AI PHASE 5 VERIFICATION TEST SUITE    ");
  console.log("=================================================\n");

  // Reset in-memory stores for clean test run
  getFallbackPolicyVersions().clear();
  getFallbackBatchRuns().clear();
  await ensureBaselinePoliciesSeeded();

  // ---------------------------------------------------------------------------
  // TEST GROUP 1: Baseline Seeding, Policy Creation & Version Numbering
  // ---------------------------------------------------------------------------
  console.log("▶ TEST GROUP 1: Policy Creation & Version Numbering");

  const initialVersions = await listPolicyVersions();
  assert(
    initialVersions.some((v) => v.version === "5.0" && v.status === "ACTIVE"),
    "1.1: Baseline Policy v5.0 is seeded as ACTIVE"
  );
  assert(
    initialVersions.some((v) => v.version === "4.0" && v.status === "ARCHIVED"),
    "1.2: Historical Policy v4.0 is seeded as ARCHIVED"
  );

  // Create Draft v5.1 with modified Spot PO threshold (₹3,50,000 instead of ₹2,00,000)
  const v51Config = JSON.parse(JSON.stringify(CORVO_POLICY_V5_CONFIG));
  v51Config.version = "5.1";
  v51Config.effectiveDate = "2026-06-01";
  v51Config.rules = v51Config.rules.map((r: any) => {
    if (r.route === "SPOT_PO") {
      return {
        ...r,
        conditions: r.conditions.map((c: any) =>
          c.field === "valueInr" ? { ...c, value: 350000 } : c
        ),
      };
    }
    return r;
  });

  const draftV51 = await createPolicyDraft(
    {
      version: "5.1",
      policyName: "Corvo Engineering Procurement Policy (PR to PO)",
      documentCode: "CORVO-PROC-POL-04",
      effectiveDate: "2026-06-01",
      baseVersion: "5.0",
      changeSummary: "Raised Spot PO limit from ₹2,00,000 to ₹3,50,000.",
      policyData: v51Config,
    },
    adminCreator
  );

  assert(
    draftV51.version === "5.1" && draftV51.status === "DRAFT",
    "1.3: Created new policy version v5.1 in DRAFT status"
  );
  assert(
    draftV51.baseVersion === "5.0" && draftV51.createdBy === "admin@cantill.ai",
    "1.4: Draft v5.1 records baseVersion '5.0' and creator 'admin@cantill.ai'"
  );

  await assertThrows(
    () =>
      createPolicyDraft(
        {
          version: "5.0",
          effectiveDate: "2026-06-01",
          changeSummary: "Attempt to overwrite v5.0",
          policyData: CORVO_POLICY_V5_CONFIG,
        },
        adminCreator
      ),
    "already exists",
    "1.5: Prevents overwriting existing policy version 5.0"
  );

  // ---------------------------------------------------------------------------
  // TEST GROUP 2: Structured Policy Configuration Validation (Zod)
  // ---------------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 2: Structured Policy Configuration Validation (Zod)");

  const badWeightsConfig = JSON.parse(JSON.stringify(CORVO_POLICY_V5_CONFIG));
  badWeightsConfig.preferredSuppliers.weights.frequency = 0.6; // sum becomes 1.25
  await assertThrows(
    () => Promise.resolve(validateStructuredPolicyConfig(badWeightsConfig)),
    "must sum to 1.0",
    "2.1: Rejects supplier scoring weights that do not sum to 1.0"
  );

  const badThresholdsConfig = JSON.parse(JSON.stringify(CORVO_POLICY_V5_CONFIG));
  badThresholdsConfig.rules = badThresholdsConfig.rules.map((r: any) =>
    r.route === "SPOT_PO"
      ? {
          ...r,
          conditions: r.conditions.map((c: any) =>
            c.field === "valueInr" ? { ...c, value: 1200000 } : c
          ),
        }
      : r
  );
  await assertThrows(
    () => Promise.resolve(validateStructuredPolicyConfig(badThresholdsConfig)),
    "Spot PO threshold",
    "2.2: Rejects Spot PO threshold greater than or equal to RFQ ceiling"
  );

  await assertThrows(
    () =>
      createPolicyDraft(
        {
          version: "5.9",
          effectiveDate: "2026-06-01",
          effectiveUntil: "2026-01-01",
          changeSummary: "Invalid date range",
          policyData: CORVO_POLICY_V5_CONFIG,
        },
        adminCreator
      ),
    "earlier than effective-from",
    "2.3: Rejects effectiveUntil date earlier than effectiveDate"
  );

  // ---------------------------------------------------------------------------
  // TEST GROUP 3: PDF Document Upload, Deterministic Extraction & Manual Correction
  // ---------------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 3: PDF Document Upload, Extraction & Manual Correction");

  const kitPdfPath = path.join(
    process.cwd(),
    "data",
    "Cantill_FullStack_Task_Kit",
    "Corvo_Procurement_Policy.pdf"
  );
  const pdfBuffer = fs.readFileSync(kitPdfPath);

  const extraction = storeAndExtractPolicyPdf({
    fileName: "Corvo_Procurement_Policy.pdf",
    mimeType: "application/pdf",
    buffer: pdfBuffer,
    uploadedBy: "admin@cantill.ai",
  });

  assert(
    extraction.pageCount === 3,
    "3.1: Extracted all 3 pages from Corvo_Procurement_Policy.pdf"
  );
  assert(
    extraction.detectedMetadata.documentCode === "CORVO-PROC-POL-04" &&
      extraction.detectedMetadata.version === "5.0" &&
      extraction.detectedMetadata.effectiveDate === "2026-04-01",
    "3.2: Identified documentCode CORVO-PROC-POL-04, version 5.0, and effectiveDate 2026-04-01"
  );
  assert(
    extraction.extractedClauses.length >= 18 &&
      extraction.extractedClauses.some((c) => c.clauseId === "1.1") &&
      extraction.extractedClauses.some((c) => c.clauseId === "5.4") &&
      extraction.extractedClauses.some((c) => c.clauseId === "8.1"),
    `3.3: Extracted ${extraction.extractedClauses.length} numbered policy clauses (1.1 through 8.1)`
  );
  assert(
    extraction.detectedThresholds.spotValueLimitInr === 200000 &&
      extraction.detectedThresholds.emergencyValueLimitInr === 500000 &&
      extraction.detectedThresholds.rfqValueLimitInr === 1000000 &&
      extraction.detectedThresholds.preferredSupplierPoWindowDays === 548 &&
      extraction.detectedThresholds.clubbingCreationDays === 14 &&
      extraction.detectedThresholds.poConsolidationWindowHours === 24,
    "3.4: Accurately extracted numeric thresholds (₹2L Spot, ₹5L Emergency, ₹10L RFQ/RFP, 548d, 14d, 24h)"
  );
  assert(
    extraction.requiresHumanVerification === true &&
      Boolean(extraction.sha256) &&
      Boolean(extraction.storagePath),
    "3.5: Marks extraction as requiring human verification and preserves PDF reference & SHA-256"
  );

  await assertThrows(
    () =>
      Promise.resolve(
        storeAndExtractPolicyPdf({
          fileName: "not_a_pdf.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("Hello world, not a PDF"),
          uploadedBy: "admin@cantill.ai",
        })
      ),
    "PDF",
    "3.6: Rejects non-PDF file uploads"
  );

  // Manual correction of extracted draft and saving as v5.2 (scheduled for 2027-04-01)
  const correctedPdfConfig = JSON.parse(JSON.stringify(extraction.draftPolicyConfig));
  correctedPdfConfig.version = "5.2";
  correctedPdfConfig.effectiveDate = "2027-04-01";
  correctedPdfConfig.consolidation.poWindowHours = 36; // Admin manually adjusts consolidation window to 36h

  const draftV52 = await createPolicyDraft(
    {
      version: "5.2",
      policyName: "Corvo Engineering Procurement Policy (PR to PO)",
      documentCode: extraction.detectedMetadata.documentCode,
      effectiveDate: "2027-04-01",
      baseVersion: "5.0",
      changeSummary:
        "Extracted from Corvo_Procurement_Policy.pdf and manually updated PO consolidation window to 36h.",
      policyData: correctedPdfConfig,
      sourceDocument: {
        fileName: extraction.fileName,
        fileSize: extraction.fileSize,
        mimeType: extraction.mimeType,
        sha256: extraction.sha256,
        storagePath: extraction.storagePath,
        uploadedAt: extraction.uploadedAt,
        uploadedBy: extraction.uploadedBy,
        pageCount: extraction.pageCount,
      },
    },
    adminCreator
  );

  assert(
    draftV52.version === "5.2" &&
      draftV52.status === "DRAFT" &&
      draftV52.policyData.consolidation.poWindowHours === 36 &&
      draftV52.sourceDocument?.fileName === "Corvo_Procurement_Policy.pdf",
    "3.7: Saved manually corrected PDF extraction as DRAFT v5.2 with original PDF metadata attached"
  );

  // ---------------------------------------------------------------------------
  // TEST GROUP 4: Approval Workflow, RBAC Permissions & Separation of Duties
  // ---------------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 4: Approval Workflow, RBAC & Separation of Duties");

  await assertThrows(
    () =>
      createPolicyDraft(
        {
          version: "5.8",
          effectiveDate: "2026-08-01",
          changeSummary: "Unauthorized requester draft",
          policyData: CORVO_POLICY_V5_CONFIG,
        },
        requesterUser
      ),
    "not authorized",
    "4.1: REQUESTER role is forbidden from creating policy drafts"
  );

  await assertThrows(
    () => submitPolicyForApproval("5.1", buyerUser),
    "not authorized",
    "4.2: BUYER role is forbidden from submitting or approving policies"
  );

  // Update Draft v5.1 while still in DRAFT status
  const updatedV51 = await updatePolicyDraft(
    "5.1",
    {
      changeSummary: "Raised Spot PO limit from ₹2,00,000 to ₹3,50,000 (verified).",
    },
    adminCreator
  );
  assert(
    updatedV51.changeSummary.includes("(verified)"),
    "4.3: PROCUREMENT_ADMIN can edit a DRAFT policy version"
  );

  // Attempt to activate v5.1 before approval -> must fail
  await assertThrows(
    () => activatePolicyVersion("5.1", adminApprover),
    "Cannot activate unapproved policy",
    "4.4: Prevents activating an unapproved DRAFT policy version"
  );

  // Submit v5.1 for approval (DRAFT -> PENDING_APPROVAL)
  const pendingV51 = await submitPolicyForApproval("5.1", adminCreator);
  assert(
    pendingV51.status === "PENDING_APPROVAL" &&
      pendingV51.submittedBy === "admin@cantill.ai" &&
      Boolean(pendingV51.submittedAt),
    "4.5: Transitions v5.1 from DRAFT to PENDING_APPROVAL and records submitter & timestamp"
  );

  // Attempt to edit v5.1 after submission -> must fail (immutability)
  await assertThrows(
    () =>
      updatePolicyDraft(
        "5.1",
        { changeSummary: "Attempted edit while pending approval" },
        adminCreator
      ),
    "immutable",
    "4.6: Protects non-DRAFT policy version from modification"
  );

  // Separation of duties: adminCreator cannot approve their own submitted policy v5.1
  await assertThrows(
    () => approvePolicyVersion("5.1", adminCreator),
    "Separation of duties",
    "4.7: Enforces Separation of Duties — creator/submitter cannot approve their own policy version"
  );

  // Second admin (adminApprover / director@cantill.ai) approves v5.1 -> APPROVED
  const approvedV51 = await approvePolicyVersion(
    "5.1",
    adminApprover,
    "Approved by Head of Procurement"
  );
  assert(
    approvedV51.status === "APPROVED" &&
      approvedV51.approvedBy === "director@cantill.ai" &&
      Boolean(approvedV51.approvedAt),
    "4.8: Second PROCUREMENT_ADMIN successfully approves v5.1 (PENDING_APPROVAL -> APPROVED)"
  );

  // Attempt to edit APPROVED v5.1 -> must fail
  await assertThrows(
    () => updatePolicyDraft("5.1", { changeSummary: "Mutate approved" }, adminApprover),
    "immutable",
    "4.9: Approved policy version is strictly immutable"
  );

  // ---------------------------------------------------------------------------
  // TEST GROUP 5: Side-by-Side Policy Version Comparison
  // ---------------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 5: Side-by-Side Policy Comparison");

  const compV4ToV5 = await compareRegisteredPolicyVersions("4.0", "5.0");
  assert(
    compV4ToV5.hasDifferences && compV4ToV5.totalDifferences >= 6,
    `5.1: Comparison v4.0 -> v5.0 detects ${compV4ToV5.totalDifferences} configuration changes`
  );
  assert(
    compV4ToV5.changedDiffs.some(
      (d) =>
        d.fieldPath.includes("rules[5.4].valueThreshold") &&
        d.oldValue === 150000 &&
        d.newValue === 200000
    ),
    "5.2: Comparison identifies Spot PO threshold change (₹1,50,000 -> ₹2,00,000)"
  );
  assert(
    compV4ToV5.changedDiffs.some(
      (d) =>
        d.fieldPath === "preferredSuppliers.weights.frequency" &&
        d.oldValue === 0.4 &&
        d.newValue === 0.35
    ),
    "5.3: Comparison identifies supplier scoring weight change (Frequency 40.0% -> 35.0%)"
  );

  const compV5ToV51 = await compareRegisteredPolicyVersions("5.0", "5.1");
  assert(
    compV5ToV51.changedDiffs.some(
      (d) =>
        d.fieldPath.includes("rules[5.4].valueThreshold") &&
        d.oldValue === 200000 &&
        d.newValue === 350000
    ),
    "5.4: Comparison v5.0 -> v5.1 highlights Spot PO threshold change (₹2,00,000 -> ₹3,50,000)"
  );

  // ---------------------------------------------------------------------------
  // TEST GROUP 6: Phase 4 Decision Engine Integration & Historical Snapshot Preservation
  // ---------------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 6: Decision Engine Integration & Snapshot Preservation");

  const batchCsvPath = path.join(
    process.cwd(),
    "data",
    "Cantill_FullStack_Task_Kit",
    "pr_batches",
    "sample_pr_batch.csv"
  );
  const sampleBatchCsv = fs.readFileSync(batchCsvPath, "utf8");

  // 1. Run batch under active v5.0
  const runV50 = await executeAndPersistBatch({
    csvContent: sampleBatchCsv,
    batchName: "sample_pr_batch.csv",
    policyVersion: "5.0",
    user: buyerUser,
  });

  assert(
    runV50.policyVersion === "5.0" &&
      runV50.totalPrLines === 186 &&
      runV50.totalRequirements === 151 &&
      runV50.totalPOs === 81 &&
      runV50.totalSourcingRequests === 57,
    "6.1: Batch run under Policy v5.0 produces exact baseline results (186 lines, 81 POs, 57 sourcing)"
  );

  // 2. Activate v5.1 (with Spot PO threshold ₹3,50,000) as of 2026-06-15
  const activatedV51 = await activatePolicyVersion("5.1", adminApprover, {
    referenceDate: new Date("2026-06-15T00:00:00.000Z"),
  });
  const archivedV50AfterActivation = await getPolicyVersionById("5.0");

  assert(
    activatedV51.status === "ACTIVE" && archivedV50AfterActivation.status === "ARCHIVED",
    "6.2: Activating v5.1 transitions v5.1 to ACTIVE and automatically archives v5.0 (zero overlap)"
  );

  const allAfterV51 = await listPolicyVersions(new Date("2026-06-15T00:00:00.000Z"));
  const activeCount = allAfterV51.filter((v) => v.status === "ACTIVE").length;
  assert(
    activeCount === 1,
    "6.3: Exactly 1 ACTIVE policy version exists after activation"
  );

  // 3. Run batch under newly active v5.1
  const runV51 = await executeAndPersistBatch({
    csvContent: sampleBatchCsv,
    batchName: "sample_pr_batch.csv",
    policyVersion: "5.1",
    user: buyerUser,
  });

  assert(
    runV51.policyVersion === "5.1" &&
      runV51.runId !== runV50.runId &&
      runV51.totalPOs > runV50.totalPOs &&
      runV51.totalSourcingRequests < runV50.totalSourcingRequests,
    `6.4: Batch run under Policy v5.1 (Spot < ₹3.5L) uses v5.1 rules (${runV51.totalPOs} POs, ${runV51.totalSourcingRequests} sourcing vs v5.0's 81 POs, 57 sourcing)`
  );

  // 4. Verify historical runV50 snapshot and results are 100% preserved and untouched!
  const retrievedRunV50 = await getBatchProcessingRunById(runV50.runId!, buyerUser);
  assert(
    retrievedRunV50.policyVersion === "5.0" &&
      retrievedRunV50.totalPOs === 81 &&
      retrievedRunV50.totalSourcingRequests === 57 &&
      (retrievedRunV50.policySnapshot as any)?.version === "5.0",
    "6.5: Historical processing run (v5.0) retains its original policy snapshot and decision results unchanged"
  );

  // 5. Verify scheduled policy activation on effective date (v5.2 effective 2027-04-01)
  await submitPolicyForApproval("5.2", adminCreator);
  await approvePolicyVersion("5.2", adminApprover);
  const scheduledV52 = await activatePolicyVersion("5.2", adminApprover, {
    referenceDate: new Date("2026-06-20T00:00:00.000Z"),
  });
  assert(
    scheduledV52.status === "SCHEDULED",
    "6.6: Future-dated approved policy v5.2 (effective 2027-04-01) enters SCHEDULED status"
  );

  // Advance clock to 2027-04-02 -> v5.2 auto-activates and archives v5.1
  await evaluateScheduledPolicies(new Date("2027-04-02T00:00:00.000Z"));
  const v52AfterDue = await getPolicyVersionById("5.2");
  const v51AfterDue = await getPolicyVersionById("5.1");
  assert(
    v52AfterDue.status === "ACTIVE" && v51AfterDue.status === "ARCHIVED",
    "6.7: Scheduled policy v5.2 automatically activates on its effective date and archives v5.1"
  );

  // 6. Verify invalid / unavailable policy versions produce clear errors
  await assertThrows(
    () => getPolicyConfig("9.9"),
    "does not exist",
    "6.8: Requesting non-existent policy version '9.9' throws clear NotFoundError"
  );

  // Restore v5.0 as ACTIVE in fallback store so subsequent tests see baseline state
  getFallbackPolicyVersions().clear();
  await ensureBaselinePoliciesSeeded();

  // ---------------------------------------------------------------------------
  // TEST GROUP 7: Audit Log Verification
  // ---------------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 7: Audit Log Verification");

  const auditLogs = await listPolicyAuditLogs();
  const recordedActions = new Set(auditLogs.map((a) => a.action));
  assert(
    recordedActions.has("CREATE_POLICY_DRAFT") &&
      recordedActions.has("UPDATE_POLICY_DRAFT") &&
      recordedActions.has("SUBMIT_POLICY_FOR_APPROVAL") &&
      recordedActions.has("APPROVE_POLICY_VERSION") &&
      recordedActions.has("SCHEDULE_POLICY_VERSION") &&
      recordedActions.has("ACTIVATE_POLICY_VERSION") &&
      recordedActions.has("AUTO_ACTIVATE_SCHEDULED_POLICY"),
    `7.1: AuditLog records all policy lifecycle actions (${Array.from(recordedActions).join(", ")})`
  );

  console.log("\n=================================================");
  console.log(`  PHASE 5 TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED`);
  console.log("=================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase5Tests().catch((err) => {
  console.error("Fatal error in Phase 5 test suite:", err);
  process.exit(1);
});
