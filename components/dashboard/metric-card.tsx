import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MetricCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  value?: string | number;
  badgeLabel?: string;
  emptyLabel?: string;
  category: string;
  className?: string;
}

export function MetricCard({
  title,
  description,
  icon: Icon,
  value,
  badgeLabel,
  emptyLabel = "0 records",
  category,
  className,
}: MetricCardProps) {
  const hasValue = value !== undefined && value !== null && value !== "";

  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-all hover:border-foreground/20",
        className
      )}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {category}
            </span>
            <h4 className="text-sm font-semibold text-foreground tracking-tight">
              {title}
            </h4>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted/50 text-muted-foreground">
            <Icon className="h-4 w-4" />
          </div>
        </div>

        <div className="mt-4 flex items-baseline justify-between">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl font-semibold tracking-tight text-foreground">
              {hasValue ? value : "0"}
            </span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {badgeLabel || emptyLabel}
            </span>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-border/60">
          <p className="text-[11px] text-muted-foreground leading-tight">
            {description}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
