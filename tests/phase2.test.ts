import { hashPassword, verifyPassword } from "../lib/auth/password";
import { ROLE_PERMISSIONS, UserRole } from "../types/auth";
import { hasPermission } from "../lib/auth/guard";
import {
  importItems,
  importSuppliers,
  importPlants,
  importContracts,
  importContractLines,
  importPurchaseHistory,
} from "../services/importService";
import { listItems } from "../services/itemService";
import { listSuppliers } from "../services/supplierService";
import { connectToDatabase } from "../lib/db";
import { Item } from "../models/Item";
import { Supplier } from "../models/Supplier";
import { Plant } from "../models/Plant";
import { User } from "../models/User";

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
  console.log("   CANTILL.AI PHASE 2 VERIFICATION TEST SUITE    ");
  console.log("=================================================\n");

  // -------------------------------------------------------------------
  // TEST GROUP 1: Password Hashing & Verification
  // -------------------------------------------------------------------
  console.log("▶ TEST GROUP 1: Authentication & Password Security");
  const testPassword = "CantillSuperSecret2026!";
  const hash = await hashPassword(testPassword);
  assert(hash !== testPassword, "Password hash is not plaintext");
  assert(hash.startsWith("$2"), "Password hash uses standard bcrypt format");
  const isCorrect = await verifyPassword(testPassword, hash);
  assert(isCorrect, "Valid password passes bcrypt verification");
  const isWrong = await verifyPassword("WrongPassword123!", hash);
  assert(!isWrong, "Invalid password fails bcrypt verification");

  // -------------------------------------------------------------------
  // TEST GROUP 2: Role-Based Access Control (RBAC) & Permissions
  // -------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 2: Role-Based Authorization & Permissions");
  assert(hasPermission("REQUESTER", "chat:access"), "REQUESTER has chat:access");
  assert(hasPermission("REQUESTER", "requisition:create"), "REQUESTER can create requisitions");
  assert(!hasPermission("REQUESTER", "master_data:import"), "REQUESTER cannot import master data");
  assert(!hasPermission("REQUESTER", "supplier:manage"), "REQUESTER cannot manage suppliers");

  assert(hasPermission("BUYER", "buyer:workspace"), "BUYER has buyer:workspace access");
  assert(hasPermission("BUYER", "contract:read"), "BUYER can read contracts");
  assert(!hasPermission("BUYER", "user:manage"), "BUYER cannot manage users");

  assert(hasPermission("PROCUREMENT_ADMIN", "user:manage"), "ADMIN can manage users");
  assert(hasPermission("PROCUREMENT_ADMIN", "master_data:import"), "ADMIN can import master data");
  assert(hasPermission("PROCUREMENT_ADMIN", "policy:manage"), "ADMIN can manage policies");

  // -------------------------------------------------------------------
  // TEST GROUP 3: Database Connection & Master Data Models
  // -------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 3: Database Connection & Model Registries");
  let dbAvailable = false;
  try {
    await connectToDatabase();
    dbAvailable = true;
    console.log("  ℹ Connected to MongoDB Atlas instance.");
  } catch (err) {
    console.log("  ⚠ MongoDB Atlas instance unreachable in current environment, testing in-memory logic.");
  }

  // -------------------------------------------------------------------
  // TEST GROUP 4: CSV Validation & Normalization
  // -------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 4: CSV Validation & Mandatory Field Enforcement");

  // Test missing header detection
  const invalidCsvMissingHeader = `wrong_code,description\n1001,Test`;
  let missingHeaderCaught = false;
  try {
    await importItems(invalidCsvMissingHeader, "test.csv", "test-user");
  } catch (e: any) {
    missingHeaderCaught = e.message.includes("missing required headers");
  }
  assert(missingHeaderCaught, "Rejects CSV missing mandatory headers");

  // Test row-level error capturing
  if (dbAvailable) {
    const invalidRowCsv = `item_code,description,uom,category,item_type,standard_price
ITM-TEST-01,Valid Item Description,NOS,Category A,Material,100
,Missing Code Item,NOS,Category A,Material,100
ITM-TEST-02,Invalid Price Item,NOS,Category A,Material,NOT_A_NUMBER
`;
    const res = await importItems(invalidRowCsv, "test_invalid.csv", "test-user");
    assert(res.totalRows === 3, "Parsed all 3 rows");
    assert(res.inserted === 1, "Only 1 valid row inserted");
    assert(res.failed === 2, "2 invalid rows correctly captured in error log");
    assert(res.errors.length === 2, "Error details retained for auditing");

    // Clean up test item
    await Item.deleteOne({ itemCode: "ITM-TEST-01" });
  } else {
    console.log("  ℹ Skipped DB write assertions (No MongoDB URI reachable)");
  }

  // -------------------------------------------------------------------
  // TEST GROUP 5: Idempotency & Duplicate Re-import Handling
  // -------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 5: Idempotent Re-import & Upsert Behavior");
  if (dbAvailable) {
    const sampleItem = `item_code,description,uom,category,item_type,standard_price
ITM-IDEM-01,Idempotent Test Item,KG,Test Category,Material,250.00
`;
    // First import
    const firstRes = await importItems(sampleItem, "idem.csv", "test-user");
    assert(firstRes.inserted === 1, "First import inserts new record");

    // Second import (Same data)
    const secondRes = await importItems(sampleItem, "idem.csv", "test-user");
    assert(secondRes.inserted === 0, "Second import does not create duplicate record");
    assert(secondRes.failed === 0, "Re-import completes cleanly without crashing");

    // Clean up
    await Item.deleteOne({ itemCode: "ITM-IDEM-01" });
  } else {
    console.log("  ℹ Skipped DB upsert assertions (No MongoDB URI reachable)");
  }

  // -------------------------------------------------------------------
  // TEST GROUP 6: Referential Integrity Verification
  // -------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 6: Referential Integrity Checking");
  if (dbAvailable) {
    const poWithNonExistentSupplier = `po_number,po_date,supplier_id,item_code,quantity,uom,unit_price,plant,delivered_on_time
9999999,2025-06-01,S_NON_EXISTENT_999,ITM_NON_EXISTENT_999,10,NOS,100,PUN1,True
`;
    const poRes = await importPurchaseHistory(poWithNonExistentSupplier, "po_ref.csv", "test-user");
    assert(poRes.failed > 0, "Detected referential violation for non-existent supplier/item");
    assert(
      poRes.errors.some((e) => e.error.includes("Referential violation")),
      "Detailed referential violation reported to audit log"
    );
  } else {
    console.log("  ℹ Skipped DB referential assertions (No MongoDB URI reachable)");
  }

  console.log("\n=================================================");
  console.log(`   TEST RESULTS: ${passedTests}/${totalTests} PASSED   `);
  console.log("=================================================\n");
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
