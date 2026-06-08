import React, { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingDown, TrendingUp, Minus, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { ExportButtons } from "@/components/ExportButtons";
import { PrintButton } from "@/components/PrintButton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

interface CustomExpense { name: string; value: number; }

export interface ComparablePeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  capacity: number;
  turn_over: number;
  avg_check: number;
  media: number;
  bills: number;
  salaries: number;
  other_expenses: number;
  maintenance: number;
  rent: number;
  custom_expenses: CustomExpense[];
  venue_type?: string;
  branch_id?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periods: ComparablePeriod[];
  branches: { id: string; name: string }[];
  defaultPeriodId?: string | null;
  /** Average direct cost % from current page context (shared across periods) */
  avgDirectCostPct?: number;
}

const NONE = "__none__";

const fmt = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const getDays = (s: string, e: string) => {
  const a = new Date(s).getTime();
  const b = new Date(e).getTime();
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
};

const expectedDailySales = (p: ComparablePeriod) => {
  const isTakeaway = p.venue_type === "تيك اواي";
  if (isTakeaway) return p.capacity * p.avg_check;
  return p.capacity * p.turn_over * p.avg_check;
};

const monthlySales = (p: ComparablePeriod) =>
  expectedDailySales(p) * getDays(p.start_date, p.end_date);

const totalIndirect = (p: ComparablePeriod) => {
  const base = p.media + p.bills + p.salaries + p.other_expenses + p.maintenance + p.rent;
  const custom = (p.custom_expenses || []).reduce((s, c) => s + (c.value || 0), 0);
  return base + custom;
};

const buildBreakdown = (p: ComparablePeriod) => {
  const items: { key: string; label: string; value: number }[] = [
    { key: "rent", label: "الإيجار", value: p.rent || 0 },
    { key: "salaries", label: "المرتبات", value: p.salaries || 0 },
    { key: "bills", label: "الفواتير", value: p.bills || 0 },
    { key: "media", label: "الميديا والتسويق", value: p.media || 0 },
    { key: "maintenance", label: "الصيانة", value: p.maintenance || 0 },
    { key: "other_expenses", label: "أخرى", value: p.other_expenses || 0 },
  ];
  for (const c of p.custom_expenses || []) {
    items.push({ key: `custom::${c.name}`, label: c.name, value: c.value || 0 });
  }
  return items;
};

const expenseChangeColor = (pct: number) => {
  if (pct >= 20) return "text-red-500";
  if (pct >= 10) return "text-yellow-500";
  if (pct <= -5) return "text-emerald-600";
  return "text-muted-foreground";
};

const positiveChangeColor = (pct: number) => {
  if (pct <= -20) return "text-red-500";
  if (pct <= -10) return "text-yellow-500";
  if (pct >= 5) return "text-emerald-600";
  return "text-muted-foreground";
};

const ChangeCell: React.FC<{ a: number; b: number; positive?: boolean }> = ({ a, b, positive }) => {
  const diff = b - a;
  const pct = a !== 0 ? (diff / Math.abs(a)) * 100 : (b === 0 ? 0 : 100);
  const color = positive ? positiveChangeColor(pct) : expenseChangeColor(pct);
  const Icon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
  return (
    <div className={`flex items-center justify-center gap-1 font-semibold ${color}`}>
      <Icon size={14} />
      <span>{diff > 0 ? "+" : ""}{fmt(diff)}</span>
      <span className="text-xs">({diff > 0 ? "+" : ""}{pct.toFixed(1)}%)</span>
    </div>
  );
};

const fmtChange = (a: number, b: number) => {
  const diff = b - a;
  const pct = a !== 0 ? (diff / Math.abs(a)) * 100 : (b === 0 ? 0 : 100);
  const sign = diff > 0 ? "+" : "";
  return `${sign}${fmt(diff)} (${sign}${pct.toFixed(1)}%)`;
};

// breakeven daily = (totalIndirect / days) / (1 - directCost%)
const breakEvenDaily = (p: ComparablePeriod, directPct: number) => {
  const denom = 1 - (directPct / 100);
  if (denom <= 0) return 0;
  const days = getDays(p.start_date, p.end_date);
  return (totalIndirect(p) / days) / denom;
};

const netProfitPctOf = (p: ComparablePeriod, directPct: number) => {
  const sales = monthlySales(p);
  const indPct = sales > 0 ? (totalIndirect(p) / sales) * 100 : 0;
  return 100 - indPct - directPct;
};

const classifyItem = (a: number, b: number): { label: string; variant: "destructive" | "secondary" | "default" | "outline"; className?: string } => {
  if (a === 0 && b > 0) return { label: "مصروف جديد", variant: "outline", className: "text-blue-500 border-blue-500/50" };
  if (a > 0 && b === 0) return { label: "تم إلغاؤه", variant: "outline", className: "text-purple-500 border-purple-500/50" };
  return { label: "طبيعي", variant: "secondary" };
};

const riskLevel = (contribPct: number, changePct: number): { label: string; className: string } => {
  // High risk: large positive contribution to increase AND large % change
  if (contribPct >= 30 && changePct >= 20) return { label: "🔴 خطر مرتفع", className: "text-red-500 border-red-500/50" };
  if (contribPct >= 15 || changePct >= 15) return { label: "🟡 متوسط", className: "text-yellow-600 border-yellow-500/50" };
  if (contribPct < 0) return { label: "🟢 مساهم في التحسن", className: "text-emerald-600 border-emerald-500/50" };
  return { label: "🟢 منخفض", className: "text-emerald-600 border-emerald-500/50" };
};

export const PeriodComparisonDialog: React.FC<Props> = ({ open, onOpenChange, periods, branches, defaultPeriodId, avgDirectCostPct = 0 }) => {
  const sorted = useMemo(
    () => [...periods].sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()),
    [periods]
  );

  const [aId, setAId] = useState<string>(() => {
    if (defaultPeriodId && sorted.some(p => p.id === defaultPeriodId)) return defaultPeriodId;
    return sorted[1]?.id || sorted[0]?.id || "";
  });
  const [bId, setBId] = useState<string>(() => defaultPeriodId || sorted[0]?.id || "");
  const [cId, setCId] = useState<string>(NONE);

  const A = sorted.find(p => p.id === aId);
  const B = sorted.find(p => p.id === bId);
  const C = cId !== NONE ? sorted.find(p => p.id === cId) : undefined;
  const hasC = !!C;

  const branchName = (id?: string | null) => (id ? branches.find(b => b.id === id)?.name || "—" : "كل الفروع");

  const analysis = useMemo(() => {
    if (!A || !B) return null;
    const aBreak = buildBreakdown(A);
    const bBreak = buildBreakdown(B);
    const cBreak = C ? buildBreakdown(C) : [];
    const labels = Array.from(new Set([
      ...aBreak.map(x => x.label),
      ...bBreak.map(x => x.label),
      ...cBreak.map(x => x.label),
    ]));

    const aSales = monthlySales(A);
    const bSales = monthlySales(B);
    const cSales = C ? monthlySales(C) : 0;
    const aTotal = totalIndirect(A);
    const bTotal = totalIndirect(B);
    const cTotal = C ? totalIndirect(C) : 0;
    const aPct = aSales > 0 ? (aTotal / aSales) * 100 : 0;
    const bPct = bSales > 0 ? (bTotal / bSales) * 100 : 0;
    const cPct = cSales > 0 ? (cTotal / cSales) * 100 : 0;

    const salesGrowthPct = aSales !== 0 ? ((bSales - aSales) / Math.abs(aSales)) * 100 : 0;
    const totalIncrease = bTotal - aTotal;

    const rows = labels.map(label => {
      const av = aBreak.find(x => x.label === label)?.value || 0;
      const bv = bBreak.find(x => x.label === label)?.value || 0;
      const cv = C ? (cBreak.find(x => x.label === label)?.value || 0) : 0;
      const diff = bv - av;
      const pct = av !== 0 ? (diff / Math.abs(av)) * 100 : (bv === 0 ? 0 : 100);
      const shareA = aSales > 0 ? (av / aSales) * 100 : 0;
      const shareB = bSales > 0 ? (bv / bSales) * 100 : 0;
      const vsSales = pct - salesGrowthPct;
      const contribution = totalIncrease !== 0 ? (diff / Math.abs(totalIncrease)) * 100 : 0;
      const type = classifyItem(av, bv);
      const risk = riskLevel(contribution, pct);
      return { label, a: av, b: bv, c: cv, diff, pct, shareA, shareB, vsSales, contribution, type, risk };
    });

    const increased = [...rows].filter(r => r.diff > 0).sort((x, y) => y.diff - x.diff).slice(0, 3);
    const decreased = [...rows].filter(r => r.diff < 0).sort((x, y) => x.diff - y.diff).slice(0, 3);

    const aNetProfitPct = netProfitPctOf(A, avgDirectCostPct);
    const bNetProfitPct = netProfitPctOf(B, avgDirectCostPct);
    const cNetProfitPct = C ? netProfitPctOf(C, avgDirectCostPct) : 0;
    const aBreakEven = breakEvenDaily(A, avgDirectCostPct);
    const bBreakEven = breakEvenDaily(B, avgDirectCostPct);
    const cBreakEven = C ? breakEvenDaily(C, avgDirectCostPct) : 0;

    // Operational efficiency: how much expense per 1 currency of sales (lower = better)
    const aEfficiency = aSales > 0 ? aTotal / aSales : 0;
    const bEfficiency = bSales > 0 ? bTotal / bSales : 0;
    const cEfficiency = cSales > 0 ? cTotal / cSales : 0;

    const recs: { type: "danger" | "warning" | "success" | "info"; text: string }[] = [];
    const totalDiffPct = aTotal !== 0 ? ((bTotal - aTotal) / Math.abs(aTotal)) * 100 : 0;
    if (totalDiffPct >= 20) recs.push({ type: "danger", text: `إجمالي المصاريف زاد بنسبة ${totalDiffPct.toFixed(1)}% — راجع البنود اللي زادت بشكل كبير.` });
    else if (totalDiffPct >= 10) recs.push({ type: "warning", text: `إجمالي المصاريف زاد بنسبة ${totalDiffPct.toFixed(1)}% — انتبه.` });
    else if (totalDiffPct <= -5) recs.push({ type: "success", text: `إجمالي المصاريف قل بنسبة ${Math.abs(totalDiffPct).toFixed(1)}% — أداء ممتاز.` });

    // المقارنة بنمو المبيعات
    if (totalDiffPct > salesGrowthPct + 5) {
      recs.push({ type: "danger", text: `المصاريف زادت ${totalDiffPct.toFixed(1)}% بينما المبيعات زادت ${salesGrowthPct.toFixed(1)}% فقط — نمو المصاريف أسرع من المبيعات.` });
    } else if (totalDiffPct < salesGrowthPct - 3 && salesGrowthPct > 0) {
      recs.push({ type: "success", text: `المبيعات زادت ${salesGrowthPct.toFixed(1)}% بينما المصاريف زادت ${totalDiffPct.toFixed(1)}% فقط — تحسن في الكفاءة.` });
    }

    for (const r of increased) {
      if (r.pct >= 25) recs.push({ type: "danger", text: `بند "${r.label}" زاد ${r.pct.toFixed(1)}% (+${fmt(r.diff)}) ويساهم بـ ${r.contribution.toFixed(0)}% من إجمالي الزيادة.` });
    }
    if (salesGrowthPct <= -10) recs.push({ type: "warning", text: `المبيعات المتوقعة قلت ${Math.abs(salesGrowthPct).toFixed(1)}% — راجع السعة، الدوران، أو متوسط الفاتورة.` });
    if (bPct - aPct >= 5) recs.push({ type: "danger", text: `نسبة المصاريف من المبيعات ارتفعت من ${aPct.toFixed(1)}% إلى ${bPct.toFixed(1)}% — هتقلل الربح.` });
    else if (bPct - aPct <= -3) recs.push({ type: "success", text: `نسبة المصاريف من المبيعات قلت من ${aPct.toFixed(1)}% إلى ${bPct.toFixed(1)}% — كفاءة أفضل.` });

    // Break-even
    if (bBreakEven > aBreakEven * 1.1) {
      recs.push({ type: "warning", text: `نقطة التعادل اليومية ارتفعت من ${fmt(aBreakEven)} إلى ${fmt(bBreakEven)} — لازم تبيع أكتر يومياً عشان تغطي.` });
    }

    // Net Profit %
    if (bNetProfitPct < aNetProfitPct - 3) {
      recs.push({ type: "danger", text: `صافي الربح % انخفض من ${aNetProfitPct.toFixed(1)}% إلى ${bNetProfitPct.toFixed(1)}%.` });
    } else if (bNetProfitPct > aNetProfitPct + 2) {
      recs.push({ type: "success", text: `صافي الربح % ارتفع من ${aNetProfitPct.toFixed(1)}% إلى ${bNetProfitPct.toFixed(1)}%.` });
    }

    // Items added / removed
    const added = rows.filter(r => r.type.label === "مصروف جديد");
    const removed = rows.filter(r => r.type.label === "تم إلغاؤه");
    if (added.length) recs.push({ type: "info", text: `مصاريف جديدة ظهرت: ${added.map(x => x.label).join("، ")}` });
    if (removed.length) recs.push({ type: "success", text: `مصاريف تم إلغاؤها: ${removed.map(x => x.label).join("، ")}` });

    if (C) {
      const cTotalDiffPct = bTotal !== 0 ? ((cTotal - bTotal) / Math.abs(bTotal)) * 100 : 0;
      if (cTotalDiffPct >= 15) recs.push({ type: "danger", text: `الفترة C: المصاريف زادت ${cTotalDiffPct.toFixed(1)}% مقارنة بـ B — اتجاه تصاعدي.` });
      else if (cTotalDiffPct <= -5) recs.push({ type: "success", text: `الفترة C: المصاريف قلت ${Math.abs(cTotalDiffPct).toFixed(1)}% مقارنة بـ B — اتجاه إيجابي.` });
    }

    if (recs.length === 0) recs.push({ type: "info", text: "مفيش تغييرات جوهرية بين الفترات — الأداء مستقر." });

    // Chart data
    const chartData = [
      { name: `A: ${A.name}`, "المبيعات": aSales, "المصاريف": aTotal, "صافي الربح %": aNetProfitPct },
      { name: `B: ${B.name}`, "المبيعات": bSales, "المصاريف": bTotal, "صافي الربح %": bNetProfitPct },
      ...(C ? [{ name: `C: ${C.name}`, "المبيعات": cSales, "المصاريف": cTotal, "صافي الربح %": cNetProfitPct }] : []),
    ];

    return {
      rows, aSales, bSales, cSales, aTotal, bTotal, cTotal, aPct, bPct, cPct,
      aNetProfitPct, bNetProfitPct, cNetProfitPct,
      aBreakEven, bBreakEven, cBreakEven,
      aEfficiency, bEfficiency, cEfficiency,
      salesGrowthPct, totalIncrease,
      increased, decreased, recs, chartData,
    };
  }, [A, B, C, avgDirectCostPct]);

  // Export config
  const exportColumns = useMemo(() => {
    const cols: { key: string; label: string }[] = [
      { key: "label", label: "البند" },
      { key: "a", label: `A: ${A?.name || ""}` },
      { key: "b", label: `B: ${B?.name || ""}` },
    ];
    if (hasC) cols.push({ key: "c", label: `C: ${C?.name || ""}` });
    cols.push({ key: "change_ba", label: "التغيير B عن A" });
    if (hasC) cols.push({ key: "change_cb", label: "التغيير C عن B" });
    cols.push({ key: "shareA", label: "% من مبيعات A" });
    cols.push({ key: "shareB", label: "% من مبيعات B" });
    cols.push({ key: "vsSales", label: "نمو مقابل المبيعات" });
    cols.push({ key: "contribution", label: "مساهمة في الزيادة %" });
    cols.push({ key: "type", label: "التصنيف" });
    cols.push({ key: "risk", label: "مؤشر الخطر" });
    return cols;
  }, [A, B, C, hasC]);

  const exportData = useMemo(() => {
    if (!analysis || !A || !B) return [];
    const rows: any[] = analysis.rows.map(r => ({
      label: r.label,
      a: fmt(r.a),
      b: fmt(r.b),
      c: hasC ? fmt(r.c) : "",
      change_ba: fmtChange(r.a, r.b),
      change_cb: hasC ? fmtChange(r.b, r.c) : "",
      shareA: r.shareA.toFixed(2) + "%",
      shareB: r.shareB.toFixed(2) + "%",
      vsSales: (r.vsSales > 0 ? "+" : "") + r.vsSales.toFixed(1) + "%",
      contribution: r.contribution.toFixed(1) + "%",
      type: r.type.label,
      risk: r.risk.label,
    }));
    rows.push({
      label: "الإجمالي", a: fmt(analysis.aTotal), b: fmt(analysis.bTotal),
      c: hasC ? fmt(analysis.cTotal) : "",
      change_ba: fmtChange(analysis.aTotal, analysis.bTotal),
      change_cb: hasC ? fmtChange(analysis.bTotal, analysis.cTotal) : "",
      shareA: analysis.aPct.toFixed(2) + "%", shareB: analysis.bPct.toFixed(2) + "%",
      vsSales: "", contribution: "100%", type: "", risk: "",
      __rowType: "grand-total",
    });
    rows.push({
      label: "المبيعات الشهرية المتوقعة",
      a: fmt(analysis.aSales), b: fmt(analysis.bSales),
      c: hasC ? fmt(analysis.cSales) : "",
      change_ba: fmtChange(analysis.aSales, analysis.bSales),
      change_cb: hasC ? fmtChange(analysis.bSales, analysis.cSales) : "",
      shareA: "", shareB: "", vsSales: "", contribution: "", type: "", risk: "",
      __rowType: "group-total",
    });
    rows.push({
      label: "نسبة المصاريف من المبيعات %",
      a: analysis.aPct.toFixed(2) + "%", b: analysis.bPct.toFixed(2) + "%",
      c: hasC ? analysis.cPct.toFixed(2) + "%" : "",
      change_ba: (analysis.bPct - analysis.aPct).toFixed(2) + "%",
      change_cb: hasC ? (analysis.cPct - analysis.bPct).toFixed(2) + "%" : "",
      shareA: "", shareB: "", vsSales: "", contribution: "", type: "", risk: "",
      __rowType: "group-total",
    });
    rows.push({
      label: "نقطة التعادل اليومية",
      a: fmt(analysis.aBreakEven), b: fmt(analysis.bBreakEven),
      c: hasC ? fmt(analysis.cBreakEven) : "",
      change_ba: fmtChange(analysis.aBreakEven, analysis.bBreakEven),
      change_cb: hasC ? fmtChange(analysis.bBreakEven, analysis.cBreakEven) : "",
      shareA: "", shareB: "", vsSales: "", contribution: "", type: "", risk: "",
      __rowType: "group-total",
    });
    rows.push({
      label: "صافي الربح %",
      a: analysis.aNetProfitPct.toFixed(2) + "%",
      b: analysis.bNetProfitPct.toFixed(2) + "%",
      c: hasC ? analysis.cNetProfitPct.toFixed(2) + "%" : "",
      change_ba: (analysis.bNetProfitPct - analysis.aNetProfitPct).toFixed(2) + "%",
      change_cb: hasC ? (analysis.cNetProfitPct - analysis.bNetProfitPct).toFixed(2) + "%" : "",
      shareA: "", shareB: "", vsSales: "", contribution: "", type: "", risk: "",
      __rowType: "group-total",
    });
    return rows;
  }, [analysis, A, B, C, hasC]);

  const exportFilters = useMemo(() => {
    const list: { label: string; value: string }[] = [
      { label: "الفترة A", value: A ? `${A.name} (${A.start_date} → ${A.end_date})` : "" },
      { label: "الفترة B", value: B ? `${B.name} (${B.start_date} → ${B.end_date})` : "" },
    ];
    if (hasC && C) list.push({ label: "الفترة C", value: `${C.name} (${C.start_date} → ${C.end_date})` });
    list.push({ label: "Avg Direct Cost %", value: avgDirectCostPct.toFixed(2) + "%" });
    return list;
  }, [A, B, C, hasC, avgDirectCostPct]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <span>📊 مقارنة بين الفترات</span>
            {analysis && A && B && aId !== bId && (
              <div className="flex items-center gap-2">
                <PrintButton data={exportData} columns={exportColumns} title="مقارنة المصاريف الغير مباشرة" filters={exportFilters} />
                <ExportButtons data={exportData} columns={exportColumns} filename="period_comparison" title="مقارنة المصاريف الغير مباشرة" filters={exportFilters} />
              </div>
            )}
          </DialogTitle>
        </DialogHeader>

        {sorted.length < 2 ? (
          <div className="py-12 text-center text-muted-foreground">تحتاج على الأقل فترتين تحليل عشان تعمل مقارنة.</div>
        ) : (
          <div className="space-y-6">
            {/* Period selectors */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: "الفترة A (الأقدم)", id: aId, setId: setAId, p: A, allowNone: false },
                { label: "الفترة B", id: bId, setId: setBId, p: B, allowNone: false },
                { label: "الفترة C (اختياري)", id: cId, setId: setCId, p: C, allowNone: true },
              ].map((sel, i) => (
                <div key={i}>
                  <label className="text-sm font-medium mb-2 block">{sel.label}</label>
                  <Select value={sel.id} onValueChange={sel.setId}>
                    <SelectTrigger><SelectValue placeholder={sel.allowNone ? "بدون" : ""} /></SelectTrigger>
                    <SelectContent>
                      {sel.allowNone && <SelectItem value={NONE}>— بدون —</SelectItem>}
                      {sorted.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name} — {branchName(p.branch_id)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {sel.p && <p className="text-xs text-muted-foreground mt-1">{sel.p.start_date} → {sel.p.end_date}</p>}
                </div>
              ))}
            </div>

            {A && B && aId === bId && (
              <div className="p-4 border border-yellow-500/40 bg-yellow-500/10 rounded-lg text-sm text-yellow-700 dark:text-yellow-400">
                ⚠️ اخترت نفس الفترة في A و B — اختر فترتين مختلفتين.
              </div>
            )}

            {A && B && aId !== bId && analysis && (
              <>
                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                  {[
                    { title: "المبيعات الشهرية المتوقعة", a: analysis.aSales, b: analysis.bSales, c: analysis.cSales, positive: true, isPct: false },
                    { title: "إجمالي المصاريف", a: analysis.aTotal, b: analysis.bTotal, c: analysis.cTotal, positive: false, isPct: false },
                    { title: "نسبة المصاريف من المبيعات", a: analysis.aPct, b: analysis.bPct, c: analysis.cPct, positive: false, isPct: true },
                    { title: "نقطة التعادل اليومية", a: analysis.aBreakEven, b: analysis.bBreakEven, c: analysis.cBreakEven, positive: false, isPct: false },
                    { title: "صافي الربح %", a: analysis.aNetProfitPct, b: analysis.bNetProfitPct, c: analysis.cNetProfitPct, positive: true, isPct: true },
                  ].map((k, i) => (
                    <Card key={i}>
                      <CardHeader className="pb-2"><CardTitle className="text-sm">{k.title}</CardTitle></CardHeader>
                      <CardContent className="space-y-1">
                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">A:</span> <span>{k.isPct ? k.a.toFixed(2) + "%" : fmt(k.a)}</span></div>
                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">B:</span> <span className="font-bold">{k.isPct ? k.b.toFixed(2) + "%" : fmt(k.b)}</span></div>
                        {hasC && <div className="flex justify-between text-sm"><span className="text-muted-foreground">C:</span> <span className="font-bold">{k.isPct ? k.c.toFixed(2) + "%" : fmt(k.c)}</span></div>}
                        <div className="pt-2 border-t"><ChangeCell a={k.a} b={k.b} positive={k.positive} /></div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Operating data */}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">⚙️ بيانات التشغيل</CardTitle></CardHeader>
                  <CardContent>
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-right">البيان</TableHead>
                            <TableHead className="text-center">A</TableHead>
                            <TableHead className="text-center">B</TableHead>
                            {hasC && <TableHead className="text-center">C</TableHead>}
                            <TableHead className="text-center">B عن A</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {[
                            { label: "السعة (Capacity)", a: A.capacity, b: B.capacity, c: C?.capacity || 0 },
                            { label: "معدل الدوران", a: A.turn_over, b: B.turn_over, c: C?.turn_over || 0 },
                            { label: "متوسط الفاتورة", a: A.avg_check, b: B.avg_check, c: C?.avg_check || 0 },
                            { label: "عدد الأيام", a: getDays(A.start_date, A.end_date), b: getDays(B.start_date, B.end_date), c: C ? getDays(C.start_date, C.end_date) : 0 },
                            { label: "مبيعات يومية متوقعة", a: expectedDailySales(A), b: expectedDailySales(B), c: C ? expectedDailySales(C) : 0 },
                            { label: "مؤشر الكفاءة (مصاريف/مبيعات)", a: analysis.aEfficiency, b: analysis.bEfficiency, c: analysis.cEfficiency, decimal: 4 },
                          ].map(r => (
                            <TableRow key={r.label}>
                              <TableCell className="font-medium">{r.label}</TableCell>
                              <TableCell className="text-center">{r.a.toLocaleString(undefined, { maximumFractionDigits: (r as any).decimal || 2 })}</TableCell>
                              <TableCell className="text-center font-bold">{r.b.toLocaleString(undefined, { maximumFractionDigits: (r as any).decimal || 2 })}</TableCell>
                              {hasC && <TableCell className="text-center font-bold">{r.c.toLocaleString(undefined, { maximumFractionDigits: (r as any).decimal || 2 })}</TableCell>}
                              <TableCell className="text-center"><ChangeCell a={r.a} b={r.b} /></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                {/* Detailed table */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">تفاصيل البنود</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      نمو المبيعات الإجمالي: <span className={analysis.salesGrowthPct >= 0 ? "text-emerald-600 font-bold" : "text-red-500 font-bold"}>{analysis.salesGrowthPct > 0 ? "+" : ""}{analysis.salesGrowthPct.toFixed(1)}%</span>
                      {" | "}إجمالي زيادة المصاريف: <span className="font-bold">{analysis.totalIncrease > 0 ? "+" : ""}{fmt(analysis.totalIncrease)}</span>
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="border rounded-lg overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-right">البند</TableHead>
                            <TableHead className="text-center">A</TableHead>
                            <TableHead className="text-center">B</TableHead>
                            {hasC && <TableHead className="text-center">C</TableHead>}
                            <TableHead className="text-center">B عن A</TableHead>
                            {hasC && <TableHead className="text-center">C عن B</TableHead>}
                            <TableHead className="text-center">% من مبيعات A</TableHead>
                            <TableHead className="text-center">% من مبيعات B</TableHead>
                            <TableHead className="text-center">vs نمو المبيعات</TableHead>
                            <TableHead className="text-center">المساهمة %</TableHead>
                            <TableHead className="text-center">التصنيف</TableHead>
                            <TableHead className="text-center">الخطر</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {analysis.rows.map(r => {
                            const vsColor = r.vsSales > 5 ? "text-red-500" : r.vsSales < -5 ? "text-emerald-600" : "text-muted-foreground";
                            return (
                              <TableRow key={r.label}>
                                <TableCell className="font-medium">{r.label}</TableCell>
                                <TableCell className="text-center">{fmt(r.a)}</TableCell>
                                <TableCell className="text-center font-bold">{fmt(r.b)}</TableCell>
                                {hasC && <TableCell className="text-center font-bold">{fmt(r.c)}</TableCell>}
                                <TableCell className="text-center"><ChangeCell a={r.a} b={r.b} /></TableCell>
                                {hasC && <TableCell className="text-center"><ChangeCell a={r.b} b={r.c} /></TableCell>}
                                <TableCell className="text-center text-xs">{r.shareA.toFixed(2)}%</TableCell>
                                <TableCell className="text-center text-xs font-bold">{r.shareB.toFixed(2)}%</TableCell>
                                <TableCell className={`text-center text-xs font-bold ${vsColor}`}>{r.vsSales > 0 ? "+" : ""}{r.vsSales.toFixed(1)}%</TableCell>
                                <TableCell className="text-center text-xs font-bold">{r.contribution.toFixed(1)}%</TableCell>
                                <TableCell className="text-center"><Badge variant={r.type.variant} className={r.type.className}>{r.type.label}</Badge></TableCell>
                                <TableCell className="text-center"><Badge variant="outline" className={r.risk.className}>{r.risk.label}</Badge></TableCell>
                              </TableRow>
                            );
                          })}
                          <TableRow className="bg-muted/50 font-bold">
                            <TableCell>الإجمالي</TableCell>
                            <TableCell className="text-center">{fmt(analysis.aTotal)}</TableCell>
                            <TableCell className="text-center">{fmt(analysis.bTotal)}</TableCell>
                            {hasC && <TableCell className="text-center">{fmt(analysis.cTotal)}</TableCell>}
                            <TableCell className="text-center"><ChangeCell a={analysis.aTotal} b={analysis.bTotal} /></TableCell>
                            {hasC && <TableCell className="text-center"><ChangeCell a={analysis.bTotal} b={analysis.cTotal} /></TableCell>}
                            <TableCell className="text-center text-xs">{analysis.aPct.toFixed(2)}%</TableCell>
                            <TableCell className="text-center text-xs">{analysis.bPct.toFixed(2)}%</TableCell>
                            <TableCell />
                            <TableCell className="text-center text-xs">100%</TableCell>
                            <TableCell /><TableCell />
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                {/* Chart */}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">📈 الرسم البياني — مقارنة المبيعات والمصاريف وصافي الربح</CardTitle></CardHeader>
                  <CardContent>
                    <div className="w-full h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analysis.chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} unit="%" />
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Bar yAxisId="left" dataKey="المبيعات" fill="hsl(var(--primary))" />
                          <Bar yAxisId="left" dataKey="المصاريف" fill="hsl(var(--destructive))" />
                          <Bar yAxisId="right" dataKey="صافي الربح %" fill="hsl(142 71% 45%)" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Top movers */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-red-500">🔺 أعلى 3 بنود زادت (B عن A)</CardTitle></CardHeader>
                    <CardContent>
                      {analysis.increased.length === 0 ? (
                        <p className="text-sm text-muted-foreground">لا يوجد</p>
                      ) : (
                        <ul className="space-y-2">
                          {analysis.increased.map(r => (
                            <li key={r.label} className="flex justify-between text-sm">
                              <span>{r.label} <span className="text-xs text-muted-foreground">(مساهمة {r.contribution.toFixed(0)}%)</span></span>
                              <span className="font-bold text-red-500">+{fmt(r.diff)} ({r.pct.toFixed(1)}%)</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-emerald-600">🔻 أعلى 3 بنود قلت (B عن A)</CardTitle></CardHeader>
                    <CardContent>
                      {analysis.decreased.length === 0 ? (
                        <p className="text-sm text-muted-foreground">لا يوجد</p>
                      ) : (
                        <ul className="space-y-2">
                          {analysis.decreased.map(r => (
                            <li key={r.label} className="flex justify-between text-sm">
                              <span>{r.label}</span>
                              <span className="font-bold text-emerald-600">{fmt(r.diff)} ({r.pct.toFixed(1)}%)</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Recommendations */}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">💡 توصيات وتحذيرات</CardTitle></CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {analysis.recs.map((r, i) => {
                        const Icon = r.type === "danger" ? AlertTriangle : r.type === "warning" ? AlertTriangle : r.type === "success" ? CheckCircle2 : Info;
                        const color =
                          r.type === "danger" ? "text-red-500 border-red-500/40 bg-red-500/5"
                            : r.type === "warning" ? "text-yellow-600 border-yellow-500/40 bg-yellow-500/5"
                              : r.type === "success" ? "text-emerald-600 border-emerald-500/40 bg-emerald-500/5"
                                : "text-blue-500 border-blue-500/40 bg-blue-500/5";
                        return (
                          <li key={i} className={`flex items-start gap-2 p-3 border rounded-lg text-sm ${color}`}>
                            <Icon size={16} className="shrink-0 mt-0.5" />
                            <span>{r.text}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
