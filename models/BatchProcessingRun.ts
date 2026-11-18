import mongoose, { Schema, Document, Model } from "mongoose";
import { LineDecisionOutput, RequirementDecision } from "@/services/decision-engine/types/engine";
import { PoGroup } from "@/services/decision-engine/po-consolidation/consolidator";

export interface IBatchProcessingRun extends Document {
  _id: mongoose.Types.ObjectId;
  runId: string;
  batchName: string;
  contentHash: string;
  policyVersion: string;
  policySnapshot?: Record<string, unknown>;
  status: "COMPLETED" | "FAILED";
  totalPrLines: number;
  totalRequirements: number;
  totalPOs: number;
  totalSourcingRequests: number;
  totalNotProcessed: number;
  lineOutputs: LineDecisionOutput[];
  requirements: RequirementDecision[];
  poGroups: PoGroup[];
  csvContent: string;
  processedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const BatchProcessingRunSchema = new Schema<IBatchProcessingRun>(
  {
    runId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    batchName: {
      type: String,
      required: true,
      trim: true,
    },
    contentHash: {
      type: String,
      required: true,
      trim: true,
    },
    policyVersion: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    policySnapshot: {
      type: Schema.Types.Mixed,
      default: null,
    },
    status: {
      type: String,
      enum: ["COMPLETED", "FAILED"],
      default: "COMPLETED",
      index: true,
    },
    totalPrLines: {
      type: Number,
      required: true,
      min: 0,
    },
    totalRequirements: {
      type: Number,
      required: true,
      min: 0,
    },
    totalPOs: {
      type: Number,
      required: true,
      min: 0,
    },
    totalSourcingRequests: {
      type: Number,
      required: true,
      min: 0,
    },
    totalNotProcessed: {
      type: Number,
      default: 0,
      min: 0,
    },
    lineOutputs: {
      type: Schema.Types.Mixed,
      default: [],
    },
    requirements: {
      type: Schema.Types.Mixed,
      default: [],
    },
    poGroups: {
      type: Schema.Types.Mixed,
      default: [],
    },
    csvContent: {
      type: String,
      required: true,
    },
    processedBy: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        const obj = ret as Record<string, any>;
        obj.id = obj._id ? obj._id.toString() : obj.runId;
        delete obj._id;
        delete obj.__v;
        return obj;
      },
    },
  }
);

// Compound unique index to prevent duplicate processing of the same batch under the same policy version
BatchProcessingRunSchema.index({ contentHash: 1, policyVersion: 1 }, { unique: true });
BatchProcessingRunSchema.index({ createdAt: -1 });

export const BatchProcessingRun: Model<IBatchProcessingRun> =
  mongoose.models.BatchProcessingRun ||
  mongoose.model<IBatchProcessingRun>("BatchProcessingRun", BatchProcessingRunSchema);

export default BatchProcessingRun;
