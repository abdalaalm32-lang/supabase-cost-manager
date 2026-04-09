import React, { useState, useMemo } from "react";
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
import { Plus, Archive, RotateCcw, Search, Pencil } from "lucide-react";
import { ExportButtons } from "@/components/ExportButtons";
import { toast } from "sonner";

type FilterStatus = "نشط" | "مؤرشف" | "الكل";

export const PosItemsPage: React.FC = () => {
  const { auth } = useAuth();
  const qc = useQueryClient();
  const companyId = auth.profile?.company_id;

  const [open, setOpen] = useState(false);
  const [branchId, setBranchId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [filter, setFilter] = useState<FilterStatus>("نشط");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterBranchId, setFilterBranchId] = useState("all");

  // Edit state
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState("");
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editBranchId, setEditBranchId] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [menuEngClass, setMenuEngClass] = useState("");
  const [editMenuEngClass, setEditMenuEngClass] = useState("");

  // Fetch branches
  const { data: branches = [] } = useQuery({
    queryKey: ["branches", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Fetch active categories filtered by selected branch (add dialog)
  const { data: categories = [] } = useQuery({
    queryKey: ["pos-categories-active", companyId, branchId],
    queryFn: async () => {
      let q = supabase.from("categories").select("*").eq("active", true).order("name");
      if (branchId) q = q.eq("branch_id", branchId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Fetch active categories filtered by selected branch (edit dialog)
  const { data: editCategories = [] } = useQuery({
    queryKey: ["pos-categories-active-edit", companyId, editBranchId],
    queryFn: async () => {
      let q = supabase.from("categories").select("*").eq("active", true).order("name");
      if (editBranchId) q = q.eq("branch_id", editBranchId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Fetch items
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["pos-items", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pos_items")
        .select("*, categories!pos_items_category_id_fkey(name), branches!pos_items_branch_id_fkey(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Add item
  const addMutation = useMutation({
    mutationFn: async () => {
      const { data: codeData, error: codeError } = await supabase.rpc("generate_item_code", { p_company_id: companyId! });
      if (codeError) throw codeError;
      const selectedCat = categories.find((c: any) => c.id === categoryId);
      const { error } = await supabase.from("pos_items").insert({
        company_id: companyId!, name, price: parseFloat(price) || 0,
        branch_id: branchId || null, category_id: categoryId || null,
        category: selectedCat?.name || null, code: codeData, active: true,
        menu_engineering_class: menuEngClass || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos-items"] });
      toast.success("تم إضافة الصنف بنجاح");
      setOpen(false); setName(""); setPrice(""); setBranchId(""); setCategoryId(""); setMenuEngClass("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Edit item
  const editMutation = useMutation({
    mutationFn: async () => {
      const selectedCat = editCategories.find((c: any) => c.id === editCategoryId);
      const { error } = await supabase.from("pos_items").update({
        name: editName, price: parseFloat(editPrice) || 0,
        branch_id: editBranchId || null, category_id: editCategoryId || null,
        category: selectedCat?.name || null,
        menu_engineering_class: editMenuEngClass || null,
      }).eq("id", editId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos-items"] });
      toast.success("تم تعديل الصنف بنجاح");
      setEditOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Toggle archive
  const archiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("pos_items").update({ active: !active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pos-items"] }); toast.success("تم تحديث الحالة"); },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (item: any) => {
    setEditId(item.id);
    setEditName(item.name);
    setEditPrice(String(item.price));
    setEditBranchId(item.branch_id || "");
    setEditCategoryId(item.category_id || "");
    setEditMenuEngClass(item.menu_engineering_class || "");
    setEditOpen(true);
  };

  const filtered = useMemo(() => {
    let result = items.filter((item: any) => {
      if (filter === "نشط") return item.active;
      if (filter === "مؤرشف") return !item.active;
      return true;
    });
    if (filterBranchId && filterBranchId !== "all") {
      result = result.filter((item: any) => item.branch_id === filterBranchId);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((item: any) =>
        (item.code || "").toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        (item.categories?.name || item.category || "").toLowerCase().includes(q) ||
        String(item.price).includes(q)
      );
    }
    return result;
  }, [items, filter, searchQuery, filterBranchId]);

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">الأصناف</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus size={18} /> إضافة صنف</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>إضافة صنف جديد</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>الفرع</Label>
                <Select value={branchId} onValueChange={(v) => { setBranchId(v); setCategoryId(""); }}>
                  <SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                  <SelectContent>{branches.map((b: any) => (<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>المجموعة</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger><SelectValue placeholder="اختر المجموعة" /></SelectTrigger>
                  <SelectContent>{categories.map((c: any) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>اسم الصنف</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: قهوة تركي" className="glass-input" />
              </div>
              <div className="space-y-2">
                <Label>السعر</Label>
                <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" className="glass-input" min="0" step="0.01" />
              </div>
              <div className="space-y-2">
                <Label>تصنيف هندسة المنيو</Label>
                <Select value={menuEngClass} onValueChange={setMenuEngClass}>
                  <SelectTrigger><SelectValue placeholder="اختر التصنيف" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kitchen">Kitchen</SelectItem>
                    <SelectItem value="bar">Bar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" disabled={!name.trim() || addMutation.isPending} onClick={() => addMutation.mutate()}>
                {addMutation.isPending ? "جاري الإضافة..." : "حفظ"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>تعديل الصنف</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>الفرع</Label>
              <Select value={editBranchId} onValueChange={(v) => { setEditBranchId(v); setEditCategoryId(""); }}>
                <SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                <SelectContent>{branches.map((b: any) => (<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>المجموعة</Label>
              <Select value={editCategoryId} onValueChange={setEditCategoryId}>
                <SelectTrigger><SelectValue placeholder="اختر المجموعة" /></SelectTrigger>
                <SelectContent>{editCategories.map((c: any) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>اسم الصنف</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="glass-input" />
            </div>
            <div className="space-y-2">
              <Label>السعر</Label>
              <Input type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} className="glass-input" min="0" step="0.01" />
            </div>
            <div className="space-y-2">
              <Label>تصنيف هندسة المنيو</Label>
              <Select value={editMenuEngClass} onValueChange={setEditMenuEngClass}>
                <SelectTrigger><SelectValue placeholder="اختر التصنيف" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="kitchen">Kitchen</SelectItem>
                  <SelectItem value="bar">Bar</SelectItem>
                </SelectContent>
              </Select>
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
          <Input placeholder="بحث بالكود أو الاسم أو المجموعة أو السعر..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="glass-input pr-9" />
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
          data={filtered.map((item: any) => ({ code: item.code || "—", name: item.name, category: item.categories?.name || item.category || "—", branch: item.branches?.name || "—", menuClass: item.menu_engineering_class || "—", price: Number(item.price).toFixed(2), status: item.active ? "نشط" : "مؤرشف" }))}
          columns={[{ key: "code", label: "الكود" }, { key: "name", label: "الصنف" }, { key: "category", label: "المجموعة" }, { key: "branch", label: "الفرع" }, { key: "menuClass", label: "تصنيف المنيو" }, { key: "price", label: "السعر" }, { key: "status", label: "الحالة" }]}
          filename="أصناف_نقطة_البيع"
          title="أصناف نقطة البيع"
        />
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">الكود</TableHead>
              <TableHead className="text-right">الصنف</TableHead>
              <TableHead className="text-right">المجموعة</TableHead>
              <TableHead className="text-right">الفرع</TableHead>
              <TableHead className="text-right">تصنيف المنيو</TableHead>
              <TableHead className="text-right">السعر</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              <TableHead className="text-right">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">جاري التحميل...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">لا توجد أصناف</TableCell></TableRow>
            ) : (
              filtered.map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-xs text-right">{item.code || "—"}</TableCell>
                  <TableCell className="font-medium text-right">{item.name}</TableCell>
                  <TableCell className="text-right">{item.categories?.name || item.category || "—"}</TableCell>
                  <TableCell className="text-right">{item.branches?.name || "—"}</TableCell>
                  <TableCell className="text-right">
                    {item.menu_engineering_class === "kitchen" ? (
                      <Badge variant="outline">Kitchen</Badge>
                    ) : item.menu_engineering_class === "bar" ? (
                      <Badge variant="outline">Bar</Badge>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-right">{Number(item.price).toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={item.active ? "default" : "secondary"} className={item.active ? "bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]" : "bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))]"}>
                      {item.active ? "نشط" : "مؤرشف"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                        <Pencil size={16} className="ml-1" /> تعديل
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => archiveMutation.mutate({ id: item.id, active: item.active })}>
                        {item.active ? (<><Archive size={16} className="ml-1" /> أرشفة</>) : (<><RotateCcw size={16} className="ml-1" /> تفعيل</>)}
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
