/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RotateCcw, Search, ShieldAlert, CalendarIcon, Printer, FileText } from "lucide-react";
import { format, startOfDay, endOfDay } from "date-fns";

interface PosReturnsManagerProps {
  companyId: string;
  branchId: string;
  userName: string;
  userRole: string;
  printViaIframe: (html: string) => void;
  companyName?: string;
}

interface ReturnItem {
  pos_item_id: string;
  item_name: string;
  quantity: number;
  max_quantity: number;
  unit_price: number;
  selected: boolean;
}

export const PosReturnsManager: React.FC<PosReturnsManagerProps> = ({
  companyId, branchId, userName, userRole, printViaIframe, companyName
}) => {
  const queryClient = useQueryClient();
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [returnReason, setReturnReason] = useState("");
  const [reportDate, setReportDate] = useState<Date>(new Date());

  // Only manager or owner can access returns
  const canReturn = userRole === "مدير" || userRole === "مالك" || userRole === "مدير نظام" || userRole === "مدير شركة";

  // Search for invoice
  const searchSale = useMutation({
    mutationFn: async () => {
      if (!invoiceSearch.trim()) throw new Error("أدخل رقم الفاتورة");
      const { data, error } = await supabase
        .from("pos_sales")
        .select("*, pos_sale_items(*, pos_items:pos_item_id(name))")
        .eq("company_id", companyId)
        .eq("invoice_number", invoiceSearch.trim())
        .eq("status", "مكتمل")
        .single();
      if (error || !data) throw new Error("لم يتم العثور على الفاتورة أو أنها غير مكتملة");
      return data;
    },
    onSuccess: (sale: any) => {
      setSelectedSale(sale);
      setReturnItems(
        (sale.pos_sale_items || []).map((item: any) => ({
          pos_item_id: item.pos_item_id,
          item_name: item.pos_items?.name || "صنف",
          quantity: item.quantity,
          max_quantity: item.quantity,
          unit_price: item.unit_price,
          selected: true,
        }))
      );
    },
    onError: (e: any) => toast.error(e.message),
  });

  const selectedReturnItems = returnItems.filter(i => i.selected);
  const returnTotal = selectedReturnItems.reduce((s, i) => s + i.unit_price * i.quantity, 0);

  const processReturn = useMutation({
    mutationFn: async () => {
      if (!selectedSale) throw new Error("لم يتم اختيار فاتورة");
      if (selectedReturnItems.length === 0) throw new Error("يجب اختيار صنف واحد على الأقل");
      if (!returnReason.trim()) throw new Error("يجب إدخال سبب المرتجع");

      // Generate return number
      const { data: retNum } = await supabase.rpc("generate_return_number", { p_company_id: companyId });

      // Find open shift to link the return (if any)
      let openShiftId: string | null = null;
      try {
        let shiftQ = supabase.from("pos_shifts").select("id").eq("company_id", companyId).eq("status", "مفتوح").order("opened_at", { ascending: false }).limit(1);
        if (branchId) shiftQ = shiftQ.eq("branch_id", branchId);
        const { data: openShift } = await shiftQ;
        openShiftId = openShift?.[0]?.id || null;
      } catch { /* ignore */ }

      // Create return record (payment method follows the original sale)
      const { data: returnRecord, error: retErr } = await supabase.from("pos_returns").insert({
        company_id: companyId,
        branch_id: branchId || null,
        shift_id: openShiftId,
        sale_id: selectedSale.id,
        return_number: retNum,
        total_amount: returnTotal,
        payment_method: selectedSale?.payment_method || "كاش",
        reason: returnReason.trim(),
        created_by: userName,
      } as any).select().single();
      if (retErr) throw retErr;

      // Insert return items
      const items = selectedReturnItems.map(i => ({
        return_id: returnRecord.id,
        pos_item_id: i.pos_item_id,
        item_name: i.item_name,
        quantity: i.quantity,
        unit_price: i.unit_price,
        total: i.unit_price * i.quantity,
      }));
      const { error: itemsErr } = await supabase.from("pos_return_items").insert(items as any);
      if (itemsErr) throw itemsErr;

      return returnRecord;
    },
    onSuccess: (returnRecord: any) => {
      toast.success(`تم تسجيل المرتجع ${returnRecord.return_number} بنجاح`);
      // Print return receipt
      printReturnReceipt(returnRecord);
      resetReturnDialog();
      queryClient.invalidateQueries({ queryKey: ["pos-returns"] });
      queryClient.invalidateQueries({ queryKey: ["pos-shift-sales"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const printReturnReceipt = useCallback((returnRecord: any) => {
    const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"/><title>إيصال مرتجع</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Cairo','Tahoma',sans-serif;width:72mm;margin:0 auto;padding:4px 6px;font-size:11px;color:#000;line-height:1.4}
.center{text-align:center}.bold{font-weight:bold}
.sep{border-top:1px dashed #999;margin:6px 0;padding-top:6px}
table{width:100%;border-collapse:collapse}
th,td{padding:3px 0;font-size:10px;text-align:right}
td:last-child,th:last-child{text-align:left}
.total{font-size:14px;font-weight:bold;text-align:center;margin-top:8px}
@media print{@page{size:80mm auto;margin:0}body{width:72mm}}
</style></head><body>
<div class="center"><h2 style="font-size:14px;color:#c00">⟲ إيصال مرتجع</h2>
<p style="font-size:9px">${companyName || "CostControl"}</p></div>
<div class="sep">
<p><b>رقم المرتجع:</b> ${returnRecord.return_number}</p>
<p><b>رقم الفاتورة:</b> ${selectedSale?.invoice_number || "—"}</p>
<p><b>التاريخ:</b> ${format(new Date(), "yyyy/MM/dd HH:mm")}</p>
<p><b>المسؤول:</b> ${userName}</p>
</div>
<div class="sep"><p class="bold">الأصناف المرتجعة</p>
<table><thead><tr><th>الصنف</th><th style="text-align:center">الكمية</th><th style="text-align:left">الإجمالي</th></tr></thead><tbody>
${selectedReturnItems.map(i => `<tr><td>${i.item_name}</td><td style="text-align:center">${i.quantity}</td><td style="text-align:left">${(i.unit_price * i.quantity).toFixed(2)}</td></tr>`).join("")}
</tbody></table></div>
<div class="sep">
<p><b>السبب:</b> ${returnReason}</p>
</div>
<div class="total" style="color:#c00">المبلغ المرتجع: ${returnTotal.toFixed(2)} EGP</div>
</body></html>`;
    printViaIframe(html);
  }, [selectedSale, selectedReturnItems, returnTotal, returnReason, userName, companyName, printViaIframe]);

  const resetReturnDialog = () => {
    setReturnDialogOpen(false);
    setSelectedSale(null);
    setReturnItems([]);
    setInvoiceSearch("");
    setReturnReason("");
  };

  // Returns report data
  const { data: returnsReport } = useQuery({
    queryKey: ["pos-returns-report", companyId, branchId, format(reportDate, "yyyy-MM-dd")],
    queryFn: async () => {
      let query = supabase
        .from("pos_returns")
        .select("*, pos_return_items(*), pos_sales:sale_id(invoice_number)")
        .eq("company_id", companyId)
        .gte("date", startOfDay(reportDate).toISOString())
        .lte("date", endOfDay(reportDate).toISOString())
        .order("date", { ascending: false });
      if (branchId) query = query.eq("branch_id", branchId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!companyId && reportDialogOpen,
  });

  const reportTotal = returnsReport?.reduce((s: number, r: any) => s + (r.total_amount || 0), 0) ?? 0;

  return (
    <>
      {/* Return button - only for manager/owner */}
      {canReturn && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[10px] gap-1 border-red-500/30 text-red-500 hover:bg-red-500/10"
          onClick={() => setReturnDialogOpen(true)}
        >
          <RotateCcw className="h-3 w-3" />
          مرتجع
        </Button>
      )}

      {/* Reports button - always visible */}
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-[10px] gap-1"
        onClick={() => setReportDialogOpen(true)}
      >
        <FileText className="h-3 w-3" />
        تقرير المرتجعات
      </Button>

      {/* Return processing dialog */}
      <Dialog open={returnDialogOpen} onOpenChange={(v) => { if (!v) resetReturnDialog(); else setReturnDialogOpen(true); }}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <RotateCcw className="h-4 w-4 text-red-500" />
              عملية مرتجع
              <Badge variant="outline" className="text-[10px] gap-1 text-amber-500 border-amber-500/30">
                <ShieldAlert className="h-3 w-3" />
                {userRole} فقط
              </Badge>
            </DialogTitle>
          </DialogHeader>

          {/* Search invoice */}
          {!selectedSale && (
            <div className="flex gap-2">
              <Input
                placeholder="رقم الفاتورة (مثل INV-00001)"
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
                className="flex-1 text-xs h-8"
                onKeyDown={(e) => e.key === "Enter" && searchSale.mutate()}
              />
              <Button
                size="sm"
                className="h-8 gap-1 text-xs"
                onClick={() => searchSale.mutate()}
                disabled={searchSale.isPending}
              >
                <Search className="h-3 w-3" />
                بحث
              </Button>
            </div>
          )}

          {/* Invoice details + item selection */}
          {selectedSale && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-muted/50 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">رقم الفاتورة:</span>
                  <span className="font-bold font-mono">{selectedSale.invoice_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">التاريخ:</span>
                  <span>{format(new Date(selectedSale.date), "yyyy/MM/dd HH:mm")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">إجمالي الفاتورة:</span>
                  <span className="font-bold text-primary">{selectedSale.total_amount?.toFixed(2)} EGP</span>
                </div>
              </div>

              <p className="text-xs font-bold">اختر الأصناف المرتجعة:</p>
              <ScrollArea className="max-h-[200px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs text-center w-8"></TableHead>
                      <TableHead className="text-xs text-right">الصنف</TableHead>
                      <TableHead className="text-xs text-center">الكمية</TableHead>
                      <TableHead className="text-xs text-right">الإجمالي</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {returnItems.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={item.selected}
                            onCheckedChange={(v) => {
                              setReturnItems(prev => prev.map((it, i) => i === idx ? { ...it, selected: !!v } : it));
                            }}
                          />
                        </TableCell>
                        <TableCell className="text-xs">{item.item_name}</TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            min={1}
                            max={item.max_quantity}
                            value={item.quantity}
                            onChange={(e) => {
                              const val = Math.min(Math.max(1, Number(e.target.value)), item.max_quantity);
                              setReturnItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: val } : it));
                            }}
                            className="w-16 h-6 text-xs text-center mx-auto"
                            disabled={!item.selected}
                          />
                        </TableCell>
                        <TableCell className="text-xs font-bold">
                          {item.selected ? (item.unit_price * item.quantity).toFixed(2) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>

              <Textarea
                placeholder="سبب المرتجع *"
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                className="text-xs min-h-[60px]"
              />

              {returnTotal > 0 && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-center">
                  <span className="text-xs text-muted-foreground">المبلغ المرتجع: </span>
                  <span className="text-lg font-black text-red-500">{returnTotal.toFixed(2)} EGP</span>
                </div>
              )}
            </div>
          )}

          {selectedSale && (
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={resetReturnDialog}>إلغاء</Button>
              <Button
                variant="destructive"
                size="sm"
                className="gap-1"
                onClick={() => processReturn.mutate()}
                disabled={processReturn.isPending || selectedReturnItems.length === 0 || !returnReason.trim()}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                تأكيد المرتجع وطباعة الإيصال
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Returns report dialog */}
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-primary" />
              تقرير المرتجعات
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-3">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {format(reportDate, "yyyy/MM/dd")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={reportDate} onSelect={(d) => d && setReportDate(d)} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <Badge variant="outline" className="text-xs">
              {returnsReport?.length ?? 0} مرتجع • إجمالي: {reportTotal.toFixed(2)} EGP
            </Badge>
          </div>

          <ScrollArea className="max-h-[400px]">
            {!returnsReport || returnsReport.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-xs">
                <RotateCcw className="h-10 w-10 mx-auto mb-3 opacity-20" />
                لا توجد مرتجعات في هذا اليوم
              </div>
            ) : (
              <div className="space-y-3">
                {returnsReport.map((ret: any) => (
                  <div key={ret.id} className="p-3 rounded-lg border border-border/50 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] font-mono text-red-500 border-red-500/30">{ret.return_number}</Badge>
                        <span className="text-muted-foreground">← {(ret.pos_sales as any)?.invoice_number || "—"}</span>
                      </div>
                      <span className="text-muted-foreground">{format(new Date(ret.date), "HH:mm")}</span>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs text-right h-7">الصنف</TableHead>
                          <TableHead className="text-xs text-center h-7">الكمية</TableHead>
                          <TableHead className="text-xs text-right h-7">الإجمالي</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(ret.pos_return_items || []).map((item: any) => (
                          <TableRow key={item.id}>
                            <TableCell className="text-xs py-1">{item.item_name}</TableCell>
                            <TableCell className="text-xs text-center py-1">{item.quantity}</TableCell>
                            <TableCell className="text-xs py-1">{item.total?.toFixed(2)} EGP</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">السبب: {ret.reason || "—"}</span>
                      <span className="font-bold text-red-500">{ret.total_amount?.toFixed(2)} EGP</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">بواسطة: {ret.created_by}</div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
};
