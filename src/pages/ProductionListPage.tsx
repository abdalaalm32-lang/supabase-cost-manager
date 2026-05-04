import React, { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Search, Eye, Pencil, ToggleLeft, ToggleRight, History, Printer,
  Layers, Filter, Trash2,
} from "lucide-react";
import { ExportButtons } from "@/components/ExportButtons";
import { useToast } from "@/hooks/use-toast";

type StatusFilter = "all" | "مكتمل" | "مؤرشف" | "edited";

export const ProductionListPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showChanges, setShowChanges] = useState(false);
  const [selectedChanges, setSelectedChanges] = useState<any[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ id: string; newStatus: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteRecord, setDeleteRecord] = useState<any>(null);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["production-records", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_records")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: editHistory = [] } = useQuery({
    queryKey: ["production-edit-history", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_edit_history")
        .select("*")
        .order("edited_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const filtered = useMemo(() => {
    let items = records;
    if (statusFilter === "edited") {
      items = items.filter((r: any) => r.is_edited);
    } else if (statusFilter !== "all") {
      items = items.filter((r: any) => r.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter((r: any) =>
        (r.record_number || "").toLowerCase().includes(q) ||
        (r.product_name || "").toLowerCase().includes(q) ||
        (r.branch_name || "").toLowerCase().includes(q)
      );
    }
    return items;
  }, [records, statusFilter, search]);

  const handleStatusChange = async () => {
    if (!confirmAction) return;
    const { id, newStatus } = confirmAction;
    const { error } = await supabase
      .from("production_records")
      .update({ status: newStatus })
      .eq("id", id);
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `تم تغيير الحالة إلى ${newStatus}` });
      queryClient.invalidateQueries({ queryKey: ["production-records"] });
    }
    setShowConfirm(false);
    setConfirmAction(null);
  };

  const handleDelete = async () => {
    if (!deleteRecord) return;
    try {
      // If was completed, reverse stock: restore ingredients, deduct product
      if (deleteRecord.status === "مكتمل") {
        const { data: ingredients } = await supabase.from("production_ingredients").select("*").eq("production_record_id", deleteRecord.id);
        if (ingredients) {
          for (const ing of ingredients) {
            if (ing.stock_item_id) {
              const { data: si } = await supabase.from("stock_items").select("current_stock, avg_cost").eq("id", ing.stock_item_id).single();
              if (si) {
                await supabase.from("stock_items").update({
                  current_stock: Number(si.current_stock) + Number(ing.required_qty),
                }).eq("id", ing.stock_item_id);
              }
            }
          }
        }
        // Deduct produced item
        if (deleteRecord.product_id) {
          const { data: si } = await supabase.from("stock_items").select("current_stock").eq("id", deleteRecord.product_id).single();
          if (si) {
            await supabase.from("stock_items").update({
              current_stock: Math.max(0, Number(si.current_stock) - Number(deleteRecord.produced_qty)),
            }).eq("id", deleteRecord.product_id);
          }
        }
      }
      await supabase.from("production_ingredients").delete().eq("production_record_id", deleteRecord.id);
      await supabase.from("production_edit_history").delete().eq("production_record_id", deleteRecord.id);
      await supabase.from("production_records").delete().eq("id", deleteRecord.id);
      queryClient.invalidateQueries({ queryKey: ["production-records"] });
      queryClient.invalidateQueries({ queryKey: ["stock-items"] });
      toast({ title: "تم حذف عملية الإنتاج بنجاح" });
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    }
    setShowDeleteConfirm(false);
    setDeleteRecord(null);
  };

  const openChanges = (recordId: string) => {
    const changes = editHistory.filter((h: any) => h.production_record_id === recordId);
    setSelectedChanges(changes);
    setShowChanges(true);
  };

  const handlePrintRecord = async (record: any) => {
    const { data: items } = await supabase
      .from("production_ingredients")
      .select("*")
      .eq("production_record_id", record.id)
      .order("name");

    const dateStr = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
    const logoSrc = `${window.location.origin}/logo.png`;

    let itemsHTML = "";
    let totalQty = 0;
    let totalCostSum = 0;
    (items || []).forEach((item: any, idx: number) => {
      const tc = Number(item.required_qty || 0) * Number(item.unit_cost || 0);
      totalQty += Number(item.required_qty || 0);
      totalCostSum += tc;
      itemsHTML += `<tr>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${idx + 1}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:right;">${item.name || "—"}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${item.unit || "—"}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${Number(item.required_qty || 0).toFixed(3)}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${Number(item.unit_cost || 0).toFixed(2)}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${tc.toFixed(2)}</td>
      </tr>`;
    });
    itemsHTML += `<tr style="font-weight:bold;background:#f5f5f5;">
      <td colspan="3" style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">الإجمالي</td>
      <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${totalQty.toFixed(3)}</td>
      <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">—</td>
      <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${totalCostSum.toFixed(2)}</td>
    </tr>`;

    const printHTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>عملية إنتاج ${record.record_number || ""}</title>
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
      <h1>إذن إنتاج</h1>
      <p>Cost Management System • ${dateStr}</p>
    </div>
  </div>
  <div class="info-grid">
    <div class="info-item"><strong>رقم العملية:</strong> ${record.record_number || "—"}</div>
    <div class="info-item"><strong>التاريخ:</strong> ${record.date || "—"}</div>
    <div class="info-item"><strong>المنتج:</strong> ${record.product_name || "—"}</div>
    <div class="info-item"><strong>الكمية المنتجة:</strong> ${Number(record.produced_qty).toFixed(3)} ${record.unit || ""}</div>
    <div class="info-item"><strong>الموقع:</strong> ${record.branch_name || "—"}</div>
    <div class="info-item"><strong>المنشئ:</strong> ${record.creator_name || "—"}</div>
    <div class="info-item"><strong>الحالة:</strong> ${record.is_edited ? "معدّل" : record.status || "—"}</div>
    <div class="info-item"><strong>تكلفة الوحدة:</strong> ${Number(record.unit_cost).toFixed(2)}</div>
    ${record.notes ? `<div class="info-item" style="grid-column:span 2;"><strong>ملاحظات:</strong> ${record.notes}</div>` : ""}
  </div>
  <table>
    <thead>
      <tr>
        <th>م</th>
        <th>اسم الخامة</th>
        <th>الوحدة</th>
        <th>الكمية المطلوبة</th>
        <th>تكلفة الوحدة</th>
        <th>إجمالي التكلفة</th>
      </tr>
    </thead>
    <tbody>${itemsHTML}</tbody>
  </table>
  <div class="info-grid" style="grid-template-columns:1fr 1fr;">
    <div class="info-item"><strong>إجمالي تكلفة الإنتاج:</strong> ${Number(record.total_production_cost).toFixed(2)}</div>
    <div class="info-item"><strong>تكلفة الوحدة:</strong> ${Number(record.unit_cost).toFixed(2)}</div>
  </div>
  <div class="signatures">
    <div class="sig-box">مسؤول الإنتاج</div>
    <div class="sig-box">أمين المخزن</div>
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

  const getStatusBadge = (status: string, isEdited: boolean) => {
    if (isEdited) {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-400">● معدّل</span>;
    }
    switch (status) {
      case "مكتمل":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/15 text-green-400">● مكتمل</span>;
      case "مؤرشف":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400">● مؤرشف</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/15 text-yellow-400">● مسودة</span>;
    }
  };

  return (
    <div className="space-y-4 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Layers size={28} className="text-primary" />
          <h1 className="text-2xl font-bold">عمليات الإنتاج</h1>
        </div>
        <Button onClick={() => navigate("/production/add")} size="sm">
          <Plus size={14} /> إضافة عملية إنتاج
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث برقم العملية، المنتج، الموقع..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "مكتمل", "مؤرشف", "edited"] as StatusFilter[]).map(f => (
            <Button
              key={f}
              variant={statusFilter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(f)}
            >
              {f === "all" ? "الكل" : f === "edited" ? "معدّل" : f}
            </Button>
          ))}
        </div>
        <ExportButtons
          data={filtered.map((r: any) => ({ record: r.record_number || "—", date: r.date, product: r.product_name, location: r.branch_name || "—", creator: r.creator_name || "—", status: r.is_edited ? "معدل" : r.status, cost: Number(r.total_production_cost).toFixed(2) }))}
          columns={[{ key: "record", label: "رقم العملية" }, { key: "date", label: "التاريخ" }, { key: "product", label: "المنتج" }, { key: "location", label: "الموقع" }, { key: "creator", label: "المنشئ" }, { key: "status", label: "الحالة" }, { key: "qty", label: "الكمية المنتجة" }, { key: "cost", label: "إجمالي التكلفة" }]}
          filename="عمليات_الإنتاج"
          title="عمليات الإنتاج"
        />
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <Table>
           <TableHeader>
             <TableRow>
              <TableHead className="text-right">رقم العملية</TableHead>
              <TableHead className="text-right">التاريخ</TableHead>
              <TableHead className="text-right">المنتج</TableHead>
              <TableHead className="text-right">الموقع</TableHead>
              <TableHead className="text-right">المنشئ</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              <TableHead className="text-right">الكمية المنتجة</TableHead>
              <TableHead className="text-right">إجمالي التكلفة</TableHead>
              <TableHead className="text-right">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">جاري التحميل...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">لا توجد عمليات إنتاج</TableCell></TableRow>
            ) : (
              filtered.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.record_number || "—"}</TableCell>
                  <TableCell>{r.date}</TableCell>
                  <TableCell className="font-medium">{r.product_name}</TableCell>
                    <TableCell>{r.branch_name || "—"}</TableCell>
                    <TableCell className="text-sm">{r.creator_name || "—"}</TableCell>
                  <TableCell>{getStatusBadge(r.status, r.is_edited)}</TableCell>
                  <TableCell>{Number(r.produced_qty ?? 0).toFixed(3)} {r.unit || ""}</TableCell>
                  <TableCell>{Number(r.total_production_cost).toFixed(2)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/production/${r.id}`)}>
                        <Eye size={14} />
                      </Button>
                      {r.status === "مؤرشف" && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/production/${r.id}?edit=true`)}>
                          <Pencil size={14} />
                        </Button>
                      )}
                      {r.status === "مكتمل" ? (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                          setConfirmAction({ id: r.id, newStatus: "مؤرشف" });
                          setShowConfirm(true);
                        }}>
                          <ToggleLeft size={14} />
                        </Button>
                      ) : r.status === "مؤرشف" ? (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                          setConfirmAction({ id: r.id, newStatus: "مكتمل" });
                          setShowConfirm(true);
                        }}>
                          <ToggleRight size={14} />
                        </Button>
                      ) : null}
                      {r.is_edited && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openChanges(r.id)}>
                          <History size={14} />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handlePrintRecord(r)}>
                        <Printer size={14} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { setDeleteRecord(r); setShowDeleteConfirm(true); }}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Confirm Status Change */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>تأكيد تغيير الحالة</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            هل تريد تغيير الحالة إلى {confirmAction?.newStatus}؟
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowConfirm(false)}>إلغاء</Button>
            <Button size="sm" onClick={handleStatusChange}>تأكيد</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Changes */}
      <Dialog open={showChanges} onOpenChange={setShowChanges}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>سجل التعديلات</DialogTitle>
          </DialogHeader>
          <div className="max-h-80 overflow-auto space-y-3">
            {selectedChanges.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">لا توجد تعديلات</p>
            ) : (
              selectedChanges.map((h: any) => (
                <div key={h.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{h.editor_name || "—"}</span>
                    <span>{new Date(h.edited_at).toLocaleString("ar-EG")}</span>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right text-xs">الحقل</TableHead>
                        <TableHead className="text-right text-xs">قبل</TableHead>
                        <TableHead className="text-right text-xs">بعد</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(Array.isArray(h.changes) ? h.changes : []).map((c: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs">{c.field}</TableCell>
                          <TableCell className="text-xs text-red-400">{c.old_value}</TableCell>
                          <TableCell className="text-xs text-green-400">{c.new_value}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>تأكيد الحذف</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">هل تريد حذف هذه العملية؟ سيتم إعادة تحديث أرصدة المخزون.</p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>إلغاء</Button>
            <Button variant="destructive" size="sm" onClick={handleDelete}>حذف</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
