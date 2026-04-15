import React, { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { PlayCircle, StopCircle, Clock } from "lucide-react";
import { format } from "date-fns";

interface PosShiftManagerProps {
  companyId: string;
  branchId: string;
  userName: string;
}

export const PosShiftManager: React.FC<PosShiftManagerProps> = ({ companyId, branchId, userName }) => {
  const queryClient = useQueryClient();
  const [showOpenDialog, setShowOpenDialog] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [openingCash, setOpeningCash] = useState<number>(0);

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
        .gte("date", currentShift.opened_at);
      if (branchId) query = query.eq("branch_id", branchId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!currentShift,
  });

  const openShift = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("pos_shifts").insert({
        company_id: companyId,
        branch_id: branchId || null,
        opened_by: userName,
        opening_cash: openingCash,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم فتح الشيفت بنجاح");
      setShowOpenDialog(false);
      setOpeningCash(0);
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
      // Print shift report
      printShiftReport();
      toast.success("تم إغلاق الشيفت بنجاح");
      setShowCloseDialog(false);
      queryClient.invalidateQueries({ queryKey: ["pos-current-shift"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const printShiftReport = useCallback(() => {
    if (!currentShift || !shiftSales) return;

    const totalSales = shiftSales.reduce((s, sale) => s + sale.total_amount, 0);
    const totalCash = shiftSales.filter((s: any) => (s as any).payment_method === "كاش").reduce((s, sale) => s + sale.total_amount, 0);
    const totalVisa = shiftSales.filter((s: any) => (s as any).payment_method === "فيزا").reduce((s, sale) => s + sale.total_amount, 0);
    const invoiceCount = shiftSales.length;

    // Aggregate items
    const itemMap = new Map<string, { name: string; qty: number; total: number }>();
    shiftSales.forEach((sale) => {
      (sale.pos_sale_items as any[])?.forEach((si: any) => {
        const name = si.pos_items?.name || "صنف";
        const existing = itemMap.get(name);
        if (existing) {
          existing.qty += si.quantity;
          existing.total += si.total;
        } else {
          itemMap.set(name, { name, qty: si.quantity, total: si.total });
        }
      });
    });
    const itemsList = Array.from(itemMap.values()).sort((a, b) => b.total - a.total);

    const printWindow = window.open("", "_blank", "width=320,height=700");
    if (!printWindow) { toast.error("يرجى السماح بالنوافذ المنبثقة"); return; }

    printWindow.document.write(`<!DOCTYPE html>
<html dir="rtl"><head><meta charset="utf-8"/><title>تقرير الشيفت</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Cairo',sans-serif;direction:rtl;width:80mm;margin:0 auto;padding:8px;font-size:11px;color:#000;}
table{width:100%;border-collapse:collapse;}
th,td{padding:3px 0;font-size:10px;text-align:right;}
td:last-child,th:last-child{text-align:left;}
td:nth-child(2),th:nth-child(2){text-align:center;}
.center{text-align:center;}
.bold{font-weight:bold;}
.sep{border-top:1px dashed #999;margin:6px 0;padding-top:6px;}
.total-row{font-size:14px;font-weight:bold;}
@media print{body{width:80mm;}}
</style></head><body>
<div class="center"><h2 style="font-size:14px;">تقرير إغلاق الشيفت</h2>
<p style="font-size:9px;color:#666;">CostControl POS</p></div>
<div class="sep">
<p><b>فتح:</b> ${format(new Date(currentShift.opened_at), "yyyy/MM/dd HH:mm")}</p>
<p><b>إغلاق:</b> ${format(new Date(), "yyyy/MM/dd HH:mm")}</p>
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
<div class="sep center total-row">
<p>صافي الشيفت: ${totalSales.toFixed(2)} EGP</p>
</div>
</body></html>`);
    printWindow.document.close();
    printWindow.onload = () => { printWindow.focus(); printWindow.print(); printWindow.close(); };
  }, [currentShift, shiftSales]);

  return (
    <>
      {currentShift ? (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1 text-[10px] border-green-500/30 text-green-500">
            <Clock className="h-3 w-3" />
            شيفت مفتوح منذ {format(new Date(currentShift.opened_at), "HH:mm")}
          </Badge>
          <Button variant="destructive" size="sm" className="h-7 text-[10px] gap-1" onClick={() => setShowCloseDialog(true)}>
            <StopCircle className="h-3 w-3" />
            إغلاق الشيفت
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 border-green-500/30 text-green-500 hover:bg-green-500/10" onClick={() => setShowOpenDialog(true)}>
          <PlayCircle className="h-3 w-3" />
          فتح شيفت
        </Button>
      )}

      {/* Open Shift Dialog */}
      <Dialog open={showOpenDialog} onOpenChange={setShowOpenDialog}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>فتح شيفت جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">المبلغ الافتتاحي (EGP)</label>
              <Input type="number" value={openingCash || ""} onChange={(e) => setOpeningCash(Number(e.target.value))} placeholder="0.00" />
            </div>
            <p className="text-xs text-muted-foreground">الكاشير: {userName}</p>
          </div>
          <DialogFooter>
            <Button onClick={() => openShift.mutate()} disabled={openShift.isPending} className="w-full gap-1">
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
              <p><span className="text-muted-foreground">وقت الفتح:</span> {currentShift && format(new Date(currentShift.opened_at), "yyyy/MM/dd HH:mm")}</p>
              <p><span className="text-muted-foreground">الكاشير:</span> {currentShift?.opened_by}</p>
              <p><span className="text-muted-foreground">المبلغ الافتتاحي:</span> {(currentShift?.opening_cash || 0).toFixed(2)} EGP</p>
            </div>
            <div className="p-3 rounded-lg bg-primary/5 space-y-1">
              <p><span className="text-muted-foreground">عدد الفواتير:</span> <span className="font-bold">{shiftSales?.length || 0}</span></p>
              <p><span className="text-muted-foreground">إجمالي المبيعات:</span> <span className="font-bold text-primary">{(shiftSales?.reduce((s, r) => s + r.total_amount, 0) || 0).toFixed(2)} EGP</span></p>
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
