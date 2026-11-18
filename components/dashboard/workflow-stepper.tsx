import * as React from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { ArrowRight, CheckCircle2, CircleDashed } from "lucide-react";
import { PROCUREMENT_WORKFLOW_STEPS } from "@/config/constants";

export interface WorkflowOverviewProps {
  requisitionsCount?: number;
  activePolicyVersion?: string;
  activeSuppliersCount?: number;
  recentRunsCount?: number;
  proposedPosCount?: number;
}

export function WorkflowOverview({
  requisitionsCount = 0,
  activePolicyVersion = "5.0",
  activeSuppliersCount = 0,
  recentRunsCount = 0,
  proposedPosCount = 0,
}: WorkflowOverviewProps = {}) {
  const isStageActive = (stepNumber: number): boolean => {
    switch (stepNumber) {
      case 1:
        return true; // Requisition intake is always ready
      case 2:
        return Boolean(activePolicyVersion);
      case 3:
        return activeSuppliersCount > 0;
      case 4:
        return recentRunsCount > 0 || requisitionsCount > 0;
      case 5:
        return proposedPosCount > 0;
      default:
        return false;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          <div>
            <CardTitle className="text-sm font-semibold">
              End-to-End Procurement Workflow Pipeline
            </CardTitle>
            <CardDescription className="text-xs">
              Live stage status under Corvo Procurement Policy v{activePolicyVersion}
            </CardDescription>
          </div>
          <span className="self-start sm:self-auto rounded border border-border bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
            Policy v{activePolicyVersion}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {PROCUREMENT_WORKFLOW_STEPS.map((step, idx) => {
            const active = isStageActive(step.step);
            return (
              <div
                key={step.step}
                className="relative flex flex-col justify-between rounded-md border border-border/80 bg-background/50 p-3 text-left transition-all hover:bg-muted/30"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[10px] font-semibold text-muted-foreground uppercase">
                      Stage 0{step.step}
                    </span>
                    {active ? (
                      <span className="flex items-center text-[10px] text-emerald-600 font-medium">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Active
                      </span>
                    ) : (
                      <span className="flex items-center text-[10px] text-muted-foreground">
                        <CircleDashed className="h-3 w-3 mr-1" /> Standby
                      </span>
                    )}
                  </div>

                  <p className="text-xs font-semibold text-foreground">
                    {step.title}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </div>

                {idx < PROCUREMENT_WORKFLOW_STEPS.length - 1 && (
                  <div className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 z-10">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-background border border-border text-muted-foreground shadow-xs">
                      <ArrowRight className="h-2.5 w-2.5" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
