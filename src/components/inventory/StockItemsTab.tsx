import React, { useState, useMemo, useEffect } from "react";
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
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, Search, Warehouse, Building2 } from "lucide-react";
import { ExportButtons } from "@/components/ExportButtons";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

type FilterStatus = "نشط" | "غير نشط" | "الكل";

const STOCK_UNITS = ["كيلوجرام", "لتر", "كرتونة", "شكارة", "وحدة"];
const RECIPE_UNITS = ["جرام", "مليلتر", "قطعة"];

export const StockItemsTab: React.FC = () => {
  const { auth } = useAuth();
  const qc = useQueryClient();
  const companyId = auth.profile?.company_id;

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>("نشط");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterDepartment, setFilterDepartment] = useState("all");
  const [filterCodePrefix, setFilterCodePrefix] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [submitted, setSubmitted] = useState(false);

  // Form fields
  const [itemName, setItemName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [standardCost, setStandardCost] = useState("");
  const [stockUnit, setStockUnit] = useState("");
  const [recipeUnit, setRecipeUnit] = useState("");
  const [conversionFactor, setConversionFactor] = useState("");
  const [minLevel, setMinLevel] = useState("");
  const [reorderLevel, setReorderLevel] = useState("");
  const [maxLevel, setMaxLevel] = useState("");
  

  // Location linking
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [selectedWarehouses, setSelectedWarehouses] = useState<string[]>([]);

  const { data: categories = [] } = useQuery({
    queryKey: ["inv-categories-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_categories")
        .select("*")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

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

  const { data: branches = [] } = useQuery({
    queryKey: ["branches-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("*")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("*")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["stock-items", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_items")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: itemLocations = [] } = useQuery({
    queryKey: ["stock-item-locations", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_item_locations")
        .select("*");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!companyId,
  });

  const { data: itemDepartments = [] } = useQuery({
    queryKey: ["stock-item-departments", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_item_departments" as any)
        .select("*");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!companyId,
  });

  const { data: itemCategories = [] } = useQuery({
    queryKey: ["stock-item-categories", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_item_categories" as any)
        .select("*");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!companyId,
  });

  const resetForm = () => {
    setItemName("");
    setCategoryId("");
    setSelectedCategories([]);
    setSelectedDepartments([]);
    setStandardCost("");
    setStockUnit("");
    setRecipeUnit("");
    setConversionFactor("");
    setMinLevel("");
    setReorderLevel("");
    setMaxLevel("");
    setSelectedBranches([]);
    setSelectedWarehouses([]);
    setEditId(null);
    setSubmitted(false);
  };

  const saveLocationLinks = async (stockItemId: string) => {
    // Delete existing links
    await supabase.from("stock_item_locations").delete().eq("stock_item_id", stockItemId);

    const rows: any[] = [];
    selectedBranches.forEach((bId) => {
      rows.push({ stock_item_id: stockItemId, branch_id: bId, company_id: companyId });
    });
    selectedWarehouses.forEach((wId) => {
      rows.push({ stock_item_id: stockItemId, warehouse_id: wId, company_id: companyId });
    });

    if (rows.length > 0) {
      const { error } = await supabase.from("stock_item_locations").insert(rows);
      if (error) throw error;
    }
  };

  const saveDepartmentLinks = async (stockItemId: string) => {
    await supabase.from("stock_item_departments" as any).delete().eq("stock_item_id", stockItemId);
    if (selectedDepartments.length > 0) {
      const rows = selectedDepartments.map((dId) => ({
        stock_item_id: stockItemId,
        department_id: dId,
        company_id: companyId,
      }));
      const { error } = await supabase.from("stock_item_departments" as any).insert(rows);
      if (error) throw error;
    }
  };

  const saveCategoryLinks = async (stockItemId: string) => {
    await supabase.from("stock_item_categories" as any).delete().eq("stock_item_id", stockItemId);
    // Always include the primary categoryId, plus any extra selected categories
    const allCats = Array.from(new Set([...(categoryId ? [categoryId] : []), ...selectedCategories]));
    if (allCats.length > 0) {
      const rows = allCats.map((cId) => ({
        stock_item_id: stockItemId,
        category_id: cId,
        company_id: companyId,
      }));
      const { error } = await supabase.from("stock_item_categories" as any).insert(rows);
      if (error) throw error;
    }
  };

  const [originalCategoryId, setOriginalCategoryId] = useState<string>("");

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editId) {
        const categoryChanged = categoryId !== originalCategoryId;
        let newCode: string | undefined;

        // If category changed, regenerate code based on new category
        if (categoryChanged) {
          const selectedCat = categories.find((c: any) => c.id === categoryId);
          const identifierCode = selectedCat?.identifier_code || null;
          const { data: codeData, error: codeError } = await supabase.rpc(
            "generate_stock_item_code",
            { p_company_id: companyId!, p_identifier_code: identifierCode }
          );
          if (codeError) throw codeError;
          newCode = codeData;
        }

        const updateData: any = {
          name: itemName,
          category_id: categoryId || null,
          department_id: selectedDepartments[0] || null,
          standard_cost: parseFloat(standardCost) || 0,
          stock_unit: stockUnit || "كيلوجرام",
          recipe_unit: recipeUnit || null,
          conversion_factor: parseFloat(conversionFactor) || 1,
          min_level: parseFloat(minLevel) || 0,
          reorder_level: parseFloat(reorderLevel) || 0,
          max_level: parseFloat(maxLevel) || 0,
        };
        if (newCode) updateData.code = newCode;

        const { error } = await supabase
          .from("stock_items")
          .update(updateData)
          .eq("id", editId);
        if (error) throw error;
        await saveLocationLinks(editId);
        await saveDepartmentLinks(editId);
      } else {
        const selectedCat = categories.find((c: any) => c.id === categoryId);
        const identifierCode = selectedCat?.identifier_code || null;

        const { data: codeData, error: codeError } = await supabase.rpc(
          "generate_stock_item_code",
          { p_company_id: companyId!, p_identifier_code: identifierCode }
        );
        if (codeError) throw codeError;

        const { data: inserted, error } = await supabase.from("stock_items").insert({
          company_id: companyId!,
          name: itemName,
          category_id: categoryId || null,
          department_id: selectedDepartments[0] || null,
          standard_cost: parseFloat(standardCost) || 0,
          stock_unit: stockUnit || "كيلوجرام",
          recipe_unit: recipeUnit || null,
          conversion_factor: parseFloat(conversionFactor) || 1,
          min_level: parseFloat(minLevel) || 0,
          reorder_level: parseFloat(reorderLevel) || 0,
          max_level: parseFloat(maxLevel) || 0,
          code: codeData,
        } as any).select("id").single();
        if (error) throw error;
        await saveLocationLinks(inserted.id);
        await saveDepartmentLinks(inserted.id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-items"] });
      qc.invalidateQueries({ queryKey: ["stock-item-locations"] });
      qc.invalidateQueries({ queryKey: ["stock-item-departments"] });
      toast.success(editId ? "تم التعديل" : "تم إضافة الصنف");
      setOpen(false);
      resetForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from("stock_items")
        .update({ active: !active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-items"] });
      toast.success("تم تحديث الحالة");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("stock_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-items"] });
      qc.invalidateQueries({ queryKey: ["stock-item-locations"] });
      toast.success("تم الحذف");
      setDeleteTarget(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (item: any) => {
    setEditId(item.id);
    setItemName(item.name);
    setCategoryId(item.category_id || "");
    setOriginalCategoryId(item.category_id || "");
    const deptLinks = itemDepartments.filter((d: any) => d.stock_item_id === item.id);
    setSelectedDepartments(deptLinks.map((d: any) => d.department_id));
    setStandardCost(String(item.standard_cost || ""));
    setStockUnit(item.stock_unit || "");
    setRecipeUnit(item.recipe_unit || "");
    setConversionFactor(String(item.conversion_factor || ""));
    setMinLevel(String(item.min_level || ""));
    setReorderLevel(String(item.reorder_level || ""));
    setMaxLevel(String(item.max_level || ""));
    // Load linked locations
    const locs = itemLocations.filter((l: any) => l.stock_item_id === item.id);
    setSelectedBranches(locs.filter((l: any) => l.branch_id).map((l: any) => l.branch_id));
    setSelectedWarehouses(locs.filter((l: any) => l.warehouse_id).map((l: any) => l.warehouse_id));
    setSubmitted(false);
    setOpen(true);
  };

  const handleSave = () => {
    setSubmitted(true);
    if (!itemName.trim() || !stockUnit) return;
    saveMutation.mutate();
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id);
  };

  const getCatName = (id: string | null) => {
    if (!id) return "—";
    return categories.find((c: any) => c.id === id)?.name || "—";
  };
  const getDepNames = (itemId: string) => {
    const deptLinks = itemDepartments.filter((d: any) => d.stock_item_id === itemId);
    if (deptLinks.length === 0) return "—";
    return deptLinks.map((d: any) => {
      const dep = departments.find((dep: any) => dep.id === d.department_id);
      return dep?.name || "";
    }).filter(Boolean).join("، ") || "—";
  };

  const getLocationNames = (itemId: string) => {
    const locs = itemLocations.filter((l: any) => l.stock_item_id === itemId);
    const names: string[] = [];
    locs.forEach((l: any) => {
      if (l.branch_id) {
        const b = branches.find((br: any) => br.id === l.branch_id);
        if (b) names.push(b.name);
      }
      if (l.warehouse_id) {
        const w = warehouses.find((wr: any) => wr.id === l.warehouse_id);
        if (w) names.push(w.name);
      }
    });
    return names.length > 0 ? names.join("، ") : "—";
  };

  const codePrefixes = useMemo(() => {
    const prefixes = new Set<string>();
    items.forEach((item: any) => {
      if (item.code) {
        const match = item.code.match(/^([A-Za-z]+)_/);
        if (match) prefixes.add(match[1]);
      }
    });
    return Array.from(prefixes).sort();
  }, [items]);

  const parseCode = (code: string | null) => {
    if (!code) return { prefix: "", num: Infinity };
    const match = code.match(/^([A-Za-z]+)_(\d+)$/);
    if (match) return { prefix: match[1], num: parseInt(match[2], 10) };
    return { prefix: code, num: Infinity };
  };

  const filtered = useMemo(() => {
    let result = items.filter((item: any) => {
      if (filter === "نشط") return item.active;
      if (filter === "غير نشط") return !item.active;
      return true;
    });
    if (filterCategory !== "all") {
      result = result.filter((item: any) => item.category_id === filterCategory);
    }
    if (filterDepartment !== "all") {
      result = result.filter((item: any) => item.department_id === filterDepartment);
    }
    if (filterCodePrefix !== "all") {
      result = result.filter((item: any) => {
        if (!item.code) return false;
        return item.code.startsWith(filterCodePrefix + "_");
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (item: any) =>
          (item.code || "").toLowerCase().includes(q) ||
          item.name.toLowerCase().includes(q)
      );
    }
    result.sort((a: any, b: any) => {
      const pa = parseCode(a.code);
      const pb = parseCode(b.code);
      if (pa.prefix !== pb.prefix) return pa.prefix.localeCompare(pb.prefix);
      return pa.num - pb.num;
    });
    return result;
  }, [items, filter, searchQuery, filterCategory, filterDepartment, filterCodePrefix]);

  const toggleBranch = (id: string) => {
    setSelectedBranches((prev) => prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]);
  };
  const toggleWarehouse = (id: string) => {
    setSelectedWarehouses((prev) => prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]);
  };
  const toggleAllBranches = () => {
    if (selectedBranches.length === branches.length) setSelectedBranches([]);
    else setSelectedBranches(branches.map((b: any) => b.id));
  };
  const toggleAllWarehouses = () => {
    if (selectedWarehouses.length === warehouses.length) setSelectedWarehouses([]);
    else setSelectedWarehouses(warehouses.map((w: any) => w.id));
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">الأصناف</h2>
        <Button className="gap-2" onClick={() => { resetForm(); setOpen(true); }}>
          <Plus size={18} /> إضافة صنف
        </Button>
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث بالكود أو الاسم..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="glass-input pr-9" />
        </div>
        <Select value={filterCodePrefix} onValueChange={setFilterCodePrefix}>
          <SelectTrigger className="w-40"><SelectValue placeholder="الكود" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأكواد</SelectItem>
            {codePrefixes.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterDepartment} onValueChange={setFilterDepartment}>
          <SelectTrigger className="w-40"><SelectValue placeholder="القسم" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأقسام</SelectItem>
            {departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-40"><SelectValue placeholder="المجموعة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المجموعات</SelectItem>
            {categories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          {(["نشط", "غير نشط", "الكل"] as FilterStatus[]).map((s) => (
            <Button key={s} variant={filter === s ? "default" : "outline"} size="sm" onClick={() => setFilter(s)}>{s}</Button>
          ))}
        </div>
        <ExportButtons
          data={filtered.map((item: any) => ({ code: item.code || "—", name: item.name, category: getCatName(item.category_id), department: getDepNames(item.id), unit: item.stock_unit, cost: Number(item.standard_cost).toFixed(2), locations: getLocationNames(item.id), status: item.active ? "نشط" : "غير نشط" }))}
          columns={[{ key: "code", label: "الكود" }, { key: "name", label: "اسم الصنف" }, { key: "category", label: "المجموعة" }, { key: "department", label: "القسم" }, { key: "unit", label: "وحدة التخزين" }, { key: "cost", label: "التكلفة المعيارية" }, { key: "locations", label: "المواقع" }, { key: "status", label: "الحالة" }]}
          filename="أصناف_المخزون"
          title="أصناف المخزون"
        />
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">الكود</TableHead>
              <TableHead className="text-right">اسم الصنف</TableHead>
              <TableHead className="text-right">المجموعة</TableHead>
              <TableHead className="text-right">القسم</TableHead>
              <TableHead className="text-right">وحدة التخزين</TableHead>
              <TableHead className="text-right">التكلفة المعيارية</TableHead>
              <TableHead className="text-right">المواقع</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              <TableHead className="text-right">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">جاري التحميل...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">لا توجد أصناف</TableCell></TableRow>
            ) : (
              filtered.map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-xs">{item.code || "—"}</TableCell>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>{getCatName(item.category_id)}</TableCell>
                  <TableCell>{getDepNames(item.id)}</TableCell>
                  <TableCell>{item.stock_unit}</TableCell>
                  <TableCell>{Number(item.standard_cost).toFixed(2)}</TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate" title={getLocationNames(item.id)}>{getLocationNames(item.id)}</TableCell>
                  <TableCell>
                    <Badge variant={item.active ? "default" : "secondary"} className={item.active ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" : "bg-red-500/15 text-red-500 border-red-500/30"}>
                      {item.active ? "نشط" : "غير نشط"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(item)}><Pencil size={15} /></Button>
                      <Button variant="ghost" size="sm" onClick={() => toggleMutation.mutate({ id: item.id, active: item.active })}>{item.active ? "إيقاف" : "تفعيل"}</Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteTarget(item)}><Trash2 size={15} /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "تعديل الصنف" : "إضافة صنف جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 pt-2">
            {/* Section 1: Basic Data */}
            <div>
              <h3 className="text-sm font-bold text-primary mb-3">البيانات الأساسية</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>اسم الصنف</Label>
                  <Input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="مثال: دقيق أبيض" className="glass-input" />
                  {submitted && !itemName.trim() && <p className="text-sm text-destructive">هذا الحقل مطلوب</p>}
                </div>
                <div className="space-y-2">
                  <Label>المجموعة</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger><SelectValue placeholder="اختر المجموعة" /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>الأقسام التشغيلية</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-between gap-2">
                        <span>{selectedDepartments.length > 0 ? `${selectedDepartments.length} قسم محدد` : "اختر الأقسام"}</span>
                        <Building2 size={16} />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3" align="start">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 pb-2 border-b">
                          <Checkbox
                            checked={departments.length > 0 && selectedDepartments.length === departments.length}
                            onCheckedChange={() => {
                              if (selectedDepartments.length === departments.length) setSelectedDepartments([]);
                              else setSelectedDepartments(departments.map((d: any) => d.id));
                            }}
                          />
                          <Label className="text-sm font-medium cursor-pointer">تحديد الكل</Label>
                        </div>
                        {departments.map((d: any) => (
                          <div key={d.id} className="flex items-center gap-2">
                            <Checkbox
                              checked={selectedDepartments.includes(d.id)}
                              onCheckedChange={() => {
                                setSelectedDepartments((prev) =>
                                  prev.includes(d.id) ? prev.filter((id) => id !== d.id) : [...prev, d.id]
                                );
                              }}
                            />
                            <Label className="text-sm cursor-pointer">{d.name}</Label>
                          </div>
                        ))}
                        {departments.length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-2">لا توجد أقسام</p>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                  {selectedDepartments.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedDepartments.map((dId) => {
                        const d = departments.find((dep: any) => dep.id === dId);
                        return d ? <Badge key={dId} variant="secondary" className="text-xs">{d.name}</Badge> : null;
                      })}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>التكلفة المعيارية</Label>
                  <Input type="number" value={standardCost} onChange={(e) => setStandardCost(e.target.value)} placeholder="0.00" className="glass-input" min="0" step="0.01" />
                </div>
              </div>
            </div>

            <Separator />

            {/* Section 2: Units */}
            <div>
              <h3 className="text-sm font-bold text-primary mb-3">الوحدات ومعامل التحويل</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>وحدة التخزين</Label>
                  <Select value={stockUnit} onValueChange={setStockUnit}>
                    <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                    <SelectContent>
                      {STOCK_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {submitted && !stockUnit && <p className="text-sm text-destructive">هذا الحقل مطلوب</p>}
                </div>
                <div className="space-y-2">
                  <Label>وحدة الوصفة</Label>
                  <Select value={recipeUnit} onValueChange={setRecipeUnit}>
                    <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                    <SelectContent>
                      {RECIPE_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>معامل التحويل</Label>
                  <Input type="number" value={conversionFactor} onChange={(e) => setConversionFactor(e.target.value)} placeholder="مثال: 1000" className="glass-input" min="0" />
                  <p className="text-[10px] text-muted-foreground">مثال: 1 كيلوجرام = 1000 جرام</p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Section 3: Stock Levels */}
            <div>
              <h3 className="text-sm font-bold text-primary mb-3">مستويات المخزون</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-500"></span>
                    حد أدنى
                  </Label>
                  <Input type="number" value={minLevel} onChange={(e) => setMinLevel(e.target.value)} placeholder="0" className="glass-input" min="0" />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                    إعادة الطلب
                  </Label>
                  <Input type="number" value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} placeholder="0" className="glass-input" min="0" />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                    حد أقصى
                  </Label>
                  <Input type="number" value={maxLevel} onChange={(e) => setMaxLevel(e.target.value)} placeholder="0" className="glass-input" min="0" />
                </div>
              </div>
            </div>

            <Separator />

            {/* Section 4: Location Linking */}
            <div>
              <h3 className="text-sm font-bold text-primary mb-3">ربط الفروع والمخازن بالصنف</h3>
              <div className="flex gap-4">
                {/* Branches Popover */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="gap-2 flex-1">
                      <Building2 size={16} />
                      الفروع ({selectedBranches.length})
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-3" align="start">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 pb-2 border-b">
                        <Checkbox
                          checked={branches.length > 0 && selectedBranches.length === branches.length}
                          onCheckedChange={toggleAllBranches}
                        />
                        <Label className="text-sm font-medium cursor-pointer">تحديد الكل</Label>
                      </div>
                      {branches.map((b: any) => (
                        <div key={b.id} className="flex items-center gap-2">
                          <Checkbox
                            checked={selectedBranches.includes(b.id)}
                            onCheckedChange={() => toggleBranch(b.id)}
                          />
                          <Label className="text-sm cursor-pointer">{b.name}</Label>
                        </div>
                      ))}
                      {branches.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-2">لا توجد فروع</p>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Warehouses Popover */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="gap-2 flex-1">
                      <Warehouse size={16} />
                      المخازن ({selectedWarehouses.length})
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-3" align="start">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 pb-2 border-b">
                        <Checkbox
                          checked={warehouses.length > 0 && selectedWarehouses.length === warehouses.length}
                          onCheckedChange={toggleAllWarehouses}
                        />
                        <Label className="text-sm font-medium cursor-pointer">تحديد الكل</Label>
                      </div>
                      {warehouses.map((w: any) => (
                        <div key={w.id} className="flex items-center gap-2">
                          <Checkbox
                            checked={selectedWarehouses.includes(w.id)}
                            onCheckedChange={() => toggleWarehouse(w.id)}
                          />
                          <Label className="text-sm cursor-pointer">{w.name}</Label>
                        </div>
                      ))}
                      {warehouses.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-2">لا توجد مخازن</p>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              {(selectedBranches.length > 0 || selectedWarehouses.length > 0) && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {selectedBranches.map((bId) => {
                    const b = branches.find((br: any) => br.id === bId);
                    return b ? <Badge key={bId} variant="secondary" className="text-xs">{b.name}</Badge> : null;
                  })}
                  {selectedWarehouses.map((wId) => {
                    const w = warehouses.find((wr: any) => wr.id === wId);
                    return w ? <Badge key={wId} variant="outline" className="text-xs">{w.name}</Badge> : null;
                  })}
                </div>
              )}
            </div>

            <Button className="w-full" disabled={saveMutation.isPending} onClick={handleSave}>
              {saveMutation.isPending ? "جاري الحفظ..." : editId ? "تحديث" : "إضافة"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الصنف</AlertDialogTitle>
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
