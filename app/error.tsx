"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global Error Caught:", error);
  }, [error]);

  return (
    <div className="flex min-h-[450px] flex-col items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-4">
        <AlertCircle className="h-6 w-6" />
      </div>
      <h2 className="text-base font-semibold text-foreground">
        Workspace Application Error
      </h2>
      <p className="mt-1 max-w-md text-xs text-muted-foreground leading-relaxed">
        An unexpected error occurred while rendering this procurement view.
        {error.digest && (
          <span className="block mt-1 font-mono text-[10px] text-muted-foreground/70">
            Digest: {error.digest}
          </span>
        )}
      </p>
      <div className="mt-5 flex gap-2">
        <Button size="sm" variant="outline" onClick={() => reset()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Retry Request
        </Button>
      </div>
    </div>
  );
}
