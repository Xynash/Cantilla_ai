"use client";

import * as React from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "success" | "warning" | "destructive";
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  toast: (toast: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    ({ duration = 4000, ...rest }: Omit<Toast, "id">) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newToast: Toast = { id, duration, ...rest };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          dismiss(id);
        }, duration);
      }
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex max-w-md flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex w-80 items-start gap-3 rounded-lg border bg-card p-3.5 shadow-lg transition-all animate-in slide-in-from-bottom-5",
              t.variant === "destructive" && "border-destructive/30 bg-destructive/5 text-destructive",
              t.variant === "success" && "border-emerald-500/30 bg-emerald-500/5 text-emerald-950 dark:text-emerald-200",
              t.variant === "warning" && "border-amber-500/30 bg-amber-500/5 text-amber-950 dark:text-amber-200",
              (!t.variant || t.variant === "default") && "border-border bg-card text-card-foreground"
            )}
          >
            {t.variant === "success" && (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
            )}
            {t.variant === "destructive" && (
              <AlertCircle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
            )}
            {(!t.variant || t.variant === "default") && (
              <Info className="h-4 w-4 shrink-0 text-primary mt-0.5" />
            )}
            <div className="flex-1 space-y-0.5">
              <p className="text-xs font-semibold leading-none text-foreground">{t.title}</p>
              {t.description && (
                <p className="text-xs text-muted-foreground leading-tight">{t.description}</p>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
