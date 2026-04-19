import React, { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { PlayCircle, StopCircle, Clock, Lock, AlertTriangle, TrendingUp, TrendingDown, CheckCircle2 } from "lucide-react";
import { format, isValid } from "date-fns";

const safeFormat = (dateVal: any, fmt: string, fallback = "—") => {
  if (!dateVal) return fallback;
  const d = new Date(dateVal);
  return isValid(d) ? format(d, fmt) : fallback;
};

const fmtMoney = (n: number) => (Number.isFinite(n) ? n : 0).toFixed(2);

interface PosShiftManagerProps {
  companyId: string;
  branchId: string;
  userName: string;
  printViaIframe?: (html: string) => void;
}

export const PosShiftManager: React.FC<PosShiftManagerProps> = ({ companyId, branchId, userName, printViaIframe }) => {
  const queryClient = useQueryClient();
  const [showOpenDialog, setShowOpenDialog] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwordAction, setPasswordAction] = useState<"open" | "close">("open");
  const [posPassword, setPosPassword] = useState("");
  const [openingCash, setOpeningCash] = useState<number>(0);
  const [selectedDefId, setSelectedDefId] = useState<string>("");

  // Closing-specific state
  const [actualCash, setActualCash] = useState<string>("");
  const [closingNotes, setClosingNotes] = useState<string>("");
  const [confirmedVariance, setConfirmedVariance] = useState(false);

  // Get shift definitions
  const { data: shiftDefinitions } = useQuery({
    queryKey: ["pos-shift-definitions-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pos_shift_definitions")
        .select("*")
        .eq("company_id", companyId)
        .eq("active", true)
        .order("shift_name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  // Get current user's profile (for pos_password)
  const { data: currentProfile } = useQuery({
    queryKey: ["pos-user-profile", userName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, pos_password, full_name")
        .eq("company_id", companyId)
        .eq("full_name", userName)
        .limit(1);
      if (error) throw error;
      return data?.[0] || null;
    },
    enabled: !!companyId && !!userName,
  });

  // Get current open shift — match selected branch, or shift opened without branch, or any open shift
  const { data: currentShift } = useQuery({
    queryKey: ["pos-current-shift", companyId, branchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pos_shifts")
        .select("*")
        .eq("company_id", companyId)
        .eq("status", "مفتوح")
        .order("opened_at", { ascending: false });
      if (error) throw error;
      const shifts = data || [];
      if (branchId) {
        const exact = shifts.find((s: any) => s.branch_id === branchId);
        if (exact) return exact;
        const noBranch = shifts.find((s: any) => !s.branch_id);
        if (noBranch) return noBranch;
      }
      return shifts[0] || null;
    },
    enabled: !!companyId,
  });

  // Get shift sales — PRIMARY: by shift_id, FALLBACK: by time-range (for old data)
  const { data: shiftSales } = useQuery({
    queryKey: ["pos-shift-sales", currentShift?.id],
    queryFn: async () => {
      if (!currentShift) return null;

      // Primary query — by shift_id
      const { data: byShift, error: e1 } = await supabase
        .from("pos_sales")
        .select("*, pos_sale_items(*, pos_items:pos_item_id(name))")
        .eq("company_id", companyId)
        .eq("status", "مكتمل")
        .eq("shift_id", currentShift.id);
      if (e1) throw e1;

      // Fallback for sales created before shift_id existed: include sales in time-range without a shift_id
      let fallback: any[] = [];
      try {
        let q = supabase
          .from("pos_sales")
          .select("*, pos_sale_items(*, pos_items:pos_item_id(name))")
          .eq("company_id", companyId)
          .eq("status", "مكتمل")
          .is("shift_id", null)
          .gte("created_at", currentShift.opened_at)
          .lte("created_at", currentShift.closed_at || new Date().toISOString());
        if (branchId) q = q.eq("branch_id", branchId);
        const { data } = await q;
        fallback = data || [];
      } catch { /* ignore */ }

      return [...(byShift || []), ...fallback];
    },
    enabled: !!currentShift,
  });

  // Get shift expenses
  const { data: shiftExpenses } = useQuery({
    queryKey: ["pos-shift-expenses", currentShift?.id],
    queryFn: async () => {
      if (!currentShift) return null;
      const { data, error } = await supabase
        .from("pos_shift_expenses")
        .select("*")
        .eq("shift_id", currentShift.id)
        .order("created_at");
      if (error) throw error;
      return data;
    },
    enabled: !!currentShift,
  });

  // Get shift returns — PRIMARY by shift_id, FALLBACK by time-range
  const { data: shiftReturns } = useQuery({
    queryKey: ["pos-shift-returns", currentShift?.id],
    queryFn: async () => {
      if (!currentShift) return null;

      const { data: byShift, error: e1 } = await supabase
        .from("pos_returns")
        .select("*")
        .eq("company_id", companyId)
        .eq("shift_id", currentShift.id);
      if (e1) throw e1;

      let fallback: any[] = [];
      try {
        let q = supabase
          .from("pos_returns")
          .select("*")
          .eq("company_id", companyId)
          .is("shift_id", null)
          .gte("created_at", currentShift.opened_at)
          .lte("created_at", currentShift.closed_at || new Date().toISOString());
        if (branchId) q = q.eq("branch_id", branchId);
        const { data } = await q;
        fallback = data || [];
      } catch { /* ignore */ }

      return [...(byShift || []), ...fallback];
    },
    enabled: !!currentShift,
  });

  // ============ COMPUTED TOTALS (Professional reconciliation logic) ============
  const totals = useMemo(() => {
    const sales = shiftSales || [];
    const returns = shiftReturns || [];
    const expenses = shiftExpenses || [];

    const invoiceCount = sales.length;
    const totalSales = sales.reduce((s: number, sale: any) => s + (Number(sale.total_amount) || 0), 0);
    const totalCashSales = sales
      .filter((s: any) => s.payment_method === "كاش")
      .reduce((sum: number, sale: any) => sum + (Number(sale.total_amount) || 0), 0);
    const totalVisaSales = sales
      .filter((s: any) => s.payment_method === "فيزا")
      .reduce((sum: number, sale: any) => sum + (Number(sale.total_amount) || 0), 0);

    const totalReturns = returns.reduce((s: number, r: any) => s + (Number(r.total_amount) || 0), 0);
    const totalReturnsCash = returns
      .filter((r: any) => (r.payment_method || "كاش") === "كاش")
      .reduce((s: number, r: any) => s + (Number(r.total_amount) || 0), 0);
    const totalReturnsVisa = returns
      .filter((r: any) => r.payment_method === "فيزا")
      .reduce((s: number, r: any) => s + (Number(r.total_amount) || 0), 0);

    const totalExpenses = expenses.reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
    const openingCashVal = Number(currentShift?.opening_cash) || 0;

    // CORRECT FORMULA: Cash drawer expected
    // = Opening Cash + Cash Sales - Cash Returns - Expenses
    const expectedCash = openingCashVal + totalCashSales - totalReturnsCash - totalExpenses;

    // Net shift revenue (excluding opening cash, which is owner's float)
    const netRevenue = totalSales - totalReturns - totalExpenses;

    return {
      invoiceCount,
      totalSales, totalCashSales, totalVisaSales,
      totalReturns, totalReturnsCash, totalReturnsVisa,
      totalExpenses, openingCash: openingCashVal,
      expectedCash, netRevenue,
    };
  }, [shiftSales, shiftReturns, shiftExpenses, currentShift]);

  // Variance calculation
  const actualCashNum = parseFloat(actualCash);
  const variance = !isNaN(actualCashNum) ? actualCashNum - totals.expectedCash : null;
  const hasSignificantVariance = variance !== null && Math.abs(variance) >= 1;

  const verifyPassword = (action: "open" | "close") => {
    if (action === "open") {
      setShowOpenDialog(true);
      return;
    }
    const userPosPassword = (currentProfile as any)?.pos_password;
    if (userPosPassword) {
      setPasswordAction(action);
      setPosPassword("");
      setShowPasswordDialog(true);
    } else {
      openCloseDialog();
    }
  };

  const openCloseDialog = () => {
    setActualCash("");
    setClosingNotes("");
    setConfirmedVariance(false);
    setShowCloseDialog(true);
  };

  const handlePasswordSubmit = () => {
    const userPosPassword = (currentProfile as any)?.pos_password;
    if (posPassword === userPosPassword) {
      setShowPasswordDialog(false);
      setPosPassword("");
      if (passwordAction === "open") setShowOpenDialog(true);
      else openCloseDialog();
    } else {
      toast.error("كلمة المرور غير صحيحة");
    }
  };

  const handleOpenShiftSubmit = () => {
    if (selectedDefId) {
      const selectedDef = shiftDefinitions?.find((d: any) => d.id === selectedDefId);
      if (selectedDef?.pos_password) {
        if (posPassword !== selectedDef.pos_password) {
          toast.error("كلمة مرور الشيفت غير صحيحة");
          return;
        }
      }
    }
    openShift.mutate();
  };

  const openShift = useMutation({
    mutationFn: async () => {
      const { data: shiftNumber } = await supabase.rpc("generate_shift_number", { p_company_id: companyId });
      const selectedDef = shiftDefinitions?.find((d: any) => d.id === selectedDefId);
      const { error } = await supabase.from("pos_shifts").insert({
        company_id: companyId,
        branch_id: branchId || null,
        opened_by: userName,
        opening_cash: openingCash,
        shift_number: shiftNumber,
        shift_name: selectedDef?.shift_name || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم فتح الشيفت بنجاح");
      setShowOpenDialog(false);
      setOpeningCash(0);
      setSelectedDefId("");
      setPosPassword("");
      queryClient.invalidateQueries({ queryKey: ["pos-current-shift"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const closeShift = useMutation({
    mutationFn: async () => {
      if (!currentShift) throw new Error("لا يوجد شيفت مفتوح");
      const actualCashFinal = !isNaN(actualCashNum) ? actualCashNum : null;
      const varianceFinal = actualCashFinal !== null ? actualCashFinal - totals.expectedCash : null;

      const { error } = await supabase.from("pos_shifts").update({
        closed_at: new Date().toISOString(),
        closed_by: userName,
        status: "مغلق",
        // Snapshot all reconciliation data into the shift row
        actual_cash: actualCashFinal,
        expected_cash: totals.expectedCash,
        variance: varianceFinal,
        total_sales: totals.totalSales,
        total_cash_sales: totals.totalCashSales,
        total_visa_sales: totals.totalVisaSales,
        total_returns_cash: totals.totalReturnsCash,
        total_returns_visa: totals.totalReturnsVisa,
        total_expenses: totals.totalExpenses,
        invoice_count: totals.invoiceCount,
        closing_notes: closingNotes.trim() || null,
      } as any).eq("id", currentShift.id);
      if (error) throw error;
    },
    onSuccess: () => {
      printShiftReport();
      toast.success("تم إغلاق الشيفت بنجاح");
      setShowCloseDialog(false);
      queryClient.invalidateQueries({ queryKey: ["pos-current-shift"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleCloseShiftSubmit = () => {
    if (hasSignificantVariance && !confirmedVariance) {
      toast.warning("يوجد فرق في الكاش — يرجى التأكيد للمتابعة");
      return;
    }
    closeShift.mutate();
  };

  const printShiftReport = useCallback(() => {
    if (!currentShift || !shiftSales) return;

    const shiftNum = (currentShift as any).shift_number || "—";

    const itemMap = new Map<string, { name: string; qty: number; total: number }>();
    shiftSales.forEach((sale: any) => {
      (sale.pos_sale_items as any[])?.forEach((si: any) => {
        const name = si.pos_items?.name || "صنف";
        const existing = itemMap.get(name);
        if (existing) { existing.qty += Number(si.quantity) || 0; existing.total += Number(si.total) || 0; }
        else { itemMap.set(name, { name, qty: Number(si.quantity) || 0, total: Number(si.total) || 0 }); }
      });
    });
    const itemsList = Array.from(itemMap.values()).sort((a, b) => b.total - a.total);

    const expensesRows = (shiftExpenses || []).map((e: any) =>
      `<tr><td>${e.description}</td><td style="text-align:left">${fmtMoney(Number(e.amount))}</td></tr>`
    ).join("");

    const returnsRows = (shiftReturns || []).map((r: any) =>
      `<tr><td>${r.return_number || "—"}</td><td style="text-align:center;font-size:9px">${r.payment_method || "كاش"}</td><td style="text-align:left">${fmtMoney(Number(r.total_amount))}</td></tr>`
    ).join("");

    const varianceVal = !isNaN(actualCashNum) ? actualCashNum - totals.expectedCash : null;
    const varianceLabel = varianceVal === null ? "" : (varianceVal === 0 ? "✓ مطابق" : (varianceVal > 0 ? "⬆ زيادة" : "⬇ عجز"));
    const varianceColor = varianceVal === null ? "#000" : (varianceVal === 0 ? "#0a0" : (varianceVal > 0 ? "#0a0" : "#c00"));

    const html = `<!DOCTYPE html>
<html dir="rtl"><head><meta charset="utf-8"/><title>تقرير الشيفت</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Cairo',sans-serif;direction:rtl;width:72mm;margin:0 auto;padding:8px;font-size:12px;color:#000;line-height:1.5;}
table{width:100%;border-collapse:collapse;}
th,td{padding:3px 0;font-size:11px;text-align:right;}
td:last-child,th:last-child{text-align:left;}
.center{text-align:center;}
.bold{font-weight:bold;}
.sep{border-top:1px dashed #999;margin:6px 0;padding-top:6px;}
.total-row{font-size:14px;font-weight:bold;}
.expense-label{color:#c00;}
.box{border:1.5px solid #000;padding:6px;margin:4px 0;border-radius:4px;}
.row{display:flex;justify-content:space-between;align-items:center;padding:2px 0;}
@media print{@page{size:80mm auto;margin:0}body{width:72mm;}}
</style></head><body>
<div class="center"><h2 style="font-size:15px;">تقرير إغلاق الشيفت</h2>
<p style="font-size:12px;font-weight:bold;margin-top:2px">${shiftNum}</p>
${(currentShift as any).shift_name ? `<p style="font-size:11px;margin-top:2px">${(currentShift as any).shift_name}</p>` : ""}
<p style="font-size:9px;color:#666;">CostControl POS</p></div>

<div class="sep">
<p><b>فتح:</b> ${safeFormat(currentShift.opened_at, "yyyy/MM/dd HH:mm")}</p>
<p><b>إغلاق:</b> ${safeFormat(new Date(), "yyyy/MM/dd HH:mm")}</p>
<p><b>الكاشير:</b> ${currentShift.opened_by || "-"}</p>
</div>

<div class="sep box">
<p class="bold center" style="margin-bottom:4px">💰 ملخص الكاش</p>
<div class="row"><span>الرصيد الافتتاحي:</span><b>${fmtMoney(totals.openingCash)} EGP</b></div>
<div class="row"><span>+ مبيعات كاش:</span><b style="color:#080">${fmtMoney(totals.totalCashSales)}</b></div>
<div class="row"><span>- مرتجعات كاش:</span><b style="color:#c00">${fmtMoney(totals.totalReturnsCash)}</b></div>
<div class="row"><span>- مصروفات:</span><b style="color:#c00">${fmtMoney(totals.totalExpenses)}</b></div>
<div class="row" style="border-top:1px dashed #000;padding-top:3px;margin-top:3px">
  <span class="bold">المتوقع في الدرج:</span><b class="total-row">${fmtMoney(totals.expectedCash)}</b>
</div>
${!isNaN(actualCashNum) ? `
<div class="row" style="margin-top:3px">
  <span class="bold">الفعلي المعدود:</span><b>${fmtMoney(actualCashNum)} EGP</b>
</div>
<div class="row" style="border-top:1.5px solid #000;padding-top:3px;margin-top:3px">
  <span class="bold">الفرق:</span>
  <b class="total-row" style="color:${varianceColor}">${fmtMoney(varianceVal!)} ${varianceLabel}</b>
</div>` : ""}
</div>

<div class="sep">
<p class="bold">📊 ملخص المبيعات</p>
<p>عدد الفواتير: <b>${totals.invoiceCount}</b></p>
<p>إجمالي المبيعات: <b>${fmtMoney(totals.totalSales)} EGP</b></p>
<p>كاش: ${fmtMoney(totals.totalCashSales)} EGP</p>
<p>فيزا: ${fmtMoney(totals.totalVisaSales)} EGP</p>
</div>

${itemsList.length > 0 ? `<div class="sep"><p class="bold">🍽 الأصناف المباعة</p>
<table><thead><tr><th>الصنف</th><th style="text-align:center">الكمية</th><th>الإجمالي</th></tr></thead><tbody>
${itemsList.map(i => `<tr><td>${i.name}</td><td style="text-align:center">${i.qty}</td><td style="text-align:left">${fmtMoney(i.total)}</td></tr>`).join("")}
</tbody></table>
<p class="bold" style="margin-top:4px;text-align:left">الإجمالي: ${fmtMoney(itemsList.reduce((s, i) => s + i.total, 0))} EGP</p>
</div>` : ""}

${totals.totalExpenses > 0 ? `<div class="sep"><p class="bold expense-label">المصروفات (${(shiftExpenses || []).length})</p>
<table><thead><tr><th>الوصف</th><th>المبلغ</th></tr></thead><tbody>${expensesRows}</tbody></table>
<p class="bold" style="margin-top:4px">إجمالي: ${fmtMoney(totals.totalExpenses)} EGP</p></div>` : ""}

${totals.totalReturns > 0 ? `<div class="sep"><p class="bold expense-label">المرتجعات (${(shiftReturns || []).length})</p>
<table><thead><tr><th>رقم</th><th style="text-align:center">طريقة</th><th>المبلغ</th></tr></thead><tbody>${returnsRows}</tbody></table>
<p class="bold" style="margin-top:4px">إجمالي: ${fmtMoney(totals.totalReturns)} EGP (كاش ${fmtMoney(totals.totalReturnsCash)} | فيزا ${fmtMoney(totals.totalReturnsVisa)})</p></div>` : ""}

<div class="sep center box">
<p>إجمالي المبيعات: ${fmtMoney(totals.totalSales)} EGP</p>
${totals.totalReturns > 0 ? `<p class="expense-label">- مرتجعات: ${fmtMoney(totals.totalReturns)} EGP</p>` : ""}
${totals.totalExpenses > 0 ? `<p class="expense-label">- مصروفات: ${fmtMoney(totals.totalExpenses)} EGP</p>` : ""}
<p class="total-row" style="margin-top:6px">صافي إيراد الشيفت: ${fmtMoney(totals.netRevenue)} EGP</p>
</div>

${closingNotes.trim() ? `<div class="sep"><p class="bold">📝 ملاحظات:</p><p style="font-size:10px">${closingNotes.trim()}</p></div>` : ""}

<p class="center" style="margin-top:8px;font-size:9px;color:#666">أُغلق بواسطة: ${userName}</p>
</body></html>`;

    if (printViaIframe) {
      printViaIframe(html);
    } else {
      const printWindow = window.open("", "_blank", "width=320,height=700");
      if (!printWindow) { toast.error("يرجى السماح بالنوافذ المنبثقة"); return; }
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.onload = () => { printWindow.focus(); printWindow.print(); printWindow.close(); };
    }
  }, [currentShift, shiftSales, shiftExpenses, shiftReturns, totals, actualCashNum, closingNotes, userName, printViaIframe]);

  const selectedDef = shiftDefinitions?.find((d: any) => d.id === selectedDefId);

  return (
    <>
      {currentShift ? (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1 text-[10px] border-green-500/30 text-green-500">
            <Clock className="h-3 w-3" />
            {(currentShift as any).shift_name || (currentShift as any).shift_number || "شيفت"} منذ {safeFormat(currentShift.opened_at, "HH:mm")}
          </Badge>
          <Button variant="destructive" size="sm" className="h-7 text-[10px] gap-1" onClick={() => verifyPassword("close")}>
            <StopCircle className="h-3 w-3" />
            إغلاق الشيفت
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 border-green-500/30 text-green-500 hover:bg-green-500/10" onClick={() => verifyPassword("open")}>
          <PlayCircle className="h-3 w-3" />
          فتح شيفت
        </Button>
      )}

      {/* Password Verification Dialog (for close) */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="max-w-xs" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              تأكيد الهوية
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">أدخل كلمة مرور نقطة البيع للمتابعة</p>
            <Input
              type="password"
              value={posPassword}
              onChange={(e) => setPosPassword(e.target.value)}
              placeholder="كلمة مرور POS"
              dir="ltr"
              onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button onClick={handlePasswordSubmit} disabled={!posPassword} className="w-full gap-1">
              <Lock className="h-4 w-4" />
              تأكيد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Open Shift Dialog */}
      <Dialog open={showOpenDialog} onOpenChange={(open) => { setShowOpenDialog(open); if (!open) { setSelectedDefId(""); setPosPassword(""); } }}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>فتح شيفت جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {shiftDefinitions && shiftDefinitions.length > 0 && (
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">اختر الشيفت *</label>
                <Select value={selectedDefId} onValueChange={(v) => { setSelectedDefId(v); setPosPassword(""); }}>
                  <SelectTrigger className="glass-input">
                    <SelectValue placeholder="اختر نوع الشيفت" />
                  </SelectTrigger>
                  <SelectContent>
                    {shiftDefinitions.map((def: any) => (
                      <SelectItem key={def.id} value={def.id}>{def.shift_name} ({def.definition_code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {selectedDef?.pos_password && (
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">كلمة مرور الشيفت</label>
                <Input
                  type="password"
                  value={posPassword}
                  onChange={(e) => setPosPassword(e.target.value)}
                  placeholder="أدخل كلمة مرور الشيفت"
                  dir="ltr"
                  onKeyDown={(e) => e.key === "Enter" && handleOpenShiftSubmit()}
                />
              </div>
            )}
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">المبلغ الافتتاحي (EGP)</label>
              <Input type="number" value={openingCash || ""} onChange={(e) => setOpeningCash(Number(e.target.value))} placeholder="0.00" />
            </div>
            <p className="text-xs text-muted-foreground">الكاشير: {userName}</p>
          </div>
          <DialogFooter>
            <Button
              onClick={handleOpenShiftSubmit}
              disabled={openShift.isPending || (shiftDefinitions && shiftDefinitions.length > 0 && !selectedDefId)}
              className="w-full gap-1"
            >
              <PlayCircle className="h-4 w-4" />
              فتح الشيفت
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Shift Dialog — Professional reconciliation */}
      <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <StopCircle className="h-5 w-5 text-destructive" />
              إغلاق الشيفت وتسوية الحسابات
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {/* Shift Info */}
            <div className="p-3 rounded-lg bg-muted/50 space-y-1 text-xs">
              <p><span className="text-muted-foreground">كود الشيفت:</span> <span className="font-bold text-primary">{(currentShift as any)?.shift_number || "—"}</span></p>
              {(currentShift as any)?.shift_name && <p><span className="text-muted-foreground">اسم الشيفت:</span> <span className="font-bold">{(currentShift as any)?.shift_name}</span></p>}
              <p><span className="text-muted-foreground">وقت الفتح:</span> {safeFormat(currentShift?.opened_at, "yyyy/MM/dd HH:mm")}</p>
              <p><span className="text-muted-foreground">الكاشير:</span> {currentShift?.opened_by}</p>
            </div>

            {/* Sales Summary */}
            <div className="p-3 rounded-lg bg-primary/5 space-y-1.5">
              <p className="font-bold text-xs text-primary mb-1">📊 ملخص المبيعات</p>
              <div className="flex justify-between"><span className="text-muted-foreground">عدد الفواتير:</span> <span className="font-bold">{totals.invoiceCount}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">إجمالي المبيعات:</span> <span className="font-bold text-primary">{fmtMoney(totals.totalSales)} EGP</span></div>
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">— كاش:</span> <span>{fmtMoney(totals.totalCashSales)} EGP</span></div>
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">— فيزا:</span> <span>{fmtMoney(totals.totalVisaSales)} EGP</span></div>
            </div>

            {/* Returns */}
            {totals.totalReturns > 0 && (
              <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/10 space-y-1">
                <p className="font-bold text-destructive text-xs mb-1">↩ المرتجعات ({(shiftReturns || []).length})</p>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">كاش:</span> <span className="font-bold">{fmtMoney(totals.totalReturnsCash)} EGP</span></div>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">فيزا:</span> <span className="font-bold">{fmtMoney(totals.totalReturnsVisa)} EGP</span></div>
                <div className="flex justify-between text-xs border-t border-destructive/10 pt-1 mt-1"><span>إجمالي:</span> <span className="font-bold">{fmtMoney(totals.totalReturns)} EGP</span></div>
              </div>
            )}

            {/* Expenses */}
            {totals.totalExpenses > 0 && (
              <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/10 space-y-1">
                <p className="font-bold text-destructive text-xs mb-1">💸 المصروفات ({(shiftExpenses || []).length})</p>
                {(shiftExpenses || []).slice(0, 5).map((e: any) => (
                  <p key={e.id} className="text-xs flex justify-between"><span className="text-muted-foreground truncate max-w-[60%]">{e.description}</span> <span className="font-bold">{fmtMoney(Number(e.amount))} EGP</span></p>
                ))}
                {(shiftExpenses || []).length > 5 && <p className="text-[10px] text-muted-foreground">و{(shiftExpenses || []).length - 5} أخرى...</p>}
                <div className="flex justify-between text-xs border-t border-destructive/10 pt-1 mt-1"><span>إجمالي:</span> <span className="font-bold">{fmtMoney(totals.totalExpenses)} EGP</span></div>
              </div>
            )}

            {/* Cash Drawer Reconciliation - THE KEY SECTION */}
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-2">
              <p className="font-bold text-xs flex items-center gap-1">💰 تسوية درج الكاش</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">الرصيد الافتتاحي:</span> <span>{fmtMoney(totals.openingCash)} EGP</span></div>
                <div className="flex justify-between text-green-600"><span>+ مبيعات كاش:</span> <span>{fmtMoney(totals.totalCashSales)}</span></div>
                <div className="flex justify-between text-destructive"><span>- مرتجعات كاش:</span> <span>{fmtMoney(totals.totalReturnsCash)}</span></div>
                <div className="flex justify-between text-destructive"><span>- مصروفات:</span> <span>{fmtMoney(totals.totalExpenses)}</span></div>
                <div className="flex justify-between border-t border-amber-500/30 pt-1.5 mt-1.5">
                  <span className="font-bold">المتوقع في الدرج:</span>
                  <span className="font-bold text-base text-amber-600">{fmtMoney(totals.expectedCash)} EGP</span>
                </div>
              </div>
            </div>

            {/* Actual Cash Input */}
            <div className="p-3 rounded-lg bg-card border-2 border-primary/30 space-y-2">
              <label className="text-xs font-bold text-primary block">💵 الرصيد الفعلي المعدود (اختياري)</label>
              <Input
                type="number"
                step="0.01"
                value={actualCash}
                onChange={(e) => { setActualCash(e.target.value); setConfirmedVariance(false); }}
                placeholder="عُد الكاش الموجود فعلاً في الدرج"
                className="text-base font-bold text-center"
                dir="ltr"
              />
              {variance !== null && (
                <div className={`p-2 rounded-md text-xs flex items-center justify-between ${variance === 0 ? "bg-green-500/10 text-green-700 dark:text-green-400" : variance > 0 ? "bg-blue-500/10 text-blue-700 dark:text-blue-400" : "bg-destructive/10 text-destructive"}`}>
                  <span className="flex items-center gap-1 font-bold">
                    {variance === 0 ? <><CheckCircle2 className="h-4 w-4" /> مطابق تماماً</> : variance > 0 ? <><TrendingUp className="h-4 w-4" /> زيادة</> : <><TrendingDown className="h-4 w-4" /> عجز</>}
                  </span>
                  <span className="font-bold text-base">{fmtMoney(Math.abs(variance))} EGP</span>
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">📝 ملاحظات الإغلاق (اختياري)</label>
              <Textarea
                value={closingNotes}
                onChange={(e) => setClosingNotes(e.target.value)}
                placeholder="مثال: سبب العجز، ملاحظات للإدارة..."
                rows={2}
                className="text-xs"
              />
            </div>

            {/* Net Revenue */}
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">صافي إيراد الشيفت:</span>
                <span className="font-bold text-primary text-lg">{fmtMoney(totals.netRevenue)} EGP</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">= المبيعات - المرتجعات - المصروفات</p>
            </div>

            {/* Variance Warning */}
            {hasSignificantVariance && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                  <div className="flex-1 text-xs">
                    <p className="font-bold text-destructive mb-1">يوجد فرق في الكاش!</p>
                    <p className="text-muted-foreground mb-2">يُفضّل مراجعة العمليات قبل الإغلاق. اضغط للتأكيد إذا كان مقصوداً.</p>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={confirmedVariance} onChange={(e) => setConfirmedVariance(e.target.checked)} className="w-3.5 h-3.5" />
                      <span className="font-bold">أؤكد الإغلاق رغم وجود الفرق</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            <p className="text-[10px] text-muted-foreground text-center">سيتم طباعة تقرير الشيفت تلقائياً عند الإغلاق</p>
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={handleCloseShiftSubmit}
              disabled={closeShift.isPending || (hasSignificantVariance && !confirmedVariance)}
              className="w-full gap-1"
            >
              <StopCircle className="h-4 w-4" />
              إغلاق الشيفت وطباعة التقرير
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
