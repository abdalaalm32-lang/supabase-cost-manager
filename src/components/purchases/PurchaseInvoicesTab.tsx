import React, { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Search, Pencil, Eye, Trash2, ToggleLeft, ToggleRight, History, Printer } from "lucide-react";
import { ExportButtons } from "@/components/ExportButtons";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

type FilterStatus = "الكل" | "مكتمل" | "مؤرشف" | "معدل";

export const PurchaseInvoicesTab: React.FC = () => {
  const { auth } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const companyId = auth.profile?.company_id;

  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FilterStatus>("الكل");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteOrder, setDeleteOrder] = useState<any>(null);

  const handleDelete = async () => {
    if (!deleteOrder) return;
    try {
      // If completed, reverse stock increases
      if (deleteOrder.status === "مكتمل") {
        const { data: items } = await supabase.from("purchase_items").select("*").eq("purchase_order_id", deleteOrder.id);
        if (items) {
          for (const item of items) {
            if (item.stock_item_id) {
              const { data: si } = await supabase.from("stock_items").select("current_stock, avg_cost").eq("id", item.stock_item_id).single();
              if (si) {
                const newStock = Math.max(0, Number(si.current_stock) - Number(item.quantity));
                await supabase.from("stock_items").update({
                  current_stock: newStock,
                }).eq("id", item.stock_item_id);
              }
            }
          }
        }
      }
      await supabase.from("purchase_items").delete().eq("purchase_order_id", deleteOrder.id);
      await supabase.from("purchase_orders").delete().eq("id", deleteOrder.id);
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["stock-items"] });
      toast.success("تم حذف الفاتورة بنجاح");
    } catch (err: any) {
      toast.error(err.message);
    }
    setShowDeleteConfirm(false);
    setDeleteOrder(null);
  };

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["purchase-orders", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const toggleArchiveMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const newStatus = status === "مؤرشف" ? "مكتمل" : "مؤرشف";
      const { error } = await supabase.from("purchase_orders").update({ status: newStatus }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success("تم تحديث الحالة");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    let result = orders;
    if (filter === "معدل") result = result.filter((o: any) => o.is_edited);
    else if (filter === "مكتمل") result = result.filter((o: any) => o.status === "مكتمل");
    else if (filter === "مؤرشف") result = result.filter((o: any) => o.status === "مؤرشف");

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((o: any) =>
        (o.invoice_number || "").toLowerCase().includes(q) ||
        (o.supplier_name || "").toLowerCase().includes(q) ||
        String(o.total_amount).includes(q)
      );
    }
    return result;
  }, [orders, filter, searchQuery]);

  const handlePrintInvoice = async (order: any) => {
    const { data: items } = await supabase
      .from("purchase_items")
      .select("*")
      .eq("purchase_order_id", order.id)
      .order("name");

    const dateStr = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
    const logoSrc = `${window.location.origin}/logo.png`;

    let itemsHTML = "";
    let totalQty = 0;
    let totalCostSum = 0;
    (items || []).forEach((item: any, idx: number) => {
      const tc = Number(item.quantity || 0) * Number(item.unit_cost || 0);
      totalQty += Number(item.quantity || 0);
      totalCostSum += tc;
      itemsHTML += `<tr>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${idx + 1}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:right;">${item.name || "—"}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${item.unit || "—"}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${Number(item.quantity || 0).toFixed(2)}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${Number(item.unit_cost || 0).toFixed(2)}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${tc.toFixed(2)}</td>
      </tr>`;
    });
    itemsHTML += `<tr style="font-weight:bold;background:#f5f5f5;">
      <td colspan="3" style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">الإجمالي</td>
      <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${totalQty.toFixed(2)}</td>
      <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">—</td>
      <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${totalCostSum.toFixed(2)}</td>
    </tr>`;

    const printHTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>فاتورة شراء ${order.invoice_number || ""}</title>
  <style>
    @font-face { font-family:'CairoLocal'; src:url('${window.location.origin}/fonts/Cairo-Regular.ttf') format('truetype'); font-display:swap; }
    @font-face { font-family:'AmiriLocal'; src:url('${window.location.origin}/fonts/Amiri-Regular.ttf') format('truetype'); font-display:swap; }
    @font-face { font-family:'AmiriBold'; src:url('${window.location.origin}/fonts/Amiri-Bold.ttf') format('truetype'); font-display:swap; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'CairoLocal','AmiriLocal',sans-serif; direction:rtl; padding:20px; color:#000; background:#fff; }
    @media print { @page { size:auto; margin:10mm; } body { padding:0; } }
    .header { text-align:center; margin-bottom:15px; border-bottom:2px solid #000; padding-bottom:10px; display:flex; align-items:center; justify-content:center; gap:10px; }
    .logo { width:40px; height:40px; object-fit:contain; }
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
      <h1>فاتورة شراء</h1>
      <p>Cost Management System • ${dateStr}</p>
    </div>
  </div>
  <div class="info-grid">
    <div class="info-item"><strong>رقم الفاتورة:</strong> ${order.invoice_number || "—"}</div>
    <div class="info-item"><strong>التاريخ:</strong> ${new Date(order.date).toLocaleDateString("ar-EG")}</div>
    <div class="info-item"><strong>المورد:</strong> ${order.supplier_name || "—"}</div>
    <div class="info-item"><strong>المنشئ:</strong> ${order.creator_name || "—"}</div>
    <div class="info-item"><strong>الحالة:</strong> ${order.is_edited ? "معدّل" : order.status || "—"}</div>
    <div class="info-item"><strong>إجمالي الفاتورة:</strong> ${Number(order.total_amount).toFixed(2)}</div>
    ${order.notes ? `<div class="info-item" style="grid-column:span 2;"><strong>ملاحظات:</strong> ${order.notes}</div>` : ""}
  </div>
  <table>
    <thead>
      <tr>
        <th>م</th>
        <th>اسم الصنف</th>
        <th>الوحدة</th>
        <th>الكمية</th>
        <th>سعر الوحدة</th>
        <th>الإجمالي</th>
      </tr>
    </thead>
    <tbody>${itemsHTML}</tbody>
  </table>
  <div class="signatures">
    <div class="sig-box">المورد</div>
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

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">فواتير المشتريات</h2>
        <Button className="gap-2" onClick={() => navigate("/purchases/add-invoice")}>
          <Plus size={18} /> إضافة فاتورة
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث برقم الفاتورة أو المورد أو المبلغ..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="glass-input pr-9" />
        </div>
        <div className="flex gap-2">
          {(["الكل", "مكتمل", "مؤرشف", "معدل"] as FilterStatus[]).map((s) => (
            <Button key={s} variant={filter === s ? "default" : "outline"} size="sm" onClick={() => setFilter(s)}>{s}</Button>
          ))}
        </div>
        <ExportButtons
          data={filtered.map((o: any) => ({ invoice: o.invoice_number || "—", supplier: o.supplier_name, date: new Date(o.date).toLocaleDateString("ar-EG"), creator: o.creator_name || "—", status: o.is_edited ? "معدل" : o.status, total: Number(o.total_amount).toFixed(2) }))}
          columns={[{ key: "invoice", label: "رقم الفاتورة" }, { key: "supplier", label: "المورد" }, { key: "date", label: "التاريخ" }, { key: "creator", label: "المنشئ" }, { key: "status", label: "الحالة" }, { key: "total", label: "الإجمالي" }]}
          filename="فواتير_المشتريات"
          title="فواتير المشتريات"
        />
      </div>

      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">رقم الفاتورة</TableHead>
              <TableHead className="text-right">المورد</TableHead>
              <TableHead className="text-right">التاريخ</TableHead>
              <TableHead className="text-right">المنشئ</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              <TableHead className="text-right">الإجمالي</TableHead>
              <TableHead className="text-right">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">جاري التحميل...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">لا توجد فواتير</TableCell></TableRow>
            ) : (
              filtered.map((o: any) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs">{o.invoice_number || "—"}</TableCell>
                  <TableCell className="font-medium">{o.supplier_name}</TableCell>
                  <TableCell>{new Date(o.date).toLocaleDateString("ar-EG")}</TableCell>
                  <TableCell className="text-sm">{o.creator_name || "—"}</TableCell>
                  <TableCell>
                    {o.is_edited ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-400">● معدّل</span>
                    ) : o.status === "مكتمل" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/15 text-green-400">● مكتمل</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400">● مؤرشف</span>
                    )}
                  </TableCell>
                  <TableCell className="font-semibold">{Number(o.total_amount).toFixed(2)}</TableCell>
                  <TableCell>
                     <div className="flex items-center gap-1">
                       <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/purchases/view-invoice/${o.id}?view=true`)}>
                         <Eye size={14} />
                       </Button>
                       {o.status === "مؤرشف" && (
                         <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/purchases/edit-invoice/${o.id}`)}>
                           <Pencil size={14} />
                         </Button>
                       )}
                       {o.status === "مكتمل" ? (
                         <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleArchiveMutation.mutate({ id: o.id, status: o.status })}>
                           <ToggleLeft size={14} />
                         </Button>
                       ) : o.status === "مؤرشف" ? (
                         <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleArchiveMutation.mutate({ id: o.id, status: o.status })}>
                           <ToggleRight size={14} />
                         </Button>
                       ) : null}
                       <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handlePrintInvoice(o)}>
                         <Printer size={14} />
                       </Button>
                       <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { setDeleteOrder(o); setShowDeleteConfirm(true); }}>
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

      {/* Delete Confirm */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>تأكيد الحذف</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">هل تريد حذف هذه الفاتورة؟ سيتم إعادة تحديث أرصدة المخزون.</p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>إلغاء</Button>
            <Button variant="destructive" size="sm" onClick={handleDelete}>حذف</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
