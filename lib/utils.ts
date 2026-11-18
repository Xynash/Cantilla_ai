import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges Tailwind and conditional classes safely.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format currency amounts in standard USD notation.
 */
export function formatCurrency(amount: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format ISO dates into enterprise readable timestamps.
 */
export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(
    "en-US",
    options ?? {
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  ).format(d);
}

/**
 * Escapes special regular-expression metacharacters in user search strings
 * before passing into MongoDB `$regex` queries (prevents ReDoS and invalid regex errors).
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Sanitizes a cell value for safe CSV export, escaping quotes/commas and neutralizing
 * spreadsheet formula-injection prefixes (=, +, -, @) on non-numeric strings.
 */
export function sanitizeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);

  let str = String(value);
  if (/^[=+\-@]/.test(str) && !/^[+-]?\d+(\.\d+)?$/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}






