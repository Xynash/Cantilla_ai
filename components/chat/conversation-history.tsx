"use client";

import * as React from "react";
import { Plus, MessageSquare, CheckCircle, XCircle, Clock, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface ConversationSummary {
  id: string;
  conversationId: string;
  title: string;
  state: string;
  requesterName?: string;
  createdPrNo?: string;
  itemDescription?: string;
  updatedAt: string;
}

interface ConversationHistoryProps {
  conversations: ConversationSummary[];
  activeId?: string;
  onSelect: (convId: string) => void;
  onNew: () => void;
  isLoading?: boolean;
  className?: string;
}

export function ConversationHistory({
  conversations,
  activeId,
  onSelect,
  onNew,
  isLoading = false,
  className,
}: ConversationHistoryProps) {
  return (
    <div
      className={cn(
        "flex flex-col h-full bg-card/60 border-r border-border text-foreground text-xs",
        className
      )}
    >
      {/* Header with New Chat Button */}
      <div className="p-3 border-b border-border bg-muted/20">
        <Button
          onClick={onNew}
          className="w-full text-xs h-8 gap-1.5 shadow-xs"
          disabled={isLoading}
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New Requisition Intake</span>
        </Button>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Recent Intake Threads
        </div>

        {conversations.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-xs italic">
            No previous sessions
          </div>
        ) : (
          conversations.map((conv) => {
            const isActive = conv.conversationId === activeId;
            const isConfirmed = conv.state === "CONFIRMED";
            const isCancelled = conv.state === "CANCELLED";

            return (
              <button
                key={conv.conversationId}
                type="button"
                onClick={() => onSelect(conv.conversationId)}
                className={cn(
                  "w-full text-left p-2.5 rounded-lg border transition-all text-xs flex flex-col space-y-1.5 group",
                  isActive
                    ? "bg-accent/80 border-border shadow-xs text-foreground font-medium"
                    : "border-transparent hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                )}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-semibold truncate text-[11px] text-foreground">
                    {conv.itemDescription || conv.title || "Requisition"}
                  </span>
                  <Badge
                    variant={
                      isConfirmed
                        ? "success"
                        : isCancelled
                        ? "destructive"
                        : "secondary"
                    }
                    className="text-[9px] px-1 py-0 uppercase font-mono"
                  >
                    {isConfirmed ? "Confirmed" : isCancelled ? "Cancelled" : "Draft"}
                  </Badge>
                </div>

                {conv.createdPrNo ? (
                  <div className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                    {conv.createdPrNo}
                  </div>
                ) : (
                  <div className="text-[10px] text-muted-foreground truncate">
                    ID: {conv.conversationId.slice(0, 16)}...
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
