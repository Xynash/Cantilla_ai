import { connectToDatabase } from "@/lib/db";
import {
  getFallbackConversations,
  getFallbackRequisitions,
  getFallbackRequisitionLines,
  FallbackConversationRecord,
} from "@/lib/db/fallbackStore";
import { Conversation } from "@/models/Conversation";
import { Requisition } from "@/models/Requisition";
import { RequisitionLine } from "@/models/RequisitionLine";
import { Item } from "@/models/Item";
import { loadMasterDataFromFiles } from "../decision-engine/utils/masterDataLoader";
import { parseIncomingIntakeMessage } from "./messageParser";
import { generateNextClarification } from "./clarificationService";
import { SafeUser } from "@/types/auth";
import { NotFoundError, ValidationError, ForbiddenError } from "@/lib/errors";

/**
 * Generates an atomic sequential PR number e.g. PR-2026-00001
 */
async function generateNextPrNumber(): Promise<string> {
  const year = new Date().getFullYear();
  try {
    await connectToDatabase();
    const count = await Requisition.countDocuments();
    const seq = (count + 1).toString().padStart(5, "0");
    return `PR-${year}-${seq}`;
  } catch {
    const reqs = getFallbackRequisitions();
    const seq = (reqs.size + 1).toString().padStart(5, "0");
    return `PR-${year}-${seq}`;
  }
}

/**
 * 1. Initialize a new conversation thread
 */
export async function createConversation(user: SafeUser): Promise<any> {
  const conversationId = `CONV-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

  const welcomeMessage = {
    id: Math.random().toString(36).substring(2, 9),
    role: "assistant" as const,
    content: `Hello ${user.name}! I am your Cantill Procurement Intake Assistant.\n\nTell me what materials, consumables, or services you require, along with the quantity, destination plant, and required date.`,
    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  };

  try {
    await connectToDatabase();
    const conv = await Conversation.create({
      conversationId,
      requesterId: user.id,
      requesterName: user.name,
      requesterEmail: user.email,
      department: "General",
      title: "New Purchase Requisition",
      state: "STARTED",
      collectedData: {
        missingFields: ["item", "quantity", "plant", "date", "urgency"],
      },
      messages: [welcomeMessage],
    });
    return conv;
  } catch {
    const store = getFallbackConversations();
    const now = new Date();
    const record: FallbackConversationRecord = {
      id: conversationId,
      conversationId,
      requesterId: user.id,
      requesterName: user.name,
      requesterEmail: user.email,
      department: "General",
      title: "New Purchase Requisition",
      state: "STARTED",
      collectedData: {
        missingFields: ["item", "quantity", "plant", "date", "urgency"],
      },
      messages: [welcomeMessage],
      createdAt: now,
      updatedAt: now,
    };
    store.set(conversationId, record);
    return record;
  }
}

/**
 * 2. List user conversations
 */
export async function listUserConversations(user: SafeUser) {
  try {
    await connectToDatabase();
    const query = user.role === "PROCUREMENT_ADMIN" ? {} : { requesterId: user.id };
    const convs = await Conversation.find(query).sort({ updatedAt: -1 }).limit(30).lean();

    return convs.map((c) => ({
      id: c._id.toString(),
      conversationId: c.conversationId,
      title: c.title,
      state: c.state,
      requesterName: c.requesterName,
      createdPrNo: c.createdPrNo,
      itemDescription:
        c.collectedData?.matchedItem?.description || c.collectedData?.originalDescription,
      updatedAt: c.updatedAt.toISOString(),
    }));
  } catch {
    const store = getFallbackConversations();
    const all = Array.from(store.values())
      .filter((c) => user.role === "PROCUREMENT_ADMIN" || c.requesterId === user.id)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, 30);

    return all.map((c) => ({
      id: c.id,
      conversationId: c.conversationId,
      title: c.title,
      state: c.state,
      requesterName: c.requesterName,
      createdPrNo: c.createdPrNo,
      itemDescription:
        c.collectedData?.matchedItem?.description || c.collectedData?.originalDescription,
      updatedAt: c.updatedAt.toISOString(),
    }));
  }
}

/**
 * 3. Retrieve single conversation with authorization
 */
export async function getConversation(conversationId: string, user: SafeUser) {
  try {
    await connectToDatabase();
    const conv = await Conversation.findOne({ conversationId }).lean();
    if (!conv) {
      throw new NotFoundError("Conversation not found");
    }

    if (conv.requesterId !== user.id && user.role === "REQUESTER") {
      throw new ForbiddenError("Access denied to conversation");
    }

    return {
      ...conv,
      id: conv._id.toString(),
    };
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof ForbiddenError) {
      // Check fallback store if NotFound in DB
      if (err instanceof ForbiddenError) throw err;
    }

    const store = getFallbackConversations();
    const conv = store.get(conversationId);
    if (!conv) {
      throw new NotFoundError("Conversation not found");
    }

    if (conv.requesterId !== user.id && user.role === "REQUESTER") {
      throw new ForbiddenError("Access denied to conversation");
    }

    return conv;
  }
}

async function resolveCatalogItemByCode(code: string) {
  const norm = code.toUpperCase().trim();
  try {
    await connectToDatabase();
    const dbItem = await Item.findOne({ itemCode: norm }).lean();
    if (dbItem) {
      return {
        itemCode: dbItem.itemCode,
        description: dbItem.description,
        uom: dbItem.uom,
        standardPrice: dbItem.standardPrice,
        category: dbItem.category,
      };
    }
  } catch {
    // Fallback to local master data
  }

  const md = loadMasterDataFromFiles();
  const it = md.itemMasterMap.get(norm);
  if (!it) return null;
  return {
    itemCode: it.itemCode,
    description: it.description,
    uom: it.uom,
    standardPrice: it.standardPrice || 0,
    category: it.category,
  };
}

/**
 * 4. Process incoming message in conversation multi-turn loop
 */
export async function processUserMessage(
  conversationId: string,
  userMessageText: string,
  user: SafeUser
) {
  let dbConv: any = null;
  let fallbackConv: FallbackConversationRecord | undefined;

  try {
    await connectToDatabase();
    dbConv = await Conversation.findOne({ conversationId });
  } catch {
    // Fallback store
  }

  if (!dbConv) {
    fallbackConv = getFallbackConversations().get(conversationId);
  }

  const conv = dbConv || fallbackConv;
  if (!conv) {
    throw new NotFoundError("Conversation not found");
  }

  if (conv.requesterId !== user.id && user.role === "REQUESTER") {
    throw new ForbiddenError("Access denied to conversation");
  }

  if (conv.state === "CONFIRMED") {
    throw new ValidationError("This requisition conversation is already confirmed and finalized.");
  }

  if (conv.state === "CANCELLED") {
    throw new ValidationError("This conversation was cancelled.");
  }

  const text = userMessageText.trim();
  const lowerText = text.toLowerCase();

  // Add User Message to History
  const userMsgId = Math.random().toString(36).substring(2, 9);
  conv.messages.push({
    id: userMsgId,
    role: "user",
    content: text,
    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  });

  const collected = conv.collectedData || { missingFields: [] };

  // Handle direct confirmation or cancellation keywords
  if (conv.state === "WAITING_FOR_CONFIRMATION") {
    if (/\b(?:confirm|yes|proceed|approve|create|ok)\b/i.test(lowerText)) {
      return confirmConversation(conversationId, user);
    }
    if (/\b(?:cancel|abort|stop|no|discard)\b/i.test(lowerText)) {
      return cancelConversation(conversationId, user);
    }
  }

  // Handle Item Clarification selection
  if (conv.state === "ITEM_CLARIFICATION") {
    if (text === "CUSTOM_ITEM") {
      collected.itemCode = undefined;
      collected.candidateItems = [];
    } else {
      const selectedItem = await resolveCatalogItemByCode(text);
      if (selectedItem) {
        collected.itemCode = selectedItem.itemCode;
        collected.matchedItem = selectedItem;
        collected.uom = selectedItem.uom;
        collected.candidateItems = [];
      }
    }
  }

  // Parse incoming text with deterministic NLP engine
  const parsed = await parseIncomingIntakeMessage(text);

  // Update item if not already locked
  if (!collected.itemCode && parsed.itemResult.matchType === "EXACT" && parsed.itemResult.matchedItem) {
    collected.itemCode = parsed.itemResult.matchedItem.itemCode;
    collected.matchedItem = parsed.itemResult.matchedItem;
    collected.originalDescription =
      parsed.extractedItemQuery || parsed.itemResult.matchedItem.description;
    collected.uom = collected.uom || parsed.itemResult.matchedItem.uom;
  } else if (!collected.itemCode && parsed.itemResult.matchType === "CANDIDATES") {
    collected.candidateItems = parsed.itemResult.candidates;
    collected.originalDescription = parsed.extractedItemQuery || text;
  } else if (!collected.originalDescription && parsed.extractedItemQuery) {
    collected.originalDescription = parsed.extractedItemQuery;
  }

  // Update Quantity & UOM
  if (parsed.quantityResult.quantity) {
    collected.quantity = parsed.quantityResult.quantity;
    if (parsed.quantityResult.uom) {
      collected.uom = parsed.quantityResult.uom;
    }
  }

  // Update Plant
  if (parsed.plantResult) {
    collected.plantCode = parsed.plantResult.plantCode;
    collected.plantName = parsed.plantResult.plantName;
  }

  // Update Date
  if (parsed.dateResult.date) {
    collected.needByDate = parsed.dateResult.date;
  }

  // Update Urgency
  if (parsed.urgencyResult.urgency) {
    collected.urgency = parsed.urgencyResult.urgency;
  }

  // Compute estimated total
  if (collected.quantity && collected.matchedItem?.standardPrice) {
    collected.estimatedTotal =
      Math.round(collected.quantity * collected.matchedItem.standardPrice * 100) / 100;
  }

  // Re-calculate missing fields
  const missing: string[] = [];
  if (!collected.itemCode && !collected.originalDescription) missing.push("item");
  if (!collected.quantity || collected.quantity <= 0) missing.push("quantity");
  if (!collected.plantCode) missing.push("plant");
  if (!collected.needByDate) missing.push("date");
  if (!collected.urgency) missing.push("urgency");
  collected.missingFields = missing;

  // Generate Next Clarification Response
  const clar = generateNextClarification(collected);
  conv.state = clar.nextState;

  if (conv.title === "New Purchase Requisition" && collected.originalDescription) {
    conv.title = `PR Intake: ${collected.originalDescription.slice(0, 30)}`;
  }

  // Append Assistant Response
  conv.messages.push({
    id: Math.random().toString(36).substring(2, 9),
    role: "assistant",
    content: clar.message,
    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    clarificationType: clar.clarificationType,
    options: clar.options,
  });

  conv.collectedData = collected;

  if (dbConv) {
    await dbConv.save();
    return dbConv.toJSON();
  } else {
    conv.updatedAt = new Date();
    return conv;
  }
}

/**
 * 5. Confirm and commit Purchase Requisition into MongoDB (or fallback store)
 */
export async function confirmConversation(conversationId: string, user: SafeUser) {
  let dbConv: any = null;
  let fallbackConv: FallbackConversationRecord | undefined;

  try {
    await connectToDatabase();
    dbConv = await Conversation.findOne({ conversationId });
  } catch {
    // Fallback store
  }

  if (!dbConv) {
    fallbackConv = getFallbackConversations().get(conversationId);
  }

  const conv = dbConv || fallbackConv;
  if (!conv) {
    throw new NotFoundError("Conversation not found");
  }

  if (conv.state === "CONFIRMED") {
    return {
      message: "Requisition already confirmed",
      prNo: conv.createdPrNo,
      conversation: dbConv ? dbConv.toJSON() : conv,
    };
  }

  const collected = conv.collectedData;
  if (
    !collected.quantity ||
    !collected.plantCode ||
    (!collected.itemCode && !collected.originalDescription)
  ) {
    throw new ValidationError("Cannot confirm requisition: required details are incomplete.");
  }

  const prNo = await generateNextPrNumber();
  const needByDate = collected.needByDate ? new Date(collected.needByDate) : new Date();
  let requisitionId = prNo;

  if (dbConv) {
    const requisition = await Requisition.create({
      prNo,
      requesterId: conv.requesterId,
      requesterName: conv.requesterName,
      department: conv.department || "General",
      plantCode: collected.plantCode,
      source: "chat",
      status: "SUBMITTED",
      totalEstimatedAmount: collected.estimatedTotal || 0,
      currency: "INR",
      conversationId: conv.conversationId,
      urgency: collected.urgency || "Normal",
      needByDate,
      linesCount: 1,
      rawSource: collected,
    });
    requisitionId = requisition._id.toString();

    await RequisitionLine.create({
      prNo,
      prLine: 1,
      originalDescription:
        collected.originalDescription || collected.matchedItem?.description || "Requested Item",
      itemCode: collected.itemCode,
      matchedItemDescription: collected.matchedItem?.description,
      quantity: collected.quantity,
      uom: collected.uom || collected.matchedItem?.uom || "NOS",
      estimatedUnitPrice: collected.matchedItem?.standardPrice || 0,
      totalPrice: collected.estimatedTotal || 0,
      needByDate,
      urgency: collected.urgency || "Normal",
      itemMatchStatus: collected.itemCode ? "CATALOGUE_MATCH" : "CUSTOM_ITEM",
      rawSource: collected,
    });
  } else {
    const now = new Date();
    getFallbackRequisitions().set(prNo, {
      id: prNo,
      prNo,
      requesterId: conv.requesterId,
      requesterName: conv.requesterName,
      department: conv.department || "General",
      plantCode: collected.plantCode,
      source: "chat",
      status: "SUBMITTED",
      totalEstimatedAmount: collected.estimatedTotal || 0,
      currency: "INR",
      conversationId: conv.conversationId,
      urgency: collected.urgency || "Normal",
      needByDate,
      linesCount: 1,
      rawSource: collected,
      createdAt: now,
      updatedAt: now,
    });

    getFallbackRequisitionLines().set(`${prNo}_1`, {
      id: `${prNo}_1`,
      prNo,
      prLine: 1,
      originalDescription:
        collected.originalDescription || collected.matchedItem?.description || "Requested Item",
      itemCode: collected.itemCode,
      matchedItemDescription: collected.matchedItem?.description,
      quantity: collected.quantity,
      uom: collected.uom || collected.matchedItem?.uom || "NOS",
      estimatedUnitPrice: collected.matchedItem?.standardPrice || 0,
      totalPrice: collected.estimatedTotal || 0,
      needByDate,
      urgency: collected.urgency || "Normal",
      itemMatchStatus: collected.itemCode ? "CATALOGUE_MATCH" : "CUSTOM_ITEM",
      rawSource: collected,
      createdAt: now,
      updatedAt: now,
    });
  }

  conv.state = "CONFIRMED";
  conv.createdPrNo = prNo;

  conv.messages.push({
    id: Math.random().toString(36).substring(2, 9),
    role: "assistant",
    content: `🎉 Purchase Requisition ${prNo} has been officially recorded and queued for procurement fulfillment.\n\nYou can review your requisition anytime in the Requisitions workspace.`,
    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  });

  if (dbConv) {
    await dbConv.save();
  } else {
    conv.updatedAt = new Date();
  }

  return {
    success: true,
    prNo,
    requisitionId,
    conversation: dbConv ? dbConv.toJSON() : conv,
  };
}

/**
 * 6. Cancel conversation without creating PR
 */
export async function cancelConversation(conversationId: string, user: SafeUser) {
  let dbConv: any = null;
  let fallbackConv: FallbackConversationRecord | undefined;

  try {
    await connectToDatabase();
    dbConv = await Conversation.findOne({ conversationId });
  } catch {
    // Fallback store
  }

  if (!dbConv) {
    fallbackConv = getFallbackConversations().get(conversationId);
  }

  const conv = dbConv || fallbackConv;
  if (!conv) throw new NotFoundError("Conversation not found");

  conv.state = "CANCELLED";
  conv.messages.push({
    id: Math.random().toString(36).substring(2, 9),
    role: "assistant",
    content: "This requisition request has been cancelled. No purchase requisition was created.",
    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  });

  if (dbConv) {
    await dbConv.save();
    return dbConv.toJSON();
  } else {
    conv.updatedAt = new Date();
    return conv;
  }
}
