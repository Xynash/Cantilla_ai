import fs from "fs";
import path from "path";
import Papa from "papaparse";
import {
  processPrBatch,
  parseRawPrBatchCsv,
  formatDecisionOutputsToCsv,
  consolidatePurchaseOrders,
  executeAndPersistBatch,
  listBatchProcessingRuns,
  getBatchProcessingRunById,
  loadMasterDataFromFiles,
  calculatePreferredSuppliers,
  getSupplierSuggestionsWithExplanation,
  evaluateRequirementDecision,
  CORVO_POLICY_V5_CONFIG,
  SupplierMasterRecord,
  RequirementGroup,
  RequirementDecision,
} from "../services/decision-engine";
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

async function runTests() {
  console.log("=================================================");
  console.log("   CANTILL.AI PHASE 4 VERIFICATION TEST SUITE    ");
  console.log("=================================================\n");

  const masterData = loadMasterDataFromFiles();
  const policy = CORVO_POLICY_V5_CONFIG;

  // Load sample PR batch
  const batchCsvPath = path.join(
    process.cwd(),
    "data",
    "Cantill_FullStack_Task_Kit",
    "pr_batches",
    "sample_pr_batch.csv"
  );
  const sampleBatchCsv = fs.readFileSync(batchCsvPath, "utf-8");
  const rawLines = parseRawPrBatchCsv(sampleBatchCsv);

  console.log(`Loaded ${rawLines.length} PR lines from sample_pr_batch.csv.`);
  console.log(`Loaded ${masterData.itemMasterMap.size} items, ${masterData.suppliersMap.size} suppliers, ${masterData.contracts.length} contracts.\n`);

  // Execute full batch processing run under Policy v5.0
  const result = processPrBatch(rawLines, masterData, policy);
  const outputMap = new Map(result.lineOutputs.map((o) => [`${o.pr_no}/${o.pr_line}`, o]));

  // -------------------------------------------------------------------
  // TEST GROUP 1: Preferred Supplier Rankings (Worked Examples Page 5)
  // -------------------------------------------------------------------
  console.log("▶ TEST GROUP 1: Preferred Supplier Ranking (Worked Examples Page 5)");

  const asOfDate = new Date("2026-11-01T00:00:00.000Z");

  // Example 1: ITM-1048 Nitrile coated gloves
  const supp1048 = calculatePreferredSuppliers(
    "ITM-1048",
    asOfDate,
    masterData.poHistory,
    masterData.contracts,
    masterData.suppliersMap,
    policy.preferredSuppliers
  );
  assert(supp1048.length === 2, "ITM-1048 has 2 eligible active suppliers (S031 inactive excluded)");
  assert(supp1048[0].supplierId === "S029", "ITM-1048 Rank 1 is S029 (SafeGuard Industrial Supplies)");
  assert(supp1048[1].supplierId === "S030", "ITM-1048 Rank 2 is S030 (Karam Safety Distributor)");
  assert(!supp1048.some((s) => s.supplierId === "S031"), "ITM-1048 excludes S031 (Inactive supplier)");

  // Example 2: ITM-1036 Pneumatic cylinder 50x100
  const supp1036 = calculatePreferredSuppliers(
    "ITM-1036",
    asOfDate,
    masterData.poHistory,
    masterData.contracts,
    masterData.suppliersMap,
    policy.preferredSuppliers
  );
  assert(supp1036.length === 3, "ITM-1036 has 3 eligible active suppliers");
  assert(supp1036[0].supplierId === "S023", "ITM-1036 Rank 1 is S023 (Hydrax Hydraulics)");
  assert(supp1036[1].supplierId === "S022", "ITM-1036 Rank 2 is S022 (Fluidline Hydraulics)");
  assert(supp1036[2].supplierId === "S024", "ITM-1036 Rank 3 is S024 (Janatics Dealer Chakan)");

  // Example 3: ITM-1016 MIG wire ER70S-6 1.2mm
  const supp1016 = calculatePreferredSuppliers(
    "ITM-1016",
    asOfDate,
    masterData.poHistory,
    masterData.contracts,
    masterData.suppliersMap,
    policy.preferredSuppliers
  );
  assert(supp1016.length === 2, "ITM-1016 has 2 eligible active suppliers");
  assert(supp1016[0].supplierId === "S009", "ITM-1016 Rank 1 is S009 (Weldtech Supplies)");
  assert(supp1016[1].supplierId === "S010", "ITM-1016 Rank 2 is S010 (Inox Gases Dealer Pune)");

  // -------------------------------------------------------------------
  // TEST GROUP 2: Regression Against 14 Worked Decisions
  // -------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 2: Regression Against All 14 Worked Decisions");

  // 1. Contract PO: PR-26-00019/1
  const d1 = outputMap.get("PR-26-00019/1")!;
  assert(d1.decision === "PO", "1. Contract PO: Decision is PO");
  assert(d1.route === "CONTRACT_PO", "1. Contract PO: Route is CONTRACT_PO");
  assert(d1.supplier_id === "S001", "1. Contract PO: Supplier is S001");
  assert(Math.round(d1.group_value_inr) === 137531, "1. Contract PO: Value is ₹1,37,531");

  // 2. Contract that exists only as a PDF: PR-26-00045/1 (RC-2026-031)
  const d2 = outputMap.get("PR-26-00045/1")!;
  assert(d2.decision === "PO", "2. PDF Contract: Decision is PO");
  assert(d2.route === "CONTRACT_PO", "2. PDF Contract: Route is CONTRACT_PO");
  assert(d2.supplier_id === "S021", "2. PDF Contract: Supplier is S021 (Pneumatic Point)");
  assert(Math.round(d2.group_value_inr) === 26829, "2. PDF Contract: Value is ₹26,829");

  // 3. Contract ceiling nearly used up: PR-26-00004/1 and PR-26-00026/1
  const d3_1 = outputMap.get("PR-26-00004/1")!;
  const d3_2 = outputMap.get("PR-26-00026/1")!;
  assert(d3_1.group_id === d3_2.group_id, "3. Ceiling Exhausted: Lines are clubbed into same requirement");
  assert(d3_1.decision === "SOURCING_REQUEST", "3. Ceiling Exhausted: Decision is SOURCING_REQUEST");
  assert(d3_1.route === "RFQ", "3. Ceiling Exhausted: Route is RFQ");
  assert(Math.round(d3_1.group_value_inr) === 220256, "3. Ceiling Exhausted: Value is ₹2,20,256");
  assert(d3_1.suggested_supplier_ids === "S014;S013;S016", "3. Ceiling Exhausted: Suggested suppliers are S014;S013;S016");

  // 4. Two contracts for same item: PR-26-00034/1 and PR-26-00032/1
  const d4_1 = outputMap.get("PR-26-00034/1")!;
  const d4_2 = outputMap.get("PR-26-00032/1")!;
  assert(d4_1.decision === "PO", "4. Two Contracts: Decision is PO");
  assert(d4_1.route === "CONTRACT_PO", "4. Two Contracts: Route is CONTRACT_PO");
  assert(d4_1.supplier_id === "S007", "4. Two Contracts: Lowest rate with room is S007 (RC-2026-013)");
  assert(Math.round(d4_1.group_value_inr) === 32547, "4. Two Contracts: Value is ₹32,547");

  // 5. Split PRs clubbed into one requirement: PR-26-00146/1, PR-26-00144/1, PR-26-00145/1
  const d5_1 = outputMap.get("PR-26-00146/1")!;
  const d5_2 = outputMap.get("PR-26-00144/1")!;
  const d5_3 = outputMap.get("PR-26-00145/1")!;
  assert(d5_1.group_id === d5_2.group_id && d5_2.group_id === d5_3.group_id, "5. Split PRs: All 3 lines share same group_id");
  assert(d5_1.decision === "PO", "5. Split PRs: Decision is PO");
  assert(d5_1.route === "SPOT_PO", "5. Split PRs: Route is SPOT_PO");
  assert(d5_1.supplier_id === "S024", "5. Split PRs: Supplier is S024 (Janatics Dealer Chakan)");
  assert(Math.round(d5_1.group_value_inr) === 126472, "5. Split PRs: Value is ₹1,26,472");

  // 6. Same item, but not clubbed across plants: PR-26-00106/1 (PUN1) and PR-26-00103/1 (CHK1)
  const d6_1 = outputMap.get("PR-26-00106/1")!;
  const d6_2 = outputMap.get("PR-26-00103/1")!;
  assert(d6_1.group_id !== d6_2.group_id, "6. Plant Separation: Different plants have different group_id");
  assert(d6_1.decision === "PO" && d6_1.route === "SPOT_PO", "6. Plant Separation: PUN1 line is SPOT_PO");
  assert(d6_2.decision === "PO" && d6_2.route === "SPOT_PO", "6. Plant Separation: CHK1 line is SPOT_PO");

  // 7. Free-text item matched: PR-26-00088/1 ("hyd hose 1/2 inch 2 wire")
  const d7 = outputMap.get("PR-26-00088/1")!;
  assert(d7.resolved_item_code === "ITM-1035", "7. Free-text: Resolves to ITM-1035");
  assert(d7.decision === "PO" && d7.route === "SPOT_PO", "7. Free-text: Route is SPOT_PO");
  assert(d7.supplier_id === "S023", "7. Free-text: Supplier is S023 (Hydrax Hydraulics)");
  assert(Math.round(d7.group_value_inr) === 97955, "7. Free-text: Value is ₹97,955");

  // 8. Emergency PO: PR-26-00059/1
  const d8 = outputMap.get("PR-26-00059/1")!;
  assert(d8.decision === "PO", "8. Emergency PO: Decision is PO");
  assert(d8.route === "EMERGENCY_PO", "8. Emergency PO: Route is EMERGENCY_PO");
  assert(d8.supplier_id === "S014", "8. Emergency PO: Supplier is S014 (Mahalaxmi Machine Spares)");
  assert(Math.round(d8.group_value_inr) === 253184, "8. Emergency PO: Value is ₹2,53,184");

  // 9. RFQ: above PO limit: PR-26-00089/1 ("CMM calibration service")
  const d9 = outputMap.get("PR-26-00089/1")!;
  assert(d9.resolved_item_code === "ITM-1066", "9. RFQ Above Limit: Resolves to ITM-1066 (CMM calibration service)");
  assert(d9.decision === "SOURCING_REQUEST" && d9.route === "RFQ", "9. RFQ Above Limit: Route is RFQ");
  assert(Math.round(d9.group_value_inr) === 336562, "9. RFQ Above Limit: Value is ₹3,36,562");
  assert(d9.suggested_supplier_ids === "S043;S044;S042", "9. RFQ Above Limit: Suggested suppliers are S043;S044;S042");

  // 10. RFQ: small but never bought: PR-26-00050/1 (ITM-1006)
  const d10 = outputMap.get("PR-26-00050/1")!;
  assert(d10.decision === "SOURCING_REQUEST" && d10.route === "RFQ", "10. RFQ Small: Route is RFQ");
  assert(Math.round(d10.group_value_inr) === 80300, "10. RFQ Small: Value is ₹80,300");
  assert(d10.suggested_supplier_ids === "S003;S002;S005", "10. RFQ Small: Suggested suppliers are S003;S002;S005");

  // 11. RFP: value >= 10 lakh: PR-26-00100/1 (ITM-1034)
  const d11 = outputMap.get("PR-26-00100/1")!;
  assert(d11.decision === "SOURCING_REQUEST" && d11.route === "RFP", "11. RFP: Route is RFP");
  assert(Math.round(d11.group_value_inr) === 2070780, "11. RFP: Value is ₹20,70,780");
  assert(d11.suggested_supplier_ids === "S020;S017;S019;S018", "11. RFP: Suggested suppliers are S020;S017;S019;S018");

  // 12. Capex: PR-26-00047/1 ("eot crane 5 ton")
  const d12 = outputMap.get("PR-26-00047/1")!;
  assert(d12.resolved_item_code === "ITM-1071", "12. Capex: Resolves to ITM-1071 (EOT crane 5 ton)");
  assert(d12.decision === "SOURCING_REQUEST" && d12.route === "CAPEX_SOURCING", "12. Capex: Route is CAPEX_SOURCING");
  assert(d12.suggested_supplier_ids === "S045;S047;S020;S048;S046", "12. Capex: Suggested 5 suppliers");
  assert(Math.round(d12.group_value_inr) === 6036704, "12. Capex: Value is ₹60,36,704");

  // 13. New item: PR-26-00170/1 ("Drinking water purifier 50 LPH")
  const d13 = outputMap.get("PR-26-00170/1")!;
  assert(d13.resolved_item_code === "NEW", "13. New Item: Resolved code is NEW");
  assert(d13.decision === "SOURCING_REQUEST" && d13.route === "NEW_ITEM_SOURCING", "13. New Item: Route is NEW_ITEM_SOURCING");
  assert(d13.suggested_supplier_ids === "", "13. New Item: No supplier suggestions");
  assert(Math.round(d13.group_value_inr) === 141100, "13. New Item: Valued at requester estimate ₹1,41,100");

  // 14. PO Consolidation: PR-26-00034/1, PR-26-00032/1, PR-26-00031/1, PR-26-00035/1
  const d14_34 = outputMap.get("PR-26-00034/1")!;
  const d14_32 = outputMap.get("PR-26-00032/1")!;
  assert(Boolean(d14_34.po_id && d14_34.po_id.startsWith("PO-")), "14. PO Consolidation: PO ID generated for CONTRACT_PO");
  assert(d14_34.po_id === d14_32.po_id, "14. PO Consolidation: Clubbed lines share the exact same PO ID");

  // -------------------------------------------------------------------
  // TEST GROUP 2B: Targeted Historical PO Lookup Verification for ITM-1065
  // -------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 2B: Historical PO Lookup Verification for ITM-1065");
  const itm1065Pos = masterData.poHistoryByItem?.get("ITM-1065") || [];
  const reqDate1065 = new Date("2026-11-13T08:15:00.000Z"); // PR-26-00164/3 date
  const cutoff365 = new Date(reqDate1065.getTime() - 365 * 24 * 60 * 60 * 1000);
  const cutoff548 = new Date(reqDate1065.getTime() - 548 * 24 * 60 * 60 * 1000);
  const pos365 = itm1065Pos.filter((p) => p.poDate >= cutoff365 && p.poDate <= reqDate1065);
  const pos548 = itm1065Pos.filter((p) => p.poDate >= cutoff548 && p.poDate <= reqDate1065);
  const ranked1065 = calculatePreferredSuppliers(
    "ITM-1065",
    reqDate1065,
    itm1065Pos,
    masterData.contracts,
    masterData.suppliersMap,
    policy.preferredSuppliers
  );
  const d1065 = outputMap.get("PR-26-00164/3")!;
  console.log("  ITM-1065 Lookup Summary:", JSON.stringify({
    totalMatchingRecords: itm1065Pos.length,
    recordsIn365DayWindow: pos365.map((p) => ({
      poNumber: p.poNumber,
      poDate: p.poDate.toISOString().slice(0, 10),
      supplierId: p.supplierId,
      unitPrice: p.unitPrice,
      quantity: p.quantity,
      uom: p.uom,
      plant: p.plant,
    })),
    recordsIn548DayWindow: pos548.map((p) => ({
      poNumber: p.poNumber,
      poDate: p.poDate.toISOString().slice(0, 10),
      supplierId: p.supplierId,
      unitPrice: p.unitPrice,
      quantity: p.quantity,
      uom: p.uom,
      plant: p.plant,
    })),
    latestApplicablePoPrice365d: pos365[0]?.unitPrice,
    preferredSuppliersRanked: ranked1065.map((s) => ({
      rank: s.rank,
      supplierId: s.supplierId,
      supplierName: s.supplierName,
      score: s.score,
      poCount: s.poCount,
      recencyTier: s.recencyTier,
      referencePrice: s.referencePrice,
    })),
    pr26_00164_3_decision: d1065,
  }));
  assert(itm1065Pos.length === 2, "ITM-1065 has 2 total historical PO records (7300441 and 7300440)");
  assert(pos365.length === 1 && pos365[0].poNumber === "7300441", "ITM-1065 365-day window has 1 PO (7300441 on 2026-05-25 at ₹10,139.65 from S042)");
  assert(pos548.length === 2, "ITM-1065 548-day window has 2 POs (7300441 from S042 and 7300440 from S043)");
  assert(ranked1065.length === 2 && ranked1065[0].supplierId === "S042" && ranked1065[1].supplierId === "S043", "ITM-1065 preferred suppliers ranked S042 (#1) and S043 (#2)");

  // -------------------------------------------------------------------
  // TEST GROUP 3: Complete Batch Integrity & CSV Output
  // -------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 3: Full Batch Processing & CSV Export Integrity");

  assert(result.lineOutputs.length === 186, "Full batch output contains exactly 186 rows");
  assert(result.totalRequirements > 0, `Grouped into ${result.totalRequirements} requirements`);
  assert(result.totalPOs > 0, `Created ${result.totalPOs} consolidated PO groups`);
  assert(result.totalSourcingRequests > 0, `Created ${result.totalSourcingRequests} sourcing requests`);

  // Verify CSV headers
  const csvHeaders = result.csvContent.split("\n")[0].trim();
  const expectedHeaders = "pr_no,pr_line,resolved_item_code,group_id,po_id,decision,route,supplier_id,unit_price,group_value_inr,suggested_supplier_ids,policy_version,reason";
  assert(csvHeaders === expectedHeaders, "CSV headers match the exact required format");

  // -------------------------------------------------------------------
  // TEST GROUP 4: Phase 4B Focused Rules, Boundaries, Ties & Explainability
  // -------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 4: Phase 4B Boundaries, Ties, Missing Data & Explainability");

  // 4.1 Blocked & Inactive Supplier Exclusion Across All Batch Outputs
  const blockedOrInactiveIds = new Set(
    Array.from(masterData.suppliersMap.values())
      .filter((s) => s.status !== "Active")
      .map((s) => s.supplierId)
  );
  const anyBlockedSelected = result.lineOutputs.some(
    (o) =>
      (o.supplier_id && blockedOrInactiveIds.has(o.supplier_id)) ||
      o.suggested_supplier_ids
        .split(";")
        .filter(Boolean)
        .some((id) => blockedOrInactiveIds.has(id))
  );
  assert(!anyBlockedSelected, "4B.1: Blocked/Inactive suppliers (S004, S008, S011, S031) never receive a PO or sourcing suggestion");

  // 4.2 Deterministic Tie-Breaking & Missing Performance Data (No Invented Defaults)
  const tieSuppliersMap = new Map<string, SupplierMasterRecord>([
    [
      "S901",
      {
        supplierId: "S901",
        name: "Supplier Alpha",
        categories: "Fasteners",
        status: "Active",
        onTimePercent: null, // Missing performance data
        qualityRating: null, // Missing performance data
      },
    ],
    [
      "S902",
      {
        supplierId: "S902",
        name: "Supplier Beta",
        categories: "Fasteners",
        status: "Active",
        onTimePercent: null,
        qualityRating: null,
      },
    ],
  ]);
  const tiePos = [
    {
      poNumber: "PO-TIE-1",
      poDate: new Date("2026-10-15T00:00:00Z"),
      supplierId: "S902",
      itemCode: "ITM-1009",
      quantity: 100,
      uom: "NOS",
      unitPrice: 7.5,
      plant: "PUN1",
    },
    {
      poNumber: "PO-TIE-2",
      poDate: new Date("2026-10-15T00:00:00Z"),
      supplierId: "S901",
      itemCode: "ITM-1009",
      quantity: 100,
      uom: "NOS",
      unitPrice: 7.4,
      plant: "PUN1",
    },
  ];
  const tieRanked = calculatePreferredSuppliers(
    "ITM-1009",
    new Date("2026-11-01T00:00:00Z"),
    tiePos,
    [],
    tieSuppliersMap,
    policy.preferredSuppliers
  );
  assert(
    tieRanked[0].onTimePercent === null && tieRanked[0].qualityRating === null,
    "4B.2: Missing supplier performance data remains null (not fabricated as 70% or 3.0)"
  );
  assert(
    tieRanked[0].scoreBreakdown.onTimeScore === 0 && tieRanked[0].scoreBreakdown.qualityScore === 0,
    "4B.3: Missing performance metrics contribute 0 to normalized score breakdown"
  );
  assert(
    tieRanked[0].supplierId === "S901" && tieRanked[1].supplierId === "S902",
    "4B.4: Deterministic tie-breaking orders identical scores by supplierId ascending (S901 before S902)"
  );

  // 4.3 Supplier Shortfall Explanation (Worked Example 11: ITM-1034 RFP needs 5, only 4 active exist)
  const req11Decision = result.requirements.find((r) =>
    r.requirement.lines.some((l) => l.pr_no === "PR-26-00100")
  )!;
  assert(
    Boolean(
      req11Decision.supplierShortfallExplanation &&
        req11Decision.supplierShortfallExplanation.includes("Only 4 of 5")
    ),
    "4B.5: Explains supplier shortfall when fewer than requested active suppliers exist (4 of 5 for ITM-1034)"
  );
  assert(
    new Set(req11Decision.suggestedSupplierIds).size === req11Decision.suggestedSupplierIds.length,
    "4B.6: Suggested suppliers list contains no duplicate supplier IDs"
  );

  // 4.4 Exact Value Boundary Tests (Spot < 2L, Emergency <= 5L, RFQ < 10L, RFP >= 10L)
  const makeTestReq = (valueInr: number, isEmergency: boolean, itemType: string = "Material"): RequirementGroup => ({
    groupId: "REQ-BOUNDARY",
    plant: "PUN1",
    resolvedItemCode: "ITM-1038",
    isNewItem: false,
    isEmergency,
    requirementDate: new Date("2026-11-05T00:00:00Z"),
    firstLineNeedByDate: new Date("2026-11-15T00:00:00Z"),
    earliestNeedByDate: new Date("2026-11-15T00:00:00Z"),
    lines: [
      {
        pr_no: "PR-BND-1",
        pr_line: 1,
        created_at: "2026-11-05 10:00",
        requester: "Tester",
        department: "QA",
        plant: "PUN1",
        item_code: "ITM-1038",
        description: "Hydraulic oil HLP 68",
        quantity: 10,
        uom: "LTR",
        need_by_date: "2026-11-15",
        urgency: isEmergency ? "Emergency" : "Normal",
        resolvedItemCode: "ITM-1038",
        isNewItem: false,
        matchExplanation: "Matched ITM-1038",
        itemCategory: "Lubricants",
        itemType,
        parsedCreatedAt: new Date("2026-11-05T10:00:00Z"),
        parsedNeedByDate: new Date("2026-11-15T00:00:00Z"),
      },
    ],
    totalQuantity: 10,
    uom: "LTR",
    unitPrice: valueInr / 10,
    priceSource: "RECENT_PO_PRICE",
    priceExplanation: "Recent PO price",
    groupValueInr: valueInr,
  });

  const itm1038Pos = masterData.poHistoryByItem?.get("ITM-1038") || [];
  const pref1038 = calculatePreferredSuppliers(
    "ITM-1038",
    new Date("2026-11-05T00:00:00Z"),
    itm1038Pos,
    masterData.contracts,
    masterData.suppliersMap,
    policy.preferredSuppliers
  );
  const noContract = {
    hasApplicableContract: false,
    hasValidContract: false,
    allContractsExhausted: false,
    explanation: "No contract",
  };

  // Spot strictly below ₹2,00,000 vs exactly ₹2,00,000
  const spotBelow2L = evaluateRequirementDecision({
    requirement: makeTestReq(199999, false),
    contractResult: noContract,
    preferredSuppliers: pref1038,
    poHistory: itm1038Pos,
    suppliersMap: masterData.suppliersMap,
    activeSupplierIds: masterData.activeSupplierIds,
    policy,
  });
  assert(spotBelow2L.decision === "PO" && spotBelow2L.route === "SPOT_PO", "4B.7: Value ₹1,99,999 (< ₹2L) with 365d PO routes to SPOT_PO");

  const spotAt2L = evaluateRequirementDecision({
    requirement: makeTestReq(200000, false),
    contractResult: noContract,
    preferredSuppliers: pref1038,
    poHistory: itm1038Pos,
    suppliersMap: masterData.suppliersMap,
    activeSupplierIds: masterData.activeSupplierIds,
    policy,
  });
  assert(spotAt2L.decision === "SOURCING_REQUEST" && spotAt2L.route === "RFQ", "4B.8: Value ₹2,00,000 (not < ₹2L) routes to RFQ");

  // Emergency at exactly ₹5,00,000 vs ₹5,00,001
  const emergAt5L = evaluateRequirementDecision({
    requirement: makeTestReq(500000, true),
    contractResult: noContract,
    preferredSuppliers: pref1038,
    poHistory: itm1038Pos,
    suppliersMap: masterData.suppliersMap,
    activeSupplierIds: masterData.activeSupplierIds,
    policy,
  });
  assert(emergAt5L.decision === "PO" && emergAt5L.route === "EMERGENCY_PO", "4B.9: Emergency at exactly ₹5,00,000 (<= ₹5L) routes to EMERGENCY_PO");

  const emergAbove5L = evaluateRequirementDecision({
    requirement: makeTestReq(500001, true),
    contractResult: noContract,
    preferredSuppliers: pref1038,
    poHistory: itm1038Pos,
    suppliersMap: masterData.suppliersMap,
    activeSupplierIds: masterData.activeSupplierIds,
    policy,
  });
  assert(emergAbove5L.decision === "SOURCING_REQUEST" && emergAbove5L.route === "RFQ", "4B.10: Emergency at ₹5,00,001 (> ₹5L) routes to RFQ");

  // RFQ (< ₹10,00,000) vs RFP (>= ₹10,00,000)
  const rfqBelow10L = evaluateRequirementDecision({
    requirement: makeTestReq(999999, false),
    contractResult: noContract,
    preferredSuppliers: pref1038,
    poHistory: itm1038Pos,
    suppliersMap: masterData.suppliersMap,
    activeSupplierIds: masterData.activeSupplierIds,
    policy,
  });
  assert(rfqBelow10L.route === "RFQ" && rfqBelow10L.suggestedSupplierIds.length === 3, "4B.11: Value ₹9,99,999 (< ₹10L) routes to RFQ with 3 suggested suppliers");

  const rfpAt10L = evaluateRequirementDecision({
    requirement: makeTestReq(1000000, false),
    contractResult: noContract,
    preferredSuppliers: pref1038,
    poHistory: itm1038Pos,
    suppliersMap: masterData.suppliersMap,
    activeSupplierIds: masterData.activeSupplierIds,
    policy,
  });
  assert(rfpAt10L.route === "RFP", "4B.12: Value ₹10,00,000 (>= ₹10L) routes to RFP");

  // Capex precedence over contract and low value
  const capexWithContract = evaluateRequirementDecision({
    requirement: makeTestReq(50000, false, "Capex"),
    contractResult: {
      hasApplicableContract: true,
      hasValidContract: true,
      allContractsExhausted: false,
      selectedContract: masterData.contracts[0],
      selectedRate: 100,
      explanation: "Valid contract",
    },
    preferredSuppliers: pref1038,
    poHistory: itm1038Pos,
    suppliersMap: masterData.suppliersMap,
    activeSupplierIds: masterData.activeSupplierIds,
    policy,
  });
  assert(
    capexWithContract.decision === "SOURCING_REQUEST" && capexWithContract.route === "CAPEX_SOURCING",
    "4B.13: Capex rule (5.1) takes precedence over valid contract (5.2) and low value"
  );

  // 4.5 Explainability Completeness Check
  assert(
    Boolean(
      spotBelow2L.prReferences?.length === 1 &&
        spotBelow2L.resolvedItemCode === "ITM-1038" &&
        spotBelow2L.plant === "PUN1" &&
        spotBelow2L.valuationSource === "RECENT_PO_PRICE" &&
        spotBelow2L.policyVersion === "5.0" &&
        spotBelow2L.clause === "5.4" &&
        spotBelow2L.appliedClauses?.includes("5.4") &&
        spotBelow2L.reason.length > 10
    ),
    "4B.14: Decision retains PR references, resolved item, plant, valuation source, policy version, clauses, and explanation"
  );

  // -------------------------------------------------------------------
  // TEST GROUP 5: Phase 4C PO Consolidation, Batch API, CSV & History
  // -------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 5: Phase 4C PO Consolidation, Batch Processing, CSV & History");

  // 5.1 Worked Example 14 Consolidation & Proposed Status
  const d14_31 = outputMap.get("PR-26-00031/1")!;
  const d14_35 = outputMap.get("PR-26-00035/1")!;
  assert(
    Boolean(d14_34.po_id) &&
      d14_34.po_id === d14_32.po_id &&
      d14_34.po_id === d14_31.po_id &&
      d14_34.po_id === d14_35.po_id,
    "4C.1: Worked Example 14 consolidates PR-26-00034, PR-26-00032, PR-26-00031, PR-26-00035 into one shared PO"
  );
  const poConsolidated = result.poGroups?.find((p) => p.poId === d14_34.po_id);
  assert(
    Boolean(poConsolidated && poConsolidated.status === "PROPOSED" && poConsolidated.prReferences.length === 4),
    "4C.2: Consolidated PO group has status PROPOSED and preserves all 4 original PR line references"
  );

  // 5.2 Exact 24-Hour Boundary, Non-Transitive Chaining, Different Supplier/Plant/Route, Sourcing Exclusion
  const makePoDecision = (
    groupId: string,
    prNo: string,
    createdIso: string,
    supplierId: string,
    plant: string,
    route: "CONTRACT_PO" | "SPOT_PO" | "EMERGENCY_PO" | "RFQ",
    decisionType: "PO" | "SOURCING_REQUEST" = "PO"
  ): RequirementDecision => {
    const dt = new Date(createdIso);
    const req: RequirementGroup = {
      groupId,
      plant,
      resolvedItemCode: "ITM-1009",
      isNewItem: false,
      isEmergency: false,
      requirementDate: dt,
      firstLineNeedByDate: dt,
      earliestNeedByDate: dt,
      lines: [
        {
          pr_no: prNo,
          pr_line: 1,
          created_at: createdIso,
          requester: "Tester",
          department: "QA",
          plant,
          item_code: "ITM-1009",
          description: "Hex bolt",
          quantity: 100,
          uom: "NOS",
          need_by_date: createdIso,
          urgency: "Normal",
          resolvedItemCode: "ITM-1009",
          isNewItem: false,
          matchExplanation: "Matched",
          parsedCreatedAt: dt,
          parsedNeedByDate: dt,
        },
      ],
      totalQuantity: 100,
      uom: "NOS",
      unitPrice: 7,
      priceSource: "CONTRACT_RATE",
      priceExplanation: "Contract",
      groupValueInr: 700,
    };
    return {
      groupId,
      requirement: req,
      decision: decisionType,
      route,
      supplierId: decisionType === "PO" ? supplierId : undefined,
      unitPrice: decisionType === "PO" ? 7 : undefined,
      groupValueInr: 700,
      suggestedSupplierIds: decisionType === "SOURCING_REQUEST" ? ["S007", "S006"] : [],
      policyVersion: "5.0",
      clause: "5.2",
      reason: "Test consolidation",
      preferredSuppliers: [],
    };
  };

  const consolidationTestInput: RequirementDecision[] = [
    // T = 0h (Base PO-0001)
    makePoDecision("REQ-C1", "PR-C-01", "2026-11-01T10:00:00.000Z", "S007", "PUN1", "CONTRACT_PO"),
    // T = +15h (Within 24h of REQ-C1 -> joins PO-0001)
    makePoDecision("REQ-C2", "PR-C-02", "2026-11-02T01:00:00.000Z", "S007", "PUN1", "CONTRACT_PO"),
    // T = +24.0h exact boundary (Exactly 24h from REQ-C1 -> joins PO-0001)
    makePoDecision("REQ-C3", "PR-C-03", "2026-11-02T10:00:00.000Z", "S007", "PUN1", "CONTRACT_PO"),
    // T = +24h + 1s (Within 9h of REQ-C2, but >24h from REQ-C1 -> non-transitive, starts PO-0002!)
    makePoDecision("REQ-C4", "PR-C-04", "2026-11-02T10:00:01.000Z", "S007", "PUN1", "CONTRACT_PO"),
    // Different plant (CHK1 at T = +2h -> separate PO-0003)
    makePoDecision("REQ-C5", "PR-C-05", "2026-11-01T12:00:00.000Z", "S007", "CHK1", "CONTRACT_PO"),
    // Different supplier (S006 at T = +2h -> separate PO-0004)
    makePoDecision("REQ-C6", "PR-C-06", "2026-11-01T12:00:00.000Z", "S006", "PUN1", "CONTRACT_PO"),
    // Different route (SPOT_PO at T = +2h -> separate PO-0005)
    makePoDecision("REQ-C7", "PR-C-07", "2026-11-01T12:00:00.000Z", "S007", "PUN1", "SPOT_PO"),
    // Sourcing request (RFQ -> never consolidated)
    makePoDecision("REQ-C8", "PR-C-08", "2026-11-01T12:00:00.000Z", "S007", "PUN1", "RFQ", "SOURCING_REQUEST"),
  ];

  const { decisionsWithPoId: cOut } = consolidatePurchaseOrders(consolidationTestInput, 24);
  const cMap = new Map(cOut.map((d) => [d.groupId, d.poId]));
  assert(
    cMap.get("REQ-C1") === "PO-0001" &&
      cMap.get("REQ-C2") === "PO-0001" &&
      cMap.get("REQ-C3") === "PO-0001",
    "4C.3: Same supplier/plant/route up to exact 24.0-hour boundary consolidate into PO-0001"
  );
  assert(
    cMap.get("REQ-C4") !== cMap.get("REQ-C1"),
    "4C.4: Non-transitive consolidation: requirement at +24h01s from first requirement starts a new PO group"
  );
  assert(
    cMap.get("REQ-C5") !== cMap.get("REQ-C1") &&
      cMap.get("REQ-C6") !== cMap.get("REQ-C1") &&
      cMap.get("REQ-C7") !== cMap.get("REQ-C1"),
    "4C.5: Different plants, suppliers, or routes remain in separate PO groups"
  );
  assert(
    cMap.get("REQ-C8") === undefined,
    "4C.6: Sourcing requests (SOURCING_REQUEST) are never assigned a po_id or consolidated"
  );

  // 5.3 NOT_PROCESSED Handling for Invalid Quantity (PR-26-00172/1) and Invalid Plant (PR-26-00173/1)
  const d172 = outputMap.get("PR-26-00172/1")!;
  const d173 = outputMap.get("PR-26-00173/1")!;
  assert(
    d172.route === "NOT_PROCESSED" && d172.po_id === "" && d172.group_id === "",
    "4C.7: PR-26-00172/1 (quantity = 0) is retained in CSV output with route NOT_PROCESSED"
  );
  assert(
    d173.route === "NOT_PROCESSED" && d173.po_id === "" && d173.group_id === "",
    "4C.8: PR-26-00173/1 (out-of-scope plant PUN2) is retained in CSV output with route NOT_PROCESSED"
  );

  // 5.4 CSV Escaping & Field Completeness Verification
  const customEscapingRows = [
    {
      pr_no: "PR-ESC-01",
      pr_line: 1,
      resolved_item_code: "ITM-1001",
      group_id: "REQ-0001",
      po_id: "",
      decision: "SOURCING_REQUEST" as const,
      route: "RFQ" as const,
      supplier_id: "",
      unit_price: "",
      group_value_inr: 250000,
      suggested_supplier_ids: "S001;S002;S003",
      policy_version: "5.0",
      reason: 'Clause 5.5, quotes required for "MS Sheet, 2mm"\nMulti-line note included.',
    },
  ];
  const escapedCsv = formatDecisionOutputsToCsv(customEscapingRows);
  const reparsed = Papa.parse<Record<string, string>>(escapedCsv, { header: true });
  assert(
    reparsed.data.length === 1 &&
      reparsed.data[0].reason === 'Clause 5.5, quotes required for "MS Sheet, 2mm"\nMulti-line note included.' &&
      reparsed.data[0].po_id === "" &&
      reparsed.data[0].supplier_id === "" &&
      reparsed.data[0].unit_price === "",
    "4C.9: CSV export properly escapes commas, quotes, and newlines and leaves PO fields empty for sourcing requests"
  );

  // 5.5 Batch History, Idempotent Duplicate Submission, Validation & Authorization
  const buyerUser: SafeUser = {
    id: "usr_buyer_test",
    name: "Marcus Vance",
    email: "buyer@cantill.ai",
    role: "BUYER",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const requesterUser: SafeUser = {
    id: "usr_req_test",
    name: "Alex Patel",
    email: "requester@cantill.ai",
    role: "REQUESTER",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Unauthorized role check
  let requesterBlocked = false;
  try {
    await executeAndPersistBatch({
      csvContent: sampleBatchCsv,
      batchName: "sample_pr_batch.csv",
      user: requesterUser,
    });
  } catch (err: any) {
    requesterBlocked = err.statusCode === 403 || err.message.includes("not authorized");
  }
  assert(requesterBlocked, "4C.10: REQUESTER role is forbidden from executing batch processing");

  // First batch execution by authorized Buyer
  const run1 = await executeAndPersistBatch({
    csvContent: sampleBatchCsv,
    batchName: "sample_pr_batch.csv",
    policyVersion: "5.0",
    user: buyerUser,
  });
  assert(
    Boolean(run1.runId && run1.isDuplicateSubmission === false && run1.totalPrLines === 186),
    "4C.11: Authorized Buyer executes and persists sample batch (186 lines)"
  );

  // Duplicate submission idempotency check
  const run2 = await executeAndPersistBatch({
    csvContent: sampleBatchCsv,
    batchName: "sample_pr_batch.csv",
    policyVersion: "5.0",
    user: buyerUser,
  });
  assert(
    run2.isDuplicateSubmission === true && run2.runId === run1.runId,
    "4C.12: Submitting identical batch under same policyVersion is idempotent and returns existing runId"
  );

  // Failed validation does not create partial or duplicate runs
  const historyBeforeInvalid = await listBatchProcessingRuns(buyerUser);
  let invalidRejected = false;
  try {
    await executeAndPersistBatch({
      csvContent: "pr_no,pr_line,description\nPR-BAD-1,1,Missing quantity and plant headers",
      batchName: "invalid.csv",
      user: buyerUser,
    });
  } catch (err: any) {
    invalidRejected = err.statusCode === 400 || err.message.includes("missing required headers");
  }
  const historyAfterInvalid = await listBatchProcessingRuns(buyerUser);
  assert(
    invalidRejected && historyAfterInvalid.length === historyBeforeInvalid.length,
    "4C.13: Invalid CSV is rejected with ValidationError without creating partial processing runs"
  );

  // Retrieve specific run & verify CSV download content
  const fetchedRun = await getBatchProcessingRunById(run1.runId!, buyerUser);
  const parsedOutputCsv = Papa.parse<Record<string, string>>(fetchedRun.csvContent, {
    header: true,
    skipEmptyLines: "greedy",
  });
  assert(
    fetchedRun.runId === run1.runId && parsedOutputCsv.data.length === 186,
    "4C.14: Processing history retrieves saved run and downloadable CSV with all 186 PR lines"
  );

  // Summary
  console.log("\n=================================================");
  console.log(`  PHASE 4 TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log("=================================================\n");
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
