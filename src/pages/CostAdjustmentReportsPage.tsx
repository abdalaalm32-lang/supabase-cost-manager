import React, { useState, useMemo } from "react";
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
  Calculator, TrendingUp, TrendingDown, Activity, Package, Layers, CalendarIcon
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";

const COLORS = [
  "hsl(221, 83%, 53%)", "hsl(142, 76%, 36%)", "hsl(38, 92%, 50%)",
  "hsl(0, 84%, 60%)", "hsl(262, 83%, 58%)", "hsl(174, 72%, 40%)",
];

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n: number) => n.toLocaleString("en-US");

export const CostAdjustmentReportsPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;

  const [searchQuery, setSearchQuery] = useState("");
  const [locationType, setLocationType] = useState<"branch" | "warehouse">("branch");
  const [locationFilter, setLocationFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  const { data: costAdjustments = [] } = useQuery({
    queryKey: ["cost-adj-report", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cost_adjustments")
        .select("*")
        .eq("status", "مكتمل")
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: costAdjItems = [] } = useQuery({
    queryKey: ["cost-adj-items-report", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cost_adjustment_items")
        .select("*, cost_adjustments!inner(status, date, branch_id, branch_name, record_number, notes)");
      if (error) throw error;
      return (data || []).filter((d: any) => d.cost_adjustments?.status === "مكتمل");
    },
    enabled: !!companyId,
  });

  const { data: stockItems = [] } = useQuery({
    queryKey: ["stock-items-cadj-report", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_items")
        .select("*, inventory_categories:category_id(id, name)")
        .eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ["branches-cadj-report", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses-cadj-report", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["inv-categories-cadj-report", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_categories").select("id, name").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Build a flat list of adjustment rows with enrichment
  const processedData = useMemo(() => {
    const stockMap = new Map<string, any>();
    for (const si of stockItems) stockMap.set(si.id, si);

    let rows = costAdjItems.map((item: any) => {
      const adj = item.cost_adjustments;
      const si = item.stock_item_id ? stockMap.get(item.stock_item_id) : null;
      const catName = si?.inventory_categories?.name || "بدون مجموعة";
      const categoryId = si?.category_id || "";
      const oldCost = Number(item.old_cost || 0);
      const newCost = Number(item.new_cost || 0);
      const diff = newCost - oldCost;
      return {
        id: item.id,
        recordNumber: adj?.record_number || "—",
        date: adj?.date || "",
        itemName: item.name || si?.name || "—",
        code: si?.code || "",
        catName,
        categoryId,
        branchId: adj?.branch_id || "",
        branchName: adj?.branch_name || "—",
        oldCost,
        newCost,
        diff,
        diffPercent: oldCost > 0 ? ((diff / oldCost) * 100) : 0,
        notes: adj?.notes || "",
        unit: item.unit || si?.stock_unit || "",
      };
    });

    // Filters
    if (dateFrom) rows = rows.filter((r: any) => r.date >= format(dateFrom, "yyyy-MM-dd"));
    if (dateTo) rows = rows.filter((r: any) => r.date <= format(dateTo, "yyyy-MM-dd"));
    if (locationFilter !== "all") {
      if (locationType === "branch") rows = rows.filter((r: any) => r.branchId === locationFilter);
    }
    if (categoryFilter !== "all") rows = rows.filter((r: any) => r.categoryId === categoryFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      rows = rows.filter((r: any) =>
        r.itemName.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q) ||
        r.recordNumber.toLowerCase().includes(q) ||
        r.catName.toLowerCase().includes(q)
      );
    }

    return rows;
  }, [costAdjItems, stockItems, dateFrom, dateTo, locationFilter, locationType, categoryFilter, searchQuery]);

  // Stats
  const stats = useMemo(() => {
    const totalRecords = new Set(processedData.map((r: any) => r.recordNumber)).size;
    const totalItems = processedData.length;
    const increases = processedData.filter((r: any) => r.diff > 0);
    const decreases = processedData.filter((r: any) => r.diff < 0);
    const totalIncrease = increases.reduce((s: number, r: any) => s + r.diff, 0);
    const totalDecrease = Math.abs(decreases.reduce((s: number, r: any) => s + r.diff, 0));
    const netChange = processedData.reduce((s: number, r: any) => s + r.diff, 0);
    const avgChange = totalItems > 0 ? netChange / totalItems : 0;
    return { totalRecords, totalItems, totalIncrease, totalDecrease, netChange, avgChange, increaseCount: increases.length, decreaseCount: decreases.length };
  }, [processedData]);

  // Monthly trend
  const monthlyTrend = useMemo(() => {
    const map = new Map<string, { month: string; increase: number; decrease: number; count: number }>();
    for (const r of processedData) {
      const month = r.date.slice(0, 7);
      const existing = map.get(month);
      if (existing) {
        if (r.diff > 0) existing.increase += r.diff;
        else existing.decrease += Math.abs(r.diff);
        existing.count += 1;
      } else {
        map.set(month, {
          month,
          increase: r.diff > 0 ? r.diff : 0,
          decrease: r.diff < 0 ? Math.abs(r.diff) : 0,
          count: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [processedData]);

  // Top items by absolute diff
  const topItemsChart = useMemo(() => {
    const itemMap = new Map<string, { name: string; totalDiff: number }>();
    for (const r of processedData) {
      const ex = itemMap.get(r.itemName);
      if (ex) ex.totalDiff += Math.abs(r.diff);
      else itemMap.set(r.itemName, { name: r.itemName, totalDiff: Math.abs(r.diff) });
    }
    return Array.from(itemMap.values())
      .sort((a, b) => b.totalDiff - a.totalDiff)
      .slice(0, 8)
      .map(i => ({ name: i.name.length > 15 ? i.name.slice(0, 15) + "..." : i.name, value: i.totalDiff }));
  }, [processedData]);

  // Direction distribution
  const directionChart = useMemo(() => {
    return [
      { name: "زيادة", value: stats.increaseCount },
      { name: "تخفيض", value: stats.decreaseCount },
    ].filter(d => d.value > 0);
  }, [stats]);

  // Category distribution
  const categoryChart = useMemo(() => {
    const catMap = new Map<string, number>();
    for (const r of processedData) {
      catMap.set(r.catName, (catMap.get(r.catName) || 0) + Math.abs(r.diff));
    }
    return Array.from(catMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [processedData]);

  const exportCSV = () => {
    const headers = ["#", "رقم السجل", "التاريخ", "الصنف", "الكود", "الموقع", "المجموعة", "التكلفة السابقة", "التكلفة الجديدة", "فرق القيمة", "نسبة التغيير %", "البيان"];
    const rows = processedData.map((r: any, i: number) => [
      i + 1, r.recordNumber, r.date, r.itemName, r.code, r.branchName, r.catName,
      r.oldCost.toFixed(2), r.newCost.toFixed(2), r.diff.toFixed(2), r.diffPercent.toFixed(1), r.notes,
    ]);
    const bom = "\uFEFF";
    const csv = bom + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `تقارير_تعديل_التكاليف_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 print:space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
            <Calculator className="text-primary" size={28} />
            تقارير تعديل التكاليف
          </h1>
          <p className="text-muted-foreground text-sm mt-1">تحليل عمليات تعديل التكلفة واتجاهات التغيير</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <FileSpreadsheet size={16} className="ml-1" /> تصدير Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <FileText size={16} className="ml-1" /> طباعة PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="print:hidden">
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <Input placeholder="بحث بالاسم أو الكود أو رقم السجل..." value={searchQuery}
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
                <Activity className="text-primary" size={20} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">سجلات التعديل</p>
                <p className="text-xl font-black text-foreground">{fmtInt(stats.totalRecords)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
                <Package className="text-primary" size={20} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">أصناف معدّلة</p>
                <p className="text-xl font-black text-foreground">{fmtInt(stats.totalItems)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center">
                <TrendingUp className="text-green-600" size={20} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">إجمالي الزيادة ({stats.increaseCount})</p>
                <p className="text-xl font-black text-green-600">+{fmt(stats.totalIncrease)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-destructive/15 flex items-center justify-center">
                <TrendingDown className="text-destructive" size={20} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">إجمالي التخفيض ({stats.decreaseCount})</p>
                <p className="text-xl font-black text-destructive">-{fmt(stats.totalDecrease)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 print:grid-cols-2">
        {/* Monthly trend */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <CalendarIcon size={16} className="text-primary" /> اتجاه التعديلات الشهرية
            </h3>
            {monthlyTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyTrend} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} tickMargin={10} />
                  <YAxis fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} tickMargin={10} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="increase" name="زيادة" fill="hsl(142, 76%, 36%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="decrease" name="تخفيض" fill="hsl(0, 84%, 60%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">لا توجد بيانات</div>
            )}
          </CardContent>
        </Card>

        {/* Top items */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <Package size={16} className="text-primary" /> أكثر الأصناف تعديلاً
            </h3>
            {topItemsChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topItemsChart} layout="vertical" margin={{ top: 20, right: 20, bottom: 20, left: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} tickMargin={10} />
                  <YAxis dataKey="name" type="category" fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} width={55} tickMargin={10} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="value" name="إجمالي التغيير" fill="hsl(221, 83%, 53%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">لا توجد بيانات</div>
            )}
          </CardContent>
        </Card>

        {/* Direction pie */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <Layers size={16} className="text-primary" /> اتجاه التعديلات
            </h3>
            {directionChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <Pie data={directionChart} cx="50%" cy="50%" outerRadius={65} dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {directionChart.map((_: any, i: number) => (
                      <Cell key={i} fill={i === 0 ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)"} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">لا توجد بيانات</div>
            )}
          </CardContent>
        </Card>

        {/* Category distribution */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <Layers size={16} className="text-primary" /> توزيع التعديلات حسب المجموعة
            </h3>
            {categoryChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <Pie data={categoryChart} cx="50%" cy="50%" outerRadius={65} dataKey="value"
                    label={({ name, percent }) => `${name.length > 10 ? name.slice(0, 10) + ".." : name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {categoryChart.map((_: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">لا توجد بيانات</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-right w-10">#</TableHead>
                  <TableHead className="text-right">رقم السجل</TableHead>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">الصنف</TableHead>
                  <TableHead className="text-right">الكود</TableHead>
                  <TableHead className="text-right">الموقع</TableHead>
                  <TableHead className="text-right">المجموعة</TableHead>
                  <TableHead className="text-right">التكلفة السابقة</TableHead>
                  <TableHead className="text-right">التكلفة الجديدة</TableHead>
                  <TableHead className="text-right">فرق القيمة</TableHead>
                  <TableHead className="text-right">نسبة التغيير</TableHead>
                  <TableHead className="text-right">البيان</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {processedData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-muted-foreground py-12">
                      لا توجد بيانات تعديل تكاليف مكتملة
                    </TableCell>
                  </TableRow>
                ) : (
                  processedData.map((row: any, idx: number) => (
                    <TableRow key={row.id} className={cn(
                      row.diff > 0 && "bg-green-500/5",
                      row.diff < 0 && "bg-destructive/5",
                    )}>
                      <TableCell className="font-mono text-muted-foreground text-xs">{idx + 1}</TableCell>
                      <TableCell className="font-mono text-xs">{row.recordNumber}</TableCell>
                      <TableCell className="text-xs">{row.date}</TableCell>
                      <TableCell className="font-medium text-sm">{row.itemName}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{row.code}</TableCell>
                      <TableCell className="text-xs">{row.branchName}</TableCell>
                      <TableCell className="text-xs">{row.catName}</TableCell>
                      <TableCell className="font-mono text-xs">{fmt(row.oldCost)}</TableCell>
                      <TableCell className="font-mono text-xs">{fmt(row.newCost)}</TableCell>
                      <TableCell className={cn("font-bold font-mono text-sm",
                        row.diff > 0 && "text-green-600",
                        row.diff < 0 && "text-destructive",
                      )}>
                        {row.diff > 0 ? "+" : ""}{fmt(row.diff)}
                      </TableCell>
                      <TableCell className={cn("font-mono text-xs",
                        row.diff > 0 && "text-green-600",
                        row.diff < 0 && "text-destructive",
                      )}>
                        {row.diffPercent > 0 ? "+" : ""}{row.diffPercent.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">{row.notes || "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {processedData.length > 0 && (
                <TableFooter>
                  <TableRow className="bg-muted/40 font-bold">
                    <TableCell colSpan={7} className="text-right">الإجمالي</TableCell>
                    <TableCell className="font-mono text-xs">{fmt(processedData.reduce((s: number, r: any) => s + r.oldCost, 0))}</TableCell>
                    <TableCell className="font-mono text-xs">{fmt(processedData.reduce((s: number, r: any) => s + r.newCost, 0))}</TableCell>
                    <TableCell className={cn("font-mono font-bold",
                      stats.netChange > 0 && "text-green-600",
                      stats.netChange < 0 && "text-destructive",
                    )}>
                      {stats.netChange > 0 ? "+" : ""}{fmt(stats.netChange)}
                    </TableCell>
                    <TableCell colSpan={2}></TableCell>
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
