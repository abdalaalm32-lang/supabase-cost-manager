/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, startOfDay, endOfDay } from "date-fns";
import {
  Truck, Plus, Trash2, Edit2, Phone, CalendarIcon,
  Users, Banknote, PackageCheck, TrendingUp, Printer
} from "lucide-react";

export const DriverSettlementPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const queryClient = useQueryClient();

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedDriverId, setSelectedDriverId] = useState<string>("all");

  // Driver management dialog
  const [driverDialog, setDriverDialog] = useState(false);
  const [editingDriver, setEditingDriver] = useState<any>(null);
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");

  // Drivers
  const { data: drivers } = useQuery({
    queryKey: ["delivery-drivers", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_drivers")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Delivered orders for selected date
  const { data: deliveredOrders } = useQuery({
    queryKey: ["driver-settlement-orders", companyId, format(selectedDate, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pos_sales")
        .select("*, delivery_drivers:driver_id(name)")
        .eq("company_id", companyId!)
        .eq("order_type", "دليفري")
        .eq("delivery_status", "تم التسليم")
        .gte("date", startOfDay(selectedDate).toISOString())
        .lte("date", endOfDay(selectedDate).toISOString())
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const filteredOrders = useMemo(() => {
    if (!deliveredOrders) return [];
    if (selectedDriverId === "all") return deliveredOrders;
    if (selectedDriverId === "unassigned") return deliveredOrders.filter((o: any) => !o.driver_id);
    return deliveredOrders.filter((o: any) => o.driver_id === selectedDriverId);
  }, [deliveredOrders, selectedDriverId]);

  // Stats per driver
  const driverStats = useMemo(() => {
    if (!deliveredOrders) return [];
    const map = new Map<string, { name: string; orderCount: number; totalSales: number; totalDeliveryFee: number }>();
    
    deliveredOrders.forEach((o: any) => {
      const driverName = (o.delivery_drivers as any)?.name || "غير معيّن";
      const key = o.driver_id || "unassigned";
      const existing = map.get(key);
      if (existing) {
        existing.orderCount++;
        existing.totalSales += o.total_amount;
        existing.totalDeliveryFee += o.delivery_fee || 0;
      } else {
        map.set(key, {
          name: driverName,
          orderCount: 1,
          totalSales: o.total_amount,
          totalDeliveryFee: o.delivery_fee || 0,
        });
      }
    });
    return Array.from(map.entries()).map(([id, stats]) => ({ id, ...stats }));
  }, [deliveredOrders]);

  const totalStats = useMemo(() => {
    return {
      orders: filteredOrders.length,
      sales: filteredOrders.reduce((s: number, o: any) => s + o.total_amount, 0),
      deliveryFees: filteredOrders.reduce((s: number, o: any) => s + (o.delivery_fee || 0), 0),
    };
  }, [filteredOrders]);

  // Save driver
  const saveDriver = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("لا يوجد شركة");
      if (!driverName.trim()) throw new Error("اسم الطيار مطلوب");

      if (editingDriver) {
        const { error } = await supabase.from("delivery_drivers")
          .update({ name: driverName.trim(), phone: driverPhone || null })
          .eq("id", editingDriver.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("delivery_drivers")
          .insert({ company_id: companyId, name: driverName.trim(), phone: driverPhone || null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingDriver ? "تم تعديل الطيار" : "تم إضافة الطيار");
      setDriverDialog(false);
      setEditingDriver(null);
      setDriverName("");
      setDriverPhone("");
      queryClient.invalidateQueries({ queryKey: ["delivery-drivers"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteDriver = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("delivery_drivers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حذف الطيار");
      queryClient.invalidateQueries({ queryKey: ["delivery-drivers"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handlePrint = () => {
    const companyName = auth.profile?.company_id ? "" : "";
    const dateStr = format(selectedDate, "yyyy/MM/dd");
    const driverLabel = selectedDriverId === "all" ? "كل الطيارين"
      : selectedDriverId === "unassigned" ? "غير معيّن"
      : drivers?.find((d: any) => d.id === selectedDriverId)?.name || "";

    const driverStatsRows = driverStats.map(ds => `
      <tr>
        <td>${ds.name}</td>
        <td>${ds.orderCount}</td>
        <td>${ds.totalSales.toFixed(2)}</td>
        <td>${ds.totalDeliveryFee.toFixed(2)}</td>
        <td style="font-weight:bold;color:#2563eb">${(ds.totalSales + ds.totalDeliveryFee).toFixed(2)}</td>
      </tr>
    `).join("");

    const orderRows = filteredOrders.map((o: any) => `
      <tr>
        <td>${o.invoice_number || "—"}</td>
        <td>${o.customer_name || "—"}</td>
        <td>${(o.delivery_drivers as any)?.name || "غير معيّن"}</td>
        <td>${o.total_amount.toFixed(2)}</td>
        <td>${(o.delivery_fee || 0).toFixed(2)}</td>
        <td style="font-weight:bold">${(o.total_amount + (o.delivery_fee || 0)).toFixed(2)}</td>
        <td>${o.payment_method}</td>
        <td>${format(new Date(o.date), "HH:mm")}</td>
      </tr>
    `).join("");

    const html = `<!DOCTYPE html>
<html dir="rtl"><head><meta charset="utf-8"/><title>تسوية حسابات الطيارين</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Cairo',sans-serif;direction:rtl;padding:20px;font-size:12px;color:#000;}
h1{font-size:16px;text-align:center;margin-bottom:4px;}
.sub{text-align:center;font-size:11px;color:#666;margin-bottom:12px;}
table{width:100%;border-collapse:collapse;margin-bottom:16px;}
th,td{border:1px solid #ddd;padding:5px 8px;text-align:right;font-size:11px;}
th{background:#f5f5f5;font-weight:bold;}
.section-title{font-size:13px;font-weight:bold;margin:12px 0 6px;border-bottom:2px solid #333;padding-bottom:4px;}
.stats{display:flex;gap:20px;margin-bottom:12px;justify-content:center;}
.stat{text-align:center;padding:8px 16px;border:1px solid #ddd;border-radius:6px;}
.stat-val{font-size:18px;font-weight:bold;}
.stat-lbl{font-size:10px;color:#666;}
.total-row{font-weight:bold;background:#f0f7ff;}
@media print{@page{size:A4;margin:10mm;}}
</style></head><body>
<h1>تسوية حسابات الطيارين</h1>
<p class="sub">التاريخ: ${dateStr} | ${driverLabel}</p>
<div class="stats">
  <div class="stat"><div class="stat-val">${totalStats.orders}</div><div class="stat-lbl">عدد الأوردرات</div></div>
  <div class="stat"><div class="stat-val">${totalStats.sales.toFixed(2)} EGP</div><div class="stat-lbl">إجمالي المبيعات</div></div>
  <div class="stat"><div class="stat-val">${totalStats.deliveryFees.toFixed(2)} EGP</div><div class="stat-lbl">رسوم التوصيل</div></div>
</div>
${driverStats.length > 0 ? `
<p class="section-title">ملخص الطيارين</p>
<table>
  <thead><tr><th>الطيار</th><th>عدد الأوردرات</th><th>إجمالي المبيعات</th><th>رسوم التوصيل</th><th>المطلوب من الطيار</th></tr></thead>
  <tbody>${driverStatsRows}
    <tr class="total-row">
      <td>الإجمالي</td>
      <td>${driverStats.reduce((s, d) => s + d.orderCount, 0)}</td>
      <td>${driverStats.reduce((s, d) => s + d.totalSales, 0).toFixed(2)} EGP</td>
      <td>${driverStats.reduce((s, d) => s + d.totalDeliveryFee, 0).toFixed(2)} EGP</td>
      <td>${driverStats.reduce((s, d) => s + d.totalSales + d.totalDeliveryFee, 0).toFixed(2)} EGP</td>
    </tr>
  </tbody>
</table>` : ""}
<p class="section-title">تفاصيل الأوردرات (${filteredOrders.length})</p>
<table>
  <thead><tr><th>رقم الفاتورة</th><th>العميل</th><th>الطيار</th><th>المبلغ</th><th>رسوم التوصيل</th><th>الإجمالي</th><th>الدفع</th><th>الوقت</th></tr></thead>
  <tbody>${orderRows.length > 0 ? orderRows : '<tr><td colspan="8" style="text-align:center;color:#999;">لا توجد أوردرات</td></tr>'}
    ${filteredOrders.length > 0 ? `<tr class="total-row">
      <td colspan="3">الإجمالي</td>
      <td>${totalStats.sales.toFixed(2)} EGP</td>
      <td>${totalStats.deliveryFees.toFixed(2)} EGP</td>
      <td>${(totalStats.sales + totalStats.deliveryFees).toFixed(2)} EGP</td>
      <td colspan="2"></td>
    </tr>` : ""}
  </tbody>
</table>
</body></html>`;

    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) { toast.error("يرجى السماح بالنوافذ المنبثقة"); return; }
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => { printWindow.focus(); printWindow.print(); };
  };

  return (
    <div className="p-4 space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold">تسوية حسابات الطيارين</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1" onClick={handlePrint}>
            <Printer className="h-3.5 w-3.5" /> طباعة
          </Button>
          <Button size="sm" className="gap-1" onClick={() => { setEditingDriver(null); setDriverName(""); setDriverPhone(""); setDriverDialog(true); }}>
            <Plus className="h-3.5 w-3.5" /> إضافة طيار
          </Button>
        </div>
      </div>

      {/* Drivers list */}
      {drivers && drivers.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-xs text-muted-foreground shrink-0">الطيارين:</span>
          {drivers.filter((d: any) => d.active).map((d: any) => (
            <Badge
              key={d.id}
              variant="outline"
              className="text-[10px] gap-1 cursor-pointer shrink-0 group"
              onClick={() => { setEditingDriver(d); setDriverName(d.name); setDriverPhone(d.phone || ""); setDriverDialog(true); }}
            >
              <Truck className="h-3 w-3" />
              {d.name}
              {d.phone && <span className="text-muted-foreground" dir="ltr">{d.phone}</span>}
            </Badge>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
              <CalendarIcon className="h-3.5 w-3.5" />
              {format(selectedDate, "yyyy/MM/dd")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={selectedDate} onSelect={(d) => d && setSelectedDate(d)} className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>

        <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
          <SelectTrigger className="h-8 text-xs w-48">
            <SelectValue placeholder="كل الطيارين" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">كل الطيارين</SelectItem>
            <SelectItem value="unassigned" className="text-xs">غير معيّن</SelectItem>
            {drivers?.filter((d: any) => d.active).map((d: any) => (
              <SelectItem key={d.id} value={d.id} className="text-xs">{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="bg-card/50 border-border/30">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <PackageCheck className="h-4 w-4 text-emerald-500" />
              <span className="text-[10px] text-muted-foreground">عدد الأوردرات</span>
            </div>
            <p className="text-lg font-bold">{totalStats.orders}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/30">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="text-[10px] text-muted-foreground">إجمالي المبيعات</span>
            </div>
            <p className="text-lg font-bold">{totalStats.sales.toFixed(0)} <span className="text-xs text-muted-foreground">EGP</span></p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/30">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Banknote className="h-4 w-4 text-amber-500" />
              <span className="text-[10px] text-muted-foreground">إجمالي رسوم التوصيل</span>
            </div>
            <p className="text-lg font-bold">{totalStats.deliveryFees.toFixed(0)} <span className="text-xs text-muted-foreground">EGP</span></p>
          </CardContent>
        </Card>
      </div>

      {/* Per-driver summary */}
      {driverStats.length > 0 && selectedDriverId === "all" && (
        <div className="rounded-lg border border-border/30 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs text-right">الطيار</TableHead>
                <TableHead className="text-xs text-right">عدد الأوردرات</TableHead>
                <TableHead className="text-xs text-right">إجمالي المبيعات</TableHead>
                <TableHead className="text-xs text-right">رسوم التوصيل</TableHead>
                <TableHead className="text-xs text-right">المطلوب من الطيار</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {driverStats.map((ds) => (
                <TableRow key={ds.id}>
                  <TableCell className="text-xs text-right font-medium">{ds.name}</TableCell>
                  <TableCell className="text-xs text-right">{ds.orderCount}</TableCell>
                  <TableCell className="text-xs text-right">{ds.totalSales.toFixed(0)} EGP</TableCell>
                  <TableCell className="text-xs text-right">{ds.totalDeliveryFee.toFixed(0)} EGP</TableCell>
                  <TableCell className="text-xs text-right font-bold text-primary">{(ds.totalSales + ds.totalDeliveryFee).toFixed(0)} EGP</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Orders detail */}
      <div className="rounded-lg border border-border/30 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs text-right">رقم الفاتورة</TableHead>
              <TableHead className="text-xs text-right">العميل</TableHead>
              <TableHead className="text-xs text-right">الطيار</TableHead>
              <TableHead className="text-xs text-right">المبلغ</TableHead>
              <TableHead className="text-xs text-right">رسوم التوصيل</TableHead>
              <TableHead className="text-xs text-right">الإجمالي</TableHead>
              <TableHead className="text-xs text-right">الدفع</TableHead>
              <TableHead className="text-xs text-right">الوقت</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-8">
                  لا توجد أوردرات مسلّمة في هذا اليوم
                </TableCell>
              </TableRow>
            ) : (
              filteredOrders.map((order: any) => (
                <TableRow key={order.id}>
                  <TableCell className="text-xs text-right font-mono">{order.invoice_number}</TableCell>
                  <TableCell className="text-xs text-right">{order.customer_name || "—"}</TableCell>
                  <TableCell className="text-xs text-right">{(order.delivery_drivers as any)?.name || "غير معيّن"}</TableCell>
                  <TableCell className="text-xs text-right">{order.total_amount.toFixed(0)} EGP</TableCell>
                  <TableCell className="text-xs text-right">{(order.delivery_fee || 0).toFixed(0)} EGP</TableCell>
                  <TableCell className="text-xs text-right font-bold text-primary">{(order.total_amount + (order.delivery_fee || 0)).toFixed(0)} EGP</TableCell>
                  <TableCell className="text-xs text-right">{order.payment_method}</TableCell>
                  <TableCell className="text-xs text-right">{format(new Date(order.date), "HH:mm")}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Driver management dialog */}
      <Dialog open={driverDialog} onOpenChange={setDriverDialog}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-sm">{editingDriver ? "تعديل طيار" : "إضافة طيار جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="اسم الطيار *"
              value={driverName}
              onChange={e => setDriverName(e.target.value)}
              className="text-xs h-8"
            />
            <Input
              placeholder="رقم التليفون (اختياري)"
              value={driverPhone}
              onChange={e => setDriverPhone(e.target.value)}
              className="text-xs h-8"
            />
          </div>
          <DialogFooter className="flex gap-2">
            {editingDriver && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => { deleteDriver.mutate(editingDriver.id); setDriverDialog(false); }}
                disabled={deleteDriver.isPending}
              >
                <Trash2 className="h-3.5 w-3.5 ml-1" /> حذف
              </Button>
            )}
            <Button size="sm" onClick={() => saveDriver.mutate()} disabled={saveDriver.isPending || !driverName.trim()}>
              {editingDriver ? "تعديل" : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
