import mongoose, { Schema, Document, Model } from "mongoose";

export interface IImportLog extends Document {
  _id: mongoose.Types.ObjectId;
  entityType: string;
  filename: string;
  totalRows: number;
  inserted: number;
  updated: number;
  failed: number;
  rowErrors: Array<{ row: number; error: string; data?: unknown }>;
  importedBy: string;
  status: "success" | "partial" | "failed";
  createdAt: Date;
  updatedAt: Date;
}

const ImportLogSchema = new Schema<IImportLog>(
  {
    entityType: {
      type: String,
      required: true,
      index: true,
    },
    filename: {
      type: String,
      required: true,
    },
    totalRows: {
      type: Number,
      required: true,
    },
    inserted: {
      type: Number,
      default: 0,
    },
    updated: {
      type: Number,
      default: 0,
    },
    failed: {
      type: Number,
      default: 0,
    },
    rowErrors: {
      type: [
        {
          row: Number,
          error: String,
          data: Schema.Types.Mixed,
        },
      ],
      default: [],
    },
    importedBy: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["success", "partial", "failed"],
      default: "success",
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

export const ImportLog: Model<IImportLog> =
  mongoose.models.ImportLog || mongoose.model<IImportLog>("ImportLog", ImportLogSchema);

export default ImportLog;
