import React, { useState, useMemo } from "react";
import { ExportButtons } from "@/components/ExportButtons";
import { PrintButton } from "@/components/PrintButton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Search, Store, Warehouse, Factory, FileSpreadsheet, FileText,
  BarChart3, Layers, TrendingUp, Package, CalendarIcon, Activity
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";

const COLORS = [
  "hsl(221, 83%, 53%)", "hsl(262, 83%, 58%)", "hsl(142, 76%, 36%)",
  "hsl(38, 92%, 50%)", "hsl(0, 84%, 60%)", "hsl(174, 72%, 40%)",
];

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n: number) => n.toLocaleString("en-US");

export const ProductionReportsPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;

  const [searchQuery, setSearchQuery] = useState("");
  const [locationType, setLocationType] = useState<"branch" | "warehouse">("branch");
  const [locationFilter, setLocationFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  const { data: productionRecords = [], isLoading } = useQuery({
    queryKey: ["production-records-report", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_records")
        .select("*")
        .eq("status", "مكتمل")
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: stockItems = [] } = useQuery({
    queryKey: ["stock-items-prod-report", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_items")
        .select("*, inventory_categories:category_id(id, name)")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ["branches-prod-report", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses-prod-report", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["inv-categories-prod-report", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_categories").select("id, name").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const processedData = useMemo(() => {
    // Filter records by date and location
    let filteredRecords = [...productionRecords];

    if (dateFrom) filteredRecords = filteredRecords.filter(r => r.date >= format(dateFrom, "yyyy-MM-dd"));
    if (dateTo) filteredRecords = filteredRecords.filter(r => r.date <= format(dateTo, "yyyy-MM-dd"));

    if (locationFilter !== "all") {
      if (locationType === "branch") {
        filteredRecords = filteredRecords.filter(r => r.branch_id === locationFilter);
      } else {
        filteredRecords = filteredRecords.filter(r => r.warehouse_id === locationFilter);
      }
    }

    // Build a map: product_id → aggregated data
    const itemMap = new Map<string, {
      productId: string;
      name: string;
      code: string;
      catName: string;
      categoryId: string;
      currentStock: number;
      avgCost: number;
      stockUnit: string;
      productionCount: number;
      totalProductionCost: number;
      totalProducedQty: number;
      lastProductionDate: string;
    }>();

    const stockMap = new Map<string, any>();
    for (const si of stockItems) {
      stockMap.set(si.id, si);
    }

    for (const rec of filteredRecords) {
      const pid = rec.product_id;
      if (!pid) continue;

      const si = stockMap.get(pid);
      if (!si) continue;

      const existing = itemMap.get(pid);
      if (existing) {
        existing.productionCount += 1;
        existing.totalProductionCost += Number(rec.total_production_cost);
        existing.totalProducedQty += Number(rec.produced_qty);
        if (rec.date > existing.lastProductionDate) existing.lastProductionDate = rec.date;
      } else {
        const catName = (si as any).inventory_categories?.name || "بدون مجموعة";
        itemMap.set(pid, {
          productId: pid,
          name: si.name,
          code: si.code || "",
          catName,
          categoryId: si.category_id || "",
          currentStock: Number(si.current_stock),
          avgCost: Number(si.avg_cost),
          stockUnit: si.stock_unit,
          productionCount: 1,
          totalProductionCost: Number(rec.total_production_cost),
          totalProducedQty: Number(rec.produced_qty),
          lastProductionDate: rec.date,
        });
      }
    }

    let result = Array.from(itemMap.values()).sort((a, b) => b.productionCount - a.productionCount);

    // Category filter
    if (categoryFilter !== "all") {
      result = result.filter(i => i.categoryId === categoryFilter);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(i =>
        i.name.toLowerCase().includes(q) ||
        i.code.toLowerCase().includes(q) ||
        i.catName.toLowerCase().includes(q)
      );
    }

    return result;
  }, [productionRecords, stockItems, dateFrom, dateTo, locationFilter, locationType, categoryFilter, searchQuery]);

  // Stats
  const stats = useMemo(() => {
    let filteredRecords = [...productionRecords];
    if (dateFrom) filteredRecords = filteredRecords.filter(r => r.date >= format(dateFrom, "yyyy-MM-dd"));
    if (dateTo) filteredRecords = filteredRecords.filter(r => r.date <= format(dateTo, "yyyy-MM-dd"));
    if (locationFilter !== "all") {
      if (locationType === "branch") filteredRecords = filteredRecords.filter(r => r.branch_id === locationFilter);
      else filteredRecords = filteredRecords.filter(r => r.warehouse_id === locationFilter);
    }

    const totalRecords = filteredRecords.length;
    const totalCost = filteredRecords.reduce((s, r) => s + Number(r.total_production_cost), 0);
    const totalQty = filteredRecords.reduce((s, r) => s + Number(r.produced_qty), 0);
    const uniqueProducts = new Set(filteredRecords.map(r => r.product_id).filter(Boolean)).size;
    const avgCostPerRecord = totalRecords > 0 ? totalCost / totalRecords : 0;

    return { totalRecords, totalCost, totalQty, uniqueProducts, avgCostPerRecord };
  }, [productionRecords, dateFrom, dateTo, locationFilter, locationType]);

  // Monthly trend chart
  const monthlyTrend = useMemo(() => {
    let filteredRecords = [...productionRecords];
    if (dateFrom) filteredRecords = filteredRecords.filter(r => r.date >= format(dateFrom, "yyyy-MM-dd"));
    if (dateTo) filteredRecords = filteredRecords.filter(r => r.date <= format(dateTo, "yyyy-MM-dd"));
    if (locationFilter !== "all") {
      if (locationType === "branch") filteredRecords = filteredRecords.filter(r => r.branch_id === locationFilter);
      else filteredRecords = filteredRecords.filter(r => r.warehouse_id === locationFilter);
    }

    const map = new Map<string, { month: string; cost: number; count: number }>();
    for (const r of filteredRecords) {
      const month = r.date.slice(0, 7);
      const existing = map.get(month);
      if (existing) {
        existing.cost += Number(r.total_production_cost);
        existing.count += 1;
      } else {
        map.set(month, { month, cost: Number(r.total_production_cost), count: 1 });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [productionRecords, dateFrom, dateTo, locationFilter, locationType]);

  // Top products chart
  const topProductsChart = useMemo(() => {
    return processedData.slice(0, 8).map(i => ({
      name: i.name.length > 15 ? i.name.slice(0, 15) + "..." : i.name,
      count: i.productionCount,
      cost: i.totalProductionCost,
    }));
  }, [processedData]);

  // Category distribution
  const categoryDistChart = useMemo(() => {
    const catMap = new Map<string, number>();
    for (const i of processedData) {
      catMap.set(i.catName, (catMap.get(i.catName) || 0) + i.totalProductionCost);
    }
    return Array.from(catMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [processedData]);

  // Totals
  const totals = useMemo(() => ({
    totalCost: processedData.reduce((s, i) => s + i.totalProductionCost, 0),
  }), [processedData]);

  // Export
  const exportCSV = () => {
    const headers = ["#", "الكود", "اسم الصنف", "المجموعة", "كثافة الإنتاج", "إجمالي الكمية", "الوحدة", "الرصيد الحالي", "متوسط التكلفة", "إجمالي تكلفة الإنتاج", "آخر تاريخ إنتاج"];
    const rows = processedData.map((i, idx) => [
      idx + 1, i.code, i.name, i.catName, i.productionCount, i.totalProducedQty.toFixed(2),
      i.stockUnit, i.currentStock.toFixed(2), i.avgCost.toFixed(2), i.totalProductionCost.toFixed(2), i.lastProductionDate,
    ]);
    const bom = "\uFEFF";
    const csv = bom + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `تقارير_الإنتاج_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 print:space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
            <Factory className="text-primary" size={28} />
            تقارير عمليات الإنتاج
          </h1>
          <p className="text-muted-foreground text-sm mt-1">تحليل كثافة وتكاليف عمليات الإنتاج</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <ExportButtons
            data={processedData.map((i, idx) => ({
              "#": idx + 1,
              الكود: i.code,
              "اسم الصنف": i.name,
              المجموعة: i.catName,
              "كثافة الإنتاج": i.productionCount,
              "إجمالي الكمية": i.totalProducedQty.toFixed(2),
              الوحدة: i.stockUnit,
              "الرصيد الحالي": i.currentStock.toFixed(2),
              "متوسط التكلفة": i.avgCost.toFixed(2),
              "إجمالي تكلفة الإنتاج": i.totalProductionCost.toFixed(2),
              "آخر تاريخ إنتاج": i.lastProductionDate,
            }))}
            columns={[
              { key: "#", label: "#" },
              { key: "الكود", label: "الكود" },
              { key: "اسم الصنف", label: "اسم الصنف" },
              { key: "المجموعة", label: "المجموعة" },
              { key: "كثافة الإنتاج", label: "كثافة الإنتاج" },
              { key: "إجمالي الكمية", label: "إجمالي الكمية" },
              { key: "الوحدة", label: "الوحدة" },
              { key: "الرصيد الحالي", label: "الرصيد الحالي" },
              { key: "متوسط التكلفة", label: "متوسط التكلفة" },
              { key: "إجمالي تكلفة الإنتاج", label: "إجمالي تكلفة الإنتاج" },
              { key: "آخر تاريخ إنتاج", label: "آخر تاريخ إنتاج" },
            ]}
            filename="تقارير_الإنتاج"
            title="تقارير عمليات الإنتاج"
          />
          <PrintButton
            data={processedData.map((i, idx) => ({
              "#": idx + 1,
              الكود: i.code,
              "اسم الصنف": i.name,
              المجموعة: i.catName,
              "كثافة الإنتاج": i.productionCount,
              "إجمالي الكمية": i.totalProducedQty.toFixed(2),
              الوحدة: i.stockUnit,
              "الرصيد الحالي": i.currentStock.toFixed(2),
              "متوسط التكلفة": i.avgCost.toFixed(2),
              "إجمالي تكلفة الإنتاج": i.totalProductionCost.toFixed(2),
              "آخر تاريخ إنتاج": i.lastProductionDate,
            }))}
            columns={[
              { key: "#", label: "#" },
              { key: "الكود", label: "الكود" },
              { key: "اسم الصنف", label: "اسم الصنف" },
              { key: "المجموعة", label: "المجموعة" },
              { key: "كثافة الإنتاج", label: "كثافة الإنتاج" },
              { key: "إجمالي الكمية", label: "إجمالي الكمية" },
              { key: "الوحدة", label: "الوحدة" },
              { key: "الرصيد الحالي", label: "الرصيد الحالي" },
              { key: "متوسط التكلفة", label: "متوسط التكلفة" },
              { key: "إجمالي تكلفة الإنتاج", label: "إجمالي تكلفة الإنتاج" },
              { key: "آخر تاريخ إنتاج", label: "آخر تاريخ إنتاج" },
            ]}
            title="تقارير عمليات الإنتاج"
          />
        </div>
      </div>

      {/* Filters */}
      <Card className="print:hidden">
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <Input placeholder="بحث بالاسم أو الكود..." value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)} className="pr-9 text-sm" />
            </div>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="المجموعة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المجموعات</SelectItem>
                {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>

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
                    ? branches.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)
                    : warehouses.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)
                  }
                </SelectContent>
              </Select>
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("text-sm justify-start", !dateFrom && "text-muted-foreground")}>
                  <CalendarIcon size={14} className="ml-1" />
                  {dateFrom ? format(dateFrom, "yyyy/MM/dd") : "من تاريخ"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent mode="single" selected={dateFrom} onSelect={setDateFrom} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("text-sm justify-start", !dateTo && "text-muted-foreground")}>
                  <CalendarIcon size={14} className="ml-1" />
                  {dateTo ? format(dateTo, "yyyy/MM/dd") : "إلى تاريخ"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent mode="single" selected={dateTo} onSelect={setDateTo} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          {(categoryFilter !== "all" || locationFilter !== "all" || searchQuery || dateFrom || dateTo) && (
            <div className="mt-2 flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => { setCategoryFilter("all"); setLocationFilter("all"); setSearchQuery(""); setDateFrom(undefined); setDateTo(undefined); }}>
                مسح الفلاتر
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
                <Activity className="text-primary" size={20} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">عمليات الإنتاج</p>
                <p className="text-xl font-black text-foreground">{fmtInt(stats.totalRecords)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                <TrendingUp className="text-emerald-600" size={20} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">إجمالي تكلفة الإنتاج</p>
                <p className="text-xl font-black text-foreground">{fmt(stats.totalCost)}</p>
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
                <p className="text-xs text-muted-foreground">إجمالي الكميات المنتجة</p>
                <p className="text-xl font-black text-foreground">{fmt(stats.totalQty)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center">
                <Layers className="text-violet-600" size={20} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">أصناف منتجة</p>
                <p className="text-xl font-black text-foreground">{fmtInt(stats.uniqueProducts)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/15 flex items-center justify-center">
                <CalendarIcon className="text-sky-600" size={20} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">متوسط تكلفة العملية</p>
                <p className="text-xl font-black text-foreground">{fmt(stats.avgCostPerRecord)}</p>
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
            <CardTitle className="text-sm font-bold">اتجاه الإنتاج الشهري</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={monthlyTrend} margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} tickMargin={10} />
                <YAxis tick={{ fontSize: 10 }} tickMargin={10} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, color: "#000" }} />
                <Line type="monotone" dataKey="cost" name="التكلفة" stroke="hsl(221, 83%, 53%)" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="count" name="عدد العمليات" stroke="hsl(142, 76%, 36%)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top products */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">أكثر الأصناف إنتاجاً</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topProductsChart} margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} tickMargin={10} />
                <YAxis tick={{ fontSize: 10 }} tickMargin={10} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, color: "#000" }} />
                <Bar dataKey="count" name="عدد مرات الإنتاج" fill="hsl(221, 83%, 53%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Category distribution */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">توزيع تكلفة الإنتاج حسب المجموعة</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <Pie data={categoryDistChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}
                  label={({ name, percent, cx: cxx, cy: cyy, midAngle, outerRadius: or }: any) => {
                    const rad = Math.PI / 180;
                    const radius = or + 28;
                    const x = cxx + radius * Math.cos(-midAngle * rad);
                    const y = cyy + radius * Math.sin(-midAngle * rad);
                    return (
                      <text x={x} y={y} textAnchor={x > cxx ? "start" : "end"} dominantBaseline="central"
                        fontSize={11} fill="hsl(var(--foreground))">
                        {`${name} ${(percent * 100).toFixed(0)}%`}
                      </text>
                    );
                  }}>
                  {categoryDistChart.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, color: "#000" }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <BarChart3 size={16} /> جدول كثافة الإنتاج ({processedData.length} صنف)
            </CardTitle>
            <ExportButtons
              data={processedData.map((item: any) => ({ code: item.code || "—", name: item.name, category: item.catName, count: item.productionCount, qty: fmt(item.totalProducedQty), stock: fmt(item.currentStock), unit: item.stockUnit, avgCost: fmt(item.avgCost), totalCost: fmt(item.totalProductionCost), lastDate: item.lastProductionDate }))}
              columns={[{ key: "code", label: "الكود" }, { key: "name", label: "الصنف" }, { key: "category", label: "المجموعة" }, { key: "count", label: "كثافة الإنتاج" }, { key: "qty", label: "إجمالي الكمية" }, { key: "stock", label: "الرصيد الحالي" }, { key: "unit", label: "الوحدة" }, { key: "avgCost", label: "متوسط التكلفة" }, { key: "totalCost", label: "إجمالي تكلفة الإنتاج" }, { key: "lastDate", label: "آخر تاريخ" }]}
              filename="تقارير_الإنتاج"
              title="تقارير الإنتاج"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-center text-xs font-bold w-10">#</TableHead>
                  <TableHead className="text-center text-xs font-bold">الكود</TableHead>
                  <TableHead className="text-xs font-bold">اسم الصنف</TableHead>
                  <TableHead className="text-xs font-bold">المجموعة</TableHead>
                  <TableHead className="text-center text-xs font-bold">كثافة الإنتاج</TableHead>
                  <TableHead className="text-center text-xs font-bold">إجمالي الكمية</TableHead>
                  <TableHead className="text-center text-xs font-bold">الرصيد الحالي</TableHead>
                  <TableHead className="text-center text-xs font-bold">الوحدة</TableHead>
                  <TableHead className="text-center text-xs font-bold">متوسط التكلفة</TableHead>
                  <TableHead className="text-center text-xs font-bold">إجمالي تكلفة الإنتاج</TableHead>
                  <TableHead className="text-center text-xs font-bold">آخر تاريخ إنتاج</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">جاري التحميل...</TableCell>
                  </TableRow>
                ) : processedData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">لا توجد بيانات إنتاج</TableCell>
                  </TableRow>
                ) : (
                  processedData.map((item, idx) => (
                    <TableRow key={item.productId} className="hover:bg-muted/30">
                      <TableCell className="text-center text-xs">{idx + 1}</TableCell>
                      <TableCell className="text-center text-xs font-mono">{item.code || "—"}</TableCell>
                      <TableCell className="text-xs font-medium">{item.name}</TableCell>
                      <TableCell className="text-xs">{item.catName}</TableCell>
                      <TableCell className="text-center text-xs">
                        <span className="inline-flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold text-[11px]">
                          {fmtInt(item.productionCount)} مرة
                        </span>
                      </TableCell>
                      <TableCell className="text-center text-xs font-bold">{fmt(item.totalProducedQty)}</TableCell>
                      <TableCell className="text-center text-xs">{fmt(item.currentStock)}</TableCell>
                      <TableCell className="text-center text-xs">{item.stockUnit}</TableCell>
                      <TableCell className="text-center text-xs">{fmt(item.avgCost)}</TableCell>
                      <TableCell className="text-center text-xs font-bold">{fmt(item.totalProductionCost)}</TableCell>
                      <TableCell className="text-center text-xs">{item.lastProductionDate}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {processedData.length > 0 && (
                <TableFooter>
                  <TableRow className="bg-muted/60 font-bold">
                    <TableCell colSpan={9} className="text-xs text-left">الإجمالي</TableCell>
                    <TableCell className="text-center text-xs font-black">{fmt(totals.totalCost)}</TableCell>
                    <TableCell />
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
