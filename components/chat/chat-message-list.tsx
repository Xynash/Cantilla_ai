"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Bot,
  User,
  Clock,
  ShieldAlert,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChatMessageItem {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  clarificationType?: "item" | "quantity" | "plant" | "date" | "urgency" | "confirmation";
  options?: Array<{
    label: string;
    value: string;
    metadata?: any;
  }>;
  metadata?: Record<string, any>;
}

interface ChatMessageListProps {
  messages: ChatMessageItem[];
  onSelectOption?: (val: string) => void;
  onConfirm?: () => void;
  onCancel?: () => void;
  isProcessing?: boolean;
}

export function ChatMessageList({
  messages,
  onSelectOption,
  onConfirm,
  onCancel,
  isProcessing = false,
}: ChatMessageListProps) {
  return (
    <div className="space-y-4 py-2 max-w-3xl mx-auto w-full">
      {messages.map((message, idx) => {
        const isUser = message.role === "user";
        const isSystem = message.role === "system";
        const isLastMessage = idx === messages.length - 1;

        return (
          <div
            key={message.id || idx}
            className={cn(
              "flex gap-3 text-sm animate-in fade-in-50",
              isUser ? "flex-row-reverse" : "flex-row"
            )}
          >
            {/* Avatar */}
            <Avatar className="h-7 w-7 mt-0.5 shrink-0 ring-1 ring-border">
              <AvatarFallback
                className={cn(
                  "text-xs font-semibold",
                  isUser
                    ? "bg-primary text-primary-foreground"
                    : isSystem
                    ? "bg-amber-500/10 text-amber-700"
                    : "bg-muted text-foreground"
                )}
              >
                {isUser ? (
                  <User className="h-3.5 w-3.5" />
                ) : isSystem ? (
                  <ShieldAlert className="h-3.5 w-3.5" />
                ) : (
                  <Bot className="h-3.5 w-3.5 text-primary" />
                )}
              </AvatarFallback>
            </Avatar>

            {/* Bubble */}
            <div
              className={cn(
                "flex flex-col space-y-1.5 max-w-[85%]",
                isUser ? "items-end" : "items-start"
              )}
            >
              <div className="flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {isUser ? "You" : isSystem ? "System Notice" : "Cantill Intake Agent"}
                </span>
                <span className="flex items-center gap-1 font-mono text-[10px]">
                  <Clock className="h-2.5 w-2.5" />
                  {message.timestamp}
                </span>
              </div>

              <div
                className={cn(
                  "rounded-lg px-3.5 py-2.5 text-xs leading-relaxed",
                  isUser
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : isSystem
                    ? "bg-amber-500/10 text-amber-900 dark:text-amber-200 border border-amber-500/20"
                    : "bg-card border border-border text-foreground shadow-xs"
                )}
              >
                <div className="whitespace-pre-wrap">{message.content}</div>

                {/* Clarification Options / Action Chips */}
                {message.options && message.options.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-border/50 space-y-1.5">
                    <span className="text-[10px] uppercase font-mono text-muted-foreground tracking-wider block">
                      Quick Selection:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {message.options.map((opt, optIdx) => (
                        <button
                          key={optIdx}
                          type="button"
                          onClick={() => onSelectOption?.(opt.value)}
                          disabled={isProcessing}
                          className="inline-flex items-center rounded-md border border-border bg-background/80 hover:bg-primary/10 hover:border-primary/40 px-2 py-1 text-[11px] font-medium text-foreground transition-all active:scale-[0.98] disabled:opacity-50"
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Confirmation Action Card */}
                {message.clarificationType === "confirmation" && isLastMessage && (
                  <div className="mt-3 pt-3 border-t border-border/60 flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={onConfirm}
                      disabled={isProcessing}
                      className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Confirm & Create PR</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onCancel}
                      disabled={isProcessing}
                      className="h-7 text-xs text-muted-foreground hover:text-destructive gap-1"
                    >
                      <XCircle className="h-3 w-3" />
                      <span>Cancel</span>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
