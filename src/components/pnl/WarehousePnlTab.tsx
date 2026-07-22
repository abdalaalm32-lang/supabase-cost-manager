import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format, startOfMonth, endOfMonth } from "date-fns";
import {
  Warehouse as WarehouseIcon, CalendarIcon, TrendingUp, TrendingDown,
  DollarSign, Percent, BarChart3, Plus, Trash2, Printer, FileText,
} from "lucide-react";

const fmt = (n: number) => (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v: number, base: number) => (base > 0 ? ((v / base) * 100).toFixed(2) + "%" : "0.00%");

interface ManualExp { name: string; amount: number; }

export const WarehousePnlTab: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;

  const [dateFrom, setDateFrom] = useState<Date>(startOfMonth(new Date()));
  const [dateTo, setDateTo] = useState<Date>(endOfMonth(new Date()));
  const [warehouseId, setWarehouseId] = useState<string>("all");

  const [manualExpenses, setManualExpenses] = useState<ManualExp[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");

  const dateFromStr = format(dateFrom, "yyyy-MM-dd");
  const dateToStr = format(dateTo, "yyyy-MM-dd");

  // Persist manual expenses per warehouse
  const storageKey = `warehouse-pnl-manual-${companyId || "none"}-${warehouseId}`;
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setManualExpenses(raw ? JSON.parse(raw) : []);
    } catch { setManualExpenses([]); }
  }, [storageKey]);
  React.useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(manualExpenses)); } catch {}
  }, [storageKey, manualExpenses]);

  // Warehouses
  const { data: warehouses = [] } = useQuery({
    queryKey: ["wh-pnl-warehouses", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("warehouses").select("id, name").eq("company_id", companyId!).eq("active", true);
      return data || [];
    },
    enabled: !!companyId,
  });

  const warehouseIds = warehouseId === "all" ? warehouses.map((w: any) => w.id) : [warehouseId];

  // Transfers from warehouse → branch (Internal Sales source)
  const { data: transfers = [] } = useQuery({
    queryKey: ["wh-pnl-transfers", companyId, dateFromStr, dateToStr, warehouseId, warehouses.length],
    queryFn: async () => {
      if (warehouseIds.length === 0) return [];
      return fetchAllRows<any>((from, to) =>
        supabase.from("transfers")
          .select("id, date, source_id, source_name, destination_id, destination_name, status, total_cost")
          .eq("company_id", companyId!)
          .eq("status", "مكتمل")
          .in("source_id", warehouseIds)
          .gte("date", dateFromStr).lte("date", dateToStr)
          .order("date").range(from, to)
      );
    },
    enabled: !!companyId && warehouseIds.length > 0,
  });

  const transferIds = (transfers || []).map((t: any) => t.id);

  const { data: transferItems = [] } = useQuery({
    queryKey: ["wh-pnl-transfer-items", transferIds],
    queryFn: async () => {
      if (transferIds.length === 0) return [];
      const all: any[] = [];
      for (let i = 0; i < transferIds.length; i += 50) {
        const slice = transferIds.slice(i, i + 50);
        const rows = await fetchAllRows<any>((from, to) =>
          supabase.from("transfer_items").select("id, transfer_id, quantity, total_cost").in("transfer_id", slice).order("id").range(from, to)
        );
        all.push(...rows);
      }
      return all;
    },
    enabled: transferIds.length > 0,
  });

  const transferItemIds = (transferItems || []).map((t: any) => t.id);

  const { data: pricingBreakdown = [] } = useQuery({
    queryKey: ["wh-pnl-pricing", transferItemIds.length, transferItemIds.slice(0, 3).join(",")],
    queryFn: async () => {
      if (transferItemIds.length === 0) return [];
      const all: any[] = [];
      for (let i = 0; i < transferItemIds.length; i += 100) {
        const slice = transferItemIds.slice(i, i + 100);
        const rows = await fetchAllRows<any>((from, to) =>
          supabase.from("transfer_pricing_breakdown")
            .select("transfer_item_id, base_cost, manufacturing_cost, packaging_cost, transport_cost, loading_cost, profit_amount, final_unit_price")
            .in("transfer_item_id", slice).order("transfer_item_id").range(from, to)
        );
        all.push(...rows);
      }
      return all;
    },
    enabled: transferItemIds.length > 0,
  });

  // Purchases into these warehouses
  const { data: purchases = [] } = useQuery({
    queryKey: ["wh-pnl-purchases", companyId, dateFromStr, dateToStr, warehouseId, warehouses.length],
    queryFn: async () => {
      if (warehouseIds.length === 0) return [];
      return fetchAllRows<any>((from, to) =>
        supabase.from("purchase_orders")
          .select("id, date, warehouse_id, total_amount, status")
          .eq("company_id", companyId!).eq("status", "مكتمل")
          .in("warehouse_id", warehouseIds)
          .gte("date", dateFromStr).lte("date", dateToStr)
          .order("id").range(from, to)
      );
    },
    enabled: !!companyId && warehouseIds.length > 0,
  });

  // Production for warehouses
  const { data: production = [] } = useQuery({
    queryKey: ["wh-pnl-production", companyId, dateFromStr, dateToStr, warehouseId, warehouses.length],
    queryFn: async () => {
      if (warehouseIds.length === 0) return [];
      return fetchAllRows<any>((from, to) =>
        supabase.from("production_records")
          .select("id, date, warehouse_id, total_production_cost, status")
          .eq("company_id", companyId!).eq("status", "مكتمل")
          .in("warehouse_id", warehouseIds)
          .gte("date", dateFromStr).lte("date", dateToStr)
          .order("id").range(from, to)
      );
    },
    enabled: !!companyId && warehouseIds.length > 0,
  });

  // Waste for warehouses
  const { data: wasteRecs = [] } = useQuery({
    queryKey: ["wh-pnl-waste", companyId, dateFromStr, dateToStr, warehouseId, warehouses.length],
    queryFn: async () => {
      if (warehouseIds.length === 0) return [];
      return fetchAllRows<any>((from, to) =>
        supabase.from("waste_records")
          .select("id, date, warehouse_id, total_cost, status")
          .eq("company_id", companyId!).eq("status", "مكتمل")
          .in("warehouse_id", warehouseIds)
          .gte("date", dateFromStr).lte("date", dateToStr)
          .order("id").range(from, to)
      );
    },
    enabled: !!companyId && warehouseIds.length > 0,
  });

  // Stocktakes (opening + closing)
  const { data: openingStk = [] } = useQuery({
    queryKey: ["wh-pnl-stk-open", companyId, dateFromStr, warehouseId, warehouses.length],
    queryFn: async () => {
      if (warehouseIds.length === 0) return [];
      return fetchAllRows<any>((from, to) =>
        supabase.from("stocktakes")
          .select("id, date, warehouse_id, total_actual_value, status, type")
          .eq("company_id", companyId!).eq("status", "مكتمل").neq("type", "فحص مخزون فوري")
          .in("warehouse_id", warehouseIds)
          .lt("date", dateFromStr)
          .order("date", { ascending: false }).range(from, to)
      );
    },
    enabled: !!companyId && warehouseIds.length > 0,
  });

  const { data: closingStk = [] } = useQuery({
    queryKey: ["wh-pnl-stk-close", companyId, dateFromStr, dateToStr, warehouseId, warehouses.length],
    queryFn: async () => {
      if (warehouseIds.length === 0) return [];
      return fetchAllRows<any>((from, to) =>
        supabase.from("stocktakes")
          .select("id, date, warehouse_id, total_actual_value, status, type")
          .eq("company_id", companyId!).eq("status", "مكتمل").neq("type", "فحص مخزون فوري")
          .in("warehouse_id", warehouseIds)
          .gte("date", dateFromStr).lte("date", dateToStr)
          .order("date", { ascending: false }).range(from, to)
      );
    },
    enabled: !!companyId && warehouseIds.length > 0,
  });

  // Warehouse operating expenses (monthly amounts prorated by number of months in range)
  const { data: whExpenses = [] } = useQuery({
    queryKey: ["wh-pnl-exp", companyId, warehouseId, warehouses.length],
    queryFn: async () => {
      if (warehouseIds.length === 0) return [];
      return fetchAllRows<any>((from, to) =>
        supabase.from("warehouse_overhead_expenses")
          .select("id, warehouse_id, expense_name, monthly_amount, is_active")
          .eq("company_id", companyId!).eq("is_active", true)
          .in("warehouse_id", warehouseIds)
          .order("id").range(from, to)
      );
    },
    enabled: !!companyId && warehouseIds.length > 0,
  });

  // --- Compute ---
  const result = useMemo(() => {
    // Internal sales per branch via pricing breakdown snapshot
    const priceByItem = new Map<string, number>();
    (pricingBreakdown || []).forEach((p: any) => priceByItem.set(p.transfer_item_id, Number(p.final_unit_price) || 0));

    const salesByBranch = new Map<string, { name: string; total: number }>();
    let totalInternalSales = 0;
    let totalTransferCogsSnapshot = 0;

    const itemsByTransfer = new Map<string, any[]>();
    (transferItems || []).forEach((ti: any) => {
      if (!itemsByTransfer.has(ti.transfer_id)) itemsByTransfer.set(ti.transfer_id, []);
      itemsByTransfer.get(ti.transfer_id)!.push(ti);
    });

    (transfers || []).forEach((tr: any) => {
      const items = itemsByTransfer.get(tr.id) || [];
      let trSales = 0;
      items.forEach((it: any) => {
        const unitPrice = priceByItem.get(it.id) ?? 0;
        const qty = Number(it.quantity) || 0;
        trSales += unitPrice * qty;
      });
      // Fallback: if no pricing breakdown, use transfer.total_cost as snapshot
      if (trSales === 0) trSales = Number(tr.total_cost) || 0;
      totalInternalSales += trSales;
      totalTransferCogsSnapshot += Number(tr.total_cost) || 0;
      const key = tr.destination_id || "__none__";
      const name = tr.destination_name || "بدون فرع";
      const existing = salesByBranch.get(key);
      if (existing) existing.total += trSales;
      else salesByBranch.set(key, { name, total: trSales });
    });

    // Opening & closing stock (latest per warehouse)
    const pickLatestByWh = (rows: any[]) => {
      const map = new Map<string, any>();
      rows.forEach((r) => {
        const key = r.warehouse_id || "__none__";
        const prev = map.get(key);
        if (!prev || String(r.date) > String(prev.date)) map.set(key, r);
      });
      let sum = 0;
      map.forEach((r) => (sum += Number(r.total_actual_value) || 0));
      return sum;
    };
    const openingStock = pickLatestByWh(openingStk || []);
    const closingStock = pickLatestByWh(closingStk || []);

    const purchasesTotal = (purchases || []).reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0);
    const productionCost = (production || []).reduce((s: number, r: any) => s + Number(r.total_production_cost || 0), 0);
    const wasteCost = (wasteRecs || []).reduce((s: number, r: any) => s + Number(r.total_cost || 0), 0);

    // COGS = Opening + Purchases + Production − Closing
    const totalCogs = openingStock + purchasesTotal + productionCost - closingStock;
    const grossProfit = totalInternalSales - totalCogs;
    const grossProfitPct = totalInternalSales > 0 ? (grossProfit / totalInternalSales) * 100 : 0;

    // Operating expenses (monthly amount → prorated by month count in range)
    const months = Math.max(
      1,
      (dateTo.getFullYear() - dateFrom.getFullYear()) * 12 + (dateTo.getMonth() - dateFrom.getMonth()) + 1
    );
    const autoExpenses = (whExpenses || []).map((e: any) => ({
      name: e.expense_name,
      amount: Number(e.monthly_amount || 0) * months,
    }));
    const allExpenses = [...autoExpenses, ...manualExpenses];
    const totalExpenses = allExpenses.reduce((s, e) => s + e.amount, 0);

    const netProfit = grossProfit - totalExpenses - wasteCost;
    const netProfitPct = totalInternalSales > 0 ? (netProfit / totalInternalSales) * 100 : 0;

    return {
      salesByBranch: Array.from(salesByBranch.values()).sort((a, b) => b.total - a.total),
      totalInternalSales,
      openingStock,
      closingStock,
      purchasesTotal,
      productionCost,
      totalCogs,
      grossProfit,
      grossProfitPct,
      allExpenses,
      totalExpenses,
      wasteCost,
      netProfit,
      netProfitPct,
      totalTransferCogsSnapshot,
    };
  }, [transfers, transferItems, pricingBreakdown, purchases, production, wasteRecs, openingStk, closingStk, whExpenses, manualExpenses, dateFrom, dateTo]);

  const addExpense = () => {
    if (!newName.trim() || !Number(newAmount)) return;
    setManualExpenses((p) => [...p, { name: newName.trim(), amount: Number(newAmount) }]);
    setNewName(""); setNewAmount(""); setShowAdd(false);
  };

  const printReport = () => window.print();

  const kpis = [
    { title: "المبيعات الداخلية", value: fmt(result.totalInternalSales), icon: DollarSign, color: "from-blue-500/20 to-blue-600/10 border-blue-500/30", textColor: "text-blue-600" },
    { title: "هامش الربح الداخلي", value: result.grossProfitPct.toFixed(2) + "%", icon: Percent, color: "from-emerald-500/20 to-emerald-600/10 border-emerald-500/30", textColor: "text-emerald-600" },
    { title: "تكلفة الإنتاج", value: fmt(result.productionCost), icon: BarChart3, color: "from-purple-500/20 to-purple-600/10 border-purple-500/30", textColor: "text-purple-600" },
    { title: "تكلفة الفاقد", value: fmt(result.wasteCost), icon: TrendingDown, color: "from-rose-500/20 to-rose-600/10 border-rose-500/30", textColor: "text-rose-600" },
    { title: "الجرد أول المدة", value: fmt(result.openingStock), icon: WarehouseIcon, color: "from-slate-500/20 to-slate-600/10 border-slate-500/30", textColor: "text-slate-600" },
    { title: "الجرد آخر المدة", value: fmt(result.closingStock), icon: WarehouseIcon, color: "from-slate-500/20 to-slate-600/10 border-slate-500/30", textColor: "text-slate-600" },
    { title: "صافي ربح المخزن", value: fmt(result.netProfit), icon: result.netProfit >= 0 ? TrendingUp : TrendingDown, color: result.netProfit >= 0 ? "from-green-500/20 to-green-600/10 border-green-500/30" : "from-red-500/20 to-red-600/10 border-red-500/30", textColor: result.netProfit >= 0 ? "text-green-600" : "text-red-600" },
    { title: "نسبة صافي الربح", value: result.netProfitPct.toFixed(2) + "%", icon: Percent, color: "from-amber-500/20 to-amber-600/10 border-amber-500/30", textColor: "text-amber-600" },
  ];

  return (
    <div className="space-y-5" dir="rtl">
      {/* Filters */}
      <Card className="print:hidden">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">من</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-36 justify-start text-xs">
                    <CalendarIcon className="h-3.5 w-3.5 ml-1" />
                    {format(dateFrom, "yyyy/MM/dd")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={dateFrom} onSelect={(d) => d && setDateFrom(d)} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">إلى</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-36 justify-start text-xs">
                    <CalendarIcon className="h-3.5 w-3.5 ml-1" />
                    {format(dateTo, "yyyy/MM/dd")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={dateTo} onSelect={(d) => d && setDateTo(d)} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">المخزن</label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger className="w-56 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع المخازن</SelectItem>
                  {warehouses.map((w: any) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={printReport}>
              <Printer className="h-4 w-4 ml-1" /> طباعة
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((k, i) => (
          <Card key={i} className={`bg-gradient-to-br ${k.color} border`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">{k.title}</span>
                <k.icon className={`h-5 w-5 ${k.textColor}`} />
              </div>
              <div className={`text-xl font-bold ${k.textColor}`}>{k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Statement */}
      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="font-bold text-foreground flex items-center gap-2">
              <WarehouseIcon className="h-5 w-5 text-primary" />
              P&L — المخزن المركزي
            </h2>
            <Badge variant="outline" className="text-xs">{(transfers || []).length} تحويل</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {/* Internal Sales */}
                <tr className="bg-muted/20 font-semibold text-primary border-b">
                  <td className="p-3">المبيعات الداخلية للفروع (Internal Sales)</td>
                  <td className="p-3 text-left"></td>
                  <td className="p-3 text-left w-24"></td>
                </tr>
                {result.salesByBranch.map((b, i) => (
                  <tr key={i} className="border-b hover:bg-muted/20">
                    <td className="p-3 pr-8">{b.name}</td>
                    <td className="p-3 text-left tabular-nums">{fmt(b.total)}</td>
                    <td className="p-3 text-left text-xs text-muted-foreground">{pct(b.total, result.totalInternalSales)}</td>
                  </tr>
                ))}
                <tr className="bg-muted/40 font-semibold border-b">
                  <td className="p-3">إجمالي المبيعات الداخلية</td>
                  <td className="p-3 text-left tabular-nums">{fmt(result.totalInternalSales)}</td>
                  <td className="p-3 text-left text-xs">100%</td>
                </tr>

                <tr><td colSpan={3} className="h-1 bg-muted/30"></td></tr>

                {/* COGS */}
                <tr className="bg-muted/20 font-semibold text-primary border-b">
                  <td className="p-3">تكلفة البضاعة المباعة (COGS)</td>
                  <td className="p-3"></td><td className="p-3"></td>
                </tr>
                <tr className="border-b hover:bg-muted/20">
                  <td className="p-3 pr-8">جرد أول المدة</td>
                  <td className="p-3 text-left tabular-nums">{fmt(result.openingStock)}</td>
                  <td className="p-3"></td>
                </tr>
                <tr className="border-b hover:bg-muted/20">
                  <td className="p-3 pr-8">(+) المشتريات</td>
                  <td className="p-3 text-left tabular-nums">{fmt(result.purchasesTotal)}</td>
                  <td className="p-3"></td>
                </tr>
                <tr className="border-b hover:bg-muted/20">
                  <td className="p-3 pr-8">(+) تكلفة الإنتاج</td>
                  <td className="p-3 text-left tabular-nums">{fmt(result.productionCost)}</td>
                  <td className="p-3"></td>
                </tr>
                <tr className="border-b hover:bg-muted/20">
                  <td className="p-3 pr-8">(-) جرد آخر المدة</td>
                  <td className="p-3 text-left tabular-nums">({fmt(result.closingStock)})</td>
                  <td className="p-3"></td>
                </tr>
                <tr className="bg-muted/40 font-semibold border-b">
                  <td className="p-3">إجمالي COGS</td>
                  <td className="p-3 text-left tabular-nums">{fmt(result.totalCogs)}</td>
                  <td className="p-3 text-left text-xs">{pct(result.totalCogs, result.totalInternalSales)}</td>
                </tr>

                <tr><td colSpan={3} className="h-1 bg-muted/30"></td></tr>

                <tr className="bg-primary/5 font-bold border-b">
                  <td className="p-3">مجمل الربح (Gross Profit)</td>
                  <td className={`p-3 text-left tabular-nums ${result.grossProfit < 0 ? "text-destructive" : ""}`}>{fmt(result.grossProfit)}</td>
                  <td className="p-3 text-left text-xs">{result.grossProfitPct.toFixed(2)}%</td>
                </tr>

                <tr><td colSpan={3} className="h-1 bg-muted/30"></td></tr>

                {/* Operating Expenses */}
                <tr className="bg-muted/20 font-semibold text-primary border-b">
                  <td className="p-3">المصاريف التشغيلية</td>
                  <td className="p-3"></td><td className="p-3"></td>
                </tr>
                {result.allExpenses.map((e, i) => (
                  <tr key={i} className="border-b hover:bg-muted/20">
                    <td className="p-3 pr-8">{e.name}</td>
                    <td className="p-3 text-left tabular-nums">{fmt(e.amount)}</td>
                    <td className="p-3 text-left text-xs text-muted-foreground">{pct(e.amount, result.totalInternalSales)}</td>
                  </tr>
                ))}
                {result.wasteCost > 0 && (
                  <tr className="border-b hover:bg-muted/20">
                    <td className="p-3 pr-8">الفاقد والإهلاك</td>
                    <td className="p-3 text-left tabular-nums">{fmt(result.wasteCost)}</td>
                    <td className="p-3 text-left text-xs text-muted-foreground">{pct(result.wasteCost, result.totalInternalSales)}</td>
                  </tr>
                )}
                <tr className="bg-muted/40 font-semibold border-b">
                  <td className="p-3">إجمالي المصاريف</td>
                  <td className="p-3 text-left tabular-nums">{fmt(result.totalExpenses + result.wasteCost)}</td>
                  <td className="p-3 text-left text-xs">{pct(result.totalExpenses + result.wasteCost, result.totalInternalSales)}</td>
                </tr>

                <tr><td colSpan={3} className="h-1 bg-muted/30"></td></tr>

                <tr className={`font-bold border-b ${result.netProfit >= 0 ? "bg-green-500/10" : "bg-red-500/10"}`}>
                  <td className="p-3">صافي الربح (Net Profit)</td>
                  <td className={`p-3 text-left tabular-nums ${result.netProfit < 0 ? "text-destructive" : "text-emerald-600"}`}>{fmt(result.netProfit)}</td>
                  <td className="p-3 text-left text-xs">{result.netProfitPct.toFixed(2)}%</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Manual expenses controls */}
          <div className="p-4 border-t print:hidden">
            <div className="flex items-center gap-3 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
                <Plus className="h-4 w-4 ml-1" /> إضافة مصروف يدوي
              </Button>
              {manualExpenses.map((e, i) => (
                <Badge key={i} variant="secondary" className="gap-1 text-xs">
                  {e.name}: {fmt(e.amount)} ج.م
                  <button onClick={() => setManualExpenses((p) => p.filter((_, idx) => idx !== i))} className="hover:text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>إضافة مصروف يدوي</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">اسم المصروف</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="مثال: مرتبات" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">المبلغ (ج.م)</label>
              <Input type="number" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} placeholder="0.00" />
            </div>
            <Button onClick={addExpense} className="w-full">إضافة</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
