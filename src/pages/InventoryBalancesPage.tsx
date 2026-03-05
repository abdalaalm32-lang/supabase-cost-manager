import React, { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Store, Warehouse } from "lucide-react";
import { ExportButtons } from "@/components/ExportButtons";
import { PrintButton } from "@/components/PrintButton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocationStock } from "@/hooks/useLocationStock";

export const InventoryBalancesPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;

  const [searchQuery, setSearchQuery] = useState("");
  const [locationType, setLocationType] = useState<"branch" | "warehouse">("branch");
  const [locationFilter, setLocationFilter] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["stock-items", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_items")
        .select("*")
        .eq("active", true)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["inv-categories-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_categories").select("*").eq("active", true);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ["branches-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: itemLocations = [] } = useQuery({
    queryKey: ["stock-item-locations", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_item_locations").select("*");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!companyId,
  });

  const isLocationFiltered = locationFilter !== "";

  // Use centralized hook for per-location stock calculation
  // This includes: purchases, production, transfers, waste, POS sales (via recipes), and stocktake adjustments
  const { stockMap: locationStockMap, getLocationStock } = useLocationStock(
    isLocationFiltered ? locationFilter : null,
    locationType
  );

  const getCatName = (id: string | null) => {
    if (!id) return "—";
    return categories.find((c: any) => c.id === id)?.name || "—";
  };

  const getLocationNames = (itemId: string) => {
    const locs = itemLocations.filter((l: any) => l.stock_item_id === itemId);
    const names: string[] = [];
    locs.forEach((l: any) => {
      if (l.branch_id) {
        const b = branches.find((br: any) => br.id === l.branch_id);
        if (b) names.push(b.name);
      }
      if (l.warehouse_id) {
        const w = warehouses.find((wr: any) => wr.id === l.warehouse_id);
        if (w) names.push(w.name);
      }
    });
    return names.length > 0 ? names.join("، ") : "—";
  };

  const getDisplayStock = (item: any) => {
    return getLocationStock(item.id);
  };

  const filtered = useMemo(() => {
    let result = [...items];

    // Filter by location - show only items linked to this location
    if (isLocationFiltered) {
      const itemIdsWithLocation = new Set(
        itemLocations
          .filter((l: any) => {
            if (locationType === "branch") return l.branch_id === locationFilter;
            return l.warehouse_id === locationFilter;
          })
          .map((l: any) => l.stock_item_id),
      );
      result = result.filter((item: any) => itemIdsWithLocation.has(item.id));
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (item: any) =>
          (item.code || "").toLowerCase().includes(q) ||
          item.name.toLowerCase().includes(q) ||
          getCatName(item.category_id).toLowerCase().includes(q) ||
          item.stock_unit.toLowerCase().includes(q) ||
          getLocationNames(item.id).toLowerCase().includes(q),
      );
    }

    return result;
  }, [items, locationFilter, locationType, searchQuery, itemLocations, categories, branches, warehouses]);

  const totalValue = useMemo(() => {
    return filtered.reduce((sum: number, item: any) => {
      const stock = getDisplayStock(item);
      if (stock <= 0) return sum;
      return sum + stock * Number(item.avg_cost);
    }, 0);
  }, [filtered, locationStockMap, isLocationFiltered]);

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">أرصدة المخزون</h1>
        <div className="flex items-center gap-2">
          <PrintButton
            data={filtered.map((item: any) => ({ code: item.code || "—", name: item.name, category: getCatName(item.category_id), unit: item.stock_unit, locations: getLocationNames(item.id), stock: getDisplayStock(item).toFixed(2), avgCost: Number(item.avg_cost).toFixed(2), value: (getDisplayStock(item) * Number(item.avg_cost)).toFixed(2) }))}
            columns={[{ key: "code", label: "الكود" }, { key: "name", label: "الصنف" }, { key: "category", label: "المجموعة" }, { key: "unit", label: "الوحدة" }, { key: "locations", label: "المواقع" }, { key: "stock", label: "الرصيد" }, { key: "avgCost", label: "متوسط التكلفة" }, { key: "value", label: "قيمة المخزون" }]}
            title="أرصدة المخزون"
          />
          <ExportButtons
            data={filtered.map((item: any) => ({ code: item.code || "—", name: item.name, category: getCatName(item.category_id), unit: item.stock_unit, locations: getLocationNames(item.id), stock: getDisplayStock(item).toFixed(2), avgCost: Number(item.avg_cost).toFixed(2), value: (getDisplayStock(item) * Number(item.avg_cost)).toFixed(2) }))}
            columns={[{ key: "code", label: "الكود" }, { key: "name", label: "الصنف" }, { key: "category", label: "المجموعة" }, { key: "unit", label: "الوحدة" }, { key: "locations", label: "المواقع" }, { key: "stock", label: "الرصيد" }, { key: "avgCost", label: "متوسط التكلفة" }, { key: "value", label: "قيمة المخزون" }]}
            filename="أرصدة_المخزون"
            title="أرصدة المخزون"
          />
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث بالكود، الاسم، المجموعة، الموقع..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="glass-input pr-9"
          />
        </div>
      </div>

      <Tabs
        value={locationType}
        onValueChange={(val) => {
          setLocationType(val as "branch" | "warehouse");
          setLocationFilter("");
        }}
        className="w-full"
      >
        <TabsList className="mb-4">
          <TabsTrigger value="warehouse" className="flex items-center gap-2">
            <Warehouse size={16} />
            المخازن
          </TabsTrigger>
          <TabsTrigger value="branch" className="flex items-center gap-2">
            <Store size={16} />
            الفروع
          </TabsTrigger>
        </TabsList>

        <TabsContent value="warehouse" className="mt-0">
          <div className="flex flex-wrap gap-2 mb-6">
            {warehouses.map((w: any) => (
              <Button
                key={w.id}
                variant={locationFilter === w.id ? "default" : "outline"}
                onClick={() => setLocationFilter(w.id)}
              >
                {w.name}
              </Button>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="branch" className="mt-0">
          <div className="flex flex-wrap gap-2 mb-6">
            {branches.map((b: any) => (
              <Button
                key={b.id}
                variant={locationFilter === b.id ? "default" : "outline"}
                onClick={() => setLocationFilter(b.id)}
              >
                {b.name}
              </Button>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Table or empty state */}
      {!isLocationFiltered ? (
        <div className="glass-card flex flex-col items-center justify-center py-16 text-center space-y-3">
          <Warehouse className="h-12 w-12 text-muted-foreground/50" />
          <p className="text-lg text-muted-foreground font-medium">
            يرجى اختيار فرع أو مخزن لعرض بياناته
          </p>
          <p className="text-sm text-muted-foreground/70">
            Please select a branch or warehouse to display its data.
          </p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">كود الصنف</TableHead>
                <TableHead className="text-right">اسم الصنف</TableHead>
                <TableHead className="text-right">المجموعة</TableHead>
                <TableHead className="text-right">وحدة التخزين</TableHead>
                <TableHead className="text-right">المواقع المرتبطة</TableHead>
                <TableHead className="text-right bg-primary/10 text-primary font-bold">
                  الرصيد بالفرع/المخزن
                </TableHead>
                <TableHead className="text-right">متوسط التكلفة</TableHead>
                <TableHead className="text-right">قيمة المخزون</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    جاري التحميل...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    لا توجد أصناف
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {filtered.map((item: any) => {
                    const stock = getDisplayStock(item);
                    const displayAvgCost = stock <= 0 ? 0 : Number(item.avg_cost);
                    const inventoryValue = stock <= 0 ? 0 : stock * Number(item.avg_cost);
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-xs">{item.code || "—"}</TableCell>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>{getCatName(item.category_id)}</TableCell>
                        <TableCell>{item.stock_unit}</TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate" title={getLocationNames(item.id)}>
                          {getLocationNames(item.id)}
                        </TableCell>
                        <TableCell className="ring-2 ring-primary/40 rounded bg-primary/5 font-bold text-primary">
                          {stock.toFixed(2)}
                        </TableCell>
                        <TableCell>{displayAvgCost.toFixed(2)}</TableCell>
                        <TableCell className="font-semibold">{inventoryValue.toFixed(2)}</TableCell>
                      </TableRow>
                    );
                  })}
                  {/* Total Row */}
                  <TableRow className="bg-muted/30 font-bold">
                    <TableCell colSpan={7} className="text-left">
                      الإجمالي
                    </TableCell>
                    <TableCell className="font-bold">{totalValue.toFixed(2)}</TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};
