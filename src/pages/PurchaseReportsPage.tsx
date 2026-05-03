import React, { useState, useMemo, useRef } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  CalendarIcon, Search, ShoppingCart, TrendingUp, TrendingDown, Package,
  FileText, Download, FileSpreadsheet, DollarSign, Layers, Store, Hash, BarChart3, Warehouse,
  ChevronDown, ChevronLeft
} from "lucide-react";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";

const COLORS = [
  "hsl(221, 83%, 53%)", "hsl(142, 76%, 36%)", "hsl(38, 92%, 50%)",
  "hsl(199, 89%, 48%)", "hsl(262, 83%, 58%)", "hsl(0, 84%, 60%)",
  "hsl(174, 72%, 40%)", "hsl(326, 78%, 55%)",
];

type PurchaseReportItem = {
  id: string;
  code: string | null;
  name: string;
  categoryName: string;
  unit: string;
  totalQty: number;
  purchaseCount: number;
  topSupplier: string;
  topSupplierCount: number;
  standardCost: number;
  avgCost: number;
  priceDiff: number;
  totalValue: number;
};

export const PurchaseReportsPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const tableRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [locationType, setLocationType] = useState<"branch" | "warehouse">("branch");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  // --- Data queries ---
  const { data: stockItems } = useQuery({
    queryKey: ["stock-items-pr", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_items").select("*, inventory_categories:category_id(id, name)")
        .eq("company_id", companyId!).eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: inventoryCategories } = useQuery({
    queryKey: ["inv-categories-pr", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_categories").select("id, name").eq("company_id", companyId!).eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers-pr", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name").eq("company_id", companyId!).eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: branches } = useQuery({
    queryKey: ["branches-pr", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("id, name").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses-pr", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("id, name").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: purchaseOrders } = useQuery({
    queryKey: ["purchase-orders-pr", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders").select("*")
        .eq("company_id", companyId!).eq("status", "مكتمل");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: purchaseItems } = useQuery({
    queryKey: ["purchase-items-pr", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_items").select("*, purchase_orders!inner(id, date, status, company_id, supplier_name, supplier_id, branch_id, warehouse_id, invoice_number)")
        .eq("purchase_orders.company_id", companyId!).eq("purchase_orders.status", "مكتمل");
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

  // Main calculation
  const calcData = useMemo(() => {
    if (!stockItems || !purchaseItems) return [];

    const map = new Map<string, {
      id: string; code: string | null; name: string; categoryName: string; categoryId: string | null;
      unit: string; totalQty: number; standardCost: number; avgCost: number;
      suppliers: Map<string, { name: string; count: number }>;
      invoiceIds: Set<string>;
    }>();

    for (const si of stockItems) {
      const catName = (si as any).inventory_categories?.name || "بدون مجموعة";
      map.set(si.id, {
        id: si.id, code: si.code, name: si.name, categoryName: catName,
        categoryId: si.category_id, unit: si.stock_unit,
        totalQty: 0, standardCost: Number(si.standard_cost) || 0,
        avgCost: Number(si.avg_cost) || 0,
        suppliers: new Map(), invoiceIds: new Set(),
      });
    }

    // Filter purchase items
    const filteredPI = purchaseItems.filter(pi => {
      const poDate = (pi as any).purchase_orders?.date;
      if (!poDate || !inDateRange(poDate)) return false;
      if (supplierFilter !== "all") {
        const suppId = (pi as any).purchase_orders?.supplier_id;
        if (suppId !== supplierFilter) return false;
      }
      if (locationFilter !== "all") {
        const po = (pi as any).purchase_orders;
        if (locationType === "branch" && po?.branch_id !== locationFilter) return false;
        if (locationType === "warehouse" && po?.warehouse_id !== locationFilter) return false;
      }
      return true;
    });

    for (const pi of filteredPI) {
      if (!pi.stock_item_id) continue;
      const calc = map.get(pi.stock_item_id);
      if (!calc) continue;
      calc.totalQty += Number(pi.quantity);
      calc.invoiceIds.add(pi.purchase_order_id);

      const suppName = (pi as any).purchase_orders?.supplier_name || "غير محدد";
      const suppId = (pi as any).purchase_orders?.supplier_id || suppName;
      const existing = calc.suppliers.get(suppId);
      if (existing) {
        existing.count += 1;
      } else {
        calc.suppliers.set(suppId, { name: suppName, count: 1 });
      }
    }

    const result: PurchaseReportItem[] = [];
    for (const calc of map.values()) {
      if (calc.totalQty === 0) continue;
      let topSupplier = "غير محدد";
      let topSupplierCount = 0;
      for (const [, s] of calc.suppliers) {
        if (s.count > topSupplierCount) {
          topSupplier = s.name;
          topSupplierCount = s.count;
        }
      }
      const priceDiff = calc.avgCost - calc.standardCost;
      result.push({
        id: calc.id, code: calc.code, name: calc.name,
        categoryName: calc.categoryName, unit: calc.unit,
        totalQty: calc.totalQty,
        purchaseCount: calc.invoiceIds.size,
        topSupplier, topSupplierCount,
        standardCost: calc.standardCost,
        avgCost: calc.avgCost,
        priceDiff,
        totalValue: calc.totalQty * calc.avgCost,
      });
    }

    result.sort((a, b) => b.purchaseCount - a.purchaseCount);
    return result;
  }, [stockItems, purchaseItems, dateFrom, dateTo, supplierFilter, locationFilter, locationType]);

  // Apply search + category
  const filteredData = useMemo(() => {
    let result = calcData;
    if (categoryFilter !== "all") {
      result = result.filter(i => {
        const si = stockItems?.find(s => s.id === i.id);
        return si?.category_id === categoryFilter;
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(i =>
        i.name.toLowerCase().includes(q) ||
        (i.code || "").toLowerCase().includes(q) ||
        i.categoryName.toLowerCase().includes(q)
      );
    }
    return result;
  }, [calcData, categoryFilter, searchQuery, stockItems]);

  // Receipts per stock item (for expandable detail rows)
  const receiptsByItem = useMemo(() => {
    const m = new Map<string, Array<{ id: string; date: string; invoice: string; supplier: string; qty: number; unitCost: number; total: number; location: string }>>();
    if (!purchaseItems) return m;
    const branchMap = new Map((branches || []).map((b: any) => [b.id, b.name]));
    const warehouseMap = new Map((warehouses || []).map((w: any) => [w.id, w.name]));
    for (const pi of purchaseItems) {
      if (!pi.stock_item_id) continue;
      const po = (pi as any).purchase_orders;
      if (!po?.date || !inDateRange(po.date)) continue;
      if (supplierFilter !== "all" && po.supplier_id !== supplierFilter) continue;
      if (locationFilter !== "all") {
        if (locationType === "branch" && po.branch_id !== locationFilter) continue;
        if (locationType === "warehouse" && po.warehouse_id !== locationFilter) continue;
      }
      const loc = po.branch_id ? branchMap.get(po.branch_id) : po.warehouse_id ? warehouseMap.get(po.warehouse_id) : "";
      const arr = m.get(pi.stock_item_id) || [];
      const qty = Number(pi.quantity) || 0;
      const unitCost = Number(pi.unit_cost) || 0;
      arr.push({
        id: pi.id,
        date: po.date,
        invoice: (po as any).invoice_number || "—",
        supplier: po.supplier_name || "—",
        qty,
        unitCost,
        total: qty * unitCost,
        location: (loc as string) || "—",
      });
      m.set(pi.stock_item_id, arr);
    }
    for (const [, arr] of m) arr.sort((a, b) => b.date.localeCompare(a.date));
    return m;
  }, [purchaseItems, branches, warehouses, dateFrom, dateTo, supplierFilter, locationFilter, locationType]);


  const stats = useMemo(() => {
    const totalInvoices = new Set<string>();
    const totalValue = filteredData.reduce((s, i) => s + i.totalValue, 0);
    const totalItems = filteredData.length;
    const totalQty = filteredData.reduce((s, i) => s + i.totalQty, 0);

    // Count completed invoices in date range
    let invoiceCount = 0;
    let totalInvoiceValue = 0;
    if (purchaseOrders) {
      for (const po of purchaseOrders) {
        if (!inDateRange(po.date)) continue;
        if (supplierFilter !== "all" && po.supplier_id !== supplierFilter) continue;
        if (locationFilter !== "all") {
          if (locationType === "branch" && po.branch_id !== locationFilter) continue;
          if (locationType === "warehouse" && po.warehouse_id !== locationFilter) continue;
        }
        invoiceCount++;
        totalInvoiceValue += Number(po.total_amount);
      }
    }

    const avgInvoiceValue = invoiceCount > 0 ? totalInvoiceValue / invoiceCount : 0;
    const negDiffCount = filteredData.filter(i => i.priceDiff < 0).length;
    const posDiffCount = filteredData.filter(i => i.priceDiff > 0).length;

    return { totalValue, totalItems, totalQty, invoiceCount, totalInvoiceValue, avgInvoiceValue, negDiffCount, posDiffCount };
  }, [filteredData, purchaseOrders, dateFrom, dateTo, supplierFilter, locationFilter, locationType]);

  // Chart data
  const topItemsChart = useMemo(() => {
    return filteredData.slice(0, 10).map(i => ({
      name: i.name.length > 12 ? i.name.substring(0, 12) + "..." : i.name,
      عدد_المشتريات: i.purchaseCount,
      الكمية: i.totalQty,
    }));
  }, [filteredData]);

  const categoryChart = useMemo(() => {
    const catMap = new Map<string, number>();
    for (const i of filteredData) {
      catMap.set(i.categoryName, (catMap.get(i.categoryName) || 0) + i.totalValue);
    }
    return Array.from(catMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredData]);

  const priceDiffChart = useMemo(() => {
    return filteredData.slice(0, 10).map(i => ({
      name: i.name.length > 12 ? i.name.substring(0, 12) + "..." : i.name,
      فرق_السعر: Number(i.priceDiff.toFixed(2)),
    }));
  }, [filteredData]);

  const monthlyChart = useMemo(() => {
    if (!purchaseOrders) return [];
    const months = new Map<string, number>();
    for (const po of purchaseOrders) {
      if (!inDateRange(po.date)) continue;
      if (supplierFilter !== "all" && po.supplier_id !== supplierFilter) continue;
      if (locationFilter !== "all") {
        if (locationType === "branch" && po.branch_id !== locationFilter) continue;
        if (locationType === "warehouse" && po.warehouse_id !== locationFilter) continue;
      }
      const m = po.date.substring(0, 7);
      months.set(m, (months.get(m) || 0) + Number(po.total_amount));
    }
    return Array.from(months.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([month, value]) => ({
      الشهر: month, القيمة: value,
    }));
  }, [purchaseOrders, dateFrom, dateTo, supplierFilter, locationFilter, locationType]);

  // Export
  const exportCSV = () => {
    const headers = ["الكود", "اسم الخامة", "المجموعة", "عدد مرات الشراء", "المورد الأكثر شراءً", "إجمالي الكمية", "الوحدة", "التكلفة المعيارية", "متوسط التكلفة", "فرق السعر", "إجمالي القيمة"];
    const rows = filteredData.map(i => [
      i.code || "", i.name, i.categoryName, i.purchaseCount, `${i.topSupplier} (${i.topSupplierCount})`,
      i.totalQty.toFixed(2), i.unit, i.standardCost.toFixed(2), i.avgCost.toFixed(2),
      i.priceDiff.toFixed(2), i.totalValue.toFixed(2),
    ]);
    const bom = "\uFEFF";
    const csv = bom + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `تقرير_المشتريات_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    window.print();
  };

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6 print:space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
            <ShoppingCart className="text-primary" size={28} />
            تقارير المشتريات
          </h1>
          <p className="text-muted-foreground text-sm mt-1">تحليل شامل لعمليات الشراء والموردين والخامات</p>
        </div>
      </div>

      {/* Filters */}
      <Card className="print:hidden">
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <Input placeholder="بحث بالاسم أو الكود أو المجموعة..." value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)} className="pr-9 text-sm" />
            </div>

            {/* Category */}
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="المجموعة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المجموعات</SelectItem>
                {inventoryCategories?.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Supplier */}
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="المورد" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الموردين</SelectItem>
                {suppliers?.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Location */}
            <div className="flex gap-1">
              <div className="flex items-center gap-0.5 bg-muted/40 rounded-lg p-0.5 border border-border/40">
                <Button variant={locationType === "branch" ? "default" : "ghost"} size="sm" className="h-8 text-xs px-2"
                  onClick={() => { setLocationType("branch"); setLocationFilter("all"); }}>
                  <Store className="h-3.5 w-3.5 ml-1" /> فرع
                </Button>
                <Button variant={locationType === "warehouse" ? "default" : "ghost"} size="sm" className="h-8 text-xs px-2"
                  onClick={() => { setLocationType("warehouse"); setLocationFilter("all"); }}>
                  <Warehouse className="h-3.5 w-3.5 ml-1" /> مخزن
                </Button>
              </div>
              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger className="text-sm flex-1"><SelectValue placeholder={locationType === "branch" ? "كل الفروع" : "كل المخازن"} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{locationType === "branch" ? "كل الفروع" : "كل المخازن"}</SelectItem>
                  {locationType === "branch"
                    ? branches?.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)
                    : warehouses?.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)
                  }
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
            {/* Date From */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("text-sm justify-start", !dateFrom && "text-muted-foreground")}>
                  <CalendarIcon size={14} className="ml-1" />
                  {dateFrom ? format(dateFrom, "yyyy/MM/dd") : "من تاريخ"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>

            {/* Date To */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("text-sm justify-start", !dateTo && "text-muted-foreground")}>
                  <CalendarIcon size={14} className="ml-1" />
                  {dateTo ? format(dateTo, "yyyy/MM/dd") : "إلى تاريخ"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>

          {(dateFrom || dateTo || categoryFilter !== "all" || supplierFilter !== "all" || locationFilter !== "all" || searchQuery) && (
            <div className="mt-2 flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => { setDateFrom(undefined); setDateTo(undefined); setCategoryFilter("all"); setSupplierFilter("all"); setLocationFilter("all"); setSearchQuery(""); }}>
                مسح الفلاتر
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
                <FileText className="text-primary" size={20} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">عدد الفواتير</p>
                <p className="text-xl font-black text-foreground">{stats.invoiceCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                <DollarSign className="text-emerald-600" size={20} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">إجمالي قيمة المشتريات</p>
                <p className="text-xl font-black text-foreground">{fmt(stats.totalInvoiceValue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
                <Package className="text-amber-600" size={20} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">خامات تم شراؤها</p>
                <p className="text-xl font-black text-foreground">{stats.totalItems}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
                <BarChart3 className="text-blue-600" size={20} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">متوسط قيمة الفاتورة</p>
                <p className="text-xl font-black text-foreground">{fmt(stats.avgInvoiceValue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>


      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:hidden">
        {/* Monthly trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">اتجاه المشتريات الشهري</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={monthlyChart} margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="الشهر" tick={{ fontSize: 11 }} tickMargin={80} />
                <YAxis tick={{ fontSize: 11 }} tickMargin={35} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, color: "#000" }} />
                <Line type="monotone" dataKey="القيمة" stroke="hsl(221, 83%, 53%)" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Category distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">توزيع المشتريات حسب المجموعة</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <Pie data={categoryChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}
                  label={({ name, percent, cx, cy, midAngle, outerRadius: or }) => {
                    const rad = Math.PI / 180;
                    const radius = or + 70;
                    const x = cx + radius * Math.cos(-midAngle * rad);
                    const y = cy + radius * Math.sin(-midAngle * rad);
                    return (
                      <text x={x} y={y} textAnchor={x > cx ? "start" : "end"} dominantBaseline="central"
                        fontSize={10} fill="hsl(var(--foreground))">
                        {`${name} ${(percent * 100).toFixed(0)}%`}
                      </text>
                    );
                  }}>
                  {categoryChart.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, color: "#000" }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top items by purchase count */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">أكثر الخامات شراءً</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topItemsChart} layout="vertical" margin={{ top: 20, right: 100, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickMargin={10} />
                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} tickMargin={50} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, color: "#000" }} />
                <Legend />
                <Bar dataKey="عدد_المشتريات" fill="hsl(221, 83%, 53%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Price difference chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">فرق السعر (المعيارية - المتوسط)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={priceDiffChart} margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} tickMargin={50} />
                <YAxis tick={{ fontSize: 11 }} tickMargin={35} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, color: "#000" }} />
                <Bar dataKey="فرق_السعر" radius={[4, 4, 0, 0]}>
                  {priceDiffChart.map((entry, i) => (
                    <Cell key={i} fill={entry.فرق_السعر < 0 ? "hsl(0, 84%, 60%)" : "hsl(142, 76%, 36%)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Package size={16} /> جدول تفاصيل المشتريات ({filteredData.length} خامة)
            </CardTitle>
            <div className="flex items-center gap-2">
              <ExportButtons
                data={filteredData.map((item: any) => ({ code: item.code || "—", name: item.name, category: item.categoryName, purchases: item.purchaseCount, supplier: item.topSupplier, qty: fmt(item.totalQty), unit: item.unit, stdCost: fmt(item.standardCost), avgCost: fmt(item.avgCost), diff: fmt(item.priceDiff), total: fmt(item.totalValue) }))}
                columns={[{ key: "code", label: "الكود" }, { key: "name", label: "الخامة" }, { key: "category", label: "المجموعة" }, { key: "purchases", label: "عدد الشراء" }, { key: "supplier", label: "المورد الأكثر" }, { key: "qty", label: "إجمالي الكمية" }, { key: "unit", label: "الوحدة" }, { key: "stdCost", label: "التكلفة المعيارية" }, { key: "avgCost", label: "متوسط التكلفة" }, { key: "diff", label: "فرق السعر" }, { key: "total", label: "إجمالي القيمة" }]}
                filename="تقارير_المشتريات"
                title="تقارير المشتريات"
              />
              <PrintButton
                data={filteredData.map((item: any) => ({ code: item.code || "—", name: item.name, category: item.categoryName, purchases: item.purchaseCount, supplier: item.topSupplier, qty: fmt(item.totalQty), unit: item.unit, stdCost: fmt(item.standardCost), avgCost: fmt(item.avgCost), diff: fmt(item.priceDiff), total: fmt(item.totalValue) }))}
                columns={[{ key: "code", label: "الكود" }, { key: "name", label: "الخامة" }, { key: "category", label: "المجموعة" }, { key: "purchases", label: "عدد الشراء" }, { key: "supplier", label: "المورد الأكثر" }, { key: "qty", label: "إجمالي الكمية" }, { key: "unit", label: "الوحدة" }, { key: "stdCost", label: "التكلفة المعيارية" }, { key: "avgCost", label: "متوسط التكلفة" }, { key: "diff", label: "فرق السعر" }, { key: "total", label: "إجمالي القيمة" }]}
                title="تقارير المشتريات"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0" ref={tableRef}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-center text-xs font-bold">#</TableHead>
                  <TableHead className="text-center text-xs font-bold">الكود</TableHead>
                  <TableHead className="text-xs font-bold">اسم الخامة</TableHead>
                  <TableHead className="text-xs font-bold">المجموعة</TableHead>
                  <TableHead className="text-center text-xs font-bold">عدد مرات الشراء</TableHead>
                  <TableHead className="text-xs font-bold">المورد الأكثر شراءً</TableHead>
                  <TableHead className="text-center text-xs font-bold">إجمالي الكمية</TableHead>
                  <TableHead className="text-center text-xs font-bold">الوحدة</TableHead>
                  <TableHead className="text-center text-xs font-bold">التكلفة المعيارية</TableHead>
                  <TableHead className="text-center text-xs font-bold">متوسط التكلفة</TableHead>
                  <TableHead className="text-center text-xs font-bold">فرق السعر</TableHead>
                  <TableHead className="text-center text-xs font-bold">إجمالي القيمة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-muted-foreground py-12">
                      لا توجد بيانات مشتريات
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredData.map((item, idx) => (
                    <TableRow key={item.id} className="hover:bg-muted/30">
                      <TableCell className="text-center text-xs">{idx + 1}</TableCell>
                      <TableCell className="text-center text-xs font-mono">{item.code || "-"}</TableCell>
                      <TableCell className="text-xs font-medium">{item.name}</TableCell>
                      <TableCell className="text-xs">{item.categoryName}</TableCell>
                      <TableCell className="text-center text-xs font-bold">{item.purchaseCount}</TableCell>
                      <TableCell className="text-xs">
                        <span className="font-medium">{item.topSupplier}</span>
                        <span className="text-muted-foreground mr-1">({item.topSupplierCount})</span>
                      </TableCell>
                      <TableCell className="text-center text-xs font-bold">{fmt(item.totalQty)}</TableCell>
                      <TableCell className="text-center text-xs">{item.unit}</TableCell>
                      <TableCell className="text-center text-xs">{fmt(item.standardCost)}</TableCell>
                      <TableCell className="text-center text-xs">{fmt(item.avgCost)}</TableCell>
                      <TableCell className={cn("text-center text-xs font-bold",
                        item.priceDiff < 0 ? "text-red-600" : item.priceDiff > 0 ? "text-emerald-600" : "text-muted-foreground"
                      )}>
                        {item.priceDiff > 0 ? "+" : ""}{fmt(item.priceDiff)}
                      </TableCell>
                      <TableCell className="text-center text-xs font-bold">{fmt(item.totalValue)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
