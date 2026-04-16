import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { format, startOfDay, endOfDay } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarIcon, Clock, Eye, Layers, Receipt, Printer, Trash2, KeyRound, Users, Check, X, Save } from "lucide-react";
import { ExportButtons } from "@/components/ExportButtons";
import { toast } from "sonner";

export const PosShiftsPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const queryClient = useQueryClient();

  const [branchId, setBranchId] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(new Date());
  const [dateTo, setDateTo] = useState<Date | undefined>(new Date());
  const [detailShift, setDetailShift] = useState<any>(null);
  const [deleteShift, setDeleteShift] = useState<any>(null);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const { data: branches } = useQuery({
    queryKey: ["branches", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").eq("company_id", companyId!).eq("active", true);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: shifts, isLoading } = useQuery({
    queryKey: ["pos-shifts-list", companyId, branchId, dateFrom?.toISOString(), dateTo?.toISOString()],
    queryFn: async () => {
      let query = supabase
        .from("pos_shifts")
        .select("*")
        .eq("company_id", companyId!)
        .order("opened_at", { ascending: false });
      if (branchId) query = query.eq("branch_id", branchId);
      if (dateFrom) query = query.gte("opened_at", startOfDay(dateFrom).toISOString());
      if (dateTo) query = query.lte("opened_at", endOfDay(dateTo).toISOString());
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  // Detail shift data
  const { data: detailSales } = useQuery({
    queryKey: ["pos-shift-detail-sales", detailShift?.id],
    queryFn: async () => {
      if (!detailShift) return [];
      let query = supabase
        .from("pos_sales")
        .select("*")
        .eq("company_id", companyId!)
        .eq("status", "مكتمل")
        .gte("date", detailShift.opened_at);
      if (detailShift.closed_at) query = query.lte("date", detailShift.closed_at);
      if (detailShift.branch_id) query = query.eq("branch_id", detailShift.branch_id);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!detailShift,
  });

  const { data: detailExpenses } = useQuery({
    queryKey: ["pos-shift-detail-expenses", detailShift?.id],
    queryFn: async () => {
      if (!detailShift) return [];
      const { data, error } = await supabase
        .from("pos_shift_expenses")
        .select("*")
        .eq("shift_id", detailShift.id)
        .order("created_at");
      if (error) throw error;
      return data || [];
    },
    enabled: !!detailShift,
  });

  const { data: detailReturns } = useQuery({
    queryKey: ["pos-shift-detail-returns", detailShift?.id],
    queryFn: async () => {
      if (!detailShift) return [];
      let query = supabase
        .from("pos_returns")
        .select("*")
        .eq("company_id", companyId!)
        .gte("date", detailShift.opened_at);
      if (detailShift.closed_at) query = query.lte("date", detailShift.closed_at);
      if (detailShift.branch_id) query = query.eq("branch_id", detailShift.branch_id);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!detailShift,
  });

  // Delete shift mutation
  const deleteShiftMutation = useMutation({
    mutationFn: async (shiftId: string) => {
      // Delete expenses first
      await supabase.from("pos_shift_expenses").delete().eq("shift_id", shiftId);
      // Delete the shift
      const { error } = await supabase.from("pos_shifts").delete().eq("id", shiftId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حذف الشيفت بنجاح");
      queryClient.invalidateQueries({ queryKey: ["pos-shifts-list"] });
      setDeleteShift(null);
    },
    onError: () => {
      toast.error("فشل في حذف الشيفت");
    },
  });

  // Save POS password
  const savePasswordMutation = useMutation({
    mutationFn: async () => {
      if (!auth.profile?.id) throw new Error("No profile");
      const { error } = await supabase
        .from("profiles")
        .update({ pos_password: newPassword })
        .eq("id", auth.profile.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حفظ باسورد الشيفت بنجاح");
      setShowPasswordDialog(false);
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: () => {
      toast.error("فشل في حفظ الباسورد");
    },
  });

  // Print shift
  const handlePrintShift = (shift: any) => {
    const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>شيفت ${shift.shift_number || ""}</title>
    <style>body{font-family:Arial,sans-serif;padding:20px;font-size:14px}h2{text-align:center;margin-bottom:20px}
    .row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dotted #ccc}
    .label{color:#666}.value{font-weight:bold}.section{margin:12px 0;padding:8px;background:#f5f5f5;border-radius:6px}
    </style></head><body>
    <h2>تقرير الشيفت ${shift.shift_number || ""}</h2>
    <div class="section">
      <div class="row"><span class="label">كود الشيفت:</span><span class="value">${shift.shift_number || "—"}</span></div>
      <div class="row"><span class="label">الحالة:</span><span class="value">${shift.status}</span></div>
      <div class="row"><span class="label">الكاشير (فتح):</span><span class="value">${shift.opened_by || "—"}</span></div>
      ${shift.closed_by ? `<div class="row"><span class="label">الكاشير (إغلاق):</span><span class="value">${shift.closed_by}</span></div>` : ""}
      <div class="row"><span class="label">وقت الفتح:</span><span class="value">${format(new Date(shift.opened_at), "yyyy/MM/dd HH:mm")}</span></div>
      <div class="row"><span class="label">وقت الإغلاق:</span><span class="value">${shift.closed_at ? format(new Date(shift.closed_at), "yyyy/MM/dd HH:mm") : "مفتوح"}</span></div>
      <div class="row"><span class="label">المبلغ الافتتاحي:</span><span class="value">${(shift.opening_cash || 0).toFixed(2)} EGP</span></div>
    </div>
    </body></html>`;
    const w = window.open("", "_blank", "width=400,height=600");
    if (w) {
      w.document.write(html);
      w.document.close();
      w.print();
    }
  };

  const totalShifts = shifts?.length || 0;
  const openShifts = shifts?.filter((s: any) => s.status === "مفتوح").length || 0;
  const closedShifts = shifts?.filter((s: any) => s.status === "مغلق").length || 0;

  // Detail calculations
  const dTotalSales = detailSales?.reduce((s: number, sale: any) => s + sale.total_amount, 0) ?? 0;
  const dTotalCash = detailSales?.filter((s: any) => s.payment_method === "كاش").reduce((s: number, sale: any) => s + sale.total_amount, 0) ?? 0;
  const dTotalVisa = detailSales?.filter((s: any) => s.payment_method === "فيزا").reduce((s: number, sale: any) => s + sale.total_amount, 0) ?? 0;
  const dInvoiceCount = detailSales?.length ?? 0;
  const dTotalExpenses = detailExpenses?.reduce((s: number, e: any) => s + (e.amount || 0), 0) ?? 0;
  const dTotalReturns = detailReturns?.reduce((s: number, r: any) => s + (r.total_amount || 0), 0) ?? 0;
  const dNetCash = (detailShift?.opening_cash ?? 0) + dTotalCash - dTotalExpenses - dTotalReturns;

  const tableData = (shifts || []).map((s: any) => ({
    "كود الشيفت": s.shift_number || "—",
    "الحالة": s.status,
    "الكاشير": s.opened_by || "—",
    "وقت الفتح": format(new Date(s.opened_at), "yyyy/MM/dd HH:mm"),
    "وقت الإغلاق": s.closed_at ? format(new Date(s.closed_at), "yyyy/MM/dd HH:mm") : "—",
    "المبلغ الافتتاحي": (s.opening_cash || 0).toFixed(2),
  }));

  return (
    <div className="space-y-6" dir="rtl">
      {/* Stats + Password Button */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
          <Card className="glass-card border-border/50">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="p-3 rounded-xl bg-primary/10"><Layers className="h-5 w-5 text-primary" /></div>
              <div><p className="text-xs text-muted-foreground">إجمالي الشيفتات</p><p className="text-xl font-black text-foreground">{totalShifts}</p></div>
            </CardContent>
          </Card>
          <Card className="glass-card border-border/50">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="p-3 rounded-xl bg-green-500/10"><Clock className="h-5 w-5 text-green-500" /></div>
              <div><p className="text-xs text-muted-foreground">مفتوح</p><p className="text-xl font-black text-green-500">{openShifts}</p></div>
            </CardContent>
          </Card>
          <Card className="glass-card border-border/50">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="p-3 rounded-xl bg-muted"><Receipt className="h-5 w-5 text-muted-foreground" /></div>
              <div><p className="text-xs text-muted-foreground">مغلق</p><p className="text-xl font-black text-foreground">{closedShifts}</p></div>
            </CardContent>
          </Card>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => setShowPasswordDialog(true)}>
          <KeyRound className="h-4 w-4" />
          باسورد الشيفت
        </Button>
      </div>

      {/* Filters */}
      <Card className="glass-card border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            {branches && branches.length > 1 && (
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger className="glass-input w-[180px]"><SelectValue placeholder="كل الفروع" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الفروع</SelectItem>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("glass-input w-[150px] justify-start text-sm", !dateFrom && "text-muted-foreground")}>
                  <CalendarIcon className="h-4 w-4 ml-1" />
                  {dateFrom ? format(dateFrom, "yyyy/MM/dd") : "من"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="pointer-events-auto" /></PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("glass-input w-[150px] justify-start text-sm", !dateTo && "text-muted-foreground")}>
                  <CalendarIcon className="h-4 w-4 ml-1" />
                  {dateTo ? format(dateTo, "yyyy/MM/dd") : "إلى"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="pointer-events-auto" /></PopoverContent>
            </Popover>
            <div className="mr-auto">
              <ExportButtons
                data={tableData}
                filename="سجل_الشيفتات"
                title="سجل الشيفتات"
                columns={[
                  { label: "كود الشيفت", key: "كود الشيفت" },
                  { label: "الحالة", key: "الحالة" },
                  { label: "الكاشير", key: "الكاشير" },
                  { label: "وقت الفتح", key: "وقت الفتح" },
                  { label: "وقت الإغلاق", key: "وقت الإغلاق" },
                  { label: "المبلغ الافتتاحي", key: "المبلغ الافتتاحي" },
                ]}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="glass-card border-border/50">
        <CardContent className="p-0">
          <ScrollArea className="h-[calc(100vh-420px)]">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50">
                  <TableHead className="text-right">كود الشيفت</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">الكاشير</TableHead>
                  <TableHead className="text-right">وقت الفتح</TableHead>
                  <TableHead className="text-right">وقت الإغلاق</TableHead>
                  <TableHead className="text-right">المبلغ الافتتاحي</TableHead>
                  <TableHead className="text-center">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">جاري التحميل...</TableCell></TableRow>
                ) : !shifts?.length ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">لا توجد شيفتات</TableCell></TableRow>
                ) : (
                  shifts.map((shift: any) => (
                    <TableRow key={shift.id} className="border-border/30 hover:bg-muted/30">
                      <TableCell className="font-mono text-xs font-bold text-primary py-3">{shift.shift_number || "—"}</TableCell>
                      <TableCell className="py-3">
                        <Badge variant={shift.status === "مفتوح" ? "default" : "secondary"} className={cn("text-[10px]", shift.status === "مفتوح" && "bg-green-500/20 text-green-500 border-green-500/30")}>
                          {shift.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm py-3">{shift.opened_by || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground py-3">{format(new Date(shift.opened_at), "yyyy/MM/dd HH:mm")}</TableCell>
                      <TableCell className="text-xs text-muted-foreground py-3">{shift.closed_at ? format(new Date(shift.closed_at), "yyyy/MM/dd HH:mm") : "—"}</TableCell>
                      <TableCell className="font-bold text-sm py-3">{(shift.opening_cash || 0).toFixed(2)} EGP</TableCell>
                      <TableCell className="text-center py-3">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setDetailShift(shift)} title="تفاصيل">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handlePrintShift(shift)} title="طباعة">
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteShift(shift)} title="حذف">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!detailShift} onOpenChange={(open) => !open && setDetailShift(null)}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              تفاصيل الشيفت {detailShift?.shift_number || ""}
            </DialogTitle>
          </DialogHeader>
          {detailShift && (
            <div className="space-y-3 text-sm">
              <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                <p><span className="text-muted-foreground">كود الشيفت:</span> <span className="font-bold text-primary">{detailShift.shift_number || "—"}</span></p>
                <p><span className="text-muted-foreground">الحالة:</span> <Badge variant={detailShift.status === "مفتوح" ? "default" : "secondary"} className="text-[10px] mr-1">{detailShift.status}</Badge></p>
                <p><span className="text-muted-foreground">وقت الفتح:</span> {format(new Date(detailShift.opened_at), "yyyy/MM/dd HH:mm")}</p>
                <p><span className="text-muted-foreground">وقت الإغلاق:</span> {detailShift.closed_at ? format(new Date(detailShift.closed_at), "yyyy/MM/dd HH:mm") : "مفتوح"}</p>
                <p><span className="text-muted-foreground">الكاشير (فتح):</span> {detailShift.opened_by || "—"}</p>
                {detailShift.closed_by && <p><span className="text-muted-foreground">الكاشير (إغلاق):</span> {detailShift.closed_by}</p>}
                <p><span className="text-muted-foreground">المبلغ الافتتاحي:</span> {(detailShift.opening_cash || 0).toFixed(2)} EGP</p>
              </div>
              <div className="p-3 rounded-lg bg-primary/5 space-y-1">
                <p><span className="text-muted-foreground">عدد الفواتير:</span> <span className="font-bold">{dInvoiceCount}</span></p>
                <p><span className="text-muted-foreground">إجمالي المبيعات:</span> <span className="font-bold text-primary">{dTotalSales.toFixed(2)} EGP</span></p>
                <p><span className="text-muted-foreground">كاش:</span> <span className="font-bold">{dTotalCash.toFixed(2)} EGP</span></p>
                <p><span className="text-muted-foreground">فيزا:</span> <span className="font-bold">{dTotalVisa.toFixed(2)} EGP</span></p>
              </div>
              {dTotalExpenses > 0 && (
                <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/10 space-y-1">
                  <p className="font-bold text-destructive text-xs">المصروفات ({detailExpenses?.length || 0})</p>
                  {detailExpenses?.map((e: any) => (
                    <p key={e.id} className="text-xs"><span className="text-muted-foreground">{e.description}:</span> <span className="font-bold">{e.amount?.toFixed(2)} EGP</span></p>
                  ))}
                  <p className="text-xs font-bold border-t border-destructive/10 pt-1 mt-1">إجمالي: {dTotalExpenses.toFixed(2)} EGP</p>
                </div>
              )}
              {dTotalReturns > 0 && (
                <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/10 space-y-1">
                  <p className="font-bold text-destructive text-xs">المرتجعات ({detailReturns?.length || 0})</p>
                  <p className="text-xs font-bold">إجمالي: {dTotalReturns.toFixed(2)} EGP</p>
                </div>
              )}
              <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 space-y-1">
                <p><span className="text-muted-foreground">صافي الشيفت:</span> <span className="font-bold text-primary text-lg">{(dTotalSales - dTotalExpenses - dTotalReturns).toFixed(2)} EGP</span></p>
                <p className="text-xs"><span className="text-muted-foreground">المتوقع في الدرج (كاش):</span> <span className="font-bold">{dNetCash.toFixed(2)} EGP</span></p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteShift} onOpenChange={(open) => !open && setDeleteShift(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف الشيفت</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف الشيفت <span className="font-bold text-primary">{deleteShift?.shift_number || ""}</span>؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteShift && deleteShiftMutation.mutate(deleteShift.id)}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* POS Password Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              تعيين باسورد الشيفت
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">الباسورد الجديد</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="أدخل الباسورد"
                className="glass-input"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">تأكيد الباسورد</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="أعد إدخال الباسورد"
                className="glass-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (!newPassword) return toast.error("أدخل الباسورد");
                if (newPassword !== confirmPassword) return toast.error("الباسورد غير متطابق");
                savePasswordMutation.mutate();
              }}
              disabled={savePasswordMutation.isPending}
            >
              حفظ الباسورد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
