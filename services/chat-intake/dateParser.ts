import {
  addDays,
  addWeeks,
  nextDay,
  format,
  parse,
  isValid,
  startOfToday,
  Day,
} from "date-fns";

export interface DateParseResult {
  date?: string; // YYYY-MM-DD
  formattedText?: string;
  confidence: number;
  rawMatched?: string;
}

const DAYS_OF_WEEK: Record<string, Day> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/**
 * Gets current date in Asia/Kolkata timezone (UTC+5:30)
 */
function getNowKolkata(): Date {
  const now = new Date();
  // Adjust to Asia/Kolkata
  const kolkataOffset = 5.5 * 60; // minutes
  const localOffset = now.getTimezoneOffset(); // minutes
  const diffMinutes = kolkataOffset + localOffset;
  return new Date(now.getTime() + diffMinutes * 60 * 1000);
}

/**
 * Deterministically parses relative and explicit need-by dates.
 */
export function parseNeedByDate(text: string): DateParseResult {
  const normalized = text.toLowerCase();
  const today = getNowKolkata();

  // 1. "today"
  if (/\b(?:today|asap|eod)\b/i.test(normalized)) {
    const d = today;
    return {
      date: format(d, "yyyy-MM-dd"),
      formattedText: "Today (" + format(d, "dd MMM yyyy") + ")",
      confidence: 1.0,
      rawMatched: "today",
    };
  }

  // 2. "tomorrow"
  if (/\btomorrow\b/i.test(normalized)) {
    const d = addDays(today, 1);
    return {
      date: format(d, "yyyy-MM-dd"),
      formattedText: "Tomorrow (" + format(d, "dd MMM yyyy") + ")",
      confidence: 1.0,
      rawMatched: "tomorrow",
    };
  }

  // 3. "in X days" or "in X weeks"
  const inDaysMatch = normalized.match(/\bin\s+(\d+)\s+days?\b/i);
  if (inDaysMatch) {
    const daysToAdd = parseInt(inDaysMatch[1], 10);
    const d = addDays(today, daysToAdd);
    return {
      date: format(d, "yyyy-MM-dd"),
      formattedText: format(d, "dd MMM yyyy"),
      confidence: 1.0,
      rawMatched: inDaysMatch[0],
    };
  }

  const inWeeksMatch = normalized.match(/\bin\s+(\d+)\s+weeks?\b/i);
  if (inWeeksMatch) {
    const weeksToAdd = parseInt(inWeeksMatch[1], 10);
    const d = addWeeks(today, weeksToAdd);
    return {
      date: format(d, "yyyy-MM-dd"),
      formattedText: format(d, "dd MMM yyyy"),
      confidence: 1.0,
      rawMatched: inWeeksMatch[0],
    };
  }

  // 4. "next [day_of_week]" e.g. "next Friday", "by next Monday"
  const nextDayMatch = normalized.match(/\b(?:by\s+)?next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  if (nextDayMatch) {
    const targetDay = DAYS_OF_WEEK[nextDayMatch[1].toLowerCase()];
    if (targetDay !== undefined) {
      let d = nextDay(today, targetDay);
      // If nextDay falls within current week, next Friday typically refers to the following week's Friday
      const currentDay = today.getDay();
      if (targetDay <= currentDay) {
        d = addWeeks(d, 1);
      }
      return {
        date: format(d, "yyyy-MM-dd"),
        formattedText: format(d, "EEEE, dd MMM yyyy"),
        confidence: 0.95,
        rawMatched: nextDayMatch[0],
      };
    }
  }

  // 5. "this [day_of_week]" or "by [day_of_week]" (e.g. "by Friday", "this Thursday")
  const thisDayMatch = normalized.match(/\b(?:by\s+|this\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  if (thisDayMatch) {
    const targetDay = DAYS_OF_WEEK[thisDayMatch[1].toLowerCase()];
    if (targetDay !== undefined) {
      const d = nextDay(today, targetDay);
      return {
        date: format(d, "yyyy-MM-dd"),
        formattedText: format(d, "EEEE, dd MMM yyyy"),
        confidence: 0.9,
        rawMatched: thisDayMatch[0],
      };
    }
  }

  // 6. "next week" / "end of next week"
  if (/\bnext\s+week\b/i.test(normalized)) {
    // defaults to next Friday
    const d = nextDay(addWeeks(today, 1), 5 as Day);
    return {
      date: format(d, "yyyy-MM-dd"),
      formattedText: format(d, "dd MMM yyyy") + " (Next Week)",
      confidence: 0.85,
      rawMatched: "next week",
    };
  }

  // 7. Explicit ISO Date (YYYY-MM-DD)
  const isoMatch = normalized.match(/\b(202[4-9])-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    const candidate = new Date(isoMatch[0]);
    if (isValid(candidate)) {
      return {
        date: isoMatch[0],
        formattedText: format(candidate, "dd MMM yyyy"),
        confidence: 1.0,
        rawMatched: isoMatch[0],
      };
    }
  }

  // 8. DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = normalized.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](202[4-9])\b/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, "0");
    const month = dmyMatch[2].padStart(2, "0");
    const year = dmyMatch[3];
    const candidate = new Date(`${year}-${month}-${day}`);
    if (isValid(candidate)) {
      return {
        date: `${year}-${month}-${day}`,
        formattedText: format(candidate, "dd MMM yyyy"),
        confidence: 1.0,
        rawMatched: dmyMatch[0],
      };
    }
  }

  return { confidence: 0 };
}

export const parseNaturalDate = parseNeedByDate;
