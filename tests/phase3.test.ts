import { parseQuantityAndUom } from "../services/chat-intake/quantityParser";
import { matchPlant } from "../services/chat-intake/plantMatcher";
import { parseNaturalDate } from "../services/chat-intake/dateParser";
import { parseUrgency } from "../services/chat-intake/urgencyParser";
import { matchItemInCatalog } from "../services/chat-intake/itemMatcher";
import { parseIncomingIntakeMessage } from "../services/chat-intake/messageParser";
import { generateNextClarification } from "../services/chat-intake/clarificationService";
import {
  createConversation,
  getConversation,
  processUserMessage,
  confirmConversation,
  cancelConversation,
} from "../services/chat-intake/conversationService";
import {
  listRequisitions,
  getRequisitionWithLines,
  importSamplePrBatch,
} from "../services/requisitionService";
import { connectToDatabase } from "../lib/db";
import { Item } from "../models/Item";
import { Plant } from "../models/Plant";
import { Requisition } from "../models/Requisition";
import { RequisitionLine } from "../models/RequisitionLine";
import { Conversation } from "../models/Conversation";
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
  console.log("   CANTILL.AI PHASE 3 VERIFICATION TEST SUITE    ");
  console.log("=================================================\n");

  let dbAvailable = false;
  try {
    await connectToDatabase();
    dbAvailable = true;
    console.log("  ℹ Connected to MongoDB Atlas instance.\n");
  } catch (err) {
    console.log("  ⚠ MongoDB Atlas instance unreachable in current environment; testing deterministic engines & in-memory logic.\n");
  }

  // -------------------------------------------------------------------
  // TEST GROUP 1: Quantity and UOM Parsing
  // -------------------------------------------------------------------
  console.log("▶ TEST GROUP 1: Deterministic Quantity & UOM Extraction");

  const q1 = parseQuantityAndUom("I need 200 nitrile gloves");
  assert(q1.quantity === 200, "Extracts integer quantity 200");
  assert(q1.uom === "NOS" || q1.uom === "PAIR" || !q1.uom, "Handles default/inferred UOM");

  const q2 = parseQuantityAndUom("Please procure 45.5 kg of welding wire");
  assert(q2.quantity === 45.5, "Extracts decimal quantity 45.5");
  assert(q2.uom === "KG", "Normalizes unit KG");

  const q3 = parseQuantityAndUom("Order 100 boxes of screws");
  assert(q3.quantity === 100, "Extracts 100 quantity");
  assert(q3.uom === "BOX", "Normalizes unit BOX");

  const q4 = parseQuantityAndUom("Need 12 pairs of safety boots");
  assert(q4.quantity === 12, "Extracts 12 quantity");
  assert(q4.uom === "PAIR", "Normalizes pairs to PAIR");

  const q5 = parseQuantityAndUom("Procure 5 barrels cutting oil");
  assert(q5.quantity === 5, "Extracts 5 quantity");
  assert(q5.uom === "BRL", "Normalizes barrels to BRL");

  const q6 = parseQuantityAndUom("Send 3 rolls packing film");
  assert(q6.quantity === 3, "Extracts 3 quantity");
  assert(q6.uom === "ROL", "Normalizes rolls to ROL");

  // -------------------------------------------------------------------
  // TEST GROUP 2: Plant Identification & Alias Matching
  // -------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 2: Plant Name & Code Matching");

  const p1 = await matchPlant("Send items to Chakan plant");
  assert(p1 !== null && p1.plantCode === "CHK1", "Matches 'Chakan' to CHK1");

  const p2 = await matchPlant("Destination is PUN1");
  assert(p2 !== null && p2.plantCode === "PUN1", "Matches explicit plant code PUN1");

  const p3 = await matchPlant("Deliver to Bhosari facility");
  assert(p3 !== null && p3.plantCode === "PUN1", "Matches 'Bhosari' to PUN1");

  const p4 = await matchPlant("Unknown warehouse somewhere");
  assert(p4 === null, "Returns null for unknown plant");

  // -------------------------------------------------------------------
  // TEST GROUP 3: Date Parsing & IST Timezone Handling
  // -------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 3: Deterministic Natural & Relative Date Parsing");

  const d1 = parseNaturalDate("Need delivery by tomorrow");
  assert(d1.date !== undefined && d1.date !== null, "Extracts 'tomorrow' as valid Date");

  const d2 = parseNaturalDate("Need it by next Friday");
  assert(d2.date !== undefined && d2.date !== null, "Extracts 'next Friday' as valid Date");

  const d3 = parseNaturalDate("Required in 7 days");
  assert(d3.date !== undefined && d3.date !== null, "Extracts 'in 7 days' as valid Date");

  const d4 = parseNaturalDate("Deliver by 2026-12-15");
  assert(d4.date !== undefined && d4.date.includes("2026-12-15"), "Extracts ISO explicit date 2026-12-15");

  const d5 = parseNaturalDate("No timeframe mentioned");
  assert(!d5.date, "Returns undefined when no date or timeframe is specified");

  // -------------------------------------------------------------------
  // TEST GROUP 4: Urgency Level Detection
  // -------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 4: Urgency Level Parsing");

  const u1 = parseUrgency("Need this urgently for line breakdown");
  assert(u1.urgency === "Urgent", "Identifies 'Urgent' priority");

  const u2 = parseUrgency("Critical emergency breakdown in unit 2");
  assert(u2.urgency === "Emergency", "Identifies 'Emergency' priority");

  const u3 = parseUrgency("Standard replenishment for stock");
  assert(u3.urgency === "Normal", "Defaults to 'Normal' priority");

  const u4 = parseUrgency("high priority dispatch needed ASAP");
  assert(u4.urgency === "Urgent", "Identifies ASAP/high priority as Urgent");

  // -------------------------------------------------------------------
  // TEST GROUP 5: Single-Shot Full Message Parsing
  // -------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 5: Orchestrated Multi-Entity Message Extraction");

  const fullPrompt = "I need 200 nitrile gloves for the Chakan plant by next Friday.";
  const parsed = await parseIncomingIntakeMessage(fullPrompt);

  assert(parsed.quantityResult.quantity === 200, "Parsed quantity 200 from full prompt");
  assert(parsed.plantResult?.plantCode === "CHK1", "Parsed Chakan plant as CHK1");
  assert(parsed.dateResult.date !== undefined && parsed.dateResult.date !== null, "Parsed delivery date from 'next Friday'");
  assert(parsed.urgencyResult.urgency === undefined || parsed.urgencyResult.urgency === "Normal", "Correctly handles unstated urgency in single prompt");
  assert(parsed.extractedItemQuery.length > 0, "Extracted isolated item query string");

  // -------------------------------------------------------------------
  // TEST GROUP 6: Clarification Engine & Next Step Logic
  // -------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 6: Clarification Generation & Confirmation States");

  const partialCollected1 = {
    missingFields: ["plant", "date"],
    originalDescription: "Safety Helmets",
    quantity: 50,
  };
  const clar1 = generateNextClarification(partialCollected1);
  assert(clar1.nextState === "COLLECTING_DETAILS", "State remains COLLECTING_DETAILS when fields are missing");
  assert(clar1.clarificationType === "plant", "Asks for missing plant first");
  assert(Boolean(clar1.options && clar1.options.length > 0), "Provides plant selection options");

  const partialCollected2 = {
    missingFields: ["quantity"],
    originalDescription: "Bearing 6308",
    plantCode: "CHK1",
  };
  const clar2 = generateNextClarification(partialCollected2);
  assert(clar2.clarificationType === "quantity", "Prompts for quantity when missing");

  const readyCollected = {
    missingFields: [],
    itemCode: "ITM-1021",
    matchedItem: {
      itemCode: "ITM-1021",
      description: "Ball bearing 6205-2RS",
      uom: "NOS",
      category: "Bearings",
      standardPrice: 420.5,
    },
    quantity: 10,
    uom: "NOS",
    plantCode: "PUN1",
    plantName: "Pune Plant",
    needByDate: "2026-12-01",
    urgency: "Normal" as const,
  };
  const clar3 = generateNextClarification(readyCollected);
  assert(clar3.nextState === "WAITING_FOR_CONFIRMATION", "State transitions to WAITING_FOR_CONFIRMATION when complete");
  assert(clar3.clarificationType === "confirmation", "Clarification type is confirmation");

  // -------------------------------------------------------------------
  // TEST GROUP 7: Live Database & Integration Tests (When DB Connected)
  // -------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 7: Live Database Integration & PR Ingestion");
  if (dbAvailable) {
    const testUser: SafeUser = {
      id: "usr_test_req_01",
      name: "A. Requester",
      email: "requester.test@cantill.ai",
      role: "REQUESTER",
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Item Matcher test
    const im1 = await matchItemInCatalog("ITM-1021");
    assert(im1 !== null, "Item catalog matcher executes cleanly");

    // Conversation lifecycle
    const conv = await createConversation(testUser);
    assert(conv.state === "STARTED", "Initial conversation state is STARTED");
    assert(conv.requesterId === testUser.id, "Conversation associated with test user ID");

    // Process user prompt
    const step1 = await processUserMessage(
      conv.conversationId,
      "I need 100 bearing 6205-2RS for Pune plant",
      testUser
    );
    const step1Data = (step1 as any).collectedData;
    assert(step1Data?.quantity === 100, "Collected quantity 100");
    assert(step1Data?.plantCode === "PUN1", "Collected plantCode PUN1");

    // Confirm requisition
    const confirmResult = await confirmConversation(conv.conversationId, testUser);
    assert(confirmResult.success === true, "Confirmation returns success");
    assert(Boolean(confirmResult.prNo && confirmResult.prNo.startsWith("PR-")), "Generates sequential PR number (PR-YYYY-XXXXX)");

    // Sample Batch Import test
    const sampleCsvContent = `pr_no,pr_line,created_at,requester,department,plant,item_code,description,quantity,uom,estimated_unit_price,need_by_date,urgency
PR-TEST-001,1,2026-11-19 13:45,M. Shaikh,IT,PUN1,ITM-1021,Ball bearing 6205-2RS,10,NOS,420.50,2026-11-27,Normal
PR-TEST-001,2,2026-11-19 13:45,M. Shaikh,IT,PUN1,,Custom safety glove,20,PAIR,50.00,2026-11-27,Normal
PR-TEST-002,1,2026-11-12 15:05,S. Patil,Admin,CHK1,,v-belt b-54,5,NOS,,2026-11-27,Urgent`;

    const importResult = await importSamplePrBatch(sampleCsvContent, "test_batch.csv", testUser.id);
    assert(importResult.totalRows === 3, "Import parsed 3 CSV rows");
    assert(importResult.uniquePrs === 2, "Grouped rows into 2 unique PR headers");

    // Requisition Listing
    const requesterList = await listRequisitions({
      page: 1,
      limit: 10,
      user: testUser,
    });
    assert(requesterList.requisitions.length >= 1, "Requester can view own requisitions");

    // Clean up test data
    await Conversation.deleteOne({ conversationId: conv.conversationId });
    await Requisition.deleteMany({ prNo: { $in: [confirmResult.prNo, "PR-TEST-001", "PR-TEST-002"] } });
    await RequisitionLine.deleteMany({ prNo: { $in: [confirmResult.prNo, "PR-TEST-001", "PR-TEST-002"] } });
  } else {
    console.log("  ℹ Skipped DB write assertions (No MongoDB Atlas URI reachable in current environment)");
  }

  // Summary
  console.log("\n=================================================");
  console.log(`  PHASE 3 TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log("=================================================\n");
}

runTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
