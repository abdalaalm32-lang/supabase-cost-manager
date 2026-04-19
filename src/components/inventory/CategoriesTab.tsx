import React, { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Plus, Pencil, Trash2, Search, Settings2, ChevronDown } from "lucide-react";
import { ExportButtons } from "@/components/ExportButtons";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";

type FilterStatus = "نشط" | "غير نشط" | "الكل";

export const CategoriesTab: React.FC = () => {
  const { auth } = useAuth();
  const qc = useQueryClient();
  const companyId = auth.profile?.company_id;

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [storageType, setStorageType] = useState("");
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [identifierCode, setIdentifierCode] = useState("");
  const [filter, setFilter] = useState<FilterStatus>("نشط");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [submitted, setSubmitted] = useState(false);

  const [storageTypeOpen, setStorageTypeOpen] = useState(false);
  const [newStorageTypeName, setNewStorageTypeName] = useState("");

  const { data: departments = [] } = useQuery({
    queryKey: ["departments-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("*")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: categoryDepartments = [] } = useQuery({
    queryKey: ["inventory-category-departments", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_category_departments")
        .select("*");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!companyId,
  });

  const { data: storageTypes = [] } = useQuery({
    queryKey: ["storage-types", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("storage_types")
        .select("*")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["inv-categories", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_categories")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const resetForm = () => {
    setName("");
    setStorageType("");
    setSelectedDepartments([]);
    setIdentifierCode("");
    setEditId(null);
    setSubmitted(false);
  };

  const saveDepartmentLinks = async (categoryId: string) => {
    await supabase.from("inventory_category_departments").delete().eq("category_id", categoryId);
    if (selectedDepartments.length > 0) {
      const rows = selectedDepartments.map((dId) => ({
        category_id: categoryId,
        department_id: dId,
        company_id: companyId!,
      }));
      await supabase.from("inventory_category_departments").insert(rows as any);
    }
  };

  const addStorageTypeMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("storage_types").insert({
        company_id: companyId!,
        name: newStorageTypeName,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["storage-types"] });
      toast.success("تم إضافة نوع التخزين");
      setNewStorageTypeName("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editId) {
        const { error } = await supabase
          .from("inventory_categories")
          .update({
            name,
            storage_type: storageType || null,
            department_id: selectedDepartments[0] || null,
            identifier_code: identifierCode || null,
          })
          .eq("id", editId);
        if (error) throw error;
        await saveDepartmentLinks(editId);
      } else {
        const { data: codeData, error: codeError } = await supabase.rpc(
          "generate_inventory_category_code",
          { p_company_id: companyId! }
        );
        if (codeError) throw codeError;
        const { data, error } = await supabase.from("inventory_categories").insert({
          company_id: companyId!,
          name,
          storage_type: storageType || null,
          department_id: selectedDepartments[0] || null,
          code: codeData,
          identifier_code: identifierCode || null,
        }).select("id").single();
        if (error) throw error;
        await saveDepartmentLinks(data.id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inv-categories"] });
      qc.invalidateQueries({ queryKey: ["inventory-category-departments"] });
      toast.success(editId ? "تم التعديل" : "تم إضافة المجموعة");
      setOpen(false);
      resetForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from("inventory_categories")
        .update({ active: !active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inv-categories"] });
      toast.success("تم تحديث الحالة");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("inventory_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inv-categories"] });
      qc.invalidateQueries({ queryKey: ["inventory-category-departments"] });
      toast.success("تم الحذف");
      setDeleteTarget(null);
    },
    onError: (e: any) => {
      if (e.message?.includes("409") || e.code === "23503" || e.message?.includes("violates foreign key")) {
        toast.error("لا يمكن حذف هذه المجموعة لأنها مرتبطة بأصناف موجودة. قم بحذف الأصناف أولاً.");
      } else {
        toast.error(e.message);
      }
      setDeleteTarget(null);
    },
  });

  const openEdit = (cat: any) => {
    setEditId(cat.id);
    setName(cat.name);
    setStorageType(cat.storage_type || "");
    setIdentifierCode(cat.identifier_code || "");
    // Load departments from junction table
    const deptIds = categoryDepartments
      .filter((cd: any) => cd.category_id === cat.id)
      .map((cd: any) => cd.department_id);
    setSelectedDepartments(deptIds.length > 0 ? deptIds : (cat.department_id ? [cat.department_id] : []));
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
    deleteMutation.mutate(deleteTarget.id);
  };

  const getDeptNames = (cat: any) => {
    const deptIds = categoryDepartments
      .filter((cd: any) => cd.category_id === cat.id)
      .map((cd: any) => cd.department_id);
    // Fallback to legacy single department_id
    const ids = deptIds.length > 0 ? deptIds : (cat.department_id ? [cat.department_id] : []);
    const names = ids.map((id: string) => {
      const dep = departments.find((d: any) => d.id === id);
      return dep?.name || "";
    }).filter(Boolean);
    return names.length > 0 ? names.join("، ") : "—";
  };

  const toggleDept = (deptId: string) => {
    setSelectedDepartments((prev) =>
      prev.includes(deptId) ? prev.filter((id) => id !== deptId) : [...prev, deptId]
    );
  };

  const toggleAllDepts = () => {
    if (selectedDepartments.length === departments.length) {
      setSelectedDepartments([]);
    } else {
      setSelectedDepartments(departments.map((d: any) => d.id));
    }
  };

  const filtered = useMemo(() => {
    let result = categories.filter((c: any) => {
      if (filter === "نشط") return c.active;
      if (filter === "غير نشط") return !c.active;
      return true;
    });
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (c: any) =>
          (c.code || "").toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q) ||
          (c.storage_type || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [categories, filter, searchQuery]);

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">المجموعات</h2>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setStorageTypeOpen(true)}>
            <Settings2 size={16} /> أنواع التخزين
          </Button>
          <Button className="gap-2" onClick={() => { resetForm(); setOpen(true); }}>
            <Plus size={18} /> إضافة مجموعة
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="glass-input pr-9" />
        </div>
        <div className="flex gap-2">
          {(["نشط", "غير نشط", "الكل"] as FilterStatus[]).map((s) => (
            <Button key={s} variant={filter === s ? "default" : "outline"} size="sm" onClick={() => setFilter(s)}>{s}</Button>
          ))}
        </div>
        <ExportButtons
          data={filtered.map((c: any) => ({ code: c.code || "—", name: c.name, department: getDeptNames(c), storageType: c.storage_type || "—", status: c.active ? "نشط" : "غير نشط" }))}
          columns={[{ key: "code", label: "الكود" }, { key: "name", label: "اسم المجموعة" }, { key: "department", label: "الأقسام التابعة" }, { key: "storageType", label: "نوع التخزين" }, { key: "status", label: "الحالة" }]}
          filename="المجموعات"
          title="المجموعات"
        />
      </div>

      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">الكود</TableHead>
              <TableHead className="text-right">اسم المجموعة</TableHead>
              <TableHead className="text-right">كود الأصناف</TableHead>
              <TableHead className="text-right">الأقسام التابعة</TableHead>
              <TableHead className="text-right">نوع التخزين</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              <TableHead className="text-right">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">جاري التحميل...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">لا توجد مجموعات</TableCell></TableRow>
            ) : (
              filtered.map((cat: any) => (
                <TableRow key={cat.id}>
                  <TableCell className="font-mono text-xs">{cat.code || "—"}</TableCell>
                  <TableCell className="font-medium">{cat.name}</TableCell>
                  <TableCell className="font-mono text-xs">{cat.identifier_code || "—"}</TableCell>
                  <TableCell className="text-sm">{getDeptNames(cat)}</TableCell>
                  <TableCell>{cat.storage_type || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={cat.active ? "default" : "secondary"} className={cat.active ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" : "bg-red-500/15 text-red-500 border-red-500/30"}>
                      {cat.active ? "نشط" : "غير نشط"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(cat)}><Pencil size={15} /></Button>
                      <Button variant="ghost" size="sm" onClick={() => toggleMutation.mutate({ id: cat.id, active: cat.active })}>{cat.active ? "إيقاف" : "تفعيل"}</Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteTarget(cat)}><Trash2 size={15} /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add/Edit Category Dialog */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "تعديل المجموعة" : "إضافة مجموعة جديدة"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>اسم المجموعة</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: لحوم طازجة" className="glass-input" />
              {submitted && !name.trim() && <p className="text-sm text-destructive">هذا الحقل مطلوب</p>}
            </div>
            {editId && (
              <div className="space-y-2">
                <Label>كود المجموعة</Label>
                <Input value={categories.find((c: any) => c.id === editId)?.code || "—"} disabled className="glass-input font-mono text-sm bg-muted/30" />
              </div>
            )}
            <div className="space-y-2">
              <Label>نوع التخزين</Label>
              <Select value={storageType} onValueChange={setStorageType}>
                <SelectTrigger><SelectValue placeholder="اختر نوع التخزين" /></SelectTrigger>
                <SelectContent>
                  {storageTypes.map((st: any) => (
                    <SelectItem key={st.id} value={st.name}>{st.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>الأقسام التابعة</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between font-normal">
                    {selectedDepartments.length > 0
                      ? `${selectedDepartments.length} قسم محدد`
                      : "اختر الأقسام"}
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-2" align="start">
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    <div className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer" onClick={toggleAllDepts}>
                      <Checkbox checked={selectedDepartments.length === departments.length && departments.length > 0} />
                      <span className="text-sm font-medium">تحديد الكل</span>
                    </div>
                    <Separator />
                    {departments.map((d: any) => (
                      <div key={d.id} className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer" onClick={() => toggleDept(d.id)}>
                        <Checkbox checked={selectedDepartments.includes(d.id)} />
                        <span className="text-sm">{d.name}</span>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              {selectedDepartments.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedDepartments.map((dId) => {
                    const dep = departments.find((d: any) => d.id === dId);
                    return dep ? (
                      <Badge key={dId} variant="secondary" className="text-xs">
                        {dep.name}
                      </Badge>
                    ) : null;
                  })}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>الكود التعريفي</Label>
              <Input value={identifierCode} onChange={(e) => setIdentifierCode(e.target.value.toUpperCase())} placeholder="مثال: SA" className="glass-input font-mono" />
              {submitted && !identifierCode.trim() && <p className="text-sm text-destructive">هذا الحقل مطلوب</p>}
              <p className="text-xs text-muted-foreground">سيتم استخدامه ككود أولي للأصناف التابعة (مثال: SA_1, SA_2)</p>
            </div>
            <Button className="w-full" disabled={saveMutation.isPending} onClick={handleSave}>
              {saveMutation.isPending ? "جاري الحفظ..." : editId ? "تحديث" : "إضافة"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Storage Types Management Dialog */}
      <Dialog open={storageTypeOpen} onOpenChange={setStorageTypeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إدارة أنواع التخزين</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="flex gap-2">
              <Input value={newStorageTypeName} onChange={(e) => setNewStorageTypeName(e.target.value)} placeholder="اسم نوع التخزين الجديد" className="glass-input flex-1" />
              <Button disabled={!newStorageTypeName.trim() || addStorageTypeMutation.isPending} onClick={() => addStorageTypeMutation.mutate()}>إضافة</Button>
            </div>
            <Separator />
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {storageTypes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">لا توجد أنواع تخزين بعد</p>
              ) : (
                storageTypes.map((st: any) => (
                  <div key={st.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <span className="text-sm font-medium">{st.name}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المجموعة</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف "{deleteTarget?.name}"؟</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(e) => { e.preventDefault(); handleDelete(); }}>
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
