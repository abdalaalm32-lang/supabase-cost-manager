/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useMemo } from "react";
import { ExportButtons } from "@/components/ExportButtons";
import { PrintButton } from "@/components/PrintButton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Search, Store, Warehouse, FileSpreadsheet, FileText,
  ArrowRightLeft, Package, Activity, TrendingUp, Layers, CalendarIcon, ArrowRight
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";

const COLORS = [
  "hsl(221, 83%, 53%)", "hsl(142, 76%, 36%)", "hsl(38, 92%, 50%)",
  "hsl(262, 83%, 58%)", "hsl(0, 84%, 60%)", "hsl(174, 72%, 40%)",
];

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n: number) => n.toLocaleString("en-US");

export const TransferReportsPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;

  const [searchQuery, setSearchQuery] = useState("");
  const [locationType, setLocationType] = useState<"branch" | "warehouse">("branch");
  const [locationFilter, setLocationFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  const { data: transfers = [], isLoading } = useQuery({
    queryKey: ["transfers-report", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfers")
        .select("*")
        .eq("status", "مكتمل")
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: transferItems = [] } = useQuery({
    queryKey: ["transfer-items-report", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfer_items")
        .select("*, transfers!inner(status, date, source_id, source_name, destination_id, destination_name)")
        .eq("transfers.status", "مكتمل");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: stockItems = [] } = useQuery({
    queryKey: ["stock-items-transfer-report", companyId],
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
    queryKey: ["branches-transfer-report", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses-transfer-report", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["inv-categories-transfer-report", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_categories").select("id, name").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const processedData = useMemo(() => {
    const stockMap = new Map<string, any>();
    for (const si of stockItems) stockMap.set(si.id, si);

    const filteredItems = transferItems.filter((ti: any) => {
      const rec = ti.transfers;
      if (!rec) return false;
      if (dateFrom && rec.date < format(dateFrom, "yyyy-MM-dd")) return false;
      if (dateTo && rec.date > format(dateTo, "yyyy-MM-dd")) return false;
      if (locationFilter !== "all") {
        if (locationType === "branch" && rec.source_id !== locationFilter && rec.destination_id !== locationFilter) return false;
        if (locationType === "warehouse") return false; // transfers are branch-based
      }
      return true;
    });

    // Aggregate by stock_item_id
    const itemMap = new Map<string, {
      stockItemId: string;
      name: string;
      code: string;
      catName: string;
      categoryId: string;
      totalTransferQty: number;
      totalCost: number;
      occurrences: number;
      unit: string;
      lastTransferDate: string;
      routes: Map<string, number>;
    }>();

    for (const ti of filteredItems) {
      const sid = ti.stock_item_id;
      if (!sid) continue;
      const si = stockMap.get(sid);
      const rec = ti.transfers;
      const qty = Number(ti.quantity || 0);
      const cost = Number(ti.total_cost || 0);
      const routeKey = `${rec?.source_name || "—"}→${rec?.destination_name || "—"}`;

      const existing = itemMap.get(sid);
      if (existing) {
        existing.totalTransferQty += qty;
        existing.totalCost += cost;
        existing.occurrences += 1;
        existing.routes.set(routeKey, (existing.routes.get(routeKey) || 0) + 1);
        if (rec?.date > existing.lastTransferDate) existing.lastTransferDate = rec.date;
      } else {
        const catName = si ? ((si as any).inventory_categories?.name || "بدون مجموعة") : "غير معروف";
        const routes = new Map<string, number>();
        routes.set(routeKey, 1);
        itemMap.set(sid, {
          stockItemId: sid,
          name: ti.name || si?.name || "—",
          code: ti.code || si?.code || "",
          catName,
          categoryId: si?.category_id || "",
          totalTransferQty: qty,
          totalCost: cost,
          occurrences: 1,
          unit: ti.unit || si?.stock_unit || "",
          lastTransferDate: rec?.date || "",
          routes,
        });
      }
    }

    let result = Array.from(itemMap.values()).sort((a, b) => b.totalCost - a.totalCost);

    if (categoryFilter !== "all") {
      result = result.filter(i => i.categoryId === categoryFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(i =>
        i.name.toLowerCase().includes(q) ||
        i.code.toLowerCase().includes(q) ||
        i.catName.toLowerCase().includes(q)
      );
    }

    return result;
  }, [transferItems, stockItems, dateFrom, dateTo, locationFilter, locationType, categoryFilter, searchQuery]);

  // Stats
  const stats = useMemo(() => {
    let filtered = [...transfers];
    if (dateFrom) filtered = filtered.filter(r => r.date >= format(dateFrom, "yyyy-MM-dd"));
    if (dateTo) filtered = filtered.filter(r => r.date <= format(dateTo, "yyyy-MM-dd"));
    if (locationFilter !== "all" && locationType === "branch") {
      filtered = filtered.filter(r => r.source_id === locationFilter || r.destination_id === locationFilter);
    }

    const totalRecords = filtered.length;
    const totalCost = filtered.reduce((s, r) => s + Number(r.total_cost), 0);
    const uniqueItems = processedData.length;
    const totalQty = processedData.reduce((s, i) => s + i.totalTransferQty, 0);
    const avgCostPerTransfer = totalRecords > 0 ? totalCost / totalRecords : 0;

    return { totalRecords, totalCost, uniqueItems, totalQty, avgCostPerTransfer };
  }, [transfers, processedData, dateFrom, dateTo, locationFilter, locationType]);

  // Monthly trend
  const monthlyTrend = useMemo(() => {
    let filtered = [...transfers];
    if (dateFrom) filtered = filtered.filter(r => r.date >= format(dateFrom, "yyyy-MM-dd"));
    if (dateTo) filtered = filtered.filter(r => r.date <= format(dateTo, "yyyy-MM-dd"));
    if (locationFilter !== "all" && locationType === "branch") {
      filtered = filtered.filter(r => r.source_id === locationFilter || r.destination_id === locationFilter);
    }

    const map = new Map<string, { month: string; cost: number; count: number }>();
    for (const r of filtered) {
      const month = r.date.slice(0, 7);
      const existing = map.get(month);
      if (existing) {
        existing.cost += Number(r.total_cost);
        existing.count += 1;
      } else {
        map.set(month, { month, cost: Number(r.total_cost), count: 1 });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [transfers, dateFrom, dateTo, locationFilter, locationType]);

  // Top transferred items
  const topTransferredChart = useMemo(() => {
    return processedData.slice(0, 8).map(i => ({
      name: i.name.length > 15 ? i.name.slice(0, 15) + "..." : i.name,
      cost: i.totalCost,
      count: i.occurrences,
    }));
  }, [processedData]);

  // Route distribution
  const routeDistChart = useMemo(() => {
    const routeMap = new Map<string, number>();
    for (const i of processedData) {
      for (const [route, count] of i.routes.entries()) {
        routeMap.set(route, (routeMap.get(route) || 0) + count);
      }
    }
    return Array.from(routeMap.entries())
      .map(([name, value]) => ({ name: name.replace("→", " ← "), value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [processedData]);

  // Category distribution
  const categoryDistChart = useMemo(() => {
    const catMap = new Map<string, number>();
    for (const i of processedData) {
      catMap.set(i.catName, (catMap.get(i.catName) || 0) + i.totalCost);
    }
    return Array.from(catMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [processedData]);

  const getTopRoute = (routes: Map<string, number>): { source: string; destination: string } => {
    let maxRoute = "—→—";
    let maxCount = 0;
    for (const [route, count] of routes.entries()) {
      if (count > maxCount) { maxCount = count; maxRoute = route; }
    }
    const parts = maxRoute.split("→");
    return { source: parts[0] || "—", destination: parts[1] || "—" };
  };

  const exportCSV = () => {
    const headers = ["#", "الكود", "اسم الصنف", "المجموعة", "من", "إلى", "إجمالي الكمية", "الوحدة", "إجمالي التكلفة", "مرات التحويل", "آخر تحويل"];
    const rows = processedData.map((i, idx) => {
      const r = getTopRoute(i.routes);
      return [idx + 1, i.code, i.name, i.catName, r.source, r.destination, i.totalTransferQty.toFixed(2), i.unit, i.totalCost.toFixed(2), i.occurrences, i.lastTransferDate];
    });
    const bom = "\uFEFF";
    const csv = bom + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `تقارير_التحويلات_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 print:space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
            <ArrowRightLeft className="text-primary" size={28} />
            تقارير أذونات الصرف والتحويل
          </h1>
          <p className="text-muted-foreground text-sm mt-1">تحليل حركة التحويلات بين الفروع والمخازن</p>
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
                <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="p-3 pointer-events-auto" />
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
                <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="p-3 pointer-events-auto" />
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
                <p className="text-xs text-muted-foreground">عمليات التحويل</p>
                <p className="text-xl font-black text-foreground">{fmtInt(stats.totalRecords)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
                <TrendingUp className="text-primary" size={20} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">إجمالي تكلفة التحويلات</p>
                <p className="text-xl font-black text-primary">{fmt(stats.totalCost)}</p>
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
                <p className="text-xs text-muted-foreground">أصناف محوّلة</p>
                <p className="text-xl font-black text-foreground">{fmtInt(stats.uniqueItems)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                <Layers className="text-emerald-600" size={20} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">إجمالي الكميات المحوّلة</p>
                <p className="text-xl font-black text-foreground">{fmt(stats.totalQty)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center">
                <CalendarIcon className="text-violet-600" size={20} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">متوسط تكلفة العملية</p>
                <p className="text-xl font-black text-foreground">{fmt(stats.avgCostPerTransfer)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 print:grid-cols-2">
        {/* Monthly Trend */}
        <Card>
          <CardContent className="pt-4 pb-2">
            <h3 className="text-sm font-bold mb-3 flex items-center gap-1"><TrendingUp size={16} /> الاتجاه الشهري للتحويلات</h3>
            <div className="h-56">
              {monthlyTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyTrend} margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} tickMargin={10} />
                    <YAxis tick={{ fontSize: 11 }} tickMargin={10} />
                    <Tooltip formatter={(v: any) => fmt(v)} />
                    <Line type="monotone" dataKey="cost" stroke="hsl(221, 83%, 53%)" strokeWidth={2} name="التكلفة" dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="count" stroke="hsl(142, 76%, 36%)" strokeWidth={2} name="عدد العمليات" dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <p className="text-center text-muted-foreground text-sm mt-16">لا توجد بيانات</p>}
            </div>
          </CardContent>
        </Card>

        {/* Top Transferred Items */}
        <Card>
          <CardContent className="pt-4 pb-2">
            <h3 className="text-sm font-bold mb-3 flex items-center gap-1"><ArrowRightLeft size={16} /> أكثر الأصناف تحويلاً</h3>
            <div className="h-56">
              {topTransferredChart.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topTransferredChart} layout="vertical" margin={{ top: 20, right: 60, bottom: 20, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickMargin={10} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={55} tickMargin={10} />
                    <Tooltip formatter={(v: any) => fmt(v)} />
                    <Bar dataKey="cost" fill="hsl(221, 83%, 53%)" radius={[0, 4, 4, 0]} name="التكلفة" />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-center text-muted-foreground text-sm mt-16">لا توجد بيانات</p>}
            </div>
          </CardContent>
        </Card>

        {/* Route Distribution */}
        <Card>
          <CardContent className="pt-4 pb-2">
            <h3 className="text-sm font-bold mb-3 flex items-center gap-1"><Store size={16} /> توزيع المسارات</h3>
            <div className="h-56">
              {routeDistChart.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <Pie 
                      data={routeDistChart} 
                      cx="50%" 
                      cy="50%" 
                      outerRadius={70} 
                      dataKey="value" 
                      labelLine={true}
                      label={({ cx, cy, midAngle, outerRadius, percent, name }) => {
                        const RADIAN = Math.PI / 180;
                        const radius = outerRadius + 120;
                        const x = cx + radius * Math.cos(-midAngle * RADIAN);
                        const y = cy + radius * Math.sin(-midAngle * RADIAN);
                        return (
                          <text 
                            x={x} 
                            y={y} 
                            fill="hsl(var(--foreground))" 
                            textAnchor={x > cx ? "start" : "end"} 
                            dominantBaseline="central"
                            className="text-[10px] font-medium"
                          >
                            {name} {(percent * 100).toFixed(0)}%
                          </text>
                        );
                      }}
                    >
                      {routeDistChart.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="text-center text-muted-foreground text-sm mt-16">لا توجد بيانات</p>}
            </div>
          </CardContent>
        </Card>

        {/* Category Distribution */}
        <Card>
          <CardContent className="pt-4 pb-2">
            <h3 className="text-sm font-bold mb-3 flex items-center gap-1"><Layers size={16} /> توزيع التكلفة حسب المجموعة</h3>
            <div className="h-56">
              {categoryDistChart.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <Pie 
                      data={categoryDistChart} 
                      cx="50%" 
                      cy="50%" 
                      outerRadius={70} 
                      dataKey="value" 
                      labelLine={true}
                      label={({ cx, cy, midAngle, outerRadius, percent, name }) => {
                        const RADIAN = Math.PI / 180;
                        const radius = outerRadius + 80;
                        const x = cx + radius * Math.cos(-midAngle * RADIAN);
                        const y = cy + radius * Math.sin(-midAngle * RADIAN);
                        return (
                          <text 
                            x={x} 
                            y={y} 
                            fill="hsl(var(--foreground))" 
                            textAnchor={x > cx ? "start" : "end"} 
                            dominantBaseline="central"
                            className="text-[10px] font-medium"
                          >
                            {name} {(percent * 100).toFixed(0)}%
                          </text>
                        );
                      }}
                    >
                      {categoryDistChart.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="text-center text-muted-foreground text-sm mt-16">لا توجد بيانات</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="pt-4 pb-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold flex items-center gap-1"><ArrowRightLeft size={16} /> تفاصيل الأصناف المحوّلة</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{fmtInt(processedData.length)} صنف</span>
              <ExportButtons
                data={processedData.map((item: any) => ({ code: item.code, name: item.name, category: item.catName, qty: fmt(item.totalTransferQty), unit: item.unit, cost: fmt(item.totalCost), occurrences: item.occurrences, lastDate: item.lastTransferDate }))}
                columns={[{ key: "code", label: "الكود" }, { key: "name", label: "الصنف" }, { key: "category", label: "المجموعة" }, { key: "qty", label: "إجمالي الكمية" }, { key: "unit", label: "الوحدة" }, { key: "cost", label: "إجمالي التكلفة" }, { key: "occurrences", label: "مرات التحويل" }, { key: "lastDate", label: "آخر تحويل" }]}
                filename="تقارير_التحويلات"
                title="تقارير التحويلات"
              />
              <PrintButton
                data={processedData.map((item: any) => ({ code: item.code, name: item.name, category: item.catName, qty: fmt(item.totalTransferQty), unit: item.unit, cost: fmt(item.totalCost), occurrences: item.occurrences, lastDate: item.lastTransferDate }))}
                columns={[{ key: "code", label: "الكود" }, { key: "name", label: "الصنف" }, { key: "category", label: "المجموعة" }, { key: "qty", label: "إجمالي الكمية" }, { key: "unit", label: "الوحدة" }, { key: "cost", label: "إجمالي التكلفة" }, { key: "occurrences", label: "مرات التحويل" }, { key: "lastDate", label: "آخر تحويل" }]}
                title="تقارير التحويلات"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right w-10">#</TableHead>
                  <TableHead className="text-right">الكود</TableHead>
                  <TableHead className="text-right">اسم الصنف</TableHead>
                  <TableHead className="text-right">المجموعة</TableHead>
                  <TableHead className="text-center">حركة العملية</TableHead>
                  <TableHead className="text-center">إجمالي الكمية</TableHead>
                  <TableHead className="text-center">الوحدة</TableHead>
                  <TableHead className="text-center">إجمالي التكلفة</TableHead>
                  <TableHead className="text-center">مرات التحويل</TableHead>
                  <TableHead className="text-center">آخر تحويل</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-10 text-muted-foreground">جاري التحميل...</TableCell></TableRow>
                ) : processedData.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-10 text-muted-foreground">لا توجد بيانات</TableCell></TableRow>
                ) : (
                  processedData.map((item, idx) => {
                    const route = getTopRoute(item.routes);
                    return (
                      <TableRow key={item.stockItemId} className={cn(item.occurrences >= 5 && "bg-primary/5")}>
                        <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                        <TableCell className="font-mono text-xs">{item.code}</TableCell>
                        <TableCell className="font-medium text-sm">
                          <div className="flex items-center gap-1">
                            {item.occurrences >= 5 && <ArrowRightLeft size={14} className="text-primary" />}
                            {item.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{item.catName}</TableCell>
                        <TableCell className="text-center">
                          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/60 bg-muted/30 text-xs font-medium">
                            <span className="text-foreground">{route.source}</span>
                            <ArrowRight size={14} className="text-primary shrink-0" />
                            <span className="text-foreground">{route.destination}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-semibold">{fmt(item.totalTransferQty)}</TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground">{item.unit}</TableCell>
                        <TableCell className="text-center font-bold text-primary">{fmt(item.totalCost)}</TableCell>
                        <TableCell className="text-center">
                          <span className={cn(
                            "inline-block min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold",
                            item.occurrences >= 5 ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                          )}>
                            {item.occurrences}
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground">{item.lastTransferDate}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
              {processedData.length > 0 && (
                <TableFooter>
                  <TableRow className="bg-muted/40 font-bold">
                    <TableCell colSpan={5} className="text-right">الإجمالي</TableCell>
                    <TableCell className="text-center">{fmt(processedData.reduce((s, i) => s + i.totalTransferQty, 0))}</TableCell>
                    <TableCell />
                    <TableCell className="text-center text-primary">{fmt(processedData.reduce((s, i) => s + i.totalCost, 0))}</TableCell>
                    <TableCell className="text-center">{fmtInt(processedData.reduce((s, i) => s + i.occurrences, 0))}</TableCell>
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
