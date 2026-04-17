import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import {
  Eye, X, Printer, Save, FileText, Plus, Minus, Trash2,
  AlertCircle, Store, CalendarDays, Search, Archive, RotateCcw, Tag, CalendarIcon
} from "lucide-react";
import { ExportButtons } from "@/components/ExportButtons";

type FilterStatus = "الكل" | "مكتمل" | "مؤرشف";

interface SaleItem {
  id: string;
  pos_item_id: string | null;
  quantity: number;
  unit_price: number;
  total: number;
  pos_items?: { name: string; categories?: { name: string } | null } | null;
}

export const PosInvoicesPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterStatus>("الكل");
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [editItems, setEditItems] = useState<SaleItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [branchFilter, setBranchFilter] = useState<string>("all");

  // Fetch branches for filter
  const { data: branchesList } = useQuery({
    queryKey: ["pos-invoices-branches", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("branches").select("id, name").eq("company_id", companyId!).eq("active", true).order("name");
      return data || [];
    },
    enabled: !!companyId,
  });

  // Fetch sales
  const { data: sales } = useQuery({
    queryKey: ["pos-sales", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pos_sales")
        .select("*, branches:branch_id(name)")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Fetch sale items when selected
  const { data: saleItems } = useQuery({
    queryKey: ["pos-sale-items", selectedSale?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pos_sale_items")
        .select("*, pos_items:pos_item_id(name, categories:category_id(name))")
        .eq("sale_id", selectedSale!.id);
      if (error) throw error;
      return data as SaleItem[];
    },
    enabled: !!selectedSale?.id,
  });

  React.useEffect(() => {
    if (saleItems) setEditItems(saleItems.map((i) => ({ ...i })));
  }, [saleItems]);

  const filtered = useMemo(() => {
    if (!sales) return [];
    let result = sales;
    if (filter !== "الكل") result = result.filter((s) => s.status === filter);
    if (branchFilter !== "all") result = result.filter((s: any) => s.branch_id === branchFilter);
    if (dateFrom) {
      const from = new Date(dateFrom); from.setHours(0, 0, 0, 0);
      result = result.filter((s: any) => new Date(s.created_at) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo); to.setHours(23, 59, 59, 999);
      result = result.filter((s: any) => new Date(s.created_at) <= to);
    }
    return result;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((s: any) => {
        const matchInvoice = (s.invoice_number || "").toLowerCase().includes(q);
        const matchTotal = String(Number(s.total_amount || 0).toFixed(2)).includes(q) || String(Math.round(Number(s.total_amount || 0))).includes(q);
        return matchInvoice || matchTotal;
      });
    }
    return result;
  }, [sales, filter, searchQuery, branchFilter, dateFrom, dateTo]);

  const updateEditQty = (id: string, delta: number) => {
    setEditItems((prev) =>
      prev
        .map((i) => (i.id === id ? { ...i, quantity: Math.max(0, i.quantity + delta), total: Math.max(0, i.quantity + delta) * i.unit_price } : i))
        .filter((i) => i.quantity > 0)
    );
  };

  const removeEditItem = (id: string) => {
    setEditItems((prev) => prev.filter((i) => i.id !== id));
  };

  const editSubtotal = editItems.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const editDiscountAmount = selectedSale?.discount_amount || 0;
  const editAfterDiscount = editSubtotal - editDiscountAmount;
  const editTaxAmount = selectedSale?.tax_enabled ? (editAfterDiscount * (selectedSale?.tax_rate || 0)) / 100 : 0;
  const editTotal = editAfterDiscount + editTaxAmount;

  // Save edits
  const saveEdits = useMutation({
    mutationFn: async () => {
      if (!selectedSale) return;
      const originalIds = saleItems?.map((i) => i.id) || [];
      const currentIds = editItems.map((i) => i.id);
      const toDelete = originalIds.filter((id) => !currentIds.includes(id));
      for (const id of toDelete) {
        await supabase.from("pos_sale_items").delete().eq("id", id);
      }
      for (const item of editItems) {
        await supabase.from("pos_sale_items").update({ quantity: item.quantity, total: item.unit_price * item.quantity }).eq("id", item.id);
      }
      await supabase.from("pos_sales").update({ total_amount: editTotal, tax_amount: editTaxAmount }).eq("id", selectedSale.id);
    },
    onSuccess: () => {
      toast.success("تم حفظ التعديلات");
      queryClient.invalidateQueries({ queryKey: ["pos-sales"] });
      queryClient.invalidateQueries({ queryKey: ["pos-sale-items", selectedSale?.id] });
    },
    onError: () => toast.error("حدث خطأ أثناء الحفظ"),
  });

  // Toggle status mutation
  const toggleStatus = useMutation({
    mutationFn: async () => {
      if (!selectedSale) return;
      const newStatus = selectedSale.status === "مكتمل" ? "مؤرشف" : "مكتمل";
      const { error } = await supabase.from("pos_sales").update({ status: newStatus }).eq("id", selectedSale.id);
      if (error) throw error;
      return newStatus;
    },
    onSuccess: (newStatus) => {
      if (newStatus === "مؤرشف") {
        toast.success("تم أرشفة الفاتورة - جاري فتحها في شاشة البيع");
        queryClient.invalidateQueries({ queryKey: ["pos-sales"] });
        navigate("/pos/screen", { state: { editSaleId: selectedSale?.id } });
        setSelectedSale(null);
      } else {
        toast.success("تم تفعيل الفاتورة");
        setSelectedSale((prev: any) => prev ? { ...prev, status: newStatus } : null);
        queryClient.invalidateQueries({ queryKey: ["pos-sales"] });
      }
    },
    onError: () => toast.error("حدث خطأ"),
  });

  const filters: FilterStatus[] = ["الكل", "مكتمل", "مؤرشف"];

  const handlePrintInvoice = () => {
    if (!selectedSale || editItems.length === 0) return;
    const dateStr = selectedSale ? format(new Date(selectedSale.date), "yyyy/MM/dd") : "";
    const branchName = (selectedSale?.branches as any)?.name || "غير محدد";
    const logoSrc = `${window.location.origin}/logo.png`;

    let itemsHTML = "";
    editItems.forEach((item, idx) => {
      const name = (item.pos_items as any)?.name || "صنف";
      const category = (item.pos_items as any)?.categories?.name || "";
      itemsHTML += `
        <tr>
          <td style="border:1px solid #000;padding:6px 8px;text-align:center;font-size:11px;">${idx + 1}</td>
          <td style="border:1px solid #000;padding:6px 8px;text-align:right;font-size:11px;">
            ${name}${category ? `<br/><span style="font-size:9px;color:#666;">${category}</span>` : ""}
          </td>
          <td style="border:1px solid #000;padding:6px 8px;text-align:center;font-size:11px;">${item.quantity}</td>
          <td style="border:1px solid #000;padding:6px 8px;text-align:center;font-size:11px;">${item.unit_price.toFixed(2)}</td>
          <td style="border:1px solid #000;padding:6px 8px;text-align:center;font-size:11px;font-weight:bold;">${(item.unit_price * item.quantity).toFixed(2)}</td>
        </tr>`;
    });

    const discountRow = editDiscountAmount > 0
      ? `<tr>
          <td colspan="4" style="border:1px solid #000;padding:6px 8px;text-align:left;font-size:11px;color:#c00;">(-) خصم</td>
          <td style="border:1px solid #000;padding:6px 8px;text-align:center;font-size:12px;font-weight:bold;color:#c00;">- ${editDiscountAmount.toFixed(2)} EGP</td>
        </tr>` : "";

    const taxRow = selectedSale?.tax_enabled && (selectedSale?.tax_rate || 0) > 0
      ? `<tr>
          <td colspan="4" style="border:1px solid #000;padding:6px 8px;text-align:left;font-size:11px;">ضريبة القيمة المضافة (${selectedSale.tax_rate}%)</td>
          <td style="border:1px solid #000;padding:6px 8px;text-align:center;font-size:12px;font-weight:bold;">${editTaxAmount.toFixed(2)} EGP</td>
        </tr>` : "";

    const printHTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>فاتورة ${selectedSale.invoice_number || ""}</title>
  <style>
    @font-face { font-family:'CairoLocal'; src:url('${window.location.origin}/fonts/Cairo-Regular.ttf') format('truetype'); }
    @font-face { font-family:'AmiriLocal'; src:url('${window.location.origin}/fonts/Amiri-Regular.ttf') format('truetype'); }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'CairoLocal','AmiriLocal',sans-serif; direction:rtl; padding:25px; color:#000; background:#fff; }
    @media print { @page { size:auto; margin:10mm; } body { padding:0; } }
    .header { text-align:center; margin-bottom:20px; border-bottom:2px solid #000; padding-bottom:15px; }
    .logo { width:70px; height:70px; object-fit:contain; margin:0 auto 8px; display:block; }
    .header h1 { font-size:20px; font-weight:bold; margin-bottom:4px; }
    .header p { font-size:11px; color:#333; }
    .info-row { display:flex; justify-content:space-between; margin-bottom:15px; padding:10px; border:1px solid #ddd; border-radius:6px; background:#f9f9f9; }
    .info-item { text-align:center; }
    .info-item .label { font-size:10px; color:#666; margin-bottom:2px; }
    .info-item .value { font-size:13px; font-weight:bold; }
    table { width:100%; border-collapse:collapse; margin-bottom:15px; }
    .totals { margin-top:10px; border-top:2px solid #000; padding-top:10px; }
    .total-row { display:flex; justify-content:space-between; padding:4px 0; font-size:12px; }
    .total-row.grand { font-size:16px; font-weight:bold; border-top:1px solid #000; padding-top:8px; margin-top:4px; }
    .footer { text-align:center; margin-top:25px; font-size:9px; color:#666; border-top:1px solid #ccc; padding-top:8px; }
  </style>
</head>
<body>
  <div class="header">
    <img src="${logoSrc}" alt="Logo" class="logo" />
    <h1>فاتورة بيع</h1>
    <p>رقم الفاتورة: <strong>${selectedSale.invoice_number || "—"}</strong></p>
  </div>
  <div class="info-row">
    <div class="info-item"><div class="label">التاريخ</div><div class="value">${dateStr}</div></div>
    <div class="info-item"><div class="label">الفرع</div><div class="value">${branchName}</div></div>
    <div class="info-item"><div class="label">الحالة</div><div class="value">${selectedSale.status}</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="border:1px solid #000;padding:8px;text-align:center;font-size:11px;background:#eee;">#</th>
        <th style="border:1px solid #000;padding:8px;text-align:right;font-size:11px;background:#eee;">الصنف</th>
        <th style="border:1px solid #000;padding:8px;text-align:center;font-size:11px;background:#eee;">الكمية</th>
        <th style="border:1px solid #000;padding:8px;text-align:center;font-size:11px;background:#eee;">سعر الوحدة</th>
        <th style="border:1px solid #000;padding:8px;text-align:center;font-size:11px;background:#eee;">الإجمالي</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHTML}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="4" style="border:1px solid #000;padding:6px 8px;text-align:left;font-size:11px;">الإجمالي الفرعي</td>
        <td style="border:1px solid #000;padding:6px 8px;text-align:center;font-size:12px;font-weight:bold;">${editSubtotal.toFixed(2)} EGP</td>
      </tr>
      ${discountRow}
      ${taxRow}
      <tr style="background:#f0f0f0;">
        <td colspan="4" style="border:1px solid #000;padding:8px;text-align:left;font-size:13px;font-weight:bold;">الإجمالي النهائي</td>
        <td style="border:1px solid #000;padding:8px;text-align:center;font-size:14px;font-weight:bold;">${editTotal.toFixed(2)} EGP</td>
      </tr>
    </tfoot>
  </table>
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

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(printHTML);
      printWindow.document.close();
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-foreground">سجل الفواتير</h1>
      </div>

      {/* Search + Filters */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px] max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="بحث برقم الفاتورة أو الإجمالي..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="glass-input pr-9"
            />
          </div>
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="w-[180px] glass-input">
              <SelectValue placeholder="كل الفروع" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الفروع</SelectItem>
              {(branchesList || []).map((b: any) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">من</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("glass-input w-[160px] justify-start text-right font-normal", !dateFrom && "text-muted-foreground")}>
                  <CalendarIcon className="ml-2 h-4 w-4" />
                  {dateFrom ? format(dateFrom, "yyyy/MM/dd", { locale: ar }) : "اختر التاريخ"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
            <span className="text-xs text-muted-foreground">إلى</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("glass-input w-[160px] justify-start text-right font-normal", !dateTo && "text-muted-foreground")}>
                  <CalendarIcon className="ml-2 h-4 w-4" />
                  {dateTo ? format(dateTo, "yyyy/MM/dd", { locale: ar }) : "اختر التاريخ"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
          </div>
          {(dateFrom || dateTo || branchFilter !== "all" || searchQuery) && (
            <Button variant="ghost" size="sm" onClick={() => { setDateFrom(undefined); setDateTo(undefined); setBranchFilter("all"); setSearchQuery(""); }}>
              <X className="h-4 w-4 mr-1" /> مسح
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-2">
            {filters.map((f) => (
              <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" className="rounded-full" onClick={() => setFilter(f)}>
                {f}
              </Button>
            ))}
          </div>
          <div className="text-xs text-muted-foreground">
            عدد: <span className="font-bold text-foreground">{filtered.length}</span> | إجمالي: <span className="font-bold text-foreground">{filtered.reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0).toFixed(2)} EGP</span>
          </div>
          <div className="ml-auto">
            <ExportButtons
              data={(filtered || []).map((sale: any) => ({ invoice: sale.invoice_number || "—", date: format(new Date(sale.date), "yyyy/MM/dd"), branch: (sale.branches as any)?.name || "—", total: Number(sale.total_amount).toFixed(2), status: sale.status }))}
              columns={[{ key: "invoice", label: "رقم الفاتورة" }, { key: "date", label: "التاريخ" }, { key: "branch", label: "الفرع" }, { key: "total", label: "الإجمالي" }, { key: "status", label: "الحالة" }]}
              filename="فواتير_نقطة_البيع"
              title="سجل الفواتير"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">رقم الفاتورة</TableHead>
              <TableHead className="text-right">التاريخ</TableHead>
              <TableHead className="text-right">الفرع</TableHead>
              <TableHead className="text-right">الإجمالي</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              <TableHead className="text-right">إجراء</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered?.map((sale) => (
              <TableRow key={sale.id}>
                <TableCell className="font-mono font-bold text-right">{sale.invoice_number || "—"}</TableCell>
                <TableCell className="text-right">{format(new Date(sale.date), "yyyy/MM/dd")}</TableCell>
                <TableCell className="text-right">{(sale.branches as any)?.name || "—"}</TableCell>
                <TableCell className="font-bold text-right">{Number(sale.total_amount).toFixed(2)} EGP</TableCell>
                <TableCell className="text-right">
                  <Badge variant={sale.status === "مكتمل" ? "default" : "secondary"} className={cn(
                    sale.status === "مكتمل" ? "bg-success/20 text-success border-success/30" : "bg-warning/20 text-warning border-warning/30"
                  )}>
                    {sale.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" className="gap-1" onClick={() => setSelectedSale(sale)}>
                    <Eye className="h-4 w-4" />
                    عرض وتعديل
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {(!filtered || filtered.length === 0) && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                  لا توجد فواتير
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Invoice Detail Dialog */}
      <Dialog open={!!selectedSale} onOpenChange={(o) => !o && setSelectedSale(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                مراجعة تفاصيل الفاتورة: {selectedSale?.invoice_number}
              </DialogTitle>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handlePrintInvoice}>
                  <Printer className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 overflow-auto flex-1">
            {/* Info boxes */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-muted/50 p-3 flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">تاريخ العملية</p>
                  <p className="font-bold text-foreground text-sm">
                    {selectedSale ? format(new Date(selectedSale.date), "yyyy/MM/dd") : ""}
                  </p>
                </div>
              </div>
              <div className="rounded-xl bg-muted/50 p-3 flex items-center gap-2">
                <Store className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">الفرع</p>
                  <p className="font-bold text-foreground text-sm">
                    {(selectedSale?.branches as any)?.name || "غير محدد"}
                  </p>
                </div>
              </div>
              <div className="rounded-xl bg-muted/50 p-3 flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">رقم الفاتورة</p>
                  <p className="font-bold text-foreground text-sm">{selectedSale?.invoice_number || "—"}</p>
                </div>
              </div>
              <div className="rounded-xl bg-muted/50 p-3 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">الحالة</p>
                  <Badge variant={selectedSale?.status === "مكتمل" ? "default" : "secondary"} className={cn(
                    "mt-0.5",
                    selectedSale?.status === "مكتمل" ? "bg-success/20 text-success border-success/30" : "bg-warning/20 text-warning border-warning/30"
                  )}>
                    {selectedSale?.status}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Items list */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-4 w-4 text-primary" />
                <h4 className="font-bold text-foreground">قائمة الطلبات</h4>
              </div>
              <div className="flex flex-col gap-2">
                {editItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-muted/30">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground text-sm truncate">
                        {(item.pos_items as any)?.name || "صنف"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(item.pos_items as any)?.categories?.name || ""}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {item.unit_price.toFixed(2)} EGP
                    </div>
                    {selectedSale?.status === "مؤرشف" ? (
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateEditQty(item.id, -1)}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-8 text-center font-bold text-foreground text-sm">{item.quantity}</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateEditQty(item.id, 1)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <span className="w-8 text-center font-bold text-foreground text-sm">×{item.quantity}</span>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-primary text-sm whitespace-nowrap">
                        {(item.unit_price * item.quantity).toFixed(2)} EGP
                      </span>
                      {selectedSale?.status === "مؤرشف" && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeEditItem(item.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="space-y-2 pt-2 border-t border-border/50">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>الإجمالي الفرعي</span>
                <span>{editSubtotal.toFixed(2)} EGP</span>
              </div>
              {editDiscountAmount > 0 && (
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="gap-1 text-xs text-destructive border-destructive/30">
                    <Tag className="h-3 w-3" />
                    خصم
                  </Badge>
                  <span className="text-sm font-semibold text-destructive">- {editDiscountAmount.toFixed(2)} EGP</span>
                </div>
              )}
              {selectedSale?.tax_enabled && (selectedSale?.tax_rate || 0) > 0 && (
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="gap-1 text-xs">
                    <AlertCircle className="h-3 w-3" />
                    قيمة الضريبة المضافة = {selectedSale?.tax_rate}%
                  </Badge>
                  <span className="text-sm font-semibold text-warning">{editTaxAmount.toFixed(2)} EGP</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">الإجمالي النهائي</span>
                <span className="text-2xl font-black text-gradient">{editTotal.toFixed(2)} <span className="text-base">EGP</span></span>
              </div>
            </div>
          </div>

          {/* Dialog footer */}
          <div className="flex flex-col gap-2 pt-4 border-t border-border/50">
            <div className="flex gap-2">
              {selectedSale?.status === "مؤرشف" && (
                <Button className="flex-1 gap-2" onClick={() => saveEdits.mutate()} disabled={saveEdits.isPending}>
                  <Save className="h-4 w-4" />
                  حفظ التعديلات
                </Button>
              )}
              <Button className="gap-2" variant="outline" onClick={handlePrintInvoice}>
                <Printer className="h-4 w-4" />
                طباعة
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1 gap-2"
                variant={selectedSale?.status === "مكتمل" ? "secondary" : "default"}
                onClick={() => toggleStatus.mutate()}
                disabled={toggleStatus.isPending}
              >
                {selectedSale?.status === "مكتمل" ? (
                  <><Archive className="h-4 w-4" /> جعلها مؤرشفة</>
                ) : (
                  <><RotateCcw className="h-4 w-4" /> جعلها مكتملة</>
                )}
              </Button>
              <Button className="flex-1 gap-2" variant="outline" onClick={() => setSelectedSale(null)}>
                <X className="h-4 w-4" />
                إغلاق الفاتورة
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
