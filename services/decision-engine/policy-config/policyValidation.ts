import { z } from "zod";
import { StructuredPolicyConfig } from "../types/policy";
import { ValidationError } from "@/lib/errors";

export const PolicyRuleConditionSchema = z.object({
  field: z.enum([
    "itemType",
    "isEmergency",
    "hasValidContract",
    "valueInr",
    "boughtInLastDays",
    "plantCode",
    "category",
  ]),
  operator: z.enum(["eq", "neq", "in", "nin", "lt", "lte", "gt", "gte", "exists"]),
  value: z.any(),
});

export const PolicyRuleDefinitionSchema = z.object({
  id: z.string().trim().min(1, "Rule ID is required"),
  name: z.string().trim().min(1, "Rule name is required"),
  priority: z.number().int().min(1, "Priority must be a positive integer"),
  conditions: z.array(PolicyRuleConditionSchema),
  decision: z.enum(["PO", "SOURCING_REQUEST"]),
  route: z.enum([
    "CAPEX_SOURCING",
    "CONTRACT_PO",
    "EMERGENCY_PO",
    "SPOT_PO",
    "RFQ",
    "RFP",
    "NEW_ITEM_SOURCING",
  ]),
  supplierSelection: z.object({
    type: z.enum([
      "CONTRACT_SUPPLIER",
      "FIRST_PREFERRED",
      "SUGGEST_PREFERRED",
      "MANUAL_SOURCING",
    ]),
    suggestCount: z.number().int().min(1).max(20).optional(),
  }),
  priceSelection: z
    .object({
      type: z.enum([
        "CONTRACT_RATE",
        "PREFERRED_REFERENCE_PRICE",
        "ESTIMATED_PRICE",
        "NONE",
      ]),
    })
    .optional(),
  requiresApproval: z.boolean().optional(),
  clause: z.string().trim().min(1, "Policy clause reference is required"),
  description: z.string().trim().min(1, "Rule description is required"),
});

export const PolicyClubbingSchema = z.object({
  creationWindowDays: z
    .number()
    .min(1, "Creation window must be at least 1 day")
    .max(365, "Creation window cannot exceed 365 days"),
  needByWindowDays: z
    .number()
    .min(0, "Need-by window must be non-negative")
    .max(365, "Need-by window cannot exceed 365 days"),
  allowAcrossPlants: z.boolean(),
  allowNewItems: z.boolean(),
});

export const PolicyValuationSchema = z.object({
  contractExhaustedFallback: z.literal("LOWEST_APPLICABLE_RATE"),
  poHistoryWindowDays: z
    .number()
    .min(1, "Valuation PO lookback must be at least 1 day")
    .max(3650, "Valuation PO lookback cannot exceed 10 years"),
  currency: z.string().trim().min(1, "Currency is required"),
});

export const PolicyPreferredSuppliersSchema = z
  .object({
    poHistoryWindowDays: z
      .number()
      .min(1, "Supplier eligibility lookback must be at least 1 day")
      .max(3650, "Supplier eligibility lookback cannot exceed 10 years"),
    activeLookbackDays: z
      .number()
      .min(1, "Active PO lookback must be at least 1 day")
      .max(3650, "Active PO lookback cannot exceed 10 years"),
    qualityScaleMax: z.number().min(1).max(100).optional(),
    recencyThresholdsDays: z
      .object({
        recent: z.number().min(1).max(3650),
        moderate: z.number().min(1).max(3650),
      })
      .optional(),
    weights: z.object({
      frequency: z.number().min(0).max(1),
      recency: z.number().min(0).max(1),
      contractHistory: z.number().min(0).max(1),
      onTimeDelivery: z.number().min(0).max(1),
      qualityRating: z.number().min(0).max(1),
    }),
    recencyTiers: z.object({
      within90Days: z.number().min(0).max(1),
      within365Days: z.number().min(0).max(1),
      olderThan365Days: z.number().min(0).max(1),
    }),
    categoryTopUpWeights: z
      .object({
        onTimeDelivery: z.number().min(0).max(1),
        qualityRating: z.number().min(0).max(1),
      })
      .optional(),
  })
  .superRefine((val, ctx) => {
    const sum =
      val.weights.frequency +
      val.weights.recency +
      val.weights.contractHistory +
      val.weights.onTimeDelivery +
      val.weights.qualityRating;
    if (Math.abs(sum - 1.0) > 0.001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weights"],
        message: `Preferred supplier scoring weights must sum to 1.0 (currently ${sum.toFixed(4)}).`,
      });
    }

    if (
      val.recencyThresholdsDays &&
      val.recencyThresholdsDays.recent >= val.recencyThresholdsDays.moderate
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recencyThresholdsDays"],
        message: "Recent threshold days must be strictly less than moderate threshold days.",
      });
    }

    if (val.categoryTopUpWeights) {
      const topUpSum =
        val.categoryTopUpWeights.onTimeDelivery + val.categoryTopUpWeights.qualityRating;
      if (Math.abs(topUpSum - 1.0) > 0.001) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["categoryTopUpWeights"],
          message: `Category top-up weights must sum to 1.0 (currently ${topUpSum.toFixed(4)}).`,
        });
      }
    }
  });

export const PolicyConsolidationSchema = z.object({
  poWindowHours: z
    .number()
    .min(1, "PO consolidation window must be at least 1 hour")
    .max(720, "PO consolidation window cannot exceed 720 hours"),
  matchFields: z.array(z.string().trim().min(1)).min(1),
});

export const StructuredPolicyConfigSchema = z
  .object({
    version: z
      .string()
      .trim()
      .min(1, "Policy version number is required")
      .regex(/^[0-9]+(\.[0-9]+)*(-[a-zA-Z0-9._-]+)?$/, "Invalid version format (e.g. '5.0', '5.1')"),
    documentName: z.string().trim().min(1, "Document code/name is required"),
    effectiveDate: z
      .string()
      .trim()
      .refine((d) => !Number.isNaN(new Date(d).getTime()), "Invalid effectiveDate format"),
    owner: z.string().trim().min(1, "Policy owner is required"),
    appliesToPlants: z
      .array(z.string().trim().min(1))
      .min(1, "At least one plant must be specified in appliesToPlants"),
    clubbing: PolicyClubbingSchema,
    valuation: PolicyValuationSchema,
    preferredSuppliers: PolicyPreferredSuppliersSchema,
    consolidation: PolicyConsolidationSchema,
    rules: z.array(PolicyRuleDefinitionSchema).min(1, "At least one decision rule is required"),
  })
  .superRefine((policy, ctx) => {
    // Check Spot PO vs RFQ/RFP threshold consistency
    const spotRule = policy.rules.find((r) => r.route === "SPOT_PO");
    const rfqRule = policy.rules.find((r) => r.route === "RFQ");
    const emergencyRule = policy.rules.find((r) => r.route === "EMERGENCY_PO");

    const spotValCond = spotRule?.conditions.find((c) => c.field === "valueInr");
    const rfqValCond = rfqRule?.conditions.find((c) => c.field === "valueInr");
    const emergValCond = emergencyRule?.conditions.find((c) => c.field === "valueInr");

    if (spotValCond && typeof spotValCond.value === "number" && spotValCond.value <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rules"],
        message: "Spot PO value threshold must be strictly positive.",
      });
    }

    if (emergValCond && typeof emergValCond.value === "number" && emergValCond.value <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rules"],
        message: "Emergency PO value limit must be strictly positive.",
      });
    }

    if (
      spotValCond &&
      rfqValCond &&
      typeof spotValCond.value === "number" &&
      typeof rfqValCond.value === "number" &&
      spotValCond.value >= rfqValCond.value
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rules"],
        message: `Spot PO threshold (${spotValCond.value}) must be less than RFQ ceiling threshold (${rfqValCond.value}).`,
      });
    }
  });

/**
 * Validates a StructuredPolicyConfig object using Zod and throws ValidationError with details on failure.
 */
export function validateStructuredPolicyConfig(input: unknown): StructuredPolicyConfig {
  const parsed = StructuredPolicyConfigSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "policy"}: ${i.message}`)
      .join("; ");
    throw new ValidationError(`Invalid policy configuration: ${issues}`);
  }
  return parsed.data as StructuredPolicyConfig;
}
