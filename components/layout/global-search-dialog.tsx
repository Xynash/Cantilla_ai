"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getAuthorizedSearchItems } from "@/config/navigation";
import { UserRole } from "@/types/auth";

export function GlobalSearchDialog() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const router = useRouter();
  const { data: session } = useSession();

  const userRole =
    ((session?.user as unknown as { role?: UserRole })?.role) || null;

  // Listen for Cmd+K / Ctrl+K
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const authorizedItems = React.useMemo(
    () => getAuthorizedSearchItems(userRole),
    [userRole]
  );

  const filteredItems = React.useMemo(() => {
    if (!query.trim()) return authorizedItems;
    const lower = query.toLowerCase();
    return authorizedItems.filter(
      (item) =>
        item.title.toLowerCase().includes(lower) ||
        item.description.toLowerCase().includes(lower) ||
        item.category.toLowerCase().includes(lower)
    );
  }, [authorizedItems, query]);

  const handleSelect = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-8 w-44 md:w-64 items-center justify-between rounded-md border border-input bg-background/50 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <span className="flex items-center gap-2">
          <Search className="h-3.5 w-3.5" />
          <span>Search workspace...</span>
        </span>
        <kbd className="pointer-events-none hidden select-none items-center gap-0.5 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl p-0 overflow-hidden">
          <DialogHeader className="border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Type a command or search sections..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-8 border-0 shadow-none focus-visible:ring-0 px-1 text-sm bg-transparent"
                autoFocus
              />
            </div>
          </DialogHeader>

          <div className="max-h-[340px] overflow-y-auto p-2">
            {filteredItems.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No matching navigation items found for &quot;{query}&quot;
              </div>
            ) : (
              <div className="space-y-1">
                {filteredItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.href}
                      onClick={() => handleSelect(item.href)}
                      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-7 w-7 items-center justify-center rounded border bg-muted/60 text-muted-foreground">
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{item.title}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {item.description}
                          </p>
                        </div>
                      </div>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {item.category}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
            <span>Navigation Shortcut</span>
            <div className="flex items-center gap-1 font-mono">
              <span>Press</span>
              <kbd className="rounded border bg-background px-1">Esc</kbd>
              <span>to close</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
