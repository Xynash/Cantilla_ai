"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Fatal Application Error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center p-6 bg-slate-50 text-slate-900 font-sans">
        <div className="max-w-md w-full rounded-lg border border-slate-200 bg-white p-6 shadow-sm text-center">
          <h2 className="text-base font-semibold text-slate-900">
            Cantill.ai System Error
          </h2>
          <p className="mt-2 text-xs text-slate-600">
            A critical system error occurred. Please refresh or contact your administrator.
          </p>
          <div className="mt-4">
            <button
              onClick={() => reset()}
              className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
            >
              Reload Platform
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
