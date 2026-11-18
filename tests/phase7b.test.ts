import fs from "fs";
import path from "path";
import { Supplier } from "../models/Supplier";
import { parseAndValidateSupplierCsvRows } from "../services/importService";
import {
  normalizeSupplierCategories,
  parseNullableNumericMetric,
  buildContextFromCollections,
  loadMasterDataFromFiles,
} from "../services/decision-engine/utils/masterDataLoader";
import {
  calculatePreferredSuppliers,
  getSupplierSuggestionsWithExplanation,
  analyzeSupplierPerformance,
  evaluateSupplierEligibility,
  processPrBatch,
  parseRawPrBatchCsv,
  CORVO_POLICY_V5_CONFIG,
} from "../services/decision-engine";

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

async function runPhase7BTests() {
  console.log("=================================================");
  console.log("  CANTILL.AI PHASE 7B DATA INTEGRITY TEST SUITE  ");
  console.log("=================================================\n");

  // ---------------------------------------------------------------------------
  // TEST GROUP 1: Nullable Supplier Performance Metrics (Schema & CSV Import)
  // ---------------------------------------------------------------------------
  console.log("▶ TEST GROUP 1: Nullable Supplier Performance Metrics");

  // 1.1 Blank on_time_pct
  const csvBlankOnTime = `supplier_id,name,city,categories,status,on_time_pct,quality_rating
S801,Blank OTD Vendor,Pune,Fasteners,Active,,4.2`;
  const parsedBlankOnTime = parseAndValidateSupplierCsvRows(csvBlankOnTime);
  assert(
    parsedBlankOnTime.errors.length === 0 &&
      parsedBlankOnTime.validRows.length === 1 &&
      parsedBlankOnTime.validRows[0].onTimePct === null &&
      parsedBlankOnTime.validRows[0].qualityRating === 4.2,
    "1.1: Blank on_time_pct is accepted and stored as null (not rejected or coerced to 0)"
  );

  // 1.2 Blank quality_rating
  const csvBlankQuality = `supplier_id,name,city,categories,status,on_time_pct,quality_rating
S802,Blank Quality Vendor,Pune,Fasteners,Active,85,`;
  const parsedBlankQuality = parseAndValidateSupplierCsvRows(csvBlankQuality);
  assert(
    parsedBlankQuality.errors.length === 0 &&
      parsedBlankQuality.validRows.length === 1 &&
      parsedBlankQuality.validRows[0].onTimePct === 85 &&
      parsedBlankQuality.validRows[0].qualityRating === null,
    "1.2: Blank quality_rating is accepted and stored as null (not rejected or coerced to 0)"
  );

  // 1.3 Both metrics missing + Mongoose schema validation
  const csvBothMissing = `supplier_id,name,city,categories,status,on_time_pct,quality_rating
S803,Both Missing Vendor,Mumbai,Steel & Metals,Active,,`;
  const parsedBothMissing = parseAndValidateSupplierCsvRows(csvBothMissing);
  const docBothMissing = new Supplier(parsedBothMissing.validRows[0]);
  const validationErrBothMissing = docBothMissing.validateSync();
  assert(
    parsedBothMissing.errors.length === 0 &&
      parsedBothMissing.validRows[0].onTimePct === null &&
      parsedBothMissing.validRows[0].qualityRating === null &&
      validationErrBothMissing === undefined,
    "1.3: Both metrics missing stored as null and pass Mongoose Supplier schema validation"
  );

  // 1.4 Valid zero values preserved as 0 (not converted to null)
  const csvZeroValues = `supplier_id,name,city,categories,status,on_time_pct,quality_rating
S804,Zero Metrics Vendor,Chakan,Packaging,Active,0,0`;
  const parsedZeroValues = parseAndValidateSupplierCsvRows(csvZeroValues);
  const docZeroValues = new Supplier(parsedZeroValues.validRows[0]);
  assert(
    parsedZeroValues.errors.length === 0 &&
      parsedZeroValues.validRows[0].onTimePct === 0 &&
      parsedZeroValues.validRows[0].qualityRating === 0 &&
      docZeroValues.validateSync() === undefined &&
      parseNullableNumericMetric(0) === 0 &&
      parseNullableNumericMetric("0") === 0,
    "1.4: Legitimate zero values (0 and '0') are preserved as numeric 0"
  );

  // 1.5 Valid numeric values
  const csvValidNumeric = `supplier_id,name,city,categories,status,on_time_pct,quality_rating
S805,Valid Numeric Vendor,Pune,Lubricants,Active,91.5,4.6`;
  const parsedValidNumeric = parseAndValidateSupplierCsvRows(csvValidNumeric);
  assert(
    parsedValidNumeric.errors.length === 0 &&
      parsedValidNumeric.validRows[0].onTimePct === 91.5 &&
      parsedValidNumeric.validRows[0].qualityRating === 4.6,
    "1.5: Valid numeric values (91.5, 4.6) are parsed accurately"
  );

  // 1.6 Invalid non-empty numeric values rejected
  const csvInvalidMetrics = `supplier_id,name,city,categories,status,on_time_pct,quality_rating
S806,Bad OTD Text,Pune,Fasteners,Active,NOT_A_NUM,4.0
S807,Out Of Range OTD,Pune,Fasteners,Active,105,4.0
S808,Negative OTD,Pune,Fasteners,Active,-5,4.0
S809,Out Of Range Quality,Pune,Fasteners,Active,80,5.5
S810,Bad Quality Text,Pune,Fasteners,Active,80,INVALID`;
  const parsedInvalid = parseAndValidateSupplierCsvRows(csvInvalidMetrics);
  assert(
    parsedInvalid.validRows.length === 0 && parsedInvalid.errors.length === 5,
    "1.6: Invalid non-empty values (NaN, <0, >100 OTD, >5 Quality) are rejected with row errors"
  );

  // 1.7 Existing supplier records with null metrics display 'Not Available' and score 0
  const perfNullRecord = analyzeSupplierPerformance({
    supplier: {
      supplierId: "S803",
      name: "Both Missing Vendor",
      city: "Mumbai",
      categories: "Steel & Metals",
      status: "Active",
      onTimePercent: null,
      qualityRating: null,
    },
    asOfDate: new Date("2026-11-10T00:00:00.000Z"),
    poHistory: [],
    contracts: [],
    policy: CORVO_POLICY_V5_CONFIG,
  });
  assert(
    perfNullRecord.deliveryPerformance.displayLabel === "Not Available" &&
      perfNullRecord.qualityPerformance.displayLabel === "Not Available" &&
      perfNullRecord.deliveryPerformance.normalizedScore === 0 &&
      perfNullRecord.qualityPerformance.normalizedScore === 0,
    "1.7: Supplier records with null metrics display 'Not Available' and contribute 0 to score"
  );

  // ---------------------------------------------------------------------------
  // TEST GROUP 2: Supplier Categories Normalization
  // ---------------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 2: Supplier Categories Normalization");

  assert(
    normalizeSupplierCategories(["Electrical Spares", "Capital Equipment"]) ===
      "Electrical Spares;Capital Equipment",
    "2.1: Normalizes MongoDB string[] into semicolon-delimited string"
  );
  assert(
    normalizeSupplierCategories("Fasteners") === "Fasteners",
    "2.2: Preserves single category string"
  );
  assert(
    normalizeSupplierCategories([]) === "",
    "2.3: Normalizes empty array [] to empty string ''"
  );
  assert(
    normalizeSupplierCategories(null) === "",
    "2.4: Normalizes null to empty string ''"
  );
  assert(
    normalizeSupplierCategories(undefined) === "",
    "2.5: Normalizes missing/undefined field to empty string ''"
  );
  assert(
    normalizeSupplierCategories("Electrical Spares, Capital Equipment; Hydraulics & Pneumatics") ===
      "Electrical Spares;Capital Equipment;Hydraulics & Pneumatics",
    "2.6: Normalizes multiple categories across comma/semicolon delimiters"
  );

  // 2.7 Case-insensitive category matching on hydrated MongoDB array categories
  const hydratedContextTest = buildContextFromCollections(
    [
      {
        itemCode: "ITM-1006",
        description: "Hex bolt M12x50 grade 8.8",
        uom: "NOS",
        category: "Fasteners",
        itemType: "Material",
        standardPrice: 14.6,
      },
    ],
    [
      {
        supplierId: "S950",
        supplierName: "Array Category Fastener Supplier",
        city: "Pune",
        categories: ["FASTENERS", "STEEL & METALS"], // Uppercase string[] from MongoDB
        supplierStatus: "Active",
        onTimePct: 90,
        qualityRating: 4.5,
      },
    ],
    [],
    [],
    []
  );
  const topUpMatch = getSupplierSuggestionsWithExplanation(
    "ITM-1006",
    "fasteners", // lowercase query
    [],
    hydratedContextTest.suppliersMap,
    1,
    CORVO_POLICY_V5_CONFIG.preferredSuppliers
  );
  assert(
    topUpMatch.suggestions.length === 1 && topUpMatch.suggestions[0] === "S950",
    "2.7: Case-insensitive category matching succeeds on MongoDB string[] supplier categories"
  );

  // ---------------------------------------------------------------------------
  // TEST GROUP 3: End-to-End Integration (Actual CSV -> MongoDB Hydration -> Engine)
  // ---------------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 3: End-to-End Integration & Equivalence Verification");

  const suppCsvPath = path.join(
    process.cwd(),
    "data",
    "Cantill_FullStack_Task_Kit",
    "master_data",
    "supplier_master.csv"
  );
  const actualSupplierCsv = fs.readFileSync(suppCsvPath, "utf8");
  const parsedActualSuppliers = parseAndValidateSupplierCsvRows(actualSupplierCsv);

  assert(
    parsedActualSuppliers.totalRows === 48 &&
      parsedActualSuppliers.validRows.length === 48 &&
      parsedActualSuppliers.errors.length === 0,
    "3.1: Actual supplier_master.csv (48 rows) parses with 0 errors"
  );

  // Simulate MongoDB collection documents (where categories is string[] and include a supplier with null metrics)
  const fileMasterData = loadMasterDataFromFiles();

  const mongoItemsDocs = Array.from(fileMasterData.itemMasterMap.values()).map((i) => ({
    itemCode: i.itemCode,
    description: i.description,
    uom: i.uom,
    category: i.category,
    itemType: i.itemType,
    standardPrice: i.standardPrice,
  }));

  const mongoSupplierDocs = parsedActualSuppliers.validRows.map((s) => ({
    supplierId: s.supplierId,
    supplierName: s.supplierName,
    city: s.city,
    categories: s.categories, // string[] as stored in MongoDB!
    supplierStatus: s.supplierStatus,
    onTimePct: s.onTimePct,
    qualityRating: s.qualityRating,
  }));

  const mongoPoDocs = fileMasterData.poHistory.map((p) => ({
    poNumber: p.poNumber,
    poDate: p.poDate,
    supplierId: p.supplierId,
    itemCode: p.itemCode,
    quantity: p.quantity,
    uom: p.uom,
    unitPrice: p.unitPrice,
    plant: p.plant,
    deliveredOnTime: p.deliveredOnTime,
  }));

  const mongoContractDocs = fileMasterData.contracts
    .filter((c) => c.source === "register")
    .map((c) => ({
      contractId: c.contractId,
      supplierId: c.supplierId,
      supplierName: c.supplierName,
      startDate: c.startDate,
      endDate: c.endDate,
      valueCap: c.valueCap,
      consumedValue: c.consumedValue,
    }));

  const mongoContractLineDocs = fileMasterData.contracts
    .filter((c) => c.source === "register")
    .flatMap((c) =>
      c.lines.map((l) => ({
        contractId: c.contractId,
        itemCode: l.itemCode,
        description: l.description,
        uom: l.uom,
        contractedPrice: l.rate,
      }))
    );

  // Hydrate MasterDataContext from MongoDB-shaped documents
  const mongoHydratedContext = buildContextFromCollections(
    mongoItemsDocs,
    mongoSupplierDocs,
    mongoPoDocs,
    mongoContractDocs,
    mongoContractLineDocs
  );

  // Verify S020 (multiple categories: Electrical Spares;Capital Equipment) is identical between CSV & MongoDB hydration
  const fileS020 = fileMasterData.suppliersMap.get("S020")!;
  const mongoS020 = mongoHydratedContext.suppliersMap.get("S020")!;
  assert(
    typeof mongoS020.categories === "string" &&
      mongoS020.categories === fileS020.categories &&
      mongoS020.categories === "Electrical Spares;Capital Equipment",
    `3.2: MongoDB hydration and CSV fallback produce identical category string for S020 ('${mongoS020.categories}')`
  );

  // Run supplier eligibility and ranking on MongoDB-hydrated context
  const ranked1048FromMongo = calculatePreferredSuppliers(
    "ITM-1048",
    new Date("2026-11-10T00:00:00.000Z"),
    mongoHydratedContext.poHistoryByItem?.get("ITM-1048") || [],
    mongoHydratedContext.contracts,
    mongoHydratedContext.suppliersMap,
    CORVO_POLICY_V5_CONFIG.preferredSuppliers
  );
  assert(
    ranked1048FromMongo.length === 2 &&
      ranked1048FromMongo[0].supplierId === "S029" &&
      ranked1048FromMongo[1].supplierId === "S030",
    "3.3: Preferred supplier ranking on MongoDB-hydrated context matches worked example (S029, S030)"
  );

  // Run full 186-line PR batch on MongoDB-hydrated context and verify 100% identical results & zero TypeErrors
  const batchCsvPath = path.join(
    process.cwd(),
    "data",
    "Cantill_FullStack_Task_Kit",
    "pr_batches",
    "sample_pr_batch.csv"
  );
  const rawLines = parseRawPrBatchCsv(fs.readFileSync(batchCsvPath, "utf8"));
  const batchFromMongoContext = processPrBatch(
    rawLines,
    mongoHydratedContext,
    CORVO_POLICY_V5_CONFIG
  );
  const batchFromFileContext = processPrBatch(
    rawLines,
    fileMasterData,
    CORVO_POLICY_V5_CONFIG
  );

  assert(
    batchFromMongoContext.totalPrLines === 186 &&
      batchFromMongoContext.totalRequirements === 151 &&
      batchFromMongoContext.totalPOs === 81 &&
      batchFromMongoContext.totalSourcingRequests === 57 &&
      batchFromMongoContext.csvContent === batchFromFileContext.csvContent,
    "3.4: Full 186-line batch execution on MongoDB-hydrated context produces 100% identical output to CSV fallback with zero TypeErrors"
  );

  console.log("\n=================================================");
  console.log(`  PHASE 7B TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED`);
  console.log("=================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase7BTests().catch((err) => {
  console.error("Fatal error in Phase 7B test suite:", err);
  process.exit(1);
});
