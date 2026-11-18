import mongoose, { Schema, Document, Model } from "mongoose";

export type PolicyLifecycleStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "SCHEDULED"
  | "ACTIVE"
  | "ARCHIVED";

export interface IPolicySourceDocument {
  fileName: string;
  fileSize: number;
  mimeType: string;
  sha256: string;
  storagePath?: string;
  uploadedAt: string;
  uploadedBy: string;
  pageCount?: number;
  extractedTextPreview?: string;
}

export interface IPolicyVersion extends Document {
  _id: mongoose.Types.ObjectId;
  version: string;
  policyName: string;
  documentCode: string;
  description: string;
  effectiveDate: Date;
  effectiveUntil?: Date | null;
  status: PolicyLifecycleStatus;
  baseVersion?: string;
  changeSummary: string;
  policyData: Record<string, unknown>;
  sourceDocument?: IPolicySourceDocument | null;
  createdBy: string;
  updatedBy?: string;
  submittedBy?: string;
  submittedAt?: Date | null;
  approvedBy?: string;
  approvedAt?: Date | null;
  activatedBy?: string;
  activatedAt?: Date | null;
  archivedBy?: string;
  archivedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const PolicyVersionSchema = new Schema<IPolicyVersion>(
  {
    version: {
      type: String,
      required: [true, "version is required"],
      unique: true,
      trim: true,
      index: true,
    },
    policyName: {
      type: String,
      required: true,
      default: "Corvo Engineering Procurement Policy (PR to PO)",
      trim: true,
    },
    documentCode: {
      type: String,
      required: true,
      default: "CORVO-PROC-POL-04",
      trim: true,
    },
    description: {
      type: String,
      default:
        "Deterministic PR-to-PO procurement decision rules, contract ceiling governance, preferred supplier scoring, and PO consolidation policy.",
      trim: true,
    },
    effectiveDate: {
      type: Date,
      required: [true, "effectiveDate is required"],
      index: true,
    },
    effectiveUntil: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "SCHEDULED", "ACTIVE", "ARCHIVED"],
      default: "DRAFT",
      index: true,
    },
    baseVersion: {
      type: String,
      trim: true,
    },
    changeSummary: {
      type: String,
      default: "Initial baseline policy configuration.",
      trim: true,
    },
    policyData: {
      type: Schema.Types.Mixed,
      required: true,
    },
    sourceDocument: {
      type: Schema.Types.Mixed,
      default: null,
    },
    createdBy: {
      type: String,
      required: true,
      trim: true,
    },
    updatedBy: {
      type: String,
      trim: true,
    },
    submittedBy: {
      type: String,
      trim: true,
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    approvedBy: {
      type: String,
      trim: true,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    activatedBy: {
      type: String,
      trim: true,
    },
    activatedAt: {
      type: Date,
      default: null,
    },
    archivedBy: {
      type: String,
      trim: true,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        const obj = ret as Record<string, any>;
        obj.id = obj._id ? obj._id.toString() : obj.version;
        delete obj._id;
        delete obj.__v;
        return obj;
      },
    },
  }
);

export const PolicyVersion: Model<IPolicyVersion> =
  mongoose.models.PolicyVersion ||
  mongoose.model<IPolicyVersion>("PolicyVersion", PolicyVersionSchema);

export default PolicyVersion;
