import mongoose, { Schema, Document, Model } from "mongoose";

export interface IContractLine extends Document {
  _id: mongoose.Types.ObjectId;
  contractId: string;
  itemCode: string;
  description: string;
  uom: string;
  contractedPrice: number;
  rawSource?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const ContractLineSchema = new Schema<IContractLine>(
  {
    contractId: {
      type: String,
      required: [true, "contractId is required"],
      trim: true,
      uppercase: true,
      index: true,
    },
    itemCode: {
      type: String,
      required: [true, "itemCode is required"],
      trim: true,
      uppercase: true,
      index: true,
    },
    description: {
      type: String,
      required: [true, "description is required"],
      trim: true,
    },
    uom: {
      type: String,
      required: [true, "uom is required"],
      trim: true,
      uppercase: true,
    },
    contractedPrice: {
      type: Number,
      required: [true, "contractedPrice is required"],
      min: 0,
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

// Compound unique index for idempotent upsert
ContractLineSchema.index({ contractId: 1, itemCode: 1 }, { unique: true });

export const ContractLine: Model<IContractLine> =
  mongoose.models.ContractLine ||
  mongoose.model<IContractLine>("ContractLine", ContractLineSchema);

export default ContractLine;
