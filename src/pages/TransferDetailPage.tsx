import React, { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
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
  Plus, Save, Trash2, Search, ArrowRight, ArrowLeftRight,
  DollarSign, Calendar, Archive, Printer,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useLocationStock } from "@/hooks/useLocationStock";

interface LocalTransferItem {
  id?: string;
  stock_item_id: string;
  name: string;
  code: string;
  unit: string;
  current_stock: number;
  avg_cost: number;
  quantity: number;
}

export const TransferDetailPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isEditMode = searchParams.get("edit") === "true";
  const isNew = !id || id === "add";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [sourceId, setSourceId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [sourceDepartmentId, setSourceDepartmentId] = useState("");
  const [destinationDepartmentId, setDestinationDepartmentId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LocalTransferItem[]>([]);
  const [status, setStatus] = useState("مسودة");
  const [recordNumber, setRecordNumber] = useState("");

  // Modal
  const [showAddItems, setShowAddItems] = useState(false);
  const [matSearch, setMatSearch] = useState("");
  const [matFilterDept, setMatFilterDept] = useState("all");
  const [matFilterCat, setMatFilterCat] = useState("all");
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

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

  // All locations (branches + warehouses) combined
  const allLocations = useMemo(() => {
    const locs: { id: string; name: string; type: string }[] = [];
    branches.forEach((b: any) => locs.push({ id: b.id, name: b.name, type: "فرع" }));
    warehouses.forEach((w: any) => locs.push({ id: w.id, name: w.name, type: "مخزن" }));
    return locs;
  }, [branches, warehouses]);

  // Determine source location type
  const sourceLocationType = useMemo<"branch" | "warehouse">(() => {
    if (warehouses.some((w: any) => w.id === sourceId)) return "warehouse";
    return "branch";
  }, [sourceId, warehouses]);

  // Determine destination location type
  const destLocationType = useMemo<"branch" | "warehouse">(() => {
    if (warehouses.some((w: any) => w.id === destinationId)) return "warehouse";
    return "branch";
  }, [destinationId, warehouses]);

  const { getLocationStock: getSourceStock } = useLocationStock(sourceId || null, sourceLocationType, sourceDepartmentId || null);

  // Load existing record
  const { data: existingRecord } = useQuery({
    queryKey: ["transfer-record", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfers")
        .select("*, transfer_items(*)")
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
      setSourceId(existingRecord.source_id || "");
      setDestinationId(existingRecord.destination_id || "");
      setSourceDepartmentId((existingRecord as any).source_department_id || "");
      setDestinationDepartmentId((existingRecord as any).destination_department_id || "");
      setNotes(existingRecord.notes || "");

      const loadedItems: LocalTransferItem[] = (existingRecord.transfer_items || []).map((ti: any) => {
        const si = allStockItems.find((s: any) => s.id === ti.stock_item_id);
        return {
          id: ti.id,
          stock_item_id: ti.stock_item_id || "",
          name: ti.name || si?.name || "—",
          code: ti.code || si?.code || "—",
          unit: ti.unit || si?.stock_unit || "كجم",
          current_stock: Number(ti.current_stock) || Number(si?.current_stock) || 0,
          avg_cost: Number(ti.avg_cost) || Number(si?.avg_cost) || 0,
          quantity: Number(ti.quantity) || 0,
        };
      });
      setItems(loadedItems);
    }
  }, [existingRecord, allStockItems]);

  // Materials modal
  const existingStockIds = useMemo(() => new Set(items.map(i => i.stock_item_id)), [items]);

  const availableMaterials = useMemo(() => {
    let list = allStockItems.filter((s: any) => !existingStockIds.has(s.id));
    if (matFilterDept !== "all") list = list.filter((s: any) => s.department_id === matFilterDept);
    if (matFilterCat !== "all") list = list.filter((s: any) => s.category_id === matFilterCat);
    if (matSearch.trim()) {
      const q = matSearch.trim().toLowerCase();
      list = list.filter((s: any) => s.name.toLowerCase().includes(q) || (s.code || "").toLowerCase().includes(q));
    }
    return list;
  }, [allStockItems, existingStockIds, matFilterDept, matFilterCat, matSearch]);

  const filteredModalCategories = useMemo(() => {
    if (matFilterDept === "all") return categories;
    return categories.filter((c: any) => c.department_id === matFilterDept);
  }, [categories, matFilterDept]);

  const toggleItem = (itemId: string) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  };

  const handleAddItems = () => {
    const newItems: LocalTransferItem[] = Array.from(selectedItemIds).map(siId => {
      const si = allStockItems.find((s: any) => s.id === siId)!;
      // Use per-location stock from source location
      const locationStock = sourceId ? getSourceStock(siId) : Number(si.current_stock) || 0;
      return {
        stock_item_id: siId,
        name: si.name,
        code: si.code || "—",
        unit: si.stock_unit || "كجم",
        current_stock: locationStock,
        avg_cost: Number(si.avg_cost) || 0,
        quantity: 0,
      };
    });
    setItems(prev => [...prev, ...newItems]);
    setShowAddItems(false);
    setSelectedItemIds(new Set());
    setMatSearch("");
  };

  const updateQty = (idx: number, val: string) => {
    const numVal = val === "" ? 0 : Number(val);
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      if (numVal > item.current_stock) {
        toast({ title: "تنبيه", description: `الكمية المطلوبة (${numVal}) تتجاوز الرصيد الحالي (${item.current_stock}) للصنف "${item.name}"`, variant: "destructive" });
      }
      return { ...item, quantity: numVal };
    }));
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  // Cost calculations
  const totalCost = useMemo(() => {
    return items.reduce((sum, item) => sum + item.quantity * item.avg_cost, 0);
  }, [items]);

  const isLocked = !isNew && status !== "مؤرشف" && !isEditMode;

  const handlePrintDetail = () => {
    const dateStr = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
    const logoSrc = `${window.location.origin}/logo.png`;
    const sourceLoc = allLocations.find(l => l.id === sourceId);
    const destLoc = allLocations.find(l => l.id === destinationId);
    const srcDept = departments.find((d: any) => d.id === sourceDepartmentId);
    const dstDept = departments.find((d: any) => d.id === destinationDepartmentId);
    const creatorName = isNew ? (auth.profile?.full_name || "") : (existingRecord?.creator_name || auth.profile?.full_name || "");

    let itemsHTML = "";
    let totalQty = 0;
    let totalCostSum = 0;
    items.forEach((item, idx) => {
      const tc = item.quantity * item.avg_cost;
      totalQty += item.quantity;
      totalCostSum += tc;
      itemsHTML += `<tr>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${idx + 1}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${item.code || "—"}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:right;">${item.name || "—"}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${item.unit || "—"}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${Number(item.current_stock || 0).toFixed(2)}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${Number(item.quantity || 0).toFixed(2)}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${Number(item.avg_cost || 0).toFixed(2)}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${tc.toFixed(2)}</td>
      </tr>`;
    });
    itemsHTML += `<tr style="font-weight:bold;background:#f5f5f5;">
      <td colspan="5" style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">الإجمالي</td>
      <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${totalQty.toFixed(2)}</td>
      <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">—</td>
      <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${totalCostSum.toFixed(2)}</td>
    </tr>`;

    const printHTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>إذن تحويل ${recordNumber || ""}</title>
  <style>
    @font-face { font-family:'CairoLocal'; src:url('${window.location.origin}/fonts/Cairo-Regular.ttf') format('truetype'); font-display:swap; }
    @font-face { font-family:'AmiriLocal'; src:url('${window.location.origin}/fonts/Amiri-Regular.ttf') format('truetype'); font-display:swap; }
    @font-face { font-family:'AmiriBold'; src:url('${window.location.origin}/fonts/Amiri-Bold.ttf') format('truetype'); font-display:swap; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'CairoLocal','AmiriLocal',sans-serif; direction:rtl; padding:20px; color:#000; background:#fff; }
    @media print { @page { size:auto; margin:10mm; } body { padding:0; } }
    .header { text-align:center; margin-bottom:15px; border-bottom:2px solid #000; padding-bottom:10px; display:flex; align-items:center; justify-content:center; gap:10px; }
    .logo { width:80px; height:80px; object-fit:contain; }
    .header h1 { font-size:18px; font-weight:bold; font-family:'AmiriBold','CairoLocal',sans-serif; }
    .header p { font-size:11px; }
    .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:15px; border:1px solid #000; padding:10px; }
    .info-item { font-size:11px; }
    .info-item strong { font-family:'AmiriBold','CairoLocal',sans-serif; }
    table { width:100%; border-collapse:collapse; margin-bottom:15px; }
    th { border:1px solid #000; padding:5px 6px; font-size:10px; text-align:center; font-family:'AmiriBold','CairoLocal',sans-serif; background:#f0f0f0; }
    .signatures { display:grid; grid-template-columns:1fr 1fr 1fr; gap:20px; margin-top:30px; }
    .sig-box { text-align:center; border-top:1px solid #000; padding-top:8px; font-size:11px; }
    .footer { text-align:center; margin-top:20px; font-size:9px; border-top:1px solid #000; padding-top:8px; }
  </style>
</head>
<body>
  <div class="header">
    <img src="${logoSrc}" alt="Logo" class="logo" />
    <div>
      <h1>إذن صرف وتحويل</h1>
      <p>Cost Management System • ${dateStr}</p>
    </div>
  </div>
  <div class="info-grid">
    <div class="info-item"><strong>رقم الإذن:</strong> ${recordNumber || "—"}</div>
    <div class="info-item"><strong>التاريخ:</strong> ${date || "—"}</div>
    <div class="info-item"><strong>من (المصدر):</strong> ${sourceLoc?.name || "—"}</div>
    <div class="info-item"><strong>إلى (الوجهة):</strong> ${destLoc?.name || "—"}</div>
    ${srcDept ? `<div class="info-item"><strong>القسم المصدر:</strong> ${srcDept.name}</div>` : ""}
    ${dstDept ? `<div class="info-item"><strong>القسم المستلم:</strong> ${dstDept.name}</div>` : ""}
    <div class="info-item"><strong>المنشئ:</strong> ${creatorName || "—"}</div>
    <div class="info-item"><strong>الحالة:</strong> ${status || "—"}</div>
    ${notes ? `<div class="info-item" style="grid-column:span 2;"><strong>ملاحظات:</strong> ${notes}</div>` : ""}
  </div>
  <table>
    <thead>
      <tr>
        <th>م</th><th>الكود</th><th>اسم الصنف</th><th>الوحدة</th><th>الرصيد الحالي</th><th>الكمية المحولة</th><th>متوسط التكلفة</th><th>إجمالي التكلفة</th>
      </tr>
    </thead>
    <tbody>${itemsHTML}</tbody>
  </table>
  <div class="signatures">
    <div class="sig-box">المُسلّم</div>
    <div class="sig-box">المُستلم</div>
    <div class="sig-box">المدير المسؤول</div>
  </div>
  <div class="footer">Powered by Mohamed Abdel Aal</div>
  <script>
    (async function(){
      try { if(document.fonts && document.fonts.ready) await document.fonts.ready; } catch(e){}
      window.print();
      window.onafterprint = function(){ window.close(); };
    })();
  </script>
</body>
</html>`;

    const w = window.open("", "_blank");
    if (w) { w.document.write(printHTML); w.document.close(); }
  };

  // Save
  const handleSave = async (saveAsArchived: boolean = false) => {
    if (!companyId) return;
    if (!sourceId || !destinationId) {
      toast({ title: "خطأ", description: "اختر الموقع المصدر والمستلم", variant: "destructive" });
      return;
    }
    if (sourceId === destinationId) {
      toast({ title: "خطأ", description: "لا يمكن أن يكون المصدر والوجهة نفس الموقع", variant: "destructive" });
      return;
    }
    if (items.length === 0) {
      toast({ title: "خطأ", description: "أضف صنف واحد على الأقل", variant: "destructive" });
      return;
    }

    const overStockItems = items.filter(item => item.quantity > item.current_stock);
    if (overStockItems.length > 0) {
      const names = overStockItems.map(i => `"${i.name}" (المطلوب: ${i.quantity} / المتاح: ${i.current_stock})`).join("، ");
      toast({ title: "خطأ", description: `لا يمكن صرف كمية أكبر من الرصيد الحالي: ${names}`, variant: "destructive" });
      return;
    }

    const sourceLoc = allLocations.find(l => l.id === sourceId);
    const destLoc = allLocations.find(l => l.id === destinationId);
    const finalStatus = saveAsArchived ? "مؤرشف" : "مكتمل";

    try {
      if (isNew) {
        const { data: numData } = await supabase.rpc("generate_transfer_number", { p_company_id: companyId });

        const insertData: any = {
          company_id: companyId,
          record_number: numData,
          date,
          source_id: sourceId,
          source_name: sourceLoc?.name || "",
          destination_id: destinationId,
          destination_name: destLoc?.name || "",
          source_department_id: (sourceDepartmentId && sourceDepartmentId !== "none") ? sourceDepartmentId : null,
          destination_department_id: (destinationDepartmentId && destinationDepartmentId !== "none") ? destinationDepartmentId : null,
          total_cost: totalCost,
          status: finalStatus,
          notes: notes || null,
          creator_name: auth.profile?.full_name || "",
        };

        const { data: newRecord, error } = await supabase
          .from("transfers")
          .insert(insertData)
          .select()
          .single();
        if (error) throw error;

        if (items.length > 0) {
          const rows = items.map(item => ({
            transfer_id: newRecord.id,
            stock_item_id: item.stock_item_id,
            name: item.name,
            code: item.code,
            unit: item.unit,
            quantity: item.quantity,
            avg_cost: item.avg_cost,
            current_stock: item.current_stock,
            total_cost: item.quantity * item.avg_cost,
          }));
          const { error: itemError } = await supabase.from("transfer_items").insert(rows);
          if (itemError) throw itemError;
        }

        // Note: Transfers move stock between locations but don't change global current_stock

        toast({ title: "تم حفظ إذن التحويل بنجاح" });
      } else {
        // Edit existing
        const updateData: any = {
          date,
          source_id: sourceId,
          source_name: sourceLoc?.name || "",
          destination_id: destinationId,
          destination_name: destLoc?.name || "",
          source_department_id: (sourceDepartmentId && sourceDepartmentId !== "none") ? sourceDepartmentId : null,
          destination_department_id: (destinationDepartmentId && destinationDepartmentId !== "none") ? destinationDepartmentId : null,
          total_cost: totalCost,
          notes: notes || null,
        };

        const { error } = await supabase.from("transfers").update(updateData).eq("id", id!);
        if (error) throw error;

        await supabase.from("transfer_items").delete().eq("transfer_id", id!);
        if (items.length > 0) {
          const rows = items.map(item => ({
            transfer_id: id!,
            stock_item_id: item.stock_item_id,
            name: item.name,
            code: item.code,
            unit: item.unit,
            quantity: item.quantity,
            avg_cost: item.avg_cost,
            current_stock: item.current_stock,
            total_cost: item.quantity * item.avg_cost,
          }));
          await supabase.from("transfer_items").insert(rows);
        }

        toast({ title: "تم تحديث إذن التحويل" });
      }

      queryClient.invalidateQueries({ queryKey: ["transfers"] });
      navigate("/transfers");
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <ArrowLeftRight size={28} className="text-primary" />
          <h1 className="text-2xl font-bold">{isNew ? "إضافة إذن تحويل" : `إذن تحويل ${recordNumber}`}</h1>
          {!isNew && (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
              status === "مكتمل" ? "bg-green-500/15 text-green-400" : status === "مؤرشف" ? "bg-red-500/15 text-red-400" : "bg-yellow-500/15 text-yellow-400"
            }`}>
              ● {status}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/transfers")}>
            <ArrowRight size={14} /> رجوع
          </Button>
          {!isNew && items.length > 0 && (
            <Button variant="outline" size="sm" onClick={handlePrintDetail}>
              <Printer size={14} /> طباعة
            </Button>
          )}
          {(!isLocked) && (
            <>
              <Button variant="outline" size="sm" onClick={() => handleSave(true)}>
                <Archive size={14} /> حفظ كمؤرشف
              </Button>
              <Button size="sm" onClick={() => handleSave(false)}>
                <Save size={14} /> حفظ
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Right Panel - Setup */}
        <div className="lg:col-span-1 space-y-4">
          <div className="glass-card p-4 space-y-4">
            <h2 className="font-bold text-sm flex items-center gap-2"><Calendar size={16} /> بيانات الإذن</h2>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">التاريخ</label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} disabled={isLocked} />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الموقع المصدر</label>
              <Select value={sourceId} onValueChange={v => { setSourceId(v); setSourceDepartmentId(""); }} disabled={isLocked}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر الموقع المصدر..." /></SelectTrigger>
                <SelectContent>
                  {allLocations.map(loc => (
                    <SelectItem key={loc.id} value={loc.id}>{loc.name} ({loc.type})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {sourceLocationType !== "warehouse" && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">القسم المصدر (اختياري)</label>
                <Select value={sourceDepartmentId} onValueChange={setSourceDepartmentId} disabled={isLocked}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر القسم..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون قسم</SelectItem>
                    {departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الموقع المستلم</label>
              <Select value={destinationId} onValueChange={v => { setDestinationId(v); setDestinationDepartmentId(""); }} disabled={isLocked}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر الموقع المستلم..." /></SelectTrigger>
                <SelectContent>
                  {allLocations.filter(l => l.id !== sourceId).map(loc => (
                    <SelectItem key={loc.id} value={loc.id}>{loc.name} ({loc.type})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {destLocationType !== "warehouse" && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">القسم المستلم (اختياري)</label>
                <Select value={destinationDepartmentId} onValueChange={setDestinationDepartmentId} disabled={isLocked}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر القسم..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون قسم</SelectItem>
                    {departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">ملاحظات (اختياري)</label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="أضف ملاحظات..."
                disabled={isLocked}
                className="min-h-[60px]"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">المنشئ</label>
              <Input
                value={isNew ? (auth.profile?.full_name || "") : (existingRecord?.creator_name || auth.profile?.full_name || "")}
                disabled
                className="h-9 text-sm bg-muted/50"
              />
            </div>
          </div>

          {/* Cost Summary */}
          <div className="glass-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign size={16} className="text-primary" />
              <span className="text-sm font-bold">إجمالي التكلفة</span>
            </div>
            <p className="text-3xl font-black text-primary">{totalCost.toFixed(2)}</p>
          </div>
        </div>

        {/* Left Panel - Items */}
        <div className="lg:col-span-2 space-y-4">
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-sm">الأصناف</h2>
              {!isLocked && (
                <Button size="sm" variant="outline" onClick={() => setShowAddItems(true)}>
                  <Plus size={14} /> إضافة أصناف
                </Button>
              )}
            </div>

            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الكود</TableHead>
                    <TableHead className="text-right">الصنف</TableHead>
                    <TableHead className="text-right">الوحدة</TableHead>
                    <TableHead className="text-right">الرصيد الحالي</TableHead>
                    <TableHead className="text-right">متوسط التكلفة</TableHead>
                    <TableHead className="text-right">الكمية</TableHead>
                    <TableHead className="text-right">إجمالي التكلفة</TableHead>
                    {!isLocked && <TableHead className="text-right w-10"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isLocked ? 7 : 8} className="text-center py-8 text-muted-foreground">
                        لا توجد أصناف — اضغط "إضافة أصناف"
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-xs">{item.code}</TableCell>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>{item.unit}</TableCell>
                        <TableCell>{item.current_stock}</TableCell>
                        <TableCell>{item.avg_cost.toFixed(2)}</TableCell>
                        <TableCell>
                          {isLocked ? (
                            item.quantity
                          ) : (
                            <Input
                              type="number"
                              min={0}
                              max={item.current_stock}
                              step="any"
                              value={item.quantity}
                              onChange={e => updateQty(idx, e.target.value)}
                              className={cn("h-8 w-20 text-center", item.quantity > item.current_stock && "border-destructive text-destructive")}
                            />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{(item.quantity * item.avg_cost).toFixed(2)}</TableCell>
                        {!isLocked && (
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeItem(idx)}>
                              <Trash2 size={14} />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </div>

      {/* Add Items Modal */}
      <Dialog open={showAddItems} onOpenChange={setShowAddItems}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>إضافة أصناف</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[150px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="بحث..." value={matSearch} onChange={e => setMatSearch(e.target.value)} className="pr-9 h-9" />
            </div>
            <Select value={matFilterDept} onValueChange={v => { setMatFilterDept(v); setMatFilterCat("all"); }}>
              <SelectTrigger className="w-36 h-9 text-xs"><SelectValue placeholder="القسم" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأقسام</SelectItem>
                {departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={matFilterCat} onValueChange={setMatFilterCat}>
              <SelectTrigger className="w-36 h-9 text-xs"><SelectValue placeholder="المجموعة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المجموعات</SelectItem>
                {filteredModalCategories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 overflow-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead className="text-right">الكود</TableHead>
                  <TableHead className="text-right">الصنف</TableHead>
                  <TableHead className="text-right">الوحدة</TableHead>
                  <TableHead className="text-right">الرصيد</TableHead>
                  <TableHead className="text-right">متوسط التكلفة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {availableMaterials.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground">لا توجد أصناف</TableCell></TableRow>
                ) : (
                  availableMaterials.map((si: any) => (
                    <TableRow key={si.id} className="cursor-pointer" onClick={() => toggleItem(si.id)}>
                      <TableCell><Checkbox checked={selectedItemIds.has(si.id)} /></TableCell>
                      <TableCell className="font-mono text-xs">{si.code || "—"}</TableCell>
                      <TableCell>{si.name}</TableCell>
                      <TableCell>{si.stock_unit}</TableCell>
                      <TableCell>{si.current_stock}</TableCell>
                      <TableCell>{Number(si.avg_cost).toFixed(2)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowAddItems(false)}>إلغاء</Button>
            <Button size="sm" onClick={handleAddItems} disabled={selectedItemIds.size === 0}>
              إضافة ({selectedItemIds.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
