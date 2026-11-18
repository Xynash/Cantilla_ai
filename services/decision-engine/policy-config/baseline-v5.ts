import { StructuredPolicyConfig } from "../types/policy";

export const CORVO_POLICY_V5_CONFIG: StructuredPolicyConfig = {
  version: "5.0",
  documentName: "CORVO-PROC-POL-04",
  effectiveDate: "2026-04-01",
  owner: "Head of Procurement",
  appliesToPlants: ["PUN1", "CHK1"],

  clubbing: {
    creationWindowDays: 14,
    needByWindowDays: 7,
    allowAcrossPlants: false,
    allowNewItems: false,
  },

  valuation: {
    contractExhaustedFallback: "LOWEST_APPLICABLE_RATE",
    poHistoryWindowDays: 365,
    currency: "INR",
  },

  preferredSuppliers: {
    poHistoryWindowDays: 548,
    activeLookbackDays: 365,
    qualityScaleMax: 5.0,
    recencyThresholdsDays: {
      recent: 90,
      moderate: 365,
    },
    weights: {
      frequency: 0.35,
      recency: 0.25,
      contractHistory: 0.15,
      onTimeDelivery: 0.15,
      qualityRating: 0.10,
    },
    recencyTiers: {
      within90Days: 1.0,
      within365Days: 0.5,
      olderThan365Days: 0.0,
    },
    categoryTopUpWeights: {
      onTimeDelivery: 0.5,
      qualityRating: 0.5,
    },
  },

  consolidation: {
    poWindowHours: 24,
    matchFields: ["supplierId", "plantCode", "route"],
  },

  rules: [
    {
      id: "5.1",
      name: "Capex Sourcing",
      priority: 1,
      clause: "5.1",
      description: "Item type is Capex. Requires capex approval and 5 supplier quotes.",
      conditions: [
        {
          field: "itemType",
          operator: "eq",
          value: "Capex",
        },
      ],
      decision: "SOURCING_REQUEST",
      route: "CAPEX_SOURCING",
      supplierSelection: {
        type: "SUGGEST_PREFERRED",
        suggestCount: 5,
      },
      requiresApproval: true,
    },
    {
      id: "5.2",
      name: "Valid Rate Contract",
      priority: 2,
      clause: "5.2",
      description: "Eligible active contract covers item and has sufficient ceiling balance.",
      conditions: [
        {
          field: "hasValidContract",
          operator: "eq",
          value: true,
        },
      ],
      decision: "PO",
      route: "CONTRACT_PO",
      supplierSelection: {
        type: "CONTRACT_SUPPLIER",
      },
      priceSelection: {
        type: "CONTRACT_RATE",
      },
    },
    {
      id: "5.3",
      name: "Emergency Purchase",
      priority: 3,
      clause: "5.3",
      description: "Emergency requisition with value <= ₹5,00,000 bought from active supplier in last 365 days.",
      conditions: [
        {
          field: "isEmergency",
          operator: "eq",
          value: true,
        },
        {
          field: "valueInr",
          operator: "lte",
          value: 500000,
        },
        {
          field: "boughtInLastDays",
          operator: "lte",
          value: 365,
        },
      ],
      decision: "PO",
      route: "EMERGENCY_PO",
      supplierSelection: {
        type: "FIRST_PREFERRED",
      },
      priceSelection: {
        type: "PREFERRED_REFERENCE_PRICE",
      },
    },
    {
      id: "5.4",
      name: "Spot Purchase",
      priority: 4,
      clause: "5.4",
      description: "Requirement value strictly below ₹2,00,000 bought from active supplier in last 365 days.",
      conditions: [
        {
          field: "valueInr",
          operator: "lt",
          value: 200000,
        },
        {
          field: "boughtInLastDays",
          operator: "lte",
          value: 365,
        },
      ],
      decision: "PO",
      route: "SPOT_PO",
      supplierSelection: {
        type: "FIRST_PREFERRED",
      },
      priceSelection: {
        type: "PREFERRED_REFERENCE_PRICE",
      },
    },
    {
      id: "5.5",
      name: "Request for Quotation (RFQ)",
      priority: 5,
      clause: "5.5",
      description: "Requirement value strictly below ₹10,00,000 where previous PO rules do not apply.",
      conditions: [
        {
          field: "valueInr",
          operator: "lt",
          value: 1000000,
        },
      ],
      decision: "SOURCING_REQUEST",
      route: "RFQ",
      supplierSelection: {
        type: "SUGGEST_PREFERRED",
        suggestCount: 3,
      },
    },
    {
      id: "5.6",
      name: "Request for Proposal (RFP)",
      priority: 6,
      clause: "5.6",
      description: "Requirement value is ₹10,00,000 or greater.",
      conditions: [
        {
          field: "valueInr",
          operator: "gte",
          value: 1000000,
        },
      ],
      decision: "SOURCING_REQUEST",
      route: "RFP",
      supplierSelection: {
        type: "SUGGEST_PREFERRED",
        suggestCount: 5,
      },
    },
  ],
};
