import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Receipt, DollarSign, TrendingUp, Clock, Layers } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

interface PosDailyStatsProps {
  companyId: string;
  branchId: string;
}

export const PosDailyStats: React.FC<PosDailyStatsProps> = ({ companyId, branchId }) => {
  const [viewMode, setViewMode] = useState<string>("current-shift");

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
  });

  const currentShift = todayShifts?.find((s: any) => s.status === "مفتوح") || null;
  const selectedShift = viewMode === "current-shift" ? currentShift
    : viewMode === "all-day" ? null
    : todayShifts?.find((s: any) => s.id === viewMode) || null;

  const dateFrom = viewMode === "all-day"
    ? (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); })()
    : selectedShift?.opened_at || null;

  const { data: stats } = useQuery({
    queryKey: ["pos-daily-stats", companyId, branchId, viewMode, selectedShift?.id, dateFrom],
    queryFn: async () => {
      let query = supabase
        .from("pos_sales")
        .select("total_amount, status, shift_id")
        .eq("company_id", companyId)
        .eq("status", "مكتمل");

      if (viewMode === "all-day") {
        // Use today's date range based on created_at for accuracy
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
        query = query.gte("created_at", todayStart.toISOString()).lte("created_at", todayEnd.toISOString());
      } else if (selectedShift?.id) {
        // Use exact shift_id for 100% accuracy
        query = query.eq("shift_id", selectedShift.id);
      } else {
        return { totalSales: 0, invoiceCount: 0, avgInvoice: 0 };
      }

      if (branchId) query = query.eq("branch_id", branchId);
      const { data, error } = await query;
      if (error) throw error;

      const totalSales = data?.reduce((s, r) => s + Number(r.total_amount || 0), 0) || 0;
      const invoiceCount = data?.length || 0;
      const avgInvoice = invoiceCount > 0 ? totalSales / invoiceCount : 0;
      return { totalSales, invoiceCount, avgInvoice };
    },
    enabled: !!companyId,
    refetchInterval: 10000,
  });

  const closedShifts = todayShifts?.filter((s: any) => s.status === "مغلق") || [];

  const items = [
    { icon: DollarSign, label: viewMode === "all-day" ? "إجمالي اليوم" : "مبيعات الشيفت", value: `${(stats?.totalSales || 0).toFixed(0)} EGP`, color: "text-primary" },
    { icon: Receipt, label: "عدد الفواتير", value: `${stats?.invoiceCount || 0}`, color: "text-accent" },
    { icon: TrendingUp, label: "متوسط الفاتورة", value: `${(stats?.avgInvoice || 0).toFixed(0)} EGP`, color: "text-secondary" },
  ];

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Select value={viewMode} onValueChange={setViewMode}>
        <SelectTrigger className="h-6 text-[10px] w-auto min-w-[120px] border-border/30">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="current-shift" className="text-[10px]">
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> الشيفت الحالي</span>
          </SelectItem>
          <SelectItem value="all-day" className="text-[10px]">
            <span className="flex items-center gap-1"><Layers className="h-3 w-3" /> إجمالي اليوم</span>
          </SelectItem>
          {closedShifts.map((s: any) => (
            <SelectItem key={s.id} value={s.id} className="text-[10px]">
              {s.shift_name || `شيفت ${format(new Date(s.opened_at), "HH:mm")}`} - {format(new Date(s.closed_at), "HH:mm")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <item.icon className={`h-3.5 w-3.5 ${item.color}`} />
          <span className="text-[11px] text-muted-foreground">{item.label}:</span>
          <span className="text-xs font-bold text-foreground">{item.value}</span>
        </div>
      ))}
    </div>
  );
};
