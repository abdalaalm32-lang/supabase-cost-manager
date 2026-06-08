import React, { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingDown, TrendingUp, Minus, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { ExportButtons } from "@/components/ExportButtons";

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

const classifyItem = (a: number, b: number, itemPct: number, salesPct: number): { label: string; variant: "destructive" | "secondary" | "default" | "outline"; className?: string } => {
  if (a === 0 && b > 0) return { label: "🆕 مصروف جديد", variant: "outline", className: "text-blue-500 border-blue-500/50" };
  if (a > 0 && b === 0) return { label: "✖ تم إلغاؤه", variant: "outline", className: "text-purple-500 border-purple-500/50" };
  if (a === 0 && b === 0) return { label: "—", variant: "secondary" };
  const diff = itemPct - salesPct;
  if (diff >= 10) return { label: "🔴 أعلى بكثير من نمو المبيعات", variant: "outline", className: "text-red-500 border-red-500/50" };
  if (diff >= 3) return { label: "🟡 أعلى من نمو المبيعات", variant: "outline", className: "text-yellow-600 border-yellow-500/50" };
  if (diff <= -10) return { label: "🟢 أقل بكثير من نمو المبيعات", variant: "outline", className: "text-emerald-600 border-emerald-500/50" };
  if (diff <= -3) return { label: "🟢 أقل من نمو المبيعات", variant: "outline", className: "text-emerald-600 border-emerald-500/50" };
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
      const expected = av > 0 ? av * (1 + salesGrowthPct / 100) : 0;
      const variance = av > 0 ? bv - expected : 0;
      const isNew = av === 0 && bv > 0;
      const isRemoved = av > 0 && bv === 0;
      const type = classifyItem(av, bv, pct, salesGrowthPct);
      const risk = riskLevel(contribution, pct);
      return { label, a: av, b: bv, c: cv, diff, pct, shareA, shareB, vsSales, contribution, expected, variance, isNew, isRemoved, type, risk };
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
    const added = rows.filter(r => r.isNew);
    const removed = rows.filter(r => r.isRemoved);
    if (added.length) recs.push({ type: "info", text: `مصاريف جديدة ظهرت: ${added.map(x => x.label).join("، ")}` });
    if (removed.length) recs.push({ type: "success", text: `مصاريف تم إلغاؤها: ${removed.map(x => x.label).join("، ")}` });

    if (C) {
      const cTotalDiffPct = bTotal !== 0 ? ((cTotal - bTotal) / Math.abs(bTotal)) * 100 : 0;
      if (cTotalDiffPct >= 15) recs.push({ type: "danger", text: `الفترة C: المصاريف زادت ${cTotalDiffPct.toFixed(1)}% مقارنة بـ B — اتجاه تصاعدي.` });
      else if (cTotalDiffPct <= -5) recs.push({ type: "success", text: `الفترة C: المصاريف قلت ${Math.abs(cTotalDiffPct).toFixed(1)}% مقارنة بـ B — اتجاه إيجابي.` });
    }

    if (recs.length === 0) recs.push({ type: "info", text: "مفيش تغييرات جوهرية بين الفترات — الأداء مستقر." });

    // Marginal expense per extra EGP of sales (only meaningful when sales grew)
    const extraSales = bSales - aSales;
    const extraExpenses = bTotal - aTotal;
    const expensePerExtraSale = extraSales > 0 ? extraExpenses / extraSales : null;
    const salesRetentionPct = expensePerExtraSale !== null ? (1 - expensePerExtraSale) * 100 : null;

    // Executive summary
    const topUp = [...rows].filter(r => r.diff > 0).sort((x, y) => y.diff - x.diff)[0];
    const topDown = [...rows].filter(r => r.diff < 0).sort((x, y) => x.diff - y.diff)[0];
    const execParts: string[] = [];
    execParts.push(`ارتفعت المبيعات بنسبة ${salesGrowthPct.toFixed(1)}% مقابل تغير في المصاريف قدره ${totalDiffPct > 0 ? "+" : ""}${totalDiffPct.toFixed(1)}%`);
    execParts.push(`مما أدى إلى ${bPct < aPct ? "تحسن" : "تغير"} نسبة المصاريف من المبيعات من ${aPct.toFixed(2)}% إلى ${bPct.toFixed(2)}%`);
    execParts.push(`وحركة صافي الربح من ${aNetProfitPct.toFixed(2)}% إلى ${bNetProfitPct.toFixed(2)}%.`);
    if (topUp && topUp.diff > 0) {
      execParts.push(`أكبر مساهم في زيادة المصاريف كان بند "${topUp.label}" (${topUp.contribution.toFixed(0)}% من إجمالي الزيادة).`);
    }
    if (topDown && topDown.diff < 0) {
      execParts.push(`بينما ساهم انخفاض "${topDown.label}" في تعويض جزء من الزيادة (${fmt(Math.abs(topDown.diff))}).`);
    }
    if (expensePerExtraSale !== null) {
      execParts.push(`كل 1 جنيه مبيعات إضافية احتاج ${expensePerExtraSale.toFixed(2)} جنيه مصروف إضافي فقط، وتم الاحتفاظ بـ ${(salesRetentionPct ?? 0).toFixed(1)}% من نمو المبيعات قبل احتساب تكلفة البضاعة.`);
    }
    const executiveSummary = execParts.join(" ");

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
      salesGrowthPct, totalIncrease, totalDiffPct,
      extraSales, extraExpenses, expensePerExtraSale, salesRetentionPct,
      executiveSummary,
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
    cols.push({ key: "expected", label: "المتوقع وفق نمو المبيعات" });
    cols.push({ key: "variance", label: "الفرق عن المتوقع" });
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
      change_ba: r.isNew ? `جديد +${fmt(r.b)}` : r.isRemoved ? `ملغي −${fmt(r.a)}` : fmtChange(r.a, r.b),
      change_cb: hasC ? fmtChange(r.b, r.c) : "",
      expected: r.isNew ? "—" : fmt(r.expected),
      variance: r.isNew || r.isRemoved ? "—" : `${r.variance > 0 ? "+" : ""}${fmt(r.variance)}`,
      shareA: r.shareA.toFixed(2) + "%",
      shareB: r.shareB.toFixed(2) + "%",
      vsSales: r.isNew || r.isRemoved ? "—" : (r.vsSales > 0 ? "+" : "") + r.vsSales.toFixed(1) + "%",
      contribution: r.contribution.toFixed(1) + "%",
      type: r.type.label,
      risk: r.risk.label,
    }));
    const expectedTotal = analysis.aTotal * (1 + analysis.salesGrowthPct / 100);
    const varianceTotal = analysis.bTotal - expectedTotal;
    rows.push({
      label: "الإجمالي", a: fmt(analysis.aTotal), b: fmt(analysis.bTotal),
      c: hasC ? fmt(analysis.cTotal) : "",
      change_ba: fmtChange(analysis.aTotal, analysis.bTotal),
      change_cb: hasC ? fmtChange(analysis.bTotal, analysis.cTotal) : "",
      expected: fmt(expectedTotal),
      variance: `${varianceTotal > 0 ? "+" : ""}${fmt(varianceTotal)}`,
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
      expected: "", variance: "",
      shareA: "", shareB: "", vsSales: "", contribution: "", type: "", risk: "",
      __rowType: "group-total",
    });
    rows.push({
      label: "نسبة المصاريف من المبيعات %",
      a: analysis.aPct.toFixed(2) + "%", b: analysis.bPct.toFixed(2) + "%",
      c: hasC ? analysis.cPct.toFixed(2) + "%" : "",
      change_ba: (analysis.bPct - analysis.aPct).toFixed(2) + "%",
      change_cb: hasC ? (analysis.cPct - analysis.bPct).toFixed(2) + "%" : "",
      expected: "", variance: "",
      shareA: "", shareB: "", vsSales: "", contribution: "", type: "", risk: "",
      __rowType: "group-total",
    });
    rows.push({
      label: "نقطة التعادل اليومية",
      a: fmt(analysis.aBreakEven), b: fmt(analysis.bBreakEven),
      c: hasC ? fmt(analysis.cBreakEven) : "",
      change_ba: fmtChange(analysis.aBreakEven, analysis.bBreakEven),
      change_cb: hasC ? fmtChange(analysis.bBreakEven, analysis.cBreakEven) : "",
      expected: "", variance: "",
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
      expected: "", variance: "",
      shareA: "", shareB: "", vsSales: "", contribution: "", type: "", risk: "",
      __rowType: "group-total",
    });
    if (analysis.expensePerExtraSale !== null) {
      rows.push({
        label: "مصروف إضافي لكل 1 جنيه مبيعات إضافية",
        a: "", b: analysis.expensePerExtraSale.toFixed(2),
        c: "", change_ba: `${(analysis.salesRetentionPct ?? 0).toFixed(1)}% احتفاظ`,
        change_cb: "", expected: "", variance: "",
        shareA: "", shareB: "", vsSales: "", contribution: "", type: "", risk: "",
        __rowType: "group-total",
      });
    }
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

  const handlePrintFull = () => {
    if (!analysis || !A || !B) return;
    const dateStr = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
    const logoSrc = `${window.location.origin}/logo.png`;
    const venueOf = (p: ComparablePeriod) => p.venue_type === "تيك اواي" ? "تيك اواي" : "صالة";

    const kpiRows = [
      { title: "المبيعات الشهرية المتوقعة", a: fmt(analysis.aSales), b: fmt(analysis.bSales), c: hasC ? fmt(analysis.cSales) : "", diff: fmtChange(analysis.aSales, analysis.bSales) },
      { title: "إجمالي المصاريف", a: fmt(analysis.aTotal), b: fmt(analysis.bTotal), c: hasC ? fmt(analysis.cTotal) : "", diff: fmtChange(analysis.aTotal, analysis.bTotal) },
      { title: "نسبة المصاريف من المبيعات %", a: analysis.aPct.toFixed(2)+"%", b: analysis.bPct.toFixed(2)+"%", c: hasC ? analysis.cPct.toFixed(2)+"%" : "", diff: (analysis.bPct-analysis.aPct).toFixed(2)+"%" },
      { title: "نقطة التعادل اليومية", a: fmt(analysis.aBreakEven), b: fmt(analysis.bBreakEven), c: hasC ? fmt(analysis.cBreakEven) : "", diff: fmtChange(analysis.aBreakEven, analysis.bBreakEven) },
      { title: "صافي الربح %", a: analysis.aNetProfitPct.toFixed(2)+"%", b: analysis.bNetProfitPct.toFixed(2)+"%", c: hasC ? analysis.cNetProfitPct.toFixed(2)+"%" : "", diff: (analysis.bNetProfitPct-analysis.aNetProfitPct).toFixed(2)+"%" },
    ];

    const cellOrDash = (p: ComparablePeriod | undefined, val: number, hideForTakeaway = false) => {
      if (!p) return "—";
      if (hideForTakeaway && p.venue_type === "تيك اواي") return "—";
      return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
    };

    const opRows = [
      { label: "نوع المكان", a: venueOf(A), b: venueOf(B), c: C ? venueOf(C) : "—", diff: "—" },
      { label: A.venue_type === "تيك اواي" || B.venue_type === "تيك اواي" ? "السعة / عدد الطلبات اليومي" : "السعة (Capacity)",
        a: cellOrDash(A, A.capacity), b: cellOrDash(B, B.capacity), c: C ? cellOrDash(C, C.capacity) : "", diff: fmtChange(A.capacity, B.capacity) },
      { label: "معدل الدوران", a: cellOrDash(A, A.turn_over, true), b: cellOrDash(B, B.turn_over, true), c: C ? cellOrDash(C, C.turn_over, true) : "",
        diff: (A.venue_type === "تيك اواي" || B.venue_type === "تيك اواي") ? "—" : fmtChange(A.turn_over, B.turn_over) },
      { label: "متوسط الفاتورة", a: fmt(A.avg_check), b: fmt(B.avg_check), c: C ? fmt(C.avg_check) : "", diff: fmtChange(A.avg_check, B.avg_check) },
      { label: "عدد الأيام", a: String(getDays(A.start_date, A.end_date)), b: String(getDays(B.start_date, B.end_date)), c: C ? String(getDays(C.start_date, C.end_date)) : "", diff: fmtChange(getDays(A.start_date, A.end_date), getDays(B.start_date, B.end_date)) },
      { label: "مبيعات يومية متوقعة", a: fmt(expectedDailySales(A)), b: fmt(expectedDailySales(B)), c: C ? fmt(expectedDailySales(C)) : "", diff: fmtChange(expectedDailySales(A), expectedDailySales(B)) },
      { label: "مؤشر الكفاءة (مصاريف/مبيعات)", a: analysis.aEfficiency.toFixed(4), b: analysis.bEfficiency.toFixed(4), c: hasC ? analysis.cEfficiency.toFixed(4) : "", diff: fmtChange(analysis.aEfficiency, analysis.bEfficiency) },
    ];

    const detailHead = `<tr>
      <th>البند</th><th>A</th><th>B</th>${hasC ? "<th>C</th>" : ""}<th>B عن A</th>${hasC ? "<th>C عن B</th>" : ""}
      <th>المتوقع</th><th>الفرق عن المتوقع</th>
      <th>% من مبيعات A</th><th>% من مبيعات B</th><th>vs نمو المبيعات</th><th>المساهمة %</th><th>التصنيف</th><th>الخطر</th>
    </tr>`;
    const detailBody = analysis.rows.map(r => {
      const changeBa = r.isNew ? `<span style="color:#1976d2;">جديد +${fmt(r.b)}</span>`
        : r.isRemoved ? `<span style="color:#7b1fa2;">ملغي −${fmt(r.a)}</span>`
        : fmtChange(r.a, r.b);
      const expectedCell = r.isNew ? "—" : fmt(r.expected);
      const varianceCell = r.isNew || r.isRemoved ? "—" : `${r.variance > 0 ? "+" : ""}${fmt(r.variance)}`;
      const vsSalesCell = r.isNew || r.isRemoved ? "—" : `${r.vsSales > 0 ? "+" : ""}${r.vsSales.toFixed(1)}%`;
      return `<tr>
      <td style="text-align:right;">${r.label}</td>
      <td>${fmt(r.a)}</td><td><b>${fmt(r.b)}</b></td>${hasC ? `<td><b>${fmt(r.c)}</b></td>` : ""}
      <td>${changeBa}</td>${hasC ? `<td>${fmtChange(r.b, r.c)}</td>` : ""}
      <td>${expectedCell}</td><td>${varianceCell}</td>
      <td>${r.shareA.toFixed(2)}%</td><td>${r.shareB.toFixed(2)}%</td>
      <td>${vsSalesCell}</td>
      <td>${r.contribution.toFixed(1)}%</td>
      <td>${r.type.label}</td><td>${r.risk.label}</td>
    </tr>`;
    }).join("") + (() => {
      const expectedT = analysis.aTotal * (1 + analysis.salesGrowthPct / 100);
      const varianceT = analysis.bTotal - expectedT;
      return `<tr style="font-weight:bold;background:#f0f0f0;">
      <td style="text-align:right;">الإجمالي</td>
      <td>${fmt(analysis.aTotal)}</td><td>${fmt(analysis.bTotal)}</td>${hasC ? `<td>${fmt(analysis.cTotal)}</td>` : ""}
      <td>${fmtChange(analysis.aTotal, analysis.bTotal)}</td>${hasC ? `<td>${fmtChange(analysis.bTotal, analysis.cTotal)}</td>` : ""}
      <td>${fmt(expectedT)}</td><td>${varianceT > 0 ? "+" : ""}${fmt(varianceT)}</td>
      <td>${analysis.aPct.toFixed(2)}%</td><td>${analysis.bPct.toFixed(2)}%</td><td>—</td><td>100%</td><td>—</td><td>—</td>
    </tr>`;
    })();

    const increasedHTML = analysis.increased.length
      ? `<ul>${analysis.increased.map(r => `<li>${r.label} <span style="color:#666;">(مساهمة ${r.contribution.toFixed(0)}%)</span> — <b style="color:#c0392b;">+${fmt(r.diff)} (${r.pct.toFixed(1)}%)</b></li>`).join("")}</ul>`
      : "<p>لا يوجد</p>";
    const decreasedHTML = analysis.decreased.length
      ? `<ul>${analysis.decreased.map(r => `<li>${r.label} — <b style="color:#1e8449;">${fmt(r.diff)} (${r.pct.toFixed(1)}%)</b></li>`).join("")}</ul>`
      : "<p>لا يوجد</p>";

    const recsHTML = `<ul>${analysis.recs.map(r => {
      const icon = r.type === "danger" ? "⚠️" : r.type === "warning" ? "⚠️" : r.type === "success" ? "✅" : "ℹ️";
      const bg = r.type === "danger" ? "#fdecea" : r.type === "warning" ? "#fff8e1" : r.type === "success" ? "#e8f5e9" : "#e3f2fd";
      return `<li style="padding:8px;margin:4px 0;background:${bg};border-radius:4px;list-style:none;">${icon} ${r.text}</li>`;
    }).join("")}</ul>`;

    const periodsInfoHTML = `
      <div style="display:flex;gap:10px;margin-bottom:12px;font-size:11px;">
        <div style="flex:1;border:1px solid #000;padding:6px;"><b>A:</b> ${A.name} <br/>${A.start_date} → ${A.end_date} <br/>نوع المكان: ${venueOf(A)}</div>
        <div style="flex:1;border:1px solid #000;padding:6px;"><b>B:</b> ${B.name} <br/>${B.start_date} → ${B.end_date} <br/>نوع المكان: ${venueOf(B)}</div>
        ${C ? `<div style="flex:1;border:1px solid #000;padding:6px;"><b>C:</b> ${C.name} <br/>${C.start_date} → ${C.end_date} <br/>نوع المكان: ${venueOf(C)}</div>` : ""}
      </div>`;

    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>مقارنة المصاريف الغير مباشرة</title>
<style>
  @font-face { font-family:'CairoLocal'; src:url('${window.location.origin}/fonts/Cairo-Regular.ttf') format('truetype'); font-display:swap; }
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'CairoLocal',sans-serif;direction:rtl;padding:15px;color:#000;background:#fff;font-size:11px;}
  @media print{@page{size:A4 landscape;margin:8mm;}body{padding:0;}}
  .header{display:flex;align-items:center;justify-content:center;gap:10px;border-bottom:1px solid #000;padding-bottom:8px;margin-bottom:10px;}
  .header img{width:60px;height:60px;object-fit:contain;}
  .header h1{font-size:16px;}.header p{font-size:10px;}
  h2{font-size:13px;margin:12px 0 6px;border-bottom:1px solid #999;padding-bottom:3px;}
  table{width:100%;border-collapse:collapse;margin-bottom:8px;}
  th,td{border:1px solid #000;padding:3px 5px;font-size:9.5px;text-align:center;}
  th{background:#eee;font-weight:bold;}
  .footer{text-align:center;margin-top:10px;font-size:8px;border-top:1px solid #000;padding-top:4px;}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
  .grid2 > div{border:1px solid #000;padding:6px;}
  .grid2 h3{font-size:11px;margin-bottom:4px;}
  ul{padding-right:18px;font-size:10px;}
  li{margin-bottom:3px;}
</style></head><body>
  <div class="header">
    <img src="${logoSrc}" />
    <div>
      <h1>📊 مقارنة بين الفترات — المصاريف الغير مباشرة</h1>
      <p>Cost Management System • ${dateStr}</p>
    </div>
  </div>

  ${periodsInfoHTML}

  <h2>📝 الملخص التنفيذي</h2>
  <div style="border:1px solid #000;padding:8px;background:#f8fbff;font-size:11px;line-height:1.8;margin-bottom:8px;">
    ${analysis.executiveSummary}
  </div>

  ${analysis.expensePerExtraSale !== null ? `
  <h2>⚡ المصروفات الإضافية لكل جنيه مبيعات إضافية</h2>
  <table>
    <thead><tr><th>مبيعات إضافية</th><th>مصاريف إضافية</th><th>تكلفة كل 1 جنيه مبيعات إضافية</th><th>نسبة الاحتفاظ بنمو المبيعات</th></tr></thead>
    <tbody><tr><td>${fmt(analysis.extraSales)}</td><td>${fmt(analysis.extraExpenses)}</td><td><b>${analysis.expensePerExtraSale.toFixed(2)} جنيه</b></td><td><b>${(analysis.salesRetentionPct ?? 0).toFixed(1)}%</b></td></tr></tbody>
  </table>` : ""}

  <h2>المؤشرات الرئيسية (KPIs)</h2>
  <table>
    <thead><tr><th>المؤشر</th><th>A</th><th>B</th>${hasC ? "<th>C</th>" : ""}<th>التغيير (B عن A)</th></tr></thead>
    <tbody>${kpiRows.map(k => `<tr><td style="text-align:right;font-weight:bold;">${k.title}</td><td>${k.a}</td><td><b>${k.b}</b></td>${hasC ? `<td><b>${k.c}</b></td>` : ""}<td>${k.diff}</td></tr>`).join("")}</tbody>
  </table>

  <h2>⚙️ بيانات التشغيل</h2>
  <table>
    <thead><tr><th>البيان</th><th>A</th><th>B</th>${hasC ? "<th>C</th>" : ""}<th>B عن A</th></tr></thead>
    <tbody>${opRows.map(r => `<tr><td style="text-align:right;font-weight:bold;">${r.label}</td><td>${r.a}</td><td><b>${r.b}</b></td>${hasC ? `<td><b>${r.c}</b></td>` : ""}<td>${r.diff}</td></tr>`).join("")}</tbody>
  </table>

  <h2>تفاصيل البنود — نمو المبيعات: ${analysis.salesGrowthPct > 0 ? "+" : ""}${analysis.salesGrowthPct.toFixed(1)}% | إجمالي زيادة المصاريف: ${analysis.totalIncrease > 0 ? "+" : ""}${fmt(analysis.totalIncrease)}</h2>
  <table><thead>${detailHead}</thead><tbody>${detailBody}</tbody></table>

  <div class="grid2">
    <div><h3 style="color:#c0392b;">🔺 أعلى 3 بنود زادت (B عن A)</h3>${increasedHTML}</div>
    <div><h3 style="color:#1e8449;">🔻 أعلى 3 بنود قلت (B عن A)</h3>${decreasedHTML}</div>
  </div>

  <h2>💡 توصيات وتحذيرات</h2>
  ${recsHTML}

  <div class="footer">Powered by Mohamed Abdel Aal</div>
  <script>
    (async function(){
      try{if(document.fonts&&document.fonts.ready)await document.fonts.ready;}catch(e){}
      window.print();
      window.onafterprint=function(){window.close();};
    })();
  </script>
</body></html>`;

    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <span>📊 مقارنة بين الفترات</span>
            {analysis && A && B && aId !== bId && (
              <div className="flex items-center gap-2">
                <button onClick={handlePrintFull} className="inline-flex items-center gap-1.5 h-9 px-3 text-sm border border-input bg-background hover:bg-accent rounded-md">
                  🖨️ طباعة شاملة
                </button>
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
                {/* Executive Summary */}
                <Card className="border-primary/40 bg-primary/5">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">📝 الملخص التنفيذي</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-sm leading-7">{analysis.executiveSummary}</p>
                  </CardContent>
                </Card>

                {/* Marginal Efficiency KPI */}
                {analysis.expensePerExtraSale !== null && (
                  <Card className="border-emerald-500/40 bg-emerald-500/5">
                    <CardHeader className="pb-2"><CardTitle className="text-sm">⚡ المصروفات الإضافية لكل جنيه مبيعات إضافية</CardTitle></CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                      <div>
                        <div className="text-muted-foreground text-xs mb-1">مبيعات إضافية</div>
                        <div className="font-bold text-base">{fmt(analysis.extraSales)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs mb-1">مصاريف إضافية</div>
                        <div className="font-bold text-base">{fmt(analysis.extraExpenses)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs mb-1">تكلفة كل 1 جنيه مبيعات إضافية</div>
                        <div className="font-bold text-base text-emerald-600">
                          {analysis.expensePerExtraSale.toFixed(2)} جنيه
                          <span className="text-xs text-muted-foreground mr-2">(تم الاحتفاظ بـ {(analysis.salesRetentionPct ?? 0).toFixed(1)}% من نمو المبيعات)</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

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
                          {(() => {
                            const venueOf = (p?: ComparablePeriod) => p ? (p.venue_type === "تيك اواي" ? "تيك اواي" : "صالة") : "—";
                            const isTake = (p?: ComparablePeriod) => p?.venue_type === "تيك اواي";
                            const anyTake = isTake(A) || isTake(B) || (hasC && isTake(C));
                            const cap = (p?: ComparablePeriod) => p ? p.capacity : 0;
                            const to = (p?: ComparablePeriod) => p ? p.turn_over : 0;
                            const ac = (p?: ComparablePeriod) => p ? p.avg_check : 0;
                            const days = (p?: ComparablePeriod) => p ? getDays(p.start_date, p.end_date) : 0;
                            const ds = (p?: ComparablePeriod) => p ? expectedDailySales(p) : 0;

                            const dashCell = (txt: string = "—") => <TableCell className="text-center text-muted-foreground">{txt}</TableCell>;
                            const numCell = (v: number, bold = false, dec = 2) => (
                              <TableCell className={`text-center ${bold ? "font-bold" : ""}`}>{v.toLocaleString(undefined, { maximumFractionDigits: dec })}</TableCell>
                            );

                            return (
                              <>
                                {/* Venue type row */}
                                <TableRow>
                                  <TableCell className="font-medium">نوع المكان</TableCell>
                                  <TableCell className="text-center">
                                    <Badge variant="outline" className={isTake(A) ? "text-orange-500 border-orange-500/40" : "text-blue-500 border-blue-500/40"}>{venueOf(A)}</Badge>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <Badge variant="outline" className={isTake(B) ? "text-orange-500 border-orange-500/40" : "text-blue-500 border-blue-500/40"}>{venueOf(B)}</Badge>
                                  </TableCell>
                                  {hasC && <TableCell className="text-center">
                                    <Badge variant="outline" className={isTake(C) ? "text-orange-500 border-orange-500/40" : "text-blue-500 border-blue-500/40"}>{venueOf(C)}</Badge>
                                  </TableCell>}
                                  <TableCell className="text-center text-xs text-muted-foreground">
                                    {venueOf(A) === venueOf(B) ? "نفس النوع" : "⚠️ نوعين مختلفين"}
                                  </TableCell>
                                </TableRow>
                                {/* Capacity */}
                                <TableRow>
                                  <TableCell className="font-medium">{anyTake ? "السعة / عدد الطلبات اليومي" : "السعة (Capacity)"}</TableCell>
                                  {numCell(cap(A))}{numCell(cap(B), true)}{hasC && numCell(cap(C), true)}
                                  <TableCell className="text-center"><ChangeCell a={cap(A)} b={cap(B)} /></TableCell>
                                </TableRow>
                                {/* Turn over — hidden value if takeaway */}
                                <TableRow>
                                  <TableCell className="font-medium">معدل الدوران {anyTake && <span className="text-xs text-muted-foreground">(للصالة فقط)</span>}</TableCell>
                                  {isTake(A) ? dashCell() : numCell(to(A))}
                                  {isTake(B) ? dashCell() : numCell(to(B), true)}
                                  {hasC && (isTake(C) ? dashCell() : numCell(to(C), true))}
                                  {(isTake(A) || isTake(B)) ? dashCell("—") : <TableCell className="text-center"><ChangeCell a={to(A)} b={to(B)} /></TableCell>}
                                </TableRow>
                                {/* Avg check */}
                                <TableRow>
                                  <TableCell className="font-medium">متوسط الفاتورة</TableCell>
                                  {numCell(ac(A))}{numCell(ac(B), true)}{hasC && numCell(ac(C), true)}
                                  <TableCell className="text-center"><ChangeCell a={ac(A)} b={ac(B)} /></TableCell>
                                </TableRow>
                                {/* Days */}
                                <TableRow>
                                  <TableCell className="font-medium">عدد الأيام</TableCell>
                                  {numCell(days(A))}{numCell(days(B), true)}{hasC && numCell(days(C), true)}
                                  <TableCell className="text-center"><ChangeCell a={days(A)} b={days(B)} /></TableCell>
                                </TableRow>
                                {/* Daily expected sales */}
                                <TableRow>
                                  <TableCell className="font-medium">مبيعات يومية متوقعة</TableCell>
                                  {numCell(ds(A))}{numCell(ds(B), true)}{hasC && numCell(ds(C), true)}
                                  <TableCell className="text-center"><ChangeCell a={ds(A)} b={ds(B)} /></TableCell>
                                </TableRow>
                                {/* Efficiency */}
                                <TableRow>
                                  <TableCell className="font-medium">مؤشر الكفاءة (مصاريف/مبيعات)</TableCell>
                                  {numCell(analysis.aEfficiency, false, 4)}{numCell(analysis.bEfficiency, true, 4)}{hasC && numCell(analysis.cEfficiency, true, 4)}
                                  <TableCell className="text-center"><ChangeCell a={analysis.aEfficiency} b={analysis.bEfficiency} /></TableCell>
                                </TableRow>
                              </>
                            );
                          })()}
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
                            <TableHead className="text-center">المتوقع (وفق نمو المبيعات)</TableHead>
                            <TableHead className="text-center">الفرق عن المتوقع</TableHead>
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
                            const varColor = r.variance > 0 ? "text-red-500" : r.variance < 0 ? "text-emerald-600" : "text-muted-foreground";
                            return (
                              <TableRow key={r.label}>
                                <TableCell className="font-medium">{r.label}</TableCell>
                                <TableCell className="text-center">{fmt(r.a)}</TableCell>
                                <TableCell className="text-center font-bold">{fmt(r.b)}</TableCell>
                                {hasC && <TableCell className="text-center font-bold">{fmt(r.c)}</TableCell>}
                                <TableCell className="text-center">
                                  {r.isNew ? (
                                    <span className="font-semibold text-blue-500">جديد +{fmt(r.b)}</span>
                                  ) : r.isRemoved ? (
                                    <span className="font-semibold text-purple-500">ملغي −{fmt(r.a)}</span>
                                  ) : (
                                    <ChangeCell a={r.a} b={r.b} />
                                  )}
                                </TableCell>
                                {hasC && <TableCell className="text-center"><ChangeCell a={r.b} b={r.c} /></TableCell>}
                                <TableCell className="text-center text-xs">{r.isNew ? "—" : fmt(r.expected)}</TableCell>
                                <TableCell className={`text-center text-xs font-bold ${varColor}`}>
                                  {r.isNew || r.isRemoved ? "—" : `${r.variance > 0 ? "+" : ""}${fmt(r.variance)}`}
                                </TableCell>
                                <TableCell className="text-center text-xs">{r.shareA.toFixed(2)}%</TableCell>
                                <TableCell className="text-center text-xs font-bold">{r.shareB.toFixed(2)}%</TableCell>
                                <TableCell className={`text-center text-xs font-bold ${vsColor}`}>{r.isNew || r.isRemoved ? "—" : `${r.vsSales > 0 ? "+" : ""}${r.vsSales.toFixed(1)}%`}</TableCell>
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
                            <TableCell className="text-center text-xs">{fmt(analysis.aTotal * (1 + analysis.salesGrowthPct / 100))}</TableCell>
                            <TableCell className="text-center text-xs">{(analysis.bTotal - analysis.aTotal * (1 + analysis.salesGrowthPct / 100)) > 0 ? "+" : ""}{fmt(analysis.bTotal - analysis.aTotal * (1 + analysis.salesGrowthPct / 100))}</TableCell>
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
