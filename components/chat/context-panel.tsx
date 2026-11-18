"use client";

import * as React from "react";
import Link from "next/link";
import {
  Package,
  Layers,
  MapPin,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  FileCheck2,
  XCircle,
  TrendingUp,
  Pencil,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface ContextPanelProps {
  conversation: any;
  onConfirm: () => void;
  onCancel: () => void;
  onQuickUpdate?: (messageText: string) => void;
  isConfirming?: boolean;
  isCancelling?: boolean;
  className?: string;
}

export function ContextPanel({
  conversation,
  onConfirm,
  onCancel,
  onQuickUpdate,
  isConfirming = false,
  isCancelling = false,
  className,
}: ContextPanelProps) {
  const [editingField, setEditingField] = React.useState<
    "quantity" | "plant" | "date" | null
  >(null);
  const [editQty, setEditQty] = React.useState("");

  if (!conversation) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center p-6 text-center text-[#6B7280]",
          className
        )}
      >
        <Package className="h-8 w-8 mb-2 opacity-40 text-[#6B7280]" />
        <p className="text-xs font-medium text-[#171717]">No active requisition thread</p>
        <p className="text-[11px] text-[#6B7280] mt-1">
          Start typing in the chat to extract requisition parameters.
        </p>
      </div>
    );
  }

  const collected = conversation.collectedData || {};
  const state: string = conversation.state || "STARTED";
  const isConfirmed = state === "CONFIRMED";
  const isCancelled = state === "CANCELLED";
  const isEditable = !isConfirmed && !isCancelled && Boolean(onQuickUpdate);
  const isReadyForConfirmation =
    !isConfirmed &&
    !isCancelled &&
    collected.quantity &&
    collected.plantCode &&
    (collected.itemCode || collected.originalDescription);

  const formatCurrency = (val?: number) => {
    if (val === undefined || val === null) return "—";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(val);
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "Not specified";
    try {
      const d = new Date(dateStr);
      return isNaN(d.getTime())
        ? dateStr
        : d.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          });
    } catch {
      return dateStr;
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-[#FFFFFF] border-l border-[#EAEAEA] text-[#171717] text-xs",
        className
      )}
    >
      {/* Header */}
      <div className="p-4 border-b border-[#EAEAEA] bg-[#FAFAFC]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-bold text-xs text-[#171717]">
            <Layers className="h-3.5 w-3.5 text-[#6938EF]" />
            <span>Requisition Summary</span>
          </div>
          <Badge
            variant={
              isConfirmed
                ? "success"
                : isCancelled
                ? "destructive"
                : isReadyForConfirmation
                ? "default"
                : "secondary"
            }
            className="text-[10px] uppercase font-mono px-2 py-0.5"
          >
            {state.replace(/_/g, " ")}
          </Badge>
        </div>

        {/* Clear Success Banner After PR Creation */}
        {conversation.createdPrNo && (
          <div className="mt-3 p-3 rounded-2xl bg-[#D9FAF5] border border-teal-300/60 text-[#171717] space-y-2">
            <div className="flex items-center justify-between font-mono text-xs">
              <span className="font-semibold flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                PR Created:
              </span>
              <span className="font-bold">{conversation.createdPrNo}</span>
            </div>
            <Link
              href="/requisitions"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#6938EF] hover:underline"
            >
              <span>View in Requisitions Registry</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}
      </div>

      {/* Structured Extraction Fields */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
        {/* Item Card */}
        <div className="rounded-2xl border border-[#EAEAEA] bg-[#FAFAFC] p-3 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-[#6B7280]">
            <span className="flex items-center gap-1 font-medium">
              <Package className="h-3 w-3 text-[#6938EF]" />
              Requested Item
            </span>
            {collected.itemCode ? (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-[#D9FAF5] text-[#171717] font-semibold">
                {collected.itemCode}
              </span>
            ) : collected.originalDescription ? (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-[#FFF2CC] text-[#171717] font-semibold">
                Custom Item
              </span>
            ) : (
              <span className="text-[10px] text-[#6B7280]">Pending</span>
            )}
          </div>

          <div className="font-semibold text-xs text-[#171717]">
            {collected.matchedItem?.description ||
              collected.originalDescription || (
                <span className="text-[#6B7280] font-normal italic">
                  Describe the item in chat...
                </span>
              )}
          </div>

          {collected.matchedItem?.category && (
            <div className="text-[11px] text-[#6B7280]">
              Category: {collected.matchedItem.category}
            </div>
          )}
        </div>

        {/* Quantity & Unit (with Quick Edit) */}
        <div className="rounded-2xl border border-[#EAEAEA] bg-[#FAFAFC] p-3 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-[#6B7280]">
            <span className="font-medium">Quantity &amp; UOM</span>
            {isEditable && (
              <button
                type="button"
                onClick={() => {
                  setEditQty(String(collected.quantity || ""));
                  setEditingField(editingField === "quantity" ? null : "quantity");
                }}
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#6938EF] hover:underline"
              >
                <Pencil className="h-2.5 w-2.5" />
                <span>Edit</span>
              </button>
            )}
          </div>

          {editingField === "quantity" && onQuickUpdate ? (
            <div className="flex items-center gap-1.5 pt-1">
              <Input
                type="number"
                min={1}
                placeholder="e.g. 200"
                value={editQty}
                onChange={(e) => setEditQty(e.target.value)}
                className="h-7 text-xs font-mono"
              />
              <Button
                size="sm"
                className="h-7 text-[11px] px-2.5 bg-[#6938EF] text-white"
                onClick={() => {
                  if (editQty.trim()) {
                    onQuickUpdate(
                      `${editQty.trim()} ${
                        collected.uom || collected.matchedItem?.uom || "NOS"
                      }`
                    );
                  }
                  setEditingField(null);
                }}
              >
                Apply
              </Button>
            </div>
          ) : (
            <div className="font-bold text-xs text-[#171717] font-mono">
              {collected.quantity !== undefined ? (
                `${collected.quantity} ${
                  collected.uom || collected.matchedItem?.uom || "NOS"
                }`
              ) : (
                <span className="text-[#6B7280] font-normal italic">Not specified</span>
              )}
            </div>
          )}
        </div>

        {/* Plant (with Quick Toggle Edit) */}
        <div className="rounded-2xl border border-[#EAEAEA] bg-[#FAFAFC] p-3 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-[#6B7280]">
            <span className="flex items-center gap-1 font-medium">
              <MapPin className="h-3 w-3 text-[#6938EF]" />
              Delivery Plant
            </span>
            {isEditable && (
              <button
                type="button"
                onClick={() =>
                  setEditingField(editingField === "plant" ? null : "plant")
                }
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#6938EF] hover:underline"
              >
                <Pencil className="h-2.5 w-2.5" />
                <span>Change</span>
              </button>
            )}
          </div>

          {editingField === "plant" && onQuickUpdate ? (
            <div className="flex items-center gap-1.5 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] flex-1"
                onClick={() => {
                  onQuickUpdate("PUN1 Bhosari plant");
                  setEditingField(null);
                }}
              >
                PUN1 (Bhosari)
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] flex-1"
                onClick={() => {
                  onQuickUpdate("CHK1 Chakan plant");
                  setEditingField(null);
                }}
              >
                CHK1 (Chakan)
              </Button>
            </div>
          ) : (
            <div className="font-bold text-xs text-[#171717] font-mono">
              {collected.plantCode ? (
                `${collected.plantCode} (${collected.plantName || "Plant"})`
              ) : (
                <span className="text-[#6B7280] font-normal italic">Not specified</span>
              )}
            </div>
          )}
        </div>

        {/* Date & Urgency */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-2xl border border-[#EAEAEA] bg-[#FAFAFC] p-3 space-y-1">
            <div className="flex items-center justify-between text-[11px] text-[#6B7280]">
              <span className="flex items-center gap-1 font-medium">
                <Calendar className="h-3 w-3 text-[#6938EF]" />
                Need By
              </span>
              {isEditable && (
                <button
                  type="button"
                  onClick={() =>
                    setEditingField(editingField === "date" ? null : "date")
                  }
                  className="text-[10px] font-semibold text-[#6938EF] hover:underline"
                >
                  Edit
                </button>
              )}
            </div>
            {editingField === "date" && onQuickUpdate ? (
              <Input
                type="date"
                className="h-7 text-[11px] font-mono mt-1"
                onChange={(e) => {
                  if (e.target.value) {
                    onQuickUpdate(`by ${e.target.value}`);
                    setEditingField(null);
                  }
                }}
              />
            ) : (
              <div className="font-semibold text-xs text-[#171717]">
                {formatDate(collected.needByDate)}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[#EAEAEA] bg-[#FAFAFC] p-3 space-y-1">
            <div className="text-[11px] text-[#6B7280] flex items-center gap-1 font-medium">
              <AlertTriangle className="h-3 w-3 text-[#6938EF]" />
              Urgency
            </div>
            <div>
              <span
                className={cn(
                  "inline-block rounded-md px-2 py-0.5 text-[10px] font-bold",
                  collected.urgency === "Emergency"
                    ? "bg-[#FCE3EF] text-[#171717]"
                    : collected.urgency === "Urgent"
                    ? "bg-[#FFF2CC] text-[#171717]"
                    : "bg-[#DDF3FF] text-[#171717]"
                )}
              >
                {collected.urgency || "Normal"}
              </span>
            </div>
          </div>
        </div>

        {/* Estimated Pricing */}
        {collected.matchedItem?.standardPrice && collected.quantity ? (
          <div className="rounded-2xl bg-[#FFF2CC]/70 border border-[#EAEAEA] p-3 space-y-1">
            <div className="flex items-center justify-between text-[11px] text-[#171717]/80">
              <span className="flex items-center gap-1 font-semibold">
                <TrendingUp className="h-3 w-3" />
                Estimated Value
              </span>
              <span className="font-mono text-[10px]">
                @ {formatCurrency(collected.matchedItem.standardPrice)} /{" "}
                {collected.uom || "unit"}
              </span>
            </div>
            <div className="text-base font-bold text-[#171717] font-mono">
              {formatCurrency(collected.estimatedTotal)}
            </div>
          </div>
        ) : null}

        <Separator />

        {/* Readiness Checklist */}
        <div className="space-y-2">
          <div className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">
            Requisition Readiness
          </div>
          <div className="space-y-1.5">
            {[
              {
                id: "item",
                label: "Material or Item identified",
                done: !!(collected.itemCode || collected.originalDescription),
              },
              {
                id: "quantity",
                label: "Quantity and UOM specified",
                done: typeof collected.quantity === "number" && collected.quantity > 0,
              },
              {
                id: "plant",
                label: "Destination Plant designated",
                done: !!collected.plantCode,
              },
              {
                id: "date",
                label: "Target delivery date determined",
                done: !!collected.needByDate,
              },
            ].map((check) => (
              <div
                key={check.id}
                className="flex items-center gap-2 text-[11px] text-[#6B7280]"
              >
                {check.done ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <HelpCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                )}
                <span className={cn(check.done && "text-[#171717] font-medium")}>
                  {check.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Actions */}
      {!isConfirmed && !isCancelled && (
        <div className="p-4 border-t border-[#EAEAEA] bg-[#FFFFFF] space-y-2">
          {isReadyForConfirmation ? (
            <Button
              className="w-full rounded-xl text-xs h-9 gap-1.5 bg-[#6938EF] hover:bg-[#5928DF] text-white font-semibold shadow-xs"
              onClick={onConfirm}
              disabled={isConfirming || isCancelling}
            >
              <FileCheck2 className="h-4 w-4" />
              <span>{isConfirming ? "Creating PR..." : "Confirm & Submit PR"}</span>
            </Button>
          ) : (
            <div className="text-[11px] text-[#6B7280] text-center py-1">
              Answer the guided prompt in chat to complete your PR
            </div>
          )}

          <Button
            variant="ghost"
            className="w-full rounded-xl text-xs h-8 text-[#6B7280] hover:text-destructive hover:bg-destructive/10"
            onClick={onCancel}
            disabled={isConfirming || isCancelling}
          >
            <XCircle className="h-3.5 w-3.5 mr-1" />
            Cancel Request
          </Button>
        </div>
      )}
    </div>
  );
}
