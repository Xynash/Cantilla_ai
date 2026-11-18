import mongoose, { Schema, Document, Model } from "mongoose";

export interface IPurchaseHistory extends Document {
  _id: mongoose.Types.ObjectId;
  poNumber: string;
  poDate: Date;
  supplierId: string;
  itemCode: string;
  quantity: number;
  uom: string;
  unitPrice: number;
  plant: string;
  deliveredOnTime: boolean;
  rawSource?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const PurchaseHistorySchema = new Schema<IPurchaseHistory>(
  {
    poNumber: {
      type: String,
      required: [true, "poNumber is required"],
      trim: true,
    },
    poDate: {
      type: Date,
      required: [true, "poDate is required"],
    },
    supplierId: {
      type: String,
      required: [true, "supplierId is required"],
      trim: true,
      uppercase: true,
    },
    itemCode: {
      type: String,
      required: [true, "itemCode is required"],
      trim: true,
      uppercase: true,
    },
    quantity: {
      type: Number,
      required: [true, "quantity is required"],
      min: 0,
    },
    uom: {
      type: String,
      required: [true, "uom is required"],
      trim: true,
      uppercase: true,
    },
    unitPrice: {
      type: Number,
      required: [true, "unitPrice is required"],
      min: 0,
    },
    plant: {
      type: String,
      required: [true, "plant is required"],
      trim: true,
      uppercase: true,
      index: true,
    },
    deliveredOnTime: {
      type: Boolean,
      required: [true, "deliveredOnTime is required"],
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

// Idempotent compound index
PurchaseHistorySchema.index({ poNumber: 1, itemCode: 1 }, { unique: true });
PurchaseHistorySchema.index({ supplierId: 1, itemCode: 1 });
PurchaseHistorySchema.index({ itemCode: 1, poDate: -1, poNumber: -1 });

export const PurchaseHistory: Model<IPurchaseHistory> =
  mongoose.models.PurchaseHistory ||
  mongoose.model<IPurchaseHistory>("PurchaseHistory", PurchaseHistorySchema);

export default PurchaseHistory;
