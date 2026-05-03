import React, { useState, useMemo, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowRight, Plus, Trash2, Save, ClipboardCheck, Package, TrendingUp, TrendingDown, DollarSign, MapPin, User, CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useLocationStock } from "@/hooks/useLocationStock";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";

export const StocktakeDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showAddItems, setShowAddItems] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [filterDept, setFilterDept] = useState("all");
  const [filterCat, setFilterCat] = useState("all");
  const [notes, setNotes] = useState("");
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [localQty, setLocalQty] = useState<Record<string, string>>({});
  const [pickerSearch, setPickerSearch] = useState("");
  const [itemsSearch, setItemsSearch] = useState("");
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);

  // Editable header fields (used in edit mode for archived stocktakes)
  const [editDate, setEditDate] = useState<Date | undefined>(undefined);
  const [editType, setEditType] = useState<string>("");
  const [editLocationType, setEditLocationType] = useState<"branch" | "warehouse">("branch");
  const [editLocationId, setEditLocationId] = useState<string>("");
  const [editDepartmentId, setEditDepartmentId] = useState<string>("");
  const [headerLoaded, setHeaderLoaded] = useState(false);

  const { data: stocktake, isLoading: stLoading } = useQuery({
    queryKey: ["stocktake", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("stocktakes").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  React.useEffect(() => {
    if (stocktake && !notesLoaded) {
      setNotes(stocktake.notes || "");
      setNotesLoaded(true);
    }
  }, [stocktake, notesLoaded]);

  React.useEffect(() => {
    if (stocktake && !headerLoaded) {
      setEditDate(stocktake.date ? new Date(stocktake.date) : new Date());
      setEditType(stocktake.type || "");
      if (stocktake.warehouse_id) {
        setEditLocationType("warehouse");
        setEditLocationId(stocktake.warehouse_id);
      } else {
        setEditLocationType("branch");
        setEditLocationId(stocktake.branch_id || "");
      }
      setEditDepartmentId((stocktake as any).department_id || "");
      setHeaderLoaded(true);
    }
  }, [stocktake, headerLoaded]);


  const { data: stocktakeItems = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["stocktake-items", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("stocktake_items").select("*").eq("stocktake_id", id!);
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: allStockItems = [] } = useQuery({
    queryKey: ["stock-items-all", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_items").select("*").eq("active", true).order("code");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Sync avg_cost from stock_items when reopening a draft stocktake
  const [costSynced, setCostSynced] = React.useState(false);
  React.useEffect(() => {
    if (costSynced || !stocktake || stocktake.status !== "مسودة") return;
    if (stocktakeItems.length === 0 || allStockItems.length === 0) return;
    
    const doUpdates = async () => {
      for (const item of stocktakeItems) {
        if (!item.stock_item_id) continue;
        const si = allStockItems.find((s: any) => s.id === item.stock_item_id);
        if (!si) continue;
        const latestCost = Number(si.avg_cost) || 0;
        if (latestCost !== Number(item.avg_cost)) {
          await supabase.from("stocktake_items").update({ avg_cost: latestCost }).eq("id", item.id);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["stocktake-items", id] });
    };
    doUpdates();
    setCostSynced(true);
  }, [stocktake, stocktakeItems, allStockItems, costSynced, id, queryClient]);

  const { data: departments = [] } = useQuery({
    queryKey: ["departments-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["inv-categories-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_categories").select("*").eq("active", true);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Many-to-many: stock_item -> categories
  const { data: itemCategoryLinks = [] } = useQuery({
    queryKey: ["stock-item-categories-stocktake", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_item_categories")
        .select("stock_item_id, category_id")
        .eq("company_id", companyId!);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  // Many-to-many: category -> departments
  const { data: categoryDepartmentLinks = [] } = useQuery({
    queryKey: ["inv-category-departments-stocktake", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_category_departments")
        .select("category_id, department_id")
        .eq("company_id", companyId!);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  // Map: stock_item_id -> Set of all category ids (primary + additional)
  const itemAllCategories = useMemo(() => {
    const map = new Map<string, Set<string>>();
    (allStockItems || []).forEach((si: any) => {
      const set = new Set<string>();
      if (si.category_id) set.add(si.category_id);
      map.set(si.id, set);
    });
    (itemCategoryLinks || []).forEach((l: any) => {
      if (!map.has(l.stock_item_id)) map.set(l.stock_item_id, new Set());
      map.get(l.stock_item_id)!.add(l.category_id);
    });
    return map;
  }, [allStockItems, itemCategoryLinks]);

  // Map: category_id -> Set of all department ids (primary + additional)
  const categoryAllDepartments = useMemo(() => {
    const map = new Map<string, Set<string>>();
    (categories || []).forEach((c: any) => {
      const set = new Set<string>();
      if (c.department_id) set.add(c.department_id);
      map.set(c.id, set);
    });
    (categoryDepartmentLinks || []).forEach((l: any) => {
      if (!map.has(l.category_id)) map.set(l.category_id, new Set());
      map.get(l.category_id)!.add(l.department_id);
    });
    return map;
  }, [categories, categoryDepartmentLinks]);

  // Map: stock_item_id -> Set of all department ids (from primary + all linked categories)
  const itemAllDepartments = useMemo(() => {
    const map = new Map<string, Set<string>>();
    (allStockItems || []).forEach((si: any) => {
      const set = new Set<string>();
      if (si.department_id) set.add(si.department_id);
      const catIds = itemAllCategories.get(si.id);
      if (catIds) {
        for (const catId of catIds) {
          const deptIds = categoryAllDepartments.get(catId);
          if (deptIds) deptIds.forEach((d) => set.add(d));
        }
      }
      map.set(si.id, set);
    });
    return map;
  }, [allStockItems, itemAllCategories, categoryAllDepartments]);

  const { data: branches = [] } = useQuery({
    queryKey: ["branches-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").eq("active", true);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("*").eq("active", true);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Determine location type and ID for per-location stock
  const stocktakeLocationType = useMemo<"branch" | "warehouse">(() => {
    if (stocktake?.warehouse_id) return "warehouse";
    return "branch";
  }, [stocktake]);

  const stocktakeLocationId = useMemo(() => {
    if (!stocktake) return null;
    return stocktake.branch_id || stocktake.warehouse_id || null;
  }, [stocktake]);

  const stocktakeDeptId = useMemo(() => {
    return (stocktake as any)?.department_id || null;
  }, [stocktake]);

  const { getLocationStock } = useLocationStock(stocktakeLocationId, stocktakeLocationType, stocktakeDeptId);

  const getStockItemInfo = useCallback((siId: string | null) => {
    if (!siId) return null;
    return allStockItems.find((s: any) => s.id === siId) || null;
  }, [allStockItems]);

  const locationName = useMemo(() => {
    if (!stocktake) return "";
    if (stocktake.branch_id) {
      const b = branches.find((br: any) => br.id === stocktake.branch_id);
      return b?.name || "";
    }
    if (stocktake.warehouse_id) {
      const w = warehouses.find((wr: any) => wr.id === stocktake.warehouse_id);
      return w?.name || "";
    }
    return "";
  }, [stocktake, branches, warehouses]);

  const existingStockItemIds = useMemo(() => new Set(stocktakeItems.map((i: any) => i.stock_item_id)), [stocktakeItems]);

  const availableItems = useMemo(() => {
    let items = allStockItems.filter((s: any) => !existingStockItemIds.has(s.id));
    if (filterDept !== "all") {
      items = items.filter((s: any) => {
        const allDepts = itemAllDepartments.get(s.id);
        return !!allDepts && allDepts.has(filterDept);
      });
    }
    if (filterCat !== "all") {
      items = items.filter((s: any) => {
        const allCats = itemAllCategories.get(s.id);
        return !!allCats && allCats.has(filterCat);
      });
    }
    if (pickerSearch.trim()) {
      const q = pickerSearch.trim().toLowerCase();
      items = items.filter((s: any) => {
        const catName = categories.find((c: any) => c.id === s.category_id)?.name || "";
        return (s.name || "").toLowerCase().includes(q) || (s.code || "").toLowerCase().includes(q) || catName.toLowerCase().includes(q);
      });
    }
    return items.sort((a: any, b: any) => (a.code || "").localeCompare(b.code || ""));
  }, [allStockItems, existingStockItemIds, filterDept, filterCat, pickerSearch, categories, itemAllCategories, itemAllDepartments]);

  // Categories filtered by selected department (both primary and many-to-many links)
  const filteredCategories = useMemo(() => {
    if (filterDept === "all") return categories;
    return (categories || []).filter((c: any) => {
      const deptIds = categoryAllDepartments.get(c.id);
      return !!deptIds && deptIds.has(filterDept);
    });
  }, [categories, filterDept, categoryAllDepartments]);

  const toggleItem = (itemId: string) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedItemIds.size === availableItems.length) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(availableItems.map((i: any) => i.id)));
    }
  };

  const handleAddItems = async () => {
    if (selectedItemIds.size === 0) return;
    const rows = Array.from(selectedItemIds).map(siId => {
      const si = allStockItems.find((s: any) => s.id === siId)!;
      // Use per-location stock as book_qty instead of global current_stock
      const locationBookQty = stocktakeLocationId ? getLocationStock(siId) : Number(si.current_stock) || 0;
      return {
        stocktake_id: id!,
        stock_item_id: siId,
        counted_qty: 0,
        book_qty: locationBookQty,
        avg_cost: Number(si.avg_cost) || 0,
      };
    });
    const { error } = await supabase.from("stocktake_items").insert(rows);
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
      return;
    }
    setShowAddItems(false);
    setSelectedItemIds(new Set());
    queryClient.invalidateQueries({ queryKey: ["stocktake-items", id] });
    toast({ title: "تم إضافة الأصناف بنجاح" });
  };

  const handleDeleteItem = async (itemId: string) => {
    await supabase.from("stocktake_items").delete().eq("id", itemId);
    queryClient.invalidateQueries({ queryKey: ["stocktake-items", id] });
  };

  const handleDeleteAllItems = async () => {
    const { error } = await supabase.from("stocktake_items").delete().eq("stocktake_id", id!);
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
      return;
    }
    setShowDeleteAllConfirm(false);
    setLocalQty({});
    queryClient.invalidateQueries({ queryKey: ["stocktake-items", id] });
    toast({ title: "تم حذف جميع الأصناف بنجاح" });
  };

  const handleQtyChange = (itemId: string, value: string) => {
    setLocalQty(prev => ({ ...prev, [itemId]: value }));
  };

  const getCountedQty = (item: any) => {
    if (localQty[item.id] !== undefined) return localQty[item.id];
    return String(item.counted_qty);
  };

  // Check if this is an edit of an archived stocktake
  const isEditMode = stocktake?.status === "مؤرشف" && new URLSearchParams(window.location.search).get("edit") === "true";

  // Save as draft - persist counted quantities without changing status
  const handleSaveAsDraft = async () => {
    for (const item of stocktakeItems) {
      const qty = Number(localQty[item.id] ?? item.counted_qty);
      if (qty !== Number(item.counted_qty)) {
        await supabase.from("stocktake_items").update({ counted_qty: qty }).eq("id", item.id);
      }
    }

    const totalActual = stocktakeItems.reduce((sum: number, item: any) => {
      const qty = Number(localQty[item.id] ?? item.counted_qty);
      return sum + qty * Number(item.avg_cost);
    }, 0);

    await supabase.from("stocktakes").update({
      notes,
      total_actual_value: totalActual,
    }).eq("id", id!);

    queryClient.invalidateQueries({ queryKey: ["stocktake", id] });
    queryClient.invalidateQueries({ queryKey: ["stocktake-items", id] });
    setLocalQty({});
    toast({ title: "تم حفظ المسودة بنجاح" });
  };

  const handleSave = async () => {
    // Save items
    for (const item of stocktakeItems) {
      const qty = Number(localQty[item.id] ?? item.counted_qty);
      if (qty !== Number(item.counted_qty)) {
        await supabase.from("stocktake_items").update({ counted_qty: qty }).eq("id", item.id);
      }
    }

    const totalActual = stocktakeItems.reduce((sum: number, item: any) => {
      const qty = Number(localQty[item.id] ?? item.counted_qty);
      return sum + qty * Number(item.avg_cost);
    }, 0);

    if (isEditMode) {
      // Build changes list for edit history
      const changes: any[] = [];
      for (const item of stocktakeItems) {
        const newQty = Number(localQty[item.id] ?? item.counted_qty);
        const oldQty = Number(item.counted_qty);
        if (newQty !== oldQty) {
          const si = getStockItemInfo(item.stock_item_id);
          changes.push({
            stock_item_name: si?.name || "—",
            stock_item_code: si?.code || "—",
            old_counted_qty: oldQty,
            new_counted_qty: newQty,
            book_qty: Number(item.book_qty),
            avg_cost: Number(item.avg_cost),
          });
        }
      }

      if (notes !== (stocktake?.notes || "")) {
        changes.push({
          field: "notes",
          old_value: stocktake?.notes || "",
          new_value: notes,
        });
      }

      // Track header field changes
      const newDateStr = editDate ? format(editDate, "yyyy-MM-dd") : stocktake?.date;
      if (newDateStr !== stocktake?.date) {
        changes.push({ field: "date", old_value: stocktake?.date, new_value: newDateStr });
      }
      if (editType !== stocktake?.type) {
        changes.push({ field: "type", old_value: stocktake?.type, new_value: editType });
      }
      const newBranchId = editLocationType === "branch" ? (editLocationId || null) : null;
      const newWarehouseId = editLocationType === "warehouse" ? (editLocationId || null) : null;
      if (newBranchId !== (stocktake?.branch_id || null) || newWarehouseId !== (stocktake?.warehouse_id || null)) {
        changes.push({ field: "location", old_value: locationName, new_value: "تم التعديل" });
      }
      const newDeptId = editDepartmentId || null;
      if (newDeptId !== ((stocktake as any)?.department_id || null)) {
        changes.push({ field: "department", old_value: (stocktake as any)?.department_id || "—", new_value: newDeptId || "—" });
      }

      // Save edit history
      if (changes.length > 0) {
        await supabase.from("stocktake_edit_history").insert({
          stocktake_id: id!,
          editor_name: auth.profile?.full_name || "",
          changes,
        });
      }

      // Mark as edited and save as مكتمل (with header updates)
      const { error } = await supabase.from("stocktakes").update({
        notes,
        total_actual_value: totalActual,
        status: "مكتمل",
        is_edited: true,
        date: newDateStr,
        type: editType,
        branch_id: newBranchId,
        warehouse_id: newWarehouseId,
        department_id: newDeptId,
      }).eq("id", id!);

      if (error) {
        toast({ title: "خطأ", description: error.message, variant: "destructive" });
        return;
      }

      // Update current_stock in stock_items based on counted quantities
      for (const item of stocktakeItems) {
        const countedQty = Number(localQty[item.id] ?? item.counted_qty);
        if (item.stock_item_id) {
          await supabase.from("stock_items").update({
            current_stock: countedQty,
          }).eq("id", item.stock_item_id);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["stocktake", id] });
      queryClient.invalidateQueries({ queryKey: ["stocktake-items", id] });
      queryClient.invalidateQueries({ queryKey: ["stocktakes"] });
      toast({ title: "تم حفظ التعديلات بنجاح" });
      navigate("/stocktake");
    } else {
      // Normal save as مكتمل
      const { error } = await supabase.from("stocktakes").update({
        notes,
        total_actual_value: totalActual,
        status: "مكتمل",
      }).eq("id", id!);

      if (error) {
        toast({ title: "خطأ", description: error.message, variant: "destructive" });
        return;
      }

      // Update current_stock in stock_items based on counted quantities
      for (const item of stocktakeItems) {
        const countedQty = Number(localQty[item.id] ?? item.counted_qty);
        if (item.stock_item_id) {
          await supabase.from("stock_items").update({
            current_stock: countedQty,
          }).eq("id", item.stock_item_id);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["stocktake", id] });
      queryClient.invalidateQueries({ queryKey: ["stocktake-items", id] });
      queryClient.invalidateQueries({ queryKey: ["stocktakes"] });
      toast({ title: "تم حفظ الجرد كمكتمل" });
      navigate("/stocktake");
    }
  };

  // Computed totals - only sum values, not quantities
  const totals = useMemo(() => {
    let totalBookValue = 0;
    let totalCountedValue = 0;
    let totalDiffValue = 0;

    stocktakeItems.forEach((item: any) => {
      const countedQty = Number(localQty[item.id] ?? item.counted_qty);
      const bookQty = Number(item.book_qty);
      const avgCost = Number(item.avg_cost);
      const value = countedQty * avgCost;
      const bookValue = bookQty * avgCost;
      const diff = countedQty - bookQty;

      totalBookValue += bookValue;
      totalCountedValue += value;
      totalDiffValue += diff * avgCost;
    });

    return { totalBookValue, totalCountedValue, totalValue: totalCountedValue, totalDiffValue };
  }, [stocktakeItems, localQty]);

  const isEditable = stocktake?.status === "مسودة" || isEditMode;
  const isArchived = stocktake?.status === "مؤرشف" && !isEditMode;

  if (stLoading) return <div className="p-8 text-center text-muted-foreground">جاري التحميل...</div>;
  if (!stocktake) return <div className="p-8 text-center text-muted-foreground">لم يتم العثور على الجرد</div>;

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/stocktake")}>
          <ArrowRight size={18} />
        </Button>
        <h1 className="text-2xl font-bold">تفاصيل الجرد - {stocktake.record_number}</h1>
        {isEditMode && (
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">وضع التعديل</span>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <div className="glass-card p-4 text-center">
          <div className="flex items-center justify-center mb-2">
            <ClipboardCheck size={18} className="text-primary" />
          </div>
          <p className="text-xs text-muted-foreground mb-1">نوع الجرد</p>
          <p className="font-semibold text-sm">{stocktake.type}</p>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="flex items-center justify-center mb-2">
            <DollarSign size={18} className="text-primary" />
          </div>
          <p className="text-xs text-muted-foreground mb-1">إجمالي القيمة الفعلية</p>
          <p className="font-semibold text-sm">{totals.totalValue.toFixed(2)}</p>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="flex items-center justify-center mb-2">
            <Package size={18} className="text-primary" />
          </div>
          <p className="text-xs text-muted-foreground mb-1">عدد الأصناف</p>
          <p className="font-semibold text-sm">{stocktakeItems.length}</p>
        </div>
        {stocktakeLocationType === "warehouse" && (
          <div className="glass-card p-4 text-center">
            <div className="flex items-center justify-center mb-2">
              {totals.totalDiffValue >= 0 ? <TrendingUp size={18} className="text-green-600" /> : <TrendingDown size={18} className="text-red-600" />}
            </div>
            <p className="text-xs text-muted-foreground mb-1">إجمالي قيمة الفارق</p>
            <p className={cn("font-semibold text-sm", totals.totalDiffValue >= 0 ? "text-green-600" : "text-red-600")}>
              {totals.totalDiffValue >= 0 ? `+${totals.totalDiffValue.toFixed(2)}` : totals.totalDiffValue.toFixed(2)}
            </p>
          </div>
        )}
        <div className="glass-card p-4 text-center">
          <div className="flex items-center justify-center mb-2">
            <MapPin size={18} className="text-muted-foreground" />
          </div>
          <p className="text-xs text-muted-foreground mb-1">الموقع</p>
          <p className="font-semibold text-sm">{locationName || "—"}</p>
        </div>
      </div>

      {/* Editable header (visible only when editing an archived stocktake) */}
      {isEditMode && (
        <div className="glass-card p-4 space-y-3">
          <p className="font-semibold text-sm mb-2">تعديل بيانات الجرد</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <Label className="text-xs">التاريخ</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-right font-normal", !editDate && "text-muted-foreground")}>
                    <CalendarIcon className="ml-2 h-4 w-4" />
                    {editDate ? format(editDate, "yyyy-MM-dd") : "اختر التاريخ"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={editDate} onSelect={(d) => d && setEditDate(d)} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-xs">نوع الجرد</Label>
              <Select value={editType} onValueChange={setEditType}>
                <SelectTrigger><SelectValue placeholder="اختر النوع" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="جرد أول المدة">جرد أول المدة</SelectItem>
                  <SelectItem value="جرد آخر المدة">جرد آخر المدة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">نوع الموقع</Label>
              <Select value={editLocationType} onValueChange={(v: "branch" | "warehouse") => { setEditLocationType(v); setEditLocationId(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="branch">فرع</SelectItem>
                  <SelectItem value="warehouse">مخزن</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{editLocationType === "branch" ? "الفرع" : "المخزن"}</Label>
              <Select value={editLocationId} onValueChange={setEditLocationId}>
                <SelectTrigger><SelectValue placeholder="اختر..." /></SelectTrigger>
                <SelectContent>
                  {(editLocationType === "branch" ? branches : warehouses).map((loc: any) => (
                    <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">القسم (اختياري)</Label>
              <Select value={editDepartmentId || "none"} onValueChange={(v) => setEditDepartmentId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="كل الأقسام" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">كل الأقسام</SelectItem>
                  {departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      {isEditable && (
        <div className="max-w-lg">
          <Label>ملاحظات (اختياري)</Label>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="أضف ملاحظة..." rows={2} />
        </div>
      )}
      {!isEditable && stocktake.notes && (
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground mb-1">ملاحظات</p>
          <p className="text-sm">{stocktake.notes}</p>
        </div>
      )}

      {/* Add Items + Tools */}
      {isEditable && (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => { setShowAddItems(true); setSelectedItemIds(new Set()); setFilterDept("all"); setFilterCat("all"); setPickerSearch(""); }}>
            <Plus size={16} /> إضافة أصناف للجرد
          </Button>
          {stocktakeItems.length > 0 && (
            <Button variant="destructive" onClick={() => setShowDeleteAllConfirm(true)}>
              <Trash2 size={16} /> حذف كل الأصناف ({stocktakeItems.length})
            </Button>
          )}
          {stocktakeItems.length > 0 && (
            <Input
              placeholder="بحث في الأصناف المضافة بالكود أو الاسم..."
              value={itemsSearch}
              onChange={e => setItemsSearch(e.target.value)}
              className="flex-1 min-w-[240px] max-w-md"
            />
          )}
        </div>
      )}

      {/* Items Table */}
      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">كود الصنف</TableHead>
              <TableHead className="text-right">اسم الصنف</TableHead>
              <TableHead className="text-right">وحدة التخزين</TableHead>
              <TableHead className="text-right">الرصيد الدفتري</TableHead>
              <TableHead className="text-right">الرصيد الفعلي</TableHead>
              <TableHead className="text-right">متوسط التكلفة</TableHead>
              <TableHead className="text-right">القيمة</TableHead>
              <TableHead className="text-right">الفارق</TableHead>
              <TableHead className="text-right">قيمة الفارق</TableHead>
              {isEditable && <TableHead className="text-right">حذف</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {itemsLoading ? (
              <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">جاري التحميل...</TableCell></TableRow>
            ) : stocktakeItems.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">لا توجد أصناف - أضف أصناف للجرد</TableCell></TableRow>
            ) : (
              <>
                {[...stocktakeItems].sort((a: any, b: any) => {
                  const codeA = getStockItemInfo(a.stock_item_id)?.code || "";
                  const codeB = getStockItemInfo(b.stock_item_id)?.code || "";
                  return codeA.localeCompare(codeB);
                }).filter((item: any) => {
                  if (!itemsSearch.trim()) return true;
                  const si = getStockItemInfo(item.stock_item_id);
                  const q = itemsSearch.trim().toLowerCase();
                  return (si?.name || "").toLowerCase().includes(q) || (si?.code || "").toLowerCase().includes(q);
                }).map((item: any) => {
                  const si = getStockItemInfo(item.stock_item_id);
                  const countedQty = Number(getCountedQty(item));
                  const bookQty = Number(item.book_qty);
                  const avgCost = Number(item.avg_cost);
                  const value = countedQty * avgCost;
                  const diff = countedQty - bookQty;
                  const diffValue = diff * avgCost;

                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs">{si?.code || "—"}</TableCell>
                      <TableCell className="font-medium">{si?.name || "—"}</TableCell>
                      <TableCell>{si?.stock_unit || "—"}</TableCell>
                      <TableCell>{bookQty.toFixed(2)}</TableCell>
                      <TableCell>
                        {isEditable ? (
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={getCountedQty(item)}
                            onChange={e => handleQtyChange(item.id, e.target.value)}
                            className="w-24 h-8 text-sm"
                          />
                        ) : (
                          <span>{countedQty.toFixed(2)}</span>
                        )}
                      </TableCell>
                      <TableCell>{avgCost.toFixed(2)}</TableCell>
                      <TableCell className="font-semibold">{value.toFixed(2)}</TableCell>
                      <TableCell className={cn("font-semibold", diff > 0 ? "text-green-600" : diff < 0 ? "text-red-600" : "")}>
                        {diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2)}
                      </TableCell>
                      <TableCell className={cn("font-semibold", diffValue > 0 ? "text-green-600" : diffValue < 0 ? "text-red-600" : "")}>
                        {diffValue > 0 ? `+${diffValue.toFixed(2)}` : diffValue.toFixed(2)}
                      </TableCell>
                      {isEditable && (
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteItem(item.id)}>
                            <Trash2 size={14} />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
                {/* Totals Row - values only, no quantities */}
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell colSpan={3} className="text-right">الإجمالي</TableCell>
                  <TableCell>—</TableCell>
                  <TableCell>—</TableCell>
                  <TableCell>—</TableCell>
                  <TableCell>{totals.totalValue.toFixed(2)}</TableCell>
                  <TableCell>—</TableCell>
                  <TableCell className={cn(totals.totalDiffValue >= 0 ? "text-green-600" : "text-red-600")}>
                    {totals.totalDiffValue >= 0 ? `+${totals.totalDiffValue.toFixed(2)}` : totals.totalDiffValue.toFixed(2)}
                  </TableCell>
                  {isEditable && <TableCell />}
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Action buttons */}
      {isEditable && (
        <div className="flex gap-3">
          {stocktake?.status === "مسودة" && (
            <Button variant="outline" onClick={handleSaveAsDraft}>
              <Save size={16} /> حفظ كمسودة
            </Button>
          )}
          <Button onClick={handleSave}>
            <Save size={16} /> {isEditMode ? "حفظ التعديلات" : "حفظ الجرد"}
          </Button>
        </div>
      )}

      {/* Add Items Dialog */}
      <Dialog open={showAddItems} onOpenChange={setShowAddItems}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader><DialogTitle>إضافة أصناف للجرد</DialogTitle></DialogHeader>

          <div className="flex gap-3 flex-wrap">
            <Select value={filterDept} onValueChange={(v) => { setFilterDept(v); setFilterCat("all"); }}>
              <SelectTrigger className="w-44"><SelectValue placeholder="القسم" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأقسام</SelectItem>
                {departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterCat} onValueChange={setFilterCat}>
              <SelectTrigger className="w-44"><SelectValue placeholder="المجموعة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المجموعات</SelectItem>
                {filteredCategories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Input
            placeholder="بحث بالكود أو اسم الصنف أو المجموعة..."
            value={pickerSearch}
            onChange={e => setPickerSearch(e.target.value)}
            className="w-full"
          />

          <div className="flex items-center gap-2 py-2">
            <Checkbox
              checked={availableItems.length > 0 && selectedItemIds.size === availableItems.length}
              onCheckedChange={toggleAll}
            />
            <Label className="text-sm cursor-pointer" onClick={toggleAll}>تحديد الكل ({selectedItemIds.size}/{availableItems.length})</Label>
          </div>

          <div className="overflow-auto flex-1 border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead className="text-right">الكود</TableHead>
                  <TableHead className="text-right">اسم الصنف</TableHead>
                  <TableHead className="text-right">الوحدة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {availableItems.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-4 text-muted-foreground">لا توجد أصناف متاحة</TableCell></TableRow>
                ) : availableItems.map((si: any) => (
                  <TableRow key={si.id} className="cursor-pointer" onClick={() => toggleItem(si.id)}>
                    <TableCell><Checkbox checked={selectedItemIds.has(si.id)} /></TableCell>
                    <TableCell className="font-mono text-xs">{si.code || "—"}</TableCell>
                    <TableCell>{si.name}</TableCell>
                    <TableCell>{si.stock_unit}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddItems(false)}>إلغاء</Button>
            <Button onClick={handleAddItems} disabled={selectedItemIds.size === 0}>
              إضافة ({selectedItemIds.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete All Items Confirmation */}
      <AlertDialog open={showDeleteAllConfirm} onOpenChange={setShowDeleteAllConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف جميع الأصناف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف جميع الأصناف ({stocktakeItems.length}) من هذا الجرد؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAllItems} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              حذف الكل
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
