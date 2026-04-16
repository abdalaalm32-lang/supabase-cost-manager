import React, { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { PlayCircle, StopCircle, Clock, Lock } from "lucide-react";
import { format, isValid } from "date-fns";

const safeFormat = (dateVal: any, fmt: string, fallback = "—") => {
  if (!dateVal) return fallback;
  const d = new Date(dateVal);
  return isValid(d) ? format(d, fmt) : fallback;
};

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

  // Get current open shift
  const { data: currentShift } = useQuery({
    queryKey: ["pos-current-shift", companyId, branchId],
    queryFn: async () => {
      let query = supabase
        .from("pos_shifts")
        .select("*")
        .eq("company_id", companyId)
        .eq("status", "مفتوح")
        .order("opened_at", { ascending: false })
        .limit(1);
      if (branchId) query = query.eq("branch_id", branchId);
      const { data, error } = await query;
      if (error) throw error;
      return data?.[0] || null;
    },
    enabled: !!companyId,
  });

  // Get shift sales for close report
  const { data: shiftSales } = useQuery({
    queryKey: ["pos-shift-sales", currentShift?.id],
    queryFn: async () => {
      if (!currentShift) return null;
      let query = supabase
        .from("pos_sales")
        .select("*, pos_sale_items(*, pos_items:pos_item_id(name))")
        .eq("company_id", companyId)
        .eq("status", "مكتمل")
        .gte("date", currentShift.opened_at)
        .lte("date", currentShift.closed_at || new Date().toISOString());
      if (branchId) query = query.eq("branch_id", branchId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
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

  // Get shift returns
  const { data: shiftReturns } = useQuery({
    queryKey: ["pos-shift-returns", currentShift?.id],
    queryFn: async () => {
      if (!currentShift) return null;
      let query = supabase
        .from("pos_returns")
        .select("*")
        .eq("company_id", companyId)
        .gte("date", currentShift.opened_at)
        .lte("date", new Date().toISOString());
      if (branchId) query = query.eq("branch_id", branchId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!currentShift,
  });

  const verifyPassword = (action: "open" | "close") => {
    if (action === "open") {
      // When opening, check if there are definitions with passwords
      // Password will be verified based on selected definition
      setShowOpenDialog(true);
      return;
    }
    
    const userPosPassword = (currentProfile as any)?.pos_password;
    if (userPosPassword) {
      setPasswordAction(action);
      setPosPassword("");
      setShowPasswordDialog(true);
    } else {
      setShowCloseDialog(true);
    }
  };

  const handlePasswordSubmit = () => {
    const userPosPassword = (currentProfile as any)?.pos_password;
    if (posPassword === userPosPassword) {
      setShowPasswordDialog(false);
      setPosPassword("");
      if (passwordAction === "open") setShowOpenDialog(true);
      else setShowCloseDialog(true);
    } else {
      toast.error("كلمة المرور غير صحيحة");
    }
  };

  const handleOpenShiftSubmit = () => {
    // Check password from selected definition
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
      const { error } = await supabase.from("pos_shifts").update({
        closed_at: new Date().toISOString(),
        closed_by: userName,
        status: "مغلق",
      }).eq("id", currentShift.id);
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

  const totalSales = shiftSales?.reduce((s, sale) => s + sale.total_amount, 0) ?? 0;
  const totalCash = shiftSales?.filter((s: any) => s.payment_method === "كاش").reduce((s, sale) => s + sale.total_amount, 0) ?? 0;
  const totalVisa = shiftSales?.filter((s: any) => s.payment_method === "فيزا").reduce((s, sale) => s + sale.total_amount, 0) ?? 0;
  const invoiceCount = shiftSales?.length ?? 0;
  const totalExpenses = shiftExpenses?.reduce((s: number, e: any) => s + (e.amount || 0), 0) ?? 0;
  const totalReturns = shiftReturns?.reduce((s: number, r: any) => s + (r.total_amount || 0), 0) ?? 0;
  const netCash = (currentShift?.opening_cash ?? 0) + totalCash - totalExpenses - totalReturns;

  const printShiftReport = useCallback(() => {
    if (!currentShift || !shiftSales) return;

    const shiftNum = (currentShift as any).shift_number || "—";

    const itemMap = new Map<string, { name: string; qty: number; total: number }>();
    shiftSales.forEach((sale) => {
      (sale.pos_sale_items as any[])?.forEach((si: any) => {
        const name = si.pos_items?.name || "صنف";
        const existing = itemMap.get(name);
        if (existing) { existing.qty += si.quantity; existing.total += si.total; }
        else { itemMap.set(name, { name, qty: si.quantity, total: si.total }); }
      });
    });
    const itemsList = Array.from(itemMap.values()).sort((a, b) => b.total - a.total);

    const expensesRows = (shiftExpenses || []).map((e: any) =>
      `<tr><td>${e.description}</td><td style="text-align:left">${e.amount?.toFixed(2)}</td></tr>`
    ).join("");

    const returnsRows = (shiftReturns || []).map((r: any) =>
      `<tr><td>${r.return_number || "—"}</td><td style="text-align:left">${r.total_amount?.toFixed(2)}</td></tr>`
    ).join("");

    const html = `<!DOCTYPE html>
<html dir="rtl"><head><meta charset="utf-8"/><title>تقرير الشيفت</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Cairo',sans-serif;direction:rtl;width:72mm;margin:0 auto;padding:8px;font-size:11px;color:#000;}
table{width:100%;border-collapse:collapse;}
th,td{padding:3px 0;font-size:10px;text-align:right;}
td:last-child,th:last-child{text-align:left;}
td:nth-child(2),th:nth-child(2){text-align:center;}
.center{text-align:center;}
.bold{font-weight:bold;}
.sep{border-top:1px dashed #999;margin:6px 0;padding-top:6px;}
.total-row{font-size:14px;font-weight:bold;}
.expense-label{color:#c00;}
@media print{@page{size:80mm auto;margin:0}body{width:72mm;}}
</style></head><body>
<div class="center"><h2 style="font-size:14px;">تقرير إغلاق الشيفت</h2>
<p style="font-size:11px;font-weight:bold;margin-top:2px">${shiftNum}</p>
${(currentShift as any).shift_name ? `<p style="font-size:10px;margin-top:2px">${(currentShift as any).shift_name}</p>` : ""}
<p style="font-size:9px;color:#666;">CostControl POS</p></div>
<div class="sep">
<p><b>فتح:</b> ${safeFormat(currentShift.opened_at, "yyyy/MM/dd HH:mm")}</p>
<p><b>إغلاق:</b> ${safeFormat(new Date(), "yyyy/MM/dd HH:mm")}</p>
<p><b>الكاشير:</b> ${currentShift.opened_by || "-"}</p>
<p><b>المبلغ الافتتاحي:</b> ${(currentShift.opening_cash || 0).toFixed(2)} EGP</p>
</div>
<div class="sep"><p class="bold">ملخص المبيعات</p>
<p>عدد الفواتير: ${invoiceCount}</p>
<p>إجمالي المبيعات: ${totalSales.toFixed(2)} EGP</p>
<p>كاش: ${totalCash.toFixed(2)} EGP</p>
<p>فيزا: ${totalVisa.toFixed(2)} EGP</p>
</div>
<div class="sep"><p class="bold">الأصناف المباعة</p>
<table><thead><tr><th>الصنف</th><th>الكمية</th><th>الإجمالي</th></tr></thead><tbody>
${itemsList.map(i => `<tr><td>${i.name}</td><td style="text-align:center">${i.qty}</td><td style="text-align:left">${i.total.toFixed(2)}</td></tr>`).join("")}
</tbody></table></div>
${totalExpenses > 0 ? `<div class="sep"><p class="bold expense-label">المصروفات (${(shiftExpenses || []).length})</p>
<table><thead><tr><th>الوصف</th><th>المبلغ</th></tr></thead><tbody>${expensesRows}</tbody></table>
<p class="bold" style="margin-top:4px">إجمالي المصروفات: ${totalExpenses.toFixed(2)} EGP</p></div>` : ""}
${totalReturns > 0 ? `<div class="sep"><p class="bold expense-label">المرتجعات (${(shiftReturns || []).length})</p>
<table><thead><tr><th>رقم المرتجع</th><th>المبلغ</th></tr></thead><tbody>${returnsRows}</tbody></table>
<p class="bold" style="margin-top:4px">إجمالي المرتجعات: ${totalReturns.toFixed(2)} EGP</p></div>` : ""}
<div class="sep center">
<p>إجمالي المبيعات: ${totalSales.toFixed(2)} EGP</p>
${totalExpenses > 0 ? `<p class="expense-label">- المصروفات: ${totalExpenses.toFixed(2)} EGP</p>` : ""}
${totalReturns > 0 ? `<p class="expense-label">- المرتجعات: ${totalReturns.toFixed(2)} EGP</p>` : ""}
<p class="total-row" style="margin-top:6px">صافي الشيفت: ${(totalSales - totalExpenses - totalReturns).toFixed(2)} EGP</p>
<p style="font-size:11px;margin-top:4px">المتوقع في الدرج (كاش): ${netCash.toFixed(2)} EGP</p>
</div>
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
  }, [currentShift, shiftSales, shiftExpenses, shiftReturns, totalSales, totalCash, totalVisa, invoiceCount, totalExpenses, totalReturns, netCash, printViaIframe]);

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
            {/* Shift Definition selector */}
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
            {/* Password if definition has one */}
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

      {/* Close Shift Dialog */}
      <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>إغلاق الشيفت</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="p-3 rounded-lg bg-muted/50 space-y-1">
              <p><span className="text-muted-foreground">كود الشيفت:</span> <span className="font-bold text-primary">{(currentShift as any)?.shift_number || "—"}</span></p>
              {(currentShift as any)?.shift_name && <p><span className="text-muted-foreground">اسم الشيفت:</span> <span className="font-bold">{(currentShift as any)?.shift_name}</span></p>}
              <p><span className="text-muted-foreground">وقت الفتح:</span> {safeFormat(currentShift?.opened_at, "yyyy/MM/dd HH:mm")}</p>
              <p><span className="text-muted-foreground">الكاشير:</span> {currentShift?.opened_by}</p>
              <p><span className="text-muted-foreground">المبلغ الافتتاحي:</span> {(currentShift?.opening_cash || 0).toFixed(2)} EGP</p>
            </div>
            <div className="p-3 rounded-lg bg-primary/5 space-y-1">
              <p><span className="text-muted-foreground">عدد الفواتير:</span> <span className="font-bold">{invoiceCount}</span></p>
              <p><span className="text-muted-foreground">إجمالي المبيعات:</span> <span className="font-bold text-primary">{totalSales.toFixed(2)} EGP</span></p>
              <p><span className="text-muted-foreground">كاش:</span> <span className="font-bold">{totalCash.toFixed(2)} EGP</span></p>
              <p><span className="text-muted-foreground">فيزا:</span> <span className="font-bold">{totalVisa.toFixed(2)} EGP</span></p>
            </div>
            {totalExpenses > 0 && (
              <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/10 space-y-1">
                <p className="font-bold text-destructive text-xs">المصروفات ({(shiftExpenses || []).length})</p>
                {(shiftExpenses || []).map((e: any) => (
                  <p key={e.id} className="text-xs"><span className="text-muted-foreground">{e.description}:</span> <span className="font-bold">{e.amount?.toFixed(2)} EGP</span></p>
                ))}
                <p className="text-xs font-bold border-t border-destructive/10 pt-1 mt-1">إجمالي: {totalExpenses.toFixed(2)} EGP</p>
              </div>
            )}
            {totalReturns > 0 && (
              <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/10 space-y-1">
                <p className="font-bold text-destructive text-xs">المرتجعات ({(shiftReturns || []).length})</p>
                <p className="text-xs font-bold">إجمالي: {totalReturns.toFixed(2)} EGP</p>
              </div>
            )}
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 space-y-1">
              <p><span className="text-muted-foreground">صافي الشيفت:</span> <span className="font-bold text-primary text-lg">{(totalSales - totalExpenses - totalReturns).toFixed(2)} EGP</span></p>
              <p className="text-xs"><span className="text-muted-foreground">المتوقع في الدرج (كاش):</span> <span className="font-bold">{netCash.toFixed(2)} EGP</span></p>
            </div>
            <p className="text-xs text-muted-foreground">سيتم طباعة تقرير الشيفت تلقائياً عند الإغلاق</p>
          </div>
          <DialogFooter>
            <Button variant="destructive" onClick={() => closeShift.mutate()} disabled={closeShift.isPending} className="w-full gap-1">
              <StopCircle className="h-4 w-4" />
              إغلاق وطباعة التقرير
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
