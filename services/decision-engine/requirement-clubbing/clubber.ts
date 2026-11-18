import { ResolvedPrLine, RequirementGroup } from "../types/engine";
import { PolicyClubbingConfig } from "../types/policy";

/**
 * Sorts PR lines according to Policy Section 2.2:
 * 1. Creation time
 * 2. PR number
 * 3. Line number
 */
export function sortPrLinesForClubbing(lines: ResolvedPrLine[]): ResolvedPrLine[] {
  return [...lines].sort((a, b) => {
    const timeA = a.parsedCreatedAt.getTime();
    const timeB = b.parsedCreatedAt.getTime();
    if (timeA !== timeB) return timeA - timeB;

    const prCompare = a.pr_no.localeCompare(b.pr_no);
    if (prCompare !== 0) return prCompare;

    return a.pr_line - b.pr_line;
  });
}

/**
 * Calculates calendar day difference between two dates
 */
function calendarDayDifference(dateA: Date, dateB: Date): number {
  const utcA = Date.UTC(dateA.getFullYear(), dateA.getMonth(), dateA.getDate());
  const utcB = Date.UTC(dateB.getFullYear(), dateB.getMonth(), dateB.getDate());
  return (utcA - utcB) / (1000 * 60 * 60 * 24);
}

/**
 * Clubs sorted PR lines into distinct requirements according to Policy Section 2
 */
export function clubPrLines(
  lines: ResolvedPrLine[],
  config: PolicyClubbingConfig
): RequirementGroup[] {
  const sorted = sortPrLinesForClubbing(lines);
  const requirements: RequirementGroup[] = [];

  let seq = 1;

  for (const line of sorted) {
    // Policy Section 1.2: New items are NEVER clubbed
    if (line.isNewItem || !config.allowNewItems && line.resolvedItemCode === "NEW") {
      const groupId = `REQ-${seq.toString().padStart(4, "0")}`;
      seq++;
      requirements.push({
        groupId,
        plant: line.plant,
        resolvedItemCode: line.resolvedItemCode,
        isNewItem: true,
        isEmergency: line.urgency === "Emergency",
        requirementDate: line.parsedCreatedAt,
        firstLineNeedByDate: line.parsedNeedByDate,
        earliestNeedByDate: line.parsedNeedByDate,
        lines: [line],
        totalQuantity: line.quantity,
        uom: line.uom,
        unitPrice: line.estimated_unit_price || 0,
        priceSource: "REQUESTER_ESTIMATE",
        priceExplanation: "Valued at quantity × requester's estimated unit price (Policy 1.2)",
        groupValueInr: Math.round(line.quantity * (line.estimated_unit_price || 0)),
      });
      continue;
    }

    // Check if line qualifies to join an existing requirement
    let eligibleReq: RequirementGroup | null = null;

    for (const req of requirements) {
      if (req.isNewItem) continue;

      // 1. Same resolved item
      if (req.resolvedItemCode !== line.resolvedItemCode) continue;

      // 2. Same plant (Different plants must never be clubbed)
      if (!config.allowAcrossPlants && req.plant !== line.plant) continue;

      // 3. Created within 14 calendar days of the requirement's FIRST line
      const daysFromFirstLine = calendarDayDifference(line.parsedCreatedAt, req.requirementDate);
      if (daysFromFirstLine < 0 || daysFromFirstLine > config.creationWindowDays) {
        continue;
      }

      // 4. Need-by date is within 7 calendar days (either side) of the FIRST line's need-by date
      const daysDiffNeedBy = Math.abs(calendarDayDifference(line.parsedNeedByDate, req.firstLineNeedByDate));
      if (daysDiffNeedBy > config.needByWindowDays) {
        continue;
      }

      // If multiple qualify, joins the earliest requirement (first encountered in creation order)
      eligibleReq = req;
      break;
    }

    if (eligibleReq) {
      // Join existing requirement
      eligibleReq.lines.push(line);
      eligibleReq.totalQuantity += line.quantity;

      // Emergency escalation: If any line is Emergency, the entire requirement is Emergency
      if (line.urgency === "Emergency") {
        eligibleReq.isEmergency = true;
      }

      // Update earliest need-by date
      if (line.parsedNeedByDate < eligibleReq.earliestNeedByDate) {
        eligibleReq.earliestNeedByDate = line.parsedNeedByDate;
      }
    } else {
      // Create new requirement
      const groupId = `REQ-${seq.toString().padStart(4, "0")}`;
      seq++;

      requirements.push({
        groupId,
        plant: line.plant,
        resolvedItemCode: line.resolvedItemCode,
        isNewItem: false,
        isEmergency: line.urgency === "Emergency",
        requirementDate: line.parsedCreatedAt,
        firstLineNeedByDate: line.parsedNeedByDate,
        earliestNeedByDate: line.parsedNeedByDate,
        lines: [line],
        totalQuantity: line.quantity,
        uom: line.uom,
        unitPrice: 0,
        priceSource: "STANDARD_PRICE",
        priceExplanation: "",
        groupValueInr: 0,
      });
    }
  }

  return requirements;
}
