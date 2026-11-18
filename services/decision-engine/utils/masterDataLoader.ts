import fs from "fs";
import path from "path";
import Papa from "papaparse";
import { connectToDatabase } from "@/lib/db";
import { getFallbackSupplierOverrides } from "@/lib/db/fallbackStore";
import { Item } from "@/models/Item";
import { Supplier } from "@/models/Supplier";
import { PurchaseHistory } from "@/models/PurchaseHistory";
import { Contract } from "@/models/Contract";
import { ContractLine } from "@/models/ContractLine";
import { MasterDataContext } from "../batch-processor/batchProcessor";
import { ItemMasterRecord } from "../item-resolution/resolver";
import { SupplierMasterRecord } from "../preferred-suppliers/preferredSupplierEngine";
import { PoHistoryRecord } from "../valuation/valuator";
import { ContractRecord, PDF_SIGNED_CONTRACTS } from "../contract-evaluation/pdfContracts";

const PO_REQUIRED_FIELDS =
  "poNumber poDate supplierId itemCode quantity uom unitPrice plant deliveredOnTime -_id";
const DEFAULT_QUERY_TIMEOUT_MS = 3000;

export interface ItemPoLookupResult {
  itemCode: string;
  asOfDate: string;
  windowDays: number;
  source: "database" | "local_master_data";
  totalMatchingRecords: number;
  recordsInWindow: PoHistoryRecord[];
  latestApplicablePo: PoHistoryRecord | null;
  activeSuppliersFound: string[];
}

/**
 * Helper to index PO history by itemCode with records pre-sorted by poDate descending
 */
export function buildPoHistoryIndex(poHistory: PoHistoryRecord[]): Map<string, PoHistoryRecord[]> {
  const index = new Map<string, PoHistoryRecord[]>();
  for (const po of poHistory) {
    const code = po.itemCode.toUpperCase();
    const bucket = index.get(code);
    if (bucket) {
      bucket.push(po);
    } else {
      index.set(code, [po]);
    }
  }
  for (const bucket of index.values()) {
    bucket.sort((a, b) => {
      const diff = b.poDate.getTime() - a.poDate.getTime();
      if (diff !== 0) return diff;
      return b.poNumber.localeCompare(a.poNumber);
    });
  }
  return index;
}

/**
 * Targeted historical PO lookup for a single itemCode using database-side filtering and sorting
 * on the compound index { itemCode: 1, poDate: -1 }.
 * Supports 365-day window (valuation) and 548-day window (preferred supplier eligibility).
 */
export async function lookupItemPoHistory(
  itemCode: string,
  requirementDate: Date,
  windowDays: number = 365
): Promise<ItemPoLookupResult> {
  const normalizedCode = itemCode.trim().toUpperCase();
  const reqTime = requirementDate.getTime();
  const cutoffDate = new Date(reqTime - windowDays * 24 * 60 * 60 * 1000);

  // Attempt indexed MongoDB query first with strict projection, sort, and timeout
  try {
    await connectToDatabase();
    const [dbRecords, activeSuppliers] = await Promise.all([
      PurchaseHistory.find({
        itemCode: normalizedCode,
        poDate: { $gte: cutoffDate, $lte: requirementDate },
      })
        .select(PO_REQUIRED_FIELDS)
        .sort({ poDate: -1, poNumber: -1 })
        .maxTimeMS(DEFAULT_QUERY_TIMEOUT_MS)
        .lean(),
      Supplier.find({ supplierStatus: "Active" })
        .select("supplierId -_id")
        .maxTimeMS(DEFAULT_QUERY_TIMEOUT_MS)
        .lean(),
    ]);

    if (dbRecords.length > 0 || activeSuppliers.length > 0) {
      const activeSet = new Set(activeSuppliers.map((s: any) => s.supplierId.toUpperCase()));
      const mapped: PoHistoryRecord[] = dbRecords.map((p: any) => ({
        poNumber: p.poNumber,
        poDate: new Date(p.poDate),
        supplierId: p.supplierId.toUpperCase(),
        itemCode: p.itemCode.toUpperCase(),
        quantity: p.quantity,
        uom: p.uom,
        unitPrice: p.unitPrice,
        plant: p.plant.toUpperCase(),
        deliveredOnTime: Boolean(p.deliveredOnTime),
      }));

      const activeEligible = mapped.filter((p) =>
        activeSet.size > 0 ? activeSet.has(p.supplierId) : true
      );

      return {
        itemCode: normalizedCode,
        asOfDate: requirementDate.toISOString(),
        windowDays,
        source: "database",
        totalMatchingRecords: mapped.length,
        recordsInWindow: mapped,
        latestApplicablePo: activeEligible[0] || null,
        activeSuppliersFound: Array.from(new Set(activeEligible.map((p) => p.supplierId))),
      };
    }
  } catch {
    // Cleanly handle unreachable/unseeded database by falling back to indexed master data
  }

  const localContext = loadMasterDataFromFiles();
  const itemRecords = localContext.poHistoryByItem?.get(normalizedCode) || [];
  const cutoffTime = cutoffDate.getTime();

  const recordsInWindow = itemRecords.filter((po) => {
    const t = po.poDate.getTime();
    return t >= cutoffTime && t <= reqTime;
  });

  const activeEligible = recordsInWindow.filter((po) =>
    localContext.activeSupplierIds.has(po.supplierId)
  );

  return {
    itemCode: normalizedCode,
    asOfDate: requirementDate.toISOString(),
    windowDays,
    source: "local_master_data",
    totalMatchingRecords: recordsInWindow.length,
    recordsInWindow,
    latestApplicablePo: activeEligible[0] || null,
    activeSuppliersFound: Array.from(new Set(activeEligible.map((p) => p.supplierId))),
  };
}

/**
 * Loads master data from database, with transparent fallback to Task Kit CSV files.
 * Optional itemCodes filter scopes PO history query to only required items.
 */
export async function loadMasterDataContext(itemCodes?: string[]): Promise<MasterDataContext> {
  let dbAvailable = false;
  try {
    await connectToDatabase();
    dbAvailable = true;
  } catch {
    // Database offline, load from filesystem
  }

  if (dbAvailable) {
    try {
      const poFilter =
        itemCodes && itemCodes.length > 0
          ? { itemCode: { $in: Array.from(new Set(itemCodes.map((c) => c.trim().toUpperCase()))) } }
          : {};

      const [items, suppliers, pos, contracts, contractLines] = await Promise.all([
        Item.find({})
          .select("itemCode description uom category itemType standardPrice -_id")
          .maxTimeMS(DEFAULT_QUERY_TIMEOUT_MS)
          .lean(),
        Supplier.find({})
          .select(
            "supplierId supplierName name city categories supplierStatus status onTimePct onTimeDeliveryPercentage onTimePercent supplierRating qualityRating -_id"
          )
          .maxTimeMS(DEFAULT_QUERY_TIMEOUT_MS)
          .lean(),
        PurchaseHistory.find(poFilter)
          .select(PO_REQUIRED_FIELDS)
          .sort({ itemCode: 1, poDate: -1 })
          .maxTimeMS(DEFAULT_QUERY_TIMEOUT_MS)
          .lean(),
        Contract.find({})
          .select(
            "contractId supplierId supplierName startDate endDate valueCap ceilingValue consumedValue -_id"
          )
          .maxTimeMS(DEFAULT_QUERY_TIMEOUT_MS)
          .lean(),
        ContractLine.find({})
          .select("contractId itemCode description uom rate contractedPrice -_id")
          .maxTimeMS(DEFAULT_QUERY_TIMEOUT_MS)
          .lean(),
      ]);

      if (items.length > 0 && suppliers.length > 0) {
        return buildContextFromCollections(items, suppliers, pos, contracts, contractLines);
      }
    } catch (err) {
      console.warn("DB master data empty or query failed, falling back to local dataset:", err);
    }
  }

  return loadMasterDataFromFiles();
}

/**
 * Normalizes supplier categories from MongoDB (string[]), CSV strings, empty arrays, or null/undefined
 * into the canonical semicolon-delimited string expected by the decision engine.
 */
export function normalizeSupplierCategories(rawCategories: unknown): string {
  if (rawCategories === null || rawCategories === undefined) {
    return "";
  }
  if (Array.isArray(rawCategories)) {
    return rawCategories
      .flatMap((item) => (item !== null && item !== undefined ? String(item).split(/[;|,]/) : []))
      .map((s) => s.trim())
      .filter(Boolean)
      .join(";");
  }
  if (typeof rawCategories === "string") {
    return rawCategories
      .split(/[;|,]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .join(";");
  }
  return "";
}

/**
 * Safely parses a nullable numeric performance metric:
 * - Preserves null, undefined, and blank strings as null (never coerces "" or null to 0).
 * - Preserves valid zero (0 or "0") as 0.
 */
export function parseNullableNumericMetric(rawValue: unknown): number | null {
  if (rawValue === null || rawValue === undefined) {
    return null;
  }
  if (typeof rawValue === "number") {
    return Number.isFinite(rawValue) ? rawValue : null;
  }
  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    if (trimmed === "") return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function buildContextFromCollections(
  items: any[],
  suppliers: any[],
  pos: any[],
  contracts: any[],
  contractLines: any[]
): MasterDataContext {
  const itemMasterMap = new Map<string, ItemMasterRecord>();
  for (const itm of items) {
    itemMasterMap.set(itm.itemCode.toUpperCase(), {
      itemCode: itm.itemCode.toUpperCase(),
      description: itm.description,
      uom: itm.uom,
      category: itm.category,
      itemType: itm.itemType,
      standardPrice: itm.standardPrice,
    });
  }

  const suppliersMap = new Map<string, SupplierMasterRecord>();
  const activeSupplierIds = new Set<string>();
  const overrides = getFallbackSupplierOverrides();

  for (const supp of suppliers) {
    const id = supp.supplierId.toUpperCase();
    const override = overrides.get(id);
    const status = (override?.status || supp.supplierStatus || supp.status || "Active") as
      | "Active"
      | "Inactive"
      | "Blocked";
    const rawOnTime = supp.onTimePct ?? supp.onTimeDeliveryPercentage ?? supp.onTimePercent;
    const rawQuality = supp.qualityRating ?? supp.supplierRating;
    suppliersMap.set(id, {
      supplierId: id,
      name: supp.supplierName || supp.name,
      city: supp.city,
      categories: normalizeSupplierCategories(supp.categories),
      status,
      onTimePercent: parseNullableNumericMetric(rawOnTime),
      qualityRating: parseNullableNumericMetric(rawQuality),
    });

    if (status === "Active") {
      activeSupplierIds.add(id);
    }
  }

  const poHistory: PoHistoryRecord[] = pos.map((p) => ({
    poNumber: p.poNumber,
    poDate: new Date(p.poDate),
    supplierId: p.supplierId.toUpperCase(),
    itemCode: p.itemCode.toUpperCase(),
    quantity: p.quantity,
    uom: p.uom,
    unitPrice: p.unitPrice,
    plant: p.plant.toUpperCase(),
    deliveredOnTime: Boolean(p.deliveredOnTime),
  }));

  const poHistoryByItem = buildPoHistoryIndex(poHistory);

  const linesByContract = new Map<
    string,
    Array<{ contractId: string; itemCode: string; description: string; uom: string; rate: number }>
  >();
  for (const l of contractLines) {
    const cid = l.contractId.toUpperCase();
    const existing = linesByContract.get(cid) || [];
    existing.push({
      contractId: cid,
      itemCode: l.itemCode.toUpperCase(),
      description: l.description || "",
      uom: l.uom || "NOS",
      rate: l.rate !== undefined ? l.rate : l.contractedPrice,
    });
    linesByContract.set(cid, existing);
  }

  const contractsList: ContractRecord[] = contracts.map((c) => ({
    contractId: c.contractId.toUpperCase(),
    supplierId: c.supplierId.toUpperCase(),
    supplierName: c.supplierName || suppliersMap.get(c.supplierId.toUpperCase())?.name || "",
    startDate: new Date(c.startDate),
    endDate: new Date(c.endDate),
    valueCap: c.valueCap !== undefined ? c.valueCap : c.ceilingValue || 0,
    consumedValue: c.consumedValue || 0,
    source: "register" as const,
    lines: linesByContract.get(c.contractId.toUpperCase()) || [],
  }));

  // Append PDF-only signed contracts (e.g. RC-2026-031, RC-2026-033) if not already in DB
  for (const pdfContract of PDF_SIGNED_CONTRACTS) {
    if (!contractsList.some((c) => c.contractId === pdfContract.contractId)) {
      contractsList.push({
        ...pdfContract,
        lines: pdfContract.lines.map((l) => ({ ...l })),
      });
    }
  }

  return {
    itemMasterMap,
    suppliersMap,
    activeSupplierIds,
    poHistory,
    poHistoryByItem,
    contracts: contractsList,
  };
}

/**
 * Loads master data directly from files in data/Cantill_FullStack_Task_Kit/
 */
export function loadMasterDataFromFiles(): MasterDataContext {
  const root = process.cwd();
  const baseDataDir = path.join(root, "data", "Cantill_FullStack_Task_Kit");

  // 1. Items
  const itemsCsv = fs.readFileSync(
    path.join(baseDataDir, "master_data", "item_master.csv"),
    "utf-8"
  );
  const itemsParsed = Papa.parse<Record<string, string>>(itemsCsv.trim(), { header: true });
  const itemMasterMap = new Map<string, ItemMasterRecord>();
  for (const r of itemsParsed.data) {
    if (!r.item_code) continue;
    itemMasterMap.set(r.item_code.trim().toUpperCase(), {
      itemCode: r.item_code.trim().toUpperCase(),
      description: r.description?.trim() || "",
      uom: r.uom?.trim().toUpperCase() || "NOS",
      category: r.category?.trim() || "General",
      itemType: r.item_type?.trim() || "Material",
      standardPrice: parseFloat(r.standard_price || "0") || 0,
    });
  }

  // 2. Suppliers
  const suppCsv = fs.readFileSync(
    path.join(baseDataDir, "master_data", "supplier_master.csv"),
    "utf-8"
  );
  const suppParsed = Papa.parse<Record<string, string>>(suppCsv.trim(), { header: true });
  const suppliersMap = new Map<string, SupplierMasterRecord>();
  const activeSupplierIds = new Set<string>();
  const overrides = getFallbackSupplierOverrides();

  for (const r of suppParsed.data) {
    if (!r.supplier_id) continue;
    const id = r.supplier_id.trim().toUpperCase();
    const override = overrides.get(id);
    const status = (override?.status || r.status?.trim() || "Active") as
      | "Active"
      | "Inactive"
      | "Blocked";
    suppliersMap.set(id, {
      supplierId: id,
      name: r.name?.trim() || "",
      city: r.city?.trim(),
      categories: normalizeSupplierCategories(r.categories),
      status,
      onTimePercent: parseNullableNumericMetric(r.on_time_pct),
      qualityRating: parseNullableNumericMetric(r.quality_rating),
    });
    if (status === "Active") {
      activeSupplierIds.add(id);
    }
  }

  // 3. PO History
  const poCsv = fs.readFileSync(path.join(baseDataDir, "master_data", "po_history.csv"), "utf-8");
  const poParsed = Papa.parse<Record<string, string>>(poCsv.trim(), { header: true });
  const poHistory: PoHistoryRecord[] = poParsed.data
    .filter((r) => Boolean(r.po_number && r.item_code))
    .map((r) => ({
      poNumber: r.po_number.trim(),
      poDate: new Date(r.po_date.trim()),
      supplierId: r.supplier_id.trim().toUpperCase(),
      itemCode: r.item_code.trim().toUpperCase(),
      quantity: parseFloat(r.quantity || "1"),
      uom: r.uom?.trim().toUpperCase() || "NOS",
      unitPrice: parseFloat(r.unit_price || "0") || 0,
      plant: r.plant?.trim().toUpperCase() || "PUN1",
      deliveredOnTime:
        r.delivered_on_time === "True" ||
        r.delivered_on_time === "true" ||
        r.delivered_on_time === "1",
    }));

  const poHistoryByItem = buildPoHistoryIndex(poHistory);

  // 4. Contract Register & Lines
  const contractRegCsv = fs.readFileSync(
    path.join(baseDataDir, "contracts", "contract_register.csv"),
    "utf-8"
  );
  const regParsed = Papa.parse<Record<string, string>>(contractRegCsv.trim(), { header: true });

  const contractLinesCsv = fs.readFileSync(
    path.join(baseDataDir, "contracts", "contract_lines.csv"),
    "utf-8"
  );
  const linesParsed = Papa.parse<Record<string, string>>(contractLinesCsv.trim(), { header: true });

  const linesByContract = new Map<
    string,
    Array<{ contractId: string; itemCode: string; description: string; uom: string; rate: number }>
  >();
  for (const l of linesParsed.data) {
    if (!l.contract_id || !l.item_code) continue;
    const cid = l.contract_id.trim().toUpperCase();
    const existing = linesByContract.get(cid) || [];
    existing.push({
      contractId: cid,
      itemCode: l.item_code.trim().toUpperCase(),
      description: l.description?.trim() || "",
      uom: l.uom?.trim().toUpperCase() || "NOS",
      rate: parseFloat(l.rate || "0") || 0,
    });
    linesByContract.set(cid, existing);
  }

  const contracts: ContractRecord[] = regParsed.data
    .filter((r) => r.contract_id && r.supplier_id)
    .map((r) => ({
      contractId: r.contract_id.trim().toUpperCase(),
      supplierId: r.supplier_id.trim().toUpperCase(),
      supplierName: r.supplier_name?.trim() || "",
      startDate: new Date(r.start_date.trim()),
      endDate: new Date(r.end_date.trim()),
      valueCap: parseFloat(r.value_cap || "0") || 0,
      consumedValue: parseFloat(r.consumed_value || "0") || 0,
      source: "register" as const,
      lines: linesByContract.get(r.contract_id.trim().toUpperCase()) || [],
    }));

  // Append PDF-only signed contracts
  for (const pdfContract of PDF_SIGNED_CONTRACTS) {
    contracts.push({
      ...pdfContract,
      lines: pdfContract.lines.map((l) => ({ ...l })),
    });
  }

  return {
    itemMasterMap,
    suppliersMap,
    activeSupplierIds,
    poHistory,
    poHistoryByItem,
    contracts,
  };
}
