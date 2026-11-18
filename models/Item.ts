import mongoose, { Schema, Document, Model } from "mongoose";

export interface IItem extends Document {
  _id: mongoose.Types.ObjectId;
  itemCode: string;
  description: string;
  uom: string;
  category: string;
  itemType: string;
  standardPrice: number;
  rawSource?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const ItemSchema = new Schema<IItem>(
  {
    itemCode: {
      type: String,
      required: [true, "itemCode is required"],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    description: {
      type: String,
      required: [true, "description is required"],
      trim: true,
      index: true,
    },
    uom: {
      type: String,
      required: [true, "uom is required"],
      trim: true,
      uppercase: true,
    },
    category: {
      type: String,
      required: [true, "category is required"],
      trim: true,
      index: true,
    },
    itemType: {
      type: String,
      required: [true, "itemType is required"],
      trim: true,
    },
    standardPrice: {
      type: Number,
      required: [true, "standardPrice is required"],
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

ItemSchema.index({ description: "text", category: "text" });

export const Item: Model<IItem> =
  mongoose.models.Item || mongoose.model<IItem>("Item", ItemSchema);

export default Item;
