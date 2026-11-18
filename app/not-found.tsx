import Link from "next/link";
import { FileQuestion, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[450px] flex-col items-center justify-center rounded-lg border border-border bg-card p-8 text-center shadow-xs">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground mb-4">
        <FileQuestion className="h-6 w-6" />
      </div>
      <h2 className="text-base font-semibold text-foreground">
        Resource Not Found
      </h2>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground leading-relaxed">
        The requested procurement document, route, or workspace entity does not exist or has been relocated.
      </p>
      <div className="mt-5">
        <Button size="sm" asChild>
          <Link href="/">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Return to Overview
          </Link>
        </Button>
      </div>
    </div>
  );
}
