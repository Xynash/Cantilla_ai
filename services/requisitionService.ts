import Papa from "papaparse";
import fs from "fs";
import path from "path";
import { connectToDatabase } from "@/lib/db";
import {
  getFallbackRequisitions,
  getFallbackRequisitionLines,
} from "@/lib/db/fallbackStore";
import { Requisition } from "@/models/Requisition";
import { RequisitionLine } from "@/models/RequisitionLine";
import { Item } from "@/models/Item";
import { AuditLog } from "@/models/AuditLog";
import { loadMasterDataFromFiles } from "./decision-engine/utils/masterDataLoader";
import { matchItemInCatalog } from "./chat-intake/itemMatcher";
import { escapeRegex } from "@/lib/utils";
import { SafeUser } from "@/types/auth";
import { NotFoundError, ForbiddenError } from "@/lib/errors";

export interface ListRequisitionsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  plantCode?: string;
  user: SafeUser;
}

export interface PrBatchImportResult {
  filename: string;
  totalRows: number;
  uniquePrs: number;
  linesInsertedOrUpdated: number;
  requisitionsCreatedOrUpdated: number;
  catalogMatchedLines: number;
  customItemLines: number;
  errors: Array<{ row: number; error: string; data?: unknown }>;
  status: "success" | "partial" | "failed";
}

/**
 * 1. List Requisitions with Role-Based Scoping & Pagination
 */
export async function listRequisitions({
  page = 1,
  limit = 10,
  search,
  status,
  plantCode,
  user,
}: ListRequisitionsParams) {
  const skip = (Math.max(1, page) - 1) * Math.max(1, limit);

  try {
    await connectToDatabase();

    const query: Record<string, any> = {};

    if (user.role === "REQUESTER") {
      query.$or = [{ requesterId: user.id }, { requesterName: user.name }];
    }

    if (status) {
      query.status = status;
    }

    if (plantCode) {
      query.plantCode = plantCode.toUpperCase();
    }

    if (search && search.trim()) {
      const s = escapeRegex(search.trim());
      const searchFilter = [
        { prNo: { $regex: s, $options: "i" } },
        { department: { $regex: s, $options: "i" } },
        { plantCode: { $regex: s, $options: "i" } },
        { requesterName: { $regex: s, $options: "i" } },
      ];

      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchFilter }];
        delete query.$or;
      } else {
        query.$or = searchFilter;
      }
    }

    const [total, requisitions] = await Promise.all([
      Requisition.countDocuments(query),
      Requisition.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);

    return {
      requisitions: requisitions.map((r) => ({
        ...r,
        id: r._id.toString(),
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + requisitions.length < total,
      },
    };
  } catch {
    let list = Array.from(getFallbackRequisitions().values());

    if (user.role === "REQUESTER") {
      list = list.filter((r) => r.requesterId === user.id || r.requesterName === user.name);
    }

    if (status) {
      list = list.filter((r) => r.status === status);
    }

    if (plantCode) {
      const pCode = plantCode.toUpperCase();
      list = list.filter((r) => r.plantCode === pCode);
    }

    if (search && search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.prNo.toLowerCase().includes(s) ||
          r.department.toLowerCase().includes(s) ||
          r.plantCode.toLowerCase().includes(s) ||
          r.requesterName.toLowerCase().includes(s)
      );
    }

    list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const total = list.length;
    const paged = list.slice(skip, skip + limit);

    return {
      requisitions: paged,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        hasMore: skip + paged.length < total,
      },
    };
  }
}

/**
 * 2. Get Single Requisition with All Lines & Item Details
 */
export async function getRequisitionWithLines(prNo: string, user: SafeUser) {
  const normPr = prNo.toUpperCase();

  try {
    await connectToDatabase();

    const requisition = await Requisition.findOne({ prNo: normPr }).lean();
    if (!requisition) {
      throw new NotFoundError(`Purchase Requisition '${prNo}' not found`);
    }

    if (
      user.role === "REQUESTER" &&
      requisition.requesterId !== user.id &&
      requisition.requesterName !== user.name
    ) {
      throw new ForbiddenError("You are not authorized to view this requisition");
    }

    const lines = await RequisitionLine.find({ prNo: normPr }).sort({ prLine: 1 }).lean();

    return {
      requisition: {
        ...requisition,
        id: requisition._id.toString(),
      },
      lines: lines.map((l) => ({
        ...l,
        id: l._id.toString(),
      })),
    };
  } catch (err) {
    if (err instanceof ForbiddenError) throw err;

    const req = getFallbackRequisitions().get(normPr);
    if (!req) {
      throw new NotFoundError(`Purchase Requisition '${prNo}' not found`);
    }

    if (
      user.role === "REQUESTER" &&
      req.requesterId !== user.id &&
      req.requesterName !== user.name
    ) {
      throw new ForbiddenError("You are not authorized to view this requisition");
    }

    const lines = Array.from(getFallbackRequisitionLines().values())
      .filter((l) => l.prNo === normPr)
      .sort((a, b) => a.prLine - b.prLine);

    return {
      requisition: req,
      lines,
    };
  }
}

/**
 * Helper to parse CSV string
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
 * 3. Import Sample PR Batch CSV
 */
export async function importSamplePrBatch(
  csvContent: string,
  filename: string = "sample_pr_batch.csv",
  importedBy: string = "system"
): Promise<PrBatchImportResult> {
  const { data, headers } = parseCsvRows<Record<string, string>>(csvContent);

  const requiredHeaders = ["pr_no", "pr_line", "description", "quantity", "plant"];
  const missingHeaders = requiredHeaders.filter((rh) => !headers.includes(rh));
  if (missingHeaders.length > 0) {
    throw new Error(`CSV is missing required headers: ${missingHeaders.join(", ")}`);
  }

  let dbConnected = false;
  const itemByCode = new Map<string, { itemCode: string; description: string; standardPrice?: number }>();

  try {
    await connectToDatabase();
    dbConnected = true;
    const allItems = await Item.find({}).lean();
    for (const item of allItems) {
      itemByCode.set(item.itemCode.toUpperCase(), {
        itemCode: item.itemCode.toUpperCase(),
        description: item.description,
        standardPrice: item.standardPrice,
      });
    }
  } catch {
    dbConnected = false;
  }

  if (itemByCode.size === 0) {
    const md = loadMasterDataFromFiles();
    for (const [k, v] of md.itemMasterMap.entries()) {
      itemByCode.set(k, {
        itemCode: v.itemCode,
        description: v.description,
        standardPrice: v.standardPrice,
      });
    }
  }

  const errors: PrBatchImportResult["errors"] = [];
  const validRows: Array<{
    prNo: string;
    prLine: number;
    createdAt?: Date;
    requesterName: string;
    department: string;
    plantCode: string;
    itemCode?: string;
    matchedItemDescription?: string;
    originalDescription: string;
    quantity: number;
    uom: string;
    estimatedUnitPrice: number;
    totalPrice: number;
    needByDate?: Date;
    urgency: "Normal" | "Urgent" | "Emergency";
    itemMatchStatus: "CATALOGUE_MATCH" | "CUSTOM_ITEM" | "PENDING_CLASSIFICATION";
    raw: Record<string, string>;
  }> = [];

  let catalogMatchedLines = 0;
  let customItemLines = 0;

  for (let index = 0; index < data.length; index++) {
    const row = data[index];
    const rowNum = index + 2;

    const prNo = row.pr_no?.trim().toUpperCase();
    const prLineStr = row.pr_line?.trim();
    const description = row.description?.trim();
    const plant = row.plant?.trim().toUpperCase();
    const quantityStr = row.quantity?.trim();

    if (!prNo) {
      errors.push({ row: rowNum, error: "Missing mandatory field 'pr_no'", data: row });
      continue;
    }
    if (!prLineStr || isNaN(parseInt(prLineStr, 10))) {
      errors.push({ row: rowNum, error: "Invalid or missing 'pr_line'", data: row });
      continue;
    }
    if (!description) {
      errors.push({ row: rowNum, error: "Missing mandatory field 'description'", data: row });
      continue;
    }
    if (!plant) {
      errors.push({ row: rowNum, error: "Missing mandatory field 'plant'", data: row });
      continue;
    }

    const prLine = parseInt(prLineStr, 10);
    const quantity = parseFloat(quantityStr || "1") || 1;
    const uom = row.uom?.trim().toUpperCase() || "NOS";
    let itemCode = row.item_code?.trim().toUpperCase() || undefined;
    let matchedItemDescription: string | undefined = undefined;
    let estimatedUnitPrice = parseFloat(row.estimated_unit_price || "0") || 0;
    let itemMatchStatus: "CATALOGUE_MATCH" | "CUSTOM_ITEM" | "PENDING_CLASSIFICATION" =
      "PENDING_CLASSIFICATION";

    if (itemCode && itemByCode.has(itemCode)) {
      const itm = itemByCode.get(itemCode)!;
      matchedItemDescription = itm.description;
      if (!estimatedUnitPrice && itm.standardPrice) {
        estimatedUnitPrice = itm.standardPrice;
      }
      itemMatchStatus = "CATALOGUE_MATCH";
      catalogMatchedLines++;
    } else if (itemCode) {
      itemMatchStatus = "CUSTOM_ITEM";
      customItemLines++;
    } else {
      const matchResult = await matchItemInCatalog(description);
      if (matchResult.matchedItem) {
        itemCode = matchResult.matchedItem.itemCode;
        matchedItemDescription = matchResult.matchedItem.description;
        if (!estimatedUnitPrice && matchResult.matchedItem.standardPrice) {
          estimatedUnitPrice = matchResult.matchedItem.standardPrice;
        }
        itemMatchStatus = "CATALOGUE_MATCH";
        catalogMatchedLines++;
      } else {
        itemMatchStatus = "CUSTOM_ITEM";
        customItemLines++;
      }
    }

    let urgency: "Normal" | "Urgent" | "Emergency" = "Normal";
    const urgencyStr = (row.urgency || "").trim().toLowerCase();
    if (urgencyStr.includes("emerg")) urgency = "Emergency";
    else if (urgencyStr.includes("urg")) urgency = "Urgent";

    let needByDate: Date | undefined = undefined;
    if (row.need_by_date?.trim()) {
      const d = new Date(row.need_by_date.trim());
      if (!isNaN(d.getTime())) {
        needByDate = d;
      }
    }

    let createdAt: Date | undefined = undefined;
    if (row.created_at?.trim()) {
      const cd = new Date(row.created_at.trim());
      if (!isNaN(cd.getTime())) {
        createdAt = cd;
      }
    }

    const totalPrice = Math.round(quantity * estimatedUnitPrice * 100) / 100;

    validRows.push({
      prNo,
      prLine,
      createdAt,
      requesterName: row.requester?.trim() || "Batch Ingest",
      department: row.department?.trim() || "Operations",
      plantCode: plant,
      itemCode,
      matchedItemDescription,
      originalDescription: description,
      quantity,
      uom,
      estimatedUnitPrice,
      totalPrice,
      needByDate,
      urgency,
      itemMatchStatus,
      raw: row,
    });
  }

  // Group by PR to create/update Requisition Headers
  const prMap = new Map<
    string,
    {
      prNo: string;
      requesterName: string;
      department: string;
      plantCode: string;
      urgency: "Normal" | "Urgent" | "Emergency";
      needByDate?: Date;
      createdAt?: Date;
      linesCount: number;
      totalEstimatedAmount: number;
    }
  >();

  for (const v of validRows) {
    const existing = prMap.get(v.prNo);
    if (!existing) {
      prMap.set(v.prNo, {
        prNo: v.prNo,
        requesterName: v.requesterName,
        department: v.department,
        plantCode: v.plantCode,
        urgency: v.urgency,
        needByDate: v.needByDate,
        createdAt: v.createdAt,
        linesCount: 1,
        totalEstimatedAmount: v.totalPrice,
      });
    } else {
      existing.linesCount += 1;
      existing.totalEstimatedAmount += v.totalPrice;
      if (v.urgency === "Emergency" || (v.urgency === "Urgent" && existing.urgency !== "Emergency")) {
        existing.urgency = v.urgency;
      }
      if (v.needByDate && (!existing.needByDate || v.needByDate < existing.needByDate)) {
        existing.needByDate = v.needByDate;
      }
      if (v.createdAt && (!existing.createdAt || v.createdAt < existing.createdAt)) {
        existing.createdAt = v.createdAt;
      }
    }
  }

  if (dbConnected) {
    const lineBulkOps = validRows.map((v) => ({
      updateOne: {
        filter: { prNo: v.prNo, prLine: v.prLine },
        update: {
          $set: {
            prNo: v.prNo,
            prLine: v.prLine,
            originalDescription: v.originalDescription,
            itemCode: v.itemCode,
            matchedItemDescription: v.matchedItemDescription,
            quantity: v.quantity,
            uom: v.uom,
            estimatedUnitPrice: v.estimatedUnitPrice,
            totalPrice: v.totalPrice,
            needByDate: v.needByDate,
            urgency: v.urgency,
            itemMatchStatus: v.itemMatchStatus,
            rawSource: v.raw,
          },
        },
        upsert: true,
      },
    }));

    if (lineBulkOps.length > 0) {
      await RequisitionLine.bulkWrite(lineBulkOps, { ordered: false });
    }

    const reqBulkOps = Array.from(prMap.values()).map((p) => ({
      updateOne: {
        filter: { prNo: p.prNo },
        update: {
          $set: {
            prNo: p.prNo,
            requesterId: "csv_import",
            requesterName: p.requesterName,
            department: p.department,
            plantCode: p.plantCode,
            source: "csv_batch" as const,
            status: "SUBMITTED" as const,
            totalEstimatedAmount: Math.round(p.totalEstimatedAmount * 100) / 100,
            currency: "INR",
            urgency: p.urgency,
            needByDate: p.needByDate,
            linesCount: p.linesCount,
            ...(p.createdAt ? { createdAt: p.createdAt } : {}),
          },
        },
        upsert: true,
      },
    }));

    if (reqBulkOps.length > 0) {
      await Requisition.bulkWrite(reqBulkOps as any, { ordered: false });
    }

    await AuditLog.create({
      actorId: importedBy,
      action: "BATCH_IMPORT_PR",
      entityType: "Requisition",
      entityId: filename,
      newValue: {
        totalRows: data.length,
        validRows: validRows.length,
        uniquePrs: prMap.size,
        catalogMatched: catalogMatchedLines,
        customItems: customItemLines,
        failedRows: errors.length,
      },
      timestamp: new Date(),
    });
  } else {
    const now = new Date();
    const reqStore = getFallbackRequisitions();
    const lineStore = getFallbackRequisitionLines();

    for (const v of validRows) {
      const lineId = `${v.prNo}_${v.prLine}`;
      lineStore.set(lineId, {
        id: lineId,
        prNo: v.prNo,
        prLine: v.prLine,
        originalDescription: v.originalDescription,
        itemCode: v.itemCode,
        matchedItemDescription: v.matchedItemDescription,
        quantity: v.quantity,
        uom: v.uom,
        estimatedUnitPrice: v.estimatedUnitPrice,
        totalPrice: v.totalPrice,
        needByDate: v.needByDate,
        urgency: v.urgency,
        itemMatchStatus: v.itemMatchStatus,
        rawSource: v.raw,
        createdAt: v.createdAt || now,
        updatedAt: now,
      });
    }

    for (const p of prMap.values()) {
      reqStore.set(p.prNo, {
        id: p.prNo,
        prNo: p.prNo,
        requesterId: "csv_import",
        requesterName: p.requesterName,
        department: p.department,
        plantCode: p.plantCode,
        source: "csv_batch",
        status: "SUBMITTED",
        totalEstimatedAmount: Math.round(p.totalEstimatedAmount * 100) / 100,
        currency: "INR",
        urgency: p.urgency,
        needByDate: p.needByDate,
        linesCount: p.linesCount,
        createdAt: p.createdAt || now,
        updatedAt: now,
      });
    }
  }

  return {
    filename,
    totalRows: data.length,
    uniquePrs: prMap.size,
    linesInsertedOrUpdated: validRows.length,
    requisitionsCreatedOrUpdated: prMap.size,
    catalogMatchedLines,
    customItemLines,
    errors,
    status: errors.length === 0 ? "success" : errors.length < data.length ? "partial" : "failed",
  };
}

/**
 * 4. Bootstrap Sample Batch from bundled Task Kit file
 */
export async function bootstrapSamplePrBatch(importedBy: string = "system") {
  const possiblePaths = [
    path.join(process.cwd(), "data", "Cantill_FullStack_Task_Kit", "pr_batches", "sample_pr_batch.csv"),
    path.join(process.cwd(), "data", "pr_batches", "sample_pr_batch.csv"),
  ];

  let resolvedPath = "";
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      resolvedPath = p;
      break;
    }
  }

  if (!resolvedPath) {
    throw new NotFoundError("sample_pr_batch.csv not found in data directories");
  }

  const csvContent = fs.readFileSync(resolvedPath, "utf-8");
  return importSamplePrBatch(csvContent, "sample_pr_batch.csv", importedBy);
}
