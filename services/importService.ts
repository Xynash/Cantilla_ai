import Papa from "papaparse";
import { connectToDatabase } from "@/lib/db";
import { Item } from "@/models/Item";
import { Supplier } from "@/models/Supplier";
import { Plant } from "@/models/Plant";
import { PurchaseHistory } from "@/models/PurchaseHistory";
import { Contract } from "@/models/Contract";
import { ContractLine } from "@/models/ContractLine";
import { ImportLog } from "@/models/ImportLog";
import { AuditLog } from "@/models/AuditLog";
import fs from "fs";
import path from "path";

export interface ImportResult {
  entityType: string;
  filename: string;
  totalRows: number;
  inserted: number;
  updated: number;
  failed: number;
  errors: Array<{ row: number; error: string; data?: unknown }>;
  status: "success" | "partial" | "failed";
}

/**
 * Helper to parse CSV string into typed rows
 */
function parseCsvRows<T = Record<string, string>>(csvContent: string): {
  data: T[];
  headers: string[];
  errors: Papa.ParseError[];
} {
  const parsed = Papa.parse<T>(csvContent.trim(), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  return {
    data: parsed.data,
    headers: parsed.meta.fields || [],
    errors: parsed.errors,
  };
}

/**
 * 1. Import Items (item_master.csv)
 * Expected headers: item_code, description, uom, category, item_type, standard_price
 */
export async function importItems(
  csvContent: string,
  filename: string = "item_master.csv",
  importedBy: string = "system"
): Promise<ImportResult> {
  const { data, headers } = parseCsvRows<Record<string, string>>(csvContent);

  const requiredHeaders = ["item_code", "description", "uom", "category", "item_type", "standard_price"];
  const missingHeaders = requiredHeaders.filter((rh) => !headers.includes(rh));
  if (missingHeaders.length > 0) {
    throw new Error(`CSV is missing required headers: ${missingHeaders.join(", ")}`);
  }

  await connectToDatabase();

  const errors: ImportResult["errors"] = [];
  const operations: any[] = [];
  const seenCodes = new Set<string>();

  data.forEach((row, index) => {
    const rowNum = index + 2; // header is row 1
    const itemCode = row.item_code?.trim().toUpperCase();
    const description = row.description?.trim();
    const uom = row.uom?.trim().toUpperCase();
    const category = row.category?.trim();
    const itemType = row.item_type?.trim();
    const standardPriceStr = row.standard_price?.trim();

    if (!itemCode) {
      errors.push({ row: rowNum, error: "Missing mandatory field 'item_code'", data: row });
      return;
    }
    if (!description) {
      errors.push({ row: rowNum, error: "Missing mandatory field 'description'", data: row });
      return;
    }
    if (!uom) {
      errors.push({ row: rowNum, error: "Missing mandatory field 'uom'", data: row });
      return;
    }
    if (!category) {
      errors.push({ row: rowNum, error: "Missing mandatory field 'category'", data: row });
      return;
    }

    const standardPrice = parseFloat(standardPriceStr);
    if (isNaN(standardPrice) || standardPrice < 0) {
      errors.push({
        row: rowNum,
        error: `Invalid standard_price value '${standardPriceStr}', must be a non-negative number`,
        data: row,
      });
      return;
    }

    if (seenCodes.has(itemCode)) {
      errors.push({ row: rowNum, error: `Duplicate item_code '${itemCode}' in CSV payload`, data: row });
      return;
    }
    seenCodes.add(itemCode);

    operations.push({
      updateOne: {
        filter: { itemCode },
        update: {
          $set: {
            itemCode,
            description,
            uom,
            category,
            itemType: itemType || "Material",
            standardPrice,
            rawSource: row,
          },
        },
        upsert: true,
      },
    });
  });

  let inserted = 0;
  let updated = 0;

  if (operations.length > 0) {
    const res = await Item.bulkWrite(operations, { ordered: false });
    inserted = res.upsertedCount || 0;
    updated = res.modifiedCount || 0;
  }

  const result: ImportResult = {
    entityType: "Item",
    filename,
    totalRows: data.length,
    inserted,
    updated,
    failed: errors.length,
    errors,
    status: errors.length === 0 ? "success" : operations.length > 0 ? "partial" : "failed",
  };

  await Promise.all([
    ImportLog.create({
      entityType: "Item",
      filename,
      totalRows: data.length,
      inserted,
      updated,
      failed: errors.length,
      rowErrors: errors.slice(0, 50),
      importedBy,
      status: result.status,
    }),
    AuditLog.create({
      actorId: importedBy,
      action: "IMPORT_ITEMS",
      entityType: "Item",
      entityId: "batch",
      newValue: { total: data.length, inserted, updated, failed: errors.length },
    }),
  ]);

  return result;
}

export interface ParsedSupplierRow {
  supplierId: string;
  supplierName: string;
  city: string;
  categories: string[];
  supplierStatus: string;
  onTimePct: number | null;
  qualityRating: number | null;
  rawSource: Record<string, string>;
}

/**
 * Parses and validates supplier_master.csv rows:
 * - Allows blank on_time_pct and quality_rating to be stored as null.
 * - Preserves legitimate zero values (0).
 * - Rejects invalid non-empty numeric values (< 0, > 100 for onTimePct; < 0, > 5 for qualityRating; NaN).
 */
export function parseAndValidateSupplierCsvRows(csvContent: string): {
  totalRows: number;
  validRows: ParsedSupplierRow[];
  errors: ImportResult["errors"];
} {
  const { data, headers } = parseCsvRows<Record<string, string>>(csvContent);

  const requiredHeaders = ["supplier_id", "name", "city", "status"];
  const missingHeaders = requiredHeaders.filter((rh) => !headers.includes(rh));
  if (missingHeaders.length > 0) {
    throw new Error(`CSV is missing required headers: ${missingHeaders.join(", ")}`);
  }

  const errors: ImportResult["errors"] = [];
  const validRows: ParsedSupplierRow[] = [];
  const seenSuppliers = new Set<string>();

  data.forEach((row, index) => {
    const rowNum = index + 2;
    const supplierId = row.supplier_id?.trim().toUpperCase();
    const name = row.name?.trim();
    const city = row.city?.trim();
    const categoriesStr = row.categories?.trim() || "";
    const status = row.status?.trim() || "Active";
    const rawOnTime = row.on_time_pct !== undefined && row.on_time_pct !== null ? String(row.on_time_pct).trim() : "";
    const rawQuality = row.quality_rating !== undefined && row.quality_rating !== null ? String(row.quality_rating).trim() : "";

    if (!supplierId) {
      errors.push({ row: rowNum, error: "Missing mandatory field 'supplier_id'", data: row });
      return;
    }
    if (!name) {
      errors.push({ row: rowNum, error: "Missing mandatory field 'name'", data: row });
      return;
    }
    if (!city) {
      errors.push({ row: rowNum, error: "Missing mandatory field 'city'", data: row });
      return;
    }

    let onTimePct: number | null = null;
    if (rawOnTime !== "") {
      const parsedOnTime = Number(rawOnTime);
      if (!Number.isFinite(parsedOnTime) || parsedOnTime < 0 || parsedOnTime > 100) {
        errors.push({
          row: rowNum,
          error: `Invalid on_time_pct '${rawOnTime}' (must be 0-100 or blank)`,
          data: row,
        });
        return;
      }
      onTimePct = parsedOnTime;
    }

    let qualityRating: number | null = null;
    if (rawQuality !== "") {
      const parsedQuality = Number(rawQuality);
      if (!Number.isFinite(parsedQuality) || parsedQuality < 0 || parsedQuality > 5) {
        errors.push({
          row: rowNum,
          error: `Invalid quality_rating '${rawQuality}' (must be 0-5 or blank)`,
          data: row,
        });
        return;
      }
      qualityRating = parsedQuality;
    }

    if (seenSuppliers.has(supplierId)) {
      errors.push({ row: rowNum, error: `Duplicate supplier_id '${supplierId}' in CSV`, data: row });
      return;
    }
    seenSuppliers.add(supplierId);

    const categories = categoriesStr
      .split(/[,;|]/)
      .map((c) => c.trim())
      .filter(Boolean);

    validRows.push({
      supplierId,
      supplierName: name,
      city,
      categories,
      supplierStatus: status,
      onTimePct,
      qualityRating,
      rawSource: row,
    });
  });

  return {
    totalRows: data.length,
    validRows,
    errors,
  };
}

/**
 * 2. Import Suppliers (supplier_master.csv)
 * Expected headers: supplier_id, name, city, categories, status, on_time_pct, quality_rating
 */
export async function importSuppliers(
  csvContent: string,
  filename: string = "supplier_master.csv",
  importedBy: string = "system"
): Promise<ImportResult> {
  const { totalRows, validRows, errors } = parseAndValidateSupplierCsvRows(csvContent);

  await connectToDatabase();

  const operations: any[] = validRows.map((row) => ({
    updateOne: {
      filter: { supplierId: row.supplierId },
      update: {
        $set: {
          supplierId: row.supplierId,
          supplierName: row.supplierName,
          city: row.city,
          categories: row.categories,
          supplierStatus: row.supplierStatus,
          onTimePct: row.onTimePct,
          qualityRating: row.qualityRating,
          rawSource: row.rawSource,
        },
      },
      upsert: true,
    },
  }));

  let inserted = 0;
  let updated = 0;

  if (operations.length > 0) {
    const res = await Supplier.bulkWrite(operations, { ordered: false });
    inserted = res.upsertedCount || 0;
    updated = res.modifiedCount || 0;
  }

  const result: ImportResult = {
    entityType: "Supplier",
    filename,
    totalRows,
    inserted,
    updated,
    failed: errors.length,
    errors,
    status: errors.length === 0 ? "success" : operations.length > 0 ? "partial" : "failed",
  };

  await Promise.all([
    ImportLog.create({
      entityType: "Supplier",
      filename,
      totalRows,
      inserted,
      updated,
      failed: errors.length,
      rowErrors: errors.slice(0, 50),
      importedBy,
      status: result.status,
    }),
    AuditLog.create({
      actorId: importedBy,
      action: "IMPORT_SUPPLIERS",
      entityType: "Supplier",
      entityId: "batch",
      newValue: { total: totalRows, inserted, updated, failed: errors.length },
    }),
  ]);

  return result;
}

/**
 * 3. Import Plants (plants.csv)
 * Expected headers: plant, name
 */
export async function importPlants(
  csvContent: string,
  filename: string = "plants.csv",
  importedBy: string = "system"
): Promise<ImportResult> {
  const { data, headers } = parseCsvRows<Record<string, string>>(csvContent);

  const requiredHeaders = ["plant", "name"];
  const missingHeaders = requiredHeaders.filter((rh) => !headers.includes(rh));
  if (missingHeaders.length > 0) {
    throw new Error(`CSV is missing required headers: ${missingHeaders.join(", ")}`);
  }

  await connectToDatabase();

  const errors: ImportResult["errors"] = [];
  const operations: any[] = [];
  const seenPlants = new Set<string>();

  data.forEach((row, index) => {
    const rowNum = index + 2;
    const plantCode = row.plant?.trim().toUpperCase();
    const plantName = row.name?.trim();

    if (!plantCode) {
      errors.push({ row: rowNum, error: "Missing mandatory field 'plant'", data: row });
      return;
    }
    if (!plantName) {
      errors.push({ row: rowNum, error: "Missing mandatory field 'name'", data: row });
      return;
    }

    if (seenPlants.has(plantCode)) {
      errors.push({ row: rowNum, error: `Duplicate plant '${plantCode}' in CSV`, data: row });
      return;
    }
    seenPlants.add(plantCode);

    operations.push({
      updateOne: {
        filter: { plantCode },
        update: {
          $set: {
            plantCode,
            plantName,
            location: plantName,
            rawSource: row,
          },
        },
        upsert: true,
      },
    });
  });

  let inserted = 0;
  let updated = 0;

  if (operations.length > 0) {
    const res = await Plant.bulkWrite(operations, { ordered: false });
    inserted = res.upsertedCount || 0;
    updated = res.modifiedCount || 0;
  }

  const result: ImportResult = {
    entityType: "Plant",
    filename,
    totalRows: data.length,
    inserted,
    updated,
    failed: errors.length,
    errors,
    status: errors.length === 0 ? "success" : operations.length > 0 ? "partial" : "failed",
  };

  await Promise.all([
    ImportLog.create({
      entityType: "Plant",
      filename,
      totalRows: data.length,
      inserted,
      updated,
      failed: errors.length,
      rowErrors: errors.slice(0, 50),
      importedBy,
      status: result.status,
    }),
    AuditLog.create({
      actorId: importedBy,
      action: "IMPORT_PLANTS",
      entityType: "Plant",
      entityId: "batch",
      newValue: { total: data.length, inserted, updated, failed: errors.length },
    }),
  ]);

  return result;
}

/**
 * 4. Import Purchase History (po_history.csv)
 * Expected headers: po_number, po_date, supplier_id, item_code, quantity, uom, unit_price, plant, delivered_on_time
 * Includes referential integrity checks against existing Items, Suppliers, Plants.
 */
export async function importPurchaseHistory(
  csvContent: string,
  filename: string = "po_history.csv",
  importedBy: string = "system"
): Promise<ImportResult> {
  await connectToDatabase();
  const { data, headers } = parseCsvRows<Record<string, string>>(csvContent);

  const requiredHeaders = [
    "po_number",
    "po_date",
    "supplier_id",
    "item_code",
    "quantity",
    "uom",
    "unit_price",
    "plant",
  ];
  const missingHeaders = requiredHeaders.filter((rh) => !headers.includes(rh));
  if (missingHeaders.length > 0) {
    throw new Error(`CSV is missing required headers: ${missingHeaders.join(", ")}`);
  }

  // Pre-load reference codes for referential validation
  const [existingItems, existingSuppliers, existingPlants] = await Promise.all([
    Item.distinct("itemCode"),
    Supplier.distinct("supplierId"),
    Plant.distinct("plantCode"),
  ]);

  const itemSet = new Set(existingItems);
  const supplierSet = new Set(existingSuppliers);
  const plantSet = new Set(existingPlants);

  const errors: ImportResult["errors"] = [];
  const operations: any[] = [];
  const seenKeys = new Set<string>();

  data.forEach((row, index) => {
    const rowNum = index + 2;
    const poNumber = row.po_number?.trim();
    const poDateStr = row.po_date?.trim();
    const supplierId = row.supplier_id?.trim().toUpperCase();
    const itemCode = row.item_code?.trim().toUpperCase();
    const quantityStr = row.quantity?.trim();
    const uom = row.uom?.trim().toUpperCase();
    const unitPriceStr = row.unit_price?.trim();
    const plant = row.plant?.trim().toUpperCase();
    const deliveredOnTimeStr = row.delivered_on_time?.trim().toLowerCase();

    if (!poNumber) {
      errors.push({ row: rowNum, error: "Missing mandatory 'po_number'", data: row });
      return;
    }
    if (!poDateStr) {
      errors.push({ row: rowNum, error: "Missing mandatory 'po_date'", data: row });
      return;
    }
    const poDate = new Date(poDateStr);
    if (isNaN(poDate.getTime())) {
      errors.push({ row: rowNum, error: `Invalid date format '${poDateStr}' in po_date`, data: row });
      return;
    }

    if (!supplierId) {
      errors.push({ row: rowNum, error: "Missing mandatory 'supplier_id'", data: row });
      return;
    }
    if (supplierSet.size > 0 && !supplierSet.has(supplierId)) {
      errors.push({
        row: rowNum,
        error: `Referential violation: supplier_id '${supplierId}' not found in Supplier master`,
        data: row,
      });
      return;
    }

    if (!itemCode) {
      errors.push({ row: rowNum, error: "Missing mandatory 'item_code'", data: row });
      return;
    }
    if (itemSet.size > 0 && !itemSet.has(itemCode)) {
      errors.push({
        row: rowNum,
        error: `Referential violation: item_code '${itemCode}' not found in Item master`,
        data: row,
      });
      return;
    }

    if (!plant) {
      errors.push({ row: rowNum, error: "Missing mandatory 'plant'", data: row });
      return;
    }
    if (plantSet.size > 0 && !plantSet.has(plant)) {
      errors.push({
        row: rowNum,
        error: `Referential violation: plant '${plant}' not found in Plant master`,
        data: row,
      });
      return;
    }

    const quantity = parseFloat(quantityStr);
    if (isNaN(quantity) || quantity <= 0) {
      errors.push({ row: rowNum, error: `Invalid quantity '${quantityStr}' (must be > 0)`, data: row });
      return;
    }

    const unitPrice = parseFloat(unitPriceStr);
    if (isNaN(unitPrice) || unitPrice < 0) {
      errors.push({ row: rowNum, error: `Invalid unit_price '${unitPriceStr}'`, data: row });
      return;
    }

    const key = `${poNumber}_${itemCode}`;
    if (seenKeys.has(key)) {
      errors.push({
        row: rowNum,
        error: `Duplicate PO line '${poNumber}' - '${itemCode}' in CSV`,
        data: row,
      });
      return;
    }
    seenKeys.add(key);

    const deliveredOnTime = deliveredOnTimeStr === "true" || deliveredOnTimeStr === "1" || deliveredOnTimeStr === "yes";

    operations.push({
      updateOne: {
        filter: { poNumber, itemCode },
        update: {
          $set: {
            poNumber,
            poDate,
            supplierId,
            itemCode,
            quantity,
            uom: uom || "NOS",
            unitPrice,
            plant,
            deliveredOnTime,
            rawSource: row,
          },
        },
        upsert: true,
      },
    });
  });

  let inserted = 0;
  let updated = 0;

  if (operations.length > 0) {
    const res = await PurchaseHistory.bulkWrite(operations, { ordered: false });
    inserted = res.upsertedCount || 0;
    updated = res.modifiedCount || 0;
  }

  const result: ImportResult = {
    entityType: "PurchaseHistory",
    filename,
    totalRows: data.length,
    inserted,
    updated,
    failed: errors.length,
    errors,
    status: errors.length === 0 ? "success" : operations.length > 0 ? "partial" : "failed",
  };

  await Promise.all([
    ImportLog.create({
      entityType: "PurchaseHistory",
      filename,
      totalRows: data.length,
      inserted,
      updated,
      failed: errors.length,
      rowErrors: errors.slice(0, 50),
      importedBy,
      status: result.status,
    }),
    AuditLog.create({
      actorId: importedBy,
      action: "IMPORT_PURCHASE_HISTORY",
      entityType: "PurchaseHistory",
      entityId: "batch",
      newValue: { total: data.length, inserted, updated, failed: errors.length },
    }),
  ]);

  return result;
}

/**
 * 5. Import Contracts (contract_register.csv)
 * Expected headers: contract_id, supplier_id, supplier_name, start_date, end_date, value_cap, consumed_value
 */
export async function importContracts(
  csvContent: string,
  filename: string = "contract_register.csv",
  importedBy: string = "system"
): Promise<ImportResult> {
  const { data, headers } = parseCsvRows<Record<string, string>>(csvContent);

  const requiredHeaders = ["contract_id", "supplier_id", "start_date", "end_date", "value_cap"];
  const missingHeaders = requiredHeaders.filter((rh) => !headers.includes(rh));
  if (missingHeaders.length > 0) {
    throw new Error(`CSV is missing required headers: ${missingHeaders.join(", ")}`);
  }

  await connectToDatabase();

  const errors: ImportResult["errors"] = [];
  const operations: any[] = [];
  const seenContracts = new Set<string>();

  data.forEach((row, index) => {
    const rowNum = index + 2;
    const contractId = row.contract_id?.trim().toUpperCase();
    const supplierId = row.supplier_id?.trim().toUpperCase();
    const supplierName = row.supplier_name?.trim() || "";
    const startDateStr = row.start_date?.trim();
    const endDateStr = row.end_date?.trim();
    const valueCapStr = row.value_cap?.trim();
    const consumedValueStr = row.consumed_value?.trim() || "0";

    if (!contractId) {
      errors.push({ row: rowNum, error: "Missing mandatory 'contract_id'", data: row });
      return;
    }
    if (!supplierId) {
      errors.push({ row: rowNum, error: "Missing mandatory 'supplier_id'", data: row });
      return;
    }
    if (!startDateStr || !endDateStr) {
      errors.push({ row: rowNum, error: "Missing mandatory contract dates", data: row });
      return;
    }

    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      errors.push({ row: rowNum, error: "Invalid date format for start_date or end_date", data: row });
      return;
    }

    const valueCap = parseFloat(valueCapStr);
    if (isNaN(valueCap) || valueCap < 0) {
      errors.push({ row: rowNum, error: `Invalid value_cap '${valueCapStr}'`, data: row });
      return;
    }

    const consumedValue = parseFloat(consumedValueStr) || 0;

    if (seenContracts.has(contractId)) {
      errors.push({ row: rowNum, error: `Duplicate contract_id '${contractId}' in CSV`, data: row });
      return;
    }
    seenContracts.add(contractId);

    const now = new Date();
    const status = now > endDate ? "Expired" : "Active";

    operations.push({
      updateOne: {
        filter: { contractId },
        update: {
          $set: {
            contractId,
            supplierId,
            supplierName,
            startDate,
            endDate,
            valueCap,
            consumedValue,
            status,
            currency: "INR",
            rawSource: row,
          },
        },
        upsert: true,
      },
    });
  });

  let inserted = 0;
  let updated = 0;

  if (operations.length > 0) {
    const res = await Contract.bulkWrite(operations, { ordered: false });
    inserted = res.upsertedCount || 0;
    updated = res.modifiedCount || 0;
  }

  const result: ImportResult = {
    entityType: "Contract",
    filename,
    totalRows: data.length,
    inserted,
    updated,
    failed: errors.length,
    errors,
    status: errors.length === 0 ? "success" : operations.length > 0 ? "partial" : "failed",
  };

  await Promise.all([
    ImportLog.create({
      entityType: "Contract",
      filename,
      totalRows: data.length,
      inserted,
      updated,
      failed: errors.length,
      rowErrors: errors.slice(0, 50),
      importedBy,
      status: result.status,
    }),
    AuditLog.create({
      actorId: importedBy,
      action: "IMPORT_CONTRACTS",
      entityType: "Contract",
      entityId: "batch",
      newValue: { total: data.length, inserted, updated, failed: errors.length },
    }),
  ]);

  return result;
}

/**
 * 6. Import Contract Lines (contract_lines.csv)
 * Expected headers: contract_id, item_code, description, uom, rate
 */
export async function importContractLines(
  csvContent: string,
  filename: string = "contract_lines.csv",
  importedBy: string = "system"
): Promise<ImportResult> {
  await connectToDatabase();
  const { data, headers } = parseCsvRows<Record<string, string>>(csvContent);

  const requiredHeaders = ["contract_id", "item_code", "description", "rate"];
  const missingHeaders = requiredHeaders.filter((rh) => !headers.includes(rh));
  if (missingHeaders.length > 0) {
    throw new Error(`CSV is missing required headers: ${missingHeaders.join(", ")}`);
  }

  // Pre-load reference items & contracts for referential checks
  const [existingItems, existingContracts] = await Promise.all([
    Item.distinct("itemCode"),
    Contract.distinct("contractId"),
  ]);

  const itemSet = new Set(existingItems);
  const contractSet = new Set(existingContracts);

  const errors: ImportResult["errors"] = [];
  const operations: any[] = [];
  const seenKeys = new Set<string>();

  data.forEach((row, index) => {
    const rowNum = index + 2;
    const contractId = row.contract_id?.trim().toUpperCase();
    const itemCode = row.item_code?.trim().toUpperCase();
    const description = row.description?.trim();
    const uom = row.uom?.trim().toUpperCase() || "NOS";
    const rateStr = row.rate?.trim();

    if (!contractId) {
      errors.push({ row: rowNum, error: "Missing mandatory 'contract_id'", data: row });
      return;
    }
    if (contractSet.size > 0 && !contractSet.has(contractId)) {
      errors.push({
        row: rowNum,
        error: `Referential violation: contract_id '${contractId}' not found in Contract register`,
        data: row,
      });
      return;
    }

    if (!itemCode) {
      errors.push({ row: rowNum, error: "Missing mandatory 'item_code'", data: row });
      return;
    }
    if (itemSet.size > 0 && !itemSet.has(itemCode)) {
      errors.push({
        row: rowNum,
        error: `Referential violation: item_code '${itemCode}' not found in Item master`,
        data: row,
      });
      return;
    }

    const contractedPrice = parseFloat(rateStr);
    if (isNaN(contractedPrice) || contractedPrice < 0) {
      errors.push({ row: rowNum, error: `Invalid rate '${rateStr}'`, data: row });
      return;
    }

    const key = `${contractId}_${itemCode}`;
    if (seenKeys.has(key)) {
      errors.push({
        row: rowNum,
        error: `Duplicate contract line for '${contractId}' - '${itemCode}'`,
        data: row,
      });
      return;
    }
    seenKeys.add(key);

    operations.push({
      updateOne: {
        filter: { contractId, itemCode },
        update: {
          $set: {
            contractId,
            itemCode,
            description: description || itemCode,
            uom,
            contractedPrice,
            rawSource: row,
          },
        },
        upsert: true,
      },
    });
  });

  let inserted = 0;
  let updated = 0;

  if (operations.length > 0) {
    const res = await ContractLine.bulkWrite(operations, { ordered: false });
    inserted = res.upsertedCount || 0;
    updated = res.modifiedCount || 0;
  }

  const result: ImportResult = {
    entityType: "ContractLine",
    filename,
    totalRows: data.length,
    inserted,
    updated,
    failed: errors.length,
    errors,
    status: errors.length === 0 ? "success" : operations.length > 0 ? "partial" : "failed",
  };

  await Promise.all([
    ImportLog.create({
      entityType: "ContractLine",
      filename,
      totalRows: data.length,
      inserted,
      updated,
      failed: errors.length,
      rowErrors: errors.slice(0, 50),
      importedBy,
      status: result.status,
    }),
    AuditLog.create({
      actorId: importedBy,
      action: "IMPORT_CONTRACT_LINES",
      entityType: "ContractLine",
      entityId: "batch",
      newValue: { total: data.length, inserted, updated, failed: errors.length },
    }),
  ]);

  return result;
}

/**
 * Bootstrap and import the entire task kit dataset in proper dependency order:
 * 1. Plants
 * 2. Suppliers
 * 3. Items
 * 4. Contracts
 * 5. Contract Lines
 * 6. Purchase History
 */
export async function bootstrapAllTaskKitData(importedBy: string = "system") {
  const baseDir = path.join(process.cwd(), "data", "Cantill_FullStack_Task_Kit");
  const reports: Record<string, ImportResult> = {};

  // 1. Plants
  const plantsPath = path.join(baseDir, "master_data", "plants.csv");
  if (fs.existsSync(plantsPath)) {
    const content = fs.readFileSync(plantsPath, "utf-8");
    reports.plants = await importPlants(content, "plants.csv", importedBy);
  }

  // 2. Suppliers
  const suppliersPath = path.join(baseDir, "master_data", "supplier_master.csv");
  if (fs.existsSync(suppliersPath)) {
    const content = fs.readFileSync(suppliersPath, "utf-8");
    reports.suppliers = await importSuppliers(content, "supplier_master.csv", importedBy);
  }

  // 3. Items
  const itemsPath = path.join(baseDir, "master_data", "item_master.csv");
  if (fs.existsSync(itemsPath)) {
    const content = fs.readFileSync(itemsPath, "utf-8");
    reports.items = await importItems(content, "item_master.csv", importedBy);
  }

  // 4. Contracts
  const contractsPath = path.join(baseDir, "contracts", "contract_register.csv");
  if (fs.existsSync(contractsPath)) {
    const content = fs.readFileSync(contractsPath, "utf-8");
    reports.contracts = await importContracts(content, "contract_register.csv", importedBy);
  }

  // 5. Contract Lines
  const contractLinesPath = path.join(baseDir, "contracts", "contract_lines.csv");
  if (fs.existsSync(contractLinesPath)) {
    const content = fs.readFileSync(contractLinesPath, "utf-8");
    reports.contractLines = await importContractLines(content, "contract_lines.csv", importedBy);
  }

  // 6. PO History
  const poHistoryPath = path.join(baseDir, "master_data", "po_history.csv");
  if (fs.existsSync(poHistoryPath)) {
    const content = fs.readFileSync(poHistoryPath, "utf-8");
    reports.purchaseHistory = await importPurchaseHistory(content, "po_history.csv", importedBy);
  }

  return reports;
}

export async function listImportHistory(limit: number = 20) {
  try {
    await connectToDatabase();
    const logs = await ImportLog.find().sort({ createdAt: -1 }).limit(limit).lean();
    return logs.map((l) => ({
      id: l._id.toString(),
      entityType: l.entityType,
      filename: l.filename,
      totalRows: l.totalRows,
      inserted: l.inserted,
      updated: l.updated,
      failed: l.failed,
      errors: l.rowErrors,
      importedBy: l.importedBy,
      status: l.status,
      createdAt: l.createdAt.toISOString(),
    }));
  } catch {
    return [];
  }
}
