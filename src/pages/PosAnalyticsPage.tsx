import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { format, subDays, startOfDay, endOfDay, differenceInDays } from "date-fns";
import {
  CalendarIcon, TrendingUp, TrendingDown, FileText, DollarSign, Store,
  ShoppingCart, Clock, Award, BarChart3, PieChart, Activity, Percent, Receipt, Users
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart as RPieChart, Pie, Cell, AreaChart, Area, Legend
} from "recharts";

const COLORS = [
  "hsl(199, 89%, 48%)", "hsl(260, 50%, 55%)", "hsl(174, 72%, 42%)",
  "hsl(38, 92%, 50%)", "hsl(0, 70%, 55%)", "hsl(145, 65%, 38%)",
  "hsl(280, 60%, 50%)", "hsl(20, 80%, 55%)", "hsl(210, 70%, 60%)", "hsl(330, 60%, 50%)"
];

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const PosAnalyticsPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const queryClient = useQueryClient();

  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(() => subDays(new Date(), 30));
  const [dateTo, setDateTo] = useState<Date | undefined>(new Date());

  useEffect(() => {
    const channel = supabase
      .channel("analytics-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "pos_sales" }, () => {
        queryClient.invalidateQueries({ queryKey: ["analytics-sales"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "pos_sale_items" }, () => {
        queryClient.invalidateQueries({ queryKey: ["analytics-sale-items"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data: branches } = useQuery({
    queryKey: ["branches", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("branches").select("*").eq("company_id", companyId!).eq("active", true);
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: sales } = useQuery({
    queryKey: ["analytics-sales", companyId, branchFilter, dateFrom?.toISOString(), dateTo?.toISOString()],
    queryFn: async () => {
      let query = supabase.from("pos_sales").select("*, branches:branch_id(name)").eq("company_id", companyId!).eq("status", "مكتمل");
      if (branchFilter !== "all") query = query.eq("branch_id", branchFilter);
      if (dateFrom) query = query.gte("date", startOfDay(dateFrom).toISOString());
      if (dateTo) query = query.lte("date", endOfDay(dateTo).toISOString());
      query = query.order("date", { ascending: true });
      const { data } = await query;
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: saleItems } = useQuery({
    queryKey: ["analytics-sale-items", companyId, branchFilter, dateFrom?.toISOString(), dateTo?.toISOString()],
    queryFn: async () => {
      const saleIds = (sales || []).map(s => s.id);
      if (saleIds.length === 0) return [];
      // Fetch in batches of 200
      const all: any[] = [];
      for (let i = 0; i < saleIds.length; i += 200) {
        const batch = saleIds.slice(i, i + 200);
        const { data } = await supabase.from("pos_sale_items").select("*, pos_items:pos_item_id(name, category, price, categories:category_id(name))").in("sale_id", batch);
        if (data) all.push(...data);
      }
      return all;
    },
    enabled: !!companyId && (sales || []).length > 0,
  });

  // ── KPIs ──
  const stats = useMemo(() => {
    const s = sales || [];
    const totalSales = s.reduce((acc, r) => acc + Number(r.total_amount), 0);
    const totalTax = s.reduce((acc, r) => acc + Number(r.tax_amount || 0), 0);
    const invoiceCount = s.length;
    const avgInvoice = invoiceCount > 0 ? totalSales / invoiceCount : 0;
    const days = dateFrom && dateTo ? Math.max(differenceInDays(dateTo, dateFrom), 1) : 1;
    const dailyAvg = totalSales / days;
    const maxSale = s.length > 0 ? Math.max(...s.map(r => Number(r.total_amount))) : 0;
    const minSale = s.length > 0 ? Math.min(...s.map(r => Number(r.total_amount))) : 0;
    const totalItems = (saleItems || []).reduce((acc, i) => acc + Number(i.quantity), 0);
    const avgItemsPerInvoice = invoiceCount > 0 ? totalItems / invoiceCount : 0;
    return { totalSales, totalTax, invoiceCount, avgInvoice, dailyAvg, maxSale, minSale, totalItems, avgItemsPerInvoice };
  }, [sales, saleItems, dateFrom, dateTo]);

  // ── Daily trend ──
  const dailyTrend = useMemo(() => {
    const map: Record<string, { date: string; sales: number; count: number; tax: number }> = {};
    (sales || []).forEach(r => {
      const d = String(r.date).slice(0, 10);
      if (!map[d]) map[d] = { date: d, sales: 0, count: 0, tax: 0 };
      map[d].sales += Number(r.total_amount);
      map[d].count += 1;
      map[d].tax += Number(r.tax_amount || 0);
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [sales]);

  // ── Hourly distribution ──
  const hourlyDist = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: `${i}:00`, sales: 0, count: 0 }));
    (sales || []).forEach(r => {
      const h = new Date(r.date).getHours();
      hours[h].sales += Number(r.total_amount);
      hours[h].count += 1;
    });
    return hours.filter(h => h.count > 0);
  }, [sales]);

  // ── Top items ──
  const topItems = useMemo(() => {
    const map: Record<string, { name: string; qty: number; total: number }> = {};
    (saleItems || []).forEach(i => {
      const name = i.pos_items?.name || "غير محدد";
      if (!map[name]) map[name] = { name, qty: 0, total: 0 };
      map[name].qty += Number(i.quantity);
      map[name].total += Number(i.total);
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [saleItems]);

  // ── Category breakdown ──
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, { name: string; qty: number; total: number }> = {};
    (saleItems || []).forEach(i => {
      const name = i.pos_items?.categories?.name || i.pos_items?.category || "بدون تصنيف";
      if (!map[name]) map[name] = { name, qty: 0, total: 0 };
      map[name].qty += Number(i.quantity);
      map[name].total += Number(i.total);
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [saleItems]);

  // ── Branch comparison ──
  const branchComparison = useMemo(() => {
    if (branchFilter !== "all") return [];
    const map: Record<string, { name: string; total: number; count: number }> = {};
    (sales || []).forEach(r => {
      const name = (r.branches as any)?.name || "غير محدد";
      if (!map[name]) map[name] = { name, total: 0, count: 0 };
      map[name].total += Number(r.total_amount);
      map[name].count += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [sales, branchFilter]);

  // ── Day of week analysis ──
  const dayOfWeekData = useMemo(() => {
    const days = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    const map = days.map(d => ({ day: d, sales: 0, count: 0 }));
    (sales || []).forEach(r => {
      const dow = new Date(r.date).getDay();
      map[dow].sales += Number(r.total_amount);
      map[dow].count += 1;
    });
    return map;
  }, [sales]);

  const tooltipStyle = { contentStyle: { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12, color: "#000" } };

  const kpiCards = [
    { label: "إجمالي المبيعات", value: fmt(stats.totalSales), suffix: "EGP", icon: TrendingUp, color: "bg-primary/10 text-primary" },
    { label: "عدد الفواتير", value: stats.invoiceCount.toString(), icon: FileText, color: "bg-accent/10 text-accent" },
    { label: "متوسط الفاتورة", value: fmt(stats.avgInvoice), suffix: "EGP", icon: DollarSign, color: "bg-secondary/10 text-secondary" },
    { label: "متوسط يومي", value: fmt(stats.dailyAvg), suffix: "EGP", icon: Activity, color: "bg-warning/10 text-warning" },
    { label: "إجمالي الأصناف المباعة", value: stats.totalItems.toString(), icon: ShoppingCart, color: "bg-success/10 text-success" },
    { label: "متوسط أصناف/فاتورة", value: stats.avgItemsPerInvoice.toFixed(1), icon: Receipt, color: "bg-primary/10 text-primary" },
    { label: "أعلى فاتورة", value: fmt(stats.maxSale), suffix: "EGP", icon: TrendingUp, color: "bg-success/10 text-success" },
    { label: "إجمالي الضريبة", value: fmt(stats.totalTax), suffix: "EGP", icon: Percent, color: "bg-destructive/10 text-destructive" },
  ];

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-black text-foreground">ذكاء المبيعات</h1>

      {/* Filters */}
      <div className="glass-card rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[180px]">
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="glass-input h-9 text-sm">
                <Store className="h-4 w-4 ml-1 text-muted-foreground" />
                <SelectValue placeholder="كل الفروع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الفروع</SelectItem>
                {branches?.map((b) => (<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("glass-input h-9 text-sm min-w-[160px] justify-start", !dateFrom && "text-muted-foreground")}>
                <CalendarIcon className="h-4 w-4 ml-1" />
                {dateFrom ? format(dateFrom, "yyyy/MM/dd") : "من تاريخ"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("glass-input h-9 text-sm min-w-[160px] justify-start", !dateTo && "text-muted-foreground")}>
                <CalendarIcon className="h-4 w-4 ml-1" />
                {dateTo ? format(dateTo, "yyyy/MM/dd") : "إلى تاريخ"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>

          {(dateFrom || dateTo || branchFilter !== "all") && (
            <Button variant="ghost" size="sm" onClick={() => { setBranchFilter("all"); setDateFrom(subDays(new Date(), 30)); setDateTo(new Date()); }}>
              مسح الفلاتر
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpiCards.map((kpi, idx) => (
          <Card key={idx} className="glass-card border-border/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", kpi.color)}>
                <kpi.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground truncate">{kpi.label}</p>
                <p className="text-lg font-black text-foreground leading-tight">
                  {kpi.value}
                  {kpi.suffix && <span className="text-[10px] font-normal text-muted-foreground mr-1">{kpi.suffix}</span>}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row 1: Daily Trend + Category Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="glass-card border-border/50 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              اتجاه المبيعات اليومي
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip {...tooltipStyle} formatter={(v: number) => [fmt(v), ""]} labelFormatter={l => `التاريخ: ${l}`} />
                  <defs>
                    <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(199, 89%, 48%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(199, 89%, 48%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="sales" stroke="hsl(199, 89%, 48%)" fill="url(#salesGrad)" strokeWidth={2} name="المبيعات" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <PieChart className="h-4 w-4 text-secondary" />
              توزيع المبيعات حسب التصنيف
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              {categoryBreakdown.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <RPieChart>
                    <Pie data={categoryBreakdown} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 10 }}>
                      {categoryBreakdown.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
                    </Pie>
                    <Tooltip {...tooltipStyle} formatter={(v: number) => [fmt(v) + " EGP", ""]} />
                  </RPieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">لا توجد بيانات</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2: Hourly + Day of Week */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="glass-card border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Clock className="h-4 w-4 text-accent" />
              توزيع المبيعات حسب الساعة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyDist}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip {...tooltipStyle} formatter={(v: number) => [fmt(v), ""]} />
                  <Bar dataKey="sales" fill="hsl(174, 72%, 42%)" radius={[4, 4, 0, 0]} name="المبيعات" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-warning" />
              أداء أيام الأسبوع
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dayOfWeekData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis dataKey="day" type="category" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={60} />
                  <Tooltip {...tooltipStyle} formatter={(v: number) => [fmt(v), ""]} />
                  <Bar dataKey="sales" fill="hsl(38, 92%, 50%)" radius={[0, 4, 4, 0]} name="المبيعات" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 3: Invoices count trend + Branch comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="glass-card border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              اتجاه عدد الفواتير اليومي
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                  <Tooltip {...tooltipStyle} />
                  <Line type="monotone" dataKey="count" stroke="hsl(260, 50%, 55%)" strokeWidth={2} dot={{ r: 3 }} name="عدد الفواتير" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {branchFilter === "all" && branchComparison.length > 0 && (
          <Card className="glass-card border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Store className="h-4 w-4 text-secondary" />
                مقارنة الفروع
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={branchComparison}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip {...tooltipStyle} formatter={(v: number) => [fmt(v), ""]} />
                    <Bar dataKey="total" fill="hsl(260, 50%, 55%)" radius={[4, 4, 0, 0]} name="المبيعات" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Tables Row: Top Items + Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Selling Items */}
        <Card className="glass-card border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Award className="h-4 w-4 text-warning" />
              أعلى 10 أصناف مبيعاً
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[350px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right text-xs">#</TableHead>
                    <TableHead className="text-right text-xs">الصنف</TableHead>
                    <TableHead className="text-center text-xs">الكمية</TableHead>
                    <TableHead className="text-center text-xs">الإجمالي</TableHead>
                    <TableHead className="text-center text-xs">النسبة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topItems.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-xs font-bold">{idx + 1}</TableCell>
                      <TableCell className="text-xs font-medium">{item.name}</TableCell>
                      <TableCell className="text-center text-xs">{item.qty}</TableCell>
                      <TableCell className="text-center text-xs">{fmt(item.total)}</TableCell>
                      <TableCell className="text-center text-xs">
                        {stats.totalSales > 0 ? ((item.total / stats.totalSales) * 100).toFixed(1) + "%" : "0%"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {topItems.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-8">لا توجد بيانات</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Category Breakdown Table */}
        <Card className="glass-card border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <PieChart className="h-4 w-4 text-accent" />
              تحليل التصنيفات
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[350px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right text-xs">التصنيف</TableHead>
                    <TableHead className="text-center text-xs">عدد الأصناف</TableHead>
                    <TableHead className="text-center text-xs">الإجمالي</TableHead>
                    <TableHead className="text-center text-xs">النسبة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categoryBreakdown.map((cat, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-xs font-medium">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                          {cat.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-xs">{cat.qty}</TableCell>
                      <TableCell className="text-center text-xs">{fmt(cat.total)}</TableCell>
                      <TableCell className="text-center text-xs">
                        {stats.totalSales > 0 ? ((cat.total / stats.totalSales) * 100).toFixed(1) + "%" : "0%"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {categoryBreakdown.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-8">لا توجد بيانات</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
