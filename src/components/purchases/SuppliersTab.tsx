import React, { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

export const SuppliersTab: React.FC = () => {
  const { auth } = useAuth();
  const qc = useQueryClient();
  const companyId = auth.profile?.company_id;

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [taxId, setTaxId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [submitted, setSubmitted] = useState(false);

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ["suppliers", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const resetForm = () => {
    setName(""); setPhone(""); setTaxId("");
    setEditId(null); setSubmitted(false);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editId) {
        const { error } = await supabase
          .from("suppliers")
          .update({ name, phone: phone || null, tax_id: taxId || null })
          .eq("id", editId);
        if (error) throw error;
      } else {
        const { data: codeData, error: codeError } = await supabase.rpc(
          "generate_supplier_code", { p_company_id: companyId! }
        );
        if (codeError) throw codeError;
        const { error } = await supabase.from("suppliers").insert({
          company_id: companyId!, name, phone: phone || null,
          tax_id: taxId || null, code: codeData,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success(editId ? "تم التعديل" : "تم إضافة المورد");
      setOpen(false); resetForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("suppliers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("تم الحذف"); setDeleteTarget(null);
    },
    onError: (e: any) => {
      if (e.message?.includes("409") || e.code === "23503") {
        toast.error("لا يمكن حذف هذا المورد لأنه مرتبط بفواتير.");
      } else { toast.error(e.message); }
      setDeleteTarget(null);
    },
  });

  const openEdit = (s: any) => {
    setEditId(s.id); setName(s.name);
    setPhone(s.phone || ""); setTaxId(s.tax_id || "");
    setSubmitted(false); setOpen(true);
  };

  const handleSave = () => {
    setSubmitted(true);
    if (!name.trim()) return;
    saveMutation.mutate();
  };

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return suppliers;
    const q = searchQuery.trim().toLowerCase();
    return suppliers.filter((s: any) =>
      (s.code || "").toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      (s.phone || "").includes(q) ||
      (s.tax_id || "").includes(q)
    );
  }, [suppliers, searchQuery]);

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">الموردين</h2>
        <Button className="gap-2" onClick={() => { resetForm(); setOpen(true); }}>
          <Plus size={18} /> إضافة مورد
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="بحث بالاسم أو الكود أو الهاتف أو الرقم الضريبي..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="glass-input pr-9" />
      </div>

      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">الكود</TableHead>
              <TableHead className="text-right">الاسم</TableHead>
              <TableHead className="text-right">الهاتف</TableHead>
              <TableHead className="text-right">الرقم الضريبي</TableHead>
              <TableHead className="text-right">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">جاري التحميل...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">لا يوجد موردين</TableCell></TableRow>
            ) : (
              filtered.map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.code || "—"}</TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.phone || "—"}</TableCell>
                  <TableCell>{s.tax_id || "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil size={15} /></Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteTarget(s)}><Trash2 size={15} /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editId ? "تعديل المورد" : "إضافة مورد جديد"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>اسم المورد</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم المورد" className="glass-input" />
              {submitted && !name.trim() && <p className="text-sm text-destructive">هذا الحقل مطلوب</p>}
            </div>
            <div className="space-y-2">
              <Label>رقم الهاتف</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="رقم الهاتف" className="glass-input" />
            </div>
            <div className="space-y-2">
              <Label>الرقم الضريبي</Label>
              <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="الرقم الضريبي" className="glass-input" />
            </div>
            <Button className="w-full" disabled={saveMutation.isPending} onClick={handleSave}>
              {saveMutation.isPending ? "جاري الحفظ..." : editId ? "تحديث" : "إضافة"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المورد</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف "{deleteTarget?.name}"؟</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(e) => { e.preventDefault(); if (deleteTarget) deleteMutation.mutate(deleteTarget.id); }}>
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
