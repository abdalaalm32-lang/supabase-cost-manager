import React, { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Search,
  Store,
  Warehouse,
  Trash2,
  FileSpreadsheet,
  FileText,
  BarChart3,
  Layers,
  TrendingDown,
  Package,
  CalendarIcon,
  AlertTriangle,
  Activity,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";

const COLORS = [
  "hsl(0, 84%, 60%)",
  "hsl(38, 92%, 50%)",
  "hsl(262, 83%, 58%)",
  "hsl(221, 83%, 53%)",
  "hsl(142, 76%, 36%)",
  "hsl(174, 72%, 40%)",
];

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n: number) => n.toLocaleString("en-US");

export const WasteReportsPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;

  const [searchQuery, setSearchQuery] = useState("");
  const [locationType, setLocationType] = useState<"branch" | "warehouse">("branch");
  const [locationFilter, setLocationFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  // Fetch completed waste records
  const { data: wasteRecords = [], isLoading } = useQuery({
    queryKey: ["waste-records-report", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("waste_records")
        .select("*")
        .eq("status", "مكتمل")
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Fetch waste items for all completed records
  const { data: wasteItems = [] } = useQuery({
    queryKey: ["waste-items-report", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("waste_items")
        .select("*, waste_records!inner(status, date, branch_id, warehouse_id)")
        .eq("waste_records.status", "مكتمل");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: stockItems = [] } = useQuery({
    queryKey: ["stock-items-waste-report", companyId],
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
    queryKey: ["branches-waste-report", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses-waste-report", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["inv-categories-waste-report", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_categories")
        .select("id, name")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Build waste records map for quick lookup
  const wasteRecordsMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const wr of wasteRecords) m.set(wr.id, wr);
    return m;
  }, [wasteRecords]);

  const processedData = useMemo(() => {
    const stockMap = new Map<string, any>();
    for (const si of stockItems) stockMap.set(si.id, si);

    // Filter waste items by date and location through their parent record
    let filteredItems = wasteItems.filter((wi: any) => {
      const rec = wi.waste_records;
      if (!rec) return false;
      if (dateFrom && rec.date < format(dateFrom, "yyyy-MM-dd")) return false;
      if (dateTo && rec.date > format(dateTo, "yyyy-MM-dd")) return false;
      if (locationFilter !== "all") {
        if (locationType === "branch" && rec.branch_id !== locationFilter) return false;
        if (locationType === "warehouse" && rec.warehouse_id !== locationFilter) return false;
      }
      return true;
    });

    // Aggregate by stock_item_id
    const itemMap = new Map<
      string,
      {
        stockItemId: string;
        name: string;
        code: string;
        catName: string;
        categoryId: string;
        totalWasteQty: number;
        avgCost: number;
        totalLoss: number;
        reasons: Map<string, number>;
        occurrences: number;
        unit: string;
        lastWasteDate: string;
      }
    >();

    for (const wi of filteredItems) {
      const sid = wi.stock_item_id;
      if (!sid) continue;
      const si = stockMap.get(sid);
      const reason = wi.reason || "غير محدد";
      const cost = Number(wi.cost || 0);
      const qty = Number(wi.quantity || 0);
      const rec = wi.waste_records;

      const existing = itemMap.get(sid);
      if (existing) {
        existing.totalWasteQty += qty;
        existing.totalLoss += cost;
        existing.occurrences += 1;
        existing.reasons.set(reason, (existing.reasons.get(reason) || 0) + 1);
        if (rec?.date > existing.lastWasteDate) existing.lastWasteDate = rec.date;
      } else {
        const catName = si ? (si as any).inventory_categories?.name || "بدون مجموعة" : "غير معروف";
        const reasons = new Map<string, number>();
        reasons.set(reason, 1);
        itemMap.set(sid, {
          stockItemId: sid,
          name: wi.name || si?.name || "—",
          code: si?.code || "",
          catName,
          categoryId: si?.category_id || "",
          totalWasteQty: qty,
          avgCost: si ? Number(si.avg_cost) : 0,
          totalLoss: cost,
          reasons,
          occurrences: 1,
          unit: wi.unit || si?.stock_unit || "",
          lastWasteDate: rec?.date || "",
        });
      }
    }

    let result = Array.from(itemMap.values()).sort((a, b) => b.totalLoss - a.totalLoss);

    if (categoryFilter !== "all") {
      result = result.filter((i) => i.categoryId === categoryFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (i) =>
          i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q) || i.catName.toLowerCase().includes(q),
      );
    }

    return result;
  }, [
    wasteItems,
    stockItems,
    wasteRecords,
    dateFrom,
    dateTo,
    locationFilter,
    locationType,
    categoryFilter,
    searchQuery,
  ]);

  // Stats
  const stats = useMemo(() => {
    let filteredRecords = [...wasteRecords];
    if (dateFrom) filteredRecords = filteredRecords.filter((r) => r.date >= format(dateFrom, "yyyy-MM-dd"));
    if (dateTo) filteredRecords = filteredRecords.filter((r) => r.date <= format(dateTo, "yyyy-MM-dd"));
    if (locationFilter !== "all") {
      if (locationType === "branch") filteredRecords = filteredRecords.filter((r) => r.branch_id === locationFilter);
      else filteredRecords = filteredRecords.filter((r) => r.warehouse_id === locationFilter);
    }

    const totalRecords = filteredRecords.length;
    const totalLoss = filteredRecords.reduce((s, r) => s + Number(r.total_cost), 0);
    const uniqueItems = processedData.length;
    const avgLossPerRecord = totalRecords > 0 ? totalLoss / totalRecords : 0;
    const totalWasteQty = processedData.reduce((s, i) => s + i.totalWasteQty, 0);

    return { totalRecords, totalLoss, uniqueItems, avgLossPerRecord, totalWasteQty };
  }, [wasteRecords, processedData, dateFrom, dateTo, locationFilter, locationType]);

  // Monthly trend
  const monthlyTrend = useMemo(() => {
    let filteredRecords = [...wasteRecords];
    if (dateFrom) filteredRecords = filteredRecords.filter((r) => r.date >= format(dateFrom, "yyyy-MM-dd"));
    if (dateTo) filteredRecords = filteredRecords.filter((r) => r.date <= format(dateTo, "yyyy-MM-dd"));
    if (locationFilter !== "all") {
      if (locationType === "branch") filteredRecords = filteredRecords.filter((r) => r.branch_id === locationFilter);
      else filteredRecords = filteredRecords.filter((r) => r.warehouse_id === locationFilter);
    }

    const map = new Map<string, { month: string; cost: number; count: number }>();
    for (const r of filteredRecords) {
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
  }, [wasteRecords, dateFrom, dateTo, locationFilter, locationType]);

  // Top wasted items
  const topWastedChart = useMemo(() => {
    return processedData.slice(0, 8).map((i) => ({
      name: i.name.length > 15 ? i.name.slice(0, 15) + "..." : i.name,
      loss: i.totalLoss,
      count: i.occurrences,
    }));
  }, [processedData]);

  // Reason distribution
  const reasonDistChart = useMemo(() => {
    const reasonMap = new Map<string, number>();
    for (const i of processedData) {
      for (const [reason, count] of i.reasons.entries()) {
        reasonMap.set(reason, (reasonMap.get(reason) || 0) + count);
      }
    }
    return Array.from(reasonMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [processedData]);

  // Category loss distribution
  const categoryLossChart = useMemo(() => {
    const catMap = new Map<string, number>();
    for (const i of processedData) {
      catMap.set(i.catName, (catMap.get(i.catName) || 0) + i.totalLoss);
    }
    return Array.from(catMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [processedData]);

  const totals = useMemo(
    () => ({
      totalLoss: processedData.reduce((s, i) => s + i.totalLoss, 0),
    }),
    [processedData],
  );

  const getTopReason = (reasons: Map<string, number>): string => {
    let maxReason = "—";
    let maxCount = 0;
    for (const [reason, count] of reasons.entries()) {
      if (count > maxCount) {
        maxCount = count;
        maxReason = reason;
      }
    }
    return maxReason;
  };

  const exportCSV = () => {
    const headers = [
      "#",
      "الكود",
      "اسم الصنف",
      "المجموعة",
      "إجمالي كمية الهالك",
      "الوحدة",
      "متوسط التكلفة",
      "إجمالي الخسارة",
      "السبب الأكثر شيوعاً",
      "مرات التكرار",
      "آخر تاريخ هالك",
    ];
    const rows = processedData.map((i, idx) => [
      idx + 1,
      i.code,
      i.name,
      i.catName,
      i.totalWasteQty.toFixed(2),
      i.unit,
      i.avgCost.toFixed(2),
      i.totalLoss.toFixed(2),
      getTopReason(i.reasons),
      i.occurrences,
      i.lastWasteDate,
    ]);
    const bom = "\uFEFF";
    const csv = bom + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `تقارير_الهالك_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 print:space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
            <Trash2 className="text-destructive" size={28} />
            تقارير الهالك
          </h1>
          <p className="text-muted-foreground text-sm mt-1">تحليل خسائر الهالك وأسبابه وتوزيعه</p>
        </div>
      </div>

      {/* Filters */}
      <Card className="print:hidden">
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <Input
                placeholder="بحث بالاسم أو الكود..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-9 text-sm"
              />
            </div>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="المجموعة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المجموعات</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex gap-1">
              <div className="flex items-center gap-0.5 bg-muted/40 rounded-lg p-0.5 border border-border/40">
                <Button
                  variant={locationType === "branch" ? "default" : "ghost"}
                  size="sm"
                  className="h-8 text-xs px-2"
                  onClick={() => {
                    setLocationType("branch");
                    setLocationFilter("all");
                  }}
                >
                  <Store className="h-3.5 w-3.5 ml-1" /> فرع
                </Button>
                <Button
                  variant={locationType === "warehouse" ? "default" : "ghost"}
                  size="sm"
                  className="h-8 text-xs px-2"
                  onClick={() => {
                    setLocationType("warehouse");
                    setLocationFilter("all");
                  }}
                >
                  <Warehouse className="h-3.5 w-3.5 ml-1" /> مخزن
                </Button>
              </div>
              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger className="text-sm flex-1">
                  <SelectValue placeholder={locationType === "branch" ? "كل الفروع" : "كل المخازن"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{locationType === "branch" ? "كل الفروع" : "كل المخازن"}</SelectItem>
                  {locationType === "branch"
                    ? branches.map((b: any) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))
                    : warehouses.map((w: any) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name}
                        </SelectItem>
                      ))}
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
                <Calendar
                  mode="single"
                  selected={dateFrom}
                  onSelect={setDateFrom}
                  className="p-3 pointer-events-auto"
                />
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCategoryFilter("all");
                  setLocationFilter("all");
                  setSearchQuery("");
                  setDateFrom(undefined);
                  setDateTo(undefined);
                }}
              >
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
              <div className="w-10 h-10 rounded-xl bg-destructive/15 flex items-center justify-center">
                <Activity className="text-destructive" size={20} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">عمليات الهالك</p>
                <p className="text-xl font-black text-foreground">{fmtInt(stats.totalRecords)}</p>
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
                <p className="text-xs text-muted-foreground">إجمالي الخسائر</p>
                <p className="text-xl font-black text-destructive">{fmt(stats.totalLoss)}</p>
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
                <p className="text-xs text-muted-foreground">إجمالي كمية الهالك</p>
                <p className="text-xl font-black text-foreground">{fmt(stats.totalWasteQty)}</p>
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
                <p className="text-xs text-muted-foreground">أصناف متأثرة</p>
                <p className="text-xl font-black text-foreground">{fmtInt(stats.uniqueItems)}</p>
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
                <p className="text-xs text-muted-foreground">متوسط خسارة العملية</p>
                <p className="text-xl font-black text-foreground">{fmt(stats.avgLossPerRecord)}</p>
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
            <CardTitle className="text-sm font-bold">اتجاه الهالك الشهري</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={monthlyTrend} margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} tickMargin={30} />
                <YAxis tick={{ fontSize: 10 }} tickMargin={30} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, color: "#000" }} />
                <Line
                  type="monotone"
                  dataKey="cost"
                  name="الخسارة"
                  stroke="hsl(0, 84%, 60%)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  name="عدد العمليات"
                  stroke="hsl(38, 92%, 50%)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top wasted items */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">أكثر الأصناف خسارة</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topWastedChart} margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} tickMargin={10} />
                <YAxis tick={{ fontSize: 10 }} tickMargin={30} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, color: "#000" }} />
                <Bar dataKey="loss" name="إجمالي الخسارة" fill="hsl(0, 84%, 60%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Reason distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">توزيع أسباب الهالك</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <Pie
                  data={reasonDistChart}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  label={({ name, percent, cx: cxx, cy: cyy, midAngle, outerRadius: or }: any) => {
                    const rad = Math.PI / 180;
                    const radius = or + 60;
                    const x = cxx + radius * Math.cos(-midAngle * rad);
                    const y = cyy + radius * Math.sin(-midAngle * rad);
                    return (
                      <text
                        x={x}
                        y={y}
                        textAnchor={x > cxx ? "start" : "end"}
                        dominantBaseline="central"
                        fontSize={11}
                        fill="hsl(var(--foreground))"
                      >
                        {`${name} ${(percent * 100).toFixed(0)}%`}
                      </text>
                    );
                  }}
                >
                  {reasonDistChart.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, color: "#000" }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Category loss distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">توزيع الخسائر حسب المجموعة</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <Pie
                  data={categoryLossChart}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  label={({ name, percent, cx: cxx, cy: cyy, midAngle, outerRadius: or }: any) => {
                    const rad = Math.PI / 180;
                    const radius = or + 70;
                    const x = cxx + radius * Math.cos(-midAngle * rad);
                    const y = cyy + radius * Math.sin(-midAngle * rad);
                    return (
                      <text
                        x={x}
                        y={y}
                        textAnchor={x > cxx ? "start" : "end"}
                        dominantBaseline="central"
                        fontSize={11}
                        fill="hsl(var(--foreground))"
                      >
                        {`${name} ${(percent * 100).toFixed(0)}%`}
                      </text>
                    );
                  }}
                >
                  {categoryLossChart.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
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
              <BarChart3 size={16} /> جدول تفاصيل الهالك ({processedData.length} صنف)
            </CardTitle>
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
                  <TableHead className="text-center text-xs font-bold">إجمالي كمية الهالك</TableHead>
                  <TableHead className="text-center text-xs font-bold">الوحدة</TableHead>
                  <TableHead className="text-center text-xs font-bold">متوسط التكلفة</TableHead>
                  <TableHead className="text-center text-xs font-bold">إجمالي الخسارة</TableHead>
                  <TableHead className="text-xs font-bold">السبب الأكثر شيوعاً</TableHead>
                  <TableHead className="text-center text-xs font-bold">مرات التكرار</TableHead>
                  <TableHead className="text-center text-xs font-bold">آخر تاريخ هالك</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">
                      جاري التحميل...
                    </TableCell>
                  </TableRow>
                ) : processedData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">
                      لا توجد بيانات هالك
                    </TableCell>
                  </TableRow>
                ) : (
                  processedData.map((item, idx) => {
                    const topReason = getTopReason(item.reasons);
                    return (
                      <TableRow
                        key={item.stockItemId}
                        className={cn("hover:bg-muted/30", item.occurrences >= 5 && "bg-destructive/5")}
                      >
                        <TableCell className="text-center text-xs">{idx + 1}</TableCell>
                        <TableCell className="text-center text-xs font-mono">{item.code || "—"}</TableCell>
                        <TableCell className="text-xs font-medium">
                          <div className="flex items-center gap-1.5">
                            {item.occurrences >= 5 && (
                              <AlertTriangle size={14} className="text-destructive flex-shrink-0" />
                            )}
                            {item.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{item.catName}</TableCell>
                        <TableCell className="text-center text-xs font-bold">{fmt(item.totalWasteQty)}</TableCell>
                        <TableCell className="text-center text-xs">{item.unit}</TableCell>
                        <TableCell className="text-center text-xs">{fmt(item.avgCost)}</TableCell>
                        <TableCell className="text-center text-xs font-bold text-destructive">
                          {fmt(item.totalLoss)}
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className="inline-flex items-center bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full text-[11px] font-medium">
                            {topReason}
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-xs">
                          <span
                            className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded-full font-bold text-[11px]",
                              item.occurrences >= 5
                                ? "bg-destructive/10 text-destructive"
                                : "bg-primary/10 text-primary",
                            )}
                          >
                            {fmtInt(item.occurrences)} مرة
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-xs">{item.lastWasteDate}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
              {processedData.length > 0 && (
                <TableFooter>
                  <TableRow className="bg-muted/60 font-bold">
                    <TableCell colSpan={7} className="text-xs text-left">
                      إجمالي الخسائر
                    </TableCell>
                    <TableCell className="text-center text-xs font-black text-destructive">
                      {fmt(totals.totalLoss)}
                    </TableCell>
                    <TableCell colSpan={3} />
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
