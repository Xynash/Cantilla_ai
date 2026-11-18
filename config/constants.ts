/**
 * Enterprise Application Constants for Cantill.ai
 */

export const APP_CONFIG = {
  name: "Cantill.ai",
  description: "Enterprise Procurement Automation Platform",
  category: "Enterprise Procurement Automation Platform",
  version: "1.0.0-phase1",
  company: "Cantill Technologies",
  author: "Cantill.ai Engineering",
  supportEmail: "support@cantill.ai",
} as const;

export const PROCUREMENT_WORKFLOW_STEPS = [
  {
    step: 1,
    title: "Requisition Intake",
    description: "Structured itemization and department cost-center allocation",
    status: "active",
  },
  {
    step: 2,
    title: "Policy & Compliance Check",
    description: "Automated verification against enterprise spending rules",
    status: "pending",
  },
  {
    step: 3,
    title: "Supplier & Tier Evaluation",
    description: "Contract pricing matching and preferred vendor selection",
    status: "pending",
  },
  {
    step: 4,
    title: "Approval Workflow",
    description: "Multi-tier approval delegation based on threshold rules",
    status: "pending",
  },
  {
    step: 5,
    title: "Purchase Order Issuance",
    description: "ERP dispatch and vendor acknowledgment tracking",
    status: "pending",
  },
] as const;

export const REQUISITION_STATUSES = {
  DRAFT: { label: "Draft", variant: "secondary" },
  PENDING_APPROVAL: { label: "Pending Approval", variant: "warning" },
  APPROVED: { label: "Approved", variant: "success" },
  REJECTED: { label: "Rejected", variant: "destructive" },
  CONVERTED_TO_PO: { label: "Converted to PO", variant: "primary" },
} as const;

export const PURCHASE_ORDER_STATUSES = {
  DRAFT: { label: "Draft", variant: "secondary" },
  ISSUED: { label: "Issued", variant: "primary" },
  ACKNOWLEDGED: { label: "Acknowledged", variant: "info" },
  FULFILLED: { label: "Fulfilled", variant: "success" },
  IN_REVIEW: { label: "In Review", variant: "warning" },
  CANCELLED: { label: "Cancelled", variant: "destructive" },
} as const;

export const CONTRACT_STATUSES = {
  ACTIVE: { label: "Active", variant: "success" },
  EXPIRING_SOON: { label: "Expiring Soon", variant: "warning" },
  UNDER_REVIEW: { label: "Under Review", variant: "info" },
  EXPIRED: { label: "Expired", variant: "secondary" },
  TERMINATED: { label: "Terminated", variant: "destructive" },
} as const;

export const SUPPLIER_TIERS = {
  TIER_1: { label: "Strategic (Tier 1)", badge: "Tier 1" },
  TIER_2: { label: "Preferred (Tier 2)", badge: "Tier 2" },
  TIER_3: { label: "Approved (Tier 3)", badge: "Tier 3" },
  CONDITIONAL: { label: "Conditional", badge: "Conditional" },
} as const;

export const PAGINATION_DEFAULTS = {
  page: 1,
  limit: 10,
  maxLimit: 100,
} as const;
