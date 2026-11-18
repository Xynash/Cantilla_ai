import { connectToDatabase } from "@/lib/db";
import { Contract } from "@/models/Contract";
import { ContractLine } from "@/models/ContractLine";
import { escapeRegex } from "@/lib/utils";
import { loadMasterDataFromFiles } from "./decision-engine/utils/masterDataLoader";

export interface ListContractsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  supplierId?: string;
}

export async function listContracts(params: ListContractsParams) {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 10));
  const skip = (page - 1) * limit;

  try {
    await connectToDatabase();

    const query: Record<string, unknown> = {};

    if (params.search) {
      const s = escapeRegex(params.search.trim());
      query.$or = [
        { contractId: { $regex: s, $options: "i" } },
        { supplierName: { $regex: s, $options: "i" } },
        { supplierId: { $regex: s, $options: "i" } },
      ];
    }

    if (params.status && params.status !== "ALL") {
      query.status = params.status;
    }

    if (params.supplierId) {
      query.supplierId = params.supplierId.toUpperCase();
    }

    const [contracts, total] = await Promise.all([
      Contract.find(query).sort({ contractId: 1 }).skip(skip).limit(limit).lean(),
      Contract.countDocuments(query),
    ]);

    if (total > 0 || params.search || params.status || params.supplierId) {
      const contractIds = contracts.map((c) => c.contractId);
      const lineCounts = await ContractLine.aggregate([
        { $match: { contractId: { $in: contractIds } } },
        { $group: { _id: "$contractId", count: { $sum: 1 } } },
      ]);

      const countMap = new Map<string, number>();
      lineCounts.forEach((lc) => countMap.set(lc._id, lc.count));

      return {
        items: contracts.map((c) => ({
          id: c._id.toString(),
          contractId: c.contractId,
          supplierId: c.supplierId,
          supplierName: c.supplierName,
          startDate: c.startDate.toISOString().split("T")[0],
          endDate: c.endDate.toISOString().split("T")[0],
          valueCap: c.valueCap,
          consumedValue: c.consumedValue,
          status: c.status,
          currency: c.currency,
          linesCount: countMap.get(c.contractId) || 0,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
        })),
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          timestamp: new Date().toISOString(),
        },
      };
    }
  } catch {
    // Fallback to local master data
  }

  const md = loadMasterDataFromFiles();
  const now = new Date();
  const nowIso = now.toISOString();
  let list = md.contracts.map((c) => ({
    id: c.contractId,
    contractId: c.contractId,
    supplierId: c.supplierId,
    supplierName: c.supplierName,
    startDate: c.startDate.toISOString().split("T")[0],
    endDate: c.endDate.toISOString().split("T")[0],
    valueCap: c.valueCap,
    consumedValue: c.consumedValue,
    status: now > c.endDate ? "Expired" : "Active",
    currency: "INR",
    linesCount: c.lines.length,
    source: c.source,
    createdAt: nowIso,
    updatedAt: nowIso,
  }));

  if (params.search) {
    const s = params.search.trim().toLowerCase();
    list = list.filter(
      (c) =>
        c.contractId.toLowerCase().includes(s) ||
        c.supplierName.toLowerCase().includes(s) ||
        c.supplierId.toLowerCase().includes(s)
    );
  }

  if (params.status && params.status !== "ALL") {
    list = list.filter((c) => c.status === params.status);
  }

  if (params.supplierId) {
    const supId = params.supplierId.toUpperCase();
    list = list.filter((c) => c.supplierId === supId);
  }

  const total = list.length;
  const paged = list.slice(skip, skip + limit);

  return {
    items: paged,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      timestamp: nowIso,
    },
  };
}

export async function getContractDetails(contractId: string) {
  const cId = contractId.toUpperCase().trim();
  try {
    await connectToDatabase();
    const [contract, lines] = await Promise.all([
      Contract.findOne({ contractId: cId }).lean(),
      ContractLine.find({ contractId: cId }).sort({ itemCode: 1 }).lean(),
    ]);

    if (contract) {
      return {
        id: contract._id.toString(),
        contractId: contract.contractId,
        supplierId: contract.supplierId,
        supplierName: contract.supplierName,
        startDate: contract.startDate.toISOString().split("T")[0],
        endDate: contract.endDate.toISOString().split("T")[0],
        valueCap: contract.valueCap,
        consumedValue: contract.consumedValue,
        status: contract.status,
        currency: contract.currency,
        lines: lines.map((l) => ({
          id: l._id.toString(),
          itemCode: l.itemCode,
          description: l.description,
          uom: l.uom,
          contractedPrice: l.contractedPrice,
        })),
        createdAt: contract.createdAt.toISOString(),
        updatedAt: contract.updatedAt.toISOString(),
      };
    }
  } catch {
    // Fallback to local master data
  }

  const md = loadMasterDataFromFiles();
  const c = md.contracts.find((ct) => ct.contractId === cId);
  if (!c) return null;
  const now = new Date();
  const nowIso = now.toISOString();

  return {
    id: c.contractId,
    contractId: c.contractId,
    supplierId: c.supplierId,
    supplierName: c.supplierName,
    startDate: c.startDate.toISOString().split("T")[0],
    endDate: c.endDate.toISOString().split("T")[0],
    valueCap: c.valueCap,
    consumedValue: c.consumedValue,
    status: now > c.endDate ? "Expired" : "Active",
    currency: "INR",
    lines: c.lines.map((l) => ({
      id: `${c.contractId}_${l.itemCode}`,
      itemCode: l.itemCode,
      description: l.description,
      uom: l.uom,
      contractedPrice: l.rate,
    })),
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}
