import React, { useState, useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Archive, RotateCcw, Search, Pencil, Trash2 } from "lucide-react";
import { ExportButtons } from "@/components/ExportButtons";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type FilterStatus = "نشط" | "مؤرشف" | "الكل";

const CLASS_OPTIONS = [
  { value: "kitchen", label: "Kitchen" },
  { value: "bar", label: "Bar" },
  { value: "none", label: "بدون تصنيف" },
];

const classLabel = (v: string | null) => {
  if (v === "kitchen") return "Kitchen";
  if (v === "bar") return "Bar";
  if (v === "none") return "بدون تصنيف";
  return "—";
};

export const PosGroupsPage: React.FC = () => {
  const { auth } = useAuth();
  const qc = useQueryClient();
  const companyId = auth.profile?.company_id;

  const [open, setOpen] = useState(false);
  const [branchId, setBranchId] = useState("");
  const [name, setName] = useState("");
  const [menuClass, setMenuClass] = useState("");
  const [linkToOtherBranches, setLinkToOtherBranches] = useState(false);
  const [additionalBranchIds, setAdditionalBranchIds] = useState<string[]>([]);
  const [filter, setFilter] = useState<FilterStatus>("نشط");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterBranchId, setFilterBranchId] = useState("all");

  // Edit state
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState("");
  const [editName, setEditName] = useState("");
  const [editBranchId, setEditBranchId] = useState("");
  const [editMenuClass, setEditMenuClass] = useState("");
  const [editLinkToOtherBranches, setEditLinkToOtherBranches] = useState(false);
  const [editAdditionalBranchIds, setEditAdditionalBranchIds] = useState<string[]>([]);

  const { data: branches = [] } = useQuery({
    queryKey: ["branches", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["pos-categories", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*, branches!categories_branch_id_fkey(name)").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      // Collect all branch IDs to create categories for
      const allBranchIds: (string | null)[] = [branchId || null];
      if (linkToOtherBranches && additionalBranchIds.length > 0) {
        for (const bId of additionalBranchIds) {
          if (bId !== branchId) {
            allBranchIds.push(bId);
          }
        }
      }

      for (const bId of allBranchIds) {
        const { data: codeData, error: codeError } = await supabase.rpc("generate_category_code", { p_company_id: companyId! });
        if (codeError) throw codeError;
        const { error } = await supabase.from("categories").insert({
          company_id: companyId!,
          name,
          branch_id: bId,
          code: codeData,
          active: true,
          menu_engineering_class: menuClass || null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos-categories"] });
      const count = linkToOtherBranches ? 1 + additionalBranchIds.filter(b => b !== branchId).length : 1;
      toast.success(count > 1 ? `تم إضافة المجموعة في ${count} فروع بنجاح` : "تم إضافة المجموعة بنجاح");
      setOpen(false); setName(""); setBranchId(""); setMenuClass(""); setLinkToOtherBranches(false); setAdditionalBranchIds([]);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      // Update the existing category
      const { error } = await supabase.from("categories").update({
        name: editName,
        branch_id: editBranchId || null,
        menu_engineering_class: editMenuClass || null,
      }).eq("id", editId);
      if (error) throw error;

      // Create copies in additional branches if requested
      if (editLinkToOtherBranches && editAdditionalBranchIds.length > 0) {
        for (const bId of editAdditionalBranchIds) {
          if (bId !== editBranchId) {
            const { data: codeData, error: codeError } = await supabase.rpc("generate_category_code", { p_company_id: companyId! });
            if (codeError) throw codeError;
            const { error: insertError } = await supabase.from("categories").insert({
              company_id: companyId!,
              name: editName,
              branch_id: bId,
              code: codeData,
              active: true,
              menu_engineering_class: editMenuClass || null,
            });
            if (insertError) throw insertError;
          }
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos-categories"] });
      const extraCount = editLinkToOtherBranches ? editAdditionalBranchIds.filter(b => b !== editBranchId).length : 0;
      toast.success(extraCount > 0 ? `تم حفظ التعديلات وإضافة المجموعة في ${extraCount} فرع إضافي` : "تم تعديل المجموعة بنجاح");
      setEditOpen(false); setEditLinkToOtherBranches(false); setEditAdditionalBranchIds([]);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const archiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("categories").update({ active: !active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pos-categories"] }); toast.success("تم تحديث الحالة"); },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (cat: any) => {
    setEditId(cat.id);
    setEditName(cat.name);
    setEditBranchId(cat.branch_id || "");
    setEditMenuClass(cat.menu_engineering_class || "");
    setEditLinkToOtherBranches(false);
    setEditAdditionalBranchIds([]);
    setEditOpen(true);
  };

  const filtered = useMemo(() => {
    let result = categories.filter((c: any) => {
      if (filter === "نشط") return c.active;
      if (filter === "مؤرشف") return !c.active;
      return true;
    });
    if (filterBranchId && filterBranchId !== "all") {
      result = result.filter((c: any) => c.branch_id === filterBranchId);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((c: any) =>
        (c.code || "").toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q)
      );
    }
    return result;
  }, [categories, filter, searchQuery, filterBranchId]);

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">المجموعات</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus size={18} /> إضافة مجموعة</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>إضافة مجموعة جديدة</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>الفرع</Label>
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                  <SelectContent>{branches.map((b: any) => (<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              {/* Link to other branches option */}
              {branchId && branches.length > 1 && (
                <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="link-branches"
                      checked={linkToOtherBranches}
                      onCheckedChange={(checked) => {
                        setLinkToOtherBranches(!!checked);
                        if (!checked) setAdditionalBranchIds([]);
                      }}
                    />
                    <Label htmlFor="link-branches" className="cursor-pointer text-sm">هل تريد ربط المجموعة بفروع أخرى؟</Label>
                  </div>
                  {linkToOtherBranches && (
                    <div className="space-y-2 pr-6">
                      <Label className="text-xs text-muted-foreground">اختر الفروع الإضافية</Label>
                      {branches.filter((b: any) => b.id !== branchId).map((b: any) => (
                        <div key={b.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`branch-${b.id}`}
                            checked={additionalBranchIds.includes(b.id)}
                            onCheckedChange={(checked) => {
                              setAdditionalBranchIds(prev =>
                                checked ? [...prev, b.id] : prev.filter(id => id !== b.id)
                              );
                            }}
                          />
                          <Label htmlFor={`branch-${b.id}`} className="cursor-pointer text-sm">{b.name}</Label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <Label>تصنيف هندسة المنيو</Label>
                <Select value={menuClass} onValueChange={setMenuClass}>
                  <SelectTrigger><SelectValue placeholder="اختر التصنيف" /></SelectTrigger>
                  <SelectContent>
                    {CLASS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>اسم المجموعة</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: مشروبات ساخنة" className="glass-input" />
              </div>
              <Button className="w-full" disabled={!name.trim() || addMutation.isPending} onClick={() => addMutation.mutate()}>
                {addMutation.isPending ? "جاري الإضافة..." : "إضافة"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>تعديل المجموعة</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Show linked branches */}
            {(() => {
              const editingCat = categories.find((c: any) => c.id === editId);
              if (!editingCat) return null;
              const linked = categories.filter((c: any) => c.id !== editId && c.name === editingCat.name && c.branch_id !== editingCat.branch_id);
              if (linked.length === 0) return null;
              return (
                <div className="border rounded-lg p-3 bg-accent/20 space-y-2">
                  <Label className="text-sm font-medium">الفروع المرتبطة بنفس المجموعة</Label>
                  <div className="flex flex-wrap gap-2">
                    {linked.map((c: any) => (
                      <Badge key={c.id} variant="secondary">{c.branches?.name || "—"}</Badge>
                    ))}
                  </div>
                </div>
              );
            })()}
            <div className="space-y-2">
              <Label>الفرع</Label>
              <Select value={editBranchId} onValueChange={setEditBranchId}>
                <SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                <SelectContent>{branches.map((b: any) => (<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            {/* Link to other branches option */}
            {editBranchId && branches.length > 1 && (
              <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="edit-link-branches"
                    checked={editLinkToOtherBranches}
                    onCheckedChange={(checked) => {
                      setEditLinkToOtherBranches(!!checked);
                      if (!checked) setEditAdditionalBranchIds([]);
                    }}
                  />
                  <Label htmlFor="edit-link-branches" className="cursor-pointer text-sm">هل تريد ربط المجموعة بفروع أخرى؟</Label>
                </div>
                {editLinkToOtherBranches && (
                  <div className="space-y-2 pr-6">
                    <Label className="text-xs text-muted-foreground">اختر الفروع الإضافية</Label>
                    {branches.filter((b: any) => b.id !== editBranchId).map((b: any) => (
                      <div key={b.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`edit-branch-${b.id}`}
                          checked={editAdditionalBranchIds.includes(b.id)}
                          onCheckedChange={(checked) => {
                            setEditAdditionalBranchIds(prev =>
                              checked ? [...prev, b.id] : prev.filter(id => id !== b.id)
                            );
                          }}
                        />
                        <Label htmlFor={`edit-branch-${b.id}`} className="cursor-pointer text-sm">{b.name}</Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label>تصنيف هندسة المنيو</Label>
              <Select value={editMenuClass} onValueChange={setEditMenuClass}>
                <SelectTrigger><SelectValue placeholder="اختر التصنيف" /></SelectTrigger>
                <SelectContent>
                  {CLASS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>اسم المجموعة</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="glass-input" />
            </div>
            <Button className="w-full" disabled={!editName.trim() || editMutation.isPending} onClick={() => editMutation.mutate()}>
              {editMutation.isPending ? "جاري الحفظ..." : "حفظ التعديلات"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Search + Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث بالكود أو اسم المجموعة..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="glass-input pr-9" />
        </div>
        <Select value={filterBranchId} onValueChange={setFilterBranchId}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="كل الفروع" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الفروع</SelectItem>
            {branches.map((b: any) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          {(["نشط", "مؤرشف", "الكل"] as FilterStatus[]).map((s) => (
            <Button key={s} variant={filter === s ? "default" : "outline"} size="sm" onClick={() => setFilter(s)}>{s}</Button>
          ))}
        </div>
        <ExportButtons
          data={filtered.map((cat: any) => ({ code: cat.code || "—", name: cat.name, classification: classLabel(cat.menu_engineering_class), branch: cat.branches?.name || "—", status: cat.active ? "نشط" : "مؤرشف" }))}
          columns={[{ key: "code", label: "الكود" }, { key: "name", label: "المجموعة" }, { key: "classification", label: "التصنيف" }, { key: "branch", label: "الفرع" }, { key: "status", label: "الحالة" }]}
          filename="مجموعات_نقطة_البيع"
          title="مجموعات نقطة البيع"
        />
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">الكود</TableHead>
              <TableHead className="text-right">المجموعة</TableHead>
              <TableHead className="text-right">التصنيف</TableHead>
              <TableHead className="text-right">الفرع</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              <TableHead className="text-right">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">جاري التحميل...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">لا توجد مجموعات</TableCell></TableRow>
            ) : (
              filtered.map((cat: any) => (
                <TableRow key={cat.id}>
                  <TableCell className="font-mono text-xs text-right">{cat.code || "—"}</TableCell>
                  <TableCell className="font-medium text-right">{cat.name}</TableCell>
                  <TableCell className="text-right">
                    {cat.menu_engineering_class ? (
                      <Badge variant="outline" className={cat.menu_engineering_class === "kitchen" ? "border-orange-500 text-orange-600" : "border-blue-500 text-blue-600"}>
                        {classLabel(cat.menu_engineering_class)}
                      </Badge>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-right">{cat.branches?.name || "—"}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={cat.active ? "default" : "secondary"} className={cat.active ? "bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]" : "bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))]"}>
                      {cat.active ? "نشط" : "مؤرشف"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(cat)}>
                        <Pencil size={16} className="ml-1" /> تعديل
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => archiveMutation.mutate({ id: cat.id, active: cat.active })}>
                        {cat.active ? (<><Archive size={16} className="ml-1" /> أرشفة</>) : (<><RotateCcw size={16} className="ml-1" /> تفعيل</>)}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
