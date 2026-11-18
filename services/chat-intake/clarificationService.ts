import { ICollectedData, IConversationMessage } from "@/models/Conversation";
import { formatCurrency } from "@/lib/utils";

export interface ClarificationResponse {
  message: string;
  clarificationType?: "item" | "quantity" | "plant" | "date" | "urgency" | "confirmation";
  options?: Array<{ label: string; value: string; description?: string }>;
  nextState:
    | "STARTED"
    | "COLLECTING_DETAILS"
    | "ITEM_CLARIFICATION"
    | "WAITING_FOR_CONFIRMATION"
    | "CONFIRMED"
    | "CANCELLED";
}

/**
 * Determines the next missing field and generates a single structured clarification prompt.
 */
export function generateNextClarification(
  data: ICollectedData
): ClarificationResponse {
  // 1. Check Item Clarification (Multiple candidate ambiguity)
  if (data.candidateItems && data.candidateItems.length > 1 && !data.itemCode) {
    const options = data.candidateItems.map((c) => ({
      label: `${c.itemCode} — ${c.description}`,
      value: c.itemCode,
      description: `${c.uom} &bull; ${formatCurrency(c.standardPrice, "INR")}`,
    }));

    // Add option to proceed as custom/unlisted item
    options.push({
      label: `None of the above (Keep as custom: "${data.originalDescription}")`,
      value: "CUSTOM_ITEM",
      description: "Keep uncatalogued custom line item",
    });

    return {
      message: `Multiple items match "${data.originalDescription}". Please select the exact catalog item entry from the options below:`,
      clarificationType: "item",
      options,
      nextState: "ITEM_CLARIFICATION",
    };
  }

  // 2. Check Missing Item
  if (!data.itemCode && !data.originalDescription) {
    return {
      message: "Could you specify the material description, part name, or item code you wish to order?",
      clarificationType: "item",
      nextState: "COLLECTING_DETAILS",
    };
  }

  // 3. Check Missing Quantity
  if (!data.quantity || data.quantity <= 0) {
    return {
      message: `How many ${data.matchedItem?.description || data.originalDescription || "units"} do you require? (e.g. 50 nos, 100 kg)`,
      clarificationType: "quantity",
      nextState: "COLLECTING_DETAILS",
    };
  }

  // 4. Check Missing Plant
  if (!data.plantCode) {
    return {
      message: "Which manufacturing facility or plant should these items be shipped to?",
      clarificationType: "plant",
      options: [
        { label: "PUN1 — Pune Bhosari Plant", value: "PUN1", description: "Bhosari manufacturing dock" },
        { label: "CHK1 — Chakan Plant", value: "CHK1", description: "Chakan production facility" },
      ],
      nextState: "COLLECTING_DETAILS",
    };
  }

  // 5. Check Missing Required Date
  if (!data.needByDate) {
    return {
      message: "What is the required delivery date at the plant?",
      clarificationType: "date",
      options: [
        { label: "Tomorrow", value: "tomorrow", description: "Next business day" },
        { label: "Next Friday", value: "next Friday", description: "Following week delivery" },
        { label: "In 7 Days", value: "in 7 days", description: "1 week lead time" },
        { label: "In 14 Days", value: "in 14 days", description: "Standard lead time" },
      ],
      nextState: "COLLECTING_DETAILS",
    };
  }

  // 6. Check Missing Urgency
  if (!data.urgency) {
    return {
      message: "What is the operational priority level for this requirement?",
      clarificationType: "urgency",
      options: [
        { label: "Normal", value: "Normal", description: "Standard procurement turnaround" },
        { label: "Urgent", value: "Urgent", description: "Expedited operational requirement" },
        { label: "Emergency", value: "Emergency", description: "Line-stoppage / critical breakdown" },
      ],
      nextState: "COLLECTING_DETAILS",
    };
  }

  // 7. All information collected -> Prepare Summary and Prompt for Confirmation
  const itemLabel = data.matchedItem
    ? `${data.matchedItem.itemCode} - ${data.matchedItem.description}`
    : data.originalDescription;

  const summary = `All procurement requirements have been verified:

• Item: ${itemLabel}
• Quantity: ${data.quantity} ${data.uom || "NOS"}
• Delivery Plant: ${data.plantCode} (${data.plantName || "Designated plant"})
• Need-By Date: ${data.needByDate}
• Priority: ${data.urgency}
${data.estimatedTotal ? `• Estimated Amount: ${formatCurrency(data.estimatedTotal, "INR")}` : ""}

Please confirm to create the official Purchase Requisition record.`;

  return {
    message: summary,
    clarificationType: "confirmation",
    options: [
      { label: "Confirm & Create Requisition", value: "confirm", description: "Saves official PR to database" },
      { label: "Cancel Request", value: "cancel", description: "Discards current draft" },
    ],
    nextState: "WAITING_FOR_CONFIRMATION",
  };
}
