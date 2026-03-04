import React, { useState, useMemo } from "react";
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
import { useNavigate } from "react-router-dom";

interface InvoiceItem {
  stock_item_id: string;
  name: string;
  code: string;
  quantity: number;
  unit_cost: number;
  total: number;
  unit: string;
}

export const AddPurchaseInvoicePage: React.FC = () => {
  const { auth } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const companyId = auth.profile?.company_id;

  const [supplierId, setSupplierId] = useState("");
  const [destinationType, setDestinationType] = useState<"branch" | "warehouse" | "">("");
  const [destinationId, setDestinationId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [itemPickerOpen, setItemPickerOpen] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
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

  const { data: stockItems = [] } = useQuery({
    queryKey: ["stock-items-all", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_items").select("*, inventory_categories(name)").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const totalAmount = useMemo(() => items.reduce((sum, i) => sum + i.total, 0), [items]);

  const filteredStockItems = useMemo(() => {
    if (!itemSearch.trim()) return stockItems;
    const q = itemSearch.trim().toLowerCase();
    return stockItems.filter((s: any) =>
      s.name.toLowerCase().includes(q) ||
      (s.code || "").toLowerCase().includes(q) ||
      (s.inventory_categories?.name || "").toLowerCase().includes(q)
    );
  }, [stockItems, itemSearch]);

  const toggleItemSelection = (id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const confirmItemSelection = () => {
    const newItems: InvoiceItem[] = [];
    selectedItemIds.forEach((id) => {
      if (items.some((i) => i.stock_item_id === id)) return;
      const si = stockItems.find((s: any) => s.id === id);
      if (si) {
        newItems.push({
          stock_item_id: si.id,
          name: si.name,
          code: si.code || "",
          quantity: 1,
          unit_cost: 0,
          total: 0,
          unit: si.stock_unit || "",
        });
      }
    });
    setItems((prev) => [...prev, ...newItems]);
    setItemPickerOpen(false);
    setSelectedItemIds(new Set());
    setItemSearch("");
  };

  const updateItemField = (idx: number, field: "quantity" | "total", value: number) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      if (field === "quantity" && updated[idx].total > 0) {
        updated[idx].unit_cost = updated[idx].total / (value || 1);
      } else if (field === "total" && updated[idx].quantity > 0) {
        updated[idx].unit_cost = value / (updated[idx].quantity || 1);
      }
      return updated;
    });
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const saveMutation = useMutation({
    mutationFn: async (status: string) => {
      const selectedSupplier = suppliers.find((s: any) => s.id === supplierId);
      const { data: invoiceNum, error: numErr } = await supabase.rpc(
        "generate_purchase_invoice_number", { p_company_id: companyId! }
      );
      if (numErr) throw numErr;

      const { data: order, error: orderErr } = await supabase
        .from("purchase_orders")
        .insert({
          company_id: companyId!,
          supplier_id: supplierId,
          supplier_name: selectedSupplier?.name || "",
          branch_id: destinationType === "branch" ? destinationId : null,
          warehouse_id: destinationType === "warehouse" ? destinationId : null,
          date,
          notes: notes || null,
          total_amount: totalAmount,
          status,
          invoice_number: invoiceNum,
          creator_name: auth.profile?.full_name || "",
        })
        .select("id")
        .single();
      if (orderErr) throw orderErr;

      if (items.length > 0) {
        const insertItems = items.map((i) => ({
          purchase_order_id: order.id,
          stock_item_id: i.stock_item_id,
          name: i.name,
          quantity: i.quantity,
          unit_cost: i.unit_cost,
          total: i.total,
          unit: i.unit,
        }));
        const { error: itemsErr } = await supabase.from("purchase_items").insert(insertItems);
        if (itemsErr) throw itemsErr;
      }

      // Update avg_cost and current_stock for each item when status is مكتمل
      if (status === "مكتمل") {
        for (const item of items) {
          if (item.stock_item_id) {
            // Get current stock item data for weighted average calculation
            const { data: currentItem } = await supabase
              .from("stock_items")
              .select("current_stock, avg_cost")
              .eq("id", item.stock_item_id)
              .single();
            
            if (currentItem) {
              const oldStock = Number(currentItem.current_stock) || 0;
              const oldAvgCost = Number(currentItem.avg_cost) || 0;
              const newQty = Number(item.quantity) || 0;
              const newUnitCost = Number(item.unit_cost) || 0;
              
              // Weighted average cost = (old_stock * old_avg + new_qty * new_cost) / (old_stock + new_qty)
              const totalStock = oldStock + newQty;
              const newAvgCost = totalStock > 0
                ? ((oldStock * oldAvgCost) + (newQty * newUnitCost)) / totalStock
                : newUnitCost;
              
              await supabase.from("stock_items").update({
                current_stock: totalStock,
                avg_cost: newAvgCost,
              }).eq("id", item.stock_item_id);
            }
          }
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success("تم حفظ الفاتورة بنجاح");
      navigate("/purchases/invoices");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSave = (status: string) => {
    setSubmitted(true);
    if (!supplierId || !destinationType || !destinationId) return;
    if (items.length === 0) { toast.error("يرجى إضافة أصناف للفاتورة"); return; }
    saveMutation.mutate(status);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/purchases/invoices")}>
          <ArrowRight size={20} />
        </Button>
        <h1 className="text-2xl font-black text-gradient">إضافة فاتورة مشتريات</h1>
      </div>

      {/* Invoice Total */}
      <div className="glass-card p-4 flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">إجمالي الفاتورة</span>
        <span className="text-2xl font-black text-emerald-600">{totalAmount.toFixed(2)} ج.م</span>
      </div>

      {/* Form Fields */}
      <div className="glass-card p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>المورد</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger><SelectValue placeholder="اختر المورد" /></SelectTrigger>
              <SelectContent>
                {suppliers.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name} {s.code ? `(${s.code})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {submitted && !supplierId && <p className="text-sm text-destructive">هذا الحقل مطلوب</p>}
          </div>

          <div className="space-y-2">
            <Label>التاريخ</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="glass-input" />
          </div>

          <div className="space-y-2">
            <Label>الوجهة</Label>
            <Select value={destinationType} onValueChange={(v) => { setDestinationType(v as any); setDestinationId(""); }}>
              <SelectTrigger><SelectValue placeholder="فرع أو مخزن" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="branch">فرع</SelectItem>
                <SelectItem value="warehouse">مخزن</SelectItem>
              </SelectContent>
            </Select>
            {submitted && !destinationType && <p className="text-sm text-destructive">هذا الحقل مطلوب</p>}
          </div>

          {destinationType && (
            <div className="space-y-2">
              <Label>{destinationType === "branch" ? "الفرع" : "المخزن"}</Label>
              <Select value={destinationId} onValueChange={setDestinationId}>
                <SelectTrigger><SelectValue placeholder={`اختر ${destinationType === "branch" ? "الفرع" : "المخزن"}`} /></SelectTrigger>
                <SelectContent>
                  {(destinationType === "branch" ? branches : warehouses).map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {submitted && !destinationId && <p className="text-sm text-destructive">هذا الحقل مطلوب</p>}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>ملاحظات (اختياري)</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظات إضافية..." className="glass-input" />
        </div>
      </div>

      {/* Items Section */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">أصناف الفاتورة</h3>
          <Button className="gap-2" onClick={() => setItemPickerOpen(true)}>
            <Plus size={16} /> اختيار أصناف
          </Button>
        </div>

        {items.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الكود</TableHead>
                <TableHead className="text-right">الصنف</TableHead>
                <TableHead className="text-right">الكمية</TableHead>
                <TableHead className="text-right">سعر الوحدة</TableHead>
                <TableHead className="text-right">الإجمالي</TableHead>
                <TableHead className="text-right w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, idx) => (
                <TableRow key={item.stock_item_id}>
                  <TableCell className="font-mono text-xs">{item.code}</TableCell>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>
                    <Input type="number" min={1} value={item.quantity} onChange={(e) => updateItemField(idx, "quantity", parseFloat(e.target.value) || 0)} className="glass-input w-20" />
                  </TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">{item.unit_cost.toFixed(2)}</TableCell>
                  <TableCell>
                    <Input type="number" min={0} step="0.01" value={item.total} onChange={(e) => updateItemField(idx, "total", parseFloat(e.target.value) || 0)} className="glass-input w-28" />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeItem(idx)}><Trash2 size={15} /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {items.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">لم يتم إضافة أصناف بعد</div>
        )}
      </div>

      {/* Save Buttons */}
      <div className="flex gap-3 justify-end">
        <Button variant="outline" className="gap-2" disabled={saveMutation.isPending} onClick={() => handleSave("مؤرشف")}>
          <Archive size={16} /> حفظ كمؤرشفة
        </Button>
        <Button className="gap-2" disabled={saveMutation.isPending} onClick={() => handleSave("مكتمل")}>
          <Save size={16} /> {saveMutation.isPending ? "جاري الحفظ..." : "حفظ الفاتورة"}
        </Button>
      </div>

      {/* Item Picker Dialog */}
      <Dialog open={itemPickerOpen} onOpenChange={setItemPickerOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh]">
          <DialogHeader><DialogTitle>اختيار أصناف</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="بحث بالصنف أو الكود أو المجموعة..." value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} className="glass-input pr-9" />
            </div>
            <div className="max-h-[50vh] overflow-y-auto space-y-1">
              {filteredStockItems.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">لا توجد أصناف</p>
              ) : (
                filteredStockItems.map((si: any) => {
                  const isSelected = selectedItemIds.has(si.id);
                  const alreadyAdded = items.some((i) => i.stock_item_id === si.id);
                  return (
                    <div
                      key={si.id}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                        alreadyAdded ? "bg-muted/50 opacity-50 cursor-not-allowed" :
                        isSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/50"
                      }`}
                      onClick={() => !alreadyAdded && toggleItemSelection(si.id)}
                    >
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
                })
              )}
            </div>
            <Button className="w-full" disabled={selectedItemIds.size === 0} onClick={confirmItemSelection}>
              إضافة {selectedItemIds.size > 0 ? `(${selectedItemIds.size})` : ""} أصناف
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
