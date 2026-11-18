import mongoose, { Schema, Document, Model } from "mongoose";

export interface IRequisitionLine extends Document {
  _id: mongoose.Types.ObjectId;
  prNo: string;
  prLine: number;
  originalDescription: string;
  itemCode?: string;
  matchedItemDescription?: string;
  quantity: number;
  uom: string;
  estimatedUnitPrice?: number;
  totalPrice?: number;
  needByDate?: Date;
  urgency: "Normal" | "Urgent" | "Emergency";
  itemMatchStatus: "CATALOGUE_MATCH" | "CUSTOM_ITEM" | "PENDING_CLASSIFICATION";
  rawSource?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const RequisitionLineSchema = new Schema<IRequisitionLine>(
  {
    prNo: {
      type: String,
      required: [true, "prNo is required"],
      trim: true,
      uppercase: true,
      index: true,
    },
    prLine: {
      type: Number,
      required: [true, "prLine is required"],
      min: 1,
    },
    originalDescription: {
      type: String,
      required: [true, "originalDescription is required"],
      trim: true,
    },
    itemCode: {
      type: String,
      trim: true,
      uppercase: true,
      index: true,
    },
    matchedItemDescription: {
      type: String,
      trim: true,
    },
    quantity: {
      type: Number,
      required: [true, "quantity is required"],
      min: 0.001,
    },
    uom: {
      type: String,
      required: [true, "uom is required"],
      trim: true,
      uppercase: true,
      default: "NOS",
    },
    estimatedUnitPrice: {
      type: Number,
      min: 0,
    },
    totalPrice: {
      type: Number,
      min: 0,
    },
    needByDate: {
      type: Date,
    },
    urgency: {
      type: String,
      enum: ["Normal", "Urgent", "Emergency"],
      default: "Normal",
    },
    itemMatchStatus: {
      type: String,
      enum: ["CATALOGUE_MATCH", "CUSTOM_ITEM", "PENDING_CLASSIFICATION"],
      default: "PENDING_CLASSIFICATION",
      index: true,
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

// Compound unique index for idempotent upsert of CSV rows and multi-line integrity
RequisitionLineSchema.index({ prNo: 1, prLine: 1 }, { unique: true });

export const RequisitionLine: Model<IRequisitionLine> =
  mongoose.models.RequisitionLine ||
  mongoose.model<IRequisitionLine>("RequisitionLine", RequisitionLineSchema);

export default RequisitionLine;
