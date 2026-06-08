import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  TrendingDown, TrendingUp, Minus, Loader2, Info, Printer, FileSpreadsheet, FileText,
  Lightbulb, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { exportToExcel, exportToPDF, type ExportColumn } from "@/lib/exportUtils";
import { toast } from "sonner";

export interface MenuBreakdownItem {
  id: string;
  name: string;
  code: string;
  category: string;
  classification: string;
  price: number;
  finalDirectCost: number;
  directCostPct: number;
  indirectExpenses: number;
  totalCost: number;
  netProfit: number;
  netPct: number;
}

export interface MenuBreakdownCategory {
  name: string;
  classification: string;
  price: number;
  direct: number;
  indirect: number;
  profit: number;
  directPct: number;
  indirectPct: number;
  netPct: number;
  itemCount: number;
}

export interface MenuBreakdown {
  totals: {
    price: number;
    direct: number;
    indirect: number;
    profit: number;
    directPct: number;
    indirectPct: number;
    netPct: number;
    itemCount: number;
    monthlySales: number;
  };
  categories: MenuBreakdownCategory[];
  items: MenuBreakdownItem[];
}

export interface ComparablePeriodLite {
  id: string;
  name: string;
  start_date: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periods: ComparablePeriodLite[];
  defaultPeriodId?: string | null;
  loadBreakdown: (periodId: string) => Promise<MenuBreakdown | null>;
}

const fmt = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number) => `${(Number.isFinite(n) ? n : 0).toFixed(2)}%`;

// a = current period, b = old period. diff = current - old (موجب = ارتفع، سالب = انخفض)
const Diff: React.FC<{ a: number; b: number; positiveIsGood?: boolean; isPct?: boolean }> = ({
  a, b, positiveIsGood = true, isPct = false,
}) => {
  const diff = a - b;
  const p = b !== 0 ? (diff / Math.abs(b)) * 100 : (a === 0 ? 0 : 100);
  const good = positiveIsGood ? diff >= 0 : diff <= 0;
  const color = diff === 0 ? "text-muted-foreground" : good ? "text-emerald-600" : "text-red-500";
  const Icon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
  return (
    <div className={`flex items-center justify-center gap-1 font-semibold ${color}`}>
      <Icon size={14} />
      <span>{diff > 0 ? "+" : ""}{isPct ? `${diff.toFixed(2)}%` : fmt(diff)}</span>
      {!isPct && <span className="text-xs">({diff > 0 ? "+" : ""}{p.toFixed(1)}%)</span>}
    </div>
  );
};

export const MenuAnalysisComparisonDialog: React.FC<Props> = ({
  open, onOpenChange, periods, defaultPeriodId, loadBreakdown,
}) => {
  const sorted = useMemo(
    () => [...periods].sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()),
    [periods]
  );

  const [aId, setAId] = useState<string>(() => defaultPeriodId || sorted[0]?.id || "");
  const [bId, setBId] = useState<string>(() => {
    const fallback = sorted.find(p => p.id !== (defaultPeriodId || sorted[0]?.id));
    return fallback?.id || "";
  });

  const [A, setA] = useState<MenuBreakdown | null>(null);
  const [B, setB] = useState<MenuBreakdown | null>(null);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);
  const [exporting, setExporting] = useState<null | "excel" | "pdf">(null);

  useEffect(() => {
    if (!open || !aId) { setA(null); return; }
    let cancelled = false;
    setLoadingA(true);
    loadBreakdown(aId).then(res => { if (!cancelled) setA(res); }).finally(() => { if (!cancelled) setLoadingA(false); });
    return () => { cancelled = true; };
  }, [open, aId, loadBreakdown]);

  useEffect(() => {
    if (!open || !bId) { setB(null); return; }
    let cancelled = false;
    setLoadingB(true);
    loadBreakdown(bId).then(res => { if (!cancelled) setB(res); }).finally(() => { if (!cancelled) setLoadingB(false); });
    return () => { cancelled = true; };
  }, [open, bId, loadBreakdown]);

  const aName = sorted.find(p => p.id === aId)?.name || "—";
  const bName = sorted.find(p => p.id === bId)?.name || "—";

  const KPIRow: React.FC<{ label: string; a: number; b: number; isPct?: boolean; positiveIsGood?: boolean }> = ({ label, a, b, isPct, positiveIsGood = true }) => (
    <TableRow>
      <TableCell className="font-medium">{label}</TableCell>
      <TableCell className="text-center">{isPct ? pct(a) : fmt(a)}</TableCell>
      <TableCell className="text-center">{isPct ? pct(b) : fmt(b)}</TableCell>
      <TableCell className="text-center"><Diff a={a} b={b} isPct={isPct} positiveIsGood={positiveIsGood} /></TableCell>
    </TableRow>
  );

  const categoryRows = useMemo(() => {
    if (!A || !B) return [];
    const names = Array.from(new Set([...A.categories.map(c => c.name), ...B.categories.map(c => c.name)]));
    return names.map(name => {
      const ac = A.categories.find(c => c.name === name);
      const bc = B.categories.find(c => c.name === name);
      return {
        name,
        classification: ac?.classification || bc?.classification || "",
        aPrice: ac?.price ?? 0,
        bPrice: bc?.price ?? 0,
        aDirect: ac?.direct ?? 0,
        bDirect: bc?.direct ?? 0,
        aDirectPct: ac?.directPct ?? 0,
        bDirectPct: bc?.directPct ?? 0,
        aNetPct: ac?.netPct ?? 0,
        bNetPct: bc?.netPct ?? 0,
        aProfit: ac?.profit ?? 0,
        bProfit: bc?.profit ?? 0,
        isNew: !ac && !!bc,
        isRemoved: !!ac && !bc,
      };
    });
  }, [A, B]);

  const itemRows = useMemo(() => {
    if (!A || !B) return { top: [] as any[], added: [] as any[], removed: [] as any[] };
    const aMap = new Map(A.items.map(i => [i.id, i] as const));
    const bMap = new Map(B.items.map(i => [i.id, i] as const));
    const allIds = Array.from(new Set([...aMap.keys(), ...bMap.keys()]));
    const rows = allIds.map(id => {
      const ai = aMap.get(id);
      const bi = bMap.get(id);
      const ref = bi || ai!;
      const aDP = ai?.directCostPct ?? 0;
      const bDP = bi?.directCostPct ?? 0;
      const aNP = ai?.netPct ?? 0;
      const bNP = bi?.netPct ?? 0;
      return {
        id, name: ref.name, code: ref.code, category: ref.category, classification: ref.classification,
        aPrice: ai?.price ?? 0, bPrice: bi?.price ?? 0,
        aDirect: ai?.finalDirectCost ?? 0, bDirect: bi?.finalDirectCost ?? 0,
        aDirectPct: aDP, bDirectPct: bDP, aNetPct: aNP, bNetPct: bNP,
        directPctDiff: bDP - aDP, netPctDiff: bNP - aNP,
        isNew: !ai && !!bi, isRemoved: !!ai && !bi,
      };
    });
    const added = rows.filter(r => r.isNew);
    const removed = rows.filter(r => r.isRemoved);
    const top = rows
      .filter(r => !r.isNew && !r.isRemoved)
      .sort((x, y) => Math.abs(y.directPctDiff) - Math.abs(x.directPctDiff));
    return { top, added, removed };
  }, [A, B]);

  // ===== Executive Summary & Recommendations =====
  const summary = useMemo(() => {
    if (!A || !B) return null;
    const directDiff = A.totals.directPct - B.totals.directPct; // current - old
    const profitDiff = A.totals.netPct - B.totals.netPct;
    const priceDiff = A.totals.price - B.totals.price;
    const itemsDiff = A.totals.itemCount - B.totals.itemCount;

    const recs: { type: "success" | "warning" | "danger" | "info"; text: string }[] = [];

    if (directDiff > 2) recs.push({ type: "danger", text: `ارتفعت نسبة التكلفة المباشرة بمقدار ${directDiff.toFixed(2)}% مقارنة بالفترة القديمة — راجع أسعار المواد والوصفات الأعلى تأثيراً.` });
    else if (directDiff < -2) recs.push({ type: "success", text: `انخفضت نسبة التكلفة المباشرة بمقدار ${Math.abs(directDiff).toFixed(2)}% — أداء ممتاز في ضبط التكاليف.` });
    else recs.push({ type: "info", text: `نسبة التكلفة المباشرة مستقرة (تغير ${directDiff.toFixed(2)}%).` });

    if (profitDiff > 2) recs.push({ type: "success", text: `تحسن صافي الربح بمقدار ${profitDiff.toFixed(2)}% — استمر في نفس الاستراتيجية.` });
    else if (profitDiff < -2) recs.push({ type: "danger", text: `تراجع صافي الربح بمقدار ${Math.abs(profitDiff).toFixed(2)}% — راجع التسعير والمصاريف.` });

    if (A.totals.netPct < 0) recs.push({ type: "danger", text: `صافي الربح الحالي سالب (${pct(A.totals.netPct)}) — مطلوب إجراء فوري لإعادة هيكلة التكاليف أو الأسعار.` });
    else if (A.totals.netPct < 10) recs.push({ type: "warning", text: `هامش الربح الحالي منخفض (${pct(A.totals.netPct)}) — يفضل أن يكون أعلى من 15%.` });

    if (A.totals.directPct > 40) recs.push({ type: "warning", text: `نسبة التكلفة المباشرة الحالية ${pct(A.totals.directPct)} تتجاوز المعدل المقبول (35-40%).` });

    // أكبر تصنيف تأثر بزيادة التكلفة
    const worstCat = [...categoryRows]
      .filter(c => !c.isNew && !c.isRemoved)
      .sort((x, y) => (x.bDirectPct - x.aDirectPct) - (y.bDirectPct - y.aDirectPct))[0];
    if (worstCat) {
      const d = worstCat.aDirectPct - worstCat.bDirectPct;
      if (d > 2) recs.push({ type: "warning", text: `تصنيف "${worstCat.name}" زادت نسبة تكلفته المباشرة بمقدار ${d.toFixed(2)}% — أعلى تصنيف تأثراً.` });
    }
    const bestCat = [...categoryRows]
      .filter(c => !c.isNew && !c.isRemoved)
      .sort((x, y) => (y.bDirectPct - y.aDirectPct) - (x.bDirectPct - x.aDirectPct))[0];
    if (bestCat) {
      const d = bestCat.bDirectPct - bestCat.aDirectPct;
      if (d > 2) recs.push({ type: "success", text: `تصنيف "${bestCat.name}" انخفضت نسبة تكلفته المباشرة بمقدار ${d.toFixed(2)}% — أفضل تصنيف تحسناً.` });
    }

    // أعلى صنف تأثر
    const worstItem = itemRows.top[0];
    if (worstItem && Math.abs(worstItem.directPctDiff) > 5) {
      if (worstItem.directPctDiff < 0) {
        recs.push({ type: "warning", text: `الصنف "${worstItem.name}" زادت نسبة تكلفته بمقدار ${Math.abs(worstItem.directPctDiff).toFixed(2)}% — أكبر تغير على مستوى الأصناف.` });
      } else {
        recs.push({ type: "success", text: `الصنف "${worstItem.name}" تحسنت نسبة تكلفته بمقدار ${worstItem.directPctDiff.toFixed(2)}%.` });
      }
    }

    if (itemRows.added.length > 0) recs.push({ type: "info", text: `تم إضافة ${itemRows.added.length} صنف جديد في الفترة الحالية لم يكن موجوداً في القديمة.` });
    if (itemRows.removed.length > 0) recs.push({ type: "info", text: `تم حذف/إيقاف ${itemRows.removed.length} صنف من الفترة القديمة.` });

    return { directDiff, profitDiff, priceDiff, itemsDiff, recs };
  }, [A, B, categoryRows, itemRows]);

  const filename = `مقارنة_تحليل_المنيو_${aName}_vs_${bName}`.replace(/\s+/g, "_");
  const title = `مقارنة تحليل المنيو: ${aName} (حالياً) vs ${bName} (قديماً)`;

  // ===== Build export rows =====
  const buildExportRows = () => {
    if (!A || !B || !summary) return { columns: [] as ExportColumn[], rows: [] as any[] };
    const columns: ExportColumn[] = [
      { key: "section", label: "القسم" },
      { key: "label", label: "البيان" },
      { key: "current", label: `حالياً (${aName})` },
      { key: "old", label: `قديماً (${bName})` },
      { key: "diff", label: "الفرق" },
    ];
    const rows: any[] = [];
    const push = (section: string, label: string, current: string, old: string, diff: string, type?: string) =>
      rows.push({ section, label, current, old, diff, __rowType: type });

    // KPIs
    push("المؤشرات الإجمالية", "إجمالي أسعار البيع", fmt(A.totals.price), fmt(B.totals.price), fmt(A.totals.price - B.totals.price));
    push("المؤشرات الإجمالية", "إجمالي التكلفة المباشرة", fmt(A.totals.direct), fmt(B.totals.direct), fmt(A.totals.direct - B.totals.direct));
    push("المؤشرات الإجمالية", "نسبة التكلفة المباشرة %", pct(A.totals.directPct), pct(B.totals.directPct), `${(A.totals.directPct - B.totals.directPct).toFixed(2)}%`);
    push("المؤشرات الإجمالية", "إجمالي المصاريف غير المباشرة", fmt(A.totals.indirect), fmt(B.totals.indirect), fmt(A.totals.indirect - B.totals.indirect));
    push("المؤشرات الإجمالية", "نسبة المصاريف غير المباشرة %", pct(A.totals.indirectPct), pct(B.totals.indirectPct), `${(A.totals.indirectPct - B.totals.indirectPct).toFixed(2)}%`);
    push("المؤشرات الإجمالية", "صافي الربح", fmt(A.totals.profit), fmt(B.totals.profit), fmt(A.totals.profit - B.totals.profit), "grand-total");
    push("المؤشرات الإجمالية", "نسبة صافي الربح %", pct(A.totals.netPct), pct(B.totals.netPct), `${(A.totals.netPct - B.totals.netPct).toFixed(2)}%`, "grand-total");
    push("المؤشرات الإجمالية", "عدد الأصناف", String(A.totals.itemCount), String(B.totals.itemCount), String(A.totals.itemCount - B.totals.itemCount));

    // Categories
    categoryRows.forEach(c => {
      push(
        "التصنيفات",
        `${c.name}${c.isNew ? " (جديد)" : c.isRemoved ? " (محذوف)" : ""}`,
        `سعر: ${fmt(c.aPrice)} | تكلفة: ${pct(c.aDirectPct)} | صافي: ${pct(c.aNetPct)}`,
        `سعر: ${fmt(c.bPrice)} | تكلفة: ${pct(c.bDirectPct)} | صافي: ${pct(c.bNetPct)}`,
        `تكلفة: ${(c.aDirectPct - c.bDirectPct).toFixed(2)}% | صافي: ${(c.aNetPct - c.bNetPct).toFixed(2)}%`,
      );
    });

    // All items
    itemRows.top.forEach(it => {
      push(
        "الأصناف (مرتبة بحجم تغير التكلفة)",
        `${it.name} (${it.category})`,
        `${fmt(it.aPrice)} | ${pct(it.aDirectPct)}`,
        `${fmt(it.bPrice)} | ${pct(it.bDirectPct)}`,
        `${(it.aDirectPct - it.bDirectPct).toFixed(2)}%`,
      );
    });

    itemRows.added.forEach(it => push("أصناف جديدة في الحالية", it.name, `${fmt(it.bPrice)} | ${pct(it.bDirectPct)}`, "—", "جديد"));
    itemRows.removed.forEach(it => push("أصناف اختفت من الحالية", it.name, "—", `${fmt(it.aPrice)} | ${pct(it.aDirectPct)}`, "محذوف"));

    // Recommendations
    summary.recs.forEach(r => push("الملخص والتوصيات", r.type === "danger" ? "⚠ تحذير" : r.type === "warning" ? "⚡ ملاحظة" : r.type === "success" ? "✓ إنجاز" : "ℹ معلومة", r.text, "", ""));

    return { columns, rows };
  };

  const handleExcel = async () => {
    if (!A || !B) return;
    try {
      setExporting("excel");
      const { columns, rows } = buildExportRows();
      await exportToExcel({ title, filename, columns, data: rows });
      toast.success("تم تصدير ملف Excel");
    } catch (e: any) {
      toast.error("فشل التصدير: " + (e?.message || ""));
    } finally { setExporting(null); }
  };

  const handlePdf = async () => {
    if (!A || !B) return;
    try {
      setExporting("pdf");
      const { columns, rows } = buildExportRows();
      await exportToPDF({ title, filename, columns, data: rows });
      toast.success("تم تصدير ملف PDF");
    } catch (e: any) {
      toast.error("فشل التصدير: " + (e?.message || ""));
    } finally { setExporting(null); }
  };

  const handlePrint = () => {
    if (!A || !B || !summary) return;
    const win = window.open("", "_blank", "width=1200,height=800");
    if (!win) return;

    const recIcon = (t: string) => t === "danger" ? "⚠" : t === "warning" ? "⚡" : t === "success" ? "✓" : "ℹ";
    const recColor = (t: string) => t === "danger" ? "#dc2626" : t === "warning" ? "#d97706" : t === "success" ? "#059669" : "#2563eb";

    const kpiRow = (label: string, a: number, b: number, isPct = false) => {
      const diff = a - b;
      const dStr = isPct ? `${diff.toFixed(2)}%` : fmt(diff);
      return `<tr><td>${label}</td><td>${isPct ? pct(a) : fmt(a)}</td><td>${isPct ? pct(b) : fmt(b)}</td><td style="color:${diff >= 0 ? "#059669" : "#dc2626"}">${diff > 0 ? "+" : ""}${dStr}</td></tr>`;
    };

    win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${title}</title>
      <style>
        @page { size: A4 landscape; margin: 10mm; }
        * { box-sizing: border-box; font-family: 'Cairo', Arial, sans-serif; }
        body { padding: 8px; color: #111; }
        h1 { font-size: 16px; text-align: center; margin: 0 0 4px; }
        h2 { font-size: 13px; margin: 14px 0 6px; border-bottom: 2px solid #333; padding-bottom: 3px; }
        .sub { text-align: center; font-size: 10px; color: #555; margin-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 10px; }
        th, td { border: 1px solid #999; padding: 4px 6px; text-align: center; }
        th { background: #f0f0f0; font-weight: 700; }
        .rec { border: 1px solid #ddd; border-right: 4px solid; padding: 6px 10px; margin: 4px 0; font-size: 11px; border-radius: 3px; }
        .footer { text-align: center; font-size: 9px; color: #666; margin-top: 12px; border-top: 1px solid #ccc; padding-top: 6px; }
      </style></head><body>
      <h1>${title}</h1>
      <div class="sub">تاريخ التقرير: ${new Date().toLocaleDateString("ar-EG")}</div>

      <h2>📊 المؤشرات الإجمالية</h2>
      <table>
        <thead><tr><th>المؤشر</th><th>حالياً (${aName})</th><th>قديماً (${bName})</th><th>الفرق</th></tr></thead>
        <tbody>
          ${kpiRow("إجمالي أسعار البيع", A.totals.price, B.totals.price)}
          ${kpiRow("إجمالي التكلفة المباشرة", A.totals.direct, B.totals.direct)}
          ${kpiRow("نسبة التكلفة المباشرة %", A.totals.directPct, B.totals.directPct, true)}
          ${kpiRow("إجمالي المصاريف غير المباشرة", A.totals.indirect, B.totals.indirect)}
          ${kpiRow("نسبة المصاريف غير المباشرة %", A.totals.indirectPct, B.totals.indirectPct, true)}
          ${kpiRow("صافي الربح", A.totals.profit, B.totals.profit)}
          ${kpiRow("نسبة صافي الربح %", A.totals.netPct, B.totals.netPct, true)}
          ${kpiRow("عدد الأصناف", A.totals.itemCount, B.totals.itemCount)}
        </tbody>
      </table>

      <h2>📁 مقارنة التصنيفات</h2>
      <table>
        <thead><tr><th>التصنيف</th><th>سعر حالياً</th><th>سعر قديماً</th><th>% مباشرة حالياً</th><th>% مباشرة قديماً</th><th>فرق %</th><th>% صافي حالياً</th><th>% صافي قديماً</th></tr></thead>
        <tbody>
          ${categoryRows.map(c => `<tr>
            <td>${c.name}${c.isNew ? " 🆕" : c.isRemoved ? " ✖" : ""}</td>
            <td>${fmt(c.aPrice)}</td><td>${fmt(c.bPrice)}</td>
            <td>${pct(c.aDirectPct)}</td><td>${pct(c.bDirectPct)}</td>
            <td style="color:${(c.aDirectPct - c.bDirectPct) <= 0 ? "#059669" : "#dc2626"}">${(c.aDirectPct - c.bDirectPct).toFixed(2)}%</td>
            <td>${pct(c.aNetPct)}</td><td>${pct(c.bNetPct)}</td>
          </tr>`).join("")}
        </tbody>
      </table>

      <h2>🍽 أكبر 15 صنف تغيرت نسبة تكلفته</h2>
      <table>
        <thead><tr><th>الصنف</th><th>التصنيف</th><th>سعر حالياً</th><th>سعر قديماً</th><th>% مباشرة حالياً</th><th>% مباشرة قديماً</th><th>فرق %</th></tr></thead>
        <tbody>
          ${itemRows.top.map(it => `<tr>
            <td>${it.name}</td><td>${it.category}</td>
            <td>${fmt(it.aPrice)}</td><td>${fmt(it.bPrice)}</td>
            <td>${pct(it.aDirectPct)}</td><td>${pct(it.bDirectPct)}</td>
            <td style="color:${(it.aDirectPct - it.bDirectPct) <= 0 ? "#059669" : "#dc2626"}">${(it.aDirectPct - it.bDirectPct).toFixed(2)}%</td>
          </tr>`).join("")}
        </tbody>
      </table>

      <h2>💡 الملخص التنفيذي والتوصيات</h2>
      ${summary.recs.map(r => `<div class="rec" style="border-right-color:${recColor(r.type)}"><strong style="color:${recColor(r.type)}">${recIcon(r.type)}</strong> ${r.text}</div>`).join("")}

      <div class="footer">Powered by Mohamed Abdel Aal — نظام إدارة التكاليف</div>
      <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 500); };</script>
    </body></html>`);
    win.document.close();
  };

  const ready = !!A && !!B && !loadingA && !loadingB;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between flex-wrap gap-2">
            <span>مقارنة تحليل المنيو بين فترتين</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={handlePrint} disabled={!ready}>
                <Printer size={14} className="ml-1" /> طباعة
              </Button>
              <Button size="sm" variant="outline" onClick={handleExcel} disabled={!ready || exporting !== null}>
                {exporting === "excel" ? <Loader2 size={14} className="ml-1 animate-spin" /> : <FileSpreadsheet size={14} className="ml-1" />}
                Excel
              </Button>
              <Button size="sm" variant="outline" onClick={handlePdf} disabled={!ready || exporting !== null}>
                {exporting === "pdf" ? <Loader2 size={14} className="ml-1 animate-spin" /> : <FileText size={14} className="ml-1" />}
                PDF
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Period pickers */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground mb-2">الفترة الحالية</p>
            <Select value={aId} onValueChange={setAId}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="اختر الفترة" /></SelectTrigger>
              <SelectContent>
                {sorted.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground mb-2">الفترة القديمة</p>
            <Select value={bId} onValueChange={setBId}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="اختر فترة للمقارنة" /></SelectTrigger>
              <SelectContent>
                {sorted.filter(p => p.id !== aId).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {(loadingA || loadingB) && (
          <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
            <Loader2 className="animate-spin" size={18} /> جاري حساب البيانات...
          </div>
        )}

        {ready && A && B && summary && (
          <Tabs defaultValue="summary" className="space-y-4">
            <TabsList>
              <TabsTrigger value="summary">الملخص</TabsTrigger>
              <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
              <TabsTrigger value="categories">التصنيفات</TabsTrigger>
              <TabsTrigger value="items">الأصناف</TabsTrigger>
            </TabsList>

            {/* === Summary === */}
            <TabsContent value="summary" className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2"><Lightbulb size={16} className="text-amber-500" /> الملخص التنفيذي</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-lg border p-3 bg-muted/20">
                      <p className="text-[11px] text-muted-foreground">تغير نسبة التكلفة المباشرة</p>
                      <p className={`text-lg font-bold ${summary.directDiff <= 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {summary.directDiff > 0 ? "+" : ""}{summary.directDiff.toFixed(2)}%
                      </p>
                    </div>
                    <div className="rounded-lg border p-3 bg-muted/20">
                      <p className="text-[11px] text-muted-foreground">تغير نسبة صافي الربح</p>
                      <p className={`text-lg font-bold ${summary.profitDiff >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {summary.profitDiff > 0 ? "+" : ""}{summary.profitDiff.toFixed(2)}%
                      </p>
                    </div>
                    <div className="rounded-lg border p-3 bg-muted/20">
                      <p className="text-[11px] text-muted-foreground">تغير إجمالي الأسعار</p>
                      <p className={`text-lg font-bold ${summary.priceDiff >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {summary.priceDiff > 0 ? "+" : ""}{fmt(summary.priceDiff)}
                      </p>
                    </div>
                    <div className="rounded-lg border p-3 bg-muted/20">
                      <p className="text-[11px] text-muted-foreground">تغير عدد الأصناف</p>
                      <p className={`text-lg font-bold ${summary.itemsDiff >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {summary.itemsDiff > 0 ? "+" : ""}{summary.itemsDiff}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2"><AlertTriangle size={16} className="text-amber-500" /> 💡 توصيات وتحذيرات</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {summary.recs.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">لا توجد توصيات.</p>}
                  {summary.recs.map((r, i) => {
                    const Icon = r.type === "danger" ? AlertTriangle : r.type === "warning" ? AlertTriangle : r.type === "success" ? CheckCircle2 : Info;
                    const colors = r.type === "danger"
                      ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
                      : r.type === "warning"
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                      : r.type === "success"
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300";
                    return (
                      <div key={i} className={`flex items-start gap-2 p-3 rounded-md border-r-4 ${colors}`}>
                        <Icon size={16} className="mt-0.5 flex-shrink-0" />
                        <span className="text-sm">{r.text}</span>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </TabsContent>

            {/* === Overview === */}
            <TabsContent value="overview" className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">المؤشرات الإجمالية</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>المؤشر</TableHead>
                        <TableHead className="text-center">(حالياً) {aName}</TableHead>
                        <TableHead className="text-center">(قديماً) {bName}</TableHead>
                        <TableHead className="text-center">الفرق</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <KPIRow label="إجمالي أسعار البيع (Selling Price)" a={A.totals.price} b={B.totals.price} />
                      <KPIRow label="إجمالي التكلفة المباشرة (Direct Cost)" a={A.totals.direct} b={B.totals.direct} positiveIsGood={false} />
                      <KPIRow label="نسبة التكلفة المباشرة %" a={A.totals.directPct} b={B.totals.directPct} isPct positiveIsGood={false} />
                      <KPIRow label="إجمالي المصاريف غير المباشرة" a={A.totals.indirect} b={B.totals.indirect} positiveIsGood={false} />
                      <KPIRow label="نسبة المصاريف غير المباشرة %" a={A.totals.indirectPct} b={B.totals.indirectPct} isPct positiveIsGood={false} />
                      <KPIRow label="صافي الربح" a={A.totals.profit} b={B.totals.profit} />
                      <KPIRow label="نسبة صافي الربح %" a={A.totals.netPct} b={B.totals.netPct} isPct />
                      <KPIRow label="عدد الأصناف" a={A.totals.itemCount} b={B.totals.itemCount} />
                      <KPIRow label="المبيعات المتوقعة الشهرية" a={A.totals.monthlySales} b={B.totals.monthlySales} />
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <div className="text-[11px] text-muted-foreground bg-blue-500/5 border border-blue-500/20 rounded p-2 flex items-start gap-2">
                <Info size={14} className="mt-0.5 flex-shrink-0" />
                <span>المقارنة مبنية على نفس قوائم الأصناف الحالية (فلتر الفرع/التصنيف) مع تطبيق إعدادات كل فترة (المستهلكات، التغليف، التكلفة الإضافية، المصاريف غير المباشرة).</span>
              </div>
            </TabsContent>

            {/* === Categories === */}
            <TabsContent value="categories" className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">مقارنة على مستوى التصنيف (Category)</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>التصنيف</TableHead>
                          <TableHead className="text-center">القسم</TableHead>
                          <TableHead className="text-center">سعر البيع (حالياً)</TableHead>
                          <TableHead className="text-center">سعر البيع (قديماً)</TableHead>
                          <TableHead className="text-center">% تكلفة مباشرة (حالياً)</TableHead>
                          <TableHead className="text-center">% تكلفة مباشرة (قديماً)</TableHead>
                          <TableHead className="text-center">فرق %</TableHead>
                          <TableHead className="text-center">% صافي ربح (حالياً)</TableHead>
                          <TableHead className="text-center">% صافي ربح (قديماً)</TableHead>
                          <TableHead className="text-center">فرق %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {categoryRows.map(r => (
                          <TableRow key={r.name}>
                            <TableCell className="font-medium">
                              {r.name}
                              {r.isNew && <Badge variant="outline" className="ml-2 text-[10px] text-blue-500 border-blue-500/50">🆕 جديد</Badge>}
                              {r.isRemoved && <Badge variant="outline" className="ml-2 text-[10px] text-purple-500 border-purple-500/50">✖ محذوف</Badge>}
                            </TableCell>
                            <TableCell className="text-center text-xs">{r.classification || "—"}</TableCell>
                            <TableCell className="text-center">{fmt(r.aPrice)}</TableCell>
                            <TableCell className="text-center">{fmt(r.bPrice)}</TableCell>
                            <TableCell className="text-center">{pct(r.aDirectPct)}</TableCell>
                            <TableCell className="text-center">{pct(r.bDirectPct)}</TableCell>
                            <TableCell className="text-center"><Diff a={r.aDirectPct} b={r.bDirectPct} isPct positiveIsGood={false} /></TableCell>
                            <TableCell className="text-center">{pct(r.aNetPct)}</TableCell>
                            <TableCell className="text-center">{pct(r.bNetPct)}</TableCell>
                            <TableCell className="text-center"><Diff a={r.aNetPct} b={r.bNetPct} isPct /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* === Items === */}
            <TabsContent value="items" className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">أكبر 15 صنف تغيّرت نسبة تكلفته المباشرة</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>الصنف</TableHead>
                          <TableHead className="text-center">التصنيف</TableHead>
                          <TableHead className="text-center">سعر (حالياً)</TableHead>
                          <TableHead className="text-center">سعر (قديماً)</TableHead>
                          <TableHead className="text-center">% مباشرة (حالياً)</TableHead>
                          <TableHead className="text-center">% مباشرة (قديماً)</TableHead>
                          <TableHead className="text-center">فرق %</TableHead>
                          <TableHead className="text-center">% صافي (قديماً)</TableHead>
                          <TableHead className="text-center">فرق صافي %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itemRows.top.length === 0 ? (
                          <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-4">لا توجد أصناف مشتركة بين الفترتين.</TableCell></TableRow>
                        ) : itemRows.top.map(r => (
                          <TableRow key={r.id}>
                            <TableCell>
                              <div className="font-medium text-sm">{r.name}</div>
                              <div className="text-[10px] text-muted-foreground">{r.category} {r.code ? `• ${r.code}` : ""}</div>
                            </TableCell>
                            <TableCell className="text-center text-xs">{r.classification || "—"}</TableCell>
                            <TableCell className="text-center">{fmt(r.aPrice)}</TableCell>
                            <TableCell className="text-center">{fmt(r.bPrice)}</TableCell>
                            <TableCell className="text-center">{pct(r.aDirectPct)}</TableCell>
                            <TableCell className="text-center">{pct(r.bDirectPct)}</TableCell>
                            <TableCell className="text-center"><Diff a={r.aDirectPct} b={r.bDirectPct} isPct positiveIsGood={false} /></TableCell>
                            <TableCell className="text-center">{pct(r.bNetPct)}</TableCell>
                            <TableCell className="text-center"><Diff a={r.aNetPct} b={r.bNetPct} isPct /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-blue-500">🆕 أصناف جديدة في القديمة</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {itemRows.added.length === 0 ? (
                      <p className="text-center text-muted-foreground text-sm py-4">لا يوجد</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>الصنف</TableHead>
                            <TableHead className="text-center">السعر</TableHead>
                            <TableHead className="text-center">% مباشرة</TableHead>
                            <TableHead className="text-center">% صافي</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {itemRows.added.map(r => (
                            <TableRow key={r.id}>
                              <TableCell>
                                <div className="font-medium text-sm">{r.name}</div>
                                <div className="text-[10px] text-muted-foreground">{r.category}</div>
                              </TableCell>
                              <TableCell className="text-center">{fmt(r.bPrice)}</TableCell>
                              <TableCell className="text-center">{pct(r.bDirectPct)}</TableCell>
                              <TableCell className="text-center">{pct(r.bNetPct)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-purple-500">✖ أصناف اختفت في القديمة</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {itemRows.removed.length === 0 ? (
                      <p className="text-center text-muted-foreground text-sm py-4">لا يوجد</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>الصنف</TableHead>
                            <TableHead className="text-center">السعر</TableHead>
                            <TableHead className="text-center">% مباشرة</TableHead>
                            <TableHead className="text-center">% صافي</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {itemRows.removed.map(r => (
                            <TableRow key={r.id}>
                              <TableCell>
                                <div className="font-medium text-sm">{r.name}</div>
                                <div className="text-[10px] text-muted-foreground">{r.category}</div>
                              </TableCell>
                              <TableCell className="text-center">{fmt(r.aPrice)}</TableCell>
                              <TableCell className="text-center">{pct(r.aDirectPct)}</TableCell>
                              <TableCell className="text-center">{pct(r.aNetPct)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};
