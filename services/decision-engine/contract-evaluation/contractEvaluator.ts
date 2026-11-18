import { RequirementGroup } from "../types/engine";
import { ContractRecord } from "./pdfContracts";

export interface ContractEvaluationResult {
  hasApplicableContract: boolean;
  hasValidContract: boolean; // applicable AND has sufficient ceiling
  allContractsExhausted: boolean;
  selectedContract?: ContractRecord;
  selectedRate?: number;
  requirementCostAtContractRate?: number;
  lowestApplicableRate?: number;
  explanation: string;
}

/**
 * Evaluates contract availability for a requirement according to Policy Section 4
 */
export function evaluateRequirementContract(
  req: RequirementGroup,
  contracts: ContractRecord[],
  activeSupplierIds: Set<string>
): ContractEvaluationResult {
  // New items have no contracts
  if (req.isNewItem || req.resolvedItemCode === "NEW") {
    return {
      hasApplicableContract: false,
      hasValidContract: false,
      allContractsExhausted: false,
      explanation: "New item: not covered by rate contracts",
    };
  }

  // 1. Identify all applicable contracts (Policy 4.1)
  // - Covers the item
  // - Requirement date falls between start_date and end_date (inclusive)
  // - Supplier is Active in the supplier master
  const reqTime = req.requirementDate.getTime();

  const applicableContracts: Array<{
    contract: ContractRecord;
    rate: number;
    uom: string;
    remainingCeiling: number;
  }> = [];

  for (const c of contracts) {
    // Check dates
    if (reqTime < c.startDate.getTime() || reqTime > c.endDate.getTime()) {
      continue;
    }

    // Check supplier active status (Policy 4.1, 5.7)
    if (!activeSupplierIds.has(c.supplierId.toUpperCase())) {
      continue;
    }

    // Check item coverage
    const line = c.lines.find((l) => l.itemCode.toUpperCase() === req.resolvedItemCode.toUpperCase());
    if (!line) {
      continue;
    }

    const remainingCeiling = Math.max(0, c.valueCap - c.consumedValue);
    applicableContracts.push({
      contract: c,
      rate: line.rate,
      uom: line.uom,
      remainingCeiling,
    });
  }

  if (applicableContracts.length === 0) {
    return {
      hasApplicableContract: false,
      hasValidContract: false,
      allContractsExhausted: false,
      explanation: "No active rate contract covers this item on the requirement date",
    };
  }

  // Sort applicable contracts by rate ascending (Policy 4.3: "use the one with the lowest rate that still has enough ceiling")
  applicableContracts.sort((a, b) => a.rate - b.rate);
  const lowestApplicableRate = applicableContracts[0].rate;

  // 2. Select the lowest-rate contract that has enough ceiling (Policy 4.2 & 4.3)
  for (const app of applicableContracts) {
    const requiredVal = Math.round(req.totalQuantity * app.rate * 100) / 100;
    if (app.contract.consumedValue + requiredVal <= app.contract.valueCap) {
      return {
        hasApplicableContract: true,
        hasValidContract: true,
        allContractsExhausted: false,
        selectedContract: app.contract,
        selectedRate: app.rate,
        requirementCostAtContractRate: requiredVal,
        lowestApplicableRate,
        explanation: `Covered by rate contract ${app.contract.contractId} with ${app.contract.supplierName} (${app.contract.supplierId}) at ₹${app.rate} with sufficient ceiling.`,
      };
    }
  }

  // 3. If all applicable contracts are out of ceiling (Policy 3.1 & 4.2)
  // "if every applicable contract is out of ceiling, use the lowest applicable contract rate and the rest of the rules decide."
  return {
    hasApplicableContract: true,
    hasValidContract: false,
    allContractsExhausted: true,
    lowestApplicableRate,
    explanation: `Applicable contracts (${applicableContracts.map((c) => c.contract.contractId).join(", ")}) do not have sufficient ceiling remaining.`,
  };
}
