/**
 * Core Procurement Domain Types for Cantill.ai
 */

export type RequisitionStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "converted_to_po";

export type PurchaseOrderStatus =
  | "draft"
  | "issued"
  | "acknowledged"
  | "fulfilled"
  | "in_review"
  | "cancelled";

export type SupplierTier = "tier_1" | "tier_2" | "tier_3" | "conditional";

export type ContractStatus =
  | "active"
  | "expiring_soon"
  | "under_review"
  | "expired"
  | "terminated";

export type PolicyStatus = "active" | "draft" | "deprecated" | "archived";

export interface RequisitionItem {
  id: string;
  description: string;
  category: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  currency: string;
}

export interface Requisition {
  id: string;
  requisitionNumber: string;
  title: string;
  requesterName: string;
  requesterEmail: string;
  department: string;
  costCenter: string;
  totalAmount: number;
  currency: string;
  status: RequisitionStatus;
  itemsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  requisitionNumber?: string;
  supplierName: string;
  supplierCode: string;
  totalAmount: number;
  currency: string;
  status: PurchaseOrderStatus;
  paymentTerms: string;
  issueDate: string;
  expectedDeliveryDate?: string;
}

export interface Supplier {
  id: string;
  supplierCode: string;
  name: string;
  category: string;
  tier: SupplierTier;
  riskScore?: "low" | "medium" | "high";
  contactEmail: string;
  activeContractsCount: number;
  status: "active" | "pending_review" | "inactive";
  country: string;
}

export interface Contract {
  id: string;
  contractNumber: string;
  title: string;
  supplierName: string;
  contractValue: number;
  currency: string;
  status: ContractStatus;
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  signedBy?: string;
}

export interface ProcurementPolicy {
  id: string;
  code: string;
  title: string;
  version: string;
  category: "threshold" | "approval_matrix" | "vendor_compliance" | "travel_expenses";
  effectiveDate: string;
  status: PolicyStatus;
  enforcementLevel: "blocking" | "warning" | "advisory";
  description: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  metadata?: {
    intent?: string;
    entities?: Record<string, unknown>;
    actionSuggested?: string;
  };
}
