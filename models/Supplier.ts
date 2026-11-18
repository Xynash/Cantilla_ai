import mongoose, { Schema, Document, Model } from "mongoose";

export interface ISupplier extends Document {
  _id: mongoose.Types.ObjectId;
  supplierId: string;
  supplierName: string;
  city: string;
  categories: string[];
  supplierStatus: string;
  onTimePct: number | null;
  qualityRating: number | null;
  rawSource?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const SupplierSchema = new Schema<ISupplier>(
  {
    supplierId: {
      type: String,
      required: [true, "supplierId is required"],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    supplierName: {
      type: String,
      required: [true, "supplierName is required"],
      trim: true,
      index: true,
    },
    city: {
      type: String,
      required: [true, "city is required"],
      trim: true,
      index: true,
    },
    categories: {
      type: [String],
      default: [],
      index: true,
    },
    supplierStatus: {
      type: String,
      required: [true, "supplierStatus is required"],
      trim: true,
      default: "Active",
      index: true,
    },
    onTimePct: {
      type: Number,
      default: null,
      required: false,
      min: 0,
      max: 100,
    },
    qualityRating: {
      type: Number,
      default: null,
      required: false,
      min: 0,
      max: 5,
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

SupplierSchema.index({ supplierName: "text", city: "text" });

export const Supplier: Model<ISupplier> =
  mongoose.models.Supplier || mongoose.model<ISupplier>("Supplier", SupplierSchema);

export default Supplier;
