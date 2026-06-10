/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Truck, Plus, Edit2, Trash2, Search, Percent } from "lucide-react";

export const DeliveryCompaniesPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState("");
  const [commission, setCommission] = useState<string>("0");
  const [active, setActive] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: companies, isLoading } = useQuery({
    queryKey: ["delivery-companies", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_companies")
        .select("*")
        .eq("company_id", companyId!)
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const filtered = useMemo(() => {
    if (!companies) return [];
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c: any) => c.name.toLowerCase().includes(q));
  }, [companies, search]);

  const resetForm = () => {
    setEditing(null);
    setName("");
    setCommission("0");
    setActive(true);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (row: any) => {
    setEditing(row);
    setName(row.name);
    setCommission(String(row.commission_percent ?? 0));
    setActive(!!row.active);
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("اسم الشركة مطلوب");
      const commissionVal = Number(commission);
      if (isNaN(commissionVal) || commissionVal < 0 || commissionVal > 100) {
        throw new Error("نسبة العمولة يجب أن تكون بين 0 و 100");
      }
      const payload = {
        company_id: companyId!,
        name: trimmed,
        commission_percent: commissionVal,
        active,
      };
      if (editing) {
        const { error } = await supabase
          .from("delivery_companies")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("delivery_companies").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "تم تحديث شركة التوصيل" : "تم إضافة شركة التوصيل");
      qc.invalidateQueries({ queryKey: ["delivery-companies"] });
      setDialogOpen(false);
      resetForm();
    },
    onError: (e: any) => toast.error(e.message || "حدث خطأ"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("delivery_companies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حذف شركة التوصيل");
      qc.invalidateQueries({ queryKey: ["delivery-companies"] });
      setDeleteId(null);
    },
    onError: (e: any) => {
      toast.error(e.message || "تعذر الحذف — قد تكون مرتبطة بفواتير سابقة");
      setDeleteId(null);
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase
        .from("delivery_companies")
        .update({ active: value })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["delivery-companies"] });
    },
    onError: (e: any) => toast.error(e.message || "حدث خطأ"),
  });

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4" dir="rtl">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <div className="flex items-center gap-2">
            <Truck className="h-6 w-6 text-primary" />
            <div>
              <CardTitle>شركات التوصيل</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                إدارة شركاء التوصيل (طلبات، مرسول، إلخ) ونسب العمولة لكل شركة
              </p>
            </div>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 ml-1" />
            شركة جديدة
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="ابحث باسم الشركة..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9"
            />
          </div>

          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">اسم الشركة</TableHead>
                  <TableHead className="text-right">نسبة العمولة</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right w-32">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      جاري التحميل...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      لا توجد شركات توصيل — اضغط "شركة جديدة" لإضافة أول شركة
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((row: any) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="gap-1">
                          <Percent className="h-3 w-3" />
                          {Number(row.commission_percent ?? 0).toFixed(2)}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={!!row.active}
                            onCheckedChange={(v) =>
                              toggleActive.mutate({ id: row.id, value: v })
                            }
                          />
                          <span className="text-xs text-muted-foreground">
                            {row.active ? "نشط" : "موقوف"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEdit(row)}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteId(row.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "تعديل شركة توصيل" : "إضافة شركة توصيل"}</DialogTitle>
            <DialogDescription>
              ادخل اسم الشركة ونسبة العمولة التي يتم خصمها من كل فاتورة
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>اسم الشركة *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: طلبات، مرسول، أوبر إيتس"
              />
            </div>
            <div>
              <Label>نسبة العمولة (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                النسبة التي تستحقها شركة التوصيل من كل فاتورة
              </p>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label>الحالة</Label>
                <p className="text-xs text-muted-foreground">
                  الشركات الموقوفة لا تظهر في شاشات البيع
                </p>
              </div>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف شركة التوصيل</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف هذه الشركة؟ لن يمكن التراجع عن العملية.
              الفواتير المرتبطة بها لن تُحذف، لكن ستفقد ربطها بالشركة.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DeliveryCompaniesPage;
