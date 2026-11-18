"use client";

import * as React from "react";
import { MessageSquareText, PanelLeft, PanelRight, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ChatMessageList, ChatMessageItem } from "./chat-message-list";
import { ChatInput } from "./chat-input";
import { ChatSuggestions } from "./chat-suggestions";
import { ContextPanel } from "./context-panel";
import { ConversationHistory, ConversationSummary } from "./conversation-history";

export function ChatWorkspace() {
  const [conversations, setConversations] = React.useState<ConversationSummary[]>([]);
  const [activeConversation, setActiveConversation] = React.useState<any>(null);
  const [input, setInput] = React.useState("");
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [isLoadingList, setIsLoadingList] = React.useState(false);
  const [isConfirming, setIsConfirming] = React.useState(false);
  const [isCancelling, setIsCancelling] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(true);
  const [showContext, setShowContext] = React.useState(true);
  const [mobileHistoryOpen, setMobileHistoryOpen] = React.useState(false);
  const [mobileContextOpen, setMobileContextOpen] = React.useState(false);
  const { toast } = useToast();

  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [activeConversation?.messages]);

  // Load user conversation list
  const loadConversations = React.useCallback(async () => {
    setIsLoadingList(true);
    try {
      const res = await fetch("/api/chat/conversations");
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setConversations(json.data);
        return json.data;
      }
    } catch (err) {
      console.error("Failed to load conversations:", err);
    } finally {
      setIsLoadingList(false);
    }
    return [];
  }, []);

  // Load a single conversation by conversationId
  const selectConversation = React.useCallback(
    async (convId: string) => {
      try {
        const res = await fetch(`/api/chat/conversations/${convId}`);
        const json = await res.json();
        if (json.success && json.data) {
          setActiveConversation(json.data);
        } else {
          toast({
            title: "Error",
            description: json.error?.message || "Failed to load conversation",
            variant: "destructive",
          });
        }
      } catch (err) {
        console.error("Failed to fetch conversation:", err);
      }
    },
    [toast]
  );

  // Create a brand new conversation
  const handleNewConversation = React.useCallback(async () => {
    try {
      setIsProcessing(true);
      const res = await fetch("/api/chat/conversations", {
        method: "POST",
      });
      const json = await res.json();
      if (json.success && json.data) {
        setActiveConversation(json.data);
        await loadConversations();
        toast({
          title: "New Intake Thread",
          description: "New purchase requisition session started.",
        });
      }
    } catch (err) {
      console.error("Failed to create conversation:", err);
      toast({
        title: "Error",
        description: "Failed to initialize new conversation thread",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  }, [loadConversations, toast]);

  // Initial load
  React.useEffect(() => {
    (async () => {
      const list = await loadConversations();
      if (list && list.length > 0) {
        await selectConversation(list[0].conversationId);
      } else {
        await handleNewConversation();
      }
    })();
  }, [loadConversations, selectConversation, handleNewConversation]);

  // Send message
  const handleSendMessage = async (textToSend?: string) => {
    const messageText = (textToSend || input).trim();
    if (!messageText || isProcessing || !activeConversation) return;

    // Optimistic local update
    const optimisticUserMsg: ChatMessageItem = {
      id: Math.random().toString(36).substring(2, 9),
      role: "user",
      content: messageText,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setActiveConversation((prev: any) => ({
      ...prev,
      messages: [...(prev?.messages || []), optimisticUserMsg],
    }));

    if (!textToSend) setInput("");
    setIsProcessing(true);

    try {
      const res = await fetch(
        `/api/chat/conversations/${activeConversation.conversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: messageText }),
        }
      );

      const json = await res.json();
      if (json.success && json.data) {
        setActiveConversation(json.data);
        await loadConversations();
      } else {
        toast({
          title: "Intake Error",
          description: json.error?.message || "Failed to process message",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Error sending message:", err);
      toast({
        title: "Network Error",
        description: "Could not deliver message to the intake service",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Confirm Requisition
  const handleConfirmRequisition = async () => {
    if (!activeConversation || isConfirming) return;
    setIsConfirming(true);

    try {
      const res = await fetch(
        `/api/chat/conversations/${activeConversation.conversationId}/confirm`,
        { method: "POST" }
      );
      const json = await res.json();
      if (json.success && json.data) {
        setActiveConversation(json.data.conversation);
        await loadConversations();
        toast({
          title: "PR Generated Successfully",
          description: `Purchase Requisition ${json.data.prNo} recorded into database!`,
          variant: "default",
        });
      } else {
        toast({
          title: "Confirmation Error",
          description: json.error?.message || "Failed to confirm requisition",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Error confirming requisition:", err);
      toast({
        title: "Network Error",
        description: "Could not confirm requisition",
        variant: "destructive",
      });
    } finally {
      setIsConfirming(false);
    }
  };

  // Cancel Request
  const handleCancelRequisition = async () => {
    if (!activeConversation || isCancelling) return;
    setIsCancelling(true);

    try {
      const res = await fetch(
        `/api/chat/conversations/${activeConversation.conversationId}/cancel`,
        { method: "POST" }
      );
      const json = await res.json();
      if (json.success && json.data) {
        setActiveConversation(json.data);
        await loadConversations();
        toast({
          title: "Request Cancelled",
          description: "Intake request has been cancelled.",
          variant: "default",
        });
      }
    } catch (err) {
      console.error("Error cancelling requisition:", err);
    } finally {
      setIsCancelling(false);
    }
  };

  const messages: ChatMessageItem[] = activeConversation?.messages || [];
  const state: string = activeConversation?.state || "STARTED";

  const handleToggleHistory = () => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setMobileHistoryOpen((prev) => !prev);
      setMobileContextOpen(false);
    } else {
      setShowHistory((prev) => !prev);
    }
  };

  const handleToggleContext = () => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setMobileContextOpen((prev) => !prev);
      setMobileHistoryOpen(false);
    } else {
      setShowContext((prev) => !prev);
    }
  };

  return (
    <div className="relative flex h-[calc(100vh-10rem)] min-h-[580px] rounded-2xl border border-[#EAEAEA] bg-white overflow-hidden shadow-xs">
      {/* 1. Desktop Left History Sidebar (Collapsible on md+) */}
      {showHistory && (
        <div className="w-64 shrink-0 hidden md:block border-r border-[#EAEAEA]">
          <ConversationHistory
            conversations={conversations}
            activeId={activeConversation?.conversationId}
            onSelect={selectConversation}
            onNew={handleNewConversation}
            isLoading={isLoadingList || isProcessing}
          />
        </div>
      )}

      {/* Mobile Left History Slide-Over (< md) */}
      {mobileHistoryOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            onClick={() => setMobileHistoryOpen(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs"
          />
          <div className="relative z-10 flex w-72 max-w-[85vw] flex-col bg-white border-r border-[#EAEAEA] shadow-xl">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#EAEAEA]">
              <span className="text-xs font-semibold text-[#171717]">
                Intake Sessions
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setMobileHistoryOpen(false)}
                className="h-7 w-7"
                aria-label="Close intake sessions"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ConversationHistory
                conversations={conversations}
                activeId={activeConversation?.conversationId}
                onSelect={(convId) => {
                  selectConversation(convId);
                  setMobileHistoryOpen(false);
                }}
                onNew={() => {
                  handleNewConversation();
                  setMobileHistoryOpen(false);
                }}
                isLoading={isLoadingList || isProcessing}
              />
            </div>
          </div>
        </div>
      )}

      {/* 2. Middle Main Chat Column */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Workspace Toolbar */}
        <div className="flex h-12 items-center justify-between border-b border-[#EAEAEA] px-3 sm:px-4 bg-white shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleToggleHistory}
              className="text-muted-foreground hover:text-foreground h-7 w-7"
              title="Toggle intake sessions"
              aria-label="Toggle intake sessions"
            >
              <PanelLeft className="h-4 w-4" />
            </Button>

            <MessageSquareText className="h-4 w-4 text-[#6938EF] shrink-0" />
            <span className="text-xs font-semibold text-foreground truncate">
              {activeConversation?.title || "Procurement Intake Assistant"}
            </span>

            <Badge
              variant={
                state === "CONFIRMED"
                  ? "success"
                  : state === "CANCELLED"
                  ? "destructive"
                  : "secondary"
              }
              className="text-[9px] uppercase font-mono px-1.5 py-0 shrink-0 hidden sm:inline-flex"
            >
              {state.replace(/_/g, " ")}
            </Badge>

            {activeConversation?.createdPrNo && (
              <Badge
                variant="outline"
                className="text-[10px] font-mono text-emerald-600 font-semibold border-emerald-500/30"
              >
                PR: {activeConversation.createdPrNo}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleNewConversation}
              className="h-7 text-xs gap-1 rounded-lg"
              disabled={isProcessing}
            >
              <Plus className="h-3 w-3" />
              <span className="hidden sm:inline">New Intake</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleContext}
              className="h-7 text-xs gap-1.5 rounded-lg px-2"
              title="Toggle requisition context panel"
              aria-label="Toggle requisition context panel"
            >
              <PanelRight className="h-3.5 w-3.5 text-[#6938EF]" />
              <span className="text-[11px] font-medium lg:hidden">PR Details</span>
            </Button>
          </div>
        </div>

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 bg-[#FAFAFC]">
          {messages.length <= 1 && (
            <div className="mb-4">
              <ChatSuggestions onSelectSuggestion={(text) => handleSendMessage(text)} />
            </div>
          )}

          <ChatMessageList
            messages={messages}
            onSelectOption={(val) => handleSendMessage(val)}
            onConfirm={handleConfirmRequisition}
            onCancel={handleCancelRequisition}
            isProcessing={isProcessing || isConfirming || isCancelling}
          />
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="border-t border-[#EAEAEA] bg-white p-3 sm:p-4 shrink-0">
          <ChatInput
            value={input}
            onChange={setInput}
            onSubmit={() => handleSendMessage()}
            onClear={() => setInput("")}
            disabled={isProcessing || state === "CONFIRMED" || state === "CANCELLED"}
          />
        </div>
      </div>

      {/* 3. Desktop Right Context Panel (Collapsible on lg+) */}
      {showContext && (
        <div className="w-80 shrink-0 hidden lg:block border-l border-[#EAEAEA]">
          <ContextPanel
            conversation={activeConversation}
            onConfirm={handleConfirmRequisition}
            onCancel={handleCancelRequisition}
            onQuickUpdate={(text) => handleSendMessage(text)}
            isConfirming={isConfirming}
            isCancelling={isCancelling}
          />
        </div>
      )}

      {/* Mobile & Tablet Right Context Drawer (< lg) */}
      {mobileContextOpen && (
        <div className="fixed inset-0 z-50 flex justify-end lg:hidden">
          <div
            onClick={() => setMobileContextOpen(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs"
          />
          <div className="relative z-10 flex w-80 max-w-[90vw] flex-col bg-white border-l border-[#EAEAEA] shadow-xl">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#EAEAEA]">
              <span className="text-xs font-semibold text-[#171717]">
                Requisition Context &amp; Summary
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setMobileContextOpen(false)}
                className="h-7 w-7"
                aria-label="Close context panel"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ContextPanel
                conversation={activeConversation}
                onConfirm={async () => {
                  await handleConfirmRequisition();
                  setMobileContextOpen(false);
                }}
                onCancel={async () => {
                  await handleCancelRequisition();
                  setMobileContextOpen(false);
                }}
                onQuickUpdate={(text) => {
                  handleSendMessage(text);
                  setMobileContextOpen(false);
                }}
                isConfirming={isConfirming}
                isCancelling={isCancelling}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
