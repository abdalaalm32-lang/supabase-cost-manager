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
import { useToast } from "@/hooks/use-toast";
import { useLocationStock } from "@/hooks/useLocationStock";
import {
  computeSupplyPrice,
  computeMonthlyRate,
  useBranchPolicies,
  useSupplyPricing,
  useWarehouseOverhead,
  useWarehouseMonthlyRates,
  type BranchSupplyPolicy,
  type SupplyPricingRow,
} from "@/hooks/useSupplyPricing";
import {
  Search, Package, Building2, Eye,
  Calculator, Truck, Boxes, Percent, ChevronDown, ChevronUp,
  Plus, Trash2, Receipt, Warehouse as WarehouseIcon, Info,
  CheckCircle2, TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PrintButton } from "@/components/PrintButton";
import { ExportButtons } from "@/components/ExportButtons";

const fmt = (n: number) => `${(Number(n) || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م`;
const fmtPct = (n: number) => `${Number(n || 0).toFixed(2)}%`;

const currentMonthStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const prevMonthStr = (m: string) => {
  const [y, mm] = m.split("-").map(Number);
  const d = new Date(y, mm - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const monthLabel = (m: string) => {
  const [y, mm] = m.split("-").map(Number);
  const d = new Date(y, mm - 1, 1);
  return d.toLocaleDateString("ar-EG", { year: "numeric", month: "long" });
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
        .select("id, name, code, estimated_overhead_rate")
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

  // Per-warehouse live balance
  const { getLocationStock } = useLocationStock(selectedWarehouseId || null, "warehouse");

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
  const { data: monthlyRates = [] } = useWarehouseMonthlyRates(companyId, selectedWarehouseId);

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

  // Total monthly overhead (active)
  const totalOverhead = useMemo(
    () => overhead.filter((o) => o.is_active).reduce((s, o) => s + Number(o.monthly_amount || 0), 0),
    [overhead],
  );

  // Current effective rate = current-month saved rate → most recent prior → estimated
  const currentRate = useMemo(() => {
    const cm = currentMonthStr();
    const thisMonth = monthlyRates.find((r) => r.month === cm);
    if (thisMonth) return { rate: Number(thisMonth.rate) || 0, source: "current" as const, month: cm };
    const prior = monthlyRates.find((r) => r.month < cm);
    if (prior) return { rate: Number(prior.rate) || 0, source: "prior" as const, month: prior.month };
    return {
      rate: Number(selectedWarehouse?.estimated_overhead_rate ?? 0),
      source: "estimated" as const,
      month: cm,
    };
  }, [monthlyRates, selectedWarehouse]);

  // Filters
  const [search, setSearch] = useState("");
  const [supplyTypeFilter, setSupplyTypeFilter] = useState<"all" | "cost" | "cost_plus_profit">("all");
  const [availFilter, setAvailFilter] = useState<"all" | "yes" | "no">("all");
  const [selectedBranchId, setSelectedBranchId] = useState<string>("all");

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
    const available = stockItems.filter((it: any) => (pricingByItem.get(it.id)?.is_available_for_transfer ?? true)).length;
    const avgProfit =
      policies.length > 0
        ? policies.reduce((s, p) => s + Number(p.profit_percentage ?? 0), 0) / policies.length
        : 0;
    return { total, available, avgProfit };
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
          packaging_cost: row.packaging_cost ?? 0,
          auto_calculate: row.auto_calculate ?? true,
          manual_base_price: row.manual_base_price ?? null,
          is_available_for_transfer: row.is_available_for_transfer ?? true,
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
      });
      if (error) throw error;
    }
    await qc.invalidateQueries({ queryKey: ["branch-supply-policies", companyId] });
  };

  const setEstimatedRate = async (rate: number) => {
    if (!selectedWarehouseId) return;
    const { error } = await (supabase as any)
      .from("warehouses")
      .update({ estimated_overhead_rate: rate })
      .eq("id", selectedWarehouseId);
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
      return;
    }
    await qc.refetchQueries({ queryKey: ["warehouses-supply", companyId] });
    toast({ title: "تم", description: `تم حفظ المعدل التقديري: ${rate.toFixed(2)}%` });
  };

  // Overhead expense CRUD
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
    toast({ title: "تم", description: "تم إضافة البند" });
  };

  const updateExpense = async (id: string, patch: any) => {
    const { error } = await (supabase as any).from("warehouse_overhead_expenses").update(patch).eq("id", id);
    if (error) { toast({ title: "خطأ", description: error.message, variant: "destructive" }); return; }
    await qc.refetchQueries({ queryKey: ["warehouse-overhead", companyId, selectedWarehouseId] });
  };

  const deleteExpense = async (id: string) => {
    const { error } = await (supabase as any).from("warehouse_overhead_expenses").delete().eq("id", id);
    if (error) { toast({ title: "خطأ", description: error.message, variant: "destructive" }); return; }
    await qc.refetchQueries({ queryKey: ["warehouse-overhead", companyId, selectedWarehouseId] });
  };

  // Monthly rate actions
  const calculateAndSaveMonthRate = async (month: string, status: "estimated" | "actual" | "approved" = "actual") => {
    if (!companyId || !selectedWarehouseId) return;
    const { expenses, transfers, rate } = await computeMonthlyRate(companyId, selectedWarehouseId, month);
    const existing = monthlyRates.find((r) => r.month === month);
    if (existing) {
      const { error } = await (supabase as any)
        .from("warehouse_overhead_monthly_rates")
        .update({ expenses_total: expenses, transfers_total: transfers, rate, status })
        .eq("id", existing.id);
      if (error) { toast({ title: "خطأ", description: error.message, variant: "destructive" }); return; }
    } else {
      const { error } = await (supabase as any).from("warehouse_overhead_monthly_rates").insert({
        company_id: companyId,
        warehouse_id: selectedWarehouseId,
        month,
        expenses_total: expenses,
        transfers_total: transfers,
        rate,
        status,
      });
      if (error) { toast({ title: "خطأ", description: error.message, variant: "destructive" }); return; }
    }
    await qc.refetchQueries({ queryKey: ["warehouse-monthly-rates", companyId, selectedWarehouseId] });
    toast({ title: "تم", description: `تم احتساب معدل ${monthLabel(month)}: ${rate.toFixed(2)}%` });
  };

  const approveMonthRate = async (id: string) => {
    const { error } = await (supabase as any)
      .from("warehouse_overhead_monthly_rates")
      .update({ status: "approved" }).eq("id", id);
    if (error) { toast({ title: "خطأ", description: error.message, variant: "destructive" }); return; }
    await qc.refetchQueries({ queryKey: ["warehouse-monthly-rates", companyId, selectedWarehouseId] });
    toast({ title: "تم اعتماد المعدل" });
  };

  const deleteMonthRate = async (id: string) => {
    const { error } = await (supabase as any).from("warehouse_overhead_monthly_rates").delete().eq("id", id);
    if (error) { toast({ title: "خطأ", description: error.message, variant: "destructive" }); return; }
    await qc.refetchQueries({ queryKey: ["warehouse-monthly-rates", companyId, selectedWarehouseId] });
  };

  // Per-row preview
  const [previewItem, setPreviewItem] = useState<any | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Helper: live per-warehouse balance for an item
  const liveBalance = (it: any) => {
    const v = getLocationStock(it.id);
    return Number.isFinite(v) ? v : Number(it.current_stock) || 0;
  };

  // Per-branch final unit price
  const computeBranchFinal = (it: any, branchId: string): number => {
    const p = pricingByItem.get(it.id);
    const pol = policies.find((x) => x.branch_id === branchId);
    if (!pol) return 0;
    const r = computeSupplyPrice({
      wac: Number(it.avg_cost) || 0,
      lastPurchasePrice: lastPurchases[it.id] ?? 0,
      currentStock: liveBalance(it),
      pricing: p,
      policy: pol,
      overheadRate: currentRate.rate,
      quantity: 1,
    });
    return r.finalUnitPrice;
  };

  const selectedBranch = branches.find((b: any) => b.id === selectedBranchId);

  // Export columns & data
  const exportColumns = [
    { key: "code", label: "الكود" },
    { key: "name", label: "اسم الخامة" },
    { key: "category", label: "المجموعة" },
    { key: "stock", label: "الرصيد الحالي" },
    { key: "unit", label: "الوحدة" },
    { key: "wac", label: "WAC" },
    { key: "last_purchase", label: "آخر شراء" },
    { key: "packaging", label: "تعبئة" },
    { key: "overhead_rate", label: "معدل التحميل %" },
    { key: "base_price", label: "السعر الأساسي بعد التحميل" },
    { key: "available", label: "متاح للتوريد" },
    { key: "supply_type", label: "نوع التوريد" },
    ...(selectedBranchId !== "all" && selectedBranch
      ? [{ key: "final_price", label: `السعر النهائي — ${selectedBranch.name}` }]
      : branches.map((b: any) => ({ key: `final_${b.id}`, label: `سعر ${b.name}` }))),
  ];
  const exportData = filteredItems.map((it: any) => {
    const p = pricingByItem.get(it.id);
    const lastP = lastPurchases[it.id] ?? 0;
    const bal = liveBalance(it);
    const r = computeSupplyPrice({
      wac: Number(it.avg_cost) || 0,
      lastPurchasePrice: lastP,
      currentStock: bal,
      pricing: p,
      overheadRate: currentRate.rate,
    });
    const row: Record<string, any> = {
      code: it.code ?? "—",
      name: it.name,
      category: it.inventory_categories?.name ?? "—",
      stock: bal.toFixed(2),
      unit: it.stock_unit ?? "—",
      wac: Number(it.avg_cost || 0).toFixed(2),
      last_purchase: Number(lastP).toFixed(2),
      packaging: Number(p?.packaging_cost ?? 0).toFixed(2),
      overhead_rate: fmtPct(currentRate.rate),
      base_price: r.withOverhead.toFixed(2),
      available: (p?.is_available_for_transfer ?? true) ? "نعم" : "لا",
      supply_type: (p?.supply_type ?? "cost_plus_profit") === "cost" ? "تكلفة فقط" : "تكلفة + ربح",
    };
    if (selectedBranchId !== "all" && selectedBranch) {
      row.final_price = computeBranchFinal(it, selectedBranchId).toFixed(2);
    } else {
      branches.forEach((b: any) => {
        row[`final_${b.id}`] = computeBranchFinal(it, b.id).toFixed(2);
      });
    }
    return row;
  });
  const exportFilters = [
    { label: "المخزن", value: selectedWarehouse?.name ?? "" },
    { label: "الفرع", value: selectedBranch?.name ?? "كل الفروع" },
    { label: "معدل التحميل الحالي", value: fmtPct(currentRate.rate) },
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
              تسعير الخامات للفروع بناءً على WAC + معدل التحميل الشهري للمصاريف غير المباشرة + هامش الربح.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <WarehouseIcon size={16} className="text-muted-foreground" />
            <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="اختر المخزن" /></SelectTrigger>
              <SelectContent>
                {warehouses.map((w: any) => (<SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>))}
              </SelectContent>
            </Select>
            <PrintButton landscape data={exportData} columns={exportColumns}
              title={`تسعير المخزن المركزي — ${selectedWarehouse?.name ?? ""}`} filters={exportFilters}/>
            <ExportButtons data={exportData} columns={exportColumns}
              filename={`supply-pricing-${selectedWarehouse?.name ?? "warehouse"}`}
              title={`تسعير المخزن المركزي — ${selectedWarehouse?.name ?? ""}`} filters={exportFilters}/>
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
            <TrendingUp className="text-amber-500" />
            <div>
              <p className="text-xs text-muted-foreground">
                معدل التحميل الحالي
                <span className="ms-1 text-[10px]">
                  ({currentRate.source === "current" ? "الشهر الحالي" :
                    currentRate.source === "prior" ? `مُحفَّظ من ${monthLabel(currentRate.month)}` :
                    "تقديري"})
                </span>
              </p>
              <p className="text-xl font-black">{fmtPct(currentRate.rate)}</p>
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
              <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
                <SelectTrigger className="w-[200px]">
                  <Building2 size={14} className="ml-1 text-muted-foreground" />
                  <SelectValue placeholder="اختر الفرع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الفروع (سعر أساسي)</SelectItem>
                  {branches.map((b: any) => (<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}
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
                    <TableHead className="text-center">الرصيد الحالي</TableHead>
                    <TableHead className="text-center">WAC</TableHead>
                    <TableHead className="text-center">آخر شراء</TableHead>
                    <TableHead className="text-center">تعبئة</TableHead>
                    <TableHead className="text-center">متاح للتوريد</TableHead>
                    <TableHead className="text-center">نوع التوريد</TableHead>
                    <TableHead className="text-center">حساب تلقائي</TableHead>
                    <TableHead className="text-center">
                      السعر بعد التحميل
                      <div className="text-[10px] text-muted-foreground">+{fmtPct(currentRate.rate)}</div>
                    </TableHead>
                    {selectedBranchId !== "all" && (
                      <TableHead className="text-center text-emerald-600">
                        السعر النهائي — {selectedBranch?.name}
                      </TableHead>
                    )}
                    <TableHead className="text-center">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((it: any) => {
                    const p = pricingByItem.get(it.id);
                    const lastP = lastPurchases[it.id] ?? 0;
                    const avail = p?.is_available_for_transfer ?? true;
                    const bal = liveBalance(it);
                    const r = computeSupplyPrice({
                      wac: Number(it.avg_cost) || 0,
                      lastPurchasePrice: lastP,
                      currentStock: bal,
                      pricing: p,
                      overheadRate: currentRate.rate,
                    });
                    const isExpanded = expandedId === it.id;
                    const colSpan = selectedBranchId !== "all" ? 14 : 13;
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
                          <TableCell className="text-center text-xs font-mono">{bal.toFixed(2)} {it.stock_unit}</TableCell>
                          <TableCell className="text-center text-xs">{fmt(Number(it.avg_cost) || 0)}</TableCell>
                          <TableCell className="text-center text-xs">{fmt(lastP)}</TableCell>
                          <TableCell className="text-center">
                            <Input type="number" className="h-8 w-20 mx-auto text-xs text-center"
                              defaultValue={p?.packaging_cost ?? 0}
                              onBlur={(e) => {
                                const v = Number(e.target.value) || 0;
                                if (v !== Number(p?.packaging_cost ?? 0)) upsertPricing({ stock_item_id: it.id, packaging_cost: v });
                              }}/>
                          </TableCell>
                          <TableCell className="text-center">
                            <Switch checked={avail}
                              onCheckedChange={(v) => upsertPricing({ stock_item_id: it.id, is_available_for_transfer: v })}/>
                          </TableCell>
                          <TableCell className="text-center">
                            <Select value={p?.supply_type ?? "cost_plus_profit"}
                              onValueChange={(v: any) => upsertPricing({ stock_item_id: it.id, supply_type: v })}>
                              <SelectTrigger className="h-8 w-[120px] mx-auto text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="cost">تكلفة فقط</SelectItem>
                                <SelectItem value="cost_plus_profit">تكلفة + ربح</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-center">
                            <Switch checked={p?.auto_calculate ?? true}
                              onCheckedChange={(v) => upsertPricing({ stock_item_id: it.id, auto_calculate: v })}/>
                          </TableCell>
                          <TableCell className="text-center text-xs font-bold text-primary">{fmt(r.withOverhead)}</TableCell>
                          {selectedBranchId !== "all" && (
                            <TableCell className="text-center text-sm font-black text-emerald-600">
                              {fmt(computeBranchFinal(it, selectedBranchId))}
                            </TableCell>
                          )}
                          <TableCell className="text-center">
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                              onClick={() => setPreviewItem({ ...it, lastP, bal })}>
                              <Eye size={12}/> الأسعار
                            </Button>
                          </TableCell>
                        </TableRow>

                        {isExpanded && (
                          <TableRow className="bg-muted/20">
                            <TableCell colSpan={colSpan} className="p-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                                      if (raw === "") upsertPricing({ stock_item_id: it.id, manual_base_price: null as any, auto_calculate: true });
                                      else upsertPricing({ stock_item_id: it.id, manual_base_price: (Number(raw)||0) as any, auto_calculate: false });
                                    }}/>
                                </div>
                                <div className="rounded-lg bg-card p-3 text-xs space-y-1 border">
                                  <p className="font-bold mb-1">معادلة السعر:</p>
                                  <p>
                                    ( WAC <span className="font-mono">{fmt(Number(it.avg_cost)||0)}</span>
                                    {" + تعبئة "}<span className="font-mono">{fmt(Number(p?.packaging_cost ?? 0))}</span>
                                    {" ) × ( 1 + "}<span className="font-mono text-amber-600">{fmtPct(currentRate.rate)}</span>
                                    {" ) = "}<span className="font-bold text-primary">{fmt(r.withOverhead)}</span>
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
                      <TableCell colSpan={selectedBranchId !== "all" ? 14 : 13} className="text-center py-8 text-muted-foreground">لا توجد خامات</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ----------- TAB: Overhead ----------- */}
        <TabsContent value="overhead" className="space-y-4">
          {/* Info banner */}
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Info size={14} className="text-primary"/> كيف يعمل معدل التحميل الشهري؟
              </div>
              <ol className="list-decimal pr-5 space-y-1 text-muted-foreground">
                <li>سجّل بنود مصاريف المخزن (إيجار، مرتبات، فواتير...).</li>
                <li>في نهاية كل شهر يحسب النظام: <b>معدل التحميل = إجمالي المصاريف ÷ إجمالي التحويلات × 100</b>.</li>
                <li>المعدل المحسوب يُستخدم في كل فواتير التحويل للشهر التالي — بدون تأثير على WAC.</li>
                <li>الفواتير المُرحَّلة لا تتغير حتى لو تغير المعدل لاحقاً (السعر مُثبَّت وقت الإصدار).</li>
                <li>لو مفيش بيانات شهر سابق، النظام يستخدم <b>المعدل التقديري</b> اللي أنت مدخله.</li>
              </ol>
            </CardContent>
          </Card>

          {/* Estimated rate */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Percent size={18}/> المعدل التقديري (Estimated Overhead Rate)
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                يُستخدم في أول شهر تشغيل قبل توفر بيانات فعلية للمصاريف والتحويلات.
              </p>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-3">
              <div>
                <label className="text-xs text-muted-foreground">المعدل %</label>
                <Input type="number" step="0.01" className="mt-1 w-40"
                  defaultValue={selectedWarehouse?.estimated_overhead_rate ?? 0}
                  onBlur={(e) => {
                    const v = Number(e.target.value) || 0;
                    if (v !== Number(selectedWarehouse?.estimated_overhead_rate ?? 0)) setEstimatedRate(v);
                  }}/>
              </div>
              <Badge variant="outline" className="text-sm h-9 px-3">
                المعدل الفعّال الآن: <b className="mx-2 text-primary">{fmtPct(currentRate.rate)}</b>
              </Badge>
            </CardContent>
          </Card>

          {/* Expenses table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base justify-between">
                <span className="flex items-center gap-2"><Receipt size={18}/> بنود المصاريف الشهرية</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-sm">إجمالي شهري: <b className="mx-1">{fmt(totalOverhead)}</b></Badge>
                  <Button size="sm" onClick={() => setShowAddExpense(true)} className="gap-1"><Plus size={14}/> إضافة بند</Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
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

          {/* Monthly rates history */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base justify-between">
                <span className="flex items-center gap-2"><TrendingUp size={18}/> سجل معدلات التحميل الشهرية</span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="gap-1"
                    onClick={() => calculateAndSaveMonthRate(prevMonthStr(currentMonthStr()), "actual")}>
                    <Calculator size={14}/> احتساب الشهر السابق
                  </Button>
                  <Button size="sm" className="gap-1"
                    onClick={() => calculateAndSaveMonthRate(currentMonthStr(), "actual")}>
                    <Calculator size={14}/> احتساب الشهر الحالي
                  </Button>
                </div>
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                كل فاتورة تحويل تحفظ المعدل المستخدم وقت إصدارها، حتى لو تغير لاحقاً.
              </p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-center">الشهر</TableHead>
                    <TableHead className="text-center">إجمالي المصاريف</TableHead>
                    <TableHead className="text-center">إجمالي التحويلات</TableHead>
                    <TableHead className="text-center">معدل التحميل</TableHead>
                    <TableHead className="text-center">الحالة</TableHead>
                    <TableHead className="text-center">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyRates.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-center font-medium">{monthLabel(r.month)}</TableCell>
                      <TableCell className="text-center font-mono text-xs">{fmt(Number(r.expenses_total))}</TableCell>
                      <TableCell className="text-center font-mono text-xs">{fmt(Number(r.transfers_total))}</TableCell>
                      <TableCell className="text-center font-black text-primary">{fmtPct(Number(r.rate))}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={r.status === "approved" ? "default" : "outline"}
                          className={cn("text-[10px]",
                            r.status === "approved" && "bg-emerald-500/15 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/15",
                            r.status === "actual" && "bg-blue-500/15 text-blue-600 border-blue-500/30",
                            r.status === "estimated" && "bg-amber-500/15 text-amber-600 border-amber-500/30")}>
                          {r.status === "approved" ? "معتمد" : r.status === "actual" ? "فعلي" : "تقديري"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8"
                            title="إعادة الحساب"
                            onClick={() => calculateAndSaveMonthRate(r.month, r.status === "approved" ? "approved" : "actual")}>
                            <Calculator size={14}/>
                          </Button>
                          {r.status !== "approved" && (
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600"
                              title="اعتماد" onClick={() => approveMonthRate(r.id)}>
                              <CheckCircle2 size={14}/>
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"
                            title="حذف" onClick={() => deleteMonthRate(r.id)}>
                            <Trash2 size={14}/>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {monthlyRates.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        لا يوجد سجل. اضغط "احتساب الشهر الحالي" لتوليد أول معدل.
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
                كل فرع له نسبة ربح خاصة به. تكلفة النقل وتكلفة التحميل تُضاف <b>كمصروف ثابت على كل أذن صرف وتحويل</b> يخرج من المخزن إلى الفرع.
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
                      </TableRow>
                    );
                  })}
                  {branches.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">لا توجد فروع</TableCell>
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
                  <TableHead className="text-center">تحميل ({fmtPct(currentRate.rate)})</TableHead>
                  <TableHead className="text-center">بعد التحميل</TableHead>
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
                  const r = computeSupplyPrice({
                    wac: Number(previewItem.avg_cost) || 0,
                    lastPurchasePrice: previewItem.lastP,
                    currentStock: previewItem.bal,
                    pricing: p,
                    policy: pol,
                    overheadRate: currentRate.rate,
                    quantity: 1,
                  });
                  return (
                    <TableRow key={br.id}>
                      <TableCell className="text-center font-medium">{br.name}</TableCell>
                      <TableCell className="text-center font-mono text-xs">{fmt(r.baseCost)}</TableCell>
                      <TableCell className="text-center font-mono text-xs text-amber-600">{fmt(r.overheadAmount)}</TableCell>
                      <TableCell className="text-center font-mono text-xs">{fmt(r.withOverhead)}</TableCell>
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
