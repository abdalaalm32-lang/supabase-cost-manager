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
import { ExportButtons } from "@/components/ExportButtons";
import { format, startOfMonth, endOfMonth, differenceInDays, addDays, subDays } from "date-fns";
import {
  Warehouse as WarehouseIcon, CalendarIcon, TrendingUp, TrendingDown,
  DollarSign, Percent, BarChart3, Plus, Trash2, Printer, ChevronDown, ChevronLeft,
  Repeat, Weight, BarChart2, Activity,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip as RTooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

const fmt = (n: number) => (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v: number, base: number) => (base > 0 ? ((v / base) * 100).toFixed(2) + "%" : "0.00%");
const deltaPct = (curr: number, prev: number) => {
  if (!prev) return curr === 0 ? "0.00%" : "—";
  return (((curr - prev) / Math.abs(prev)) * 100).toFixed(2) + "%";
};

interface ManualExp { name: string; amount: number; }

// Palette (consistent): revenue=blue, cost=orange/red, profit=green, %=cyan
const KPI_COLORS = {
  revenue: { g: "from-blue-500/20 to-blue-600/10 border-blue-500/30", t: "text-blue-600" },
  cost:    { g: "from-orange-500/20 to-orange-600/10 border-orange-500/30", t: "text-orange-600" },
  profit:  { g: "from-emerald-500/20 to-emerald-600/10 border-emerald-500/30", t: "text-emerald-600" },
  pctCol:  { g: "from-cyan-500/20 to-cyan-600/10 border-cyan-500/30", t: "text-cyan-600" },
  waste:   { g: "from-rose-500/20 to-rose-600/10 border-rose-500/30", t: "text-rose-600" },
  neutral: { g: "from-slate-500/20 to-slate-600/10 border-slate-500/30", t: "text-slate-600" },
};

// ── Data fetcher hook, reusable for current + previous period ────────────────
function useWarehouseData(companyId: string | undefined, warehouseIds: string[], dateFromStr: string, dateToStr: string, key: string) {
  const enabled = !!companyId && warehouseIds.length > 0;
  const idsKey = warehouseIds.join(",");

  const { data: transfers = [] } = useQuery({
    queryKey: [`whp-tr-${key}`, companyId, dateFromStr, dateToStr, idsKey],
    queryFn: async () => fetchAllRows<any>((from, to) =>
      supabase.from("transfers")
        .select("id, date, source_id, source_name, destination_id, destination_name, total_cost")
        .eq("company_id", companyId!).eq("status", "مكتمل").in("source_id", warehouseIds)
        .gte("date", dateFromStr).lte("date", dateToStr).order("date").range(from, to)
    ),
    enabled,
  });

  const transferIds = (transfers || []).map((t: any) => t.id);
  const { data: transferItems = [] } = useQuery({
    queryKey: [`whp-ti-${key}`, transferIds.length, transferIds.slice(0, 3).join(",")],
    queryFn: async () => {
      if (transferIds.length === 0) return [];
      const all: any[] = [];
      for (let i = 0; i < transferIds.length; i += 50) {
        const slice = transferIds.slice(i, i + 50);
        const rows = await fetchAllRows<any>((from, to) =>
          supabase.from("transfer_items").select("id, transfer_id, item_name, quantity, total_cost")
            .in("transfer_id", slice).order("id").range(from, to)
        );
        all.push(...rows);
      }
      return all;
    },
    enabled: transferIds.length > 0,
  });

  const tiIds = (transferItems || []).map((t: any) => t.id);
  const { data: pricing = [] } = useQuery({
    queryKey: [`whp-pr-${key}`, tiIds.length, tiIds.slice(0, 3).join(",")],
    queryFn: async () => {
      if (tiIds.length === 0) return [];
      const all: any[] = [];
      for (let i = 0; i < tiIds.length; i += 100) {
        const slice = tiIds.slice(i, i + 100);
        const rows = await fetchAllRows<any>((from, to) =>
          supabase.from("transfer_pricing_breakdown")
            .select("transfer_item_id, final_unit_price")
            .in("transfer_item_id", slice).order("transfer_item_id").range(from, to)
        );
        all.push(...rows);
      }
      return all;
    },
    enabled: tiIds.length > 0,
  });

  const { data: purchases = [] } = useQuery({
    queryKey: [`whp-pu-${key}`, companyId, dateFromStr, dateToStr, idsKey],
    queryFn: async () => fetchAllRows<any>((from, to) =>
      supabase.from("purchase_orders").select("id, date, warehouse_id, total_amount")
        .eq("company_id", companyId!).eq("status", "مكتمل").in("warehouse_id", warehouseIds)
        .gte("date", dateFromStr).lte("date", dateToStr).order("id").range(from, to)
    ),
    enabled,
  });

  const { data: production = [] } = useQuery({
    queryKey: [`whp-pd-${key}`, companyId, dateFromStr, dateToStr, idsKey],
    queryFn: async () => fetchAllRows<any>((from, to) =>
      supabase.from("production_records")
        .select("id, date, warehouse_id, product_name, produced_qty, total_production_cost, unit")
        .eq("company_id", companyId!).eq("status", "مكتمل").in("warehouse_id", warehouseIds)
        .gte("date", dateFromStr).lte("date", dateToStr).order("id").range(from, to)
    ),
    enabled,
  });

  const { data: wasteRecs = [] } = useQuery({
    queryKey: [`whp-ws-${key}`, companyId, dateFromStr, dateToStr, idsKey],
    queryFn: async () => fetchAllRows<any>((from, to) =>
      supabase.from("waste_records").select("id, date, warehouse_id, total_cost")
        .eq("company_id", companyId!).eq("status", "مكتمل").in("warehouse_id", warehouseIds)
        .gte("date", dateFromStr).lte("date", dateToStr).order("id").range(from, to)
    ),
    enabled,
  });

  const { data: openingStk = [] } = useQuery({
    queryKey: [`whp-so-${key}`, companyId, dateFromStr, idsKey],
    queryFn: async () => fetchAllRows<any>((from, to) =>
      supabase.from("stocktakes").select("id, date, warehouse_id, total_actual_value")
        .eq("company_id", companyId!).eq("status", "مكتمل").neq("type", "فحص مخزون فوري")
        .in("warehouse_id", warehouseIds).lt("date", dateFromStr)
        .order("date", { ascending: false }).range(from, to)
    ),
    enabled,
  });
  const { data: closingStk = [] } = useQuery({
    queryKey: [`whp-sc-${key}`, companyId, dateFromStr, dateToStr, idsKey],
    queryFn: async () => fetchAllRows<any>((from, to) =>
      supabase.from("stocktakes").select("id, date, warehouse_id, total_actual_value")
        .eq("company_id", companyId!).eq("status", "مكتمل").neq("type", "فحص مخزون فوري")
        .in("warehouse_id", warehouseIds).gte("date", dateFromStr).lte("date", dateToStr)
        .order("date", { ascending: false }).range(from, to)
    ),
    enabled,
  });

  return { transfers, transferItems, pricing, purchases, production, wasteRecs, openingStk, closingStk };
}

function computeResult(d: ReturnType<typeof useWarehouseData>, extraExpenses: ManualExp[], autoExpenses: ManualExp[]) {
  const priceByItem = new Map<string, number>();
  (d.pricing || []).forEach((p: any) => priceByItem.set(p.transfer_item_id, Number(p.final_unit_price) || 0));

  const salesByBranch = new Map<string, { name: string; total: number; cost: number }>();
  const salesByItem = new Map<string, { name: string; total: number; qty: number }>();
  const salesByMonth = new Map<string, number>();
  let totalInternalSales = 0;
  let costOfTransfers = 0;

  const itemsByTransfer = new Map<string, any[]>();
  (d.transferItems || []).forEach((ti: any) => {
    if (!itemsByTransfer.has(ti.transfer_id)) itemsByTransfer.set(ti.transfer_id, []);
    itemsByTransfer.get(ti.transfer_id)!.push(ti);
  });

  (d.transfers || []).forEach((tr: any) => {
    const items = itemsByTransfer.get(tr.id) || [];
    let trSales = 0;
    let trCost = 0;
    items.forEach((it: any) => {
      const up = priceByItem.get(it.id) ?? 0;
      const qty = Number(it.quantity) || 0;
      const val = up * qty;
      trSales += val;
      trCost += Number(it.total_cost) || 0;
      const iname = it.item_name || "—";
      const ex = salesByItem.get(iname);
      if (ex) { ex.total += val; ex.qty += qty; }
      else salesByItem.set(iname, { name: iname, total: val, qty });
    });
    const trTotalCost = Number(tr.total_cost) || trCost;
    if (trSales === 0) trSales = trTotalCost;
    totalInternalSales += trSales;
    costOfTransfers += trTotalCost;
    const bkey = tr.destination_id || "__none__";
    const bname = tr.destination_name || "بدون فرع";
    const bex = salesByBranch.get(bkey);
    if (bex) { bex.total += trSales; bex.cost += trTotalCost; }
    else salesByBranch.set(bkey, { name: bname, total: trSales, cost: trTotalCost });
    const m = String(tr.date || "").slice(0, 7);
    if (m) salesByMonth.set(m, (salesByMonth.get(m) || 0) + trSales);
  });

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
  const openingStock = pickLatestByWh(d.openingStk || []);
  const closingStock = pickLatestByWh(d.closingStk || []);
  const purchasesTotal = (d.purchases || []).reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0);
  const productionCost = (d.production || []).reduce((s: number, r: any) => s + Number(r.total_production_cost || 0), 0);
  const productionQty = (d.production || []).reduce((s: number, r: any) => s + Number(r.produced_qty || 0), 0);
  const costPerKg = productionQty > 0 ? productionCost / productionQty : 0;
  const wasteCost = (d.wasteRecs || []).reduce((s: number, r: any) => s + Number(r.total_cost || 0), 0);

  // waste by warehouse
  const wasteByWh = new Map<string, number>();
  (d.wasteRecs || []).forEach((w: any) => {
    const k = w.warehouse_id || "__none__";
    wasteByWh.set(k, (wasteByWh.get(k) || 0) + Number(w.total_cost || 0));
  });

  // Perpetual model: COGS = cost of internal transfers to branches
  const totalCogs = costOfTransfers;
  const grossProfit = totalInternalSales - totalCogs;
  const grossProfitPct = totalInternalSales > 0 ? (grossProfit / totalInternalSales) * 100 : 0;

  // Reference (periodic) valuation — not used in Gross Profit
  const goodsAvailable = openingStock + purchasesTotal + productionCost;
  const periodicCogs = goodsAvailable - closingStock;

  const allExpenses = [...autoExpenses, ...extraExpenses];
  const totalExpenses = allExpenses.reduce((s, e) => s + e.amount, 0);
  const netProfit = grossProfit - totalExpenses - wasteCost;
  const netProfitPct = totalInternalSales > 0 ? (netProfit / totalInternalSales) * 100 : 0;

  return {
    salesByBranch: Array.from(salesByBranch.values()).sort((a, b) => b.total - a.total),
    salesByItem: Array.from(salesByItem.values()).sort((a, b) => b.total - a.total),
    salesByMonth: Array.from(salesByMonth.entries()).sort(([a], [b]) => a.localeCompare(b)),
    transfersCount: (d.transfers || []).length,
    totalInternalSales, costOfTransfers, openingStock, closingStock,
    purchasesTotal, productionCost, productionQty, costPerKg,
    goodsAvailable, periodicCogs,
    totalCogs, grossProfit, grossProfitPct,
    allExpenses, totalExpenses, wasteCost, wasteByWh,
    netProfit, netProfitPct,
  };
}

export const WarehousePnlTab: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;

  const [dateFrom, setDateFrom] = useState<Date>(startOfMonth(new Date()));
  const [dateTo, setDateTo] = useState<Date>(endOfMonth(new Date()));
  const [warehouseId, setWarehouseId] = useState<string>("all");
  const [compareOn, setCompareOn] = useState(false);
  const [openSections, setOpenSections] = useState({ sales: true, cogs: true, expenses: true });
  const [analysisOpen, setAnalysisOpen] = useState(false);

  const [manualExpenses, setManualExpenses] = useState<ManualExp[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");

  const dateFromStr = format(dateFrom, "yyyy-MM-dd");
  const dateToStr = format(dateTo, "yyyy-MM-dd");

  // Previous period (same length, immediately preceding)
  const rangeDays = Math.max(1, differenceInDays(dateTo, dateFrom) + 1);
  const prevTo = subDays(dateFrom, 1);
  const prevFrom = addDays(subDays(prevTo, rangeDays - 1), 0);
  const prevFromStr = format(prevFrom, "yyyy-MM-dd");
  const prevToStr = format(prevTo, "yyyy-MM-dd");

  const storageKey = `warehouse-pnl-manual-${companyId || "none"}-${warehouseId}`;
  React.useEffect(() => {
    try { const raw = localStorage.getItem(storageKey); setManualExpenses(raw ? JSON.parse(raw) : []); }
    catch { setManualExpenses([]); }
  }, [storageKey]);
  React.useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(manualExpenses)); } catch {}
  }, [storageKey, manualExpenses]);

  const { data: warehouses = [] } = useQuery({
    queryKey: ["wh-pnl-warehouses", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("warehouses").select("id, name").eq("company_id", companyId!).eq("active", true);
      return data || [];
    },
    enabled: !!companyId,
  });

  const warehouseIds = warehouseId === "all" ? warehouses.map((w: any) => w.id) : [warehouseId];
  const whNameById = new Map<string, string>(warehouses.map((w: any) => [w.id, w.name]));

  const { data: whExpenses = [] } = useQuery({
    queryKey: ["wh-pnl-exp", companyId, warehouseId, warehouses.length],
    queryFn: async () => {
      if (warehouseIds.length === 0) return [];
      return fetchAllRows<any>((from, to) =>
        supabase.from("warehouse_overhead_expenses")
          .select("id, warehouse_id, expense_name, monthly_amount, is_active")
          .eq("company_id", companyId!).eq("is_active", true)
          .in("warehouse_id", warehouseIds).order("id").range(from, to)
      );
    },
    enabled: !!companyId && warehouseIds.length > 0,
  });

  const monthsInRange = Math.max(1,
    (dateTo.getFullYear() - dateFrom.getFullYear()) * 12 + (dateTo.getMonth() - dateFrom.getMonth()) + 1
  );
  const autoExpenses: ManualExp[] = (whExpenses || []).map((e: any) => ({
    name: e.expense_name, amount: Number(e.monthly_amount || 0) * monthsInRange,
  }));

  const curr = useWarehouseData(companyId, warehouseIds, dateFromStr, dateToStr, "curr");
  const prev = useWarehouseData(companyId, compareOn ? warehouseIds : [], prevFromStr, prevToStr, "prev");

  const result = useMemo(() => computeResult(curr, manualExpenses, autoExpenses),
    [curr, manualExpenses, autoExpenses]);
  const resultPrev = useMemo(() => computeResult(prev, manualExpenses, autoExpenses),
    [prev, manualExpenses, autoExpenses]);

  const addExpense = () => {
    if (!newName.trim() || !Number(newAmount)) return;
    setManualExpenses((p) => [...p, { name: newName.trim(), amount: Number(newAmount) }]);
    setNewName(""); setNewAmount(""); setShowAdd(false);
  };

  // KPIs in P&L reading order
  const kpiCards = [
    { title: "المبيعات الداخلية", value: fmt(result.totalInternalSales), prev: resultPrev.totalInternalSales, curr: result.totalInternalSales, icon: DollarSign, ...KPI_COLORS.revenue },
    { title: "COGS", value: fmt(result.totalCogs), prev: resultPrev.totalCogs, curr: result.totalCogs, icon: BarChart3, ...KPI_COLORS.cost },
    { title: "مجمل الربح", value: fmt(result.grossProfit), prev: resultPrev.grossProfit, curr: result.grossProfit, icon: TrendingUp, ...KPI_COLORS.profit },
    { title: "هامش الربح %", value: result.grossProfitPct.toFixed(2) + "%", prev: resultPrev.grossProfitPct, curr: result.grossProfitPct, icon: Percent, ...KPI_COLORS.pctCol },
    { title: "المصروفات", value: fmt(result.totalExpenses), prev: resultPrev.totalExpenses, curr: result.totalExpenses, icon: BarChart3, ...KPI_COLORS.cost },
    { title: "صافي الربح", value: fmt(result.netProfit), prev: resultPrev.netProfit, curr: result.netProfit, icon: result.netProfit >= 0 ? TrendingUp : TrendingDown, ...(result.netProfit >= 0 ? KPI_COLORS.profit : { g: "from-red-500/20 to-red-600/10 border-red-500/30", t: "text-red-600" }) },
    { title: "تكلفة الإنتاج", value: fmt(result.productionCost), prev: resultPrev.productionCost, curr: result.productionCost, icon: BarChart3, ...KPI_COLORS.cost },
    { title: "تكلفة الفاقد", value: fmt(result.wasteCost), prev: resultPrev.wasteCost, curr: result.wasteCost, icon: TrendingDown, ...KPI_COLORS.waste },
    { title: "متوسط تكلفة الوحدة", value: fmt(result.costPerKg), prev: resultPrev.costPerKg, curr: result.costPerKg, icon: Weight, ...KPI_COLORS.neutral },
    { title: "عدد التحويلات", value: String(result.transfersCount), prev: resultPrev.transfersCount, curr: result.transfersCount, icon: Repeat, ...KPI_COLORS.neutral },
  ];

  // Export data (flat rows of the statement)
  const exportRows = useMemo(() => {
    const rows: Record<string, any>[] = [];
    rows.push({ section: "الإيرادات", item: "المبيعات الداخلية للفروع", amount: result.totalInternalSales, pct: "100%" });
    result.salesByBranch.forEach((b) => rows.push({ section: "  فرع", item: b.name, amount: b.total, pct: pct(b.total, result.totalInternalSales) }));
    rows.push({ section: "COGS", item: "تكلفة التحويلات للفروع", amount: result.costOfTransfers, pct: pct(result.costOfTransfers, result.totalInternalSales) });
    result.salesByBranch.forEach((b) => rows.push({ section: "  تكلفة تحويلات", item: b.name, amount: b.cost, pct: pct(b.cost, result.totalInternalSales) }));
    rows.push({ section: "الأرباح", item: "مجمل الربح", amount: result.grossProfit, pct: result.grossProfitPct.toFixed(2) + "%" });
    result.allExpenses.forEach((e) => rows.push({ section: "مصروفات", item: e.name, amount: e.amount, pct: pct(e.amount, result.totalInternalSales) }));
    if (result.wasteCost > 0) rows.push({ section: "مصروفات", item: "الفاقد", amount: result.wasteCost, pct: pct(result.wasteCost, result.totalInternalSales) });
    rows.push({ section: "الأرباح", item: "صافي الربح", amount: result.netProfit, pct: result.netProfitPct.toFixed(2) + "%" });
    // Reference block
    rows.push({ section: "مرجع - جرد", item: "جرد أول المدة", amount: result.openingStock, pct: "" });
    rows.push({ section: "مرجع - جرد", item: "(+) المشتريات", amount: result.purchasesTotal, pct: "" });
    rows.push({ section: "مرجع - جرد", item: "(+) تكلفة الإنتاج", amount: result.productionCost, pct: "" });
    rows.push({ section: "مرجع - جرد", item: "البضاعة المتاحة", amount: result.goodsAvailable, pct: "" });
    rows.push({ section: "مرجع - جرد", item: "(-) جرد آخر المدة", amount: -result.closingStock, pct: "" });
    rows.push({ section: "مرجع - جرد", item: "COGS (Periodic)", amount: result.periodicCogs, pct: "" });
    return rows;
  }, [result]);


  const exportCols = [
    { key: "section", label: "القسم" },
    { key: "item", label: "البند" },
    { key: "amount", label: "المبلغ" },
    { key: "pct", label: "النسبة" },
  ];

  // Compare component (small row under KPI value)
  const CompareRow: React.FC<{ curr: number; prev: number; isPct?: boolean }> = ({ curr, prev, isPct }) => {
    if (!compareOn) return null;
    const diff = curr - prev;
    const up = diff >= 0;
    return (
      <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground">
        <span>سابق: {isPct ? prev.toFixed(2) + "%" : fmt(prev)}</span>
        <span className={up ? "text-emerald-600" : "text-rose-600"}>
          ({up ? "▲" : "▼"} {deltaPct(curr, prev)})
        </span>
      </div>
    );
  };

  // Trend data
  const trendData = result.salesByMonth.map(([m, v]) => ({ month: m, sales: v }));
  const topBranches = result.salesByBranch.slice(0, 5);
  const topItems = result.salesByItem.slice(0, 10);
  const topWasteWh = Array.from(result.wasteByWh.entries())
    .map(([id, v]) => ({ name: whNameById.get(id) || "—", value: v }))
    .sort((a, b) => b.value - a.value).slice(0, 5);

  const handlePrint = () => {
    const dateStr = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
    const logoSrc = `${window.location.origin}/logo.png`;
    const periodStr = `${format(dateFrom, "yyyy/MM/dd")} — ${format(dateTo, "yyyy/MM/dd")}`;
    const whName = warehouseId === "all" ? "جميع المخازن" : (whNameById.get(warehouseId) || "-");

    const row = (label: string, amount: number | string, pctVal: string, opts: { bold?: boolean; indent?: boolean; bg?: string; color?: string } = {}) => {
      const bg = opts.bg ? `background:${opts.bg};` : "";
      const fw = opts.bold ? "font-weight:bold;" : "";
      const pl = opts.indent ? "padding-right:30px;" : "";
      const color = opts.color ? `color:${opts.color};` : "";
      const amt = typeof amount === "number" ? fmt(amount) : amount;
      return `<tr style="${bg}">
        <td style="border:1px solid #ddd;padding:6px 10px;text-align:right;${fw}${pl}${color}font-size:11px;">${label}</td>
        <td style="border:1px solid #ddd;padding:6px 10px;text-align:left;${fw}${color}font-size:11px;font-variant-numeric:tabular-nums;">${amt}</td>
        <td style="border:1px solid #ddd;padding:6px 10px;text-align:left;font-size:10px;color:#666;">${pctVal}</td>
      </tr>`;
    };
    const sep = `<tr><td colspan="3" style="height:4px;background:#eee;"></td></tr>`;

    let tableRows = "";
    tableRows += row("الإيرادات — المبيعات الداخلية للفروع", result.totalInternalSales, "100%", { bold: true, bg: "#eff6ff", color: "#1d4ed8" });
    result.salesByBranch.forEach((b) => {
      tableRows += row(b.name, b.total, pct(b.total, result.totalInternalSales), { indent: true });
    });
    tableRows += sep;
    tableRows += row("تكلفة التحويلات للفروع (COGS)", result.costOfTransfers, pct(result.costOfTransfers, result.totalInternalSales), { bold: true, bg: "#fff7ed", color: "#c2410c" });
    result.salesByBranch.forEach((b) => {
      tableRows += row(b.name, b.cost, pct(b.cost, result.totalInternalSales), { indent: true });
    });
    tableRows += sep;
    tableRows += row("مجمل الربح (Gross Profit)", result.grossProfit, result.grossProfitPct.toFixed(2) + "%", { bold: true, bg: "#ecfdf5", color: result.grossProfit < 0 ? "#dc2626" : "#047857" });
    tableRows += sep;
    tableRows += row("المصروفات التشغيلية", result.totalExpenses + result.wasteCost, pct(result.totalExpenses + result.wasteCost, result.totalInternalSales), { bold: true, bg: "#fff7ed", color: "#c2410c" });
    result.allExpenses.forEach((e) => {
      tableRows += row(e.name, e.amount, pct(e.amount, result.totalInternalSales), { indent: true });
    });
    if (result.wasteCost > 0) tableRows += row("الفاقد والإهلاك", result.wasteCost, pct(result.wasteCost, result.totalInternalSales), { indent: true });
    tableRows += sep;
    tableRows += row("صافي الربح (Net Profit)", result.netProfit, result.netProfitPct.toFixed(2) + "%", { bold: true, bg: result.netProfit >= 0 ? "#d1fae5" : "#fee2e2", color: result.netProfit < 0 ? "#dc2626" : "#047857" });

    // Reference inventory closing block
    const refRows = `
      ${row("جرد أول المدة", result.openingStock, "")}
      ${row("(+) المشتريات", result.purchasesTotal, "")}
      ${row("(+) تكلفة الإنتاج", result.productionCost, "")}
      ${row("البضاعة المتاحة", result.goodsAvailable, "", { bold: true, bg: "#fafafa" })}
      ${row("(-) جرد آخر المدة", `(${fmt(result.closingStock)})`, "")}
      ${row("COGS (Periodic - محاسبي)", result.periodicCogs, "", { bold: true, bg: "#f5f5f5" })}
    `;

    const printHTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>P&L — المخزن المركزي</title>
  <style>
    @font-face { font-family:'CairoLocal'; src:url('${window.location.origin}/fonts/Cairo-Regular.ttf') format('truetype'); }
    @font-face { font-family:'AmiriLocal'; src:url('${window.location.origin}/fonts/Amiri-Regular.ttf') format('truetype'); }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'CairoLocal','AmiriLocal',sans-serif; direction:rtl; padding:20px; color:#000; background:#fff; }
    @media print { @page { size:auto; margin:10mm; } body { padding:0; } }
    .header { text-align:center; margin-bottom:15px; border-bottom:1px solid #000; padding-bottom:10px; display:flex; align-items:center; justify-content:center; gap:10px; }
    .logo { width:80px; height:80px; object-fit:contain; }
    .header h1 { font-size:18px; font-weight:bold; margin-bottom:2px; }
    .header p { font-size:11px; }
    table { width:100%; border-collapse:collapse; }
    .kpi-row { display:flex; justify-content:space-around; margin-bottom:15px; gap:10px; }
    .kpi-box { border:1px solid #ddd; border-radius:8px; padding:10px 15px; text-align:center; flex:1; }
    .kpi-box .title { font-size:10px; color:#666; margin-bottom:4px; }
    .kpi-box .value { font-size:16px; font-weight:bold; }
    h2 { font-size:14px; font-weight:bold; margin:20px 0 8px; border-bottom:1px solid #000; padding-bottom:4px; }
    .note { font-size:10px; color:#666; margin-top:6px; }
    .footer { text-align:center; margin-top:15px; font-size:9px; border-top:1px solid #000; padding-top:8px; }
  </style>
</head>
<body>
  <div class="header">
    <img src="${logoSrc}" alt="Logo" class="logo" />
    <div>
      <h1>قائمة الأرباح والخسائر — المخزن المركزي</h1>
      <p style="font-size:13px;font-weight:bold;color:#000;margin-top:4px;">المخزن: ${whName}</p>
      <p>${periodStr} • ${dateStr}</p>
    </div>
  </div>
  <div class="kpi-row">
    <div class="kpi-box"><div class="title">المبيعات الداخلية</div><div class="value">${fmt(result.totalInternalSales)}</div></div>
    <div class="kpi-box"><div class="title">تكلفة التحويلات</div><div class="value">${fmt(result.costOfTransfers)}</div></div>
    <div class="kpi-box"><div class="title">مجمل الربح</div><div class="value">${fmt(result.grossProfit)} (${result.grossProfitPct.toFixed(2)}%)</div></div>
    <div class="kpi-box"><div class="title">صافي الربح</div><div class="value">${fmt(result.netProfit)} (${result.netProfitPct.toFixed(2)}%)</div></div>
  </div>
  <table>
    <thead><tr style="background:#f0f0f0;">
      <th style="border:1px solid #ddd;padding:6px 10px;text-align:right;font-size:11px;">البند</th>
      <th style="border:1px solid #ddd;padding:6px 10px;text-align:left;font-size:11px;">المبلغ (ج.م)</th>
      <th style="border:1px solid #ddd;padding:6px 10px;text-align:left;font-size:11px;">النسبة</th>
    </tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
  <p class="note">* COGS يمثل تكلفة التحويلات الفعلية للفروع (نموذج Perpetual). المخزن المركزي مركز توريد داخلي وليس نقطة بيع نهائية.</p>

  <h2>مرجع محاسبي — تقفيل المخزون (Periodic)</h2>
  <table>
    <thead><tr style="background:#f0f0f0;">
      <th style="border:1px solid #ddd;padding:6px 10px;text-align:right;font-size:11px;">البند</th>
      <th style="border:1px solid #ddd;padding:6px 10px;text-align:left;font-size:11px;">المبلغ (ج.م)</th>
      <th style="border:1px solid #ddd;padding:6px 10px;text-align:left;font-size:11px;"></th>
    </tr></thead>
    <tbody>${refRows}</tbody>
  </table>
  <p class="note">* هذا القسم لأغراض المراجعة المحاسبية فقط ولا يؤثر على مجمل الربح أعلاه.</p>

  <div class="footer">Powered by Mohamed Abdel Aal</div>
  <script>
    (async function(){try{if(document.fonts&&document.fonts.ready)await document.fonts.ready;}catch(e){}window.print();window.onafterprint=function(){window.close();};})();
  </script>
</body>
</html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(printHTML); w.document.close(); }
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* Filters */}
      <Card className="print:hidden">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">من</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-32 h-8 justify-start text-xs">
                    <CalendarIcon className="h-3.5 w-3.5 ml-1" />{format(dateFrom, "yyyy/MM/dd")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dateFrom} onSelect={(d) => d && setDateFrom(d)} /></PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">إلى</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-32 h-8 justify-start text-xs">
                    <CalendarIcon className="h-3.5 w-3.5 ml-1" />{format(dateTo, "yyyy/MM/dd")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dateTo} onSelect={(d) => d && setDateTo(d)} /></PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">المخزن</label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger className="w-52 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع المخازن</SelectItem>
                  {warehouses.map((w: any) => (<SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <Button variant={compareOn ? "default" : "outline"} size="sm" className="h-8" onClick={() => setCompareOn((v) => !v)}>
              <BarChart2 className="h-3.5 w-3.5 ml-1" /> مقارنة بالفترة السابقة
            </Button>
            {compareOn && (
              <Badge variant="outline" className="text-[10px]">
                {format(prevFrom, "yyyy/MM/dd")} → {format(prevTo, "yyyy/MM/dd")}
              </Badge>
            )}
            <div className="flex-1" />
            <Button variant="outline" size="sm" className="h-8" onClick={() => setAnalysisOpen(true)}>
              <Activity className="h-3.5 w-3.5 ml-1" /> تحليل
            </Button>
            <Button variant="outline" size="sm" className="h-8" onClick={handlePrint}>
              <Printer className="h-3.5 w-3.5 ml-1" /> طباعة
            </Button>
            <ExportButtons
              data={exportRows}
              columns={exportCols}
              filename={`warehouse-pnl-${dateFromStr}-${dateToStr}`}
              title="P&L المخزن المركزي"
              filters={[
                { label: "الفترة", value: `${dateFromStr} → ${dateToStr}` },
                { label: "المخزن", value: warehouseId === "all" ? "جميع المخازن" : (whNameById.get(warehouseId) || "-") },
              ]}
            />
          </div>
        </CardContent>
      </Card>

      {/* Compact KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {kpiCards.map((k, i) => (
          <Card key={i} className={`bg-gradient-to-br ${k.g} border`}>
            <CardContent className="p-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-muted-foreground leading-tight">{k.title}</span>
                <k.icon className={`h-4 w-4 ${k.t}`} />
              </div>
              <div className={`text-base font-bold ${k.t}`}>{k.value}</div>
              <CompareRow curr={k.curr} prev={k.prev} isPct={k.title.includes("%")} />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Statement */}
      <Card>
        <CardContent className="p-0">
          <div className="p-3 border-b flex items-center justify-between">
            <h2 className="font-bold text-foreground flex items-center gap-2 text-sm">
              <WarehouseIcon className="h-4 w-4 text-primary" />
              P&L — المخزن المركزي
            </h2>
            <Badge variant="outline" className="text-[10px]">{result.transfersCount} تحويل</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {/* Revenue */}
                <tr className="bg-blue-500/10 font-semibold text-blue-700 dark:text-blue-400 border-b cursor-pointer print:cursor-auto"
                    onClick={() => setOpenSections((s) => ({ ...s, sales: !s.sales }))}>
                  <td className="p-2.5 flex items-center gap-1">
                    <span className="print:hidden">{openSections.sales ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}</span>
                    الإيرادات — المبيعات الداخلية
                  </td>
                  <td className="p-2.5 text-left tabular-nums">{fmt(result.totalInternalSales)}</td>
                  <td className="p-2.5 text-left text-xs w-24">100%</td>
                </tr>
                {openSections.sales && result.salesByBranch.map((b, i) => (
                  <tr key={i} className="border-b hover:bg-muted/20">
                    <td className="p-2 pr-8 text-muted-foreground">{b.name}</td>
                    <td className="p-2 text-left tabular-nums">{fmt(b.total)}</td>
                    <td className="p-2 text-left text-xs text-muted-foreground">{pct(b.total, result.totalInternalSales)}</td>
                  </tr>
                ))}

                <tr><td colSpan={3} className="h-1 bg-muted/30"></td></tr>

                {/* COGS */}
                <tr className="bg-orange-500/10 font-semibold text-orange-700 dark:text-orange-400 border-b cursor-pointer print:cursor-auto"
                    onClick={() => setOpenSections((s) => ({ ...s, cogs: !s.cogs }))}>
                  <td className="p-2.5 flex items-center gap-1">
                    <span className="print:hidden">{openSections.cogs ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}</span>
                    تكلفة البضاعة المباعة (COGS)
                  </td>
                  <td className="p-2.5 text-left tabular-nums">{fmt(result.totalCogs)}</td>
                  <td className="p-2.5 text-left text-xs">{pct(result.totalCogs, result.totalInternalSales)}</td>
                </tr>
                {openSections.cogs && (
                  <>
                    <tr className="border-b hover:bg-muted/20"><td className="p-2 pr-8 text-muted-foreground">جرد أول المدة</td><td className="p-2 text-left tabular-nums">{fmt(result.openingStock)}</td><td className="p-2 text-left text-xs">{pct(result.openingStock, result.totalInternalSales)}</td></tr>
                    <tr className="border-b hover:bg-muted/20"><td className="p-2 pr-8 text-muted-foreground">(+) المشتريات</td><td className="p-2 text-left tabular-nums">{fmt(result.purchasesTotal)}</td><td className="p-2 text-left text-xs">{pct(result.purchasesTotal, result.totalInternalSales)}</td></tr>
                    <tr className="border-b hover:bg-muted/20"><td className="p-2 pr-8 text-muted-foreground">(+) تكلفة الإنتاج</td><td className="p-2 text-left tabular-nums">{fmt(result.productionCost)}</td><td className="p-2 text-left text-xs">{pct(result.productionCost, result.totalInternalSales)}</td></tr>
                    <tr className="border-b hover:bg-muted/20"><td className="p-2 pr-8 text-muted-foreground">(-) جرد آخر المدة</td><td className="p-2 text-left tabular-nums">({fmt(result.closingStock)})</td><td className="p-2"></td></tr>
                  </>
                )}

                <tr><td colSpan={3} className="h-1 bg-muted/30"></td></tr>

                <tr className="bg-emerald-500/10 font-bold text-emerald-700 dark:text-emerald-400 border-b">
                  <td className="p-2.5">مجمل الربح (Gross Profit)</td>
                  <td className={`p-2.5 text-left tabular-nums ${result.grossProfit < 0 ? "text-destructive" : ""}`}>{fmt(result.grossProfit)}</td>
                  <td className="p-2.5 text-left text-xs">{result.grossProfitPct.toFixed(2)}%</td>
                </tr>

                <tr><td colSpan={3} className="h-1 bg-muted/30"></td></tr>

                {/* Expenses */}
                <tr className="bg-orange-500/10 font-semibold text-orange-700 dark:text-orange-400 border-b cursor-pointer print:cursor-auto"
                    onClick={() => setOpenSections((s) => ({ ...s, expenses: !s.expenses }))}>
                  <td className="p-2.5 flex items-center gap-1">
                    <span className="print:hidden">{openSections.expenses ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}</span>
                    المصروفات التشغيلية
                  </td>
                  <td className="p-2.5 text-left tabular-nums">{fmt(result.totalExpenses + result.wasteCost)}</td>
                  <td className="p-2.5 text-left text-xs">{pct(result.totalExpenses + result.wasteCost, result.totalInternalSales)}</td>
                </tr>
                {openSections.expenses && (
                  <>
                    {result.allExpenses.map((e, i) => (
                      <tr key={i} className="border-b hover:bg-muted/20">
                        <td className="p-2 pr-8 text-muted-foreground">{e.name}</td>
                        <td className="p-2 text-left tabular-nums">{fmt(e.amount)}</td>
                        <td className="p-2 text-left text-xs text-muted-foreground">{pct(e.amount, result.totalInternalSales)}</td>
                      </tr>
                    ))}
                    {result.wasteCost > 0 && (
                      <tr className="border-b hover:bg-muted/20">
                        <td className="p-2 pr-8 text-muted-foreground">الفاقد والإهلاك</td>
                        <td className="p-2 text-left tabular-nums">{fmt(result.wasteCost)}</td>
                        <td className="p-2 text-left text-xs text-muted-foreground">{pct(result.wasteCost, result.totalInternalSales)}</td>
                      </tr>
                    )}
                  </>
                )}

                <tr><td colSpan={3} className="h-1 bg-muted/30"></td></tr>

                <tr className={`font-bold border-b ${result.netProfit >= 0 ? "bg-emerald-500/15" : "bg-red-500/15"}`}>
                  <td className="p-3">صافي الربح (Net Profit)</td>
                  <td className={`p-3 text-left tabular-nums ${result.netProfit < 0 ? "text-destructive" : "text-emerald-600"}`}>{fmt(result.netProfit)}</td>
                  <td className="p-3 text-left text-xs">{result.netProfitPct.toFixed(2)}%</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Manual expenses controls */}
          <div className="p-3 border-t print:hidden">
            <div className="flex items-center gap-2 flex-wrap">
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

      {/* Add expense dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>إضافة مصروف يدوي</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1"><label className="text-sm font-medium">اسم المصروف</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="مثال: مرتبات" /></div>
            <div className="space-y-1"><label className="text-sm font-medium">المبلغ (ج.م)</label>
              <Input type="number" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} placeholder="0.00" /></div>
            <Button onClick={addExpense} className="w-full">إضافة</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Analysis dialog */}
      <Dialog open={analysisOpen} onOpenChange={setAnalysisOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-primary" /> لوحة تحليل المخزن</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <Card><CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3">أعلى الفروع شراءً (Internal Sales)</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topBranches} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={100} />
                  <RTooltip formatter={(v: any) => fmt(Number(v))} />
                  <Bar dataKey="total" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent></Card>

            <Card><CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3">أعلى 10 أصناف تحويلاً</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topItems} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={110} />
                  <RTooltip formatter={(v: any) => fmt(Number(v))} />
                  <Bar dataKey="total" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent></Card>

            <Card><CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3">Trend شهري (المبيعات الداخلية)</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RTooltip formatter={(v: any) => fmt(Number(v))} />
                  <Legend />
                  <Line type="monotone" dataKey="sales" stroke="#0891b2" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent></Card>

            <Card><CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3">أعلى المخازن فاقدًا</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topWasteWh} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={100} />
                  <RTooltip formatter={(v: any) => fmt(Number(v))} />
                  <Bar dataKey="value" fill="#f43f5e" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent></Card>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
