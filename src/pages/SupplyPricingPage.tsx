import React, { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  allocateCharge,
  computeSupplyPrice,
  useBranchPolicies,
  useSupplyPricing,
  useWarehouseOverhead,
  type AllocationMethod,
  type BranchSupplyPolicy,
  type SupplyPricingRow,
} from "@/hooks/useSupplyPricing";
import {
  Search, Package, Building2, Eye,
  Calculator, Truck, Boxes, Percent, ChevronDown, ChevronUp,
  Plus, Trash2, RefreshCw, Receipt, Warehouse as WarehouseIcon, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PrintButton } from "@/components/PrintButton";
import { ExportButtons } from "@/components/ExportButtons";


const fmt = (n: number) => `${(Number(n) || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م`;
const fmtPct = (n: number) => `${Number(n || 0).toFixed(1)}%`;

const allocationLabels: Record<AllocationMethod, string> = {
  value: "حسب القيمة (موصى به)",
  weight: "حسب الوزن",
  volume: "حسب الحجم",
  quantity: "حسب الكمية",
  manual: "توزيع يدوي",
};

export const SupplyPricingPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const qc = useQueryClient();
  const { toast } = useToast();

  // Warehouses
  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses-supply", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("warehouses")
        .select("id, name, code, overhead_allocation_method")
        .eq("company_id", companyId!)
        .eq("active", true)
        .order("name");
      return data ?? [];
    },
  });

  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");
  React.useEffect(() => {
    if (!selectedWarehouseId && warehouses.length > 0) {
      setSelectedWarehouseId(warehouses[0].id);
    }
  }, [warehouses, selectedWarehouseId]);

  const selectedWarehouse = warehouses.find((w: any) => w.id === selectedWarehouseId);
  const allocationMethod: AllocationMethod =
    (selectedWarehouse?.overhead_allocation_method as AllocationMethod) || "value";

  // Items linked to the selected warehouse
  const { data: stockItems = [] } = useQuery({
    queryKey: ["stock-items-supply", companyId, selectedWarehouseId],
    enabled: !!companyId && !!selectedWarehouseId,
    queryFn: async () => {
      const { data: locs } = await supabase
        .from("stock_item_locations")
        .select("stock_item_id")
        .eq("company_id", companyId!)
        .eq("warehouse_id", selectedWarehouseId);
      const ids = Array.from(new Set((locs ?? []).map((r: any) => r.stock_item_id))).filter(Boolean);
      if (ids.length === 0) return [];
      const { data } = await supabase
        .from("stock_items")
        .select("id, code, name, stock_unit, current_stock, avg_cost, category_id, inventory_categories(name)")
        .eq("company_id", companyId!)
        .eq("active", true)
        .in("id", ids)
        .order("code", { ascending: true });
      return data ?? [];
    },
  });

  const { data: branches = [] } = useQuery({
    queryKey: ["branches-supply", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("branches")
        .select("id, name, code")
        .eq("company_id", companyId!)
        .eq("active", true)
        .order("name");
      return data ?? [];
    },
  });

  const { data: pricing = [] } = useSupplyPricing(companyId);
  const { data: policies = [] } = useBranchPolicies(companyId);
  const { data: overhead = [] } = useWarehouseOverhead(companyId, selectedWarehouseId);

  // last purchase prices
  const { data: lastPurchases = {} } = useQuery({
    queryKey: ["last-purchases", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("purchase_items")
        .select("stock_item_id, unit_price, created_at")
        .order("created_at", { ascending: false });
      const map: Record<string, number> = {};
      (data ?? []).forEach((r: any) => {
        if (r.stock_item_id && map[r.stock_item_id] == null) {
          map[r.stock_item_id] = Number(r.unit_price) || 0;
        }
      });
      return map;
    },
  });

  const pricingByItem = useMemo(() => {
    const m = new Map<string, SupplyPricingRow>();
    pricing.forEach((p) => m.set(p.stock_item_id, p));
    return m;
  }, [pricing]);

  // Total monthly overhead
  const totalOverhead = useMemo(
    () => overhead.filter((o) => o.is_active).reduce((s, o) => s + Number(o.monthly_amount || 0), 0),
    [overhead],
  );

  // Allocate overhead per item -> per unit
  const overheadByItem = useMemo(() => {
    if (!stockItems.length || !totalOverhead) {
      const m: Record<string, number> = {};
      stockItems.forEach((i: any) => (m[i.id] = 0));
      return m;
    }
    const itemsForAllocation = stockItems.map((it: any) => {
      const p = pricingByItem.get(it.id);
      return {
        id: it.id,
        current_stock: Number(it.current_stock) || 0,
        avg_cost: Number(it.avg_cost) || 0,
        unit_weight: Number(p?.unit_weight) || 0,
        unit_volume: Number(p?.unit_volume) || 0,
        manual_share: Number(p?.manual_overhead_share) || 0,
      };
    });
    const totalShares = allocateCharge(itemsForAllocation, totalOverhead, allocationMethod, false);
    const perUnit: Record<string, number> = {};
    stockItems.forEach((it: any) => {
      const qty = Math.max(Number(it.current_stock) || 0, 1);
      perUnit[it.id] = (totalShares[it.id] || 0) / qty;
    });
    return perUnit;
  }, [stockItems, pricingByItem, totalOverhead, allocationMethod]);

  // Allocate transport+loading per branch policy across available items -> per unit
  const transportPerUnitByBranch = useMemo(() => {
    const out = new Map<string, Record<string, { transport: number; loading: number }>>();
    const availableItems = stockItems.filter((it: any) => {
      const p = pricingByItem.get(it.id);
      return (p?.is_available_for_transfer ?? true);
    });
    // Items dataset for transport/loading allocation — uses manual_transport_share for "manual" method
    const itemsForAllocation = availableItems.map((it: any) => {
      const p = pricingByItem.get(it.id);
      return {
        id: it.id,
        current_stock: Number(it.current_stock) || 0,
        avg_cost: Number(it.avg_cost) || 0,
        unit_weight: Number(p?.unit_weight) || 0,
        unit_volume: Number(p?.unit_volume) || 0,
        manual_share: Number((p as any)?.manual_transport_share) || 0,
      };
    });
    policies.forEach((pol) => {
      const method = (pol.allocation_method as AllocationMethod) || "value";
      const tShares = allocateCharge(itemsForAllocation, Number(pol.transportation_cost) || 0, method, false);
      const lShares = allocateCharge(itemsForAllocation, Number(pol.loading_cost) || 0, method, false);
      const map: Record<string, { transport: number; loading: number }> = {};
      availableItems.forEach((it: any) => {
        const qty = Math.max(Number(it.current_stock) || 0, 1);
        map[it.id] = {
          transport: (tShares[it.id] || 0) / qty,
          loading: (lShares[it.id] || 0) / qty,
        };
      });
      out.set(pol.branch_id, map);
    });
    return out;
  }, [stockItems, pricingByItem, policies]);


  // Filters
  const [search, setSearch] = useState("");
  const [supplyTypeFilter, setSupplyTypeFilter] = useState<"all" | "cost" | "cost_plus_profit">("all");
  const [availFilter, setAvailFilter] = useState<"all" | "yes" | "no">("all");

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stockItems.filter((it: any) => {
      if (q && !`${it.name} ${it.code ?? ""}`.toLowerCase().includes(q)) return false;
      const p = pricingByItem.get(it.id);
      const type = p?.supply_type ?? "cost_plus_profit";
      if (supplyTypeFilter !== "all" && type !== supplyTypeFilter) return false;
      const avail = p?.is_available_for_transfer ?? true;
      if (availFilter === "yes" && !avail) return false;
      if (availFilter === "no" && avail) return false;
      return true;
    });
  }, [stockItems, search, supplyTypeFilter, availFilter, pricingByItem]);

  const kpis = useMemo(() => {
    const total = stockItems.length;
    const configured = stockItems.filter((it: any) => pricingByItem.has(it.id)).length;
    const available = stockItems.filter((it: any) => (pricingByItem.get(it.id)?.is_available_for_transfer ?? true)).length;
    const avgProfit =
      policies.length > 0
        ? policies.reduce((s, p) => s + Number(p.profit_percentage ?? 0), 0) / policies.length
        : 0;
    return { total, configured, available, avgProfit };
  }, [stockItems, pricing, policies, pricingByItem]);

  // Save handlers
  const upsertPricing = async (row: Partial<SupplyPricingRow> & { stock_item_id: string }) => {
    if (!companyId) return;
    const existing = pricingByItem.get(row.stock_item_id);
    if (existing) {
      const { error } = await (supabase as any)
        .from("stock_item_supply_pricing")
        .update({ ...row, last_calculated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await (supabase as any)
        .from("stock_item_supply_pricing")
        .insert({
          company_id: companyId,
          stock_item_id: row.stock_item_id,
          supply_type: row.supply_type ?? "cost_plus_profit",
          manufacturing_cost: row.manufacturing_cost ?? 0,
          packaging_cost: row.packaging_cost ?? 0,
          auto_calculate: row.auto_calculate ?? true,
          manual_base_price: row.manual_base_price ?? null,
          is_available_for_transfer: row.is_available_for_transfer ?? true,
          manual_overhead_share: row.manual_overhead_share ?? 0,
          manual_transport_share: (row as any).manual_transport_share ?? 0,
          unit_weight: row.unit_weight ?? 0,
          unit_volume: row.unit_volume ?? 0,
          last_calculated_at: new Date().toISOString(),
        });
      if (error) throw error;
    }
    await qc.refetchQueries({ queryKey: ["supply-pricing", companyId] });
  };


  const upsertPolicy = async (branchId: string, patch: Partial<BranchSupplyPolicy>) => {
    if (!companyId) return;
    const existing = policies.find((p) => p.branch_id === branchId);
    if (existing) {
      const { error } = await (supabase as any).from("branch_supply_policies").update(patch).eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await (supabase as any).from("branch_supply_policies").insert({
        company_id: companyId,
        branch_id: branchId,
        profit_percentage: patch.profit_percentage ?? 0,
        transportation_cost: patch.transportation_cost ?? 0,
        loading_cost: patch.loading_cost ?? 0,
        minimum_order_value: patch.minimum_order_value ?? 0,
        is_active: patch.is_active ?? true,
        allocation_method: patch.allocation_method ?? "value",
      });
      if (error) throw error;
    }
    await qc.invalidateQueries({ queryKey: ["branch-supply-policies", companyId] });
  };

  const setWarehouseAllocation = async (method: AllocationMethod) => {
    if (!selectedWarehouseId) return;
    const { error } = await (supabase as any)
      .from("warehouses")
      .update({ overhead_allocation_method: method })
      .eq("id", selectedWarehouseId);
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
      return;
    }
    await qc.refetchQueries({ queryKey: ["warehouses-supply", companyId] });
    toast({ title: "تم", description: `تم تحديث طريقة التوزيع إلى: ${allocationLabels[method]}` });
  };

  // Overhead CRUD
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expenseName, setExpenseName] = useState("");
  const [expenseAmount, setExpenseAmount] = useState<number>(0);

  const addExpense = async () => {
    if (!companyId || !selectedWarehouseId || !expenseName.trim()) {
      toast({ title: "تنبيه", description: "اختر مخزن واكتب اسم البند", variant: "destructive" });
      return;
    }
    const { error } = await (supabase as any).from("warehouse_overhead_expenses").insert({
      company_id: companyId,
      warehouse_id: selectedWarehouseId,
      expense_name: expenseName.trim(),
      monthly_amount: Number(expenseAmount) || 0,
      is_active: true,
    });
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
      return;
    }
    setExpenseName("");
    setExpenseAmount(0);
    setShowAddExpense(false);
    await qc.refetchQueries({ queryKey: ["warehouse-overhead", companyId, selectedWarehouseId] });
    toast({ title: "تم", description: "تم إضافة البند بنجاح" });
  };

  const updateExpense = async (id: string, patch: any) => {
    const { error } = await (supabase as any).from("warehouse_overhead_expenses").update(patch).eq("id", id);
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
      return;
    }
    await qc.refetchQueries({ queryKey: ["warehouse-overhead", companyId, selectedWarehouseId] });
  };

  const deleteExpense = async (id: string) => {
    const { error } = await (supabase as any).from("warehouse_overhead_expenses").delete().eq("id", id);
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
      return;
    }
    await qc.refetchQueries({ queryKey: ["warehouse-overhead", companyId, selectedWarehouseId] });
    toast({ title: "تم", description: "تم حذف البند" });
  };

  // Bulk: apply overhead share to manufacturing_cost for all filtered items
  const applyOverheadToManufacturing = async () => {
    try {
      for (const it of filteredItems) {
        const share = overheadByItem[it.id] || 0;
        await upsertPricing({ stock_item_id: it.id, manufacturing_cost: Number(share.toFixed(4)) });
      }
      toast({
        title: "تم",
        description: `تم تحميل نصيب المصاريف غير المباشرة على ${filteredItems.length} صنف`,
      });
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    }
  };

  // Per-row preview
  const [previewItem, setPreviewItem] = useState<any | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Export columns & data for items table
  const exportColumns = [
    { key: "code", label: "الكود" },
    { key: "name", label: "اسم الخامة" },
    { key: "category", label: "المجموعة" },
    { key: "stock", label: "الرصيد" },
    { key: "unit", label: "الوحدة" },
    { key: "wac", label: "WAC" },
    { key: "last_purchase", label: "آخر شراء" },
    { key: "overhead_share", label: "نصيب مصاريف/وحدة" },
    { key: "packaging", label: "تعبئة" },
    { key: "base_price", label: "السعر الأساسي" },
    { key: "available", label: "متاح للتوريد" },
    { key: "supply_type", label: "نوع التوريد" },
  ];
  const exportData = filteredItems.map((it: any) => {
    const p = pricingByItem.get(it.id);
    const lastP = lastPurchases[it.id] ?? 0;
    const overheadPerUnit = overheadByItem[it.id] || 0;
    const base = computeSupplyPrice({
      wac: Number(it.avg_cost) || 0,
      lastPurchasePrice: lastP,
      currentStock: Number(it.current_stock) || 0,
      pricing: p,
      overheadPerUnit,
    }).baseCost;
    return {
      code: it.code ?? "—",
      name: it.name,
      category: it.inventory_categories?.name ?? "—",
      stock: Number(it.current_stock).toFixed(2),
      unit: it.stock_unit ?? "—",
      wac: Number(it.avg_cost || 0).toFixed(2),
      last_purchase: Number(lastP).toFixed(2),
      overhead_share: overheadPerUnit.toFixed(2),
      packaging: Number(p?.packaging_cost ?? 0).toFixed(2),
      base_price: base.toFixed(2),
      available: (p?.is_available_for_transfer ?? true) ? "نعم" : "لا",
      supply_type: (p?.supply_type ?? "cost_plus_profit") === "cost" ? "تكلفة فقط" : "تكلفة + ربح",
    };
  });
  const exportFilters = [
    { label: "المخزن", value: selectedWarehouse?.name ?? "" },
    { label: "طريقة التوزيع", value: allocationLabels[allocationMethod] },
    { label: "إجمالي المصاريف الشهرية", value: fmt(totalOverhead) },
  ];



  return (
    <div className="space-y-6 max-w-[1600px] mx-auto" dir="rtl">
      {/* Header */}
      <div className="glass-card p-6 rounded-2xl">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2">
              <Boxes className="text-primary" size={28} />
              تسعير المخزن المركزي
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              تسعير الخامات للفروع بناءً على التكلفة + الربح + النقل + التحميل، مع توزيع المصاريف غير المباشرة.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <WarehouseIcon size={16} className="text-muted-foreground" />
            <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="اختر المخزن" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w: any) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <PrintButton
              data={exportData}
              columns={exportColumns}
              title={`تسعير المخزن المركزي — ${selectedWarehouse?.name ?? ""}`}
              filters={exportFilters}
            />
            <ExportButtons
              data={exportData}
              columns={exportColumns}
              filename={`supply-pricing-${selectedWarehouse?.name ?? "warehouse"}`}
              title={`تسعير المخزن المركزي — ${selectedWarehouse?.name ?? ""}`}
              filters={exportFilters}
            />
          </div>

        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4">
          <div className="rounded-xl bg-primary/10 border border-primary/20 p-4 flex items-center gap-3">
            <Package className="text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">إجمالي الخامات بالمخزن</p>
              <p className="text-xl font-black">{kpis.total}</p>
            </div>
          </div>
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 flex items-center gap-3">
            <Calculator className="text-emerald-500" />
            <div>
              <p className="text-xs text-muted-foreground">متاح للتوريد</p>
              <p className="text-xl font-black">{kpis.available} / {kpis.total}</p>
            </div>
          </div>
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 flex items-center gap-3">
            <Receipt className="text-amber-500" />
            <div>
              <p className="text-xs text-muted-foreground">إجمالي المصاريف الشهرية</p>
              <p className="text-lg font-black">{fmt(totalOverhead)}</p>
            </div>
          </div>
          <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-4 flex items-center gap-3">
            <Percent className="text-blue-500" />
            <div>
              <p className="text-xs text-muted-foreground">متوسط هامش الربح</p>
              <p className="text-xl font-black">{fmtPct(kpis.avgProfit)}</p>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="items" className="w-full">
        <TabsList className="grid grid-cols-3 w-full md:w-[700px]">
          <TabsTrigger value="items" className="gap-2"><Package size={16}/>تسعير الخامات</TabsTrigger>
          <TabsTrigger value="overhead" className="gap-2"><Receipt size={16}/>المصاريف غير المباشرة</TabsTrigger>
          <TabsTrigger value="policies" className="gap-2"><Building2 size={16}/>سياسات الفروع</TabsTrigger>
        </TabsList>

        {/* ----------- TAB: Items ----------- */}
        <TabsContent value="items" className="space-y-4">
          <Card>
            <CardContent className="p-4 flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <Input className="pr-9" placeholder="بحث بالاسم أو الكود..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={availFilter} onValueChange={(v: any) => setAvailFilter(v)}>
                <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="yes">متاح للتوريد فقط</SelectItem>
                  <SelectItem value="no">غير متاح فقط</SelectItem>
                </SelectContent>
              </Select>
              <Select value={supplyTypeFilter} onValueChange={(v: any) => setSupplyTypeFilter(v)}>
                <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل أنواع التوريد</SelectItem>
                  <SelectItem value="cost">تكلفة فقط</SelectItem>
                  <SelectItem value="cost_plus_profit">تكلفة + ربح</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-center w-12"></TableHead>
                    <TableHead className="text-center">الكود</TableHead>
                    <TableHead className="text-center">اسم الخامة</TableHead>
                    <TableHead className="text-center">المجموعة</TableHead>
                    <TableHead className="text-center">الرصيد</TableHead>
                    <TableHead className="text-center">WAC</TableHead>
                    <TableHead className="text-center">آخر شراء</TableHead>
                    <TableHead className="text-center">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>نصيب المصاريف / وحدة</TooltipTrigger>
                          <TooltipContent>
                            <p>محسوب من المصاريف غير المباشرة الشهرية حسب طريقة: <b>{allocationLabels[allocationMethod]}</b></p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                    <TableHead className="text-center">متاح للتوريد</TableHead>
                    <TableHead className="text-center">نوع التوريد</TableHead>
                    
                    <TableHead className="text-center">تعبئة</TableHead>
                    <TableHead className="text-center">حساب تلقائي</TableHead>
                    <TableHead className="text-center">السعر الأساسي</TableHead>
                    <TableHead className="text-center">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((it: any) => {
                    const p = pricingByItem.get(it.id);
                    const lastP = lastPurchases[it.id] ?? 0;
                    const overheadPerUnit = overheadByItem[it.id] || 0;
                    const avail = p?.is_available_for_transfer ?? true;
                    const basePreview = computeSupplyPrice({
                      wac: Number(it.avg_cost) || 0,
                      lastPurchasePrice: lastP,
                      currentStock: Number(it.current_stock) || 0,
                      pricing: p,
                      overheadPerUnit,
                    }).baseCost;
                    const isExpanded = expandedId === it.id;
                    return (
                      <React.Fragment key={`${it.id}-${p?.id ?? "new"}-${p?.last_calculated_at ?? ""}`}>
                        <TableRow className={cn("hover:bg-muted/30", !avail && "opacity-50")}>
                          <TableCell className="text-center">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setExpandedId(isExpanded ? null : it.id)}>
                              {isExpanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                            </Button>
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs">{it.code ?? "—"}</TableCell>
                          <TableCell className="text-center font-medium">{it.name}</TableCell>
                          <TableCell className="text-center text-xs text-muted-foreground">{it.inventory_categories?.name ?? "—"}</TableCell>
                          <TableCell className="text-center text-xs">{Number(it.current_stock).toFixed(2)} {it.stock_unit}</TableCell>
                          <TableCell className="text-center text-xs">{fmt(Number(it.avg_cost) || 0)}</TableCell>
                          <TableCell className="text-center text-xs">{fmt(lastP)}</TableCell>
                          <TableCell className="text-center text-xs font-mono text-amber-600">{fmt(overheadPerUnit)}</TableCell>
                          <TableCell className="text-center">
                            <Switch
                              checked={avail}
                              onCheckedChange={(v) => upsertPricing({ stock_item_id: it.id, is_available_for_transfer: v })}
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Select
                              value={p?.supply_type ?? "cost_plus_profit"}
                              onValueChange={(v: any) => upsertPricing({ stock_item_id: it.id, supply_type: v })}
                            >
                              <SelectTrigger className="h-8 w-[120px] mx-auto text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="cost">تكلفة فقط</SelectItem>
                                <SelectItem value="cost_plus_profit">تكلفة + ربح</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-center">
                            <Input type="number" className="h-8 w-20 mx-auto text-xs text-center"
                              defaultValue={p?.packaging_cost ?? 0}
                              onBlur={(e) => {
                                const v = Number(e.target.value) || 0;
                                if (v !== Number(p?.packaging_cost ?? 0)) upsertPricing({ stock_item_id: it.id, packaging_cost: v });
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Switch checked={p?.auto_calculate ?? true} onCheckedChange={(v) => upsertPricing({ stock_item_id: it.id, auto_calculate: v })} />
                          </TableCell>
                          <TableCell className="text-center text-xs font-bold text-primary">{fmt(basePreview)}</TableCell>
                          <TableCell className="text-center">
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setPreviewItem({ ...it, lastP, overheadPerUnit })}>
                              <Eye size={12}/> الأسعار
                            </Button>
                          </TableCell>
                        </TableRow>

                        {isExpanded && (
                          <TableRow className="bg-muted/20">
                            <TableCell colSpan={14} className="p-4">
                              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                                <div>
                                  <label className="text-xs text-muted-foreground flex items-center gap-1">
                                    سعر يدوي
                                    <span className="text-[10px] text-amber-600">(يلغي الحساب التلقائي)</span>
                                  </label>
                                  <Input type="number" className="mt-1 h-9"
                                    placeholder="فارغ = استخدام التلقائي"
                                    defaultValue={p?.manual_base_price ?? ""}
                                    onBlur={(e) => {
                                      const raw = e.target.value;
                                      if (raw === "") {
                                        // clear manual and re-enable auto
                                        upsertPricing({ stock_item_id: it.id, manual_base_price: null as any, auto_calculate: true });
                                      } else {
                                        const v = Number(raw) || 0;
                                        // entering a manual price disables auto-calc so it actually applies
                                        upsertPricing({ stock_item_id: it.id, manual_base_price: v as any, auto_calculate: false });
                                      }
                                    }}
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-muted-foreground">
                                    وزن الوحدة (كجم) <span className="text-[10px]">— للتوزيع حسب الوزن</span>
                                  </label>
                                  <Input type="number" step="0.001" className="mt-1 h-9"
                                    defaultValue={p?.unit_weight ?? 0}
                                    onBlur={(e) => upsertPricing({ stock_item_id: it.id, unit_weight: Number(e.target.value) || 0 })}
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-muted-foreground">
                                    حجم الوحدة (لتر) <span className="text-[10px]">— للتوزيع حسب الحجم</span>
                                  </label>
                                  <Input type="number" step="0.001" className="mt-1 h-9"
                                    defaultValue={p?.unit_volume ?? 0}
                                    onBlur={(e) => upsertPricing({ stock_item_id: it.id, unit_volume: Number(e.target.value) || 0 })}
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-muted-foreground">
                                    نصيب يدوي من المصاريف <span className="text-[10px]">— للتوزيع اليدوي</span>
                                  </label>
                                  <Input type="number" step="0.01" className="mt-1 h-9"
                                    defaultValue={p?.manual_overhead_share ?? 0}
                                    onBlur={(e) => upsertPricing({ stock_item_id: it.id, manual_overhead_share: Number(e.target.value) || 0 })}
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-muted-foreground">
                                    نصيب تحميل/نقل يدوي <span className="text-[10px]">— للتوزيع اليدوي بالفروع</span>
                                  </label>
                                  <Input type="number" step="0.01" className="mt-1 h-9"
                                    defaultValue={(p as any)?.manual_transport_share ?? 0}
                                    onBlur={(e) => upsertPricing({ stock_item_id: it.id, manual_transport_share: Number(e.target.value) || 0 } as any)}
                                  />
                                </div>
                                <div className="md:col-span-5 rounded-lg bg-card p-3 text-xs space-y-1 border">
                                  <p className="font-bold mb-1">معادلة السعر الأساسي:</p>
                                  <p>WAC: <span className="font-mono">{fmt(Number(it.avg_cost)||0)}</span>
                                    {" + تعبئة: "}<span className="font-mono">{fmt(Number(p?.packaging_cost ?? 0))}</span>
                                    {" + نصيب مصاريف غير مباشرة: "}<span className="font-mono text-amber-600">{fmt(overheadPerUnit)}</span>
                                    {" = "}<span className="font-bold text-primary">{fmt(basePreview)}</span>

                                  </p>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {filteredItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={14} className="text-center py-8 text-muted-foreground">لا توجد خامات</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ----------- TAB: Overhead ----------- */}
        <TabsContent value="overhead" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Receipt size={18}/> المصاريف غير المباشرة الشهرية للمخزن
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                إيجار، مرتبات، فواتير، صيانة... يتم توزيعها على الأصناف حسب الطريقة المختارة، فينعكس نصيب كل صنف على سعر التوريد للفروع.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm">طريقة التوزيع:</span>
                  <Select value={allocationMethod} onValueChange={(v: any) => setWarehouseAllocation(v)}>
                    <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(allocationLabels) as AllocationMethod[]).map((k) => (
                        <SelectItem key={k} value={k}>{allocationLabels[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="mr-auto flex items-center gap-2">
                  <Badge variant="outline" className="text-sm">إجمالي شهري: <b className="mx-1">{fmt(totalOverhead)}</b></Badge>
                  <Button size="sm" onClick={() => setShowAddExpense(true)} className="gap-1"><Plus size={14}/> إضافة بند</Button>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-center">اسم البند</TableHead>
                    <TableHead className="text-center">المبلغ الشهري</TableHead>
                    <TableHead className="text-center">مفعَّل</TableHead>
                    <TableHead className="text-center">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overhead.map((ex) => (
                    <TableRow key={ex.id} className={!ex.is_active ? "opacity-60" : ""}>
                      <TableCell className="text-center">
                        <Input className="h-9 max-w-[280px] mx-auto text-center" defaultValue={ex.expense_name}
                          onBlur={(e) => { if (e.target.value !== ex.expense_name) updateExpense(ex.id, { expense_name: e.target.value }); }}/>
                      </TableCell>
                      <TableCell className="text-center">
                        <Input type="number" className="h-9 w-32 mx-auto text-center" defaultValue={ex.monthly_amount}
                          onBlur={(e) => { const v = Number(e.target.value) || 0; if (v !== Number(ex.monthly_amount)) updateExpense(ex.id, { monthly_amount: v }); }}/>
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch checked={ex.is_active} onCheckedChange={(v) => updateExpense(ex.id, { is_active: v })}/>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteExpense(ex.id)}>
                          <Trash2 size={14}/>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {overhead.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        لا توجد بنود مصاريف. أضف أول بند (إيجار / مرتبات / فواتير...)
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ----------- TAB: Branch policies ----------- */}
        <TabsContent value="policies" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 size={18}/> سياسة التوريد لكل فرع
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                كل فرع له نسبة ربح وتكلفة نقل وتكلفة تحميل خاصة به، وطريقة لتوزيع النقل والتحميل على بنود التحويل.
              </p>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-center">الفرع</TableHead>
                    <TableHead className="text-center">تفعيل التوريد</TableHead>
                    <TableHead className="text-center">نسبة الربح %</TableHead>
                    <TableHead className="text-center">تكلفة النقل</TableHead>
                    <TableHead className="text-center">تكلفة التحميل</TableHead>
                    <TableHead className="text-center">حد أدنى للأمر</TableHead>
                    <TableHead className="text-center">طريقة توزيع النقل/التحميل</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {branches.map((br: any) => {
                    const pol = policies.find((p) => p.branch_id === br.id);
                    const isActive = pol?.is_active ?? true;
                    return (
                      <TableRow key={br.id} className={!isActive ? "opacity-60" : ""}>
                        <TableCell className="text-center font-medium">
                          <div className="flex items-center gap-2 justify-center">
                            <Building2 size={14} className="text-primary"/>{br.name}
                            {br.code && <Badge variant="outline" className="font-mono text-[10px]">{br.code}</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center gap-1">
                            <Switch checked={isActive} onCheckedChange={(v) => upsertPolicy(br.id, { is_active: v })}/>
                            <Badge variant={isActive ? "default" : "outline"} className={cn("text-[10px] font-bold",
                              isActive ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/15" : "text-muted-foreground")}>
                              {isActive ? "مفعَّل" : "معطَّل — بالتكلفة فقط"}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Input type="number" step="0.1" disabled={!isActive} className="h-8 w-24 mx-auto text-center"
                            defaultValue={pol?.profit_percentage ?? 0}
                            onBlur={(e) => upsertPolicy(br.id, { profit_percentage: Number(e.target.value) || 0 })}/>
                        </TableCell>
                        <TableCell className="text-center">
                          <Input type="number" disabled={!isActive} className="h-8 w-28 mx-auto text-center"
                            defaultValue={pol?.transportation_cost ?? 0}
                            onBlur={(e) => upsertPolicy(br.id, { transportation_cost: Number(e.target.value) || 0 })}/>
                        </TableCell>
                        <TableCell className="text-center">
                          <Input type="number" disabled={!isActive} className="h-8 w-28 mx-auto text-center"
                            defaultValue={pol?.loading_cost ?? 0}
                            onBlur={(e) => upsertPolicy(br.id, { loading_cost: Number(e.target.value) || 0 })}/>
                        </TableCell>
                        <TableCell className="text-center">
                          <Input type="number" disabled={!isActive} className="h-8 w-28 mx-auto text-center"
                            defaultValue={pol?.minimum_order_value ?? 0}
                            onBlur={(e) => upsertPolicy(br.id, { minimum_order_value: Number(e.target.value) || 0 })}/>
                        </TableCell>
                        <TableCell className="text-center">
                          <Select value={(pol?.allocation_method ?? "value")} disabled={!isActive}
                            onValueChange={(v: any) => upsertPolicy(br.id, { allocation_method: v })}>
                            <SelectTrigger className="h-8 w-[180px] mx-auto text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {(Object.keys(allocationLabels) as AllocationMethod[]).map((k) => (
                                <SelectItem key={k} value={k}>{allocationLabels[k]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {branches.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">لا توجد فروع</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Expense Dialog */}
      <Dialog open={showAddExpense} onOpenChange={setShowAddExpense}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle>إضافة بند مصاريف</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">اسم البند</label>
              <Input value={expenseName} onChange={(e) => setExpenseName(e.target.value)} placeholder="إيجار / مرتبات / كهرباء..."/>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">المبلغ الشهري (ج.م)</label>
              <Input type="number" value={expenseAmount} onChange={(e) => setExpenseAmount(Number(e.target.value) || 0)}/>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowAddExpense(false)}>إلغاء</Button>
              <Button onClick={addExpense}>حفظ</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewItem} onOpenChange={(o) => !o && setPreviewItem(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck size={18} className="text-primary"/>
              معاينة سعر التوريد لكل فرع — {previewItem?.name}
            </DialogTitle>
          </DialogHeader>
          {previewItem && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-center">الفرع</TableHead>
                  <TableHead className="text-center">السعر الأساسي</TableHead>
                  <TableHead className="text-center">نصيب مصاريف</TableHead>
                  <TableHead className="text-center">الربح %</TableHead>
                  <TableHead className="text-center">قيمة الربح</TableHead>
                  <TableHead className="text-center">نقل + تحميل</TableHead>
                  <TableHead className="text-center">السعر النهائي</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.map((br: any) => {
                  const p = pricingByItem.get(previewItem.id);
                  const pol = policies.find((x) => x.branch_id === br.id);
                  const tl = transportPerUnitByBranch.get(br.id)?.[previewItem.id];
                  const r = computeSupplyPrice({
                    wac: Number(previewItem.avg_cost) || 0,
                    lastPurchasePrice: previewItem.lastP,
                    currentStock: Number(previewItem.current_stock) || 0,
                    pricing: p,
                    policy: pol,
                    overheadPerUnit: previewItem.overheadPerUnit,
                    transportPerUnitOverride: tl?.transport ?? 0,
                    loadingPerUnitOverride: tl?.loading ?? 0,
                    quantity: 1,
                  });
                  return (
                    <TableRow key={br.id}>
                      <TableCell className="text-center font-medium">{br.name}</TableCell>
                      <TableCell className="text-center font-mono text-xs">{fmt(r.baseCost)}</TableCell>
                      <TableCell className="text-center font-mono text-xs text-amber-600">{fmt(r.overheadPerUnit)}</TableCell>
                      <TableCell className="text-center text-xs">{fmtPct(Number(pol?.profit_percentage ?? 0))}</TableCell>
                      <TableCell className="text-center font-mono text-xs text-emerald-600">{fmt(r.profitAmount)}</TableCell>
                      <TableCell className="text-center font-mono text-xs text-amber-600">{fmt(r.transportPerUnit + r.loadingPerUnit)}</TableCell>
                      <TableCell className="text-center font-mono text-sm font-black text-primary">{fmt(r.finalUnitPrice)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SupplyPricingPage;
