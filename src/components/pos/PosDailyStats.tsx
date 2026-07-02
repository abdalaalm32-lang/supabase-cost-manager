import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Receipt, DollarSign, TrendingUp, Clock, Layers, RotateCcw, Wallet, CreditCard, Package, RefreshCw, Smartphone } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface PosDailyStatsProps {
  companyId: string;
  branchId: string;
}

export const PosDailyStats: React.FC<PosDailyStatsProps> = ({ companyId, branchId }) => {
  const [viewMode, setViewMode] = useState<string>("current-shift");
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const queryClient = useQueryClient();

  // Get today's shifts (open + closed)
  const { data: todayShifts } = useQuery({
    queryKey: ["pos-today-shifts", companyId, branchId],
    queryFn: async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      let query = supabase
        .from("pos_shifts")
        .select("*")
        .eq("company_id", companyId)
        .gte("opened_at", todayStart.toISOString())
        .order("opened_at", { ascending: false });
      if (branchId) query = query.eq("branch_id", branchId);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    refetchInterval: 5000,
  });

  const currentShift = todayShifts?.find((s: any) => s.status === "مفتوح") || null;
  const selectedShift = viewMode === "current-shift" ? currentShift
    : viewMode === "all-day" ? null
    : todayShifts?.find((s: any) => s.id === viewMode) || null;

  const { data: stats } = useQuery({
    queryKey: ["pos-daily-stats-v2", companyId, branchId, viewMode, selectedShift?.id, selectedShift?.opened_at, selectedShift?.closed_at],
    queryFn: async () => {
      const empty = { totalSales: 0, invoiceCount: 0, avgInvoice: 0, itemsCount: 0, cashSales: 0, visaSales: 0, instapaySales: 0, returnsCash: 0, returnsVisa: 0, returnsInstapay: 0, returnsTotal: 0, netSales: 0 };

      // Build sales query
      let salesQuery = supabase
        .from("pos_sales")
        .select("id, total_amount, payment_method, status, shift_id, created_at")
        .eq("company_id", companyId)
        .eq("status", "مكتمل");

      let returnsQuery = supabase
        .from("pos_returns")
        .select("id, total_amount, payment_method, shift_id, created_at")
        .eq("company_id", companyId);

      if (viewMode === "all-day") {
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
        salesQuery = salesQuery.gte("created_at", todayStart.toISOString()).lte("created_at", todayEnd.toISOString());
        returnsQuery = returnsQuery.gte("created_at", todayStart.toISOString()).lte("created_at", todayEnd.toISOString());
      } else if (selectedShift?.id) {
        // PRIMARY: by shift_id; FALLBACK: by time-range with shift_id IS NULL
        const shiftStart = selectedShift.opened_at;
        const shiftEnd = selectedShift.closed_at || new Date().toISOString();

        // Fetch by shift_id
        const byShift = await supabase
          .from("pos_sales")
          .select("id, total_amount, payment_method, status")
          .eq("company_id", companyId)
          .eq("status", "مكتمل")
          .eq("shift_id", selectedShift.id)
          .then(r => (branchId ? r : r));

        // Fetch fallback (no shift_id, in time range) — for legacy invoices
        let fbQuery = supabase
          .from("pos_sales")
          .select("id, total_amount, payment_method, status")
          .eq("company_id", companyId)
          .eq("status", "مكتمل")
          .is("shift_id", null)
          .gte("created_at", shiftStart)
          .lte("created_at", shiftEnd);
        if (branchId) fbQuery = fbQuery.eq("branch_id", branchId);
        const fb = await fbQuery;

        const salesData = [...(byShift.data || []), ...(fb.data || [])];

        // Returns by shift_id + fallback
        const retByShift = await supabase
          .from("pos_returns")
          .select("id, total_amount, payment_method")
          .eq("company_id", companyId)
          .eq("shift_id", selectedShift.id);

        let retFbQuery = supabase
          .from("pos_returns")
          .select("id, total_amount, payment_method")
          .eq("company_id", companyId)
          .is("shift_id", null)
          .gte("created_at", shiftStart)
          .lte("created_at", shiftEnd);
        if (branchId) retFbQuery = retFbQuery.eq("branch_id", branchId);
        const retFb = await retFbQuery;

        const returnsData = [...(retByShift.data || []), ...(retFb.data || [])];

        // Items count
        const saleIds = salesData.map((s: any) => s.id);
        let itemsCount = 0;
        if (saleIds.length > 0) {
          const { data: items } = await supabase
            .from("pos_sale_items")
            .select("quantity")
            .in("sale_id", saleIds);
          itemsCount = (items || []).reduce((s: number, r: any) => s + Number(r.quantity || 0), 0);
        }

        return calcStats(salesData, returnsData, itemsCount);
      } else {
        return empty;
      }

      // For all-day: branch filter + execute
      if (branchId) {
        salesQuery = salesQuery.eq("branch_id", branchId);
        returnsQuery = returnsQuery.eq("branch_id", branchId);
      }
      const [salesRes, returnsRes] = await Promise.all([salesQuery, returnsQuery]);
      if (salesRes.error) throw salesRes.error;
      if (returnsRes.error) throw returnsRes.error;

      const saleIds = (salesRes.data || []).map((s: any) => s.id);
      let itemsCount = 0;
      if (saleIds.length > 0) {
        const { data: items } = await supabase
          .from("pos_sale_items")
          .select("quantity")
          .in("sale_id", saleIds);
        itemsCount = (items || []).reduce((s: number, r: any) => s + Number(r.quantity || 0), 0);
      }

      return calcStats(salesRes.data || [], returnsRes.data || [], itemsCount);
    },
    enabled: !!companyId,
    refetchInterval: 5000,
  });

  // Realtime subscription
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`pos-stats-${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pos_sales", filter: `company_id=eq.${companyId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["pos-daily-stats-v2"] });
        setLastUpdate(new Date());
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "pos_returns", filter: `company_id=eq.${companyId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["pos-daily-stats-v2"] });
        setLastUpdate(new Date());
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId, queryClient]);

  useEffect(() => { if (stats) setLastUpdate(new Date()); }, [stats]);

  const closedShifts = todayShifts?.filter((s: any) => s.status === "مغلق") || [];

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["pos-daily-stats-v2"] });
    queryClient.invalidateQueries({ queryKey: ["pos-today-shifts"] });
    setLastUpdate(new Date());
  };

  const items = [
    { icon: DollarSign, label: viewMode === "all-day" ? "إجمالي اليوم" : "إجمالي الشيفت", value: `${(stats?.totalSales || 0).toFixed(0)}`, suffix: "EGP", tone: "primary" },
    { icon: RotateCcw, label: "المرتجعات", value: `${(stats?.returnsTotal || 0).toFixed(0)}`, suffix: "EGP", tone: "destructive" },
    { icon: TrendingUp, label: "صافي المبيعات", value: `${(stats?.netSales || 0).toFixed(0)}`, suffix: "EGP", tone: "emerald" },
    { icon: Receipt, label: "الفواتير", value: `${stats?.invoiceCount || 0}`, suffix: "", tone: "accent" },
    { icon: Package, label: "الأصناف", value: `${(stats?.itemsCount || 0).toFixed(0)}`, suffix: "", tone: "violet" },
    { icon: TrendingUp, label: "متوسط الفاتورة", value: `${(stats?.avgInvoice || 0).toFixed(0)}`, suffix: "EGP", tone: "secondary" },
    { icon: Wallet, label: "كاش", value: `${(stats?.cashSales || 0).toFixed(0)}`, suffix: "EGP", tone: "emerald" },
    { icon: CreditCard, label: "فيزا", value: `${(stats?.visaSales || 0).toFixed(0)}`, suffix: "EGP", tone: "blue" },
    { icon: Smartphone, label: "انستا باي", value: `${(stats?.instapaySales || 0).toFixed(0)}`, suffix: "EGP", tone: "violet" },
  ];

  const toneStyles: Record<string, { bg: string; text: string; ring: string }> = {
    primary:     { bg: "bg-primary/10",       text: "text-primary",             ring: "ring-primary/20" },
    destructive: { bg: "bg-destructive/10",   text: "text-destructive",         ring: "ring-destructive/20" },
    emerald:     { bg: "bg-emerald-500/10",   text: "text-emerald-500",         ring: "ring-emerald-500/20" },
    accent:      { bg: "bg-accent/20",        text: "text-accent-foreground",   ring: "ring-accent/30" },
    violet:      { bg: "bg-violet-500/10",    text: "text-violet-400",          ring: "ring-violet-500/20" },
    secondary:   { bg: "bg-secondary/40",     text: "text-secondary-foreground",ring: "ring-border/30" },
    blue:        { bg: "bg-blue-500/10",      text: "text-blue-400",            ring: "ring-blue-500/20" },
  };

  return (
    <div className="flex items-center gap-2 flex-wrap w-full">
      <Select value={viewMode} onValueChange={setViewMode}>
        <SelectTrigger className="h-8 text-[11px] w-auto min-w-[140px] border-border/40 rounded-full bg-card/60">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="current-shift" className="text-xs">
            <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> الشيفت الحالي</span>
          </SelectItem>
          <SelectItem value="all-day" className="text-xs">
            <span className="flex items-center gap-1.5"><Layers className="h-3 w-3" /> إجمالي اليوم</span>
          </SelectItem>
          {closedShifts.map((s: any) => (
            <SelectItem key={s.id} value={s.id} className="text-xs">
              {s.shift_name || `شيفت ${format(new Date(s.opened_at), "HH:mm")}`} - {format(new Date(s.closed_at), "HH:mm")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {items.map((item, i) => {
        const t = toneStyles[item.tone] || toneStyles.primary;
        return (
          <div
            key={i}
            className={cn(
              "flex items-center gap-2 pl-3 pr-2 py-1 rounded-full bg-card/70 border border-border/40 ring-1 shadow-sm hover:shadow-md transition-shadow",
              t.ring
            )}
          >
            <span className={cn("flex items-center justify-center h-6 w-6 rounded-full", t.bg)}>
              <item.icon className={cn("h-3.5 w-3.5", t.text)} />
            </span>
            <div className="flex flex-col leading-none">
              <span className="text-[9px] text-muted-foreground">{item.label}</span>
              <span className="text-xs font-bold text-foreground">
                {item.value}
                {item.suffix && <span className="text-[9px] font-medium text-muted-foreground mr-0.5"> {item.suffix}</span>}
              </span>
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-1 mr-auto">
        <span className="text-[10px] text-muted-foreground" title={lastUpdate.toLocaleString()}>
          آخر تحديث: {format(lastUpdate, "HH:mm:ss")}
        </span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleRefresh} title="تحديث الآن">
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
};


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
