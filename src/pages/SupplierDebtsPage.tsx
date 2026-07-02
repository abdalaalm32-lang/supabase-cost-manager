import React, { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Search, Wallet, CalendarIcon, X, Eye, Trash2, Printer, Pencil, Landmark } from "lucide-react";
import { ExportButtons } from "@/components/ExportButtons";
import { toast } from "sonner";
import { DateRange } from "react-day-picker";
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";

export const SupplierDebtsPage: React.FC = () => {
  const { auth } = useAuth();
  const qc = useQueryClient();
  const companyId = auth.profile?.company_id;

  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [detailsSupplier, setDetailsSupplier] = useState<any>(null);

  // Payment dialog (add or edit)
  const [payOpen, setPayOpen] = useState(false);
  const [paySupplier, setPaySupplier] = useState<any>(null);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payDate, setPayDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [payMethod, setPayMethod] = useState<string>("نقدي");
  const [payNotes, setPayNotes] = useState("");
  const [payInvoiceId, setPayInvoiceId] = useState<string>("");

  // Opening balance dialog
  const [obOpen, setObOpen] = useState(false);
  const [obSupplier, setObSupplier] = useState<any>(null);
  const [obAmount, setObAmount] = useState<number>(0);
  const [obDate, setObDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));

  const periodStart = dateRange?.from ? format(startOfDay(dateRange.from), "yyyy-MM-dd") : "1900-01-01";
  const periodEnd = dateRange?.to ? format(endOfDay(dateRange.to), "yyyy-MM-dd") : "2999-12-31";

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-all-debts", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["purchase-orders-debts", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("*")
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["supplier-payments", companyId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("supplier_payments")
        .select("*")
        .order("payment_date", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!companyId,
  });

  const supplierRows = useMemo(() => {
    return (suppliers as any[]).map((s: any) => {
      const openingBal = Number(s.opening_balance) || 0;
      const openingDate = s.opening_balance_date || "1900-01-01";

      const supplierCreditOrders = (orders as any[]).filter(
        (o: any) => o.supplier_id === s.id && o.payment_type === "آجل" && o.status !== "مؤرشف"
      );
      const supplierPayments = (payments as any[]).filter((p: any) => p.supplier_id === s.id);

      const totalCreditInvoices = supplierCreditOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
      const totalPrepaid = supplierCreditOrders.reduce((sum, o) => sum + (Number(o.paid_amount) || 0), 0);
      const totalPayments = supplierPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

      const currentBalance = openingBal + totalCreditInvoices - totalPrepaid - totalPayments;

      const periodInvoices = supplierCreditOrders.filter((o) => o.date >= periodStart && o.date <= periodEnd);
      const periodPayments = supplierPayments.filter((p) => p.payment_date >= periodStart && p.payment_date <= periodEnd);
      const periodInvoicesSum = periodInvoices.reduce(
        (sum, o) => sum + (Number(o.total_amount) || 0) - (Number(o.paid_amount) || 0), 0
      );
      const periodPaymentsSum = periodPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

      const openingOfPeriod = currentBalance - (periodInvoicesSum - periodPaymentsSum);

      return {
        ...s,
        openingBal,
        openingDate,
        totalCreditInvoices,
        totalPrepaid,
        totalPayments,
        currentBalance,
        periodInvoicesSum,
        periodPaymentsSum,
        openingOfPeriod,
        creditOrders: supplierCreditOrders,
        payments: supplierPayments,
      };
    });
  }, [suppliers, orders, payments, periodStart, periodEnd]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = supplierRows;
    if (supplierFilter !== "all") {
      rows = rows.filter((s: any) => s.id === supplierFilter);
    }
    if (q) {
      rows = rows.filter((s: any) =>
        (s.name || "").toLowerCase().includes(q) ||
        (s.code || "").toLowerCase().includes(q) ||
        (s.phone || "").includes(q)
      );
    }
    rows = rows.filter((s: any) =>
      s.currentBalance !== 0 || s.openingBal !== 0 || s.creditOrders.length > 0 || s.payments.length > 0
    );
    return rows;
  }, [supplierRows, search, supplierFilter]);

  const totals = useMemo(() => {
    const totalCurrent = filtered.reduce((s, r) => s + r.currentBalance, 0);
    const totalOpeningPeriod = filtered.reduce((s, r) => s + r.openingOfPeriod, 0);
    const totalPeriodInv = filtered.reduce((s, r) => s + r.periodInvoicesSum, 0);
    const totalPeriodPay = filtered.reduce((s, r) => s + r.periodPaymentsSum, 0);
    return { totalCurrent, totalOpeningPeriod, totalPeriodInv, totalPeriodPay };
  }, [filtered]);

  const savePaymentMutation = useMutation({
    mutationFn: async () => {
      if (!paySupplier || !payAmount || payAmount <= 0) throw new Error("مبلغ غير صحيح");
      if (editingPaymentId) {
        const { error } = await (supabase as any).from("supplier_payments").update({
          amount: payAmount,
          payment_date: payDate,
          payment_method: payMethod,
          notes: payNotes || null,
          purchase_order_id: payInvoiceId || null,
        }).eq("id", editingPaymentId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("supplier_payments").insert({
          company_id: companyId!,
          supplier_id: paySupplier.id,
          purchase_order_id: payInvoiceId || null,
          amount: payAmount,
          payment_date: payDate,
          payment_method: payMethod,
          notes: payNotes || null,
          creator_name: auth.profile?.full_name || "",
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supplier-payments"] });
      toast.success(editingPaymentId ? "تم تعديل الدفعة" : "تم تسجيل الدفعة");
      setPayOpen(false);
      setPayAmount(0); setPayNotes(""); setPayInvoiceId(""); setPaySupplier(null); setEditingPaymentId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deletePaymentMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("supplier_payments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supplier-payments"] });
      toast.success("تم حذف الدفعة");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveOpeningMutation = useMutation({
    mutationFn: async () => {
      if (!obSupplier) return;
      const { error } = await supabase.from("suppliers").update({
        opening_balance: obAmount,
        opening_balance_date: obDate,
      } as any).eq("id", obSupplier.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers-all-debts"] });
      toast.success("تم حفظ الرصيد الافتتاحي");
      setObOpen(false); setObSupplier(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openPayment = (supplier: any) => {
    setEditingPaymentId(null);
    setPaySupplier(supplier);
    setPayAmount(Number(supplier.currentBalance) > 0 ? Number(supplier.currentBalance) : 0);
    setPayDate(format(new Date(), "yyyy-MM-dd"));
    setPayMethod("نقدي");
    setPayNotes("");
    setPayInvoiceId("");
    setPayOpen(true);
  };

  const openEditPayment = (supplier: any, p: any) => {
    setEditingPaymentId(p.id);
    setPaySupplier(supplier);
    setPayAmount(Number(p.amount) || 0);
    setPayDate(p.payment_date);
    setPayMethod(p.payment_method || "نقدي");
    setPayNotes(p.notes || "");
    setPayInvoiceId(p.purchase_order_id || "");
    setPayOpen(true);
  };

  const openOpeningBalance = (supplier: any) => {
    setObSupplier(supplier);
    setObAmount(Number(supplier.openingBal) || 0);
    setObDate(supplier.openingDate && supplier.openingDate !== "1900-01-01" ? supplier.openingDate : format(new Date(), "yyyy-MM-dd"));
    setObOpen(true);
  };

  const periodLabel = dateRange?.from && dateRange?.to
    ? `${format(dateRange.from, "yyyy-MM-dd")} - ${format(dateRange.to, "yyyy-MM-dd")}`
    : "كل الفترات";

  const handlePrint = () => {
    const dateStr = new Date().toLocaleDateString("ar-EG");
    const logoSrc = `${window.location.origin}/logo.png`;
    let rowsHTML = "";
    filtered.forEach((r: any, idx: number) => {
      rowsHTML += `<tr>
        <td>${idx + 1}</td>
        <td style="text-align:right;">${r.code || "—"}</td>
        <td style="text-align:right;">${r.name}</td>
        <td>${r.openingOfPeriod.toFixed(2)}</td>
        <td>${r.periodInvoicesSum.toFixed(2)}</td>
        <td>${r.periodPaymentsSum.toFixed(2)}</td>
        <td><b>${r.currentBalance.toFixed(2)}</b></td>
      </tr>`;
    });
    const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>مديونية الموردين ${periodLabel}</title>
    <style>
      @font-face{font-family:'CairoLocal';src:url('${window.location.origin}/fonts/Cairo-Regular.ttf') format('truetype');}
      *{margin:0;padding:0;box-sizing:border-box;}
      body{font-family:'CairoLocal',sans-serif;direction:rtl;padding:20px;color:#000;}
      @media print{@page{size:landscape;margin:10mm;}}
      .header{text-align:center;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:15px;display:flex;align-items:center;justify-content:center;gap:15px;}
      .header img{width:60px;height:60px;object-fit:contain;}
      h1{font-size:18px;font-weight:bold;}
      table{width:100%;border-collapse:collapse;font-size:11px;}
      th,td{border:1px solid #000;padding:5px 6px;text-align:center;}
      th{background:#f0f0f0;font-weight:bold;}
      tfoot td{background:#f5f5f5;font-weight:bold;}
      .footer{text-align:center;margin-top:15px;font-size:9px;border-top:1px solid #000;padding-top:6px;}
    </style></head>
    <body>
      <div class="header">
        <img src="${logoSrc}" alt="Logo" />
        <div><h1>تقرير مديونية الموردين</h1><p>الفترة: ${periodLabel} • تاريخ الطباعة: ${dateStr}</p></div>
      </div>
      <table>
        <thead><tr>
          <th>م</th><th>الكود</th><th>المورد</th>
          <th>رصيد أول المدة</th><th>مديونيات الفترة</th><th>مدفوعات الفترة</th><th>الرصيد الحالي</th>
        </tr></thead>
        <tbody>${rowsHTML}</tbody>
        <tfoot><tr>
          <td colspan="3">الإجماليات</td>
          <td>${totals.totalOpeningPeriod.toFixed(2)}</td>
          <td>${totals.totalPeriodInv.toFixed(2)}</td>
          <td>${totals.totalPeriodPay.toFixed(2)}</td>
          <td>${totals.totalCurrent.toFixed(2)}</td>
        </tr></tfoot>
      </table>
      <div class="footer">Powered by Mohamed Abdel Aal</div>
      <script>window.print();window.onafterprint=function(){window.close();}</script>
    </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-black text-gradient">مديونية الموردين</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal gap-2 min-w-[220px]", !dateRange && "text-muted-foreground")}>
                  <CalendarIcon className="h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <span dir="ltr">{format(dateRange.from, "yyyy-MM-dd")} - {format(dateRange.to, "yyyy-MM-dd")}</span>
                    ) : format(dateRange.from, "yyyy-MM-dd")
                  ) : "اختر الفترة"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={1} className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
            {dateRange?.from && (
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setDateRange(undefined)} aria-label="مسح الفترة">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrint}>
            <Printer size={14} /> طباعة
          </Button>
          <ExportButtons
            data={filtered.map((r: any) => ({
              code: r.code || "—",
              name: r.name,
              opening: r.openingOfPeriod.toFixed(2),
              periodInv: r.periodInvoicesSum.toFixed(2),
              periodPay: r.periodPaymentsSum.toFixed(2),
              balance: r.currentBalance.toFixed(2),
            }))}
            columns={[
              { key: "code", label: "الكود" },
              { key: "name", label: "المورد" },
              { key: "opening", label: "رصيد أول المدة" },
              { key: "periodInv", label: "مديونيات الفترة" },
              { key: "periodPay", label: "مدفوعات الفترة" },
              { key: "balance", label: "الرصيد الحالي" },
            ]}
            filename={`مديونية_الموردين_${periodLabel}`}
            title={`تقرير مديونية الموردين — ${periodLabel}`}
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="glass-card p-4">
          <div className="text-xs text-muted-foreground mb-1">إجمالي المديونية الحالية</div>
          <div className="text-2xl font-black text-amber-500 font-mono">{totals.totalCurrent.toFixed(2)}</div>
          <div className="text-xs text-muted-foreground mt-1">ج.م</div>
        </div>
        <div className="glass-card p-4">
          <div className="text-xs text-muted-foreground mb-1">رصيد أول الفترة</div>
          <div className="text-xl font-bold text-slate-400 font-mono">{totals.totalOpeningPeriod.toFixed(2)}</div>
        </div>
        <div className="glass-card p-4">
          <div className="text-xs text-muted-foreground mb-1">مديونيات الفترة</div>
          <div className="text-xl font-bold text-rose-500 font-mono">{totals.totalPeriodInv.toFixed(2)}</div>
        </div>
        <div className="glass-card p-4">
          <div className="text-xs text-muted-foreground mb-1">مدفوعات الفترة</div>
          <div className="text-xl font-bold text-emerald-500 font-mono">{totals.totalPeriodPay.toFixed(2)}</div>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث بالاسم أو الكود أو الهاتف..." value={search} onChange={(e) => setSearch(e.target.value)} className="glass-input pr-9" />
        </div>
        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
          <SelectTrigger className="glass-input w-[220px]">
            <SelectValue placeholder="كل الموردين" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الموردين</SelectItem>
            {(suppliers as any[]).map((s: any) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">الكود</TableHead>
              <TableHead className="text-right">المورد</TableHead>
              <TableHead className="text-right">الهاتف</TableHead>
              <TableHead className="text-right">رصيد أول الفترة</TableHead>
              <TableHead className="text-right">مديونيات الفترة</TableHead>
              <TableHead className="text-right">مدفوعات الفترة</TableHead>
              <TableHead className="text-right">الرصيد الحالي</TableHead>
              <TableHead className="text-right">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">لا توجد مديونيات</TableCell></TableRow>
            ) : (
              filtered.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.code || "—"}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-sm">{r.phone || "—"}</TableCell>
                  <TableCell className="font-mono text-sm">{r.openingOfPeriod.toFixed(2)}</TableCell>
                  <TableCell className="font-mono text-sm text-rose-500">{r.periodInvoicesSum.toFixed(2)}</TableCell>
                  <TableCell className="font-mono text-sm text-emerald-500">{r.periodPaymentsSum.toFixed(2)}</TableCell>
                  <TableCell className={cn("font-mono font-bold", r.currentBalance > 0 ? "text-amber-500" : "text-emerald-500")}>
                    {r.currentBalance.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDetailsSupplier(r)} title="تفاصيل">
                        <Eye size={14} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500" onClick={() => openOpeningBalance(r)} title="رصيد افتتاحي">
                        <Landmark size={14} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-500" onClick={() => openPayment(r)} title="تسجيل دفعة">
                        <Wallet size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Payment Dialog (add / edit) */}
      <Dialog open={payOpen} onOpenChange={(v) => { setPayOpen(v); if (!v) setEditingPaymentId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPaymentId ? "تعديل دفعة" : "تسجيل دفعة"} — {paySupplier?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex justify-between text-sm">
              <span className="font-semibold text-amber-600">الرصيد الحالي:</span>
              <span className="font-mono font-bold text-amber-700 dark:text-amber-400">
                {(paySupplier?.currentBalance || 0).toFixed(2)} ج.م
              </span>
            </div>
            <div className="space-y-2">
              <Label>المبلغ *</Label>
              <Input type="number" min={0} step="0.01" value={payAmount} onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)} className="glass-input" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>تاريخ الدفع</Label>
                <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="glass-input" />
              </div>
              <div className="space-y-2">
                <Label>طريقة الدفع</Label>
                <Select value={payMethod} onValueChange={setPayMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="نقدي">نقدي</SelectItem>
                    <SelectItem value="تحويل بنكي">تحويل بنكي</SelectItem>
                    <SelectItem value="شيك">شيك</SelectItem>
                    <SelectItem value="فيزا">فيزا</SelectItem>
                    <SelectItem value="انستا باي">انستا باي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>ربط بفاتورة (اختياري)</Label>
              <Select value={payInvoiceId || "none"} onValueChange={(v) => setPayInvoiceId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="بدون تحديد" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون تحديد</SelectItem>
                  {(paySupplier?.creditOrders || []).map((o: any) => {
                    const rem = (Number(o.total_amount) || 0) - (Number(o.paid_amount) || 0);
                    return (
                      <SelectItem key={o.id} value={o.id}>
                        {o.invoice_number || o.id.slice(0, 8)} — متبقي {rem.toFixed(2)}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Textarea value={payNotes} onChange={(e) => setPayNotes(e.target.value)} className="glass-input" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>إلغاء</Button>
            <Button onClick={() => savePaymentMutation.mutate()} disabled={savePaymentMutation.isPending || !payAmount}>
              {savePaymentMutation.isPending ? "جاري الحفظ..." : editingPaymentId ? "حفظ التعديل" : "حفظ الدفعة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Opening Balance Dialog */}
      <Dialog open={obOpen} onOpenChange={setObOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>الرصيد الافتتاحي — {obSupplier?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-xs text-muted-foreground">
              استخدم هذا الرصيد لتسجيل المديونيات السابقة (قبل استخدام النظام) لهذا المورد.
              سيُضاف إلى الرصيد الحالي مباشرةً.
            </p>
            <div className="space-y-2">
              <Label>قيمة الرصيد الافتتاحي</Label>
              <Input type="number" step="0.01" value={obAmount} onChange={(e) => setObAmount(parseFloat(e.target.value) || 0)} className="glass-input" />
            </div>
            <div className="space-y-2">
              <Label>تاريخ الرصيد الافتتاحي</Label>
              <Input type="date" value={obDate} onChange={(e) => setObDate(e.target.value)} className="glass-input" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setObOpen(false)}>إلغاء</Button>
            <Button onClick={() => saveOpeningMutation.mutate()} disabled={saveOpeningMutation.isPending}>
              {saveOpeningMutation.isPending ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details Dialog */}
      <Dialog open={!!detailsSupplier} onOpenChange={(v) => !v && setDetailsSupplier(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>كشف حساب — {detailsSupplier?.name}</DialogTitle>
          </DialogHeader>
          {detailsSupplier && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="glass-card p-3 text-center">
                  <div className="text-xs text-muted-foreground">الرصيد الافتتاحي</div>
                  <div className="font-mono font-bold text-lg">{detailsSupplier.openingBal.toFixed(2)}</div>
                </div>
                <div className="glass-card p-3 text-center">
                  <div className="text-xs text-muted-foreground">فواتير آجلة</div>
                  <div className="font-mono font-bold text-lg text-rose-500">{detailsSupplier.totalCreditInvoices.toFixed(2)}</div>
                </div>
                <div className="glass-card p-3 text-center">
                  <div className="text-xs text-muted-foreground">مدفوع (مقدم + دفعات)</div>
                  <div className="font-mono font-bold text-lg text-emerald-500">
                    {(detailsSupplier.totalPrepaid + detailsSupplier.totalPayments).toFixed(2)}
                  </div>
                </div>
                <div className="glass-card p-3 text-center">
                  <div className="text-xs text-muted-foreground">الرصيد الحالي</div>
                  <div className={cn("font-mono font-bold text-lg", detailsSupplier.currentBalance > 0 ? "text-amber-500" : "text-emerald-500")}>
                    {detailsSupplier.currentBalance.toFixed(2)}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-2">الفواتير الآجلة</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">رقم الفاتورة</TableHead>
                      <TableHead className="text-right">التاريخ</TableHead>
                      <TableHead className="text-right">الاستحقاق</TableHead>
                      <TableHead className="text-right">الإجمالي</TableHead>
                      <TableHead className="text-right">مدفوع مقدماً</TableHead>
                      <TableHead className="text-right">المتبقي</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailsSupplier.creditOrders.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-4">لا توجد فواتير آجلة</TableCell></TableRow>
                    ) : detailsSupplier.creditOrders.map((o: any) => {
                      const t = Number(o.total_amount) || 0;
                      const p = Number(o.paid_amount) || 0;
                      return (
                        <TableRow key={o.id}>
                          <TableCell className="font-mono text-xs">{o.invoice_number || "—"}</TableCell>
                          <TableCell>{new Date(o.date).toLocaleDateString("ar-EG")}</TableCell>
                          <TableCell>{o.due_date ? new Date(o.due_date).toLocaleDateString("ar-EG") : "—"}</TableCell>
                          <TableCell className="font-mono">{t.toFixed(2)}</TableCell>
                          <TableCell className="font-mono text-emerald-500">{p.toFixed(2)}</TableCell>
                          <TableCell className="font-mono font-bold text-amber-500">{(t - p).toFixed(2)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div>
                <h3 className="font-semibold mb-2">الدفعات</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">التاريخ</TableHead>
                      <TableHead className="text-right">المبلغ</TableHead>
                      <TableHead className="text-right">طريقة الدفع</TableHead>
                      <TableHead className="text-right">فاتورة مرتبطة</TableHead>
                      <TableHead className="text-right">ملاحظات</TableHead>
                      <TableHead className="text-right">المستخدم</TableHead>
                      <TableHead className="text-right">إجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailsSupplier.payments.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-4">لا توجد دفعات</TableCell></TableRow>
                    ) : detailsSupplier.payments.map((p: any) => {
                      const linkedOrder = (orders as any[]).find((o) => o.id === p.purchase_order_id);
                      return (
                        <TableRow key={p.id}>
                          <TableCell>{new Date(p.payment_date).toLocaleDateString("ar-EG")}</TableCell>
                          <TableCell className="font-mono font-bold text-emerald-500">{Number(p.amount).toFixed(2)}</TableCell>
                          <TableCell>{p.payment_method}</TableCell>
                          <TableCell className="font-mono text-xs">{linkedOrder?.invoice_number || "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{p.notes || "—"}</TableCell>
                          <TableCell className="text-sm">{p.creator_name || "—"}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500" onClick={() => openEditPayment(detailsSupplier, p)} title="تعديل">
                                <Pencil size={14} />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => {
                                if (confirm("حذف هذه الدفعة؟")) deletePaymentMutation.mutate(p.id);
                              }} title="حذف">
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SupplierDebtsPage;
