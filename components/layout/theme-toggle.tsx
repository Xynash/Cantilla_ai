"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            className="text-muted-foreground hover:text-foreground h-8 w-8"
            aria-label="Toggle visual theme"
          >
            {resolvedTheme === "dark" ? (
              <Sun className="h-4 w-4 transition-transform rotate-0 scale-100" />
            ) : (
              <Moon className="h-4 w-4 transition-transform rotate-0 scale-100" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <span>Switch to {resolvedTheme === "dark" ? "light" : "dark"} mode</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
