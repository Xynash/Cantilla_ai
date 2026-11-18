import { Metadata } from "next";
import { ChatWorkspace } from "@/components/chat/chat-workspace";

export const metadata: Metadata = {
  title: "Procurement Chat",
  description: "Conversational intake and procurement guidance workspace.",
};

export default function ChatPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          Procurement Chat
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Conversational intake orchestration, compliance checking, and guidance workspace
        </p>
      </div>

      <ChatWorkspace />
    </div>
  );
}
