"use client";

import * as React from "react";
import { Send, Eraser, Info, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  disabled?: boolean;
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  onClear,
  disabled = false,
}: ChatInputProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled) {
        onSubmit();
      }
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-2">
      <div className="relative rounded-lg border border-border bg-card shadow-xs transition-all focus-within:border-foreground/40 focus-within:ring-1 focus-within:ring-ring">
        <textarea
          ref={textareaRef}
          rows={2}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="State your item, quantity, plant, and need-by date (e.g. 'I need 200 nitrile gloves for Chakan plant by next Friday')..."
          disabled={disabled}
          className="w-full resize-none bg-transparent p-3 pb-11 text-xs placeholder:text-muted-foreground focus:outline-none"
        />

        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between border-t border-border/50 pt-2">
          <div className="flex items-center gap-1">
            {value.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClear}
                className="text-muted-foreground hover:text-foreground h-6 px-2 text-[11px]"
                title="Clear input"
                aria-label="Clear input"
              >
                <Eraser className="h-3 w-3 mr-1" />
                Clear
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground hidden sm:inline">
              Press <kbd className="rounded border bg-muted px-1 font-mono">Enter ↵</kbd> to submit
            </span>
            <Button
              type="button"
              size="sm"
              onClick={onSubmit}
              disabled={!value.trim() || disabled}
              className="h-7 px-3 text-xs gap-1.5"
            >
              <span>Submit</span>
              <Send className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <Sparkles className="h-3 w-3 text-primary shrink-0" />
        <span>
          Deterministic item catalog lookup, plant normalization &amp; date parsing active.
        </span>
      </div>
    </div>
  );
}
