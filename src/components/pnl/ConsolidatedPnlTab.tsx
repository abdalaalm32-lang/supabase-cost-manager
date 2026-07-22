import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { CalendarIcon, TrendingUp, TrendingDown, DollarSign, Percent, Layers, Printer } from "lucide-react";

const fmt = (n: number) => (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v: number, base: number) => (base > 0 ? ((v / base) * 100).toFixed(2) + "%" : "0.00%");

export const ConsolidatedPnlTab: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;

  const [dateFrom, setDateFrom] = useState<Date>(startOfMonth(new Date()));
  const [dateTo, setDateTo] = useState<Date>(endOfMonth(new Date()));
  const dateFromStr = format(dateFrom, "yyyy-MM-dd");
  const dateToStr = format(dateTo, "yyyy-MM-dd");

  // Real POS sales (all branches)
  const { data: sales = [] } = useQuery({
    queryKey: ["cons-sales", companyId, dateFromStr, dateToStr],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase.from("pos_sales")
          .select("total_amount, tax_amount, discount_amount, discount_in_pnl")
          .eq("company_id", companyId!).eq("status", "مكتمل")
          .gte("date", `${dateFromStr}T00:00:00`).lte("date", `${dateToStr}T23:59:59`)
          .order("id").range(from, to)
      ),
    enabled: !!companyId,
  });

  // Purchases (company-wide)
  const { data: purchases = [] } = useQuery({
    queryKey: ["cons-purch", companyId, dateFromStr, dateToStr],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase.from("purchase_orders").select("total_amount")
          .eq("company_id", companyId!).eq("status", "مكتمل")
          .gte("date", dateFromStr).lte("date", dateToStr)
          .order("id").range(from, to)
      ),
    enabled: !!companyId,
  });

  // Internal transfer totals (to eliminate)
  const { data: transfers = [] } = useQuery({
    queryKey: ["cons-transfers", companyId, dateFromStr, dateToStr],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase.from("transfers").select("total_cost")
          .eq("company_id", companyId!).eq("status", "مكتمل")
          .gte("date", dateFromStr).lte("date", dateToStr)
          .order("id").range(from, to)
      ),
    enabled: !!companyId,
  });

  // Opening / closing stocktakes (company-wide)
  const { data: openingStk = [] } = useQuery({
    queryKey: ["cons-stk-open", companyId, dateFromStr],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase.from("stocktakes").select("branch_id, warehouse_id, date, total_actual_value")
          .eq("company_id", companyId!).eq("status", "مكتمل").neq("type", "فحص مخزون فوري")
          .lt("date", dateFromStr).order("date", { ascending: false }).range(from, to)
      ),
    enabled: !!companyId,
  });
  const { data: closingStk = [] } = useQuery({
    queryKey: ["cons-stk-close", companyId, dateFromStr, dateToStr],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase.from("stocktakes").select("branch_id, warehouse_id, date, total_actual_value")
          .eq("company_id", companyId!).eq("status", "مكتمل").neq("type", "فحص مخزون فوري")
          .gte("date", dateFromStr).lte("date", dateToStr).order("date", { ascending: false }).range(from, to)
      ),
    enabled: !!companyId,
  });

  // Waste
  const { data: waste = [] } = useQuery({
    queryKey: ["cons-waste", companyId, dateFromStr, dateToStr],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase.from("waste_records").select("total_cost")
          .eq("company_id", companyId!).eq("status", "مكتمل")
          .gte("date", dateFromStr).lte("date", dateToStr)
          .order("id").range(from, to)
      ),
    enabled: !!companyId,
  });

  const result = useMemo(() => {
    const grossSales = (sales || []).reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0);
    const taxAmount = (sales || []).reduce((s: number, r: any) => s + Number(r.tax_amount || 0), 0);
    const discountAmount = (sales || []).reduce(
      (s: number, r: any) => s + (r.discount_in_pnl === false ? 0 : Number(r.discount_amount || 0)), 0
    );
    const netSales = grossSales - taxAmount - discountAmount;
    const purchasesTotal = (purchases || []).reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0);
    const internalEliminated = (transfers || []).reduce((s: number, r: any) => s + Number(r.total_cost || 0), 0);

    const pickLatest = (rows: any[]) => {
      const map = new Map<string, any>();
      rows.forEach((r) => {
        const key = (r.warehouse_id || r.branch_id || "__none__") as string;
        const prev = map.get(key);
        if (!prev || String(r.date) > String(prev.date)) map.set(key, r);
      });
      let sum = 0;
      map.forEach((r) => (sum += Number(r.total_actual_value) || 0));
      return sum;
    };
    const openingStock = pickLatest(openingStk || []);
    const closingStock = pickLatest(closingStk || []);
    const totalCogs = openingStock + purchasesTotal - closingStock;
    const wasteCost = (waste || []).reduce((s: number, r: any) => s + Number(r.total_cost || 0), 0);
    const grossProfit = netSales - totalCogs;
    const grossProfitPct = netSales > 0 ? (grossProfit / netSales) * 100 : 0;
    const netProfit = grossProfit - wasteCost;
    const netProfitPct = netSales > 0 ? (netProfit / netSales) * 100 : 0;

    return { grossSales, taxAmount, discountAmount, netSales, purchasesTotal, internalEliminated, openingStock, closingStock, totalCogs, wasteCost, grossProfit, grossProfitPct, netProfit, netProfitPct };
  }, [sales, purchases, transfers, openingStk, closingStk, waste]);

  const kpis = [
    { title: "المبيعات الحقيقية (Net)", value: fmt(result.netSales), icon: DollarSign, color: "from-blue-500/20 to-blue-600/10 border-blue-500/30", textColor: "text-blue-600" },
    { title: "COGS بعد الاستبعاد", value: fmt(result.totalCogs), icon: Percent, color: "from-amber-500/20 to-amber-600/10 border-amber-500/30", textColor: "text-amber-600" },
    { title: "المعاملات الداخلية المستبعدة", value: fmt(result.internalEliminated), icon: Layers, color: "from-purple-500/20 to-purple-600/10 border-purple-500/30", textColor: "text-purple-600" },
    { title: "صافي ربح الشركة", value: fmt(result.netProfit), icon: result.netProfit >= 0 ? TrendingUp : TrendingDown, color: result.netProfit >= 0 ? "from-green-500/20 to-green-600/10 border-green-500/30" : "from-red-500/20 to-red-600/10 border-red-500/30", textColor: result.netProfit >= 0 ? "text-green-600" : "text-red-600" },
  ];

  return (
    <div className="space-y-5" dir="rtl">
      <Card className="print:hidden">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">من</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-36 justify-start text-xs">
                    <CalendarIcon className="h-3.5 w-3.5 ml-1" />{format(dateFrom, "yyyy/MM/dd")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={dateFrom} onSelect={(d) => d && setDateFrom(d)} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">إلى</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-36 justify-start text-xs">
                    <CalendarIcon className="h-3.5 w-3.5 ml-1" />{format(dateTo, "yyyy/MM/dd")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={dateTo} onSelect={(d) => d && setDateTo(d)} />
                </PopoverContent>
              </Popover>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4 ml-1" /> طباعة
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((k, i) => (
          <Card key={i} className={`bg-gradient-to-br ${k.color} border`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">{k.title}</span>
                <k.icon className={`h-5 w-5 ${k.textColor}`} />
              </div>
              <div className={`text-xl font-bold ${k.textColor}`}>{k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="font-bold flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" /> Consolidated P&L (بعد استبعاد المعاملات الداخلية)
            </h2>
            <Badge variant="outline" className="text-xs">
              تم استبعاد {fmt(result.internalEliminated)} ج.م تحويلات داخلية
            </Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b"><td className="p-3">إجمالي المبيعات للعملاء</td><td className="p-3 text-left tabular-nums">{fmt(result.grossSales)}</td><td className="p-3 text-left text-xs">{pct(result.grossSales, result.netSales)}</td></tr>
                <tr className="border-b"><td className="p-3 pr-8">(-) ضريبة المبيعات</td><td className="p-3 text-left tabular-nums">{fmt(result.taxAmount)}</td><td className="p-3"></td></tr>
                <tr className="border-b"><td className="p-3 pr-8">(-) خصم المبيعات</td><td className="p-3 text-left tabular-nums">{fmt(result.discountAmount)}</td><td className="p-3"></td></tr>
                <tr className="bg-muted/40 font-semibold border-b"><td className="p-3">صافي المبيعات الحقيقية</td><td className="p-3 text-left tabular-nums">{fmt(result.netSales)}</td><td className="p-3 text-left text-xs">100%</td></tr>

                <tr><td colSpan={3} className="h-1 bg-muted/30"></td></tr>
                <tr className="bg-muted/20 font-semibold text-primary border-b"><td className="p-3">COGS (الخامات الأصلية بعد الاستبعاد)</td><td className="p-3"></td><td className="p-3"></td></tr>
                <tr className="border-b"><td className="p-3 pr-8">جرد أول المدة</td><td className="p-3 text-left tabular-nums">{fmt(result.openingStock)}</td><td className="p-3"></td></tr>
                <tr className="border-b"><td className="p-3 pr-8">(+) المشتريات</td><td className="p-3 text-left tabular-nums">{fmt(result.purchasesTotal)}</td><td className="p-3"></td></tr>
                <tr className="border-b"><td className="p-3 pr-8">(-) جرد آخر المدة</td><td className="p-3 text-left tabular-nums">({fmt(result.closingStock)})</td><td className="p-3"></td></tr>
                <tr className="bg-muted/40 font-semibold border-b"><td className="p-3">إجمالي COGS</td><td className="p-3 text-left tabular-nums">{fmt(result.totalCogs)}</td><td className="p-3 text-left text-xs">{pct(result.totalCogs, result.netSales)}</td></tr>

                <tr><td colSpan={3} className="h-1 bg-muted/30"></td></tr>
                <tr className="bg-primary/5 font-bold border-b"><td className="p-3">مجمل الربح</td><td className={`p-3 text-left tabular-nums ${result.grossProfit < 0 ? "text-destructive" : ""}`}>{fmt(result.grossProfit)}</td><td className="p-3 text-left text-xs">{result.grossProfitPct.toFixed(2)}%</td></tr>

                {result.wasteCost > 0 && (
                  <>
                    <tr className="border-b"><td className="p-3 pr-8">(-) الفاقد والإهلاك</td><td className="p-3 text-left tabular-nums">{fmt(result.wasteCost)}</td><td className="p-3"></td></tr>
                  </>
                )}
                <tr><td colSpan={3} className="h-1 bg-muted/30"></td></tr>
                <tr className={`font-bold border-b ${result.netProfit >= 0 ? "bg-green-500/10" : "bg-red-500/10"}`}>
                  <td className="p-3">صافي الربح المجمّع</td>
                  <td className={`p-3 text-left tabular-nums ${result.netProfit < 0 ? "text-destructive" : "text-emerald-600"}`}>{fmt(result.netProfit)}</td>
                  <td className="p-3 text-left text-xs">{result.netProfitPct.toFixed(2)}%</td>
                </tr>

                <tr><td colSpan={3} className="h-1 bg-muted/30"></td></tr>
                <tr className="text-xs text-muted-foreground">
                  <td colSpan={3} className="p-3 leading-relaxed">
                    <b>ملاحظة:</b> تم استبعاد جميع فواتير التوريد الداخلية من المخزن للفروع (Internal Sales) وتم اعتبار المشتريات الحقيقية للخامات الأصلية فقط دون المرور بالمخزن. المصاريف التشغيلية للفروع والمخزن تُضاف تفصيلياً من تبويبات Branch P&L و Warehouse P&L.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
