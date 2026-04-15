import React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Receipt, DollarSign, ShoppingBag, TrendingUp } from "lucide-react";

interface PosDailyStatsProps {
  companyId: string;
  branchId: string;
}

export const PosDailyStats: React.FC<PosDailyStatsProps> = ({ companyId, branchId }) => {
  const today = new Date().toISOString().split("T")[0];

  const { data: stats } = useQuery({
    queryKey: ["pos-daily-stats", companyId, branchId, today],
    queryFn: async () => {
      let query = supabase
        .from("pos_sales")
        .select("total_amount, status")
        .eq("company_id", companyId)
        .eq("status", "مكتمل")
        .gte("date", `${today}T00:00:00`)
        .lte("date", `${today}T23:59:59`);
      if (branchId) query = query.eq("branch_id", branchId);
      const { data, error } = await query;
      if (error) throw error;

      const totalSales = data?.reduce((s, r) => s + r.total_amount, 0) || 0;
      const invoiceCount = data?.length || 0;
      const avgInvoice = invoiceCount > 0 ? totalSales / invoiceCount : 0;
      return { totalSales, invoiceCount, avgInvoice };
    },
    enabled: !!companyId,
    refetchInterval: 30000,
  });

  const items = [
    { icon: DollarSign, label: "مبيعات اليوم", value: `${(stats?.totalSales || 0).toFixed(0)} EGP`, color: "text-primary" },
    { icon: Receipt, label: "عدد الفواتير", value: `${stats?.invoiceCount || 0}`, color: "text-accent" },
    { icon: TrendingUp, label: "متوسط الفاتورة", value: `${(stats?.avgInvoice || 0).toFixed(0)} EGP`, color: "text-secondary" },
  ];

  return (
    <div className="flex items-center gap-4">
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
