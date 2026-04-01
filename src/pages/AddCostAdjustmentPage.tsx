import React, { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowRight, Plus, Search, Trash2, Save, Archive } from "lucide-react";
import { toast } from "sonner";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

interface AdjustmentItem {
  stock_item_id: string;
  name: string;
  code: string;
  unit: string;
  old_cost: number;
  new_cost: number;
}

export const AddCostAdjustmentPage: React.FC = () => {
  const { auth } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isViewOnly = searchParams.get("view") === "true";
  const isEdit = !!editId;
  const companyId = auth.profile?.company_id;

  // Step 1: form, Step 2: items
  const [step, setStep] = useState(isEdit ? 2 : 1);
  const [destinationType, setDestinationType] = useState<"branch" | "warehouse" | "">("");
  const [destinationId, setDestinationId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<AdjustmentItem[]>([]);
  const [itemPickerOpen, setItemPickerOpen] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [pickerFilterDept, setPickerFilterDept] = useState("all");
  const [pickerFilterCat, setPickerFilterCat] = useState("all");
  const [hydratedEditId, setHydratedEditId] = useState<string | null>(isEdit ? null : "new");

  // Load existing record for edit
  const {
    data: existingRecord,
    isFetching: isExistingRecordFetching,
  } = useQuery({
    queryKey: ["cost-adjustment", editId],
    queryFn: async () => {
      const { data, error } = await supabase.from("cost_adjustments").select("*").eq("id", editId!).single();
      if (error) throw error;
      return data;
    },
    enabled: isEdit,
  });

  const {
    data: existingItems = [],
    isFetching: isExistingItemsFetching,
  } = useQuery({
    queryKey: ["cost-adjustment-items", editId],
    queryFn: async () => {
      const { data, error } = await supabase.from("cost_adjustment_items").select("*").eq("cost_adjustment_id", editId!);
      if (error) throw error;
      return data;
    },
    enabled: isEdit,
  });

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

  const { data: invCategories = [] } = useQuery({
    queryKey: ["inv-categories-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_categories").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const {
    data: stockItems = [],
    isFetching: isStockItemsFetching,
  } = useQuery({
    queryKey: ["stock-items-all", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_items").select("*, inventory_categories(name)").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  useEffect(() => {
    if (!isEdit) {
      setHydratedEditId("new");
      return;
    }

    setHydratedEditId(null);
  }, [editId, isEdit]);

  useEffect(() => {
    if (!isEdit || !editId || !existingRecord) return;
    if (isExistingRecordFetching || isExistingItemsFetching || isStockItemsFetching) return;
    if (hydratedEditId === editId) return;

    setDate(existingRecord.date);
    setNotes(existingRecord.notes || "");

    const matchedBranch = existingRecord.branch_id
      ? branches.find((branch: any) => branch.id === existingRecord.branch_id)
      : branches.find((branch: any) => branch.name === existingRecord.branch_name);
    const matchedWarehouse = warehouses.find((warehouse: any) => warehouse.name === existingRecord.branch_name);

    if (matchedBranch) {
      setDestinationType("branch");
      setDestinationId(matchedBranch.id);
    } else if (matchedWarehouse) {
      setDestinationType("warehouse");
      setDestinationId(matchedWarehouse.id);
    } else {
      setDestinationType("");
      setDestinationId("");
    }

    setItems(existingItems.map((i: any) => {
      const si = stockItems.find((s: any) => s.id === i.stock_item_id);
      return {
        stock_item_id: i.stock_item_id || "",
        name: i.name,
        code: si?.code || "",
        unit: i.unit || "",
        old_cost: Number(i.old_cost),
        new_cost: Number(i.new_cost),
      };
    }));
    setHydratedEditId(editId);
  }, [isEdit, editId, existingRecord, existingItems, stockItems, isExistingRecordFetching, isExistingItemsFetching, isStockItemsFetching, hydratedEditId]);

  const filteredStockItems = useMemo(() => {
    if (!itemSearch.trim()) return stockItems;
    const q = itemSearch.trim().toLowerCase();
    return stockItems.filter((s: any) =>
      s.name.toLowerCase().includes(q) ||
      (s.code || "").toLowerCase().includes(q) ||
      (s.inventory_categories?.name || "").toLowerCase().includes(q)
    );
  }, [stockItems, itemSearch]);

  const toggleItemSelection = (sid: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid); else next.add(sid);
      return next;
    });
  };

  const confirmItemSelection = () => {
    const newItems: AdjustmentItem[] = [];
    selectedItemIds.forEach((sid) => {
      if (items.some((i) => i.stock_item_id === sid)) return;
      const si = stockItems.find((s: any) => s.id === sid);
      if (si) {
        newItems.push({
          stock_item_id: si.id,
          name: si.name,
          code: si.code || "",
          unit: si.stock_unit || "",
          old_cost: Number(si.standard_cost) || 0,
          new_cost: 0,
        });
      }
    });
    setItems((prev) => [...prev, ...newItems]);
    setItemPickerOpen(false);
    setSelectedItemIds(new Set());
    setItemSearch("");
  };

  const updateNewCost = (idx: number, value: number) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], new_cost: value };
      return updated;
    });
  };

  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const clearAllItems = () => setItems([]);

  const openRecord = () => {
    if (!destinationType || !destinationId) {
      toast.error("يرجى اختيار الوجهة");
      return;
    }
    setStep(2);
  };

  const saveMutation = useMutation({
    mutationFn: async (status: string) => {
      const locationName = destinationType === "branch"
        ? branches.find((b: any) => b.id === destinationId)?.name
        : warehouses.find((w: any) => w.id === destinationId)?.name;

      if (isEdit) {
        const { error } = await supabase.from("cost_adjustments").update({
          branch_id: destinationType === "branch" && destinationId ? destinationId : null,
          branch_name: locationName || null,
          date, notes: notes || null, status, is_edited: true,
        }).eq("id", editId!);
        if (error) throw error;

        await supabase.from("cost_adjustment_items").delete().eq("cost_adjustment_id", editId!);
        if (items.length > 0) {
          const insertItems = items.map((i) => ({
            cost_adjustment_id: editId!,
            stock_item_id: i.stock_item_id || null,
            name: i.name, unit: i.unit || null,
            old_cost: Number(i.old_cost), new_cost: Number(i.new_cost),
          })).filter((i) => i.stock_item_id !== null || i.name);
          const { error: ie } = await supabase.from("cost_adjustment_items").insert(insertItems);
          if (ie) throw ie;
        }

        // Update stock_items standard_cost if status is مكتمل
        if (status === "مكتمل") {
          for (const item of items) {
            if (item.stock_item_id && item.new_cost > 0) {
              await supabase.from("stock_items").update({ standard_cost: item.new_cost, avg_cost: item.new_cost }).eq("id", item.stock_item_id);
            }
          }
        }
      } else {
        const { data: recNum } = await supabase.rpc("generate_cost_adjustment_number", { p_company_id: companyId! });

        const { data: record, error: recErr } = await supabase.from("cost_adjustments").insert({
          company_id: companyId!,
          branch_id: destinationType === "branch" && destinationId ? destinationId : null,
          branch_name: locationName || null,
          date, notes: notes || null, status,
          record_number: recNum,
        }).select("id").single();
        if (recErr) throw recErr;

        if (items.length > 0) {
          const insertItems = items.map((i) => ({
            cost_adjustment_id: record.id,
            stock_item_id: i.stock_item_id || null,
            name: i.name, unit: i.unit || null,
            old_cost: i.old_cost, new_cost: i.new_cost,
          })).filter((i) => i.stock_item_id !== null || i.name);
          const { error: ie } = await supabase.from("cost_adjustment_items").insert(insertItems);
          if (ie) throw ie;
        }

        if (status === "مكتمل") {
          for (const item of items) {
            if (item.stock_item_id && item.new_cost > 0) {
              await supabase.from("stock_items").update({ standard_cost: item.new_cost, avg_cost: item.new_cost }).eq("id", item.stock_item_id);
            }
          }
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cost-adjustments"] });
      qc.invalidateQueries({ queryKey: ["cost-adjustment", editId] });
      qc.invalidateQueries({ queryKey: ["cost-adjustment-items", editId] });
      qc.invalidateQueries({ queryKey: ["stock-items"] });
      toast.success(isEdit ? "تم تحديث السجل بنجاح" : "تم حفظ السجل بنجاح");
      navigate("/cost-adjustment");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSave = (status: string) => {
    setSubmitted(true);
    if (items.length === 0) { toast.error("يرجى إضافة أصناف"); return; }
    if (status === "مكتمل") {
      const hasZeroCost = items.some((i) => i.new_cost <= 0);
      if (hasZeroCost) { toast.error("لا يمكن حفظ السجل بتكلفة جديدة صفر. يرجى تحديد تكلفة لكل صنف."); return; }
    }
    saveMutation.mutate(status);
  };

  const isHydratingEdit = isEdit && hydratedEditId !== editId;

  if (isHydratingEdit) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">جاري التحميل...</div>;
  }

  // Step 1: Initial form
  if (step === 1) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/cost-adjustment")}><ArrowRight size={20} /></Button>
          <h1 className="text-2xl font-black text-gradient">إضافة تعديل تكلفة جديد</h1>
        </div>

        <div className="glass-card p-6 space-y-4 max-w-lg mx-auto">
          <div className="space-y-2">
            <Label>الوجهة</Label>
            <Select value={destinationType} onValueChange={(v) => { setDestinationType(v as any); setDestinationId(""); }}>
              <SelectTrigger><SelectValue placeholder="فرع أو مخزن" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="branch">فرع</SelectItem>
                <SelectItem value="warehouse">مخزن</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {destinationType && (
            <div className="space-y-2">
              <Label>{destinationType === "branch" ? "الفرع" : "المخزن"}</Label>
              <Select value={destinationId} onValueChange={setDestinationId}>
                <SelectTrigger><SelectValue placeholder={`اختر ${destinationType === "branch" ? "الفرع" : "المخزن"}`} /></SelectTrigger>
                <SelectContent>{(destinationType === "branch" ? branches : warehouses).map((d: any) => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}</SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>التاريخ</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="glass-input" />
          </div>

          <div className="space-y-2">
            <Label>ملاحظات (اختياري)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظات..." className="glass-input" />
          </div>

          <Button className="w-full gap-2" onClick={openRecord} disabled={!destinationType || !destinationId}>
            <Plus size={16} /> فتح سجل
          </Button>
        </div>
      </div>
    );
  }

  // Step 2: Items management
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => isEdit ? navigate("/cost-adjustment") : setStep(1)}><ArrowRight size={20} /></Button>
        <h1 className="text-2xl font-black text-gradient">{isViewOnly ? "عرض سجل التكلفة" : isEdit ? "تعديل سجل التكلفة" : "سجل تعديل التكلفة"}</h1>
      </div>

      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">أصناف السجل</h3>
          <div className="flex gap-2">
            {!isViewOnly && items.length > 0 && (
              <Button variant="outline" size="sm" className="gap-1 text-destructive" onClick={clearAllItems}>
                <Trash2 size={14} /> حذف الكل
              </Button>
            )}
            {!isViewOnly && (
              <Button className="gap-2" onClick={() => setItemPickerOpen(true)}>
                <Plus size={16} /> إضافة أصناف
              </Button>
            )}
          </div>
        </div>

        {items.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الكود</TableHead>
                <TableHead className="text-right">اسم الصنف</TableHead>
                <TableHead className="text-right">وحدة التخزين</TableHead>
                <TableHead className="text-right">التكلفة السابقة</TableHead>
                <TableHead className="text-right">التكلفة الجديدة</TableHead>
                <TableHead className="text-right w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-mono text-xs">{item.code || "—"}</TableCell>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>{item.unit || "—"}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">{item.old_cost.toFixed(2)}</TableCell>
                   <TableCell>
                     {isViewOnly ? (
                       <span className="font-mono text-sm">{item.new_cost.toFixed(2)}</span>
                     ) : (
                       <Input
                         type="number" min={0} step="0.01"
                         value={item.new_cost}
                         onChange={(e) => updateNewCost(idx, parseFloat(e.target.value) || 0)}
                         className={`glass-input w-28 ${submitted && item.new_cost <= 0 ? "border-destructive" : ""}`}
                       />
                     )}
                   </TableCell>
                   <TableCell>
                     {!isViewOnly && (
                       <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeItem(idx)}><Trash2 size={15} /></Button>
                     )}
                   </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground text-sm">لم يتم إضافة أصناف بعد</div>
        )}
      </div>

      {!isViewOnly && (
        <div className="flex gap-3 justify-end">
          <Button variant="outline" className="gap-2" disabled={saveMutation.isPending} onClick={() => handleSave("مؤرشف")}>
            <Archive size={16} /> حفظ كمسودة (مؤرشف)
          </Button>
          <Button className="gap-2" disabled={saveMutation.isPending} onClick={() => handleSave("مكتمل")}>
            <Save size={16} /> {saveMutation.isPending ? "جاري الحفظ..." : "حفظ السجل"}
          </Button>
        </div>
      )}

      {/* Item Picker Dialog */}
      <Dialog open={itemPickerOpen} onOpenChange={setItemPickerOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh]">
          <DialogHeader><DialogTitle>اختيار أصناف من المخزون</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="بحث بالصنف أو الكود أو المجموعة..." value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} className="glass-input pr-9" />
            </div>
            <div className="max-h-[50vh] overflow-y-auto space-y-1">
              {filteredStockItems.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">لا توجد أصناف</p>
              ) : filteredStockItems.map((si: any) => {
                const isSelected = selectedItemIds.has(si.id);
                const alreadyAdded = items.some((i) => i.stock_item_id === si.id);
                return (
                  <div key={si.id} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${alreadyAdded ? "bg-muted/50 opacity-50 cursor-not-allowed" : isSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/50"}`} onClick={() => !alreadyAdded && toggleItemSelection(si.id)}>
                    <Checkbox checked={isSelected || alreadyAdded} disabled={alreadyAdded} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{si.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{si.code}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{si.inventory_categories?.name || "—"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" disabled={selectedItemIds.size === 0} onClick={confirmItemSelection}>
                حفظ وإضافة {selectedItemIds.size > 0 ? `(${selectedItemIds.size})` : ""}
              </Button>
              <Button variant="outline" onClick={() => { setItemPickerOpen(false); setSelectedItemIds(new Set()); setItemSearch(""); }}>إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
