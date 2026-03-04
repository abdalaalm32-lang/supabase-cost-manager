import React, { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useLocationStock } from "@/hooks/useLocationStock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import {
  Plus, Save, Trash2, Search, Layers, ArrowRight,
  DollarSign, Package, Calculator, MapPin, Calendar, User,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface LocalIngredient {
  id?: string;
  stock_item_id: string;
  name: string;
  code: string;
  unit: string;
  required_qty: number;
  unit_cost: number;
}

export const ProductionDetailPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isEditMode = searchParams.get("edit") === "true";
  const isNew = !id || id === "add";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form state
  const [locationType, setLocationType] = useState<"branch" | "warehouse">("branch");
  const [locationId, setLocationId] = useState("");
  const [selectedDept, setSelectedDept] = useState("all");
  const [selectedCat, setSelectedCat] = useState("all");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [producedQty, setProducedQty] = useState<string>("0");
  const [selectedUnit, setSelectedUnit] = useState("كجم");
  const [ingredients, setIngredients] = useState<LocalIngredient[]>([]);
  const [status, setStatus] = useState("مسودة");
  const [recordNumber, setRecordNumber] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [productionNotes, setProductionNotes] = useState("");

  // Modal
  const [showAddMaterials, setShowAddMaterials] = useState(false);
  const [matSearch, setMatSearch] = useState("");
  const [matFilterDept, setMatFilterDept] = useState("all");
  const [matFilterCat, setMatFilterCat] = useState("all");
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  // Original data for edit tracking
  const [originalIngredients, setOriginalIngredients] = useState<LocalIngredient[]>([]);
  const [originalQty, setOriginalQty] = useState<number>(0);

  // Queries
  const { data: branches = [] } = useQuery({
    queryKey: ["branches-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("*").eq("active", true).order("name");
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

  const { data: allStockItems = [] } = useQuery({
    queryKey: ["stock-items-all", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_items").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { getLocationStock } = useLocationStock(locationId || null, locationType);

  // Load existing record
  const { data: existingRecord } = useQuery({
    queryKey: ["production-record", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_records")
        .select("*, production_ingredients(*)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id && !isNew,
  });

  useEffect(() => {
    if (existingRecord) {
      setRecordNumber(existingRecord.record_number || "");
      setDate(existingRecord.date);
      setStatus(existingRecord.status);
      setSelectedProductId(existingRecord.product_id || "");
      setProducedQty(String(existingRecord.produced_qty));
      setOriginalQty(Number(existingRecord.produced_qty));
      setSelectedUnit(existingRecord.unit || "كجم");
      setProductionNotes((existingRecord as any).notes || "");

      if (existingRecord.branch_id) {
        setLocationType("branch");
        setLocationId(existingRecord.branch_id);
      } else if ((existingRecord as any).warehouse_id) {
        setLocationType("warehouse");
        setLocationId((existingRecord as any).warehouse_id);
      }

      const ings: LocalIngredient[] = (existingRecord.production_ingredients || []).map((pi: any) => {
        const si = allStockItems.find((s: any) => s.id === pi.stock_item_id);
        return {
          id: pi.id,
          stock_item_id: pi.stock_item_id || "",
          name: pi.name || si?.name || "—",
          code: si?.code || "—",
          unit: pi.unit || si?.stock_unit || "كجم",
          required_qty: Number(pi.required_qty),
          unit_cost: Number(pi.unit_cost) || Number(si?.avg_cost) || 0,
        };
      });
      setIngredients(ings);
      setOriginalIngredients(JSON.parse(JSON.stringify(ings)));
    }
  }, [existingRecord, allStockItems]);

  // Filtered stock items for product selection
  const filteredCategories = useMemo(() => {
    if (selectedDept === "all") return categories;
    return categories.filter((c: any) => c.department_id === selectedDept);
  }, [categories, selectedDept]);

  const filteredProducts = useMemo(() => {
    let items = allStockItems;
    if (selectedDept !== "all") items = items.filter((s: any) => s.department_id === selectedDept);
    if (selectedCat !== "all") items = items.filter((s: any) => s.category_id === selectedCat);
    return items;
  }, [allStockItems, selectedDept, selectedCat]);

  // Materials modal
  const existingStockIds = useMemo(() => new Set(ingredients.map(i => i.stock_item_id)), [ingredients]);

  const availableMaterials = useMemo(() => {
    let items = allStockItems.filter((s: any) => !existingStockIds.has(s.id));
    if (matFilterDept !== "all") items = items.filter((s: any) => s.department_id === matFilterDept);
    if (matFilterCat !== "all") items = items.filter((s: any) => s.category_id === matFilterCat);
    if (matSearch.trim()) {
      const q = matSearch.trim().toLowerCase();
      items = items.filter((s: any) => s.name.toLowerCase().includes(q) || (s.code || "").toLowerCase().includes(q));
    }
    return items;
  }, [allStockItems, existingStockIds, matFilterDept, matFilterCat, matSearch]);

  const toggleItem = (id: string) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAddMaterials = () => {
    const newIngs: LocalIngredient[] = Array.from(selectedItemIds).map(siId => {
      const si = allStockItems.find((s: any) => s.id === siId)!;
      return {
        stock_item_id: siId,
        name: si.name,
        code: si.code || "—",
        unit: si.stock_unit || "كجم",
        required_qty: 0,
        unit_cost: Number(si.avg_cost) || 0,
      };
    });
    setIngredients(prev => [...prev, ...newIngs]);
    setShowAddMaterials(false);
    setSelectedItemIds(new Set());
    setMatSearch("");
  };

  const updateQty = (idx: number, val: string) => {
    setIngredients(prev => prev.map((ing, i) => i === idx ? { ...ing, required_qty: val === "" || val === "0" || val === "0." ? (val === "" ? 0 : Number(val) || 0) : Number(val) || 0 } : ing));
  };

  const removeIngredient = (idx: number) => {
    setIngredients(prev => prev.filter((_, i) => i !== idx));
  };

  // Auto-load production recipe when selecting a product (only for new records)
  const handleProductChange = async (productId: string) => {
    setSelectedProductId(productId);
    if (!isNew || ingredients.length > 0) return; // Don't overwrite existing ingredients
    try {
      const { data: recipe } = await supabase
        .from("production_recipes")
        .select("*, production_recipe_ingredients(*)")
        .eq("stock_item_id", productId)
        .maybeSingle();
      if (recipe && recipe.production_recipe_ingredients?.length > 0) {
        const ings: LocalIngredient[] = recipe.production_recipe_ingredients.map((ri: any) => {
          const si = allStockItems.find((s: any) => s.id === ri.stock_item_id);
          const conversionFactor = Number(si?.conversion_factor) || 1;
          // Convert recipe qty (e.g. grams) to stock unit (e.g. kg) for production
          const qtyInStockUnit = Number(ri.qty) / conversionFactor;
          return {
            stock_item_id: ri.stock_item_id,
            name: si?.name || "—",
            code: si?.code || "—",
            unit: si?.stock_unit || "كجم",
            required_qty: qtyInStockUnit,
            unit_cost: Number(si?.avg_cost) || 0,
          };
        });
        setIngredients(ings);
        toast({ title: "تم تحميل مكونات التركيبة تلقائياً" });
      }
    } catch {
      // silently fail - user can still add manually
    }
  };

  // Cost calculations
  const totalComponentsCost = useMemo(() => {
    return ingredients.reduce((sum, ing) => sum + ing.required_qty * ing.unit_cost, 0);
  }, [ingredients]);

  const producedQtyNum = Number(producedQty) || 0;
  const unitCost = producedQtyNum > 0 ? totalComponentsCost / producedQtyNum : 0;

  const isLocked = !isNew && status !== "مؤرشف" && !isEditMode;

  // Save
  const handleSaveAsArchived = async () => {
    await doSave("مؤرشف");
  };

  const handleSave = async () => {
    await doSave("مكتمل");
  };

  const doSave = async (saveStatus: string) => {
    if (!companyId || !selectedProductId) {
      toast({ title: "خطأ", description: "اختر المنتج أولاً", variant: "destructive" });
      return;
    }
    if (producedQtyNum <= 0) {
      toast({ title: "خطأ", description: "أدخل كمية الإنتاج", variant: "destructive" });
      return;
    }

    // Validate ingredient stock availability at the selected location
    if (locationId && ingredients.length > 0) {
      const overStockItems: string[] = [];
      for (const ing of ingredients) {
        if (ing.stock_item_id && ing.required_qty > 0) {
          const available = getLocationStock(ing.stock_item_id);
          if (ing.required_qty > available) {
            overStockItems.push(`"${ing.name}" (المطلوب: ${ing.required_qty} / المتاح: ${available.toFixed(2)})`);
          }
        }
      }
      if (overStockItems.length > 0) {
        toast({ title: "خطأ: كمية الخامات غير متوفرة", description: overStockItems.join("، "), variant: "destructive" });
        return;
      }
    }

    const selectedProduct = allStockItems.find((s: any) => s.id === selectedProductId);
    const locationName = locationType === "branch"
      ? branches.find((b: any) => b.id === locationId)?.name
      : warehouses.find((w: any) => w.id === locationId)?.name;

    try {
      if (isNew) {
        // Generate record number
        const { data: numData } = await supabase.rpc("generate_production_record_number", { p_company_id: companyId });

        const insertData: any = {
          company_id: companyId,
          record_number: numData,
          date,
          product_id: selectedProductId,
          product_name: selectedProduct?.name || "",
           produced_qty: producedQtyNum,
          unit: selectedUnit,
          total_production_cost: totalComponentsCost,
          unit_cost: unitCost,
          status: saveStatus,
          branch_name: locationName || null,
          creator_name: auth.profile?.full_name || "",
          notes: productionNotes || null,
        };

        if (locationType === "branch") {
          insertData.branch_id = locationId || null;
        } else {
          insertData.warehouse_id = locationId || null;
        }

        const { data: newRecord, error } = await supabase
          .from("production_records")
          .insert(insertData)
          .select()
          .single();
        if (error) throw error;

        if (ingredients.length > 0) {
          const rows = ingredients.map(ing => ({
            production_record_id: newRecord.id,
            stock_item_id: ing.stock_item_id,
            name: ing.name,
            unit: ing.unit,
            required_qty: ing.required_qty,
            unit_cost: ing.unit_cost,
            total_cost: ing.required_qty * ing.unit_cost,
          }));
          const { error: ingError } = await supabase.from("production_ingredients").insert(rows);
          if (ingError) throw ingError;
        }

        // Only update stock when status is "مكتمل"
        if (saveStatus === "مكتمل") {
          // Deduct raw material quantities from current_stock
          for (const ing of ingredients) {
            if (ing.stock_item_id && ing.required_qty > 0) {
              const { data: si } = await supabase
                .from("stock_items")
                .select("current_stock")
                .eq("id", ing.stock_item_id)
                .single();
              if (si) {
                const newStock = Math.max(0, Number(si.current_stock) - ing.required_qty);
                await supabase.from("stock_items").update({ current_stock: newStock }).eq("id", ing.stock_item_id);
              }
            }
          }

          // Update produced item: increase current_stock and update avg_cost
          if (selectedProductId) {
            const { data: prodItem } = await supabase
              .from("stock_items")
              .select("current_stock, avg_cost")
              .eq("id", selectedProductId)
              .single();
            if (prodItem) {
              const oldStock = Number(prodItem.current_stock) || 0;
              const oldAvg = Number(prodItem.avg_cost) || 0;
              const totalStock = oldStock + producedQtyNum;
              const newAvg = totalStock > 0
                ? ((oldStock * oldAvg) + (producedQtyNum * unitCost)) / totalStock
                : unitCost;
              await supabase.from("stock_items").update({
                current_stock: totalStock,
                avg_cost: newAvg,
              }).eq("id", selectedProductId);
            }
          }
        }

        toast({ title: "تم حفظ عملية الإنتاج بنجاح" });
      } else {
        // Edit existing - track changes
        const changes: any[] = [];
        if (producedQtyNum !== originalQty) {
          changes.push({ field: "كمية الإنتاج", old_value: originalQty, new_value: producedQtyNum });
        }
        changes.push({ field: "إجمالي التكلفة", old_value: Number(existingRecord?.total_production_cost).toFixed(2), new_value: totalComponentsCost.toFixed(2) });

        // Update record
        const updateData: any = {
          produced_qty: producedQtyNum,
          unit: selectedUnit,
          total_production_cost: totalComponentsCost,
          unit_cost: unitCost,
          is_edited: true,
          notes: productionNotes || null,
        };

        const { error } = await supabase.from("production_records").update(updateData).eq("id", id!);
        if (error) throw error;

        // Replace ingredients
        await supabase.from("production_ingredients").delete().eq("production_record_id", id!);
        if (ingredients.length > 0) {
          const rows = ingredients.map(ing => ({
            production_record_id: id!,
            stock_item_id: ing.stock_item_id,
            name: ing.name,
            unit: ing.unit,
            required_qty: ing.required_qty,
            unit_cost: ing.unit_cost,
            total_cost: ing.required_qty * ing.unit_cost,
          }));
          await supabase.from("production_ingredients").insert(rows);
        }

        // Log edit history
        if (changes.length > 0) {
          await supabase.from("production_edit_history").insert({
            production_record_id: id!,
            editor_name: auth.profile?.full_name || "",
            changes,
          });
        }

        // Note: Stock updates are not applied for archived edits
        // Stock is only affected when saving as "مكتمل"

        toast({ title: "تم تحديث عملية الإنتاج" });
      }

      queryClient.invalidateQueries({ queryKey: ["production-records"] });
      queryClient.invalidateQueries({ queryKey: ["stock-items-all"] });
      navigate("/production");
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Layers size={28} className="text-primary" />
          <h1 className="text-2xl font-bold">{isNew ? "إضافة عملية إنتاج" : `عملية إنتاج ${recordNumber}`}</h1>
          {!isNew && (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
              status === "مكتمل" ? "bg-green-500/15 text-green-400" : status === "مؤرشف" ? "bg-red-500/15 text-red-400" : "bg-yellow-500/15 text-yellow-400"
            }`}>
              ● {status}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/production")}>
            <ArrowRight size={14} /> رجوع
          </Button>
          {(!isLocked) && (
            <>
              <Button size="sm" onClick={handleSave}>
                <Save size={14} /> حفظ
              </Button>
              {isNew && (
                <Button variant="outline" size="sm" onClick={handleSaveAsArchived}>
                  <Save size={14} /> حفظ كمؤرشف
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Two Panel Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Right Panel - Setup */}
        <div className="lg:col-span-1 space-y-4">
          <div className="glass-card p-4 space-y-4">
            <h2 className="font-bold text-sm flex items-center gap-2"><MapPin size={16} /> إعداد الإنتاج</h2>

            {/* Date */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">التاريخ</label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} disabled={isLocked} />
            </div>

            {/* Location */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">نوع الموقع</label>
              <Select value={locationType} onValueChange={(v: any) => { setLocationType(v); setLocationId(""); }} disabled={isLocked}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="branch">فرع</SelectItem>
                  <SelectItem value="warehouse">مخزن</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                {locationType === "branch" ? "الفرع" : "المخزن"}
              </label>
              <Select value={locationId} onValueChange={setLocationId} disabled={isLocked}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر..." /></SelectTrigger>
                <SelectContent>
                  {(locationType === "branch" ? branches : warehouses).map((loc: any) => (
                    <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Department */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">القسم</label>
              <Select value={selectedDept} onValueChange={v => { setSelectedDept(v); setSelectedCat("all"); setSelectedProductId(""); }} disabled={isLocked}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="الكل" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  {departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Category */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">المجموعة</label>
              <Select value={selectedCat} onValueChange={v => { setSelectedCat(v); setSelectedProductId(""); }} disabled={isLocked}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="الكل" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  {filteredCategories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Product */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">المنتج النهائي</label>
              <Select value={selectedProductId} onValueChange={handleProductChange} disabled={isLocked}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر المنتج..." /></SelectTrigger>
                <SelectContent>
                  {filteredProducts.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} ({p.code || "—"})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Quantity */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">كمية الإنتاج</label>
              <Input
                type="text"
                inputMode="decimal"
                value={producedQty}
                onChange={e => {
                  const val = e.target.value;
                  if (val === "" || /^\d*\.?\d*$/.test(val)) {
                    setProducedQty(val);
                  }
                }}
                disabled={isLocked}
              />
            </div>

            {/* Unit */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الوحدة</label>
              <Select value={selectedUnit} onValueChange={setSelectedUnit} disabled={isLocked}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["كجم", "لتر", "وحدة"].map(u => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Creator */}
            {!isNew && existingRecord?.creator_name && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">المنشئ</label>
                <div className="flex items-center gap-2 text-sm">
                  <User size={14} className="text-muted-foreground" />
                  <span>{existingRecord.creator_name}</span>
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">ملاحظات</label>
              <Textarea
                value={productionNotes}
                onChange={e => setProductionNotes(e.target.value)}
                placeholder="ملاحظات إضافية..."
                disabled={isLocked}
                className="text-sm"
              />
            </div>
          </div>
        </div>

        {/* Left Panel - Components */}
        <div className="lg:col-span-2 space-y-4">
          <div className="glass-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-sm flex items-center gap-2"><Package size={16} /> المكونات</h2>
              {!isLocked && (
                <Button size="sm" variant="outline" onClick={() => setShowAddMaterials(true)}>
                  <Plus size={14} /> إضافة خامات
                </Button>
              )}
            </div>

            {/* Ingredients Table */}
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الكود</TableHead>
                    <TableHead className="text-right">الخامة</TableHead>
                    <TableHead className="text-right">الوحدة</TableHead>
                    <TableHead className="text-right">الرصيد المتاح</TableHead>
                    <TableHead className="text-right">الكمية</TableHead>
                    <TableHead className="text-right">متوسط التكلفة</TableHead>
                    <TableHead className="text-right">القيمة</TableHead>
                    {!isLocked && <TableHead className="text-right w-10"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ingredients.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isLocked ? 8 : 9} className="text-center py-8 text-muted-foreground">
                        لم تتم إضافة مكونات بعد
                      </TableCell>
                    </TableRow>
                  ) : (
                    ingredients.map((ing, idx) => {
                      const available = locationId ? getLocationStock(ing.stock_item_id) : null;
                      const isOverStock = available !== null && ing.required_qty > 0 && ing.required_qty > available;
                      return (
                        <TableRow key={idx}>
                          <TableCell className="font-mono text-xs">{ing.code}</TableCell>
                          <TableCell className="font-medium text-sm">{ing.name}</TableCell>
                          <TableCell className="text-sm">{ing.unit}</TableCell>
                          <TableCell className={cn("text-sm", isOverStock && "text-destructive font-bold")}>
                            {available !== null ? available.toFixed(2) : "—"}
                          </TableCell>
                          <TableCell>
                            {isLocked ? (
                              <span className="text-sm">{ing.required_qty}</span>
                            ) : (
                              <Input
                                type="number"
                                min={0}
                                value={ing.required_qty}
                                onChange={e => updateQty(idx, e.target.value)}
                                className={cn("h-8 w-20 text-sm", isOverStock && "border-destructive ring-1 ring-destructive")}
                              />
                            )}
                            {isOverStock && (
                              <p className="text-[10px] text-destructive mt-0.5">المتاح: {available!.toFixed(2)}</p>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{ing.unit_cost.toFixed(2)}</TableCell>
                          <TableCell className="text-sm font-medium">{(ing.required_qty * ing.unit_cost).toFixed(2)}</TableCell>
                          {!isLocked && (
                            <TableCell>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeIngredient(idx)}>
                                <Trash2 size={14} />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Cost Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="glass-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign size={16} className="text-primary" />
                <span className="text-sm font-bold">إجمالي تكلفة المكونات</span>
              </div>
              <p className="text-3xl font-black text-primary">{totalComponentsCost.toFixed(2)}</p>
            </div>
            <div className="glass-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Calculator size={16} className="text-primary" />
                <span className="text-sm font-bold">تكلفة الوحدة</span>
              </div>
              <p className="text-3xl font-black text-primary">{unitCost.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {totalComponentsCost.toFixed(2)} ÷ {producedQtyNum || 0} = {unitCost.toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Add Materials Modal */}
      <Dialog open={showAddMaterials} onOpenChange={setShowAddMaterials}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>إضافة خامات</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="بحث..." value={matSearch} onChange={e => setMatSearch(e.target.value)} className="pr-9" />
            </div>

            <div className="flex gap-2">
              <Select value={matFilterDept} onValueChange={v => { setMatFilterDept(v); setMatFilterCat("all"); }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="القسم" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأقسام</SelectItem>
                  {departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={matFilterCat} onValueChange={setMatFilterCat}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="المجموعة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المجموعات</SelectItem>
                  {categories.filter((c: any) => matFilterDept === "all" || c.department_id === matFilterDept).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="max-h-60 overflow-auto border rounded-lg divide-y">
              {availableMaterials.length === 0 ? (
                <p className="text-center py-4 text-sm text-muted-foreground">لا توجد خامات</p>
              ) : (
                availableMaterials.map((si: any) => (
                  <label key={si.id} className="flex items-center gap-3 p-2.5 hover:bg-muted/50 cursor-pointer">
                    <Checkbox
                      checked={selectedItemIds.has(si.id)}
                      onCheckedChange={() => toggleItem(si.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{si.name}</p>
                      <p className="text-xs text-muted-foreground">{si.stock_unit} • تكلفة: {Number(si.avg_cost).toFixed(2)}</p>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowAddMaterials(false)}>إلغاء</Button>
            <Button size="sm" onClick={handleAddMaterials} disabled={selectedItemIds.size === 0}>
              إضافة ({selectedItemIds.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
