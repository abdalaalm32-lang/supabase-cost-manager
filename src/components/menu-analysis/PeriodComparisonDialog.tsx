import React, { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingDown, TrendingUp, Minus, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { ExportButtons } from "@/components/ExportButtons";
import { PrintButton } from "@/components/PrintButton";

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
}

const NONE = "__none__";

const fmt = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

export const PeriodComparisonDialog: React.FC<Props> = ({ open, onOpenChange, periods, branches, defaultPeriodId }) => {
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
    const rows = labels.map(label => {
      const av = aBreak.find(x => x.label === label)?.value || 0;
      const bv = bBreak.find(x => x.label === label)?.value || 0;
      const cv = C ? (cBreak.find(x => x.label === label)?.value || 0) : 0;
      const diff = bv - av;
      const pct = av !== 0 ? (diff / Math.abs(av)) * 100 : (bv === 0 ? 0 : 100);
      return { label, a: av, b: bv, c: cv, diff, pct };
    });

    const aSales = monthlySales(A);
    const bSales = monthlySales(B);
    const cSales = C ? monthlySales(C) : 0;
    const aTotal = totalIndirect(A);
    const bTotal = totalIndirect(B);
    const cTotal = C ? totalIndirect(C) : 0;
    const aPct = aSales > 0 ? (aTotal / aSales) * 100 : 0;
    const bPct = bSales > 0 ? (bTotal / bSales) * 100 : 0;
    const cPct = cSales > 0 ? (cTotal / cSales) * 100 : 0;

    const increased = [...rows].filter(r => r.diff > 0).sort((x, y) => y.diff - x.diff).slice(0, 3);
    const decreased = [...rows].filter(r => r.diff < 0).sort((x, y) => x.diff - y.diff).slice(0, 3);

    const recs: { type: "danger" | "warning" | "success" | "info"; text: string }[] = [];
    const totalDiffPct = aTotal !== 0 ? ((bTotal - aTotal) / Math.abs(aTotal)) * 100 : 0;
    if (totalDiffPct >= 20) recs.push({ type: "danger", text: `إجمالي المصاريف زاد بنسبة ${totalDiffPct.toFixed(1)}% — راجع البنود اللي زادت بشكل كبير وحاول تخفيضها.` });
    else if (totalDiffPct >= 10) recs.push({ type: "warning", text: `إجمالي المصاريف زاد بنسبة ${totalDiffPct.toFixed(1)}% — انتبه لأي زيادة إضافية قد تأثر على الربحية.` });
    else if (totalDiffPct <= -5) recs.push({ type: "success", text: `إجمالي المصاريف قل بنسبة ${Math.abs(totalDiffPct).toFixed(1)}% — أداء ممتاز في تقليل التكاليف.` });

    for (const r of increased) {
      if (r.pct >= 25) recs.push({ type: "danger", text: `بند "${r.label}" زاد بنسبة ${r.pct.toFixed(1)}% (+${fmt(r.diff)}) — يحتاج مراجعة عاجلة.` });
    }
    const salesDiffPct = aSales !== 0 ? ((bSales - aSales) / Math.abs(aSales)) * 100 : 0;
    if (salesDiffPct <= -10) recs.push({ type: "warning", text: `المبيعات الشهرية المتوقعة قلت بنسبة ${Math.abs(salesDiffPct).toFixed(1)}% — راجع السعة، معدل الدوران، أو متوسط الفاتورة.` });
    if (bPct - aPct >= 5) recs.push({ type: "danger", text: `نسبة المصاريف الغير مباشرة من المبيعات ارتفعت من ${aPct.toFixed(1)}% إلى ${bPct.toFixed(1)}% — ده هيقلل صافي الربح.` });
    else if (bPct - aPct <= -3) recs.push({ type: "success", text: `نسبة المصاريف الغير مباشرة قلت من ${aPct.toFixed(1)}% إلى ${bPct.toFixed(1)}% — تحسن واضح في الكفاءة.` });

    if (C) {
      const cTotalDiffPct = bTotal !== 0 ? ((cTotal - bTotal) / Math.abs(bTotal)) * 100 : 0;
      if (cTotalDiffPct >= 15) recs.push({ type: "danger", text: `الفترة C: إجمالي المصاريف زاد ${cTotalDiffPct.toFixed(1)}% مقارنة بالفترة B — اتجاه تصاعدي ملحوظ.` });
      else if (cTotalDiffPct <= -5) recs.push({ type: "success", text: `الفترة C: إجمالي المصاريف قل ${Math.abs(cTotalDiffPct).toFixed(1)}% مقارنة بالفترة B — اتجاه إيجابي.` });
    }

    if (recs.length === 0) recs.push({ type: "info", text: "مفيش تغييرات جوهرية بين الفترات — الأداء مستقر." });

    return { rows, aSales, bSales, cSales, aTotal, bTotal, cTotal, aPct, bPct, cPct, increased, decreased, recs };
  }, [A, B, C]);

  // Export config
  const exportColumns = useMemo(() => {
    const cols = [
      { key: "label", label: "البند" },
      { key: "a", label: `A: ${A?.name || ""}` },
      { key: "b", label: `B: ${B?.name || ""}` },
    ];
    if (hasC) cols.push({ key: "c", label: `C: ${C?.name || ""}` });
    cols.push({ key: "change_ba", label: "التغيير B عن A" });
    if (hasC) cols.push({ key: "change_cb", label: "التغيير C عن B" });
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
    }));
    rows.push({
      label: "الإجمالي",
      a: fmt(analysis.aTotal),
      b: fmt(analysis.bTotal),
      c: hasC ? fmt(analysis.cTotal) : "",
      change_ba: fmtChange(analysis.aTotal, analysis.bTotal),
      change_cb: hasC ? fmtChange(analysis.bTotal, analysis.cTotal) : "",
      __rowType: "grand-total",
    });
    rows.push({
      label: "المبيعات الشهرية المتوقعة",
      a: fmt(analysis.aSales),
      b: fmt(analysis.bSales),
      c: hasC ? fmt(analysis.cSales) : "",
      change_ba: fmtChange(analysis.aSales, analysis.bSales),
      change_cb: hasC ? fmtChange(analysis.bSales, analysis.cSales) : "",
      __rowType: "group-total",
    });
    rows.push({
      label: "نسبة المصاريف من المبيعات %",
      a: analysis.aPct.toFixed(2) + "%",
      b: analysis.bPct.toFixed(2) + "%",
      c: hasC ? analysis.cPct.toFixed(2) + "%" : "",
      change_ba: (analysis.bPct - analysis.aPct).toFixed(2) + "%",
      change_cb: hasC ? (analysis.cPct - analysis.bPct).toFixed(2) + "%" : "",
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
    return list;
  }, [A, B, C, hasC]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <span>📊 مقارنة بين الفترات</span>
            {analysis && A && B && aId !== bId && (
              <div className="flex items-center gap-2">
                <PrintButton
                  data={exportData}
                  columns={exportColumns}
                  title="مقارنة المصاريف الغير مباشرة"
                  filters={exportFilters}
                />
                <ExportButtons
                  data={exportData}
                  columns={exportColumns}
                  filename="period_comparison"
                  title="مقارنة المصاريف الغير مباشرة"
                  filters={exportFilters}
                />
              </div>
            )}
          </DialogTitle>
        </DialogHeader>

        {sorted.length < 2 ? (
          <div className="py-12 text-center text-muted-foreground">
            تحتاج على الأقل فترتين تحليل عشان تعمل مقارنة.
          </div>
        ) : (
          <div className="space-y-6">
            {/* Period selectors */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">الفترة A (الأقدم)</label>
                <Select value={aId} onValueChange={setAId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {sorted.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name} — {branchName(p.branch_id)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {A && <p className="text-xs text-muted-foreground mt-1">{A.start_date} → {A.end_date}</p>}
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">الفترة B</label>
                <Select value={bId} onValueChange={setBId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {sorted.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name} — {branchName(p.branch_id)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {B && <p className="text-xs text-muted-foreground mt-1">{B.start_date} → {B.end_date}</p>}
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">الفترة C (اختياري)</label>
                <Select value={cId} onValueChange={setCId}>
                  <SelectTrigger><SelectValue placeholder="بدون" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— بدون —</SelectItem>
                    {sorted.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name} — {branchName(p.branch_id)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {C && <p className="text-xs text-muted-foreground mt-1">{C.start_date} → {C.end_date}</p>}
              </div>
            </div>

            {A && B && aId === bId && (
              <div className="p-4 border border-yellow-500/40 bg-yellow-500/10 rounded-lg text-sm text-yellow-700 dark:text-yellow-400">
                ⚠️ اخترت نفس الفترة في A و B — اختر فترتين مختلفتين.
              </div>
            )}

            {A && B && aId !== bId && analysis && (
              <>
                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">المبيعات الشهرية المتوقعة</CardTitle></CardHeader>
                    <CardContent className="space-y-1">
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">A:</span> <span>{fmt(analysis.aSales)}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">B:</span> <span className="font-bold">{fmt(analysis.bSales)}</span></div>
                      {hasC && <div className="flex justify-between text-sm"><span className="text-muted-foreground">C:</span> <span className="font-bold">{fmt(analysis.cSales)}</span></div>}
                      <div className="pt-2 border-t"><ChangeCell a={analysis.aSales} b={analysis.bSales} positive /></div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">إجمالي المصاريف الغير مباشرة</CardTitle></CardHeader>
                    <CardContent className="space-y-1">
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">A:</span> <span>{fmt(analysis.aTotal)}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">B:</span> <span className="font-bold">{fmt(analysis.bTotal)}</span></div>
                      {hasC && <div className="flex justify-between text-sm"><span className="text-muted-foreground">C:</span> <span className="font-bold">{fmt(analysis.cTotal)}</span></div>}
                      <div className="pt-2 border-t"><ChangeCell a={analysis.aTotal} b={analysis.bTotal} /></div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">نسبة المصاريف من المبيعات</CardTitle></CardHeader>
                    <CardContent className="space-y-1">
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">A:</span> <span>{analysis.aPct.toFixed(2)}%</span></div>
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">B:</span> <span className="font-bold">{analysis.bPct.toFixed(2)}%</span></div>
                      {hasC && <div className="flex justify-between text-sm"><span className="text-muted-foreground">C:</span> <span className="font-bold">{analysis.cPct.toFixed(2)}%</span></div>}
                      <div className="pt-2 border-t"><ChangeCell a={analysis.aPct} b={analysis.bPct} /></div>
                    </CardContent>
                  </Card>
                </div>

                {/* Detailed table */}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">تفاصيل البنود</CardTitle></CardHeader>
                  <CardContent>
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-right">البند</TableHead>
                            <TableHead className="text-center">الفترة A</TableHead>
                            <TableHead className="text-center">الفترة B</TableHead>
                            {hasC && <TableHead className="text-center">الفترة C</TableHead>}
                            <TableHead className="text-center">B عن A</TableHead>
                            {hasC && <TableHead className="text-center">C عن B</TableHead>}
                            <TableHead className="text-center">الحالة</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {analysis.rows.map(r => {
                            let badge: { text: string; variant: "destructive" | "secondary" | "default" | "outline"; className?: string } | null = null;
                            if (r.pct >= 20) badge = { text: "زيادة كبيرة", variant: "destructive" };
                            else if (r.pct >= 10) badge = { text: "انتبه", variant: "outline", className: "text-yellow-600 border-yellow-500/50" };
                            else if (r.pct <= -5) badge = { text: "تحسن", variant: "outline", className: "text-emerald-600 border-emerald-500/50" };
                            else badge = { text: "مستقر", variant: "secondary" };
                            return (
                              <TableRow key={r.label}>
                                <TableCell className="font-medium">{r.label}</TableCell>
                                <TableCell className="text-center">{fmt(r.a)}</TableCell>
                                <TableCell className="text-center font-bold">{fmt(r.b)}</TableCell>
                                {hasC && <TableCell className="text-center font-bold">{fmt(r.c)}</TableCell>}
                                <TableCell className="text-center"><ChangeCell a={r.a} b={r.b} /></TableCell>
                                {hasC && <TableCell className="text-center"><ChangeCell a={r.b} b={r.c} /></TableCell>}
                                <TableCell className="text-center">
                                  <Badge variant={badge.variant} className={badge.className}>{badge.text}</Badge>
                                </TableCell>
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
                            <TableCell />
                          </TableRow>
                        </TableBody>
                      </Table>
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
                              <span>{r.label}</span>
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
