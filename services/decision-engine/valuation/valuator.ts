import { RequirementGroup } from "../types/engine";
import { ContractEvaluationResult } from "../contract-evaluation/contractEvaluator";
import { ItemMasterRecord } from "../item-resolution/resolver";

export interface PoHistoryRecord {
  poNumber: string;
  poDate: Date;
  supplierId: string;
  itemCode: string;
  quantity: number;
  uom: string;
  unitPrice: number;
  plant: string;
  deliveredOnTime?: boolean;
}

export interface ValuationResult {
  unitPrice: number;
  groupValueInr: number;
  priceSource: "CONTRACT_RATE" | "LOWEST_APPLICABLE_RATE" | "RECENT_PO_PRICE" | "STANDARD_PRICE" | "REQUESTER_ESTIMATE";
  explanation: string;
  referencePoNumber?: string;
  referenceContractId?: string;
}

/**
 * Calculates requirement valuation according to Policy Section 3
 */
export function calculateRequirementValuation(
  req: RequirementGroup,
  contractResult: ContractEvaluationResult,
  poHistory: PoHistoryRecord[],
  itemMasterMap: Map<string, ItemMasterRecord>,
  activeSupplierIds: Set<string>,
  poHistoryWindowDays: number = 365
): ValuationResult {
  // 1. New Item valuation (Policy 1.2)
  if (req.isNewItem || req.resolvedItemCode === "NEW") {
    const estimatedPrice = req.lines[0]?.estimated_unit_price || 0;
    const groupValueInr = Math.round(req.totalQuantity * estimatedPrice * 100) / 100;
    return {
      unitPrice: estimatedPrice,
      groupValueInr,
      priceSource: "REQUESTER_ESTIMATE",
      explanation: `Valued at quantity (${req.totalQuantity}) × requester estimated unit price (₹${estimatedPrice}) (Policy 1.2)`,
    };
  }

  // 2. Precedence (a): Rate of contract that will be used (Policy 3.1a, 4.3)
  if (contractResult.hasValidContract && contractResult.selectedRate !== undefined) {
    const unitPrice = contractResult.selectedRate;
    const groupValueInr = Math.round(req.totalQuantity * unitPrice * 100) / 100;
    return {
      unitPrice,
      groupValueInr,
      priceSource: "CONTRACT_RATE",
      explanation: `Valued at rate (₹${unitPrice}) of selected contract ${contractResult.selectedContract?.contractId} (Policy 3.1a)`,
      referenceContractId: contractResult.selectedContract?.contractId,
    };
  }

  // 3. Precedence (a) fallback: If every applicable contract is out of ceiling, use lowest applicable contract rate (Policy 3.1a)
  if (contractResult.allContractsExhausted && contractResult.lowestApplicableRate !== undefined) {
    const unitPrice = contractResult.lowestApplicableRate;
    const groupValueInr = Math.round(req.totalQuantity * unitPrice * 100) / 100;
    return {
      unitPrice,
      groupValueInr,
      priceSource: "LOWEST_APPLICABLE_RATE",
      explanation: `Valued at lowest applicable contract rate (₹${unitPrice}) as all applicable contracts are out of ceiling (Policy 3.1a)`,
    };
  }

  // 4. Precedence (b): Most recent PO price in the 365 days before requirement date (Policy 3.1b)
  const reqTime = req.requirementDate.getTime();
  const windowMs = poHistoryWindowDays * 24 * 60 * 60 * 1000;
  const cutoffTime = reqTime - windowMs;

  const eligiblePos = poHistory
    .filter((po) => {
      if (po.itemCode.toUpperCase() !== req.resolvedItemCode.toUpperCase()) return false;
      const t = po.poDate.getTime();
      // Must be in (requirementDate - 365 days) up to requirementDate
      if (t < cutoffTime || t > reqTime) return false;
      // Supplier must be Active (Policy 5.7)
      if (!activeSupplierIds.has(po.supplierId.toUpperCase())) return false;
      return true;
    })
    .sort((a, b) => {
      const diff = b.poDate.getTime() - a.poDate.getTime();
      if (diff !== 0) return diff;
      return b.poNumber.localeCompare(a.poNumber);
    }); // Most recent first (tie-break by poNumber descending)

  if (eligiblePos.length > 0) {
    const recentPo = eligiblePos[0];
    const unitPrice = recentPo.unitPrice;
    const groupValueInr = Math.round(req.totalQuantity * unitPrice * 100) / 100;
    return {
      unitPrice,
      groupValueInr,
      priceSource: "RECENT_PO_PRICE",
      explanation: `Valued at recent PO ${recentPo.poNumber} price (₹${unitPrice}) from ${recentPo.supplierId} on ${recentPo.poDate.toISOString().slice(0, 10)} (Policy 3.1b)`,
      referencePoNumber: recentPo.poNumber,
    };
  }

  // 5. Precedence (c): Item master standard price (Policy 3.1c)
  const item = itemMasterMap.get(req.resolvedItemCode.toUpperCase());
  const standardPrice = item?.standardPrice || 0;
  const groupValueInr = Math.round(req.totalQuantity * standardPrice * 100) / 100;

  return {
    unitPrice: standardPrice,
    groupValueInr,
    priceSource: "STANDARD_PRICE",
    explanation: `Valued at item master standard price (₹${standardPrice}) (Policy 3.1c)`,
  };
}
