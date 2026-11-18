import mongoose, { Schema, Document, Model } from "mongoose";

export interface IConversationMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  clarificationType?: "item" | "quantity" | "plant" | "date" | "urgency" | "confirmation";
  options?: Array<{ label: string; value: string; description?: string }>;
}

export interface ICollectedData {
  rawInput?: string;
  originalDescription?: string;
  itemCode?: string;
  matchedItem?: {
    itemCode: string;
    description: string;
    uom: string;
    standardPrice: number;
    category: string;
  };
  candidateItems?: Array<{
    itemCode: string;
    description: string;
    uom: string;
    standardPrice: number;
    category: string;
    confidence: number;
  }>;
  quantity?: number;
  uom?: string;
  plantCode?: string;
  plantName?: string;
  needByDate?: string; // YYYY-MM-DD
  urgency?: "Normal" | "Urgent" | "Emergency";
  estimatedTotal?: number;
  missingFields: string[];
}

export interface IConversation extends Document {
  _id: mongoose.Types.ObjectId;
  conversationId: string;
  requesterId: string;
  requesterName: string;
  requesterEmail: string;
  department: string;
  title: string;
  state:
    | "STARTED"
    | "COLLECTING_DETAILS"
    | "ITEM_CLARIFICATION"
    | "WAITING_FOR_CONFIRMATION"
    | "CONFIRMED"
    | "CANCELLED";
  collectedData: ICollectedData;
  messages: IConversationMessage[];
  createdPrNo?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationMessageSchema = new Schema<IConversationMessage>(
  {
    id: { type: String, required: true },
    role: { type: String, enum: ["user", "assistant", "system"], required: true },
    content: { type: String, required: true },
    timestamp: { type: String, required: true },
    clarificationType: {
      type: String,
      enum: ["item", "plant", "date", "urgency", "confirmation"],
    },
    options: [
      {
        label: String,
        value: String,
        description: String,
      },
    ],
  },
  { _id: false }
);

const CollectedDataSchema = new Schema<ICollectedData>(
  {
    rawInput: String,
    originalDescription: String,
    itemCode: String,
    matchedItem: {
      itemCode: String,
      description: String,
      uom: String,
      standardPrice: Number,
      category: String,
    },
    candidateItems: [
      {
        itemCode: String,
        description: String,
        uom: String,
        standardPrice: Number,
        category: String,
        confidence: Number,
      },
    ],
    quantity: Number,
    uom: String,
    plantCode: String,
    plantName: String,
    needByDate: String,
    urgency: {
      type: String,
      enum: ["Normal", "Urgent", "Emergency"],
    },
    estimatedTotal: Number,
    missingFields: {
      type: [String],
      default: ["item", "quantity", "plant", "date", "urgency"],
    },
  },
  { _id: false }
);

const ConversationSchema = new Schema<IConversation>(
  {
    conversationId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    requesterId: {
      type: String,
      required: true,
      index: true,
    },
    requesterName: {
      type: String,
      required: true,
    },
    requesterEmail: {
      type: String,
      required: true,
    },
    department: {
      type: String,
      default: "General",
    },
    title: {
      type: String,
      default: "New Purchase Requisition",
    },
    state: {
      type: String,
      enum: [
        "STARTED",
        "COLLECTING_DETAILS",
        "ITEM_CLARIFICATION",
        "WAITING_FOR_CONFIRMATION",
        "CONFIRMED",
        "CANCELLED",
      ],
      default: "STARTED",
      index: true,
    },
    collectedData: {
      type: CollectedDataSchema,
      default: () => ({ missingFields: ["item", "quantity", "plant", "date", "urgency"] }),
    },
    messages: {
      type: [ConversationMessageSchema],
      default: [],
    },
    createdPrNo: {
      type: String,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        const obj = ret as Record<string, any>;
        obj.id = obj._id ? obj._id.toString() : "";
        delete obj._id;
        delete obj.__v;
        return obj;
      },
    },
  }
);

ConversationSchema.index({ requesterId: 1, updatedAt: -1 });

export const Conversation: Model<IConversation> =
  mongoose.models.Conversation ||
  mongoose.model<IConversation>("Conversation", ConversationSchema);

export default Conversation;
