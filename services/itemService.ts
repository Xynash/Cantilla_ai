import { connectToDatabase } from "@/lib/db";
import { Item } from "@/models/Item";
import { escapeRegex } from "@/lib/utils";
import { loadMasterDataFromFiles } from "./decision-engine/utils/masterDataLoader";

export interface ListItemsParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  itemType?: string;
}

export async function listItems(params: ListItemsParams) {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 10));
  const skip = (page - 1) * limit;

  try {
    await connectToDatabase();

    const query: Record<string, unknown> = {};

    if (params.search) {
      const s = escapeRegex(params.search.trim());
      query.$or = [
        { itemCode: { $regex: s, $options: "i" } },
        { description: { $regex: s, $options: "i" } },
        { category: { $regex: s, $options: "i" } },
      ];
    }

    if (params.category && params.category !== "ALL") {
      query.category = params.category;
    }

    if (params.itemType && params.itemType !== "ALL") {
      query.itemType = params.itemType;
    }

    const [items, total, categories] = await Promise.all([
      Item.find(query).sort({ itemCode: 1 }).skip(skip).limit(limit).lean(),
      Item.countDocuments(query),
      Item.distinct("category"),
    ]);

    if (total > 0 || params.search || params.category || params.itemType) {
      return {
        items: items.map((it) => ({
          id: it._id.toString(),
          itemCode: it.itemCode,
          description: it.description,
          uom: it.uom,
          category: it.category,
          itemType: it.itemType,
          standardPrice: it.standardPrice,
          createdAt: it.createdAt.toISOString(),
          updatedAt: it.updatedAt.toISOString(),
        })),
        categories,
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
    // Fallback to local master data files
  }

  const md = loadMasterDataFromFiles();
  let list = Array.from(md.itemMasterMap.values());
  const categories = Array.from(new Set(list.map((i) => i.category))).sort();

  if (params.search) {
    const s = params.search.trim().toLowerCase();
    list = list.filter(
      (i) =>
        i.itemCode.toLowerCase().includes(s) ||
        i.description.toLowerCase().includes(s) ||
        i.category.toLowerCase().includes(s)
    );
  }

  if (params.category && params.category !== "ALL") {
    list = list.filter((i) => i.category === params.category);
  }

  if (params.itemType && params.itemType !== "ALL") {
    list = list.filter((i) => i.itemType === params.itemType);
  }

  const total = list.length;
  const paged = list.slice(skip, skip + limit);
  const now = new Date().toISOString();

  return {
    items: paged.map((it) => ({
      id: it.itemCode,
      itemCode: it.itemCode,
      description: it.description,
      uom: it.uom,
      category: it.category,
      itemType: it.itemType,
      standardPrice: it.standardPrice || 0,
      createdAt: now,
      updatedAt: now,
    })),
    categories,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      timestamp: now,
    },
  };
}

export async function getItemByCode(itemCode: string) {
  const code = itemCode.toUpperCase().trim();
  try {
    await connectToDatabase();
    const item = await Item.findOne({ itemCode: code }).lean();
    if (item) {
      return {
        id: item._id.toString(),
        itemCode: item.itemCode,
        description: item.description,
        uom: item.uom,
        category: item.category,
        itemType: item.itemType,
        standardPrice: item.standardPrice,
        rawSource: item.rawSource,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      };
    }
  } catch {
    // Fallback to local master data
  }

  const md = loadMasterDataFromFiles();
  const it = md.itemMasterMap.get(code);
  if (!it) return null;
  const now = new Date().toISOString();
  return {
    id: it.itemCode,
    itemCode: it.itemCode,
    description: it.description,
    uom: it.uom,
    category: it.category,
    itemType: it.itemType,
    standardPrice: it.standardPrice || 0,
    createdAt: now,
    updatedAt: now,
  };
}
