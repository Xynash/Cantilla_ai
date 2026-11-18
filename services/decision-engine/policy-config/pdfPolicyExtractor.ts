import crypto from "crypto";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { StructuredPolicyConfig } from "../types/policy";
import { CORVO_POLICY_V5_CONFIG } from "./baseline-v5";
import { ValidationError } from "@/lib/errors";

export const MAX_POLICY_PDF_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export interface ExtractedPolicyClause {
  clauseId: string;
  sectionTitle?: string;
  text: string;
}

export interface PolicyPdfExtractionResult {
  fileName: string;
  fileSize: number;
  mimeType: string;
  sha256: string;
  storagePath: string;
  uploadedAt: string;
  uploadedBy: string;
  pageCount: number;
  extractedText: string;
  extractedClauses: ExtractedPolicyClause[];
  detectedMetadata: {
    documentCode: string;
    version: string;
    effectiveDate: string;
    owner: string;
    appliesToPlants: string[];
  };
  detectedThresholds: {
    clubbingCreationDays: number;
    clubbingNeedByDays: number;
    valuationPoWindowDays: number;
    preferredSupplierPoWindowDays: number;
    emergencyValueLimitInr: number;
    emergencyLookbackDays: number;
    spotValueLimitInr: number;
    spotLookbackDays: number;
    rfqValueLimitInr: number;
    rfqSupplierCount: number;
    rfpValueThresholdInr: number;
    rfpSupplierCount: number;
    capexSupplierCount: number;
    poConsolidationWindowHours: number;
  };
  draftPolicyConfig: StructuredPolicyConfig;
  reviewNotes: string[];
  requiresHumanVerification: true;
}

/**
 * Normalizes Private Use Area glyphs emitted by some PDF font subsets into standard Unicode
 */
function normalizePdfGlyphs(text: string): string {
  return text
    .replace(/\uE081/g, "(")
    .replace(/\uE082/g, ")")
    .replace(/\uE088/g, "-")
    .replace(/\uE099/g, "≤")
    .replace(/[ \t]{2,}/g, " ");
}

/**
 * Deterministic pure-TypeScript PDF stream & ToUnicode CMap text extractor.
 * Requires zero external LLM or network APIs.
 */
export function extractTextFromPdfBuffer(pdfBuffer: Buffer): {
  pageCount: number;
  pages: string[];
  fullText: string;
} {
  if (!pdfBuffer || pdfBuffer.length < 8) {
    throw new ValidationError("Uploaded file is empty or too small to be a valid PDF.");
  }

  const header = pdfBuffer.subarray(0, 8).toString("latin1");
  if (!header.startsWith("%PDF-")) {
    throw new ValidationError("Invalid file format: File does not have a valid %PDF- header.");
  }

  const raw = pdfBuffer.toString("latin1");

  const objMap = new Map<number, { dict: string; decompressed?: string }>();
  const objRegex = /(\d+)\s+0\s+obj\b([\s\S]*?)endobj/g;
  let m: RegExpExecArray | null;

  while ((m = objRegex.exec(raw)) !== null) {
    const objId = parseInt(m[1], 10);
    const body = m[2];
    const streamMatch = /stream\r?\n([\s\S]*?)\r?\nendstream/.exec(body);
    if (streamMatch) {
      const dictPart = body.slice(0, streamMatch.index);
      const streamBytes = Buffer.from(streamMatch[1], "latin1");
      let decompressed: string;
      try {
        decompressed = zlib.inflateSync(streamBytes).toString("latin1");
      } catch {
        decompressed = streamMatch[1];
      }
      objMap.set(objId, { dict: dictPart, decompressed });
    } else {
      objMap.set(objId, { dict: body });
    }
  }

  function parseCMap(cmapText: string): Map<number, string> {
    const map = new Map<number, string>();

    const bfcharRegex = /beginbfchar([\s\S]*?)endbfchar/g;
    let bfm: RegExpExecArray | null;
    while ((bfm = bfcharRegex.exec(cmapText)) !== null) {
      const pairRegex = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
      let pm: RegExpExecArray | null;
      while ((pm = pairRegex.exec(bfm[1])) !== null) {
        const src = parseInt(pm[1], 16);
        const dstHex = pm[2];
        let str = "";
        for (let i = 0; i < dstHex.length; i += 4) {
          str += String.fromCodePoint(parseInt(dstHex.slice(i, i + 4), 16));
        }
        map.set(src, str);
      }
    }

    const bfrangeRegex = /beginbfrange([\s\S]*?)endbfrange/g;
    let brm: RegExpExecArray | null;
    while ((brm = bfrangeRegex.exec(cmapText)) !== null) {
      const rangeLineRegex = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
      let rm: RegExpExecArray | null;
      while ((rm = rangeLineRegex.exec(brm[1])) !== null) {
        const start = parseInt(rm[1], 16);
        const end = parseInt(rm[2], 16);
        const targetStart = parseInt(rm[3], 16);
        for (let code = start; code <= end; code++) {
          map.set(code, String.fromCodePoint(targetStart + (code - start)));
        }
      }
    }

    return map;
  }

  const fontObjToCMap = new Map<number, { cmap: Map<number, string>; isTwoByte: boolean }>();
  for (const [objId, obj] of objMap.entries()) {
    const toUniMatch = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(obj.dict);
    if (toUniMatch) {
      const toUniId = parseInt(toUniMatch[1], 10);
      const cmapObj = objMap.get(toUniId);
      if (cmapObj?.decompressed) {
        const isTwoByte = /<0000>\s*<FFFF>/i.test(cmapObj.decompressed);
        fontObjToCMap.set(objId, {
          cmap: parseCMap(cmapObj.decompressed),
          isTwoByte,
        });
      }
    }
  }

  const fontNameMap = new Map<string, number>();
  for (const [, obj] of objMap.entries()) {
    const fontEntryRegex = /\/(F\d+)\s+(\d+)\s+0\s+R/g;
    let fm: RegExpExecArray | null;
    while ((fm = fontEntryRegex.exec(obj.dict)) !== null) {
      fontNameMap.set(fm[1], parseInt(fm[2], 10));
    }
  }

  const pages: string[] = [];
  for (const [, obj] of objMap.entries()) {
    if (/\/Type\s*\/Page\b/.test(obj.dict) && !/\/Type\s*\/Pages\b/.test(obj.dict)) {
      const contentsMatch = /\/Contents\s+(\d+)\s+0\s+R/.exec(obj.dict);
      if (!contentsMatch) continue;
      const contentObjId = parseInt(contentsMatch[1], 10);
      const contentObj = objMap.get(contentObjId);
      if (!contentObj?.decompressed) continue;

      const stream = contentObj.decompressed;
      let currentFont = "F4";
      let currentY: number | null = null;
      let pageOut = "";

      const tokenRegex =
        /\/(F\d+)\s+[\d.]+\s+Tf|1\s+0\s+0\s+-?1\s+[\d.-]+\s+([\d.-]+)\s+Tm|([\d.-]+)\s+([\d.-]+)\s+Td|<([0-9A-Fa-f]+)>\s*Tj|\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*Tj|\[([\s\S]*?)\]\s*TJ/g;
      let tm: RegExpExecArray | null;
      while ((tm = tokenRegex.exec(stream)) !== null) {
        if (tm[1]) {
          currentFont = tm[1];
        } else if (tm[2] !== undefined) {
          const newY = parseFloat(tm[2]);
          if (currentY !== null && Math.abs(newY - currentY) > 4) {
            pageOut += "\n";
          } else if (currentY !== null && Math.abs(newY - currentY) <= 4) {
            pageOut += " ";
          }
          currentY = newY;
        } else if (tm[3] !== undefined && tm[4] !== undefined) {
          const dy = parseFloat(tm[4]);
          if (Math.abs(dy) > 4) {
            pageOut += "\n";
            if (currentY !== null) currentY += dy;
          }
        } else if (tm[5] !== undefined) {
          const hex = tm[5];
          const fontObjId = fontNameMap.get(currentFont);
          const fontCMap = fontObjId ? fontObjToCMap.get(fontObjId) : undefined;
          if (fontCMap) {
            const step = fontCMap.isTwoByte ? 4 : 2;
            for (let i = 0; i < hex.length; i += step) {
              const code = parseInt(hex.slice(i, i + step), 16);
              const ch = fontCMap.cmap.get(code);
              if (ch !== undefined) pageOut += ch;
            }
          } else {
            for (let i = 0; i < hex.length; i += 2) {
              pageOut += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
            }
          }
        } else if (tm[6] !== undefined) {
          pageOut += tm[6]
            .replace(/\\n/g, "\n")
            .replace(/\\r/g, "\r")
            .replace(/\\\(/g, "(")
            .replace(/\\\)/g, ")");
        } else if (tm[7] !== undefined) {
          const arrContent = tm[7];
          const subRegex = /\(([^)\\]*(?:\\.[^)\\]*)*)\)|<([0-9A-Fa-f]+)>/g;
          let sm: RegExpExecArray | null;
          while ((sm = subRegex.exec(arrContent)) !== null) {
            if (sm[1] !== undefined) {
              pageOut += sm[1].replace(/\\\(/g, "(").replace(/\\\)/g, ")");
            } else if (sm[2] !== undefined) {
              const hex = sm[2];
              const fontObjId = fontNameMap.get(currentFont);
              const fontCMap = fontObjId ? fontObjToCMap.get(fontObjId) : undefined;
              if (fontCMap) {
                const step = fontCMap.isTwoByte ? 4 : 2;
                for (let i = 0; i < hex.length; i += step) {
                  const code = parseInt(hex.slice(i, i + step), 16);
                  const ch = fontCMap.cmap.get(code);
                  if (ch !== undefined) pageOut += ch;
                }
              }
            }
          }
        }
      }
      pages.push(normalizePdfGlyphs(pageOut.trim()));
    }
  }

  // Fallback for simple uncompressed PDFs without /Type /Page streams
  if (pages.length === 0) {
    const fallbackStrings: string[] = [];
    const literalRegex = /\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*Tj/g;
    let lm: RegExpExecArray | null;
    while ((lm = literalRegex.exec(raw)) !== null) {
      fallbackStrings.push(
        lm[1]
          .replace(/\\n/g, "\n")
          .replace(/\\\(/g, "(")
          .replace(/\\\)/g, ")")
      );
    }
    if (fallbackStrings.length > 0) {
      pages.push(normalizePdfGlyphs(fallbackStrings.join("\n")));
    }
  }

  const fullText = pages.join("\n\n");
  return {
    pageCount: Math.max(pages.length, 1),
    pages,
    fullText,
  };
}

/**
 * Parses a human-readable date like "1 April 2026" or "2026-04-01" into "YYYY-MM-DD"
 */
function parseExtractedDateToIso(dateStr: string): string {
  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const months: Record<string, string> = {
    january: "01",
    jan: "01",
    february: "02",
    feb: "02",
    march: "03",
    mar: "03",
    april: "04",
    apr: "04",
    may: "05",
    june: "06",
    jun: "06",
    july: "07",
    jul: "07",
    august: "08",
    aug: "08",
    september: "09",
    sep: "09",
    october: "10",
    oct: "10",
    november: "11",
    nov: "11",
    december: "12",
    dec: "12",
  };
  const dmyMatch = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(trimmed);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, "0");
    const month = months[dmyMatch[2].toLowerCase()];
    const year = dmyMatch[3];
    if (month) {
      return `${year}-${month}-${day}`;
    }
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return CORVO_POLICY_V5_CONFIG.effectiveDate;
}

/**
 * Extracts structured policy clauses (e.g., 1.1, 1.2, 2.1..8.1) and numeric thresholds from extracted PDF text.
 */
export function parsePolicyRulesFromText(extractedText: string): {
  extractedClauses: ExtractedPolicyClause[];
  detectedMetadata: PolicyPdfExtractionResult["detectedMetadata"];
  detectedThresholds: PolicyPdfExtractionResult["detectedThresholds"];
  draftPolicyConfig: StructuredPolicyConfig;
  reviewNotes: string[];
} {
  const cleanText = normalizePdfGlyphs(extractedText);

  // 1. Metadata extraction
  const docCodeMatch = /Document\s+([A-Z0-9-]+)/i.exec(cleanText);
  const versionMatch = /Version\s+([0-9]+(?:\.[0-9]+)*)/i.exec(cleanText);
  const effectiveMatch = /Effective\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4}|\d{4}-\d{2}-\d{2})/i.exec(
    cleanText
  );
  const ownerMatch = /Owner:\s*([^·\n]+)/i.exec(cleanText);
  const plantMatches = Array.from(cleanText.matchAll(/\b([A-Z]{3}\d)\b/g)).map((m) => m[1]);
  const uniquePlants = Array.from(new Set(plantMatches));

  const detectedMetadata = {
    documentCode: docCodeMatch ? docCodeMatch[1].trim() : CORVO_POLICY_V5_CONFIG.documentName,
    version: versionMatch ? versionMatch[1].trim() : CORVO_POLICY_V5_CONFIG.version,
    effectiveDate: effectiveMatch
      ? parseExtractedDateToIso(effectiveMatch[1])
      : CORVO_POLICY_V5_CONFIG.effectiveDate,
    owner: ownerMatch ? ownerMatch[1].trim() : CORVO_POLICY_V5_CONFIG.owner,
    appliesToPlants:
      uniquePlants.length > 0 ? uniquePlants : [...CORVO_POLICY_V5_CONFIG.appliesToPlants],
  };

  // 2. Clause identification (1.1 through 8.1)
  const clauseRegex = /(?:^|\n)\s*([1-8]\.[1-9])\s+([\s\S]*?)(?=(?:\n\s*(?:[1-8]\.[1-9]|[1-8]\.\s+[A-Z]|Corvo Engineering|$)))/g;
  const extractedClauses: ExtractedPolicyClause[] = [];
  let cm: RegExpExecArray | null;
  while ((cm = clauseRegex.exec(cleanText)) !== null) {
    const clauseId = cm[1].trim();
    const rawClauseText = cm[2]
      .replace(/Corvo Engineering\s*·\s*Procurement Policy[^\n]*/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    if (rawClauseText) {
      extractedClauses.push({
        clauseId,
        text: rawClauseText,
      });
    }
  }

  // 3. Threshold extraction from text
  const parseInr = (str: string | undefined, fallback: number): number => {
    if (!str) return fallback;
    const numeric = Number(str.replace(/[,₹\s]/g, ""));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
  };

  const creationDaysMatch = /within\s+(\d+)\s+calendar\s+days/i.exec(cleanText);
  const needByDaysMatch = /within\s+(\d+)\s+days\s*\(either\s+side\)/i.exec(cleanText);
  const valWindowMatch = /most\s+recent\s+PO\s+for\s+the\s+item\s+in\s+the\s+(\d+)\s+days/i.exec(
    cleanText
  );
  const prefWindowMatch = /at\s+least\s+one\s+PO\s+for\s+the\s+item\s+in\s+the\s+(\d+)\s+days/i.exec(
    cleanText
  );
  const emergencyMatch = /Emergency,\s*value\s*[≤<=]+\s*₹?([\d,]+)/i.exec(cleanText);
  const spotMatch = /5\.4\s+Value\s+below\s*₹?([\d,]+)/i.exec(cleanText);
  const rfqMatch = /5\.5\s+Value\s+below\s*₹?([\d,]+)/i.exec(cleanText);
  const rfpMatch = /5\.6\s+Value\s*₹?([\d,]+)\s+or\s+more/i.exec(cleanText);
  const consolHoursMatch = /within\s+(\d+)\s+hours/i.exec(cleanText);
  const capexSuppMatch = /5\.1[\s\S]{0,120}?Suggest\s+(\d+)\s+suppliers/i.exec(cleanText);
  const rfqSuppMatch = /5\.5[\s\S]{0,160}?Suggest\s+(\d+)\s+suppliers/i.exec(cleanText);
  const rfpSuppMatch = /5\.6[\s\S]{0,160}?Suggest\s+(\d+)\s+suppliers/i.exec(cleanText);

  const detectedThresholds = {
    clubbingCreationDays: creationDaysMatch ? parseInt(creationDaysMatch[1], 10) : 14,
    clubbingNeedByDays: needByDaysMatch ? parseInt(needByDaysMatch[1], 10) : 7,
    valuationPoWindowDays: valWindowMatch ? parseInt(valWindowMatch[1], 10) : 365,
    preferredSupplierPoWindowDays: prefWindowMatch ? parseInt(prefWindowMatch[1], 10) : 548,
    emergencyValueLimitInr: parseInr(emergencyMatch?.[1], 500000),
    emergencyLookbackDays: 365,
    spotValueLimitInr: parseInr(spotMatch?.[1], 200000),
    spotLookbackDays: 365,
    rfqValueLimitInr: parseInr(rfqMatch?.[1], 1000000),
    rfqSupplierCount: rfqSuppMatch ? parseInt(rfqSuppMatch[1], 10) : 3,
    rfpValueThresholdInr: parseInr(rfpMatch?.[1], 1000000),
    rfpSupplierCount: rfpSuppMatch ? parseInt(rfpSuppMatch[1], 10) : 5,
    capexSupplierCount: capexSuppMatch ? parseInt(capexSuppMatch[1], 10) : 5,
    poConsolidationWindowHours: consolHoursMatch ? parseInt(consolHoursMatch[1], 10) : 24,
  };

  // 4. Construct draft policy config based on extracted values + baseline scoring weights
  const draftPolicyConfig: StructuredPolicyConfig = {
    version: detectedMetadata.version,
    documentName: detectedMetadata.documentCode,
    effectiveDate: detectedMetadata.effectiveDate,
    owner: detectedMetadata.owner,
    appliesToPlants: detectedMetadata.appliesToPlants,
    clubbing: {
      creationWindowDays: detectedThresholds.clubbingCreationDays,
      needByWindowDays: detectedThresholds.clubbingNeedByDays,
      allowAcrossPlants: false,
      allowNewItems: false,
    },
    valuation: {
      contractExhaustedFallback: "LOWEST_APPLICABLE_RATE",
      poHistoryWindowDays: detectedThresholds.valuationPoWindowDays,
      currency: "INR",
    },
    preferredSuppliers: {
      ...JSON.parse(JSON.stringify(CORVO_POLICY_V5_CONFIG.preferredSuppliers)),
      poHistoryWindowDays: detectedThresholds.preferredSupplierPoWindowDays,
      activeLookbackDays: detectedThresholds.spotLookbackDays,
    },
    consolidation: {
      poWindowHours: detectedThresholds.poConsolidationWindowHours,
      matchFields: ["supplierId", "plantCode", "route"],
    },
    rules: [
      {
        id: "5.1",
        name: "Capex Sourcing",
        priority: 1,
        clause: "5.1",
        description: `Item type is Capex. Requires capex approval and ${detectedThresholds.capexSupplierCount} supplier quotes.`,
        conditions: [{ field: "itemType", operator: "eq", value: "Capex" }],
        decision: "SOURCING_REQUEST",
        route: "CAPEX_SOURCING",
        supplierSelection: {
          type: "SUGGEST_PREFERRED",
          suggestCount: detectedThresholds.capexSupplierCount,
        },
        requiresApproval: true,
      },
      {
        id: "5.2",
        name: "Valid Rate Contract",
        priority: 2,
        clause: "5.2",
        description: "Eligible active contract covers item and has sufficient ceiling balance.",
        conditions: [{ field: "hasValidContract", operator: "eq", value: true }],
        decision: "PO",
        route: "CONTRACT_PO",
        supplierSelection: { type: "CONTRACT_SUPPLIER" },
        priceSelection: { type: "CONTRACT_RATE" },
      },
      {
        id: "5.3",
        name: "Emergency Purchase",
        priority: 3,
        clause: "5.3",
        description: `Emergency requisition with value <= ₹${detectedThresholds.emergencyValueLimitInr.toLocaleString("en-IN")} bought from active supplier in last ${detectedThresholds.emergencyLookbackDays} days.`,
        conditions: [
          { field: "isEmergency", operator: "eq", value: true },
          { field: "valueInr", operator: "lte", value: detectedThresholds.emergencyValueLimitInr },
          {
            field: "boughtInLastDays",
            operator: "lte",
            value: detectedThresholds.emergencyLookbackDays,
          },
        ],
        decision: "PO",
        route: "EMERGENCY_PO",
        supplierSelection: { type: "FIRST_PREFERRED" },
        priceSelection: { type: "PREFERRED_REFERENCE_PRICE" },
      },
      {
        id: "5.4",
        name: "Spot Purchase",
        priority: 4,
        clause: "5.4",
        description: `Requirement value strictly below ₹${detectedThresholds.spotValueLimitInr.toLocaleString("en-IN")} bought from active supplier in last ${detectedThresholds.spotLookbackDays} days.`,
        conditions: [
          { field: "valueInr", operator: "lt", value: detectedThresholds.spotValueLimitInr },
          {
            field: "boughtInLastDays",
            operator: "lte",
            value: detectedThresholds.spotLookbackDays,
          },
        ],
        decision: "PO",
        route: "SPOT_PO",
        supplierSelection: { type: "FIRST_PREFERRED" },
        priceSelection: { type: "PREFERRED_REFERENCE_PRICE" },
      },
      {
        id: "5.5",
        name: "Request for Quotation (RFQ)",
        priority: 5,
        clause: "5.5",
        description: `Requirement value strictly below ₹${detectedThresholds.rfqValueLimitInr.toLocaleString("en-IN")} where previous PO rules do not apply.`,
        conditions: [
          { field: "valueInr", operator: "lt", value: detectedThresholds.rfqValueLimitInr },
        ],
        decision: "SOURCING_REQUEST",
        route: "RFQ",
        supplierSelection: {
          type: "SUGGEST_PREFERRED",
          suggestCount: detectedThresholds.rfqSupplierCount,
        },
      },
      {
        id: "5.6",
        name: "Request for Proposal (RFP)",
        priority: 6,
        clause: "5.6",
        description: `Requirement value is ₹${detectedThresholds.rfpValueThresholdInr.toLocaleString("en-IN")} or greater.`,
        conditions: [
          { field: "valueInr", operator: "gte", value: detectedThresholds.rfpValueThresholdInr },
        ],
        decision: "SOURCING_REQUEST",
        route: "RFP",
        supplierSelection: {
          type: "SUGGEST_PREFERRED",
          suggestCount: detectedThresholds.rfpSupplierCount,
        },
      },
    ],
  };

  const reviewNotes: string[] = [
    `Extracted ${extractedClauses.length} numbered policy clauses across ${detectedMetadata.documentCode} (v${detectedMetadata.version}).`,
    "Clause 6.2 states 'Procurement leaves the exact weighting to the system design, but it must be consistent, explainable to a buyer, and recorded.' Baseline weights (35% Frequency, 25% Recency, 15% Contract, 15% On-Time, 10% Quality) are pre-populated for admin confirmation.",
    "Extracted rules are staged as a DRAFT preview only and require explicit human verification and approval before activation.",
  ];

  return {
    extractedClauses,
    detectedMetadata,
    detectedThresholds,
    draftPolicyConfig,
    reviewNotes,
  };
}

/**
 * Stores an uploaded PDF buffer to disk and returns the deterministic extraction preview.
 * Does NOT activate or overwrite any policy version automatically.
 */
export function storeAndExtractPolicyPdf(params: {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  uploadedBy: string;
}): PolicyPdfExtractionResult {
  const { fileName, mimeType, buffer, uploadedBy } = params;

  if (!buffer || buffer.length === 0) {
    throw new ValidationError("Uploaded PDF file is empty.");
  }

  if (buffer.length > MAX_POLICY_PDF_SIZE_BYTES) {
    throw new ValidationError(
      `PDF file size (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed limit of 10 MB.`
    );
  }

  if (
    mimeType &&
    mimeType !== "application/pdf" &&
    !fileName.toLowerCase().endsWith(".pdf")
  ) {
    throw new ValidationError("Only PDF documents (.pdf, application/pdf) are accepted.");
  }

  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const safeBaseName = path
    .basename(fileName)
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80);
  const storedFileName = `${Date.now()}-${sha256.slice(0, 8)}-${safeBaseName}`;
  const uploadsDir = path.join(process.cwd(), "data", "uploads", "policies");

  let storagePath = `data/uploads/policies/${storedFileName}`;
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, storedFileName), buffer);
  } catch {
    // If read-only filesystem in restricted test environment, preserve virtual storage path
    storagePath = `memory://uploads/policies/${storedFileName}`;
  }

  const { pageCount, fullText } = extractTextFromPdfBuffer(buffer);
  const parsed = parsePolicyRulesFromText(fullText);

  return {
    fileName,
    fileSize: buffer.length,
    mimeType: mimeType || "application/pdf",
    sha256,
    storagePath,
    uploadedAt: new Date().toISOString(),
    uploadedBy,
    pageCount,
    extractedText: fullText,
    extractedClauses: parsed.extractedClauses,
    detectedMetadata: parsed.detectedMetadata,
    detectedThresholds: parsed.detectedThresholds,
    draftPolicyConfig: parsed.draftPolicyConfig,
    reviewNotes: parsed.reviewNotes,
    requiresHumanVerification: true,
  };
}
