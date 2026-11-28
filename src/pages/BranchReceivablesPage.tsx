import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Wallet, HandCoins, AlertCircle, CheckCircle2, Plus, Trash2, Building2, Search, Printer } from "lucide-react";
import { ExportButtons } from "@/components/ExportButtons";
import { toast } from "sonner";
import { allocateCollections, invoiceAmount, isWithinDateRange, payStatus, type PayStatus } from "@/lib/branchReceivables";

const fmt = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n || 0);
const statusLabel: Record<PayStatus, string> = { unpaid: "غير محصّل", partial: "محصّل جزئياً", paid: "تم التحصيل" };
const statusVariant: Record<PayStatus, "destructive" | "secondary" | "default"> = { unpaid: "destructive", partial: "secondary", paid: "default" };

export const BranchReceivablesPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const qc = useQueryClient();
  const [branchFilter, setBranchFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | PayStatus>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ branch_id: "", transfer_id: "none", amount: "", payment_date: new Date().toISOString().slice(0, 10), payment_method: "نقدي", notes: "" });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: branches = [] } = useQuery({ queryKey: ["branches-lite", companyId], enabled: !!companyId, queryFn: async () => (await supabase.from("branches").select("id, name, code").eq("company_id", companyId!)).data ?? [] });
  const { data: warehouses = [] } = useQuery({ queryKey: ["warehouses-lite", companyId], enabled: !!companyId, queryFn: async () => (await supabase.from("warehouses").select("id, name, code").eq("company_id", companyId!)).data ?? [] });
  const { data: policies = [] } = useQuery({ queryKey: ["branch-policies-lite", companyId], enabled: !!companyId, queryFn: async () => ((await (supabase as any).from("branch_supply_policies").select("branch_id, transportation_cost, loading_cost, is_active").eq("company_id", companyId)).data ?? []) });
  const { data: transfers = [] } = useQuery({ queryKey: ["supply-transfers", companyId], enabled: !!companyId, queryFn: async () => (await supabase.from("transfers").select("*").eq("company_id", companyId!).order("created_at", { ascending: false })).data ?? [] });
  const { data: collections = [] } = useQuery({ queryKey: ["branch-collections", companyId], enabled: !!companyId, queryFn: async () => {
    const { data, error } = await (supabase as any).from("branch_collections").select("*").eq("company_id", companyId).order("payment_date", { ascending: false });
    if (error) throw error; return data ?? [];
  } });

  const branchName = (id: string) => (branches as any[]).find((b) => b.id === id)?.name ?? "—";

  const invoices = useMemo(() => {
    const wh = new Set((warehouses as any[]).map((w) => w.id));
    const br = new Set((branches as any[]).map((b) => b.id));
    const pol: Record<string, any> = {};
    (policies as any[]).forEach((p) => (pol[p.branch_id] = p));
    return (transfers as any[])
      .filter((t) => wh.has(t.source_id) && br.has(t.destination_id) && t.status === "مكتمل")
      .map((t) => {
        const p = pol[t.destination_id]; const active = p?.is_active !== false;
        const transport = Number(t.transportation_cost ?? 0) > 0 ? Number(t.transportation_cost) : active ? Number(p?.transportation_cost ?? 0) : 0;
        const loading = Number(t.loading_cost ?? 0) > 0 ? Number(t.loading_cost) : active ? Number(p?.loading_cost ?? 0) : 0;
        return { id: t.id, branch_id: t.destination_id, date: t.date, record_number: t.record_number, amount: invoiceAmount(Number(t.total_cost ?? 0), transport, loading) };
      });
  }, [transfers, warehouses, branches, policies]);

  const { paid } = useMemo(() => allocateCollections(invoices, collections as any[]), [invoices, collections]);

  const allRows = useMemo(() => invoices.map((i) => {
    const p = paid.get(i.id) ?? 0;
    return { ...i, paid: p, remaining: Math.max(i.amount - p, 0), status: payStatus(i.amount, p) };
  }), [invoices, paid]);

  const rows = useMemo(
    () => allRows.filter((r) => isWithinDateRange(r.date, fromDate, toDate)),
    [allRows, fromDate, toDate],
  );

  const filtered = rows.filter((r) =>
    (branchFilter === "all" || r.branch_id === branchFilter) &&
    (statusFilter === "all" || r.status === statusFilter) &&
    (!search.trim() || (r.record_number ?? "").toLowerCase().includes(search.trim().toLowerCase())));

  const filteredCollections = (collections as any[]).filter((c) =>
    (branchFilter === "all" || c.branch_id === branchFilter) &&
    isWithinDateRange(c.payment_date, fromDate, toDate));

  const branchSummary = useMemo(() => (branches as any[]).map((b) => {
    const list = rows.filter((r) => r.branch_id === b.id);
    const total = list.reduce((s, r) => s + r.amount, 0);
    const collected = list.reduce((s, r) => s + r.paid, 0);
    const remaining = list.reduce((s, r) => s + r.remaining, 0);
    return { id: b.id, name: b.name, count: list.length, total, collected, remaining, status: payStatus(total, collected) };
  }).filter((b) => b.count > 0), [branches, rows]);

  const scoped = branchSummary.filter((b) => branchFilter === "all" || b.id === branchFilter);
  const kpi = {
    total: scoped.reduce((s, b) => s + b.total, 0),
    collected: scoped.reduce((s, b) => s + b.collected, 0),
    remaining: scoped.reduce((s, b) => s + b.remaining, 0),
  };
  const rate = kpi.total > 0 ? (kpi.collected / kpi.total) * 100 : 0;

  const openInvoicesForBranch = allRows.filter((r) => r.branch_id === form.branch_id && r.remaining > 0);

  const save = async () => {
    const amount = Number(form.amount);
    if (!form.branch_id || !(amount > 0)) { toast.error("اختر الفرع واكتب مبلغاً صحيحاً"); return; }
    setSaving(true);
    const { error } = await (supabase as any).from("branch_collections").insert({
      company_id: companyId, branch_id: form.branch_id, transfer_id: form.transfer_id === "none" ? null : form.transfer_id,
      amount, payment_date: form.payment_date, payment_method: form.payment_method, notes: form.notes || null, created_by: auth.user?.id ?? null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("تم تسجيل التحصيل");
    setOpen(false);
    setForm((f) => ({ ...f, amount: "", notes: "", transfer_id: "none" }));
    qc.invalidateQueries({ queryKey: ["branch-collections"] });
  };

  const remove = async () => {
    if (!deleteId) return;
    const { error } = await (supabase as any).from("branch_collections").delete().eq("id", deleteId);
    setDeleteId(null);
    if (error) { toast.error(error.message); return; }
    toast.success("تم حذف التحصيل");
    qc.invalidateQueries({ queryKey: ["branch-collections"] });
  };

  const recordOf = (id: string | null) => (id ? invoices.find((i) => i.id === id)?.record_number ?? "—" : "دفعة على الحساب");
  const periodLabel = fromDate || toDate ? `${fromDate || "من البداية"} — ${toDate || "حتى الآن"}` : "كل الفترات";

  const handlePrint = () => {
    if (filtered.length === 0) { toast.error("لا توجد فواتير للطباعة"); return; }
    const popup = window.open("", "_blank");
    if (!popup) { toast.error("يرجى السماح بفتح نافذة الطباعة"); return; }
    const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char] ?? char));
    const printedTotal = filtered.reduce((sum, row) => sum + row.amount, 0);
    const printedPaid = filtered.reduce((sum, row) => sum + row.paid, 0);
    const printedRemaining = filtered.reduce((sum, row) => sum + row.remaining, 0);
    const summaryRows = scoped.map((branch) => `<tr><td>${esc(branch.name)}</td><td>${branch.count}</td><td>${fmt(branch.total)}</td><td>${fmt(branch.collected)}</td><td>${fmt(branch.remaining)}</td><td>${statusLabel[branch.status]}</td></tr>`).join("");
    const invoiceRows = filtered.map((row, index) => `<tr><td>${index + 1}</td><td>${esc(row.record_number ?? "—")}</td><td>${esc(row.date)}</td><td>${esc(branchName(row.branch_id))}</td><td>${fmt(row.amount)}</td><td>${fmt(row.paid)}</td><td>${fmt(row.remaining)}</td><td>${statusLabel[row.status]}</td></tr>`).join("");
    popup.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>مديونية الفروع</title>
      <style>
        @font-face{font-family:CairoLocal;src:url('${window.location.origin}/fonts/Cairo-Regular.ttf') format('truetype')}
        *{box-sizing:border-box}body{font-family:CairoLocal,sans-serif;direction:rtl;padding:18px;color:#000;background:#fff;font-size:11px}
        @media print{@page{size:landscape;margin:9mm}body{padding:0}}
        .header{display:flex;align-items:center;justify-content:center;gap:14px;text-align:center;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:12px}
        .header img{width:58px;height:58px;object-fit:contain}.header h1{font-size:20px;margin:0 0 4px}.meta{color:#444;font-size:10px}
        .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}.kpi{border:1px solid #777;padding:8px;text-align:center}.kpi b{display:block;font-size:15px;margin-top:3px}
        h2{font-size:14px;margin:14px 0 6px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #333;padding:5px;text-align:center}th{background:#eee}tfoot td{font-weight:bold;background:#f5f5f5}
        .footer{text-align:center;border-top:1px solid #333;margin-top:14px;padding-top:6px;font-size:9px}
      </style></head><body>
      <div class="header"><img src="${window.location.origin}/logo.png" alt="الشعار"><div><h1>تقرير مديونية الفروع</h1><div class="meta">الفترة: ${esc(periodLabel)} • الفرع: ${esc(branchFilter === "all" ? "كل الفروع" : branchName(branchFilter))} • الحالة: ${statusFilter === "all" ? "كل الحالات" : statusLabel[statusFilter]} • تاريخ الطباعة: ${new Date().toLocaleDateString("ar-EG")}</div></div></div>
      <div class="kpis"><div class="kpi">إجمالي الفواتير<b>${fmt(kpi.total)} ج.م</b></div><div class="kpi">إجمالي المحصّل<b>${fmt(kpi.collected)} ج.م</b></div><div class="kpi">المتبقي على الفروع<b>${fmt(kpi.remaining)} ج.م</b></div><div class="kpi">نسبة التحصيل<b>${rate.toFixed(1)}%</b></div></div>
      <h2>ملخص الفروع</h2><table><thead><tr><th>الفرع</th><th>عدد الفواتير</th><th>الإجمالي</th><th>المحصّل</th><th>المتبقي</th><th>الحالة</th></tr></thead><tbody>${summaryRows}</tbody></table>
      <h2>الفواتير</h2><table><thead><tr><th>م</th><th>رقم الفاتورة</th><th>التاريخ</th><th>الفرع</th><th>القيمة</th><th>المحصّل</th><th>المتبقي</th><th>الحالة</th></tr></thead><tbody>${invoiceRows}</tbody><tfoot><tr><td colspan="4">إجمالي الفواتير المعروضة</td><td>${fmt(printedTotal)}</td><td>${fmt(printedPaid)}</td><td>${fmt(printedRemaining)}</td><td>—</td></tr></tfoot></table>
      <div class="footer">Powered by Mohamed Abdel Aal</div>
      <script>(async()=>{try{if(document.fonts&&document.fonts.ready)await document.fonts.ready}catch(e){}window.print();window.onafterprint=()=>window.close()})()</script>
    </body></html>`);
    popup.document.close();
  };

  return (
    <div className="space-y-6 p-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Wallet className="text-primary" /> مديونية الفروع</h1>
          <p className="text-sm text-muted-foreground">متابعة تحصيل فواتير التوريدات من الفروع</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint} disabled={filtered.length === 0}><Printer size={14} /> طباعة</Button>
          <ExportButtons
            title="مديونية الفروع" filename="branch-receivables"
            columns={[{ key: "record", label: "رقم الفاتورة" }, { key: "date", label: "التاريخ" }, { key: "branch", label: "الفرع" }, { key: "amount", label: "قيمة الفاتورة" }, { key: "paid", label: "المحصّل" }, { key: "remaining", label: "المتبقي" }, { key: "status", label: "الحالة" }]}
            data={filtered.map((r) => ({ record: r.record_number ?? "—", date: r.date, branch: branchName(r.branch_id), amount: fmt(r.amount), paid: fmt(r.paid), remaining: fmt(r.remaining), status: statusLabel[r.status] }))}
            filters={[
              { label: "الفرع", value: branchFilter === "all" ? "الكل" : branchName(branchFilter) },
              { label: "الفترة", value: periodLabel },
              { label: "الحالة", value: statusFilter === "all" ? "كل الحالات" : statusLabel[statusFilter] },
            ]}
          />
          <Button onClick={() => { setForm((f) => ({ ...f, branch_id: branchFilter !== "all" ? branchFilter : f.branch_id })); setOpen(true); }}><Plus size={16} /> تسجيل تحصيل</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "إجمالي فواتير التوريد", value: kpi.total, icon: Building2, cls: "text-primary" },
          { label: "إجمالي المحصّل", value: kpi.collected, icon: HandCoins, cls: "text-emerald-500" },
          { label: "المتبقي على الفروع", value: kpi.remaining, icon: AlertCircle, cls: "text-destructive" },
          { label: "نسبة التحصيل", value: null, icon: CheckCircle2, cls: "text-amber-500" },
        ].map((k) => (
          <Card key={k.label}><CardContent className="p-4 flex items-center justify-between">
            <div><p className="text-xs text-muted-foreground">{k.label}</p>
              <p className={`text-xl font-bold tabular-nums ${k.cls}`}>{k.value === null ? `${rate.toFixed(1)}%` : `${fmt(k.value)} ج.م`}</p></div>
            <k.icon className={k.cls} />
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">ملخص الفروع</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>الفرع</TableHead><TableHead className="text-center">عدد الفواتير</TableHead><TableHead className="text-center">الإجمالي</TableHead><TableHead className="text-center">المحصّل</TableHead><TableHead className="text-center">المتبقي</TableHead><TableHead className="text-center">نسبة التحصيل</TableHead><TableHead className="text-center">الحالة</TableHead></TableRow></TableHeader>
            <TableBody>
              {branchSummary.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">لا توجد فواتير توريد مكتملة</TableCell></TableRow>}
              {branchSummary.map((b) => (
                <TableRow key={b.id} className="cursor-pointer" onClick={() => setBranchFilter(b.id)}>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell className="text-center">{b.count}</TableCell>
                  <TableCell className="text-center tabular-nums">{fmt(b.total)}</TableCell>
                  <TableCell className="text-center tabular-nums text-emerald-500">{fmt(b.collected)}</TableCell>
                  <TableCell className="text-center tabular-nums text-destructive font-bold">{fmt(b.remaining)}</TableCell>
                  <TableCell className="text-center">
                    <div className="h-2 w-24 mx-auto rounded bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${Math.min(b.total > 0 ? (b.collected / b.total) * 100 : 0, 100)}%` }} /></div>
                  </TableCell>
                  <TableCell className="text-center"><Badge variant={statusVariant[b.status]}>{statusLabel[b.status]}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">الفواتير</CardTitle>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <div className="relative"><Search size={14} className="absolute right-2 top-3 text-muted-foreground" /><Input className="pr-7 w-32" placeholder="رقم الفاتورة" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <Select value={branchFilter} onValueChange={setBranchFilter}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">كل الفروع</SelectItem>{(branches as any[]).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent></Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">كل الحالات</SelectItem><SelectItem value="unpaid">غير محصّل</SelectItem><SelectItem value="partial">محصّل جزئياً</SelectItem><SelectItem value="paid">تم التحصيل</SelectItem></SelectContent></Select>
            <Label className="text-xs text-muted-foreground whitespace-nowrap">من تاريخ</Label>
            <Input type="date" className="w-28 shrink-0" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} />
            <Label className="text-xs text-muted-foreground whitespace-nowrap">إلى تاريخ</Label>
            <Input type="date" className="w-28 shrink-0" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} />
            {(fromDate || toDate) && <Button variant="ghost" className="h-10 shrink-0 px-3" onClick={() => { setFromDate(""); setToDate(""); }}>مسح</Button>}
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>رقم الفاتورة</TableHead><TableHead>التاريخ</TableHead><TableHead>الفرع</TableHead><TableHead className="text-center">القيمة</TableHead><TableHead className="text-center">المحصّل</TableHead><TableHead className="text-center">المتبقي</TableHead><TableHead className="text-center">الحالة</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono">{r.record_number}</TableCell>
                  <TableCell>{r.date}</TableCell>
                  <TableCell>{branchName(r.branch_id)}</TableCell>
                  <TableCell className="text-center tabular-nums">{fmt(r.amount)}</TableCell>
                  <TableCell className="text-center tabular-nums text-emerald-500">{fmt(r.paid)}</TableCell>
                  <TableCell className="text-center tabular-nums text-destructive">{fmt(r.remaining)}</TableCell>
                  <TableCell className="text-center"><Badge variant={statusVariant[r.status]}>{statusLabel[r.status]}</Badge></TableCell>
                  <TableCell>{r.remaining > 0 && <Button size="sm" variant="outline" onClick={() => { setForm((f) => ({ ...f, branch_id: r.branch_id, transfer_id: r.id, amount: String(r.remaining) })); setOpen(true); }}>تحصيل</Button>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">سجل التحصيلات</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>التاريخ</TableHead><TableHead>الفرع</TableHead><TableHead>الفاتورة</TableHead><TableHead className="text-center">المبلغ</TableHead><TableHead>طريقة الدفع</TableHead><TableHead>ملاحظات</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {filteredCollections.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.payment_date}</TableCell><TableCell>{branchName(c.branch_id)}</TableCell><TableCell className="font-mono">{recordOf(c.transfer_id)}</TableCell>
                  <TableCell className="text-center tabular-nums font-bold">{fmt(Number(c.amount))}</TableCell><TableCell>{c.payment_method}</TableCell><TableCell>{c.notes ?? ""}</TableCell>
                  <TableCell><Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(c.id)}><Trash2 size={14} /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>تسجيل تحصيل من فرع</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>الفرع</Label>
              <Select value={form.branch_id} onValueChange={(v) => setForm((f) => ({ ...f, branch_id: v, transfer_id: "none" }))}><SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                <SelectContent>{(branches as any[]).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>ربط بفاتورة</Label>
              <Select value={form.transfer_id} onValueChange={(v) => setForm((f) => ({ ...f, transfer_id: v, amount: v === "none" ? f.amount : String(allRows.find((r) => r.id === v)?.remaining ?? f.amount) }))}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">دفعة على الحساب (تُخصم من الأقدم)</SelectItem>{openInvoicesForBranch.map((r) => <SelectItem key={r.id} value={r.id}>{r.record_number} — متبقي {fmt(r.remaining)}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>المبلغ</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} /></div>
              <div><Label>التاريخ</Label><Input type="date" value={form.payment_date} onChange={(e) => setForm((f) => ({ ...f, payment_date: e.target.value }))} /></div>
            </div>
            <div><Label>طريقة الدفع</Label>
              <Select value={form.payment_method} onValueChange={(v) => setForm((f) => ({ ...f, payment_method: v }))}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["نقدي", "تحويل بنكي", "انستا باي", "فودافون كاش", "شيك"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>ملاحظات</Label><Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button onClick={save} disabled={saving}>حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent dir="rtl"><AlertDialogHeader><AlertDialogTitle>حذف التحصيل</AlertDialogTitle><AlertDialogDescription>هل أنت متأكد من حذف هذا التحصيل؟</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>لا</AlertDialogCancel><AlertDialogAction onClick={remove}>نعم</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
export default BranchReceivablesPage;
