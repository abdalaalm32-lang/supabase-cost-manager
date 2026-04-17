import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import {
  CalendarIcon, X, Search, Package, TrendingUp, ShoppingBag, DollarSign,
  ArrowUpDown, BarChart3, PieChart as PieIcon
} from "lucide-react";
import { ExportButtons } from "@/components/ExportButtons";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";

type SortKey = "name" | "category" | "quantity" | "revenue" | "avgPrice" | "share";
type SortDir = "asc" | "desc";

const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2, 173 58% 39%))", "hsl(var(--chart-3, 197 37% 24%))", "hsl(var(--chart-4, 43 74% 66%))", "hsl(var(--chart-5, 27 87% 67%))", "#8b5cf6", "#ec4899", "#14b8a6", "#f59e0b", "#6366f1"];

export const PosItemSalesPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;

  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [shiftFilter, setShiftFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [cashierFilter, setCashierFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Branches
  const { data: branches } = useQuery({
    queryKey: ["item-sales-branches", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("branches").select("id, name").eq("company_id", companyId!).eq("active", true).order("name");
      return data || [];
    },
    enabled: !!companyId,
  });

  // Shifts
  const { data: shifts } = useQuery({
    queryKey: ["item-sales-shifts", companyId, branchFilter],
    queryFn: async () => {
      let q = supabase.from("pos_shifts").select("id, shift_number, shift_name, opened_at, branch_id").eq("company_id", companyId!).order("opened_at", { ascending: false }).limit(200);
      if (branchFilter !== "all") q = q.eq("branch_id", branchFilter);
      const { data } = await q;
      return data || [];
    },
    enabled: !!companyId,
  });

  // Categories
  const { data: categories } = useQuery({
    queryKey: ["item-sales-categories", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("id, name").eq("company_id", companyId!).eq("active", true).order("name");
      return data || [];
    },
    enabled: !!companyId,
  });

  // Cashiers
  const { data: cashiers } = useQuery({
    queryKey: ["item-sales-cashiers", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name").eq("company_id", companyId!).order("full_name");
      return data || [];
    },
    enabled: !!companyId,
  });

  // Sales (filtered by date/branch/shift/cashier at server when possible)
  const { data: salesRaw, isLoading } = useQuery({
    queryKey: ["item-sales-data", companyId, branchFilter, shiftFilter, cashierFilter, dateFrom?.toISOString(), dateTo?.toISOString()],
    queryFn: async () => {
      let q = supabase
        .from("pos_sales")
        .select("id, branch_id, shift_id, assigned_cashier_id, created_at, status")
        .eq("company_id", companyId!)
        .eq("status", "مكتمل")
        .order("created_at", { ascending: false })
        .limit(5000);
      if (branchFilter !== "all") q = q.eq("branch_id", branchFilter);
      if (shiftFilter !== "all") q = q.eq("shift_id", shiftFilter);
      if (cashierFilter !== "all") q = q.eq("assigned_cashier_id", cashierFilter);
      if (dateFrom) {
        const f = new Date(dateFrom); f.setHours(0, 0, 0, 0);
        q = q.gte("created_at", f.toISOString());
      }
      if (dateTo) {
        const t = new Date(dateTo); t.setHours(23, 59, 59, 999);
        q = q.lte("created_at", t.toISOString());
      }
      const { data } = await q;
      return data || [];
    },
    enabled: !!companyId,
  });

  const saleIds = useMemo(() => (salesRaw || []).map((s) => s.id), [salesRaw]);

  // Sale items aggregated
  const { data: saleItems } = useQuery({
    queryKey: ["item-sales-items", saleIds.length, saleIds[0]],
    queryFn: async () => {
      if (saleIds.length === 0) return [];
      // Chunk to avoid URL length issues
      const chunks: string[][] = [];
      for (let i = 0; i < saleIds.length; i += 200) chunks.push(saleIds.slice(i, i + 200));
      const all: any[] = [];
      for (const chunk of chunks) {
        const { data } = await supabase
          .from("pos_sale_items")
          .select("id, sale_id, pos_item_id, quantity, unit_price, total, pos_items:pos_item_id(id, name, category, category_id, categories:category_id(name))")
          .in("sale_id", chunk);
        if (data) all.push(...data);
      }
      return all;
    },
    enabled: saleIds.length > 0,
  });

  // Aggregate by item
  const aggregated = useMemo(() => {
    if (!saleItems) return { items: [], totalQty: 0, totalRevenue: 0, byCategory: [] as { name: string; revenue: number; qty: number }[] };
    const map = new Map<string, { id: string; name: string; category: string; quantity: number; revenue: number; salesCount: number }>();
    let totalQty = 0;
    let totalRevenue = 0;
    const catMap = new Map<string, { revenue: number; qty: number }>();

    for (const item of saleItems) {
      const itemId = item.pos_item_id || item.id;
      const name = item.pos_items?.name || "صنف محذوف";
      const category = item.pos_items?.categories?.name || item.pos_items?.category || "بدون مجموعة";
      const qty = Number(item.quantity || 0);
      const rev = Number(item.total || 0);

      // Filter by category here
      if (categoryFilter !== "all" && item.pos_items?.category_id !== categoryFilter) continue;

      const existing = map.get(itemId);
      if (existing) {
        existing.quantity += qty;
        existing.revenue += rev;
        existing.salesCount += 1;
      } else {
        map.set(itemId, { id: itemId, name, category, quantity: qty, revenue: rev, salesCount: 1 });
      }
      totalQty += qty;
      totalRevenue += rev;

      const c = catMap.get(category) || { revenue: 0, qty: 0 };
      c.revenue += rev; c.qty += qty;
      catMap.set(category, c);
    }

    let items = Array.from(map.values()).map((it) => ({
      ...it,
      avgPrice: it.quantity > 0 ? it.revenue / it.quantity : 0,
      share: totalRevenue > 0 ? (it.revenue / totalRevenue) * 100 : 0,
    }));

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      items = items.filter((i) => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q));
    }

    // Sort
    items.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "name" || sortKey === "category") {
        return a[sortKey].localeCompare(b[sortKey], "ar") * dir;
      }
      return ((a[sortKey] as number) - (b[sortKey] as number)) * dir;
    });

    const byCategory = Array.from(catMap.entries())
      .map(([name, v]) => ({ name, revenue: v.revenue, qty: v.qty }))
      .sort((a, b) => b.revenue - a.revenue);

    return { items, totalQty, totalRevenue, byCategory };
  }, [saleItems, categoryFilter, searchQuery, sortKey, sortDir]);

  const top10 = useMemo(() => {
    return [...aggregated.items].sort((a, b) => b.revenue - a.revenue).slice(0, 10).map((i) => ({
      name: i.name.length > 18 ? i.name.slice(0, 18) + "…" : i.name,
      fullName: i.name,
      revenue: Number(i.revenue.toFixed(2)),
      quantity: i.quantity,
    }));
  }, [aggregated.items]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const clearFilters = () => {
    setDateFrom(undefined); setDateTo(undefined);
    setBranchFilter("all"); setShiftFilter("all");
    setCategoryFilter("all"); setCashierFilter("all");
    setSearchQuery("");
  };

  const hasFilters = dateFrom || dateTo || branchFilter !== "all" || shiftFilter !== "all" || categoryFilter !== "all" || cashierFilter !== "all" || searchQuery;

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
            <Package className="h-6 w-6 text-primary" />
            مبيعات حسب الأصناف
          </h1>
          <p className="text-xs text-muted-foreground mt-1">تحليل تفصيلي لأداء كل صنف خلال الفترة المحددة</p>
        </div>
        <ExportButtons
          data={aggregated.items.map((i) => ({
            name: i.name,
            category: i.category,
            quantity: i.quantity,
            revenue: i.revenue.toFixed(2),
            avgPrice: i.avgPrice.toFixed(2),
            share: i.share.toFixed(2) + "%",
          }))}
          columns={[
            { key: "name", label: "الصنف" },
            { key: "category", label: "المجموعة" },
            { key: "quantity", label: "الكمية المباعة" },
            { key: "revenue", label: "الإيراد (EGP)" },
            { key: "avgPrice", label: "متوسط السعر" },
            { key: "share", label: "النسبة" },
          ]}
          filename="مبيعات_حسب_الأصناف"
          title="تقرير مبيعات الأصناف"
        />
      </div>

      {/* Filters */}
      <Card className="glass-card">
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="بحث بالصنف أو المجموعة..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="glass-input pr-9" />
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("glass-input min-w-[160px] justify-start text-right font-normal", !dateFrom && "text-muted-foreground")}>
                  <CalendarIcon className="ml-2 h-4 w-4" />
                  {dateFrom ? format(dateFrom, "yyyy/MM/dd", { locale: ar }) : "من تاريخ"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("glass-input min-w-[160px] justify-start text-right font-normal", !dateTo && "text-muted-foreground")}>
                  <CalendarIcon className="ml-2 h-4 w-4" />
                  {dateTo ? format(dateTo, "yyyy/MM/dd", { locale: ar }) : "إلى تاريخ"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>

            <Select value={branchFilter} onValueChange={(v) => { setBranchFilter(v); setShiftFilter("all"); }}>
              <SelectTrigger className="glass-input w-[160px]"><SelectValue placeholder="الفرع" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الفروع</SelectItem>
                {(branches || []).map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={shiftFilter} onValueChange={setShiftFilter}>
              <SelectTrigger className="glass-input w-[180px]"><SelectValue placeholder="الشيفت" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الشيفتات</SelectItem>
                {(shifts || []).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.shift_number || s.shift_name || format(new Date(s.opened_at), "yyyy/MM/dd HH:mm")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="glass-input w-[160px]"><SelectValue placeholder="المجموعة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المجموعات</SelectItem>
                {(categories || []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={cashierFilter} onValueChange={setCashierFilter}>
              <SelectTrigger className="glass-input w-[160px]"><SelectValue placeholder="الكاشير" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الكاشير</SelectItem>
                {(cashiers || []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
              </SelectContent>
            </Select>

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-1" /> مسح الفلاتر
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="glass-card">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">عدد الأصناف</p>
                <p className="text-2xl font-black text-foreground mt-1">{aggregated.items.length}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center">
                <Package className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">إجمالي الكمية</p>
                <p className="text-2xl font-black text-foreground mt-1">{fmt(aggregated.totalQty)}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                <ShoppingBag className="h-5 w-5 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">إجمالي الإيراد</p>
                <p className="text-2xl font-black text-foreground mt-1">{fmt(aggregated.totalRevenue)} <span className="text-xs text-muted-foreground">EGP</span></p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">أعلى صنف مبيعاً</p>
                <p className="text-sm font-bold text-foreground mt-1 truncate">{top10[0]?.fullName || "—"}</p>
                <p className="text-xs text-primary font-semibold mt-0.5">{top10[0] ? fmt(top10[0].revenue) + " EGP" : ""}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              أعلى 10 أصناف مبيعاً (بالإيراد)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {top10.length === 0 ? (
              <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">لا توجد بيانات</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={top10} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => [fmt(v) + " EGP", "الإيراد"]}
                    labelFormatter={(_, p) => (p?.[0] as any)?.payload?.fullName || ""}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <PieIcon className="h-5 w-5 text-primary" />
              توزيع المبيعات حسب المجموعة
            </CardTitle>
          </CardHeader>
          <CardContent>
            {aggregated.byCategory.length === 0 ? (
              <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">لا توجد بيانات</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={aggregated.byCategory} dataKey="revenue" nameKey="name" cx="50%" cy="50%" outerRadius={95} label={(e: any) => `${e.name} (${((e.revenue / aggregated.totalRevenue) * 100).toFixed(1)}%)`} labelLine={false}>
                    {aggregated.byCategory.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => [fmt(v) + " EGP", "الإيراد"]}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detailed Table */}
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">تفاصيل الأصناف ({aggregated.items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right cursor-pointer hover:bg-muted/30" onClick={() => toggleSort("name")}>
                    <span className="inline-flex items-center gap-1">الصنف <ArrowUpDown className="h-3 w-3 opacity-50" /></span>
                  </TableHead>
                  <TableHead className="text-right cursor-pointer hover:bg-muted/30" onClick={() => toggleSort("category")}>
                    <span className="inline-flex items-center gap-1">المجموعة <ArrowUpDown className="h-3 w-3 opacity-50" /></span>
                  </TableHead>
                  <TableHead className="text-center cursor-pointer hover:bg-muted/30" onClick={() => toggleSort("quantity")}>
                    <span className="inline-flex items-center gap-1">الكمية <ArrowUpDown className="h-3 w-3 opacity-50" /></span>
                  </TableHead>
                  <TableHead className="text-center cursor-pointer hover:bg-muted/30" onClick={() => toggleSort("avgPrice")}>
                    <span className="inline-flex items-center gap-1">متوسط السعر <ArrowUpDown className="h-3 w-3 opacity-50" /></span>
                  </TableHead>
                  <TableHead className="text-center cursor-pointer hover:bg-muted/30" onClick={() => toggleSort("revenue")}>
                    <span className="inline-flex items-center gap-1">الإيراد (EGP) <ArrowUpDown className="h-3 w-3 opacity-50" /></span>
                  </TableHead>
                  <TableHead className="text-center cursor-pointer hover:bg-muted/30" onClick={() => toggleSort("share")}>
                    <span className="inline-flex items-center gap-1">النسبة <ArrowUpDown className="h-3 w-3 opacity-50" /></span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">جاري التحميل...</TableCell></TableRow>
                ) : aggregated.items.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">لا توجد مبيعات للفترة/الفلاتر المحددة</TableCell></TableRow>
                ) : (
                  aggregated.items.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell className="font-semibold text-right">{it.name}</TableCell>
                      <TableCell className="text-right text-muted-foreground text-xs">{it.category}</TableCell>
                      <TableCell className="text-center font-bold">{fmt(it.quantity)}</TableCell>
                      <TableCell className="text-center">{fmt(it.avgPrice)}</TableCell>
                      <TableCell className="text-center font-bold text-primary">{fmt(it.revenue)}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center gap-2 justify-center">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${Math.min(it.share, 100)}%` }} />
                          </div>
                          <span className="text-xs font-semibold w-12 text-left">{it.share.toFixed(1)}%</span>
                        </div>
                      </TableCell>
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

export default PosItemSalesPage;
