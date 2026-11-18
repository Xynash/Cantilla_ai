import mongoose, { Schema, Document, Model } from "mongoose";

export interface IPlant extends Document {
  _id: mongoose.Types.ObjectId;
  plantCode: string;
  plantName: string;
  location?: string;
  rawSource?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const PlantSchema = new Schema<IPlant>(
  {
    plantCode: {
      type: String,
      required: [true, "plantCode is required"],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    plantName: {
      type: String,
      required: [true, "plantName is required"],
      trim: true,
    },
    location: {
      type: String,
      trim: true,
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

export const Plant: Model<IPlant> =
  mongoose.models.Plant || mongoose.model<IPlant>("Plant", PlantSchema);

export default Plant;
