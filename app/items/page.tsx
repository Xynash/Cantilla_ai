"use client";

import * as React from "react";
import { Search, RefreshCw, Package, Filter, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface ItemRecord {
  id: string;
  itemCode: string;
  description: string;
  uom: string;
  category: string;
  itemType: string;
  standardPrice: number;
}

export default function ItemsPage() {
  const { toast } = useToast();
  const [items, setItems] = React.useState<ItemRecord[]>([]);
  const [categories, setCategories] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [selectedCategory, setSelectedCategory] = React.useState("ALL");
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [activeItem, setActiveItem] = React.useState<ItemRecord | null>(null);

  const fetchItems = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "12",
      });
      if (search.trim()) params.set("search", search.trim());
      if (selectedCategory !== "ALL") params.set("category", selectedCategory);

      const res = await fetch(`/api/items?${params.toString()}`);
      const json = await res.json();

      if (json.success) {
        setItems(json.data || []);
        if (json.meta?.categories) {
          setCategories(json.meta.categories);
        }
        setTotalPages(json.meta?.totalPages || 1);
        setTotal(json.meta?.total || 0);
      } else {
        toast({
          title: "Failed to load items",
          description: json.error?.message || "Please sign in to view items",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Network Error",
        description: "Could not connect to item directory API",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [page, search, selectedCategory, toast]);

  React.useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchItems();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Item Master Directory
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Standard enterprise material catalog, commodity categories, and reference standard prices
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-md border border-border bg-muted/60 px-2.5 py-1 text-xs font-mono text-muted-foreground">
            {total} items registered
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => fetchItems()}
            className="h-8 w-8"
            title="Refresh directory"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={handleSearchSubmit} className="flex flex-1 items-center gap-2 max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by item code, description or category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <Button type="submit" size="sm" variant="secondary" className="h-8 text-xs">
            Search
          </Button>
          {search && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setPage(1);
              }}
              className="h-8 text-xs px-2"
            >
              Clear
            </Button>
          )}
        </form>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full sm:max-w-md">
          <span className="text-[11px] font-medium text-muted-foreground shrink-0 mr-1">Category:</span>
          {["ALL", ...categories.slice(0, 4)].map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setSelectedCategory(cat);
                setPage(1);
              }}
              className={`rounded px-2 py-1 text-[11px] font-medium transition-colors shrink-0 ${
                selectedCategory === cat
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-muted hover:bg-muted/80 text-muted-foreground"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Table Container */}
      <div className="rounded-lg border border-border bg-card overflow-hidden shadow-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Item Code</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>UOM</TableHead>
              <TableHead className="text-right">Standard Price</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-48 text-center text-xs text-muted-foreground">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <span>Loading item master catalog...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="p-0">
                  <EmptyState
                    icon={Package}
                    title="No Items Found in Database"
                    description={
                      total === 0
                        ? "The item master catalog is empty. Go to Master Data Import to import item_master.csv."
                        : "No item records match your current filter and search query."
                    }
                    badge={total === 0 ? "Awaiting Master Data Import" : "0 Results"}
                    actionLabel={total === 0 ? "Go to Data Import" : "Reset Filter"}
                    onAction={() => {
                      if (total === 0) {
                        window.location.href = "/import";
                      } else {
                        setSearch("");
                        setSelectedCategory("ALL");
                        setPage(1);
                      }
                    }}
                    className="border-0 rounded-none bg-transparent"
                  />
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id} className="hover:bg-muted/40 transition-colors">
                  <TableCell className="font-mono text-xs font-semibold text-foreground">
                    {item.itemCode}
                  </TableCell>
                  <TableCell className="font-medium text-xs text-foreground">
                    {item.description}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-sm bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {item.category}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.itemType}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-foreground">
                    {item.uom}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs font-semibold text-foreground">
                    {formatCurrency(item.standardPrice, "INR")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setActiveItem(item)}
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      title="View item specification"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination Bar */}
        {total > 0 && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground bg-muted/20">
            <span>
              Showing Page {page} of {totalPages} ({total} total records)
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="h-7 px-2 text-xs"
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="h-7 px-2 text-xs"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Item Detail Modal */}
      {activeItem && (
        <Dialog open={!!activeItem} onOpenChange={() => setActiveItem(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-mono text-sm">{activeItem.itemCode}</DialogTitle>
              <DialogDescription>{activeItem.description}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2 text-xs">
              <div className="grid grid-cols-2 gap-3 border rounded-md p-3 bg-muted/20">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-medium">Category</span>
                  <p className="font-semibold text-foreground">{activeItem.category}</p>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-medium">Item Type</span>
                  <p className="font-semibold text-foreground">{activeItem.itemType}</p>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-medium">Unit of Measure</span>
                  <p className="font-mono font-semibold text-foreground">{activeItem.uom}</p>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-medium">Standard Price</span>
                  <p className="font-mono font-bold text-foreground">{formatCurrency(activeItem.standardPrice, "INR")}</p>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button size="sm" variant="outline" onClick={() => setActiveItem(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
