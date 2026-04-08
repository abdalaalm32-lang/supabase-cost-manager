import React, { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useLocationStock } from "@/hooks/useLocationStock";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  TrendingUp, TrendingDown, Package, DollarSign, ShoppingCart,
  Factory, Trash2, ArrowRightLeft, BarChart3, Warehouse, GitBranch,
  Users, ClipboardCheck, AlertTriangle, ArrowUp, ArrowDown,
  Activity, Zap, Target, PieChart, MapPin, Building,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart as RePieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtCurrency = (n: number) => `${fmt(n)} ج.م`;

const COLORS = [
  "hsl(199, 89%, 60%)", // primary
  "hsl(260, 60%, 50%)", // secondary
  "hsl(174, 80%, 50%)", // accent
  "hsl(145, 65%, 45%)", // success
  "hsl(38, 92%, 55%)",  // warning
  "hsl(0, 70%, 55%)",   // destructive
];

const KPICard: React.FC<{
  title: string; value: string; subtitle?: string;
  icon: React.ElementType; gradient: string; trend?: number;
}> = ({ title, value, subtitle, icon: Icon, gradient, trend }) => (
  <div className="group relative overflow-hidden rounded-2xl border border-border/30 bg-card/50 backdrop-blur-sm p-5 hover:border-primary/30 transition-all duration-500 hover:shadow-lg hover:shadow-primary/5">
    <div className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-3xl opacity-20 ${gradient} group-hover:opacity-30 transition-opacity`} />
    <div className="relative z-10">
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2.5 rounded-xl ${gradient} bg-opacity-10`}>
          <Icon size={18} />
        </div>
        {trend !== undefined && trend !== 0 && (
          <div className={`flex items-center gap-0.5 text-[10px] font-bold px-2 py-1 rounded-full ${trend > 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
            {trend > 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
            {Math.abs(trend).toFixed(1)}%
          </div>
        )}
      </div>
      <p className="text-xl font-black text-foreground leading-none">{value}</p>
      <p className="text-[11px] text-muted-foreground font-medium mt-1.5">{title}</p>
      {subtitle && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{subtitle}</p>}
    </div>
  </div>
);

const ChartCard: React.FC<{ title: string; icon: React.ElementType; children: React.ReactNode; className?: string }> = ({ title, icon: Icon, children, className = "" }) => (
  <div className={`rounded-2xl border border-border/30 bg-card/50 backdrop-blur-sm p-5 ${className}`}>
    <div className="flex items-center gap-2 mb-4">
      <Icon size={16} className="text-primary" />
      <h3 className="text-sm font-bold text-foreground">{title}</h3>
    </div>
    {children}
  </div>
);

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover/95 backdrop-blur-lg border border-border/50 rounded-xl p-3 shadow-xl text-xs" dir="rtl">
      <p className="font-bold text-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="flex justify-between gap-4">
          <span>{p.name}</span>
          <span className="font-bold" dir="ltr">{fmt(p.value)}</span>
        </p>
      ))}
    </div>
  );
};

export const DashboardPage: React.FC = () => {
  const { auth } = useAuth();
  const navigate = useNavigate();
  const [locationType, setLocationType] = useState<"branch" | "warehouse">("branch");
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("all");

  const companyId = auth.profile?.company_id;

  const { data: branches = [] } = useQuery({
    queryKey: ["dashboard-branches-list", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("branches").select("id, name, active").eq("company_id", companyId!);
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ["dashboard-warehouses-list", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("warehouses").select("id, name, active").eq("company_id", companyId!);
      return data || [];
    },
    enabled: !!companyId,
  });

  const filters = {
    branchId: locationType === "branch" && selectedBranch !== "all" ? selectedBranch : undefined,
    warehouseId: locationType === "warehouse" && selectedWarehouse !== "all" ? selectedWarehouse : undefined,
  };

  const d = useDashboardData(filters);

  // Use location-specific stock when a specific location is selected
  const selectedLocationId = filters.branchId || filters.warehouseId || null;
  const { stockMap } = useLocationStock(selectedLocationId, locationType);

  // Override stock-related KPIs with location-specific data
  const locationStockValue = useMemo(() => {
    if (!selectedLocationId || !d.stockItems) return d.stockValue;
    let total = 0;
    for (const item of d.stockItems) {
      if (!item.active) continue;
      const locQty = stockMap.get(item.id) || 0;
      total += Math.max(locQty, 0) * Number(item.avg_cost || 0);
    }
    return total;
  }, [selectedLocationId, d.stockItems, d.stockValue, stockMap]);

  const locationActiveItems = useMemo(() => {
    if (!selectedLocationId || !d.stockItems) return d.activeItems;
    return d.stockItems.filter(i => i.active && (stockMap.get(i.id) || 0) > 0).length;
  }, [selectedLocationId, d.stockItems, d.activeItems, stockMap]);

  const locationLowStockItems = useMemo(() => {
    if (!selectedLocationId || !d.stockItems) return d.lowStockItems;
    return d.stockItems.filter(i => {
      if (!i.active) return false;
      const locQty = stockMap.get(i.id) || 0;
      return locQty <= Number(i.min_level) && Number(i.min_level) > 0;
    });
  }, [selectedLocationId, d.stockItems, d.lowStockItems, stockMap]);

  const locationOverStockItems = useMemo(() => {
    if (!selectedLocationId || !d.stockItems) return d.overStockItems;
    return d.stockItems.filter(i => {
      if (!i.active) return false;
      const locQty = stockMap.get(i.id) || 0;
      return Number(i.max_level) > 0 && locQty > Number(i.max_level);
    });
  }, [selectedLocationId, d.stockItems, d.overStockItems, stockMap]);

  const quickActions = [
    { label: "فاتورة شراء", icon: ShoppingCart, color: "text-primary", path: "/purchases/add-invoice" },
    { label: "عملية إنتاج", icon: Factory, color: "text-success", path: "/production/add" },
    { label: "تحويل مخزون", icon: ArrowRightLeft, color: "text-warning", path: "/transfers/add" },
    { label: "تحليل التكاليف", icon: BarChart3, color: "text-secondary", path: "/costing" },
  ];

  return (
    <div className="space-y-5 animate-fade-in-up pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black text-foreground">
            مرحباً، {auth.profile?.full_name || "مستخدم"} 👋
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">لوحة التحكم — نظرة شاملة على جميع العمليات</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <Activity size={12} className="text-success animate-pulse" />
          <span>البيانات محدثة لحظياً</span>
        </div>
      </div>

      {/* Location Filter */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/30 bg-card/50 backdrop-blur-sm px-4 py-3">
        <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
          <MapPin size={14} className="text-primary" />
          <span>فلترة حسب الموقع</span>
        </div>
        <div className="flex items-center rounded-lg border border-border/30 overflow-hidden">
          <button
            onClick={() => { setLocationType("branch"); setSelectedWarehouse("all"); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${locationType === "branch" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50"}`}
          >
            <Building size={12} />
            الفروع
          </button>
          <button
            onClick={() => { setLocationType("warehouse"); setSelectedBranch("all"); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${locationType === "warehouse" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50"}`}
          >
            <Warehouse size={12} />
            المخازن
          </button>
        </div>
        {locationType === "branch" ? (
          <Select value={selectedBranch} onValueChange={setSelectedBranch}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue placeholder="جميع الفروع" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع الفروع</SelectItem>
              {branches.filter((b: any) => b.active).map((b: any) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue placeholder="جميع المخازن" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع المخازن</SelectItem>
              {warehouses.filter((w: any) => w.active).map((w: any) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {(selectedBranch !== "all" || selectedWarehouse !== "all") && (
          <button
            onClick={() => { setSelectedBranch("all"); setSelectedWarehouse("all"); }}
            className="text-[10px] text-destructive hover:underline"
          >
            إزالة الفلتر ✕
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard title="إجمالي المبيعات" value={fmtCurrency(d.totalSales)} icon={DollarSign} gradient="bg-primary text-primary" subtitle={`${d.salesCount} فاتورة`} />
        <KPICard title="إجمالي المشتريات" value={fmtCurrency(d.totalPurchases)} icon={ShoppingCart} gradient="bg-warning text-warning" subtitle={`${d.purchasesCount} فاتورة`} />
        <KPICard title="تكاليف الإنتاج" value={fmtCurrency(d.totalProduction)} icon={Factory} gradient="bg-success text-success" subtitle={`${d.productionCount} عملية`} />
        <KPICard title="الهالك" value={fmtCurrency(d.totalWaste)} icon={Trash2} gradient="bg-destructive text-destructive" subtitle={`${d.wasteCount} سجل`} />
        <KPICard title="التحويلات" value={fmtCurrency(d.totalTransfers)} icon={ArrowRightLeft} gradient="bg-accent text-accent" subtitle={`${d.transfersCount} تحويل`} />
        <KPICard title="قيمة المخزون" value={fmtCurrency(locationStockValue)} icon={Package} gradient="bg-secondary text-secondary" subtitle={`${locationActiveItems} صنف نشط`} />
      </div>

      {/* KPI Row 2 - Operational */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <div className="rounded-xl border border-border/20 bg-card/30 p-3 text-center">
          <p className="text-lg font-black text-foreground">{d.branchesCount}</p>
          <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><GitBranch size={10} />الفروع</p>
        </div>
        <div className="rounded-xl border border-border/20 bg-card/30 p-3 text-center">
          <p className="text-lg font-black text-foreground">{d.warehousesCount}</p>
          <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><Warehouse size={10} />المخازن</p>
        </div>
        <div className="rounded-xl border border-border/20 bg-card/30 p-3 text-center">
          <p className="text-lg font-black text-foreground">{d.suppliersCount}</p>
          <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><Users size={10} />الموردين</p>
        </div>
        <div className="rounded-xl border border-border/20 bg-card/30 p-3 text-center">
          <p className="text-lg font-black text-foreground">{d.stocktakesCount}</p>
          <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><ClipboardCheck size={10} />الجرد</p>
        </div>
        <div className="rounded-xl border border-border/20 bg-card/30 p-3 text-center">
          <p className="text-lg font-black text-foreground">{d.costAdjCount}</p>
          <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><Target size={10} />تسويات</p>
        </div>
        <div className="rounded-xl border border-border/20 bg-card/30 p-3 text-center">
          <p className={`text-lg font-black ${d.profitMargin >= 0 ? "text-success" : "text-destructive"}`}>{d.profitMargin.toFixed(1)}%</p>
          <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><TrendingUp size={10} />هامش الربح</p>
        </div>
        <div className="rounded-xl border border-border/20 bg-card/30 p-3 text-center">
          <p className="text-lg font-black text-warning">{locationLowStockItems.length}</p>
          <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><AlertTriangle size={10} />نقص مخزون</p>
        </div>
        <div className="rounded-xl border border-border/20 bg-card/30 p-3 text-center">
          <p className="text-lg font-black text-accent">{locationOverStockItems.length}</p>
          <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><TrendingDown size={10} />فائض مخزون</p>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Area chart - Sales vs Purchases */}
        <ChartCard
          title="المبيعات مقابل المشتريات (6 أشهر)"
          icon={TrendingUp}
          className="lg:col-span-2"
        >
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart
              data={d.monthlyData}
              margin={{ left: 70 }} // 👈 عشان يعوض dx = -70 وما يحصلش قص
            >
              <defs>
                <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(199, 89%, 60%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(199, 89%, 60%)" stopOpacity={0} />
                </linearGradient>

                <linearGradient id="purchGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(38, 92%, 55%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(38, 92%, 55%)" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(217, 33%, 18%)"
              />

              <XAxis
                dataKey="month"
                tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 10 }}
              />

              <YAxis
                width={80}
                dx={-35}
                tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 10 }}
              />

              <Tooltip content={<CustomTooltip />} />

              <Area
                type="monotone"
                dataKey="sales"
                name="المبيعات"
                stroke="hsl(199, 89%, 60%)"
                fill="url(#salesGrad)"
                strokeWidth={2}
              />

              <Area
                type="monotone"
                dataKey="purchases"
                name="المشتريات"
                stroke="hsl(38, 92%, 55%)"
                fill="url(#purchGrad)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Radar chart */}
        <ChartCard title="توزيع العمليات" icon={Activity}>
          <ResponsiveContainer width="100%" height={240}>
            <RadarChart data={d.operationsRadar}>
              <PolarGrid stroke="hsl(217, 33%, 18%)" />
              <PolarAngleAxis dataKey="metric" tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 9 }} />
              <PolarRadiusAxis tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 8 }} />
              <Radar name="العمليات" dataKey="value" stroke="hsl(199, 89%, 60%)" fill="hsl(199, 89%, 60%)" fillOpacity={0.2} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Bar chart - Production & Waste */}
        <ChartCard title="الإنتاج والهالك الشهري" icon={BarChart3} className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={d.monthlyData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(217, 33%, 18%)" />
              <XAxis dataKey="month" tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 10 }} />
              <YAxis tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="production" name="الإنتاج" fill="hsl(145, 65%, 45%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="waste" name="الهالك" fill="hsl(0, 70%, 55%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Pie chart */}
        <ChartCard title="حالة فواتير الشراء" icon={PieChart}>
          <ResponsiveContainer width="100%" height={220}>
            <RePieChart>
              <Pie
                data={
                  d.purchaseStatusDist.length > 0
                    ? d.purchaseStatusDist
                    : [{ name: "لا توجد بيانات", value: 1 }]
                }
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
                labelLine={true}
                label={({ cx, cy, midAngle, outerRadius, percent, name }) => {
                  const RADIAN = Math.PI / 180;
                  const radius = outerRadius + 50; // 👈 المسافة بين النص والدايرة
                  const x = cx + radius * Math.cos(-midAngle * RADIAN);
                  const y = cy + radius * Math.sin(-midAngle * RADIAN);

                  return (
                    <text
                      x={x}
                      y={y}
                      fill="#9ca3af"
                      textAnchor="middle"
                      dominantBaseline="central"
                      style={{ fontSize: "14px" }}
                    >
                      {name} {(percent * 100).toFixed(0)}%
                    </text>
                  );
                }}
              >
                {(d.purchaseStatusDist.length > 0
                  ? d.purchaseStatusDist
                  : [{ name: "لا توجد بيانات", value: 1 }]
                ).map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>

              <Tooltip />
            </RePieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts Row 3 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Line chart - All trends */}
        <ChartCard title="مؤشرات الأداء الشهرية" icon={Zap}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={d.monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(217, 33%, 18%)" />
              <XAxis dataKey="month" tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 10 }} />
              <YAxis tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="sales" name="المبيعات" stroke={COLORS[0]} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="purchases" name="المشتريات" stroke={COLORS[4]} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="production" name="الإنتاج" stroke={COLORS[3]} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="waste" name="الهالك" stroke={COLORS[5]} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Top suppliers bar */}
        <ChartCard title="أكبر 5 موردين" icon={Users}>
          {d.topSuppliers.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={d.topSuppliers} layout="vertical" barSize={16}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217, 33%, 18%)" />
                <XAxis type="number" tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 10 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{
                    fill: "hsl(215, 20%, 55%)",
                    fontSize: 10
                  }}
                  tickMargin={10}
                  dx={-85}
                />                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total" name="المبلغ" fill="hsl(260, 60%, 50%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-muted-foreground text-xs">لا توجد بيانات موردين</div>
          )}
        </ChartCard>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Quick Actions */}
        <div className="rounded-2xl border border-border/30 bg-card/50 backdrop-blur-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={16} className="text-primary" />
            <h3 className="text-sm font-bold text-foreground">إجراءات سريعة</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {quickActions.map((a) => (
              <button
                key={a.label}
                onClick={() => navigate(a.path)}
                className="flex flex-col items-center gap-2 p-4 rounded-xl hover:bg-muted/30 border border-transparent hover:border-border/30 transition-all"
              >
                <a.icon size={18} className={a.color} />
                <span className="text-[10px] font-medium text-muted-foreground">{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Low Stock Alert */}
        <div className="rounded-2xl border border-border/30 bg-card/50 backdrop-blur-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={16} className="text-warning" />
            <h3 className="text-sm font-bold text-foreground">تنبيهات نقص المخزون</h3>
          </div>
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {locationLowStockItems.length > 0 ? locationLowStockItems.slice(0, 6).map((item) => (
              <div key={item.id} className="flex items-center justify-between p-2.5 rounded-lg bg-warning/5 border border-warning/10">
                <span className="text-xs font-medium text-foreground truncate flex-1">{item.name}</span>
                <div className="text-[10px] text-warning font-bold mr-2">
                  {(selectedLocationId ? (stockMap.get(item.id) || 0) : Number(item.current_stock)).toLocaleString("en-US")} / {Number(item.min_level).toLocaleString("en-US")}
                </div>
              </div>
            )) : (
              <div className="text-center text-xs text-muted-foreground py-8">لا توجد تنبيهات ✓</div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="rounded-2xl border border-border/30 bg-card/50 backdrop-blur-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={16} className="text-accent" />
            <h3 className="text-sm font-bold text-foreground">آخر العمليات</h3>
          </div>
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {d.recentActivity.length > 0 ? d.recentActivity.map((a, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/20 transition-colors">
                <div className={`w-1.5 h-1.5 rounded-full ${a.type === "purchase" ? "bg-warning" : a.type === "production" ? "bg-success" : "bg-accent"
                  }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-foreground truncate">{a.label}</p>
                  <p className="text-[9px] text-muted-foreground">{a.date}</p>
                </div>
                {a.amount && <span className="text-[10px] font-bold text-muted-foreground" dir="ltr">{fmt(a.amount)}</span>}
              </div>
            )) : (
              <div className="text-center text-xs text-muted-foreground py-8">لا توجد عمليات حديثة</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
