import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePnlData, IndirectExpenseItem } from "@/hooks/usePnlData";
import { Card, CardContent } from "@/components/ui/card";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, startOfQuarter, endOfQuarter } from "date-fns";
import { ar } from "date-fns/locale";
import {
  CalendarIcon, TrendingUp, TrendingDown, DollarSign, Percent, BarChart3,
  Plus, Trash2, Printer, FileSpreadsheet, FileText, Download, GitCompare, Building2,
} from "lucide-react";
import { exportToPDF, exportToExcel } from "@/lib/exportUtils";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const pct = (value: number, base: number) =>
  base > 0 ? ((value / base) * 100).toFixed(1) + "%" : "0.0%";

type Preset = "thisMonth" | "lastMonth" | "quarter" | "halfYear" | "year" | "custom";

const presetLabels: Record<Preset, string> = {
  thisMonth: "هذا الشهر",
  lastMonth: "الشهر الماضي",
  quarter: "ربع سنوي",
  halfYear: "نصف سنوي",
  year: "سنوي",
  custom: "مخصص",
};

function getPresetDates(preset: Preset): [Date, Date] {
  const now = new Date();
  switch (preset) {
    case "thisMonth": return [startOfMonth(now), endOfMonth(now)];
    case "lastMonth": {
      const prev = subMonths(now, 1);
      return [startOfMonth(prev), endOfMonth(prev)];
    }
    case "quarter": return [startOfQuarter(now), endOfQuarter(now)];
    case "halfYear": return [subMonths(startOfMonth(now), 5), endOfMonth(now)];
    case "year": return [startOfYear(now), endOfYear(now)];
    default: return [startOfMonth(now), endOfMonth(now)];
  }
}

export const PnlPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;

  // Filters
  const [preset, setPreset] = useState<Preset>("thisMonth");
  const [customFrom, setCustomFrom] = useState<Date>(startOfMonth(new Date()));
  const [customTo, setCustomTo] = useState<Date>(endOfMonth(new Date()));
  const [branchId, setBranchId] = useState("all");
  const [compareBranchId, setCompareBranchId] = useState<string>("");
  const [showComparison, setShowComparison] = useState(false);
  // Comparison mode: branch vs branch  OR period vs period (same branch)
  const [compareMode, setCompareMode] = useState<"branch" | "period">("branch");
  // Period comparison (when compareMode === "period")
  const [comparePreset, setComparePreset] = useState<Preset>("lastMonth");
  const [compareCustomFrom, setCompareCustomFrom] = useState<Date>(startOfMonth(subMonths(new Date(), 1)));
  const [compareCustomTo, setCompareCustomTo] = useState<Date>(endOfMonth(subMonths(new Date(), 1)));

  // Manual expenses
  const [manualExpenses, setManualExpenses] = useState<IndirectExpenseItem[]>([]);
  const [manualExpensesCompare, setManualExpensesCompare] = useState<IndirectExpenseItem[]>([]);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [newExpName, setNewExpName] = useState("");
  const [newExpAmount, setNewExpAmount] = useState("");
  const [addingForCompare, setAddingForCompare] = useState(false);

  // Overrides for auto expenses (from costing period): deleted names & amount edits
  const [deletedAutoExpenses, setDeletedAutoExpenses] = useState<Set<string>>(new Set());
  const [autoExpenseOverrides, setAutoExpenseOverrides] = useState<Record<string, number>>({});
  const [editingExpense, setEditingExpense] = useState<{ name: string; amount: number } | null>(null);

  // Dates
  const [dateFrom, dateTo] = useMemo(() => {
    if (preset === "custom") return [customFrom, customTo];
    return getPresetDates(preset);
  }, [preset, customFrom, customTo]);

  const [compareDateFrom, compareDateTo] = useMemo(() => {
    if (comparePreset === "custom") return [compareCustomFrom, compareCustomTo];
    return getPresetDates(comparePreset);
  }, [comparePreset, compareCustomFrom, compareCustomTo]);

  const dateFromStr = format(dateFrom, "yyyy-MM-dd");
  const dateToStr = format(dateTo, "yyyy-MM-dd");
  const compareDateFromStr = format(compareDateFrom, "yyyy-MM-dd");
  const compareDateToStr = format(compareDateTo, "yyyy-MM-dd");

  // Branches
  const { data: branches } = useQuery({
    queryKey: ["pnl-branches", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("branches")
        .select("id, name")
        .eq("company_id", companyId!)
        .eq("active", true);
      return data || [];
    },
    enabled: !!companyId,
  });

  // P&L data
  const pnl = usePnlData(dateFromStr, dateToStr, branchId, manualExpenses, deletedAutoExpenses, autoExpenseOverrides);
  const pnlCompare = usePnlData(
    dateFromStr,
    dateToStr,
    compareBranchId || "___none___",
    manualExpensesCompare
  );

  const addManualExpense = () => {
    if (!newExpName.trim() || !Number(newExpAmount)) return;
    const entry: IndirectExpenseItem = {
      name: newExpName.trim(),
      amount: Number(newExpAmount),
      isManual: true,
    };
    if (addingForCompare) {
      setManualExpensesCompare((prev) => [...prev, entry]);
    } else {
      setManualExpenses((prev) => [...prev, entry]);
    }
    setNewExpName("");
    setNewExpAmount("");
    setShowAddExpense(false);
  };

  const removeManualExpense = (index: number, isCompare = false) => {
    if (isCompare) {
      setManualExpensesCompare((prev) => prev.filter((_, i) => i !== index));
    } else {
      setManualExpenses((prev) => prev.filter((_, i) => i !== index));
    }
  };

  // Build P&L rows
  const buildRows = (d: typeof pnl) => {
    const rows: { label: string; amount: number; pctVal: string; type: "item" | "subtotal" | "total" | "header" | "separator"; indent?: boolean; expenseName?: string; isAutoExpense?: boolean }[] = [];
    rows.push({ label: "إجمالي المبيعات", amount: d.grossSales, pctVal: pct(d.grossSales, d.netSales), type: "item" });
    rows.push({ label: "(-) ضريبة المبيعات", amount: d.taxAmount, pctVal: pct(d.taxAmount, d.netSales), type: "item", indent: true });
    rows.push({ label: "(-) خصم المبيعات", amount: d.discountAmount, pctVal: pct(d.discountAmount, d.netSales), type: "item", indent: true });
    rows.push({ label: "صافي المبيعات", amount: d.netSales, pctVal: "100%", type: "subtotal" });
    rows.push({ label: "تكلفة البضاعة المباعة", amount: 0, pctVal: "", type: "header" });
    d.cogsByCategory.forEach((c) => {
      rows.push({ label: c.category, amount: c.amount, pctVal: pct(c.amount, d.netSales), type: "item", indent: true });
    });
    rows.push({ label: "إجمالي تكلفة البضاعة المباعة", amount: d.totalCogs, pctVal: pct(d.totalCogs, d.netSales), type: "subtotal" });
    rows.push({ label: "", amount: 0, pctVal: "", type: "separator" });
    rows.push({ label: "إجمالي الربح", amount: d.grossProfit, pctVal: pct(d.grossProfit, d.netSales), type: "total" });
    rows.push({ label: "", amount: 0, pctVal: "", type: "separator" });
    rows.push({ label: "المصاريف التشغيلية", amount: 0, pctVal: "", type: "header" });
    d.indirectExpenses.forEach((e) => {
      rows.push({ label: e.name + (e.isManual ? " ⚡" : ""), amount: e.amount, pctVal: pct(e.amount, d.netSales), type: "item", indent: true, expenseName: e.name, isAutoExpense: !e.isManual });
    });
    rows.push({ label: "إجمالي المصاريف التشغيلية", amount: d.totalIndirectExpenses, pctVal: pct(d.totalIndirectExpenses, d.netSales), type: "subtotal" });
    if (d.wasteCost > 0) {
      rows.push({ label: "", amount: 0, pctVal: "", type: "separator" });
      rows.push({ label: "الهالك والفاقد", amount: d.wasteCost, pctVal: pct(d.wasteCost, d.netSales), type: "item" });
    }
    rows.push({ label: "", amount: 0, pctVal: "", type: "separator" });
    rows.push({ label: "صافي الربح التشغيلي", amount: d.netProfit, pctVal: pct(d.netProfit, d.netSales), type: "total" });
    return rows;
  };

  const rows = buildRows(pnl);
  const compareRows = showComparison && compareBranchId ? buildRows(pnlCompare) : [];

  const getBranchName = (id: string) =>
    id === "all" ? "جميع الفروع" : branches?.find((b) => b.id === id)?.name || "";

  // Export
  const handlePrint = () => {
    const dateStr = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
    const logoSrc = `${window.location.origin}/logo.png`;
    const periodStr = `${format(dateFrom, "yyyy/MM/dd")} — ${format(dateTo, "yyyy/MM/dd")}`;
    const branchName = branchId !== "all" && branches ? getBranchName(branchId) : "جميع الفروع";

    let tableRows = "";
    rows.forEach((row) => {
      if (row.type === "separator") {
        tableRows += `<tr><td colspan="3" style="height:4px;background:#eee;"></td></tr>`;
        return;
      }
      const isTotal = row.type === "total";
      const isSubtotal = row.type === "subtotal";
      const isHeader = row.type === "header";
      const bg = isTotal ? "background:#f0f9ff;" : isSubtotal ? "background:#f5f5f5;" : isHeader ? "background:#fafafa;" : "";
      const fw = isTotal || isSubtotal || isHeader ? "font-weight:bold;" : "";
      const pl = row.indent ? "padding-right:30px;" : "";
      const color = isTotal && row.amount < 0 ? "color:red;" : isHeader ? "color:#2563eb;" : "";

      tableRows += `<tr style="${bg}">
        <td style="border:1px solid #ddd;padding:6px 10px;text-align:right;${fw}${pl}${color}font-size:11px;">${row.label}</td>
        <td style="border:1px solid #ddd;padding:6px 10px;text-align:left;${fw}${color}font-size:11px;font-variant-numeric:tabular-nums;">${isHeader ? "" : fmt(row.amount)}</td>
        <td style="border:1px solid #ddd;padding:6px 10px;text-align:left;font-size:10px;color:#666;">${row.pctVal}</td>
      </tr>`;
    });

    const printHTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>قائمة الأرباح والخسائر</title>
  <style>
    @font-face { font-family:'CairoLocal'; src:url('${window.location.origin}/fonts/Cairo-Regular.ttf') format('truetype'); }
    @font-face { font-family:'AmiriLocal'; src:url('${window.location.origin}/fonts/Amiri-Regular.ttf') format('truetype'); }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'CairoLocal','AmiriLocal',sans-serif; direction:rtl; padding:20px; color:#000; background:#fff; }
    @media print { @page { size:auto; margin:10mm; } body { padding:0; } }
    .header { text-align:center; margin-bottom:15px; border-bottom:1px solid #000; padding-bottom:10px; display:flex; align-items:center; justify-content:center; gap:10px; }
    .logo { width:80px; height:80px; object-fit:contain; }
    .header h1 { font-size:18px; font-weight:bold; margin-bottom:2px; }
    .header p { font-size:11px; }
    table { width:100%; border-collapse:collapse; }
    .kpi-row { display:flex; justify-content:space-around; margin-bottom:15px; gap:10px; }
    .kpi-box { border:1px solid #ddd; border-radius:8px; padding:10px 15px; text-align:center; flex:1; }
    .kpi-box .title { font-size:10px; color:#666; margin-bottom:4px; }
    .kpi-box .value { font-size:16px; font-weight:bold; }
    .footer { text-align:center; margin-top:15px; font-size:9px; border-top:1px solid #000; padding-top:8px; }
  </style>
</head>
<body>
  <div class="header">
    <img src="${logoSrc}" alt="Logo" class="logo" />
    <div>
      <h1>قائمة الأرباح والخسائر</h1>
      <p>${periodStr} • ${branchName} • ${dateStr}</p>
    </div>
  </div>
  <div class="kpi-row">
    <div class="kpi-box"><div class="title">صافي المبيعات</div><div class="value">${fmt(pnl.netSales)}</div></div>
    <div class="kpi-box"><div class="title">إجمالي الربح</div><div class="value">${fmt(pnl.grossProfit)} (${pnl.grossProfitPct.toFixed(1)}%)</div></div>
    <div class="kpi-box"><div class="title">صافي الربح</div><div class="value">${fmt(pnl.netProfit)} (${pnl.netProfitPct.toFixed(1)}%)</div></div>
    <div class="kpi-box"><div class="title">تكلفة البضاعة</div><div class="value">${fmt(pnl.totalCogs)}</div></div>
  </div>
  <table>
    <thead><tr style="background:#f0f0f0;">
      <th style="border:1px solid #ddd;padding:6px 10px;text-align:right;font-size:11px;">البند</th>
      <th style="border:1px solid #ddd;padding:6px 10px;text-align:left;font-size:11px;">المبلغ (ج.م)</th>
      <th style="border:1px solid #ddd;padding:6px 10px;text-align:left;font-size:11px;">النسبة</th>
    </tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
  <div class="footer">Powered by Mohamed Abdel Aal</div>
  <script>
    (async function(){try{if(document.fonts&&document.fonts.ready)await document.fonts.ready;}catch(e){}window.print();window.onafterprint=function(){window.close();};})();
  </script>
</body>
</html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(printHTML); w.document.close(); }
  };

  const handleExportPDF = () => {
    const exportData = rows
      .filter((r) => r.type !== "separator")
      .map((r) => ({
        label: r.type === "header" ? r.label : (r.indent ? "    " + r.label : r.label),
        amount: r.type === "header" ? "" : fmt(r.amount),
        pct: r.pctVal,
        __rowType: r.type === "total" ? "grand-total" : r.type === "subtotal" ? "group-total" : undefined,
      }));
    exportToPDF({
      title: `قائمة الأرباح والخسائر - ${format(dateFrom, "yyyy/MM/dd")} إلى ${format(dateTo, "yyyy/MM/dd")}`,
      filename: `PnL_${dateFromStr}_${dateToStr}`,
      columns: [
        { key: "label", label: "البند" },
        { key: "amount", label: "المبلغ (ج.م)" },
        { key: "pct", label: "النسبة" },
      ],
      data: exportData,
    });
  };

  const handleExportExcel = () => {
    const exportData = rows
      .filter((r) => r.type !== "separator")
      .map((r) => ({
        label: r.type === "header" ? r.label : (r.indent ? "    " + r.label : r.label),
        amount: r.type === "header" ? "" : fmt(r.amount),
        pct: r.pctVal,
        __rowType: r.type === "total" ? "grand-total" : r.type === "subtotal" ? "group-total" : undefined,
      }));
    exportToExcel({
      title: `قائمة الأرباح والخسائر`,
      filename: `PnL_${dateFromStr}_${dateToStr}`,
      columns: [
        { key: "label", label: "البند" },
        { key: "amount", label: "المبلغ (ج.م)" },
        { key: "pct", label: "النسبة" },
      ],
      data: exportData,
    });
  };

  const kpiCards = [
    {
      title: "صافي المبيعات",
      value: fmt(pnl.netSales),
      icon: DollarSign,
      color: "from-blue-500/20 to-blue-600/10 border-blue-500/30",
      textColor: "text-blue-600",
      suffix: "ج.م",
    },
    {
      title: "إجمالي الربح",
      value: fmt(pnl.grossProfit),
      icon: TrendingUp,
      color: "from-emerald-500/20 to-emerald-600/10 border-emerald-500/30",
      textColor: "text-emerald-600",
      suffix: `(${pnl.grossProfitPct.toFixed(1)}%)`,
    },
    {
      title: "صافي الربح",
      value: fmt(pnl.netProfit),
      icon: pnl.netProfit >= 0 ? TrendingUp : TrendingDown,
      color: pnl.netProfit >= 0
        ? "from-green-500/20 to-green-600/10 border-green-500/30"
        : "from-red-500/20 to-red-600/10 border-red-500/30",
      textColor: pnl.netProfit >= 0 ? "text-green-600" : "text-red-600",
      suffix: `(${pnl.netProfitPct.toFixed(1)}%)`,
    },
    {
      title: "تكلفة البضاعة",
      value: fmt(pnl.totalCogs),
      icon: Percent,
      color: "from-amber-500/20 to-amber-600/10 border-amber-500/30",
      textColor: "text-amber-600",
      suffix: pnl.netSales > 0 ? `(${((pnl.totalCogs / pnl.netSales) * 100).toFixed(1)}%)` : "",
    },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5 print:p-2" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-primary" />
            قائمة الأرباح والخسائر
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {format(dateFrom, "d MMMM yyyy", { locale: ar })} — {format(dateTo, "d MMMM yyyy", { locale: ar })}
            {branchId !== "all" && branches && ` • ${getBranchName(branchId)}`}
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden flex-wrap">
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 ml-1" /> طباعة
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF}>
            <FileText className="h-4 w-4 ml-1" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel}>
            <FileSpreadsheet className="h-4 w-4 ml-1" /> Excel
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="print:hidden">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            {/* Period presets */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">الفترة</label>
              <div className="flex gap-1 flex-wrap">
                {(Object.keys(presetLabels) as Preset[]).map((p) => (
                  <Button
                    key={p}
                    size="sm"
                    variant={preset === p ? "default" : "outline"}
                    className="text-xs h-8"
                    onClick={() => setPreset(p)}
                  >
                    {presetLabels[p]}
                  </Button>
                ))}
              </div>
            </div>

            {/* Custom dates */}
            {preset === "custom" && (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">من</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="w-36 justify-start text-xs">
                        <CalendarIcon className="h-3.5 w-3.5 ml-1" />
                        {format(customFrom, "yyyy/MM/dd")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar mode="single" selected={customFrom} onSelect={(d) => d && setCustomFrom(d)} />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">إلى</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="w-36 justify-start text-xs">
                        <CalendarIcon className="h-3.5 w-3.5 ml-1" />
                        {format(customTo, "yyyy/MM/dd")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar mode="single" selected={customTo} onSelect={(d) => d && setCustomTo(d)} />
                    </PopoverContent>
                  </Popover>
                </div>
              </>
            )}

            {/* Branch */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">الفرع</label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger className="w-40 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الفروع</SelectItem>
                  {(branches || []).map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Comparison toggle */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">مقارنة</label>
              <Button
                size="sm"
                variant={showComparison ? "default" : "outline"}
                className="h-8 text-xs"
                onClick={() => setShowComparison(!showComparison)}
              >
                <GitCompare className="h-3.5 w-3.5 ml-1" />
                مقارنة فروع
              </Button>
            </div>

            {showComparison && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">فرع المقارنة</label>
                <Select value={compareBranchId} onValueChange={setCompareBranchId}>
                  <SelectTrigger className="w-40 h-8 text-xs">
                    <SelectValue placeholder="اختر فرع" />
                  </SelectTrigger>
                  <SelectContent>
                    {(branches || [])
                      .filter((b) => b.id !== branchId)
                      .map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:grid-cols-4">
        {kpiCards.map((kpi, i) => (
          <Card
            key={i}
            className={`bg-gradient-to-br ${kpi.color} border`}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">{kpi.title}</span>
                <kpi.icon className={`h-5 w-5 ${kpi.textColor}`} />
              </div>
              <div className={`text-xl font-bold ${kpi.textColor}`}>{kpi.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{kpi.suffix}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* P&L Statement Table */}
      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="font-bold text-foreground">قائمة الدخل التفصيلية</h2>
            <Badge variant="outline" className="text-xs">
              {pnl.salesCount} فاتورة
            </Badge>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-right p-3 font-semibold text-foreground w-1/2">البند</th>
                  <th className="text-left p-3 font-semibold text-foreground">
                    المبلغ (ج.م)
                    {showComparison && compareBranchId && (
                      <span className="block text-xs font-normal text-muted-foreground">{getBranchName(branchId)}</span>
                    )}
                  </th>
                  <th className="text-left p-3 font-semibold text-foreground w-24">النسبة</th>
                  {showComparison && compareBranchId && (
                    <>
                      <th className="text-left p-3 font-semibold text-foreground border-r">
                        المبلغ (ج.م)
                        <span className="block text-xs font-normal text-muted-foreground">{getBranchName(compareBranchId)}</span>
                      </th>
                      <th className="text-left p-3 font-semibold text-foreground w-24">النسبة</th>
                      <th className="text-left p-3 font-semibold text-foreground w-28">الفرق</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  if (row.type === "separator") {
                    return <tr key={i}><td colSpan={6} className="h-1 bg-muted/30"></td></tr>;
                  }

                  const isTotal = row.type === "total";
                  const isSubtotal = row.type === "subtotal";
                  const isHeader = row.type === "header";
                  const compareRow = compareRows[i];

                  return (
                    <tr
                      key={i}
                      className={`border-b transition-colors ${
                        isTotal
                          ? "bg-primary/5 font-bold text-foreground"
                          : isSubtotal
                            ? "bg-muted/40 font-semibold text-foreground"
                            : isHeader
                              ? "bg-muted/20 font-semibold text-primary"
                              : "hover:bg-muted/20"
                      }`}
                    >
                      <td className={`p-3 text-right ${row.indent ? "pr-8" : ""}`}>
                        <span className="inline-flex items-center gap-1">
                          {row.label}
                          {row.expenseName && (
                            <span className="print:hidden inline-flex gap-0.5">
                              <button
                                onClick={() => setEditingExpense({ name: row.expenseName!, amount: row.amount })}
                                className="text-muted-foreground hover:text-primary p-0.5"
                                title="تعديل المبلغ"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => {
                                  if (row.isAutoExpense) {
                                    setDeletedAutoExpenses(prev => new Set([...prev, row.expenseName!]));
                                  } else {
                                    const idx = manualExpenses.findIndex(e => e.name === row.expenseName);
                                    if (idx >= 0) removeManualExpense(idx);
                                  }
                                }}
                                className="text-muted-foreground hover:text-destructive p-0.5"
                                title="حذف"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </span>
                          )}
                        </span>
                      </td>
                      <td className={`p-3 text-left tabular-nums ${isTotal && row.amount < 0 ? "text-destructive" : ""}`}>
                        {isHeader ? "" : fmt(row.amount)}
                      </td>
                      <td className="p-3 text-left text-muted-foreground text-xs">
                        {row.pctVal}
                      </td>
                      {showComparison && compareBranchId && compareRow && (
                        <>
                          <td className={`p-3 text-left tabular-nums border-r ${isTotal && compareRow.amount < 0 ? "text-destructive" : ""}`}>
                            {compareRow.type === "header" ? "" : fmt(compareRow.amount)}
                          </td>
                          <td className="p-3 text-left text-muted-foreground text-xs">
                            {compareRow.pctVal}
                          </td>
                          <td className={`p-3 text-left tabular-nums text-xs font-medium ${
                            row.amount - compareRow.amount > 0 ? "text-emerald-600" : row.amount - compareRow.amount < 0 ? "text-red-600" : ""
                          }`}>
                            {compareRow.type === "header" || row.type === "header"
                              ? ""
                              : (row.amount - compareRow.amount > 0 ? "+" : "") + fmt(row.amount - compareRow.amount)}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Manual expense controls */}
          <div className="p-4 border-t print:hidden">
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setAddingForCompare(false);
                  setShowAddExpense(true);
                }}
              >
                <Plus className="h-4 w-4 ml-1" />
                إضافة مصروف يدوي
              </Button>
              {manualExpenses.map((e, i) => (
                <Badge key={i} variant="secondary" className="gap-1 text-xs">
                  {e.name}: {fmt(e.amount)} ج.م
                  <button onClick={() => removeManualExpense(i)} className="hover:text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* COGS breakdown card */}
      {pnl.cogsByCategory.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="font-bold text-foreground mb-3 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              تفصيل تكلفة البضاعة المباعة حسب المجموعة
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {pnl.cogsByCategory.map((c, i) => {
                const costPct = c.salesAmount > 0 ? (c.amount / c.salesAmount) * 100 : 0;
                return (
                  <div key={i} className="border rounded-lg p-3 bg-muted/10">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm">{c.category}</span>
                      <Badge
                        variant={costPct > 35 ? "destructive" : costPct > 25 ? "secondary" : "default"}
                        className="text-xs"
                      >
                        {costPct.toFixed(1)}% Food Cost
                      </Badge>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>المبيعات: {fmt(c.salesAmount)} ج.م</span>
                      <span>التكلفة: {fmt(c.amount)} ج.م</span>
                    </div>
                    <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${costPct > 35 ? "bg-red-500" : costPct > 25 ? "bg-amber-500" : "bg-emerald-500"}`}
                        style={{ width: `${Math.min(costPct, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add manual expense dialog */}
      <Dialog open={showAddExpense} onOpenChange={setShowAddExpense}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة مصروف يدوي</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">اسم المصروف</label>
              <Input
                value={newExpName}
                onChange={(e) => setNewExpName(e.target.value)}
                placeholder="مثال: كهرباء إضافية"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">المبلغ (ج.م)</label>
              <Input
                type="number"
                value={newExpAmount}
                onChange={(e) => setNewExpAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <Button onClick={addManualExpense} className="w-full">
              إضافة
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit expense dialog */}
      <Dialog open={!!editingExpense} onOpenChange={(open) => !open && setEditingExpense(null)}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل مبلغ المصروف: {editingExpense?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">المبلغ (ج.م)</label>
              <Input
                type="number"
                defaultValue={editingExpense?.amount || 0}
                id="edit-expense-amount"
                placeholder="0.00"
              />
            </div>
            <Button
              className="w-full"
              onClick={() => {
                const input = document.getElementById("edit-expense-amount") as HTMLInputElement;
                const newVal = Number(input?.value || 0);
                if (editingExpense && newVal >= 0) {
                  // Check if it's a manual expense
                  const manualIdx = manualExpenses.findIndex(e => e.name === editingExpense.name);
                  if (manualIdx >= 0) {
                    setManualExpenses(prev => prev.map((e, i) => i === manualIdx ? { ...e, amount: newVal } : e));
                  } else {
                    setAutoExpenseOverrides(prev => ({ ...prev, [editingExpense.name]: newVal }));
                  }
                }
                setEditingExpense(null);
              }}
            >
              حفظ
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
