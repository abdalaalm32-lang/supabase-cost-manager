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

type FilterStatus = "نشط" | "غير نشط" | "الكل";

export const DepartmentsTab: React.FC = () => {
  const { auth } = useAuth();
  const qc = useQueryClient();
  const companyId = auth.profile?.company_id;

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [manager, setManager] = useState("");
  const [filter, setFilter] = useState<FilterStatus>("نشط");
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [submitted, setSubmitted] = useState(false);

  const { data: departments = [], isLoading } = useQuery({
    queryKey: ["departments", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const resetForm = () => {
    setName("");
    setManager("");
    setEditId(null);
    setSubmitted(false);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editId) {
        const { error } = await supabase
          .from("departments")
          .update({ name, manager })
          .eq("id", editId);
        if (error) throw error;
      } else {
        const { data: codeData, error: codeError } = await supabase.rpc(
          "generate_department_code",
          { p_company_id: companyId! }
        );
        if (codeError) throw codeError;
        const { error } = await supabase.from("departments").insert({
          company_id: companyId!,
          name,
          manager,
          code: codeData,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departments"] });
      toast.success(editId ? "تم التعديل بنجاح" : "تم إضافة القسم بنجاح");
      setOpen(false);
      resetForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from("departments")
        .update({ active: !active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departments"] });
      toast.success("تم تحديث الحالة");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("departments")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departments"] });
      toast.success("تم حذف القسم");
      setDeleteTarget(null);
    },
    onError: (e: any) => {
      if (e.message?.includes("409") || e.code === "23503" || e.message?.includes("violates foreign key")) {
        toast.error("لا يمكن حذف هذا القسم لأنه مرتبط ببيانات أخرى. قم بحذف البيانات المرتبطة أولاً.");
      } else {
        toast.error(e.message);
      }
      setDeleteTarget(null);
    },
  });

  const openEdit = (dep: any) => {
    setEditId(dep.id);
    setName(dep.name);
    setManager(dep.manager || "");
    setSubmitted(false);
    setOpen(true);
  };

  const handleSave = () => {
    setSubmitted(true);
    if (!name.trim()) return;
    saveMutation.mutate();
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    deleteMutation.mutate(id);
  };

  const filtered = useMemo(() => {
    let result = departments.filter((d: any) => {
      if (filter === "نشط") return d.active;
      if (filter === "غير نشط") return !d.active;
      return true;
    });
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (d: any) =>
          (d.code || "").toLowerCase().includes(q) ||
          d.name.toLowerCase().includes(q) ||
          (d.manager || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [departments, filter, searchQuery]);

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">الأقسام</h2>
        <Button
          className="gap-2"
          onClick={() => {
            resetForm();
            setOpen(true);
          }}
        >
          <Plus size={18} /> إضافة قسم
        </Button>
      </div>

      {/* Search + Filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="glass-input pr-9"
          />
        </div>
        <div className="flex gap-2">
          {(["نشط", "غير نشط", "الكل"] as FilterStatus[]).map((s) => (
            <Button
              key={s}
              variant={filter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(s)}
            >
              {s}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">الكود</TableHead>
              <TableHead className="text-right">اسم القسم</TableHead>
              <TableHead className="text-right">المدير المسؤول</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              <TableHead className="text-right">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  جاري التحميل...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  لا توجد أقسام
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((dep: any) => (
                <TableRow key={dep.id}>
                  <TableCell className="font-mono text-xs">{dep.code || "—"}</TableCell>
                  <TableCell className="font-medium">{dep.name}</TableCell>
                  <TableCell>{dep.manager || "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant={dep.active ? "default" : "secondary"}
                      className={
                        dep.active
                          ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                          : "bg-red-500/15 text-red-500 border-red-500/30"
                      }
                    >
                      {dep.active ? "نشط" : "غير نشط"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(dep)}>
                        <Pencil size={15} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          toggleMutation.mutate({ id: dep.id, active: dep.active })
                        }
                      >
                        {dep.active ? "إيقاف" : "تفعيل"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => setDeleteTarget(dep)}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) resetForm();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "تعديل القسم" : "إضافة قسم جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>اسم القسم</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: قسم المطبخ"
                className="glass-input"
              />
              {submitted && !name.trim() && (
                <p className="text-sm text-destructive">هذا الحقل مطلوب</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>المدير المسؤول</Label>
              <Input
                value={manager}
                onChange={(e) => setManager(e.target.value)}
                placeholder="اسم المدير"
                className="glass-input"
              />
            </div>
            <Button
              className="w-full"
              disabled={saveMutation.isPending}
              onClick={handleSave}
            >
              {saveMutation.isPending ? "جاري الحفظ..." : editId ? "تحديث" : "إضافة"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف القسم</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف "{deleteTarget?.name}"؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
