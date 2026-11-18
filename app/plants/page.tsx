"use client";

import * as React from "react";
import { Factory, MapPin, RefreshCw, Building } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/hooks/use-toast";

interface PlantRecord {
  id: string;
  plantCode: string;
  plantName: string;
  location: string;
}

export default function PlantsPage() {
  const { toast } = useToast();
  const [plants, setPlants] = React.useState<PlantRecord[]>([]);
  const [loading, setLoading] = React.useState(true);

  const fetchPlants = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/plants");
      const json = await res.json();
      if (json.success) {
        setPlants(json.data || []);
      } else {
        toast({
          title: "Failed to load plants",
          description: json.error?.message,
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Network Error",
        description: "Could not connect to plants API",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    fetchPlants();
  }, [fetchPlants]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Operating Plants & Facilities
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manufacturing locations, receiving docks, and cost-center plant destinations
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-md border border-border bg-muted/60 px-2.5 py-1 text-xs font-mono text-muted-foreground">
            {plants.length} facilities active
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={fetchPlants}
            className="h-8 w-8"
            title="Refresh plants"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="h-48 flex items-center justify-center text-xs text-muted-foreground gap-2">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span>Loading plant records...</span>
        </div>
      ) : plants.length === 0 ? (
        <EmptyState
          icon={Factory}
          title="No Plants Found in Database"
          description="Plant records have not been imported yet. Import plants.csv from the Master Data Import portal."
          badge="Awaiting Master Data Import"
          actionLabel="Go to Data Import"
          onAction={() => {
            window.location.href = "/import";
          }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plants.map((plant) => (
            <Card key={plant.id} className="hover:border-foreground/30 transition-all">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                      {plant.plantCode}
                    </span>
                    <CardTitle className="text-sm font-semibold mt-2">
                      {plant.plantName}
                    </CardTitle>
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-muted/60 text-muted-foreground">
                    <Building className="h-4 w-4" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-muted-foreground pt-0">
                <div className="flex items-center gap-1.5 text-foreground">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">{plant.location}</span>
                </div>
                <div className="pt-2 border-t text-[11px] text-muted-foreground">
                  Designated receiving plant for purchase order fulfillment and inventory receipt.
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
