import React, { useState, useMemo } from "react";
import { ExportButtons } from "@/components/ExportButtons";
import { PrintButton } from "@/components/PrintButton";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  CalendarIcon, Search, Building2, Warehouse, TrendingUp, TrendingDown, Minus,
  Package, ArrowDownToLine, ArrowUpFromLine, BarChart3, ShoppingCart, Layers,
  ArrowRightLeft, Trash2, ClipboardCheck, FileText,
} from "lucide-react";
import {
  Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
} from "recharts";

const CHART_COLORS = [
  "hsl(221, 83%, 53%)",
  "hsl(142, 76%, 36%)",
  "hsl(38, 92%, 50%)",
  "hsl(199, 89%, 48%)",
  "hsl(262, 83%, 58%)",
  "hsl(0, 84%, 60%)",
];

type MovementItem = {
  id: string;
  code: string | null;
  name: string;
  unit: string;
  avgCost: number;
  // Incoming breakdown
  inPurchases: number;
  inProduction: number;
  inReceipts: number; // transfers received
  // Outgoing breakdown
  outTransfers: number;
  outConsumption: number; // production ingredients + POS
  outWaste: number;
  // Totals
  totalIn: number;
  totalOut: number;
  bookQty: number;
  countQty: number;
  varQty: number;
  varVal: number;
  openQty: number;
};

export const InventoryMovementPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [locationType, setLocationType] = useState<"branch" | "warehouse">("branch");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  const branchFilter = locationType === "branch" ? locationFilter : "all";
  const warehouseFilter = locationType === "warehouse" ? locationFilter : "all";

  // --- Data queries ---
  const { data: branches } = useQuery({
    queryKey: ["branches", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").eq("company_id", companyId!).eq("active", true);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("*").eq("company_id", companyId!).eq("active", true);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: inventoryCategories } = useQuery({
    queryKey: ["inv-categories-movement", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_categories").select("id, name").eq("company_id", companyId!).eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: stockItems } = useQuery({
    queryKey: ["stock-items-movement", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_items").select("*, inventory_categories:category_id(id, name)")
        .eq("company_id", companyId!).eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: stockItemLocations } = useQuery({
    queryKey: ["stock-item-locations-movement", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_item_locations").select("*").eq("company_id", companyId!);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: stocktakeData } = useQuery({
    queryKey: ["stocktake-data-movement", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stocktake_items").select("*, stocktakes!inner(id, date, status, company_id, branch_id, warehouse_id)")
        .eq("stocktakes.company_id", companyId!).eq("stocktakes.status", "مكتمل");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: purchaseData } = useQuery({
    queryKey: ["purchase-data-movement", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_items").select("*, purchase_orders!inner(id, date, status, company_id, branch_id, warehouse_id)")
        .eq("purchase_orders.company_id", companyId!).eq("purchase_orders.status", "مكتمل");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: productionIngData } = useQuery({
    queryKey: ["production-ing-movement", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_ingredients").select("*, production_records!inner(id, date, status, company_id, branch_id, warehouse_id)")
        .eq("production_records.company_id", companyId!).eq("production_records.status", "مكتمل");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: productionRecords } = useQuery({
    queryKey: ["production-rec-movement", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_records").select("*").eq("company_id", companyId!).eq("status", "مكتمل");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: wasteData } = useQuery({
    queryKey: ["waste-data-movement", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("waste_items").select("*, waste_records!inner(id, date, status, company_id, branch_id, warehouse_id)")
        .eq("waste_records.company_id", companyId!).eq("waste_records.status", "مكتمل");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: transferData } = useQuery({
    queryKey: ["transfer-data-movement", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfer_items").select("*, transfers!inner(id, date, status, company_id, source_id, destination_id)")
        .eq("transfers.company_id", companyId!).eq("transfers.status", "مكتمل");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: posSaleItems } = useQuery({
    queryKey: ["pos-sale-items-movement", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pos_sale_items").select("*, pos_sales!inner(id, date, status, company_id, branch_id)")
        .eq("pos_sales.company_id", companyId!).eq("pos_sales.status", "مكتمل");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: recipeIngredients } = useQuery({
    queryKey: ["recipe-ingredients-movement", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipe_ingredients").select("*, recipes!inner(id, menu_item_id, company_id)")
        .eq("recipes.company_id", companyId!);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Helpers
  const inDateRange = (dateStr: string) => {
    if (!dateFrom && !dateTo) return true;
    const d = new Date(dateStr);
    if (dateFrom && d < dateFrom) return false;
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      if (d > end) return false;
    }
    return true;
  };

  const isBeforePeriod = (dateStr: string) => {
    if (!dateFrom) return false;
    return new Date(dateStr) < dateFrom;
  };

  // Filter items by location
  const locationItemIds = useMemo(() => {
    if (locationFilter === "all" || !stockItemLocations) return null;
    const ids = new Set<string>();
    for (const loc of stockItemLocations) {
      if (locationType === "branch" && loc.branch_id === locationFilter) ids.add(loc.stock_item_id);
      if (locationType === "warehouse" && loc.warehouse_id === locationFilter) ids.add(loc.stock_item_id);
    }
    return ids;
  }, [stockItemLocations, locationFilter, locationType]);

  // Main calculation
  const calcData = useMemo(() => {
    if (!stockItems) return [];
    const map = new Map<string, MovementItem>();

    for (const si of stockItems) {
      if (locationItemIds && !locationItemIds.has(si.id)) continue;
      map.set(si.id, {
        id: si.id,
        code: si.code,
        name: si.name,
        unit: si.stock_unit,
        avgCost: Number(si.avg_cost) || 0,
        inPurchases: 0, inProduction: 0, inReceipts: 0,
        outTransfers: 0, outConsumption: 0, outWaste: 0,
        totalIn: 0, totalOut: 0,
        bookQty: 0, countQty: 0, varQty: 0, varVal: 0,
        openQty: 0,
      });
    }

    // Opening balance from stocktake before period
    if (stocktakeData && dateFrom) {
      const latestStocktake = new Map<string, { qty: number; date: string }>();
      for (const si of stocktakeData) {
        const stDate = (si as any).stocktakes?.date;
        const brId = (si as any).stocktakes?.branch_id;
        const whId = (si as any).stocktakes?.warehouse_id;
        if (!stDate || !isBeforePeriod(stDate)) continue;
        if (branchFilter !== "all" && brId !== branchFilter) continue;
        if (warehouseFilter !== "all" && whId !== warehouseFilter) continue;
        if (!si.stock_item_id) continue;
        const existing = latestStocktake.get(si.stock_item_id);
        if (!existing || stDate > existing.date) {
          latestStocktake.set(si.stock_item_id, { qty: Number(si.counted_qty), date: stDate });
        }
      }
      for (const [itemId, data] of latestStocktake) {
        const calc = map.get(itemId);
        if (calc) calc.openQty = data.qty;
      }
    }

    // Purchases → inPurchases
    if (purchaseData) {
      for (const pi of purchaseData) {
        const poDate = (pi as any).purchase_orders?.date;
        const poBranch = (pi as any).purchase_orders?.branch_id;
        const poWarehouse = (pi as any).purchase_orders?.warehouse_id;
        if (!poDate || !inDateRange(poDate)) continue;
        if (branchFilter !== "all" && poBranch !== branchFilter) continue;
        if (warehouseFilter !== "all" && poWarehouse !== warehouseFilter) continue;
        if (!pi.stock_item_id) continue;
        const calc = map.get(pi.stock_item_id);
        if (calc) calc.inPurchases += Number(pi.quantity);
      }
    }

    // Production output → inProduction
    if (productionRecords) {
      for (const pr of productionRecords) {
        if (!inDateRange(pr.date)) continue;
        if (branchFilter !== "all" && pr.branch_id !== branchFilter) continue;
        if (warehouseFilter !== "all" && (pr as any).warehouse_id !== warehouseFilter) continue;
        if (!pr.product_id) continue;
        const calc = map.get(pr.product_id);
        if (calc) calc.inProduction += Number(pr.produced_qty);
      }
    }

    // Transfers received → inReceipts
    if (transferData) {
      for (const ti of transferData) {
        const trDate = (ti as any).transfers?.date;
        const trDest = (ti as any).transfers?.destination_id;
        if (!trDate || !inDateRange(trDate)) continue;
        // For receipts: destination matches our selected location
        if (branchFilter !== "all" && trDest !== branchFilter) continue;
        if (warehouseFilter !== "all" && trDest !== warehouseFilter) continue;
        if (!ti.stock_item_id) continue;
        const calc = map.get(ti.stock_item_id);
        if (calc) calc.inReceipts += Number(ti.quantity);
      }
    }

    // Transfers sent → outTransfers
    if (transferData) {
      for (const ti of transferData) {
        const trDate = (ti as any).transfers?.date;
        const trSource = (ti as any).transfers?.source_id;
        if (!trDate || !inDateRange(trDate)) continue;
        if (branchFilter !== "all" && trSource !== branchFilter) continue;
        if (warehouseFilter !== "all" && trSource !== warehouseFilter) continue;
        if (!ti.stock_item_id) continue;
        const calc = map.get(ti.stock_item_id);
        if (calc) calc.outTransfers += Number(ti.quantity);
      }
    }

    // Production ingredients + POS consumption → outConsumption
    if (productionIngData) {
      for (const ing of productionIngData) {
        const prDate = (ing as any).production_records?.date;
        const prBranch = (ing as any).production_records?.branch_id;
        const prWarehouse = (ing as any).production_records?.warehouse_id;
        if (!prDate || !inDateRange(prDate)) continue;
        if (branchFilter !== "all" && prBranch !== branchFilter) continue;
        if (warehouseFilter !== "all" && prWarehouse !== warehouseFilter) continue;
        if (!ing.stock_item_id) continue;
        const calc = map.get(ing.stock_item_id);
        if (calc) calc.outConsumption += Number(ing.required_qty);
      }
    }

    if (posSaleItems && recipeIngredients) {
      const recipeMap = new Map<string, { stock_item_id: string; qty: number }[]>();
      for (const ri of recipeIngredients) {
        const menuItemId = (ri as any).recipes?.menu_item_id;
        if (!menuItemId) continue;
        if (!recipeMap.has(menuItemId)) recipeMap.set(menuItemId, []);
        const si = stockItems?.find(s => s.id === ri.stock_item_id);
        const convFactor = Number(si?.conversion_factor) || 1;
        recipeMap.get(menuItemId)!.push({ stock_item_id: ri.stock_item_id, qty: Number(ri.qty) / convFactor });
      }
      for (const saleItem of posSaleItems) {
        const saleDate = (saleItem as any).pos_sales?.date;
        const saleBranch = (saleItem as any).pos_sales?.branch_id;
        if (!saleDate || !inDateRange(saleDate)) continue;
        if (branchFilter !== "all" && saleBranch !== branchFilter) continue;
        if (!saleItem.pos_item_id) continue;
        const ingredients = recipeMap.get(saleItem.pos_item_id);
        if (ingredients) {
          for (const ing of ingredients) {
            const calc = map.get(ing.stock_item_id);
            if (calc) calc.outConsumption += ing.qty * Number(saleItem.quantity);
          }
        }
      }
    }

    // Waste → outWaste
    if (wasteData) {
      for (const wi of wasteData) {
        const wrDate = (wi as any).waste_records?.date;
        const wrBranch = (wi as any).waste_records?.branch_id;
        const wrWarehouse = (wi as any).waste_records?.warehouse_id;
        if (!wrDate || !inDateRange(wrDate)) continue;
        if (branchFilter !== "all" && wrBranch !== branchFilter) continue;
        if (warehouseFilter !== "all" && wrWarehouse !== warehouseFilter) continue;
        if (!wi.stock_item_id) continue;
        const calc = map.get(wi.stock_item_id);
        if (calc) calc.outWaste += Number(wi.quantity);
      }
    }

    // Actual count from stocktake in period
    if (stocktakeData) {
      const latestInPeriod = new Map<string, { qty: number; date: string }>();
      for (const si of stocktakeData) {
        const stDate = (si as any).stocktakes?.date;
        const brId = (si as any).stocktakes?.branch_id;
        const whId = (si as any).stocktakes?.warehouse_id;
        if (!stDate || !inDateRange(stDate)) continue;
        if (branchFilter !== "all" && brId !== branchFilter) continue;
        if (warehouseFilter !== "all" && whId !== warehouseFilter) continue;
        if (!si.stock_item_id) continue;
        const existing = latestInPeriod.get(si.stock_item_id);
        if (!existing || stDate > existing.date) {
          latestInPeriod.set(si.stock_item_id, { qty: Number(si.counted_qty), date: stDate });
        }
      }
      for (const [itemId, data] of latestInPeriod) {
        const calc = map.get(itemId);
        if (calc) calc.countQty = data.qty;
      }
    }

    // Calculate totals
    for (const calc of map.values()) {
      calc.totalIn = calc.inPurchases + calc.inProduction + calc.inReceipts;
      calc.totalOut = calc.outTransfers + calc.outConsumption + calc.outWaste;
      calc.bookQty = calc.openQty + calc.totalIn - calc.totalOut;
      calc.varQty = calc.countQty - calc.bookQty;
      calc.varVal = calc.varQty * calc.avgCost;
    }

    return Array.from(map.values());
  }, [stockItems, stockItemLocations, stocktakeData, purchaseData, productionIngData, productionRecords, wasteData, transferData, posSaleItems, recipeIngredients, dateFrom, dateTo, branchFilter, warehouseFilter, locationItemIds]);

  // Search + category filter
  const filteredData = useMemo(() => {
    let result = calcData;
    // Category filter
    if (categoryFilter !== "all" && stockItems) {
      const catItemIds = new Set(stockItems.filter(si => si.category_id === categoryFilter).map(si => si.id));
      result = result.filter(i => catItemIds.has(i.id));
    }
    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const categoryName = (id: string) => {
        const si = stockItems?.find(s => s.id === id);
        return (si?.inventory_categories as any)?.name?.toLowerCase() || "";
      };
      result = result.filter(i => i.name.toLowerCase().includes(q) || (i.code && i.code.toLowerCase().includes(q)) || categoryName(i.id).includes(q));
    }
    return result;
  }, [calcData, searchQuery, categoryFilter, stockItems]);

  // Grand totals
  const totals = useMemo(() => {
    const t = {
      inPurchases: 0, inProduction: 0, inReceipts: 0,
      outTransfers: 0, outConsumption: 0, outWaste: 0,
      totalIn: 0, totalOut: 0, bookQty: 0, countQty: 0, varQty: 0, varVal: 0,
    };
    for (const i of filteredData) {
      t.inPurchases += i.inPurchases;
      t.inProduction += i.inProduction;
      t.inReceipts += i.inReceipts;
      t.outTransfers += i.outTransfers;
      t.outConsumption += i.outConsumption;
      t.outWaste += i.outWaste;
      t.totalIn += i.totalIn;
      t.totalOut += i.totalOut;
      t.bookQty += i.bookQty;
      t.countQty += i.countQty;
      t.varQty += i.varQty;
      t.varVal += i.varVal;
    }
    return t;
  }, [filteredData]);

  const fmtQty = (n: number) => Number(n.toFixed(3)).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  const fmtNum = (n: number) => Number(n.toFixed(2)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Chart data
  const movementChartData = useMemo(() => [
    { name: "مشتريات", value: totals.inPurchases, fill: CHART_COLORS[0] },
    { name: "إنتاج", value: totals.inProduction, fill: CHART_COLORS[1] },
    { name: "استلامات", value: totals.inReceipts, fill: CHART_COLORS[2] },
    { name: "تحويلات", value: totals.outTransfers, fill: CHART_COLORS[3] },
    { name: "استهلاك", value: totals.outConsumption, fill: CHART_COLORS[4] },
    { name: "هالك", value: totals.outWaste, fill: CHART_COLORS[5] },
  ], [totals]);

  const inOutChartData = useMemo(() => [
    { name: "الوارد", كمية: totals.totalIn },
    { name: "المنصرف", كمية: totals.totalOut },
  ], [totals]);

  const topVarianceItems = useMemo(() =>
    [...filteredData].sort((a, b) => Math.abs(b.varVal) - Math.abs(a.varVal)).slice(0, 8).map(i => ({
      name: i.name.length > 15 ? i.name.substring(0, 15) + "…" : i.name,
      تباين: i.varVal,
    }))
    , [filteredData]);

  const topMovementItems = useMemo(() =>
    [...filteredData].sort((a, b) => (b.totalIn + b.totalOut) - (a.totalIn + a.totalOut)).slice(0, 8).map(i => ({
      name: i.name.length > 15 ? i.name.substring(0, 15) + "…" : i.name,
      وارد: i.totalIn,
      منصرف: i.totalOut,
    }))
    , [filteredData]);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
            <FileText className="h-7 w-7 text-primary" />
            حركة المخزون
          </h1>
          <p className="text-sm text-muted-foreground mt-1">تقرير تفصيلي لحركة جميع الخامات</p>
        </div>
        <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
          {filteredData.length} صنف
        </span>
      </div>

      {/* Filters */}
      <Card className="border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">بحث</label>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="ابحث بالكود أو الاسم أو المجموعة..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pr-9 h-9"
                />
              </div>
            </div>

            {/* Category Filter */}
            <div className="min-w-[160px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">المجموعة</label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المجموعات</SelectItem>
                  {inventoryCategories?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Location Type */}
            <div className="min-w-[120px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">نوع الموقع</label>
              <div className="flex border rounded-md overflow-hidden h-9">
                <button
                  onClick={() => { setLocationType("branch"); setLocationFilter("all"); }}
                  className={cn("flex-1 text-xs font-medium px-3 transition-colors flex items-center justify-center gap-1",
                    locationType === "branch" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted")}
                >
                  <Building2 className="h-3 w-3" /> فرع
                </button>
                <button
                  onClick={() => { setLocationType("warehouse"); setLocationFilter("all"); }}
                  className={cn("flex-1 text-xs font-medium px-3 transition-colors flex items-center justify-center gap-1",
                    locationType === "warehouse" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted")}
                >
                  <Warehouse className="h-3 w-3" /> مخزن
                </button>
              </div>
            </div>

            {/* Location Select */}
            <div className="min-w-[160px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                {locationType === "branch" ? "الفرع" : "المخزن"}
              </label>
              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  {locationType === "branch"
                    ? branches?.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)
                    : warehouses?.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)
                  }
                </SelectContent>
              </Select>
            </div>

            {/* Date From */}
            <div className="min-w-[140px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">من تاريخ</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("h-9 text-xs w-full justify-start", !dateFrom && "text-muted-foreground")}>
                    <CalendarIcon className="ml-2 h-3 w-3" />
                    {dateFrom ? format(dateFrom, "yyyy-MM-dd") : "اختر"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>

            {/* Date To */}
            <div className="min-w-[140px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">إلى تاريخ</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("h-9 text-xs w-full justify-start", !dateTo && "text-muted-foreground")}>
                    <CalendarIcon className="ml-2 h-3 w-3" />
                    {dateTo ? format(dateTo, "yyyy-MM-dd") : "اختر"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>

            {/* Reset */}
            {(searchQuery || categoryFilter !== "all" || locationFilter !== "all" || dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => {
                setSearchQuery(""); setCategoryFilter("all"); setLocationFilter("all"); setDateFrom(undefined); setDateTo(undefined);
              }}>
                مسح الفلاتر
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Card className="border-border/50">
          <CardContent className="p-4 text-center">
            <ArrowDownToLine className="h-5 w-5 text-emerald-500 mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">إجمالي الوارد</p>
            <p className="text-lg font-bold text-foreground">{fmtQty(totals.totalIn)}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 text-center">
            <ArrowUpFromLine className="h-5 w-5 text-destructive mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">إجمالي المنصرف</p>
            <p className="text-lg font-bold text-foreground">{fmtQty(totals.totalOut)}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 text-center">
            <ShoppingCart className="h-5 w-5 text-blue-500 mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">مشتريات</p>
            <p className="text-lg font-bold text-foreground">{fmtQty(totals.inPurchases)}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 text-center">
            <Layers className="h-5 w-5 text-amber-500 mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">إنتاج</p>
            <p className="text-lg font-bold text-foreground">{fmtQty(totals.inProduction)}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 text-center">
            <Trash2 className="h-5 w-5 text-destructive mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">هالك</p>
            <p className="text-lg font-bold text-foreground">{fmtQty(totals.outWaste)}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 text-center">
            {totals.varVal >= 0
              ? <TrendingUp className="h-5 w-5 text-emerald-500 mx-auto mb-1" />
              : <TrendingDown className="h-5 w-5 text-destructive mx-auto mb-1" />
            }
            <p className="text-xs text-muted-foreground">إجمالي التباين</p>
            <p className={cn("text-lg font-bold", totals.varVal >= 0 ? "text-emerald-600" : "text-destructive")}>{fmtNum(totals.varVal)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Movement Breakdown Pie */}
        <Card className="border-border/50">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" /> توزيع الحركات
            </h3>
            <div style={{ height: 250 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <Pie
                    data={movementChartData.filter(d => d.value > 0)}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    label={({ name, percent, cx, cy, midAngle, outerRadius }) => {
                      const RADIAN = Math.PI / 180;
                      const radius = outerRadius + 80;
                      const x = cx + radius * Math.cos(-midAngle * RADIAN);
                      const y = cy + radius * Math.sin(-midAngle * RADIAN);
                      return (
                        <text x={x} y={y} fill="hsl(var(--foreground))" textAnchor={x > cx ? "start" : "end"} dominantBaseline="central" fontSize={11}>
                          {`${name} ${(percent * 100).toFixed(0)}%`}
                        </text>
                      );
                    }}
                  >
                    {movementChartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmtQty(v)} contentStyle={{ color: "#000" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Top Movement Items */}
        <Card className="border-border/50">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4 text-primary" /> أكثر الأصناف حركة
            </h3>
            <div style={{ height: 250 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topMovementItems} layout="vertical" margin={{ top: 20, right: 60, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickMargin={0} />
                  <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickMargin={50} />
                  <Tooltip formatter={(v: number) => fmtQty(v)} contentStyle={{ color: "#000" }} />
                  <Legend />
                  <Bar dataKey="وارد" fill={CHART_COLORS[1]} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="منصرف" fill={CHART_COLORS[5]} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Top Variance Items */}
        <Card className="border-border/50">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-primary" /> أعلى تباين (قيمة)
            </h3>
            <div style={{ height: 250 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topVarianceItems} layout="vertical" margin={{ top: 20, right: 80, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickMargin={10} />
                  <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickMargin={50} />
                  <Tooltip formatter={(v: number) => fmtNum(v)} contentStyle={{ color: "#000" }} />
                  <Bar dataKey="تباين" fill={CHART_COLORS[4]} radius={[0, 4, 4, 0]}>
                    {topVarianceItems.map((entry, idx) => (
                      <Cell key={idx} fill={entry.تباين >= 0 ? CHART_COLORS[1] : CHART_COLORS[5]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* In vs Out Area Chart */}
      <Card className="border-border/50">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">الوارد مقابل المنصرف</h3>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart margin={{ top: 20, right: 30, bottom: 20, left: 30 }} data={[
                { name: "مشتريات", وارد: totals.inPurchases, منصرف: 0 },
                { name: "إنتاج", وارد: totals.inProduction, منصرف: 0 },
                { name: "استلامات", وارد: totals.inReceipts, منصرف: 0 },
                { name: "تحويلات", وارد: 0, منصرف: totals.outTransfers },
                { name: "استهلاك", وارد: 0, منصرف: totals.outConsumption },
                { name: "هالك", وارد: 0, منصرف: totals.outWaste },
              ]}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickMargin={10} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickMargin={10} />
                <Tooltip formatter={(v: number) => fmtQty(v)} contentStyle={{ color: "#000" }} />
                <Legend />
                <Area type="monotone" dataKey="وارد" stroke={CHART_COLORS[1]} fill={CHART_COLORS[1]} fillOpacity={0.3} />
                <Area type="monotone" dataKey="منصرف" stroke={CHART_COLORS[5]} fill={CHART_COLORS[5]} fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Movement Table */}
      <Card className="border-border/50">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h3 className="text-sm font-bold">جدول حركة المخزون</h3>
          <div className="flex items-center gap-2">
            <PrintButton
              data={filteredData.map(item => ({ code: item.code || "—", name: item.name, purchases: item.inPurchases ? item.inPurchases.toFixed(2) : "-", production: item.inProduction ? item.inProduction.toFixed(2) : "-", receipts: item.inReceipts ? item.inReceipts.toFixed(2) : "-", transfers: item.outTransfers ? item.outTransfers.toFixed(2) : "-", consumption: item.outConsumption ? item.outConsumption.toFixed(2) : "-", waste: item.outWaste ? item.outWaste.toFixed(2) : "-", bookQty: item.bookQty.toFixed(2), countQty: item.countQty ? item.countQty.toFixed(2) : "-", varQty: item.varQty ? item.varQty.toFixed(2) : "-", varVal: item.varVal ? item.varVal.toFixed(2) : "-" }))}
              columns={[{ key: "code", label: "الكود" }, { key: "name", label: "الخامة" }, { key: "purchases", label: "مشتريات" }, { key: "production", label: "إنتاج" }, { key: "receipts", label: "استلامات" }, { key: "transfers", label: "تحويلات" }, { key: "consumption", label: "استهلاك" }, { key: "waste", label: "هالك" }, { key: "bookQty", label: "الرصيد الدفتري" }, { key: "countQty", label: "رصيد الجرد" }, { key: "varQty", label: "تباين كمية" }, { key: "varVal", label: "تباين قيمة" }]}
              headerGroups={[{ label: "الكود", colSpan: 1 }, { label: "الخامة", colSpan: 1 }, { label: "الوارد", colSpan: 3 }, { label: "المنصرف", colSpan: 3 }, { label: "الرصيد الدفتري", colSpan: 1 }, { label: "رصيد الجرد", colSpan: 1 }, { label: "التباين", colSpan: 2 }]}
              title="حركة المخزون"
            />
            <ExportButtons
              data={filteredData.map(item => ({ code: item.code || "—", name: item.name, purchases: item.inPurchases ? item.inPurchases.toFixed(2) : "-", production: item.inProduction ? item.inProduction.toFixed(2) : "-", receipts: item.inReceipts ? item.inReceipts.toFixed(2) : "-", transfers: item.outTransfers ? item.outTransfers.toFixed(2) : "-", consumption: item.outConsumption ? item.outConsumption.toFixed(2) : "-", waste: item.outWaste ? item.outWaste.toFixed(2) : "-", bookQty: item.bookQty.toFixed(2), countQty: item.countQty ? item.countQty.toFixed(2) : "-", varQty: item.varQty ? item.varQty.toFixed(2) : "-", varVal: item.varVal ? item.varVal.toFixed(2) : "-" }))}
              columns={[{ key: "code", label: "الكود" }, { key: "name", label: "الخامة" }, { key: "purchases", label: "مشتريات" }, { key: "production", label: "إنتاج" }, { key: "receipts", label: "استلامات" }, { key: "transfers", label: "تحويلات" }, { key: "consumption", label: "استهلاك" }, { key: "waste", label: "هالك" }, { key: "bookQty", label: "الرصيد الدفتري" }, { key: "countQty", label: "رصيد الجرد" }, { key: "varQty", label: "تباين كمية" }, { key: "varVal", label: "تباين قيمة" }]}
              headerGroups={[{ label: "الكود", colSpan: 1 }, { label: "الخامة", colSpan: 1 }, { label: "الوارد", colSpan: 3 }, { label: "المنصرف", colSpan: 3 }, { label: "الرصيد الدفتري", colSpan: 1 }, { label: "رصيد الجرد", colSpan: 1 }, { label: "التباين", colSpan: 2 }]}
              filename="حركة_المخزون"
              title="حركة المخزون"
            />
          </div>
        </div>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead rowSpan={2} className="text-center border-l font-bold text-xs sticky right-0 bg-muted/30 z-10">الكود</TableHead>
                  <TableHead rowSpan={2} className="text-center border-l font-bold text-xs">اسم الخامة</TableHead>
                  <TableHead colSpan={3} className="text-center border-l font-bold text-xs bg-emerald-500/10 text-emerald-700">الوارد</TableHead>
                  <TableHead colSpan={3} className="text-center border-l font-bold text-xs bg-destructive/10 text-destructive">المنصرف</TableHead>
                  <TableHead rowSpan={2} className="text-center border-l font-bold text-xs">الرصيد الدفتري</TableHead>
                  <TableHead rowSpan={2} className="text-center border-l font-bold text-xs">رصيد الجرد الفعلي</TableHead>
                  <TableHead colSpan={2} className="text-center font-bold text-xs bg-amber-500/10 text-amber-700">التباين</TableHead>
                </TableRow>
                <TableRow className="bg-muted/20">
                  {/* Incoming sub-headers */}
                  <TableHead className="text-center border-l text-xs bg-emerald-500/5">مشتريات</TableHead>
                  <TableHead className="text-center border-l text-xs bg-emerald-500/5">إنتاج</TableHead>
                  <TableHead className="text-center border-l text-xs bg-emerald-500/5">استلامات</TableHead>
                  {/* Outgoing sub-headers */}
                  <TableHead className="text-center border-l text-xs bg-destructive/5">تحويلات</TableHead>
                  <TableHead className="text-center border-l text-xs bg-destructive/5">استهلاك</TableHead>
                  <TableHead className="text-center border-l text-xs bg-destructive/5">هالك</TableHead>
                  {/* Variance sub-headers */}
                  <TableHead className="text-center border-l text-xs bg-amber-500/5">كمية</TableHead>
                  <TableHead className="text-center text-xs bg-amber-500/5">قيمة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">
                      <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">لا توجد بيانات</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredData.map(item => (
                    <TableRow key={item.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="text-center text-xs font-mono border-l sticky right-0 bg-background">{item.code || "-"}</TableCell>
                      <TableCell className="text-xs font-medium border-l">{item.name}</TableCell>
                      <TableCell className="text-center text-xs border-l">{item.inPurchases ? fmtQty(item.inPurchases) : "-"}</TableCell>
                      <TableCell className="text-center text-xs border-l">{item.inProduction ? fmtQty(item.inProduction) : "-"}</TableCell>
                      <TableCell className="text-center text-xs border-l">{item.inReceipts ? fmtQty(item.inReceipts) : "-"}</TableCell>
                      <TableCell className="text-center text-xs border-l">{item.outTransfers ? fmtQty(item.outTransfers) : "-"}</TableCell>
                      <TableCell className="text-center text-xs border-l">{item.outConsumption ? fmtQty(item.outConsumption) : "-"}</TableCell>
                      <TableCell className="text-center text-xs border-l">{item.outWaste ? fmtQty(item.outWaste) : "-"}</TableCell>
                      <TableCell className="text-center text-xs font-semibold border-l">{fmtQty(item.bookQty)}</TableCell>
                      <TableCell className="text-center text-xs font-semibold border-l">{item.countQty ? fmtQty(item.countQty) : "-"}</TableCell>
                      <TableCell className={cn("text-center text-xs font-semibold border-l",
                        item.varQty > 0 ? "text-emerald-600" : item.varQty < 0 ? "text-destructive" : ""
                      )}>
                        {item.varQty ? fmtQty(item.varQty) : "-"}
                        {item.varQty > 0 && <TrendingUp className="h-3 w-3 inline mr-1" />}
                        {item.varQty < 0 && <TrendingDown className="h-3 w-3 inline mr-1" />}
                      </TableCell>
                      <TableCell className={cn("text-center text-xs font-semibold",
                        item.varVal > 0 ? "text-emerald-600" : item.varVal < 0 ? "text-destructive" : ""
                      )}>
                        {item.varVal ? fmtNum(item.varVal) : "-"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {filteredData.length > 0 && (
                <TableFooter>
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell colSpan={2} className="text-center text-xs border-l">الإجمالي</TableCell>
                    <TableCell className="text-center text-xs border-l">-</TableCell>
                    <TableCell className="text-center text-xs border-l">-</TableCell>
                    <TableCell className="text-center text-xs border-l">-</TableCell>
                    <TableCell className="text-center text-xs border-l">-</TableCell>
                    <TableCell className="text-center text-xs border-l">-</TableCell>
                    <TableCell className="text-center text-xs border-l">-</TableCell>
                    <TableCell className="text-center text-xs border-l">-</TableCell>
                    <TableCell className="text-center text-xs border-l">-</TableCell>
                    <TableCell className="text-center text-xs border-l">-</TableCell>
                    <TableCell className={cn("text-center text-xs font-bold",
                      totals.varVal >= 0 ? "text-emerald-600" : "text-destructive"
                    )}>{fmtNum(totals.varVal)}</TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
