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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  Search, Store, Warehouse, Package, AlertTriangle, CheckCircle2,
  ShoppingCart, TrendingDown, FileSpreadsheet, FileText, BarChart3, Layers
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";

const COLORS = [
  "hsl(0, 84%, 60%)", "hsl(38, 92%, 50%)", "hsl(142, 76%, 36%)",
  "hsl(221, 83%, 53%)", "hsl(262, 83%, 58%)", "hsl(174, 72%, 40%)",
];

type StockStatus = "متوفر" | "ناقص" | "حرج" | "تحت الطلب" | "نفذ";

const getStatus = (current: number, min: number, reorder: number, max: number): StockStatus => {
  if (current <= 0) return "نفذ";
  if (current <= min) return "حرج";
  if (current <= reorder) return "تحت الطلب";
  if (current < max) return "ناقص";
  return "متوفر";
};

const getStatusColor = (status: StockStatus) => {
  switch (status) {
    case "نفذ": return "text-red-600 bg-red-50 border-red-200";
    case "حرج": return "text-red-600 bg-red-50 border-red-200";
    case "تحت الطلب": return "text-amber-600 bg-amber-50 border-amber-200";
    case "ناقص": return "text-amber-600 bg-amber-50 border-amber-200";
    case "متوفر": return "text-emerald-600 bg-emerald-50 border-emerald-200";
  }
};

const getLevelPercent = (current: number, min: number, reorder: number, max: number) => {
  if (max <= 0) return 0;
  return Math.min(100, Math.max(0, (current / max) * 100));
};

const getLevelColor = (current: number, min: number, reorder: number, _max: number) => {
  if (current <= min) return "hsl(0, 84%, 60%)";
  if (current < reorder) return "hsl(38, 92%, 50%)";
  return "hsl(142, 76%, 36%)";
};

const StockLevelCircle: React.FC<{ percent: number; color: string; size?: number }> = ({ percent, color, size = 40 }) => {
  const r = (size - 6) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (percent / 100) * circumference;
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--border))" strokeWidth={3} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={3}
        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
        className="transition-all duration-500" />
    </svg>
  );
};

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const InventoryLevelsPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;

  const [searchQuery, setSearchQuery] = useState("");
  const [locationType, setLocationType] = useState<"branch" | "warehouse">("branch");
  const [locationFilter, setLocationFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["stock-items-levels", companyId],
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
    queryKey: ["branches-levels", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses-levels", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["inv-categories-levels", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_categories").select("id, name").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: itemLocations = [] } = useQuery({
    queryKey: ["stock-item-locations-levels", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_item_locations").select("*");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!companyId,
  });

  const processedItems = useMemo(() => {
    let result = [...items];

    // Filter by location
    if (locationFilter !== "all") {
      const itemIdsWithLocation = new Set(
        itemLocations
          .filter((l: any) => {
            if (locationType === "branch") return l.branch_id === locationFilter;
            return l.warehouse_id === locationFilter;
          })
          .map((l: any) => l.stock_item_id)
      );
      result = result.filter((item: any) => itemIdsWithLocation.has(item.id));
    }

    // Category filter
    if (categoryFilter !== "all") {
      result = result.filter((item: any) => item.category_id === categoryFilter);
    }

    // Add status
    const enriched = result.map((item: any) => {
      const current = Number(item.current_stock);
      const min = Number(item.min_level);
      const reorder = Number(item.reorder_level);
      const max = Number(item.max_level);
      const status = getStatus(current, min, reorder, max);
      const catName = (item as any).inventory_categories?.name || "بدون مجموعة";
      const levelPercent = getLevelPercent(current, min, reorder, max);
      const levelColor = getLevelColor(current, min, reorder, max);
      const totalValue = current * Number(item.avg_cost);

      return {
        ...item,
        status,
        catName,
        levelPercent,
        levelColor,
        totalValue,
        currentStock: current,
        minLevel: min,
        reorderLevel: reorder,
        maxLevel: max,
      };
    });

    // Status filter
    let filtered = statusFilter !== "all"
      ? enriched.filter(i => i.status === statusFilter)
      : enriched;

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(i =>
        i.name.toLowerCase().includes(q) ||
        (i.code || "").toLowerCase().includes(q) ||
        i.catName.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [items, locationFilter, locationType, categoryFilter, statusFilter, searchQuery, itemLocations]);

  // Stats
  const stats = useMemo(() => {
    const total = processedItems.length;
    const outOfStock = processedItems.filter(i => i.status === "نفذ").length;
    const critical = processedItems.filter(i => i.status === "حرج").length;
    const reorder = processedItems.filter(i => i.status === "تحت الطلب").length;
    const low = processedItems.filter(i => i.status === "ناقص").length;
    const available = processedItems.filter(i => i.status === "متوفر").length;
    const totalValue = processedItems.reduce((s, i) => s + i.totalValue, 0);
    const alertCount = outOfStock + critical;
    return { total, outOfStock, critical, reorder, low, available, totalValue, alertCount };
  }, [processedItems]);

  // Charts
  const statusChart = useMemo(() => [
    { name: "نفذ", value: stats.outOfStock },
    { name: "حرج", value: stats.critical },
    { name: "تحت الطلب", value: stats.reorder },
    { name: "ناقص", value: stats.low },
    { name: "متوفر", value: stats.available },
  ].filter(i => i.value > 0), [stats]);

  const categoryValueChart = useMemo(() => {
    const catMap = new Map<string, number>();
    for (const i of processedItems) {
      catMap.set(i.catName, (catMap.get(i.catName) || 0) + i.totalValue);
    }
    return Array.from(catMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [processedItems]);

  // Export
  const exportCSV = () => {
    const headers = ["الكود", "اسم الصنف", "المجموعة", "الرصيد الحالي", "الوحدة", "متوسط التكلفة", "إجمالي القيمة", "الحد الأدنى", "إعادة الطلب", "الحد الأقصى", "الحالة"];
    const rows = processedItems.map(i => [
      i.code || "", i.name, i.catName, i.currentStock.toFixed(2), i.stock_unit,
      Number(i.avg_cost).toFixed(2), i.totalValue.toFixed(2),
      i.minLevel, i.reorderLevel, i.maxLevel, i.status,
    ]);
    const bom = "\uFEFF";
    const csv = bom + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `مستويات_المخزون_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 print:space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
            <Layers className="text-primary" size={28} />
            مستويات المخزون
          </h1>
          <p className="text-muted-foreground text-sm mt-1">مراقبة مستويات الأصناف وتنبيهات إعادة الطلب</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <ExportButtons
            data={processedItems.map((i: any, idx: number) => ({
              "#": idx + 1,
              الكود: i.code || "",
              "اسم الصنف": i.name,
              المجموعة: i.catName,
              "الرصيد الحالي": i.currentStock.toFixed(2),
              الوحدة: i.stock_unit,
              "متوسط التكلفة": Number(i.avg_cost).toFixed(2),
              "إجمالي القيمة": i.totalValue.toFixed(2),
              "الحد الأدنى": i.minLevel,
              "إعادة الطلب": i.reorderLevel,
              "الحد الأقصى": i.maxLevel,
              الحالة: i.status,
            }))}
            columns={[
              { key: "#", label: "#" },
              { key: "الكود", label: "الكود" },
              { key: "اسم الصنف", label: "اسم الصنف" },
              { key: "المجموعة", label: "المجموعة" },
              { key: "الرصيد الحالي", label: "الرصيد الحالي" },
              { key: "الوحدة", label: "الوحدة" },
              { key: "متوسط التكلفة", label: "متوسط التكلفة" },
              { key: "إجمالي القيمة", label: "إجمالي القيمة" },
              { key: "الحد الأدنى", label: "الحد الأدنى" },
              { key: "إعادة الطلب", label: "إعادة الطلب" },
              { key: "الحد الأقصى", label: "الحد الأقصى" },
              { key: "الحالة", label: "الحالة" },
            ]}
            filename="مستويات_المخزون"
            title="مستويات المخزون"
          />
          <PrintButton
            data={processedItems.map((i: any, idx: number) => ({
              "#": idx + 1,
              الكود: i.code || "",
              "اسم الصنف": i.name,
              المجموعة: i.catName,
              "الرصيد الحالي": i.currentStock.toFixed(2),
              الوحدة: i.stock_unit,
              "متوسط التكلفة": Number(i.avg_cost).toFixed(2),
              "إجمالي القيمة": i.totalValue.toFixed(2),
              "الحد الأدنى": i.minLevel,
              "إعادة الطلب": i.reorderLevel,
              "الحد الأقصى": i.maxLevel,
              الحالة: i.status,
            }))}
            columns={[
              { key: "#", label: "#" },
              { key: "الكود", label: "الكود" },
              { key: "اسم الصنف", label: "اسم الصنف" },
              { key: "المجموعة", label: "المجموعة" },
              { key: "الرصيد الحالي", label: "الرصيد الحالي" },
              { key: "الوحدة", label: "الوحدة" },
              { key: "متوسط التكلفة", label: "متوسط التكلفة" },
              { key: "إجمالي القيمة", label: "إجمالي القيمة" },
              { key: "الحد الأدنى", label: "الحد الأدنى" },
              { key: "إعادة الطلب", label: "إعادة الطلب" },
              { key: "الحد الأقصى", label: "الحد الأقصى" },
              { key: "الحالة", label: "الحالة" },
            ]}
            title="مستويات المخزون"
          />
        </div>
      </div>

      {/* Filters */}
      <Card className="print:hidden">
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <Input placeholder="بحث بالاسم أو الكود أو المجموعة..." value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)} className="pr-9 text-sm" />
            </div>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="المجموعة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المجموعات</SelectItem>
                {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="الحالة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="متوفر">متوفر</SelectItem>
                <SelectItem value="ناقص">ناقص</SelectItem>
                <SelectItem value="تحت الطلب">تحت الطلب</SelectItem>
                <SelectItem value="حرج">حرج</SelectItem>
                <SelectItem value="نفذ">نفذ</SelectItem>
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
          </div>
          {(categoryFilter !== "all" || statusFilter !== "all" || locationFilter !== "all" || searchQuery) && (
            <div className="mt-2 flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => { setCategoryFilter("all"); setStatusFilter("all"); setLocationFilter("all"); setSearchQuery(""); }}>
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
                <Package className="text-primary" size={20} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">إجمالي الأصناف</p>
                <p className="text-xl font-black text-foreground">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                <CheckCircle2 className="text-emerald-600" size={20} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">إجمالي قيمة المخزون</p>
                <p className="text-xl font-black text-foreground">{fmt(stats.totalValue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={cn(stats.alertCount > 0 && "border-red-300 bg-red-500/10")}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center">
                <AlertTriangle className="text-red-600" size={20} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">تنبيهات (نفذ + حرج)</p>
                <p className="text-xl font-black text-red-600">{stats.alertCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
                <ShoppingCart className="text-amber-600" size={20} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">تحت الطلب</p>
                <p className="text-xl font-black text-foreground">{stats.reorder}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:hidden">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">توزيع حالات المخزون</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <Pie data={statusChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}
                  label={({ name, percent, cx: cxx, cy: cyy, midAngle, outerRadius: or }) => {
                    const rad = Math.PI / 180;
                    const radius = or + 55;
                    const x = cxx + radius * Math.cos(-midAngle * rad);
                    const y = cyy + radius * Math.sin(-midAngle * rad);
                    return (
                      <text x={x} y={y} textAnchor={x > cxx ? "start" : "end"} dominantBaseline="central"
                        fontSize={10} fill="hsl(var(--foreground))">
                        {`${name} ${(percent * 100).toFixed(0)}%`}
                      </text>
                    );
                  }}>
                  {statusChart.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, color: "#000" }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">قيمة المخزون حسب المجموعة</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={categoryValueChart} layout="vertical" margin={{ top: 20, right: 30, bottom: 20, left: 130 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 10 }} tickMargin={10} />
                <YAxis dataKey="name" type="category" width={10} tick={false} tickMargin={10} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 10, color: "#000" }} />
                <Bar dataKey="value" name="القيمة" radius={[0, 4, 4, 0]}
                  label={({ y, height, value, index }: any) => {
                    const item = categoryValueChart[index];
                    return (
                      <text x={115} y={y + height / 2} textAnchor="start" dominantBaseline="central"
                        fontSize={11} fill="hsl(var(--foreground))" fontWeight={600}>
                        {item?.name}
                      </text>
                    );
                  }}
                >
                  {categoryValueChart.map((entry, i) => {
                    const maxVal = categoryValueChart[0]?.value || 1;
                    const ratio = entry.value / maxVal;
                    const fill = ratio < 0.15
                      ? "hsla(0, 84%, 60%, 0.35)"
                      : ratio < 0.4
                        ? "hsla(221, 83%, 53%, 0.6)"
                        : "hsl(221, 83%, 53%)";
                    return <Cell key={i} fill={fill} />;
                  })}
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
              <BarChart3 size={16} /> جدول مستويات المخزون ({processedItems.length} صنف)
            </CardTitle>
            <div className="flex items-center gap-2">
              <PrintButton
                data={processedItems.map((item: any) => ({ code: item.code || "—", name: item.name, category: item.catName, stock: item.currentStock.toFixed(2), min: item.minLevel, max: item.maxLevel, reorder: item.reorderLevel, unit: item.unit, status: item.statusLabel }))}
                columns={[{ key: "code", label: "الكود" }, { key: "name", label: "الصنف" }, { key: "category", label: "المجموعة" }, { key: "stock", label: "الرصيد" }, { key: "min", label: "الحد الأدنى" }, { key: "max", label: "الحد الأقصى" }, { key: "reorder", label: "نقطة الطلب" }, { key: "unit", label: "الوحدة" }, { key: "status", label: "الحالة" }]}
                title="مستويات المخزون"
              />
              <ExportButtons
                data={processedItems.map((item: any) => ({ code: item.code || "—", name: item.name, category: item.catName, stock: item.currentStock.toFixed(2), min: item.minLevel, max: item.maxLevel, reorder: item.reorderLevel, unit: item.unit, status: item.statusLabel }))}
                columns={[{ key: "code", label: "الكود" }, { key: "name", label: "الصنف" }, { key: "category", label: "المجموعة" }, { key: "stock", label: "الرصيد" }, { key: "min", label: "الحد الأدنى" }, { key: "max", label: "الحد الأقصى" }, { key: "reorder", label: "نقطة الطلب" }, { key: "unit", label: "الوحدة" }, { key: "status", label: "الحالة" }]}
                filename="مستويات_المخزون"
                title="مستويات المخزون"
              />
            </div>
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
                  <TableHead className="text-center text-xs font-bold">الرصيد الحالي</TableHead>
                  <TableHead className="text-center text-xs font-bold">الوحدة</TableHead>
                  <TableHead className="text-center text-xs font-bold">متوسط التكلفة</TableHead>
                  <TableHead className="text-center text-xs font-bold">إجمالي القيمة</TableHead>
                  <TableHead className="text-center text-xs font-bold">مستوى الكمية</TableHead>
                  <TableHead className="text-center text-xs font-bold">الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">جاري التحميل...</TableCell>
                  </TableRow>
                ) : processedItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">لا توجد أصناف</TableCell>
                  </TableRow>
                ) : (
                  processedItems.map((item, idx) => {
                    const isCritical = item.status === "حرج" || item.status === "نفذ";
                    return (
                      <TableRow key={item.id} className={cn(
                        "hover:bg-muted/30",
                        isCritical && "bg-red-500/10 border-r-4 border-r-red-500"
                      )}>
                        <TableCell className="text-center text-xs">{idx + 1}</TableCell>
                        <TableCell className="text-center text-xs font-mono">{item.code || "—"}</TableCell>
                        <TableCell className="text-xs font-medium">
                          <div className="flex items-center gap-2">
                            {isCritical && <AlertTriangle size={14} className="text-red-500 flex-shrink-0 animate-pulse" />}
                            {item.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{item.catName}</TableCell>
                        <TableCell className={cn("text-center text-xs font-bold", isCritical && "text-red-600")}>
                          {fmt(item.currentStock)}
                        </TableCell>
                        <TableCell className="text-center text-xs">{item.stock_unit}</TableCell>
                        <TableCell className="text-center text-xs">{fmt(Number(item.avg_cost))}</TableCell>
                        <TableCell className="text-center text-xs font-bold">{fmt(item.totalValue)}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1" title={`${item.levelPercent.toFixed(0)}% - أدنى: ${item.minLevel} | طلب: ${item.reorderLevel} | أقصى: ${item.maxLevel}`}>
                            <StockLevelCircle percent={item.levelPercent} color={item.levelColor} size={36} />
                            <span className="text-[10px] text-muted-foreground">{item.levelPercent.toFixed(0)}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={cn(
                            "inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full border",
                            getStatusColor(item.status)
                          )}>
                            {item.status}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
