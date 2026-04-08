import React, { useState, useMemo, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowRight, Plus, Trash2, Save, DollarSign, MapPin, User, CalendarDays, FileText, Package, Archive, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useLocationStock } from "@/hooks/useLocationStock";

const WASTE_REASONS = [
  { value: "تلف عام أو انتهاء صلاحية", label: "تلف عام أو انتهاء صلاحية" },
  { value: "هالك مرحلة إنتاج", label: "هالك مرحلة إنتاج" },
  { value: "كسر أو فقد مادي", label: "كسر أو فقد مادي" },
  { value: "تجربة أو تذوق", label: "تجربة أو تذوق" },
  { value: "غير ذلك", label: "غير ذلك" },
];

export const WasteDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showAddItems, setShowAddItems] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [filterDept, setFilterDept] = useState("all");
  const [filterCat, setFilterCat] = useState("all");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [productCount, setProductCount] = useState<number>(1);

  // Local editable state per waste item
  const [localQty, setLocalQty] = useState<Record<string, string>>({});
  const [localReason, setLocalReason] = useState<Record<string, string>>({});
  const [localCustomReason, setLocalCustomReason] = useState<Record<string, string>>({});

  const { data: wasteRecord, isLoading: wrLoading } = useQuery({
    queryKey: ["waste-record", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("waste_records").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: wasteItems = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["waste-items", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("waste_items").select("*").eq("waste_record_id", id!);
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: allStockItems = [] } = useQuery({
    queryKey: ["stock-items-all", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_items").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

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

  // Fetch POS items for product selection
  const { data: posItems = [] } = useQuery({
    queryKey: ["pos-items-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("pos_items").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Fetch recipes with ingredients
  const { data: recipes = [] } = useQuery({
    queryKey: ["recipes-all", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("recipes").select("*, recipe_ingredients(*)");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Determine location type and ID
  const wasteLocationType = useMemo<"branch" | "warehouse">(() => {
    if (wasteRecord?.warehouse_id) return "warehouse";
    return "branch";
  }, [wasteRecord]);

  const wasteLocationId = useMemo(() => {
    if (!wasteRecord) return null;
    return wasteRecord.branch_id || wasteRecord.warehouse_id || null;
  }, [wasteRecord]);

  const wasteDepartmentId = wasteRecord?.department_id || null;

  const { getLocationStock } = useLocationStock(wasteLocationId, wasteLocationType, wasteDepartmentId);

  const getStockItemInfo = useCallback((siId: string | null) => {
    if (!siId) return null;
    return allStockItems.find((s: any) => s.id === siId) || null;
  }, [allStockItems]);

  const locationName = useMemo(() => {
    if (!wasteRecord) return "";
    if (wasteRecord.branch_id) {
      const b = branches.find((br: any) => br.id === wasteRecord.branch_id);
      return b?.name || wasteRecord.branch_name || "";
    }
    if (wasteRecord.warehouse_id) {
      const w = warehouses.find((wr: any) => wr.id === wasteRecord.warehouse_id);
      return w?.name || "";
    }
    return "";
  }, [wasteRecord, branches, warehouses]);

  const departmentName = useMemo(() => {
    if (!wasteRecord?.department_id) return "";
    const dep = departments.find((d: any) => d.id === wasteRecord.department_id);
    return dep?.name || "";
  }, [wasteRecord, departments]);

  const existingStockItemIds = useMemo(() => new Set(wasteItems.map((i: any) => i.stock_item_id)), [wasteItems]);

  const availableItems = useMemo(() => {
    let items = allStockItems.filter((s: any) => !existingStockItemIds.has(s.id));
    if (filterDept !== "all") items = items.filter((s: any) => s.department_id === filterDept);
    if (filterCat !== "all") items = items.filter((s: any) => s.category_id === filterCat);
    return items;
  }, [allStockItems, existingStockItemIds, filterDept, filterCat]);

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
      return {
        waste_record_id: id!,
        stock_item_id: siId,
        name: si.name,
        quantity: 0,
        cost: Number(si.avg_cost) || 0,
        unit: si.stock_unit || "كجم",
        reason: null,
      };
    });
    const { error } = await supabase.from("waste_items").insert(rows);
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
      return;
    }
    setShowAddItems(false);
    setSelectedItemIds(new Set());
    queryClient.invalidateQueries({ queryKey: ["waste-items", id] });
    toast({ title: "تم إضافة الأصناف بنجاح" });
  };

  // Add product (POS item) with its recipe ingredients
  const handleAddProduct = async () => {
    if (!selectedProductId) return;
    const recipe = recipes.find((r: any) => r.menu_item_id === selectedProductId);
    if (!recipe || !recipe.recipe_ingredients || recipe.recipe_ingredients.length === 0) {
      toast({ title: "لا يوجد ريسيبي مسجل لهذا المنتج", variant: "destructive" });
      return;
    }

    const rows = recipe.recipe_ingredients
      .filter((ing: any) => !existingStockItemIds.has(ing.stock_item_id))
      .map((ing: any) => {
        const si = allStockItems.find((s: any) => s.id === ing.stock_item_id);
        // Convert recipe qty using conversion factor, multiplied by product count
        const conversionFactor = si?.conversion_factor || 1;
        const qtyInStockUnit = (Number(ing.qty) / conversionFactor) * productCount;
        return {
          waste_record_id: id!,
          stock_item_id: ing.stock_item_id,
          name: si?.name || "—",
          quantity: qtyInStockUnit,
          cost: Number(si?.avg_cost) || 0,
          unit: si?.stock_unit || "كجم",
          reason: null,
          source_product: posItems.find((p: any) => p.id === selectedProductId)?.name || "",
        };
      });

    if (rows.length === 0) {
      toast({ title: "جميع خامات هذا المنتج مضافة بالفعل", variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("waste_items").insert(rows);
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
      return;
    }
    setShowAddProduct(false);
    setSelectedProductId("");
    setProductCount(1);
    queryClient.invalidateQueries({ queryKey: ["waste-items", id] });
    toast({ title: "تم إضافة خامات المنتج بنجاح" });
  };

  // POS items that have recipes
  const posItemsWithRecipes = useMemo(() => {
    const recipeMenuIds = new Set(recipes.map((r: any) => r.menu_item_id));
    return posItems.filter((p: any) => recipeMenuIds.has(p.id));
  }, [posItems, recipes]);

  // Selected product recipe preview
  const selectedProductRecipe = useMemo(() => {
    if (!selectedProductId) return [];
    const recipe = recipes.find((r: any) => r.menu_item_id === selectedProductId);
    if (!recipe?.recipe_ingredients) return [];
    return recipe.recipe_ingredients.map((ing: any) => {
      const si = allStockItems.find((s: any) => s.id === ing.stock_item_id);
      const conversionFactor = si?.conversion_factor || 1;
      return {
        name: si?.name || "—",
        code: si?.code || "—",
        qty: Number(ing.qty) / conversionFactor,
        unit: si?.stock_unit || "—",
        avgCost: Number(si?.avg_cost) || 0,
        alreadyAdded: existingStockItemIds.has(ing.stock_item_id),
      };
    });
  }, [selectedProductId, recipes, allStockItems, existingStockItemIds]);

  const handleDeleteItem = async (itemId: string) => {
    await supabase.from("waste_items").delete().eq("id", itemId);
    queryClient.invalidateQueries({ queryKey: ["waste-items", id] });
  };

  const getQty = (item: any) => localQty[item.id] !== undefined ? localQty[item.id] : String(item.quantity);
  const getReason = (item: any) => localReason[item.id] !== undefined ? localReason[item.id] : (item.reason || "");
  const getCustomReason = (item: any) => localCustomReason[item.id] || "";

  const isEditMode = wasteRecord?.status === "مؤرشف" && new URLSearchParams(window.location.search).get("edit") === "true";
  const isEditable = wasteRecord?.status === "مسودة" || isEditMode;

  const getCurrentStock = (stockItemId: string | null) => {
    if (!stockItemId || !wasteRecord) return null;
    // Use per-location stock
    if (wasteLocationId) {
      return getLocationStock(stockItemId);
    }
    const si = getStockItemInfo(stockItemId);
    return si ? Number(si.current_stock) : null;
  };

  const totalCost = useMemo(() => {
    return wasteItems.reduce((sum: number, item: any) => {
      const qty = Number(localQty[item.id] ?? item.quantity);
      return sum + qty * Number(item.cost);
    }, 0);
  }, [wasteItems, localQty]);

  const handleSaveAndFinish = async () => {
    // Validate stock availability
    const overStockItems: string[] = [];
    for (const item of wasteItems) {
      const qty = Number(localQty[item.id] ?? item.quantity);
      if (qty > 0 && item.stock_item_id) {
        const available = getCurrentStock(item.stock_item_id);
        if (available !== null && qty > available) {
          const si = getStockItemInfo(item.stock_item_id);
          overStockItems.push(`"${si?.name || item.name}" (المطلوب: ${qty} / المتاح: ${available.toFixed(2)})`);
        }
      }
    }
    if (overStockItems.length > 0) {
      toast({ title: "خطأ: كمية غير متوفرة", description: overStockItems.join("، "), variant: "destructive" });
      return;
    }

    for (const item of wasteItems) {
      const qty = Number(localQty[item.id] ?? item.quantity);
      let reason = localReason[item.id] ?? item.reason ?? "";
      if (reason === "غير ذلك") {
        reason = localCustomReason[item.id] || reason;
      }
      await supabase.from("waste_items").update({
        quantity: qty,
        cost: Number(item.cost),
        reason,
      }).eq("id", item.id);
    }

    if (isEditMode) {
      const changes: any[] = [];
      for (const item of wasteItems) {
        const newQty = Number(localQty[item.id] ?? item.quantity);
        const oldQty = Number(item.quantity);
        let newReason = localReason[item.id] ?? item.reason ?? "";
        if (newReason === "غير ذلك") newReason = localCustomReason[item.id] || newReason;
        const oldReason = item.reason || "";
        const si = getStockItemInfo(item.stock_item_id);

        if (newQty !== oldQty || newReason !== oldReason) {
          const change: any = {
            item_name: si?.name || item.name,
            item_code: si?.code || "—",
          };
          if (newQty !== oldQty) {
            change.old_quantity = oldQty;
            change.new_quantity = newQty;
          }
          if (newReason !== oldReason) {
            change.old_reason = oldReason;
            change.new_reason = newReason;
          }
          changes.push(change);
        }
      }

      if (changes.length > 0) {
        await supabase.from("waste_edit_history").insert({
          waste_record_id: id!,
          editor_name: auth.profile?.full_name || "",
          changes,
        });
      }

      for (const item of wasteItems) {
        const qty = Number(localQty[item.id] ?? item.quantity);
        if (item.stock_item_id && qty > 0) {
          const { data: si } = await supabase
            .from("stock_items")
            .select("current_stock")
            .eq("id", item.stock_item_id)
            .single();
          if (si) {
            const newStock = Math.max(0, Number(si.current_stock) - qty);
            await supabase.from("stock_items").update({ current_stock: newStock }).eq("id", item.stock_item_id);
          }
        }
      }

      await supabase.from("waste_records").update({
        total_cost: totalCost,
        status: "مكتمل",
        is_edited: true,
      }).eq("id", id!);

      toast({ title: "تم حفظ التعديلات بنجاح" });
    } else {
      for (const item of wasteItems) {
        const qty = Number(localQty[item.id] ?? item.quantity);
        if (item.stock_item_id && qty > 0) {
          const { data: si } = await supabase
            .from("stock_items")
            .select("current_stock")
            .eq("id", item.stock_item_id)
            .single();
          if (si) {
            const newStock = Math.max(0, Number(si.current_stock) - qty);
            await supabase.from("stock_items").update({ current_stock: newStock }).eq("id", item.stock_item_id);
          }
        }
      }

      await supabase.from("waste_records").update({
        total_cost: totalCost,
        status: "مكتمل",
      }).eq("id", id!);

      toast({ title: "تم ترحيل الهالك بنجاح" });
    }

    queryClient.invalidateQueries({ queryKey: ["waste-records"] });
    queryClient.invalidateQueries({ queryKey: ["waste-record", id] });
    navigate("/waste");
  };

  const handleArchive = async () => {
    await supabase.from("waste_records").update({ status: "مؤرشف" }).eq("id", id!);
    queryClient.invalidateQueries({ queryKey: ["waste-records"] });
    queryClient.invalidateQueries({ queryKey: ["waste-record", id] });
    toast({ title: "تم الأرشفة بنجاح" });
    navigate("/waste");
  };

  if (wrLoading) return <div className="p-8 text-center text-muted-foreground">جاري التحميل...</div>;
  if (!wasteRecord) return <div className="p-8 text-center text-muted-foreground">لم يتم العثور على السجل</div>;

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/waste")}>
          <ArrowRight size={18} />
        </Button>
        <h1 className="text-2xl font-bold">تفاصيل الهالك - {wasteRecord.record_number || "جديد"}</h1>
        {isEditMode && (
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">وضع التعديل</span>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="glass-card p-4 text-center">
          <div className="flex items-center justify-center mb-2">
            <CalendarDays size={18} className="text-primary" />
          </div>
          <p className="text-xs text-muted-foreground mb-1">التاريخ</p>
          <p className="font-semibold text-sm">{wasteRecord.date}</p>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="flex items-center justify-center mb-2">
            <MapPin size={18} className="text-primary" />
          </div>
          <p className="text-xs text-muted-foreground mb-1">الموقع</p>
          <p className="font-semibold text-sm">{locationName || "—"}</p>
        </div>
        {departmentName && (
          <div className="glass-card p-4 text-center">
            <div className="flex items-center justify-center mb-2">
              <Package size={18} className="text-primary" />
            </div>
            <p className="text-xs text-muted-foreground mb-1">القسم</p>
            <p className="font-semibold text-sm">{departmentName}</p>
          </div>
        )}
        <div className="glass-card p-4 text-center">
          <div className="flex items-center justify-center mb-2">
            <User size={18} className="text-muted-foreground" />
          </div>
          <p className="text-xs text-muted-foreground mb-1">المنشئ</p>
          <p className="font-semibold text-sm">{wasteRecord.creator_name || "—"}</p>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="flex items-center justify-center mb-2">
            <FileText size={18} className="text-muted-foreground" />
          </div>
          <p className="text-xs text-muted-foreground mb-1">الملاحظة</p>
          <p className="font-semibold text-sm truncate">{wasteRecord.notes || "—"}</p>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="flex items-center justify-center mb-2">
            <Package size={18} className="text-primary" />
          </div>
          <p className="text-xs text-muted-foreground mb-1">عدد الأصناف</p>
          <p className="font-semibold text-sm">{wasteItems.length}</p>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="flex items-center justify-center mb-2">
            <DollarSign size={18} className="text-destructive" />
          </div>
          <p className="text-xs text-muted-foreground mb-1">إجمالي القيمة</p>
          <p className="font-semibold text-sm text-destructive">{totalCost.toFixed(2)}</p>
        </div>
      </div>

      {/* Add Items Buttons */}
      {isEditable && (
        <div className="flex items-center gap-3">
          <Button onClick={() => { setShowAddItems(true); setSelectedItemIds(new Set()); setFilterDept("all"); setFilterCat("all"); }}>
            <Plus size={16} /> إضافة خامات
          </Button>
          <Button variant="outline" onClick={() => { setShowAddProduct(true); setSelectedProductId(""); }}>
            <ShoppingBag size={16} /> إضافة منتج
          </Button>
        </div>
      )}

      {/* Items Table */}
      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">الكود</TableHead>
              <TableHead className="text-right">الاسم</TableHead>
              <TableHead className="text-right">المنتج المصدر</TableHead>
              <TableHead className="text-right">وحدة التخزين</TableHead>
              <TableHead className="text-right">الرصيد الحالي</TableHead>
              <TableHead className="text-right">كمية الهالك</TableHead>
              <TableHead className="text-right">السبب التفصيلي</TableHead>
              <TableHead className="text-right">متوسط التكلفة</TableHead>
              <TableHead className="text-right">القيمة</TableHead>
              {isEditable && <TableHead className="text-right">حذف</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {itemsLoading ? (
              <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">جاري التحميل...</TableCell></TableRow>
            ) : wasteItems.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">لا توجد أصناف - أضف خامات أو منتج</TableCell></TableRow>
            ) : (
              <>
                {wasteItems.map((item: any) => {
                  const si = getStockItemInfo(item.stock_item_id);
                  const qty = Number(getQty(item));
                  const avgCost = Number(item.cost);
                  const value = qty * avgCost;
                  const currentStock = getCurrentStock(item.stock_item_id);
                  const reason = getReason(item);
                  const isCustom = reason === "غير ذلك";

                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs">{si?.code || "—"}</TableCell>
                      <TableCell className="font-medium">{si?.name || item.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{item.source_product || "—"}</TableCell>
                      <TableCell>{si?.stock_unit || item.unit || "—"}</TableCell>
                      <TableCell className={cn(currentStock !== null && qty > currentStock && "text-destructive font-bold")}>
                        {currentStock !== null ? currentStock.toFixed(2) : "—"}
                      </TableCell>
                      <TableCell>
                        {isEditable ? (
                          <>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={getQty(item)}
                              onChange={e => setLocalQty(prev => ({ ...prev, [item.id]: e.target.value }))}
                              className={cn("w-24 h-8 text-sm", currentStock !== null && qty > currentStock && "border-destructive ring-1 ring-destructive")}
                            />
                            {currentStock !== null && qty > currentStock && (
                              <p className="text-[10px] text-destructive mt-0.5">المتاح: {currentStock.toFixed(2)}</p>
                            )}
                          </>
                        ) : (
                          qty.toFixed(2)
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditable ? (
                          <div className="space-y-1">
                            <Select
                              value={WASTE_REASONS.some(r => r.value === reason) ? reason : (reason ? "غير ذلك" : "")}
                              onValueChange={v => {
                                setLocalReason(prev => ({ ...prev, [item.id]: v }));
                                if (v !== "غير ذلك") {
                                  setLocalCustomReason(prev => ({ ...prev, [item.id]: "" }));
                                }
                              }}
                            >
                              <SelectTrigger className="w-44 h-8 text-xs">
                                <SelectValue placeholder="اختر السبب..." />
                              </SelectTrigger>
                              <SelectContent>
                                {WASTE_REASONS.map(r => (
                                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {(reason === "غير ذلك" || isCustom) && (
                              <Input
                                value={getCustomReason(item)}
                                onChange={e => setLocalCustomReason(prev => ({ ...prev, [item.id]: e.target.value }))}
                                placeholder="اكتب السبب..."
                                className="w-44 h-8 text-xs"
                              />
                            )}
                          </div>
                        ) : (
                          <span className="text-sm">{reason || "—"}</span>
                        )}
                      </TableCell>
                      <TableCell>{avgCost.toFixed(2)}</TableCell>
                      <TableCell className="font-semibold">{value.toFixed(2)}</TableCell>
                      {isEditable && (
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteItem(item.id)}>
                            <Trash2 size={14} />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
                {/* Totals Row */}
                <TableRow className="bg-muted/30 font-bold">
                  <TableCell colSpan={8} className="text-left">الإجمالي</TableCell>
                  <TableCell className="text-destructive">{totalCost.toFixed(2)}</TableCell>
                  {isEditable && <TableCell />}
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Action Buttons */}
      {isEditable && (
        <div className="flex items-center gap-3">
          <Button onClick={handleSaveAndFinish} className="gap-2">
            <Save size={16} /> ترحيل وإنهاء
          </Button>
          {wasteRecord.status === "مسودة" && (
            <Button variant="outline" onClick={handleArchive} className="gap-2">
              <Archive size={16} /> جعل مؤرشف
            </Button>
          )}
        </div>
      )}

      {/* Add Items Dialog */}
      <Dialog open={showAddItems} onOpenChange={setShowAddItems}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader><DialogTitle>اختيار الخامات</DialogTitle></DialogHeader>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1">
              <Label className="text-xs">القسم</Label>
              <Select value={filterDept} onValueChange={setFilterDept}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  {departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label className="text-xs">المجموعة</Label>
              <Select value={filterCat} onValueChange={setFilterCat}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  {categories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={availableItems.length > 0 && selectedItemIds.size === availableItems.length}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead className="text-right">الكود</TableHead>
                  <TableHead className="text-right">الاسم</TableHead>
                  <TableHead className="text-right">الوحدة</TableHead>
                  <TableHead className="text-right">متوسط التكلفة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {availableItems.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-4 text-muted-foreground">لا توجد أصناف متاحة</TableCell></TableRow>
                ) : availableItems.map((si: any) => (
                  <TableRow key={si.id} className="cursor-pointer" onClick={() => toggleItem(si.id)}>
                    <TableCell><Checkbox checked={selectedItemIds.has(si.id)} /></TableCell>
                    <TableCell className="font-mono text-xs">{si.code || "—"}</TableCell>
                    <TableCell>{si.name}</TableCell>
                    <TableCell>{si.stock_unit}</TableCell>
                    <TableCell>{Number(si.avg_cost).toFixed(2)}</TableCell>
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

      {/* Add Product Dialog */}
      <Dialog open={showAddProduct} onOpenChange={setShowAddProduct}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader><DialogTitle>إضافة منتج (من الريسيبي)</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>اختر المنتج</Label>
              <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                <SelectTrigger><SelectValue placeholder="اختر منتج..." /></SelectTrigger>
                <SelectContent>
                  {posItemsWithRecipes.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} {p.code ? `(${p.code})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {posItemsWithRecipes.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">لا توجد منتجات بريسيبي مسجل</p>
              )}
            </div>

            {selectedProductId && selectedProductRecipe.length > 0 && (
              <div>
                <Label className="text-sm mb-2 block">خامات الريسيبي</Label>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">الكود</TableHead>
                        <TableHead className="text-right">الخامة</TableHead>
                        <TableHead className="text-right">الكمية</TableHead>
                        <TableHead className="text-right">الوحدة</TableHead>
                        <TableHead className="text-right">متوسط التكلفة</TableHead>
                        <TableHead className="text-right">الحالة</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedProductRecipe.map((ing: any, idx: number) => (
                        <TableRow key={idx} className={ing.alreadyAdded ? "opacity-50" : ""}>
                          <TableCell className="font-mono text-xs">{ing.code}</TableCell>
                          <TableCell>{ing.name}</TableCell>
                          <TableCell>{ing.qty.toFixed(3)}</TableCell>
                          <TableCell>{ing.unit}</TableCell>
                          <TableCell>{ing.avgCost.toFixed(2)}</TableCell>
                          <TableCell>
                            {ing.alreadyAdded ? (
                              <span className="text-xs text-muted-foreground">مضاف مسبقاً</span>
                            ) : (
                              <span className="text-xs text-green-600">سيتم إضافته</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddProduct(false)}>إلغاء</Button>
            <Button onClick={handleAddProduct} disabled={!selectedProductId}>
              إضافة خامات المنتج
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
