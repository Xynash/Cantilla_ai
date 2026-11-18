import mongoose, { Schema, Document, Model } from "mongoose";

export interface IRequisition extends Document {
  _id: mongoose.Types.ObjectId;
  prNo: string;
  requesterId: string;
  requesterName: string;
  department: string;
  plantCode: string;
  source: "chat" | "csv_batch" | "manual";
  status: "DRAFT" | "SUBMITTED" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "CONVERTED_TO_PO";
  totalEstimatedAmount: number;
  currency: string;
  conversationId?: string;
  urgency: "Normal" | "Urgent" | "Emergency";
  needByDate?: Date;
  linesCount: number;
  rawSource?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const RequisitionSchema = new Schema<IRequisition>(
  {
    prNo: {
      type: String,
      required: [true, "prNo is required"],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    requesterId: {
      type: String,
      required: [true, "requesterId is required"],
      trim: true,
      index: true,
    },
    requesterName: {
      type: String,
      required: [true, "requesterName is required"],
      trim: true,
    },
    department: {
      type: String,
      required: [true, "department is required"],
      trim: true,
      default: "General",
      index: true,
    },
    plantCode: {
      type: String,
      required: [true, "plantCode is required"],
      trim: true,
      uppercase: true,
      index: true,
    },
    source: {
      type: String,
      enum: ["chat", "csv_batch", "manual"],
      default: "chat",
      index: true,
    },
    status: {
      type: String,
      enum: ["DRAFT", "SUBMITTED", "PENDING_APPROVAL", "APPROVED", "REJECTED", "CONVERTED_TO_PO"],
      default: "SUBMITTED",
      index: true,
    },
    totalEstimatedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    currency: {
      type: String,
      default: "INR",
    },
    conversationId: {
      type: String,
      trim: true,
      index: true,
    },
    urgency: {
      type: String,
      enum: ["Normal", "Urgent", "Emergency"],
      default: "Normal",
      index: true,
    },
    needByDate: {
      type: Date,
    },
    linesCount: {
      type: Number,
      default: 1,
    },
    rawSource: {
      type: Schema.Types.Mixed,
      default: {},
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

RequisitionSchema.index({ requesterId: 1, createdAt: -1 });
RequisitionSchema.index({ plantCode: 1, status: 1 });

export const Requisition: Model<IRequisition> =
  mongoose.models.Requisition ||
  mongoose.model<IRequisition>("Requisition", RequisitionSchema);

export default Requisition;
