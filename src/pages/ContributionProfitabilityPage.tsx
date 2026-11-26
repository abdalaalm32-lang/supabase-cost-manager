import { useEffect, useMemo, useState } from "react";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { AlertTriangle, FileSpreadsheet, FileText, Loader2, Printer, TrendingUp, Wallet, Target, Percent, Package, Receipt, CircleDollarSign, Layers } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { buildContributionItems, getContributionExpenses, useContributionActivity, useContributionSources } from "@/hooks/useContributionData";
import { calculateContributionAnalysis, splitContributionExpenses } from "@/lib/contributionAnalysis";
import { exportToExcel, exportToPDF, type ExportColumn } from "@/lib/exportUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import logo from "@/assets/logo-3m.png";

const title = "تحليل المساهمة والربحية";
const money = (value: number | null) => value == null ? "غير متاح" : value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (value: number | null) => value == null ? "غير متاح" : `${money(value)}%`;
const columns: ExportColumn[] = [
  { key: "name", label: "اسم الصنف" }, { key: "quantity", label: "الكمية المباعة" }, { key: "price", label: "سعر البيع الفعلي" },
  { key: "revenue", label: "إجمالي المبيعات" }, { key: "directUnitCost", label: "التكلفة المباشرة للوحدة" },
  { key: "directTotal", label: "إجمالي التكلفة المباشرة" }, { key: "variableShare", label: "المصاريف المتغيرة" },
  { key: "variableTotal", label: "إجمالي التكلفة المتغيرة" }, { key: "unitContribution", label: "هامش المساهمة للوحدة" },
  { key: "contribution", label: "إجمالي هامش المساهمة" }, { key: "contributionPct", label: "نسبة المساهمة" },
  { key: "fixedShare", label: "نصيب الثابت المحمّل" }, { key: "net", label: "صافي الربح" }, { key: "netPct", label: "نسبة صافي الربح" },
];

export function ContributionProfitabilityPage() {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const [branchId, setBranchId] = useState(() => sessionStorage.getItem("menu_branch") ?? "all");
  const [periodId, setPeriodId] = useState(() => sessionStorage.getItem("menu_period") ?? "");
  const [allocation, setAllocation] = useState<"revenue" | "quantity">("revenue");
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const sources = useContributionSources(companyId);
  const periods = useMemo(() => (sources.data?.periods ?? []).filter(period => branchId === "all" ? period.branch_id == null : period.branch_id === branchId), [sources.data, branchId]);
  const period = periods.find(record => record.id === periodId);
  useEffect(() => {
    if (sources.data && branchId !== "all" && !sources.data.branches.some(branch => branch.id === branchId)) setBranchId("all");
    if (periods.length && !periods.some(record => record.id === periodId)) setPeriodId(periods[0].id);
  }, [sources.data, branchId, periods, periodId]);
  const activity = useContributionActivity(companyId, branchId, period);
  const items = useMemo(() => sources.data && activity.data && period ? buildContributionItems(sources.data, activity.data.activity, period) : [], [sources.data, activity.data, period]);
  const expenses = getContributionExpenses(period);
  const split = splitContributionExpenses(expenses);
  const days = period ? differenceInCalendarDays(parseISO(period.end_date), parseISO(period.start_date)) + 1 : 0;
  const analysis = calculateContributionAnalysis(items, split.fixed, split.variable, days, allocation);
  const missing = items.filter(item => item.missingCost);
  const incomplete = split.unresolved.length > 0 || missing.length > 0;
  const loading = sources.isLoading || activity.isLoading;
  const ready = Boolean(period && activity.data && !loading && !sources.error && !activity.error);
  const branchName = sources.data?.branches.find(branch => branch.id === branchId)?.name ?? "كل الفروع";
  const visible = analysis.rows.filter(row => row.name.includes(search.trim()) || row.code.includes(search.trim()));
  const allocationLabel = allocation === "revenue" ? "نسبة المبيعات الفعلية" : "نسبة الكميات المباعة";
  const kpis = [
    { label: "إجمالي المبيعات الفعلية", value: analysis.revenue, icon: Receipt, suffix: "ج.م" },
    { label: "إجمالي الكميات المباعة", value: analysis.quantity, icon: Package, suffix: "وحدة", quantity: true },
    { label: "إجمالي التكلفة المباشرة", value: missing.length ? null : analysis.direct, icon: Layers, suffix: "ج.م" },
    { label: "المصاريف غير المباشرة المتغيرة", value: split.unresolved.length ? null : analysis.variable, icon: Wallet, suffix: "ج.م" },
    { label: "إجمالي هامش المساهمة", value: incomplete ? null : analysis.contribution, icon: TrendingUp, suffix: "ج.م", primary: true },
    { label: "إجمالي المصاريف الثابتة", value: split.unresolved.length ? null : analysis.fixed, icon: CircleDollarSign, suffix: "ج.م" },
    { label: "صافي الربح التشغيلي", value: incomplete ? null : analysis.net, icon: TrendingUp, suffix: "ج.م", primary: true },
    { label: "نقطة التعادل الشهرية / للفترة", value: incomplete ? null : analysis.bep, icon: Target, suffix: "ج.م" },
    { label: "نقطة التعادل اليومية", value: incomplete ? null : analysis.dailyBep, icon: Target, suffix: "ج.م" },
    { label: "هامش الأمان", value: incomplete ? null : analysis.safetyPct, icon: Percent, suffix: "%" },
  ];
  const valueFor = (row: typeof analysis.rows[number], key: string) => {
    const value = row[key as keyof typeof row];
    if (key === "name") return row.name;
    if (key === "quantity") return row.quantity.toFixed(3);
    if (incomplete && !["price", "revenue"].includes(key)) return "غير متاح";
    if (typeof value !== "number") return "غير متاح";
    return key.endsWith("Pct") ? pct(value) : money(value);
  };
  const reportFilters = [
    { label: "الشركة", value: sources.data?.companyName ?? "" }, { label: "الفرع", value: branchName },
    { label: "الفترة", value: period ? `${period.name}: ${period.start_date} — ${period.end_date} (${days} يوم)` : "" },
    { label: "توزيع الثابت المحمّل", value: allocationLabel },
    { label: "مصدر التكلفة", value: "تكاليف المنيو الحالية بمتوسط تكلفة موقع البيع؛ ليست لقطة تاريخية" },
    { label: "المبيعات", value: "صافي مبيعات الأصناف بعد الخصم والمرتجعات؛ دون ضريبة أو رسوم توصيل" },
    ...kpis.map(kpi => ({ label: kpi.label, value: `${money(kpi.value)} ${kpi.value == null ? "" : kpi.suffix}` })),
    { label: "نسبة هامش المساهمة", value: incomplete ? "غير متاح" : pct(analysis.contributionPct) },
    ...expenses.filter(expense => expense.value !== 0).map(expense => {
      const itemSplit = splitContributionExpenses([expense]);
      return { label: `مصروف ${expense.name}`, value: `الإجمالي ${money(expense.value)} ج.م؛ ثابت ${money(itemSplit.unresolved.length ? null : itemSplit.fixed)}؛ متغير ${money(itemSplit.unresolved.length ? null : itemSplit.variable)}` };
    }),
    ...(incomplete ? [{ label: "تنبيه", value: `حساب الربحية غير مكتمل: ${[...split.unresolved, ...missing.map(item => item.name)].join("، ")}` }] : []),
  ];
  const reportRows = () => [
    ...visible.map(row => Object.fromEntries(columns.map(column => [column.key, valueFor(row, column.key)]))),
    { name: "الإجمالي المالي — كامل الفترة", quantity: "—", price: "—", directUnitCost: "—", revenue: money(analysis.revenue), directTotal: incomplete ? "غير متاح" : money(analysis.direct), variableShare: incomplete ? "غير متاح" : money(analysis.variable), variableTotal: incomplete ? "غير متاح" : money(analysis.direct + analysis.variable), contribution: incomplete ? "غير متاح" : money(analysis.contribution), contributionPct: incomplete ? "غير متاح" : pct(analysis.contributionPct), fixedShare: incomplete ? "غير متاح" : money(analysis.fixed), net: incomplete ? "غير متاح" : money(analysis.net), __rowType: "grand-total" },
  ];
  const exportReport = async (type: "pdf" | "excel") => {
    setExporting(true);
    try {
      await (type === "pdf" ? exportToPDF : exportToExcel)({ title: `${sources.data?.companyName ?? ""} — ${title}`, filename: `contribution-${period?.name ?? "analysis"}`, columns, data: reportRows(), filters: [...reportFilters, { label: "بحث الأصناف", value: search || "الكل" }] });
    } catch { toast.error("تعذر تصدير التقرير، حاول مرة أخرى"); }
    finally { setExporting(false); }
  };
  const print = () => {
    const popup = window.open("", "_blank");
    if (!popup) { toast.error("يرجى السماح بفتح نافذة الطباعة"); return; }
    const doc = popup.document;
    doc.title = title;
    doc.documentElement.dir = "rtl";
    doc.documentElement.lang = "ar";
    const style = doc.createElement("style");
    style.textContent = "@page{size:A3 landscape;margin:10mm}body{font-family:Arial;font-size:11px}table{border-collapse:collapse;width:100%;margin-top:15px}td,th{border:1px solid;padding:5px;text-align:center}h1{font-size:22px}img{width:65px}footer{text-align:center;margin-top:20px}section{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}tr{break-inside:avoid}";
    doc.head.append(style);
    const image = doc.createElement("img"); image.src = new URL(logo, window.location.origin).href; image.alt = "شعار النظام"; doc.body.append(image);
    const heading = doc.createElement("h1"); heading.textContent = title; doc.body.append(heading);
    const section = doc.createElement("section");
    for (const filter of reportFilters) { const entry = doc.createElement("div"); entry.textContent = `${filter.label}: ${filter.value}`; section.append(entry); }
    doc.body.append(section);
    const table = doc.createElement("table");
    const header = doc.createElement("thead"); const headerRow = doc.createElement("tr");
    for (const column of columns) { const cell = doc.createElement("th"); cell.textContent = column.label; headerRow.append(cell); }
    header.append(headerRow); table.append(header);
    const body = doc.createElement("tbody");
    for (const row of reportRows()) { const tr = doc.createElement("tr"); for (const column of columns) { const td = doc.createElement("td"); td.textContent = String((row as Record<string, unknown>)[column.key] ?? "—"); tr.append(td); } body.append(tr); }
    table.append(body); doc.body.append(table);
    const footer = doc.createElement("footer"); footer.textContent = `${new Date().toLocaleDateString("ar-EG")} — Powered by Mohamed Abdel Aal`; doc.body.append(footer);
    image.onload = () => { popup.focus(); popup.print(); }; image.onerror = () => popup.print();
    if (image.complete) { popup.focus(); popup.print(); }
  };
  return <div dir="rtl" className="space-y-6 p-4 md:p-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold">{title}</h1><p className="mt-1 text-sm text-muted-foreground" dir="ltr">Contribution &amp; Profitability Analysis</p></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={print} disabled={!ready}><Printer size={16} className="ml-2" />طباعة</Button>
        <Button variant="outline" size="sm" onClick={() => exportReport("pdf")} disabled={!ready || exporting}><FileText size={16} className="ml-2" />PDF</Button>
        <Button variant="outline" size="sm" onClick={() => exportReport("excel")} disabled={!ready || exporting}><FileSpreadsheet size={16} className="ml-2" />Excel</Button>
      </div>
    </header>
    <section className="grid grid-cols-1 gap-4 border-y py-4 md:grid-cols-3">
      <div className="space-y-2"><Label>الفرع</Label><Select value={branchId} onValueChange={value => { setBranchId(value); sessionStorage.setItem("menu_branch", value); }}><SelectTrigger aria-label="الفرع"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">كل الفروع</SelectItem>{sources.data?.branches.map(branch => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>الفترة المالية</Label><Select value={period?.id ?? ""} onValueChange={value => { setPeriodId(value); sessionStorage.setItem("menu_period", value); }}><SelectTrigger aria-label="الفترة المالية"><SelectValue placeholder="اختر فترة" /></SelectTrigger><SelectContent>{periods.map(record => <SelectItem key={record.id} value={record.id}>{record.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>توزيع المصاريف الثابتة على الأصناف</Label><Select value={allocation} onValueChange={value => setAllocation(value as "revenue" | "quantity")}><SelectTrigger aria-label="توزيع المصاريف الثابتة"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="revenue">حسب نسبة المبيعات الفعلية</SelectItem><SelectItem value="quantity">حسب نسبة الكميات المباعة</SelectItem></SelectContent></Select></div>
    </section>
    {period && <div className="flex flex-wrap gap-3 text-sm text-muted-foreground"><Badge variant="outline">{period.start_date} — {period.end_date}</Badge><span>{days} يوم</span><span>{activity.data?.invoiceCount ?? 0} فاتورة • {activity.data?.returnCount ?? 0} مرتجع</span><span>الجنيه المصري</span></div>}
    {(sources.error || activity.error) && <Alert variant="destructive"><AlertTriangle size={18} /><AlertTitle>تعذر تحميل البيانات</AlertTitle><AlertDescription>لم تظهر نتائج ناقصة. <Button variant="outline" size="sm" onClick={() => { sources.refetch(); activity.refetch(); }}>إعادة المحاولة</Button></AlertDescription></Alert>}
    {loading ? <div className="flex items-center justify-center gap-2 py-16"><Loader2 className="animate-spin" />جاري تحميل المبيعات والتكاليف</div> : !period ? <Alert><AlertTriangle size={18} /><AlertTitle>لا توجد فترة مصاريف مرتبطة بالاختيار الحالي</AlertTitle><AlertDescription>اختر فرعًا له فترة مالية؛ فترات الشركة غير المرتبطة بفرع تظهر عند اختيار كل الفروع.</AlertDescription></Alert> : ready && <>
      {incomplete && <Alert variant="destructive"><AlertTriangle size={18} /><AlertTitle>بيانات تكلفة غير مكتملة</AlertTitle><AlertDescription>{split.unresolved.length > 0 && <p>حدد الجزء الثابت والمتغير لهذه المصاريف في صفحة المصاريف غير المباشرة: {split.unresolved.join("، ")}.</p>}{missing.length > 0 && <p>أصناف مباعة دون ريسبي أو رابط تكلفة: {missing.map(item => item.name).join("، ")}.</p>}نتائج الربحية والتعادل غير متاحة حتى استكمال البيانات.</AlertDescription></Alert>}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.map(kpi => <Card key={kpi.label} className={kpi.primary ? "border-primary/40 bg-primary/5" : ""}><CardContent className="p-4"><div className="mb-3 flex items-start justify-between gap-2"><span className="text-xs leading-5 text-muted-foreground">{kpi.label}</span><kpi.icon size={18} className={kpi.primary ? "shrink-0 text-primary" : "shrink-0 text-muted-foreground"} /></div><div className={`break-words text-xl font-bold tabular-nums ${kpi.value != null && kpi.value < 0 ? "text-destructive" : ""}`} dir="ltr">{kpi.quantity && kpi.value != null ? kpi.value.toFixed(3) : money(kpi.value)}</div><span className="text-xs text-muted-foreground">{kpi.value == null ? "" : kpi.suffix}</span>{kpi.label === "إجمالي هامش المساهمة" && !incomplete && <div className="mt-1 text-xs text-primary">{pct(analysis.contributionPct)}</div>}</CardContent></Card>)}
      </section>
      <section className="border-y py-4 text-sm text-muted-foreground space-y-2">
        <p>المبيعات بعد الخصومات والمرتجعات، دون ضريبة أو رسوم توصيل. التكلفة من ريسبي المنيو ومتوسط تكلفة موقع البيع الحالي، وليست تكلفة تاريخية محفوظة وقت البيع.</p>
        <p>نصيب الثابت تكلفة محمّلة حسب {allocationLabel}، ولا يدخل في التكلفة المتغيرة؛ صافي ربح التشغيل يخصم مصاريف الفترة مرة واحدة.</p>
        {!incomplete && analysis.bep == null && <p className="text-destructive">لا يمكن تحديد نقطة تعادل مع غياب المبيعات أو هامش مساهمة غير موجب.</p>}
      </section>
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">تحليل ربحية الأصناف <Badge variant="secondary">{visible.length}</Badge></h2><Input className="w-full sm:w-64" aria-label="بحث باسم الصنف أو الكود" placeholder="بحث باسم الصنف أو الكود" value={search} onChange={event => setSearch(event.target.value)} /></div>
        <div className="overflow-x-auto rounded-md border"><Table className="min-w-[1850px]"><TableHeader><TableRow>{columns.map(column => <TableHead key={column.key} className="text-right whitespace-nowrap">{column.label}</TableHead>)}</TableRow></TableHeader><TableBody>
          {visible.map(row => <TableRow key={row.id}>{columns.map(column => <TableCell key={column.key} className={`whitespace-nowrap tabular-nums ${column.key === "name" ? "font-medium" : ""} ${column.key === "net" && row.net < 0 && !incomplete ? "text-destructive" : ""}`}>{valueFor(row, column.key)}</TableCell>)}</TableRow>)}
          {visible.length === 0 && <TableRow><TableCell colSpan={columns.length} className="text-center py-10 text-muted-foreground">لا توجد مبيعات أصناف مطابقة خلال الفترة المحددة</TableCell></TableRow>}
          <TableRow className="bg-muted/50 font-semibold">{columns.map(column => <TableCell key={column.key} className="whitespace-nowrap">{String((reportRows().at(-1) as Record<string, unknown>)?.[column.key] ?? "—")}</TableCell>)}</TableRow>
        </TableBody></Table></div>
      </section>
      <section className="space-y-3 border-t pt-4"><h2 className="font-semibold">المصاريف غير المباشرة للفترة</h2><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="text-right">المصروف</TableHead><TableHead className="text-right">التصنيف</TableHead><TableHead className="text-right">قيمة البند</TableHead><TableHead className="text-right">الجزء الثابت</TableHead><TableHead className="text-right">الجزء المتغير</TableHead></TableRow></TableHeader><TableBody>{expenses.filter(expense => expense.value !== 0).map(expense => { const itemSplit = splitContributionExpenses([expense]); return <TableRow key={expense.id}><TableCell>{expense.name}</TableCell><TableCell>{expense.category === "variable" ? "متغير" : expense.category === "semi_variable" ? "شبه متغير" : "ثابت"}</TableCell><TableCell>{money(expense.value)}</TableCell><TableCell>{money(itemSplit.unresolved.length ? null : itemSplit.fixed)}</TableCell><TableCell>{money(itemSplit.unresolved.length ? null : itemSplit.variable)}</TableCell></TableRow>; })}</TableBody></Table></div></section>
    </>}
  </div>;
}