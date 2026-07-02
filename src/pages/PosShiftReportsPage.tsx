import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format, startOfDay, endOfDay } from "date-fns";
import {
  CalendarIcon, Clock, Layers, Receipt, DollarSign, TrendingUp,
  RotateCcw, Wallet, CreditCard, Package, Smartphone, BarChart3,
} from "lucide-react";
import { ExportButtons } from "@/components/ExportButtons";
import { PrintButton } from "@/components/PrintButton";
import type { ExportColumn } from "@/lib/exportUtils";

export const PosShiftReportsPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;

  const [date, setDate] = useState<Date>(new Date());
  const [branchId, setBranchId] = useState<string>("all");
  const [shiftMode, setShiftMode] = useState<string>("all-day"); // all-day | <shiftId>

  const dayStart = useMemo(() => startOfDay(date).toISOString(), [date]);
  const dayEnd = useMemo(() => endOfDay(date).toISOString(), [date]);

  // ── Branches
  const { data: branches } = useQuery({
    queryKey: ["branches-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches").select("id, name").eq("company_id", companyId!).eq("active", true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  // ── Shifts of selected day
  const { data: dayShifts } = useQuery({
    queryKey: ["shift-reports-shifts", companyId, branchId, dayStart, dayEnd],
    queryFn: async () => {
      let q = supabase.from("pos_shifts").select("*")
        .eq("company_id", companyId!)
        .gte("opened_at", dayStart)
        .lte("opened_at", dayEnd)
        .order("opened_at", { ascending: true });
      if (branchId !== "all") q = q.eq("branch_id", branchId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  const selectedShift = shiftMode !== "all-day" ? dayShifts?.find((s: any) => s.id === shiftMode) : null;

  // ── Stats for the chosen scope
  const { data: stats, isLoading } = useQuery({
    queryKey: ["shift-report-stats", companyId, branchId, dayStart, dayEnd, shiftMode],
    queryFn: async () => {
      const empty = { totalSales: 0, invoiceCount: 0, avgInvoice: 0, itemsCount: 0, cashSales: 0, visaSales: 0, instapaySales: 0, returnsCash: 0, returnsVisa: 0, returnsInstapay: 0, returnsTotal: 0, netSales: 0 };

      let salesQ = supabase.from("pos_sales")
        .select("id, total_amount, payment_method, status, shift_id, created_at, branch_id")
        .eq("company_id", companyId!).eq("status", "مكتمل");
      let returnsQ = supabase.from("pos_returns")
        .select("id, total_amount, payment_method, shift_id, created_at, branch_id")
        .eq("company_id", companyId!);

      if (branchId !== "all") {
        salesQ = salesQ.eq("branch_id", branchId);
        returnsQ = returnsQ.eq("branch_id", branchId);
      }

      if (shiftMode === "all-day") {
        salesQ = salesQ.gte("created_at", dayStart).lte("created_at", dayEnd);
        returnsQ = returnsQ.gte("created_at", dayStart).lte("created_at", dayEnd);
        const [salesRes, retRes] = await Promise.all([salesQ, returnsQ]);
        if (salesRes.error) throw salesRes.error;
        if (retRes.error) throw retRes.error;
        const items = await countItems((salesRes.data || []).map((s: any) => s.id));
        return calcStats(salesRes.data || [], retRes.data || [], items);
      }

      if (!selectedShift) return empty;
      const shiftStart = selectedShift.opened_at;
      const shiftEnd = selectedShift.closed_at || new Date().toISOString();

      const byShiftSales = await salesQ.eq("shift_id", selectedShift.id);
      let fbSalesQ = supabase.from("pos_sales")
        .select("id, total_amount, payment_method, status, branch_id")
        .eq("company_id", companyId!).eq("status", "مكتمل")
        .is("shift_id", null).gte("created_at", shiftStart).lte("created_at", shiftEnd);
      if (branchId !== "all") fbSalesQ = fbSalesQ.eq("branch_id", branchId);
      const fbSales = await fbSalesQ;

      const salesData = [...(byShiftSales.data || []), ...(fbSales.data || [])];

      const byShiftRet = await returnsQ.eq("shift_id", selectedShift.id);
      let fbRetQ = supabase.from("pos_returns")
        .select("id, total_amount, payment_method, branch_id")
        .eq("company_id", companyId!).is("shift_id", null)
        .gte("created_at", shiftStart).lte("created_at", shiftEnd);
      if (branchId !== "all") fbRetQ = fbRetQ.eq("branch_id", branchId);
      const fbRet = await fbRetQ;

      const returnsData = [...(byShiftRet.data || []), ...(fbRet.data || [])];
      const items = await countItems(salesData.map((s: any) => s.id));
      return calcStats(salesData, returnsData, items);
    },
    enabled: !!companyId,
  });

  // Reset shift when day/branch changes if the selected shift no longer exists
  React.useEffect(() => {
    if (shiftMode !== "all-day" && dayShifts && !dayShifts.find((s: any) => s.id === shiftMode)) {
      setShiftMode("all-day");
    }
  }, [dayShifts, shiftMode]);

  // ── Export data (rows for tabular exports)
  const branchName = branchId === "all" ? "كل الفروع" : (branches?.find((b: any) => b.id === branchId)?.name || "—");
  const scopeLabel = shiftMode === "all-day"
    ? "إجمالي اليوم"
    : selectedShift
      ? `${selectedShift.shift_name || "شيفت"} — ${format(new Date(selectedShift.opened_at), "HH:mm")}${selectedShift.closed_at ? " → " + format(new Date(selectedShift.closed_at), "HH:mm") : " (مفتوح)"}`
      : "—";

  const exportColumns: ExportColumn[] = [
    { key: "label", label: "البيان" },
    { key: "value", label: "القيمة" },
  ];

  const exportRows = useMemo(() => {
    const s = stats || {} as any;
    return [
      { label: "إجمالي الشيفت", value: `${(s.totalSales || 0).toFixed(2)} EGP` },
      { label: "المرتجعات", value: `${(s.returnsTotal || 0).toFixed(2)} EGP` },
      { label: "صافي المبيعات", value: `${(s.netSales || 0).toFixed(2)} EGP` },
      { label: "عدد الفواتير", value: `${s.invoiceCount || 0}` },
      { label: "عدد الأصناف", value: `${(s.itemsCount || 0).toFixed(0)}` },
      { label: "متوسط الفاتورة", value: `${(s.avgInvoice || 0).toFixed(2)} EGP` },
      { label: "كاش", value: `${(s.cashSales || 0).toFixed(2)} EGP` },
      { label: "فيزا", value: `${(s.visaSales || 0).toFixed(2)} EGP` },
      { label: "انستا باي", value: `${(s.instapaySales || 0).toFixed(2)} EGP` },
      { label: "مرتجعات كاش", value: `${(s.returnsCash || 0).toFixed(2)} EGP` },
      { label: "مرتجعات فيزا", value: `${(s.returnsVisa || 0).toFixed(2)} EGP` },
      { label: "مرتجعات انستا باي", value: `${(s.returnsInstapay || 0).toFixed(2)} EGP` },
    ];
  }, [stats]);

  const filters = [
    { label: "التاريخ", value: format(date, "yyyy-MM-dd") },
    { label: "الفرع", value: branchName },
    { label: "النطاق", value: scopeLabel },
  ];
  const title = "تقرير الشيفت";
  const filename = `shift-report-${format(date, "yyyy-MM-dd")}`;

  // ── KPI cards config
  const kpis = [
    { icon: DollarSign, label: shiftMode === "all-day" ? "إجمالي اليوم" : "إجمالي الشيفت", value: stats?.totalSales, tone: "primary", suffix: "EGP" },
    { icon: RotateCcw, label: "المرتجعات", value: stats?.returnsTotal, tone: "destructive", suffix: "EGP" },
    { icon: TrendingUp, label: "صافي المبيعات", value: stats?.netSales, tone: "emerald", suffix: "EGP" },
    { icon: Receipt, label: "عدد الفواتير", value: stats?.invoiceCount, tone: "accent", suffix: "" },
    { icon: Package, label: "عدد الأصناف", value: stats?.itemsCount, tone: "violet", suffix: "" },
    { icon: BarChart3, label: "متوسط الفاتورة", value: stats?.avgInvoice, tone: "secondary", suffix: "EGP" },
    { icon: Wallet, label: "كاش", value: stats?.cashSales, tone: "emerald", suffix: "EGP" },
    { icon: CreditCard, label: "فيزا", value: stats?.visaSales, tone: "blue", suffix: "EGP" },
    { icon: Smartphone, label: "انستا باي", value: stats?.instapaySales, tone: "violet", suffix: "EGP" },
  ];

  const toneStyles: Record<string, { bg: string; text: string; ring: string }> = {
    primary: { bg: "bg-primary/10", text: "text-primary", ring: "ring-primary/20" },
    destructive: { bg: "bg-destructive/10", text: "text-destructive", ring: "ring-destructive/20" },
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-500", ring: "ring-emerald-500/20" },
    accent: { bg: "bg-accent/20", text: "text-accent-foreground", ring: "ring-accent/30" },
    violet: { bg: "bg-violet-500/10", text: "text-violet-400", ring: "ring-violet-500/20" },
    secondary: { bg: "bg-secondary/40", text: "text-secondary-foreground", ring: "ring-border/30" },
    blue: { bg: "bg-blue-500/10", text: "text-blue-400", ring: "ring-blue-500/20" },
  };

  return (
    <div className="p-4 md:p-6 space-y-4" dir="rtl">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Clock className="h-5 w-5 text-primary" />
                تقارير الشيفتات
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                تقرير كامل بأداء الشيفت أو اليوم — مبيعات، مرتجعات، ووسائل الدفع
              </p>
            </div>
            <div className="flex items-center gap-2">
              <PrintButton title={title} data={exportRows} columns={exportColumns} filters={filters} />
              <ExportButtons title={title} filename={filename} data={exportRows} columns={exportColumns} filters={filters} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 h-9">
                  <CalendarIcon className="h-4 w-4" />
                  {format(date, "yyyy-MM-dd")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} initialFocus className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>

            <Select value={branchId} onValueChange={(v) => setBranchId(v)}>
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue placeholder="اختر الفرع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الفروع</SelectItem>
                {(branches || []).map((b: any) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={shiftMode} onValueChange={setShiftMode}>
              <SelectTrigger className="h-9 w-[240px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-day">
                  <span className="flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" /> إجمالي اليوم</span>
                </SelectItem>
                {(dayShifts || []).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {(s.shift_name || `شيفت ${format(new Date(s.opened_at), "HH:mm")}`)}
                    {" — "}
                    {format(new Date(s.opened_at), "HH:mm")}
                    {s.closed_at ? ` → ${format(new Date(s.closed_at), "HH:mm")}` : " (مفتوح)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="font-normal">
                عدد الشيفتات: {dayShifts?.length || 0}
              </Badge>
              <Badge variant="outline" className="font-normal">{scopeLabel}</Badge>
            </div>
          </div>

          {/* KPI grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3 gap-3">
            {kpis.map((k, i) => {
              const t = toneStyles[k.tone] || toneStyles.primary;
              const raw = Number(k.value || 0);
              const display = k.suffix ? raw.toFixed(2) : raw.toFixed(0);
              return (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-3 p-4 rounded-xl bg-card border border-border/50 ring-1 shadow-sm hover:shadow-md transition-all",
                    t.ring
                  )}
                >
                  <span className={cn("flex items-center justify-center h-12 w-12 rounded-xl shrink-0", t.bg)}>
                    <k.icon className={cn("h-6 w-6", t.text)} />
                  </span>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs text-muted-foreground">{k.label}</span>
                    <span className="text-xl font-bold text-foreground truncate">
                      {isLoading ? "…" : display}
                      {k.suffix && <span className="text-xs font-medium text-muted-foreground mr-1">{k.suffix}</span>}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Split summary: sales vs returns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
            <Card className="border-emerald-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                  تفصيل المبيعات حسب طريقة الدفع
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <PayRow label="كاش" value={stats?.cashSales || 0} icon={Wallet} color="text-emerald-500" />
                <PayRow label="فيزا" value={stats?.visaSales || 0} icon={CreditCard} color="text-blue-400" />
                <PayRow label="انستا باي" value={stats?.instapaySales || 0} icon={Smartphone} color="text-violet-400" />
                <div className="pt-2 mt-2 border-t border-border/50 flex items-center justify-between font-bold">
                  <span>الإجمالي</span>
                  <span>{(stats?.totalSales || 0).toFixed(2)} EGP</span>
                </div>
              </CardContent>
            </Card>
            <Card className="border-destructive/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <RotateCcw className="h-4 w-4 text-destructive" />
                  تفصيل المرتجعات حسب طريقة الدفع
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <PayRow label="كاش" value={stats?.returnsCash || 0} icon={Wallet} color="text-emerald-500" />
                <PayRow label="فيزا" value={stats?.returnsVisa || 0} icon={CreditCard} color="text-blue-400" />
                <PayRow label="انستا باي" value={stats?.returnsInstapay || 0} icon={Smartphone} color="text-violet-400" />
                <div className="pt-2 mt-2 border-t border-border/50 flex items-center justify-between font-bold">
                  <span>الإجمالي</span>
                  <span>{(stats?.returnsTotal || 0).toFixed(2)} EGP</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const PayRow: React.FC<{ label: string; value: number; icon: React.ElementType; color: string }> = ({ label, value, icon: Icon, color }) => (
  <div className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/30 transition-colors">
    <span className="flex items-center gap-2 text-muted-foreground">
      <Icon className={cn("h-4 w-4", color)} />
      {label}
    </span>
    <span className="font-semibold">{value.toFixed(2)} EGP</span>
  </div>
);

async function countItems(saleIds: string[]): Promise<number> {
  if (!saleIds.length) return 0;
  const { data } = await supabase.from("pos_sale_items").select("quantity").in("sale_id", saleIds);
  return (data || []).reduce((s: number, r: any) => s + Number(r.quantity || 0), 0);
}

function calcStats(sales: any[], returns: any[], itemsCount: number) {
  const totalSales = sales.reduce((s, r) => s + Number(r.total_amount || 0), 0);
  const invoiceCount = sales.length;
  const avgInvoice = invoiceCount > 0 ? totalSales / invoiceCount : 0;
  const cashSales = sales.filter(s => s.payment_method === "كاش").reduce((s, r) => s + Number(r.total_amount || 0), 0);
  const visaSales = sales.filter(s => s.payment_method === "فيزا" || s.payment_method === "visa").reduce((s, r) => s + Number(r.total_amount || 0), 0);
  const instapaySales = sales.filter(s => s.payment_method === "انستا باي").reduce((s, r) => s + Number(r.total_amount || 0), 0);
  const returnsCash = returns.filter(r => r.payment_method === "كاش").reduce((s, r) => s + Number(r.total_amount || 0), 0);
  const returnsVisa = returns.filter(r => r.payment_method === "فيزا" || r.payment_method === "visa").reduce((s, r) => s + Number(r.total_amount || 0), 0);
  const returnsInstapay = returns.filter(r => r.payment_method === "انستا باي").reduce((s, r) => s + Number(r.total_amount || 0), 0);
  const returnsTotal = returns.reduce((s, r) => s + Number(r.total_amount || 0), 0);
  const netSales = totalSales - returnsTotal;
  return { totalSales, invoiceCount, avgInvoice, itemsCount, cashSales, visaSales, instapaySales, returnsCash, returnsVisa, returnsInstapay, returnsTotal, netSales };
}

export default PosShiftReportsPage;
