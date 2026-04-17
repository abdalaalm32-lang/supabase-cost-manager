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
import { printViaIframe } from "@/lib/posPrintUtils";
import { ExportButtons } from "@/components/ExportButtons";
import type { ExportColumn } from "@/lib/exportUtils";

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
    const dateStr = format(selectedDate, "yyyy/MM/dd");
    const driverLabel = selectedDriverId === "all" ? "كل الطيارين"
      : selectedDriverId === "unassigned" ? "غير معيّن"
      : drivers?.find((d: any) => d.id === selectedDriverId)?.name || "";

    if (filteredOrders.length === 0) {
      toast.error("لا توجد أوردرات للطباعة");
      return;
    }

    // Group orders by driver for thermal receipt
    const groupedByDriver = new Map<string, { name: string; orders: any[] }>();
    filteredOrders.forEach((o: any) => {
      const key = o.driver_id || "unassigned";
      const name = (o.delivery_drivers as any)?.name || "غير معيّن";
      if (!groupedByDriver.has(key)) groupedByDriver.set(key, { name, orders: [] });
      groupedByDriver.get(key)!.orders.push(o);
    });

    let driverSections = "";
    let grandSales = 0;
    let grandFees = 0;

    groupedByDriver.forEach(({ name, orders }) => {
      const driverSales = orders.reduce((s, o) => s + o.total_amount, 0);
      const driverFees = orders.reduce((s, o) => s + (o.delivery_fee || 0), 0);
      grandSales += driverSales;
      grandFees += driverFees;

      const rows = orders.map((o) =>
        `<tr style="border-bottom:1px dotted #ccc">
          <td style="text-align:right;padding:3px 0;font-size:12px">${o.invoice_number || "—"}</td>
          <td style="text-align:center;padding:3px 0;font-size:12px">${o.total_amount.toFixed(2)}</td>
          <td style="text-align:left;padding:3px 0;font-size:12px">${(o.delivery_fee || 0).toFixed(2)}</td>
        </tr>`
      ).join("");

      driverSections += `
        <div style="border:1px solid #000;padding:6px;margin-top:8px">
          <div style="text-align:center;font-weight:bold;font-size:14px;border-bottom:1px dashed #000;padding-bottom:4px;margin-bottom:4px">
            🛵 ${name}
          </div>
          <div style="font-size:11px;text-align:center;margin-bottom:4px">عدد الأوردرات: ${orders.length}</div>
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="border-bottom:1px dashed #000">
                <th style="text-align:right;font-size:11px;padding:3px 0">رقم الفاتورة</th>
                <th style="text-align:center;font-size:11px;padding:3px 0">المبيعات</th>
                <th style="text-align:left;font-size:11px;padding:3px 0">التوصيل</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <div style="border-top:1px dashed #000;padding-top:4px;margin-top:4px">
            <div style="display:flex;justify-content:space-between;font-size:12px"><span>إجمالي المبيعات:</span><span>${driverSales.toFixed(2)}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:12px"><span>إجمالي التوصيل:</span><span>${driverFees.toFixed(2)}</span></div>
            <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:13px;border-top:1px dashed #000;padding-top:3px;margin-top:3px"><span>المطلوب من الطيار:</span><span>${(driverSales + driverFees).toFixed(2)} EGP</span></div>
          </div>
        </div>
      `;
    });

    const showGrandTotal = groupedByDriver.size > 1;

    const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"/><title>تسوية الطيارين</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Cairo','Tahoma',sans-serif;direction:rtl;width:72mm;margin:0 auto;padding:4px 6px;font-size:12px;color:#000;line-height:1.5;font-weight:500;}
  table{width:100%;border-collapse:collapse;}
  @media print{@page{size:80mm auto;margin:0;}body{width:72mm;}}
</style></head><body>
<div style="text-align:center;border-bottom:1px dashed #000;padding-bottom:6px;margin-bottom:6px">
  <div style="font-size:15px;font-weight:bold">🚚 تسوية الطيارين</div>
  <div style="font-size:11px;margin-top:3px">التاريخ: ${dateStr}</div>
  <div style="font-size:11px">${driverLabel}</div>
</div>
${driverSections}
${showGrandTotal ? `
<div style="border:2px solid #000;padding:6px;margin-top:8px;background:#f8f8f8">
  <div style="text-align:center;font-weight:bold;font-size:13px;margin-bottom:4px">📊 الإجمالي العام</div>
  <div style="display:flex;justify-content:space-between;font-size:12px"><span>إجمالي الأوردرات:</span><span>${filteredOrders.length}</span></div>
  <div style="display:flex;justify-content:space-between;font-size:12px"><span>إجمالي المبيعات:</span><span>${grandSales.toFixed(2)}</span></div>
  <div style="display:flex;justify-content:space-between;font-size:12px"><span>إجمالي التوصيل:</span><span>${grandFees.toFixed(2)}</span></div>
  <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px;border-top:1px dashed #000;padding-top:4px;margin-top:4px"><span>الإجمالي الكلي:</span><span>${(grandSales + grandFees).toFixed(2)} EGP</span></div>
</div>` : ""}
<div style="text-align:center;margin-top:10px;border-top:1px dashed #000;padding-top:6px;font-size:10px;color:#666">
  CostControl POS System
</div>
</body></html>`;

    printViaIframe(html);
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
