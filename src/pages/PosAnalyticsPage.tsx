import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CalendarIcon, TrendingUp, FileText, DollarSign, Store } from "lucide-react";

export const PosAnalyticsPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const queryClient = useQueryClient();

  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  // Realtime subscriptions
  useEffect(() => {
    const channel = supabase
      .channel("analytics-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "pos_sales" }, () => {
        queryClient.invalidateQueries({ queryKey: ["analytics-sales"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "pos_sale_items" }, () => {
        queryClient.invalidateQueries({ queryKey: ["analytics-sales"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "pos_items" }, () => {
        queryClient.invalidateQueries({ queryKey: ["pos-items-active"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, () => {
        queryClient.invalidateQueries({ queryKey: ["pos-categories-active"] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data: branches } = useQuery({
    queryKey: ["branches", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").eq("company_id", companyId!).eq("active", true);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: sales } = useQuery({
    queryKey: ["analytics-sales", companyId, branchFilter, dateFrom?.toISOString(), dateTo?.toISOString()],
    queryFn: async () => {
      let query = supabase.from("pos_sales").select("*, branches:branch_id(name)").eq("company_id", companyId!).eq("status", "مكتمل");
      if (branchFilter !== "all") query = query.eq("branch_id", branchFilter);
      if (dateFrom) query = query.gte("date", dateFrom.toISOString());
      if (dateTo) {
        const endOfDay = new Date(dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.lte("date", endOfDay.toISOString());
      }
      query = query.order("created_at", { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const stats = useMemo(() => {
    if (!sales || sales.length === 0) return { totalSales: 0, invoiceCount: 0, avgInvoice: 0 };
    const totalSales = sales.reduce((s, sale) => s + Number(sale.total_amount), 0);
    const invoiceCount = sales.length;
    const avgInvoice = totalSales / invoiceCount;
    return { totalSales, invoiceCount, avgInvoice };
  }, [sales]);

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
            <Button variant="ghost" size="sm" onClick={() => { setBranchFilter("all"); setDateFrom(undefined); setDateTo(undefined); }}>
              مسح الفلاتر
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="glass-card border-border/50">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">إجمالي المبيعات</p>
              <p className="text-2xl font-black text-foreground">{stats.totalSales.toFixed(2)} <span className="text-sm font-normal text-muted-foreground">EGP</span></p>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-border/50">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
              <FileText className="h-6 w-6 text-accent" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">عدد الفواتير</p>
              <p className="text-2xl font-black text-foreground">{stats.invoiceCount}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-border/50">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center shrink-0">
              <DollarSign className="h-6 w-6 text-secondary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">متوسط سعر الفاتورة</p>
              <p className="text-2xl font-black text-foreground">{stats.avgInvoice.toFixed(2)} <span className="text-sm font-normal text-muted-foreground">EGP</span></p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
