"use client";

import { Sparkles, ArrowRight } from "lucide-react";

interface ChatSuggestionsProps {
  onSelectSuggestion: (text: string) => void;
}

export const INTAKE_SUGGESTIONS = [
  {
    title: "Consumables Requisition",
    prompt: "I need 200 nitrile gloves for the Chakan plant by next Friday.",
    category: "Safety / PPE",
  },
  {
    title: "Urgent Maintenance Spares",
    prompt: "Need 50 bearing 6308 ZZ for Pune plant urgently by tomorrow",
    category: "Mechanical",
  },
  {
    title: "Raw Material Intake",
    prompt: "Order 15 MS sheet 3mm 1250x2500 for Chakan plant by end of next week",
    category: "Raw Material",
  },
  {
    title: "Facility Services",
    prompt: "I require 2 monthly housekeeping services for Bhosari plant by 1st of next month",
    category: "Services",
  },
];

export function ChatSuggestions({ onSelectSuggestion }: ChatSuggestionsProps) {
  return (
    <div className="w-full max-w-2xl mx-auto space-y-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span>Try conversational procurement intake</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {INTAKE_SUGGESTIONS.map((item) => (
          <button
            key={item.title}
            type="button"
            onClick={() => onSelectSuggestion(item.prompt)}
            className="group flex flex-col justify-between rounded-lg border border-border bg-card p-3 text-left transition-all hover:border-foreground/30 hover:bg-muted/40 active:scale-[0.99]"
          >
            <div className="flex items-center justify-between w-full mb-1">
              <span className="text-[11px] font-semibold text-foreground group-hover:text-primary">
                {item.title}
              </span>
              <span className="text-[10px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground font-mono">
                {item.category}
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-snug line-clamp-2">
              "{item.prompt}"
            </p>
            <div className="mt-2 flex items-center text-[11px] font-medium text-muted-foreground/80 group-hover:text-foreground">
              <span>Send prompt</span>
              <ArrowRight className="ml-1 h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
