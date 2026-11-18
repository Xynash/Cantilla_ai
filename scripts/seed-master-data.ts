import { connectToDatabase } from "../lib/db";
import { bootstrapInitialAdmin } from "../lib/auth/bootstrap";
import { bootstrapAllTaskKitData } from "../services/importService";
import { Item } from "../models/Item";
import { Supplier } from "../models/Supplier";
import { Plant } from "../models/Plant";
import { PurchaseHistory } from "../models/PurchaseHistory";
import { Contract } from "../models/Contract";
import { ContractLine } from "../models/ContractLine";
import { User } from "../models/User";

async function main() {
  console.log("🚀 Starting Cantill.ai Phase 2 Master Data Ingestion...\n");

  try {
    await connectToDatabase();
    console.log("Connected to MongoDB Atlas.");

    // 1. Bootstrap Admin
    await bootstrapInitialAdmin();
    console.log("✅ Admin & Demo Accounts Bootstrapped.");

    // 2. Import All Datasets
    const results = await bootstrapAllTaskKitData("seed-script");
    console.log("\n📦 Ingestion Results Summary:");
    for (const [key, res] of Object.entries(results)) {
      console.log(
        ` - ${key.padEnd(16)}: ${res.totalRows} rows -> ${res.inserted} inserted, ${res.updated} updated, ${res.failed} failed (${res.status})`
      );
    }

    // 3. Verify Database Counts
    console.log("\n📊 Verified Database Collection Totals:");
    const [userCount, itemCount, supplierCount, plantCount, contractCount, lineCount, poCount] =
      await Promise.all([
        User.countDocuments(),
        Item.countDocuments(),
        Supplier.countDocuments(),
        Plant.countDocuments(),
        Contract.countDocuments(),
        ContractLine.countDocuments(),
        PurchaseHistory.countDocuments(),
      ]);

    console.log(` - Users             : ${userCount}`);
    console.log(` - Items (Master)    : ${itemCount}`);
    console.log(` - Suppliers (Master): ${supplierCount}`);
    console.log(` - Plants            : ${plantCount}`);
    console.log(` - Contracts         : ${contractCount}`);
    console.log(` - Contract Lines    : ${lineCount}`);
    console.log(` - PO History Records: ${poCount}`);

    console.log("\n✨ Master Data Ingestion & Verification Completed Successfully!");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Fatal Error during seed:", error);
    process.exit(1);
  }
}

main();
