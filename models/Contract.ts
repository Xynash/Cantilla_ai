import mongoose, { Schema, Document, Model } from "mongoose";

export interface IContract extends Document {
  _id: mongoose.Types.ObjectId;
  contractId: string;
  supplierId: string;
  supplierName: string;
  startDate: Date;
  endDate: Date;
  valueCap: number;
  consumedValue: number;
  status: string;
  currency: string;
  rawSource?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const ContractSchema = new Schema<IContract>(
  {
    contractId: {
      type: String,
      required: [true, "contractId is required"],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    supplierId: {
      type: String,
      required: [true, "supplierId is required"],
      trim: true,
      uppercase: true,
      index: true,
    },
    supplierName: {
      type: String,
      required: [true, "supplierName is required"],
      trim: true,
    },
    startDate: {
      type: Date,
      required: [true, "startDate is required"],
    },
    endDate: {
      type: Date,
      required: [true, "endDate is required"],
      index: true,
    },
    valueCap: {
      type: Number,
      required: [true, "valueCap is required"],
      min: 0,
    },
    consumedValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      default: "Active",
      index: true,
    },
    currency: {
      type: String,
      default: "INR",
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

export const Contract: Model<IContract> =
  mongoose.models.Contract || mongoose.model<IContract>("Contract", ContractSchema);

export default Contract;
