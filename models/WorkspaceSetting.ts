import mongoose, { Schema, Document, Model } from "mongoose";

export interface IWorkspaceSetting extends Document {
  _id: mongoose.Types.ObjectId;
  key: string;
  companyName: string;
  platformName: string;
  supportEmail: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const WorkspaceSettingSchema = new Schema<IWorkspaceSetting>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "DEFAULT_WORKSPACE",
      trim: true,
    },
    companyName: {
      type: String,
      required: [true, "companyName is required"],
      trim: true,
    },
    platformName: {
      type: String,
      required: [true, "platformName is required"],
      trim: true,
    },
    supportEmail: {
      type: String,
      required: [true, "supportEmail is required"],
      trim: true,
    },
    updatedBy: {
      type: String,
      default: "system@cantill.ai",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

export const WorkspaceSetting: Model<IWorkspaceSetting> =
  mongoose.models.WorkspaceSetting ||
  mongoose.model<IWorkspaceSetting>("WorkspaceSetting", WorkspaceSettingSchema);

export default WorkspaceSetting;
