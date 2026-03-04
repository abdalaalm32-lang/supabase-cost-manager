import React, { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Store, Warehouse } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export const InventoryBalancesPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;

  const [searchQuery, setSearchQuery] = useState("");
  const [locationType, setLocationType] = useState<"branch" | "warehouse">("branch");
  const [locationFilter, setLocationFilter] = useState("all");

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

  // ========== Fetch all transaction data for per-location stock calculation ==========
  const isLocationFiltered = locationFilter !== "all";

  const { data: purchaseItems = [] } = useQuery({
    queryKey: ["bal-purchase-items", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_items")
        .select("*, purchase_orders!inner(id, status, branch_id, warehouse_id, company_id)")
        .eq("purchase_orders.company_id", companyId!)
        .eq("purchase_orders.status", "مكتمل");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!companyId && isLocationFiltered,
  });

  const { data: productionRecords = [] } = useQuery({
    queryKey: ["bal-production-records", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_records")
        .select("*")
        .eq("company_id", companyId!)
        .eq("status", "مكتمل");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!companyId && isLocationFiltered,
  });

  const { data: productionIngredients = [] } = useQuery({
    queryKey: ["bal-production-ingredients", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_ingredients")
        .select("*, production_records!inner(id, status, branch_id, warehouse_id, company_id)")
        .eq("production_records.company_id", companyId!)
        .eq("production_records.status", "مكتمل");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!companyId && isLocationFiltered,
  });

  const { data: transferItems = [] } = useQuery({
    queryKey: ["bal-transfer-items", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfer_items")
        .select("*, transfers!inner(id, status, source_id, destination_id, company_id)")
        .eq("transfers.company_id", companyId!)
        .eq("transfers.status", "مكتمل");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!companyId && isLocationFiltered,
  });

  const { data: wasteItems = [] } = useQuery({
    queryKey: ["bal-waste-items", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("waste_items")
        .select("*, waste_records!inner(id, status, branch_id, warehouse_id, company_id)")
        .eq("waste_records.company_id", companyId!)
        .eq("waste_records.status", "مكتمل");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!companyId && isLocationFiltered,
  });

  const { data: posSaleItems = [] } = useQuery({
    queryKey: ["bal-pos-sale-items", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pos_sale_items")
        .select("*, pos_sales!inner(id, status, branch_id, company_id)")
        .eq("pos_sales.company_id", companyId!)
        .eq("pos_sales.status", "مكتمل");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!companyId && isLocationFiltered,
  });

  const { data: recipes = [] } = useQuery({
    queryKey: ["bal-recipes", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipes")
        .select("id, menu_item_id, recipe_ingredients(stock_item_id, qty)")
        .eq("company_id", companyId!);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!companyId && isLocationFiltered,
  });

  // ========== Calculate per-location stock ==========
  const locationStockMap = useMemo(() => {
    if (!isLocationFiltered) return new Map<string, number>();

    const stockMap = new Map<string, number>();
    const addQty = (itemId: string | null, qty: number) => {
      if (!itemId) return;
      stockMap.set(itemId, (stockMap.get(itemId) || 0) + qty);
    };
    const subQty = (itemId: string | null, qty: number) => {
      if (!itemId) return;
      stockMap.set(itemId, (stockMap.get(itemId) || 0) - qty);
    };

    const matchesLocation = (branchId: string | null, warehouseId: string | null) => {
      if (locationType === "branch") return branchId === locationFilter;
      return warehouseId === locationFilter;
    };

    // 1. Purchases IN
    for (const pi of purchaseItems) {
      const po = pi.purchase_orders;
      if (matchesLocation(po.branch_id, po.warehouse_id)) {
        addQty(pi.stock_item_id, Number(pi.quantity));
      }
    }

    // 2. Production - produced items IN
    for (const pr of productionRecords) {
      if (matchesLocation(pr.branch_id, pr.warehouse_id)) {
        addQty(pr.product_id, Number(pr.produced_qty));
      }
    }

    // 3. Production ingredients OUT
    for (const ing of productionIngredients) {
      const pr = ing.production_records;
      if (matchesLocation(pr.branch_id, pr.warehouse_id)) {
        subQty(ing.stock_item_id, Number(ing.required_qty));
      }
    }

    // 4. Transfers - destination IN, source OUT
    for (const ti of transferItems) {
      const t = ti.transfers;
      // Source matches → OUT
      if (t.source_id === locationFilter) {
        subQty(ti.stock_item_id, Number(ti.quantity));
      }
      // Destination matches → IN
      if (t.destination_id === locationFilter) {
        addQty(ti.stock_item_id, Number(ti.quantity));
      }
    }

    // 5. Waste OUT
    for (const wi of wasteItems) {
      const wr = wi.waste_records;
      if (matchesLocation(wr.branch_id, wr.warehouse_id)) {
        subQty(wi.stock_item_id, Number(wi.quantity));
      }
    }

    // 6. POS Sales consumption OUT (via recipes)
    // Build recipe map: pos_item_id → [{stock_item_id, qty}]
    const recipeMap = new Map<string, { stock_item_id: string; qty: number }[]>();
    for (const r of recipes) {
      recipeMap.set(
        r.menu_item_id,
        (r.recipe_ingredients || []).map((i: any) => ({
          stock_item_id: i.stock_item_id,
          qty: Number(i.qty),
        })),
      );
    }

    for (const si of posSaleItems) {
      const sale = si.pos_sales;
      if (locationType === "branch" && sale.branch_id === locationFilter) {
        const ingredients = recipeMap.get(si.pos_item_id);
        if (ingredients) {
          for (const ing of ingredients) {
            subQty(ing.stock_item_id, ing.qty * Number(si.quantity));
          }
        }
      }
    }

    return stockMap;
  }, [
    isLocationFiltered,
    locationType,
    locationFilter,
    purchaseItems,
    productionRecords,
    productionIngredients,
    transferItems,
    wasteItems,
    posSaleItems,
    recipes,
  ]);

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
    if (!isLocationFiltered) return Number(item.current_stock);
    return locationStockMap.get(item.id) || 0;
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
      return sum + stock * Number(item.avg_cost);
    }, 0);
  }, [filtered, locationStockMap, isLocationFiltered]);

  return (
    <div className="space-y-6 animate-fade-in-up">
      <h1 className="text-2xl font-bold">أرصدة المخزون</h1>

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
          setLocationFilter("all");
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
            <Button variant={locationFilter === "all" ? "default" : "outline"} onClick={() => setLocationFilter("all")}>
              كل المخازن
            </Button>
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
            <Button variant={locationFilter === "all" ? "default" : "outline"} onClick={() => setLocationFilter("all")}>
              كل الفروع
            </Button>
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

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">كود الصنف</TableHead>
              <TableHead className="text-right">اسم الصنف</TableHead>
              <TableHead className="text-right">المجموعة</TableHead>
              <TableHead className="text-right">وحدة التخزين</TableHead>
              <TableHead className="text-right">المواقع المرتبطة</TableHead>
              <TableHead className={cn("text-right", isLocationFiltered && "bg-primary/10 text-primary font-bold")}>
                {isLocationFiltered ? "الرصيد بالفرع/المخزن" : "الرصيد الحالي"}
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
                  const inventoryValue = stock * Number(item.avg_cost);
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs">{item.code || "—"}</TableCell>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>{getCatName(item.category_id)}</TableCell>
                      <TableCell>{item.stock_unit}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate" title={getLocationNames(item.id)}>
                        {getLocationNames(item.id)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          isLocationFiltered && "ring-2 ring-primary/40 rounded bg-primary/5 font-bold text-primary",
                        )}
                      >
                        {stock.toFixed(2)}
                      </TableCell>
                      <TableCell>{Number(item.avg_cost).toFixed(2)}</TableCell>
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
    </div>
  );
};
