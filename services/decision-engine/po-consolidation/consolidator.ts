import { RequirementDecision } from "../types/engine";

export interface PoGroup {
  poId: string;
  supplierId: string;
  supplierName?: string;
  plant: string;
  route: string;
  status: "PROPOSED";
  firstRequirementDate: Date;
  requirementIds: string[];
  prReferences: Array<{ prNo: string; prLine: number }>;
  totalValueInr: number;
}

/**
 * Consolidates PO requirements according to Policy Section 7:
 * - Only requirements whose decision is "PO"
 * - Same supplier
 * - Same plant
 * - Same route
 * - Raised within 24 hours of the FIRST requirement on that PO (non-transitive)
 * - Sorted by creation date, then PR number and PR-line number
 * - Proposed POs are marked status "PROPOSED" (not issued or approved)
 */
export function consolidatePurchaseOrders(
  decisions: RequirementDecision[],
  windowHours: number = 24
): {
  decisionsWithPoId: RequirementDecision[];
  poGroups: PoGroup[];
} {
  // Sort requirements ending in PO by creation time, then PR number, then PR-line number
  const poDecisions = decisions
    .filter((d) => d.decision === "PO" && d.supplierId)
    .sort((a, b) => {
      const timeA = a.requirement.requirementDate.getTime();
      const timeB = b.requirement.requirementDate.getTime();
      if (timeA !== timeB) return timeA - timeB;

      const firstLineA = a.requirement.lines[0];
      const firstLineB = b.requirement.lines[0];
      if (firstLineA && firstLineB) {
        const prCmp = firstLineA.pr_no.localeCompare(firstLineB.pr_no);
        if (prCmp !== 0) return prCmp;
        if (firstLineA.pr_line !== firstLineB.pr_line) {
          return firstLineA.pr_line - firstLineB.pr_line;
        }
      }

      return a.groupId.localeCompare(b.groupId);
    });

  const openPoGroups: PoGroup[] = [];
  const decisionPoMap = new Map<string, string>(); // groupId -> poId
  let poSeq = 1;

  const windowMs = windowHours * 60 * 60 * 1000;

  for (const dec of poDecisions) {
    const supp = dec.supplierId!;
    const plant = dec.requirement.plant;
    const route = dec.route;
    const reqTime = dec.requirement.requirementDate.getTime();
    const lineRefs = dec.requirement.lines.map((l) => ({
      prNo: l.pr_no,
      prLine: l.pr_line,
    }));

    // Check if qualifies for an existing open PO group (joins earliest open PO)
    let matchedPo: PoGroup | null = null;

    for (const po of openPoGroups) {
      if (po.supplierId !== supp) continue;
      if (po.plant !== plant) continue;
      if (po.route !== route) continue;

      // Compare strictly against the FIRST requirement on that PO (non-transitive)
      const diffMs = reqTime - po.firstRequirementDate.getTime();
      if (diffMs >= 0 && diffMs <= windowMs) {
        matchedPo = po;
        break;
      }
    }

    if (matchedPo) {
      matchedPo.requirementIds.push(dec.groupId);
      matchedPo.prReferences.push(...lineRefs);
      matchedPo.totalValueInr =
        Math.round((matchedPo.totalValueInr + dec.groupValueInr) * 100) / 100;
      decisionPoMap.set(dec.groupId, matchedPo.poId);
    } else {
      const poId = `PO-${poSeq.toString().padStart(4, "0")}`;
      poSeq++;

      const newPo: PoGroup = {
        poId,
        supplierId: supp,
        supplierName: dec.supplierName,
        plant,
        route,
        status: "PROPOSED",
        firstRequirementDate: dec.requirement.requirementDate,
        requirementIds: [dec.groupId],
        prReferences: [...lineRefs],
        totalValueInr: Math.round(dec.groupValueInr * 100) / 100,
      };
      openPoGroups.push(newPo);
      decisionPoMap.set(dec.groupId, poId);
    }
  }

  // Attach poId to each PO decision; SOURCING_REQUEST / NOT_PROCESSED never get a poId
  const decisionsWithPoId = decisions.map((d) => {
    if (d.decision === "PO" && decisionPoMap.has(d.groupId)) {
      return {
        ...d,
        poId: decisionPoMap.get(d.groupId),
      };
    }
    return d;
  });

  return {
    decisionsWithPoId,
    poGroups: openPoGroups,
  };
}
