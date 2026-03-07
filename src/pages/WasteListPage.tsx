import React, { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Plus, Search, Pencil, Eye, History, Trash2, User, MapPin, ToggleLeft, ToggleRight, Printer } from "lucide-react";
import { ExportButtons } from "@/components/ExportButtons";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

type FilterTab = "الكل" | "مكتمل" | "مؤرشف" | "معدل";

export const WasteListPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showDialog, setShowDialog] = useState(false);
  const [date, setDate] = useState<Date>(new Date());
  const [locationType, setLocationType] = useState<"branch" | "warehouse">("branch");
  const [locationId, setLocationId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterTab>("الكل");
  const [showEditHistory, setShowEditHistory] = useState(false);
  const [editHistoryId, setEditHistoryId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteRecord, setDeleteRecord] = useState<any>(null);

  const { data: wasteRecords = [], isLoading } = useQuery({
    queryKey: ["waste-records", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("waste_records")
        .select("*")
        .order("created_at", { ascending: false });
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

  const { data: editHistory = [] } = useQuery({
    queryKey: ["waste-edit-history", editHistoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("waste_edit_history")
        .select("*")
        .eq("waste_record_id", editHistoryId!)
        .order("edited_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!editHistoryId,
  });

  const getLocationName = (wr: any) => {
    if (wr.branch_id) {
      const b = branches.find((br: any) => br.id === wr.branch_id);
      return b ? b.name : wr.branch_name || "—";
    }
    if (wr.warehouse_id) {
      const w = warehouses.find((wh: any) => wh.id === wr.warehouse_id);
      return w ? w.name : "—";
    }
    return "—";
  };

  const handleCreate = async () => {
    if (!locationId || !companyId) {
      toast({ title: "يرجى اختيار الموقع", variant: "destructive" });
      return;
    }

    const { data: recNum } = await supabase.rpc("generate_waste_record_number", { p_company_id: companyId });

    const insertData: any = {
      company_id: companyId,
      date: format(date, "yyyy-MM-dd"),
      status: "مسودة",
      record_number: recNum,
      creator_name: auth.profile?.full_name || "",
      notes: adminNotes || null,
    };

    if (locationType === "branch") {
      insertData.branch_id = locationId;
      const b = branches.find((br: any) => br.id === locationId);
      insertData.branch_name = b?.name || "";
    } else {
      insertData.warehouse_id = locationId;
    }

    const { data, error } = await supabase.from("waste_records").insert(insertData).select().single();
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
      return;
    }

    setShowDialog(false);
    navigate(`/waste/${data.id}`);
  };

  const handleArchive = async (id: string) => {
    const { error } = await supabase.from("waste_records").update({ status: "مؤرشف" }).eq("id", id);
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["waste-records"] });
    toast({ title: "تم أرشفة سجل الهالك بنجاح" });
  };

  const handleUnarchive = async (id: string) => {
    const { error } = await supabase.from("waste_records").update({ status: "مكتمل" }).eq("id", id);
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["waste-records"] });
    toast({ title: "تم إلغاء أرشفة سجل الهالك بنجاح" });
  };

  const handleDelete = async () => {
    if (!deleteRecord) return;
    try {
      // If completed, reverse stock deductions
      if (deleteRecord.status === "مكتمل") {
        const { data: items } = await supabase.from("waste_items").select("*").eq("waste_record_id", deleteRecord.id);
        if (items) {
          for (const item of items) {
            if (item.stock_item_id) {
              const { data: si } = await supabase.from("stock_items").select("current_stock").eq("id", item.stock_item_id).single();
              if (si) {
                await supabase.from("stock_items").update({
                  current_stock: Number(si.current_stock) + Number(item.quantity),
                }).eq("id", item.stock_item_id);
              }
            }
          }
        }
      }
      await supabase.from("waste_items").delete().eq("waste_record_id", deleteRecord.id);
      await supabase.from("waste_edit_history").delete().eq("waste_record_id", deleteRecord.id);
      await supabase.from("waste_records").delete().eq("id", deleteRecord.id);
      queryClient.invalidateQueries({ queryKey: ["waste-records"] });
      queryClient.invalidateQueries({ queryKey: ["stock-items"] });
      toast({ title: "تم حذف سجل الهالك بنجاح" });
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    }
    setShowDeleteConfirm(false);
    setDeleteRecord(null);
  };

  const handlePrintWaste = async (record: any) => {
    const { data: items } = await supabase
      .from("waste_items")
      .select("*")
      .eq("waste_record_id", record.id)
      .order("name");

    const dateStr = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
    const logoSrc = `${window.location.origin}/logo.png`;
    const locName = getLocationName(record);

    let itemsHTML = "";
    let totalQty = 0;
    let totalCostSum = 0;
    (items || []).forEach((item: any, idx: number) => {
      const tc = Number(item.quantity || 0) * Number(item.cost || 0);
      totalQty += Number(item.quantity || 0);
      totalCostSum += tc;
      itemsHTML += `<tr>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${idx + 1}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:right;">${item.name || "—"}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${item.unit || "—"}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${Number(item.quantity || 0).toFixed(3)}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${Number(item.cost || 0).toFixed(2)}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${tc.toFixed(2)}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${item.reason || "—"}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${item.source_product || "—"}</td>
      </tr>`;
    });
    itemsHTML += `<tr style="font-weight:bold;background:#f5f5f5;">
      <td colspan="3" style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">الإجمالي</td>
      <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${totalQty.toFixed(3)}</td>
      <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">—</td>
      <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${totalCostSum.toFixed(2)}</td>
      <td colspan="2" style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;"></td>
    </tr>`;

    const printHTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>سجل هالك ${record.record_number || ""}</title>
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
      <h1>إذن هالك</h1>
      <p>Cost Management System • ${dateStr}</p>
    </div>
  </div>
  <div class="info-grid">
    <div class="info-item"><strong>رقم العملية:</strong> ${record.record_number || "—"}</div>
    <div class="info-item"><strong>التاريخ:</strong> ${record.date || "—"}</div>
    <div class="info-item"><strong>الموقع:</strong> ${locName}</div>
    <div class="info-item"><strong>المنشئ:</strong> ${record.creator_name || "—"}</div>
    <div class="info-item"><strong>الحالة:</strong> ${record.is_edited ? "معدّل" : record.status || "—"}</div>
    <div class="info-item"><strong>إجمالي التكلفة:</strong> ${Number(record.total_cost).toFixed(2)}</div>
    ${record.notes ? `<div class="info-item" style="grid-column:span 2;"><strong>ملاحظات:</strong> ${record.notes}</div>` : ""}
  </div>
  <table>
    <thead>
      <tr>
        <th>م</th>
        <th>اسم الصنف</th>
        <th>الوحدة</th>
        <th>الكمية</th>
        <th>التكلفة</th>
        <th>إجمالي التكلفة</th>
        <th>السبب</th>
        <th>المنتج المصدر</th>
      </tr>
    </thead>
    <tbody>${itemsHTML}</tbody>
  </table>
  <div class="signatures">
    <div class="sig-box">المسؤول</div>
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

  const filtered = useMemo(() => {
    let list = wasteRecords;
    if (activeFilter === "الكل") {
      // show all
    } else if (activeFilter === "مكتمل") {
      list = list.filter((wr: any) => wr.status === "مكتمل" || wr.status === "مسودة");
    } else if (activeFilter === "مؤرشف") {
      list = list.filter((wr: any) => wr.status === "مؤرشف");
    } else if (activeFilter === "معدل") {
      list = list.filter((wr: any) => wr.is_edited === true);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((wr: any) =>
        (wr.record_number || "").toLowerCase().includes(q) ||
        getLocationName(wr).toLowerCase().includes(q)
      );
    }
    return list;
  }, [wasteRecords, searchQuery, branches, warehouses, activeFilter]);

  const getStatusBadge = (wr: any) => {
    if (wr.status === "مؤرشف") return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">مؤرشف</span>;
    if (wr.status === "مكتمل") return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">مكتمل</span>;
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">مسودة</span>;
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">إدارة الهالك</h1>
        <Button onClick={() => { setShowDialog(true); setLocationId(""); setAdminNotes(""); setDate(new Date()); }}>
          <Plus size={16} /> إضافة هالك
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2">
        {(["الكل", "مكتمل", "مؤرشف", "معدل"] as FilterTab[]).map(tab => (
          <Button
            key={tab}
            variant={activeFilter === tab ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveFilter(tab)}
          >
            {tab}
            <Badge variant="secondary" className="mr-2 text-xs">
              {tab === "الكل" ? wasteRecords.length
                : tab === "مكتمل" ? wasteRecords.filter((s: any) => s.status === "مكتمل" || s.status === "مسودة").length
                : tab === "مؤرشف" ? wasteRecords.filter((s: any) => s.status === "مؤرشف").length
                : wasteRecords.filter((s: any) => s.is_edited === true).length}
            </Badge>
          </Button>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="بحث..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pr-9" />
      </div>
      <div className="flex items-center gap-2">
        <ExportButtons
          data={filtered.map((wr: any) => ({ record: wr.record_number || "—", date: wr.date, creator: wr.creator_name || "—", location: getLocationName(wr), status: wr.is_edited ? "معدل" : wr.status, cost: Number(wr.total_cost).toFixed(2) }))}
          columns={[{ key: "record", label: "رقم العملية" }, { key: "date", label: "التاريخ" }, { key: "creator", label: "المنشئ" }, { key: "location", label: "الموقع" }, { key: "status", label: "الحالة" }, { key: "cost", label: "إجمالي التكلفة" }]}
          filename="سجلات_الهالك"
          title="سجلات الهالك"
        />
      </div>

      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">رقم العملية</TableHead>
              <TableHead className="text-right">التاريخ</TableHead>
              <TableHead className="text-right">المنشئ</TableHead>
              <TableHead className="text-right">الموقع</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              <TableHead className="text-right">إجمالي التكلفة</TableHead>
              <TableHead className="text-right">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">جاري التحميل...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">لا توجد سجلات هالك</TableCell></TableRow>
            ) : filtered.map((wr: any) => (
              <TableRow key={wr.id}>
                <TableCell className="font-mono text-xs">{wr.record_number || "—"}</TableCell>
                <TableCell>{wr.date}</TableCell>
                <TableCell>{wr.creator_name || "—"}</TableCell>
                <TableCell>{getLocationName(wr)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {getStatusBadge(wr)}
                    {wr.is_edited && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">معدل</span>}
                  </div>
                </TableCell>
                <TableCell className="font-semibold">{Number(wr.total_cost).toFixed(2)}</TableCell>
                <TableCell>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/waste/${wr.id}`)}>
                      <Eye size={14} />
                    </Button>
                    {wr.status === "مؤرشف" && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/waste/${wr.id}?edit=true`)}>
                        <Pencil size={14} />
                      </Button>
                    )}
                    {wr.status === "مكتمل" ? (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleArchive(wr.id)}>
                        <ToggleLeft size={14} />
                      </Button>
                    ) : wr.status === "مؤرشف" ? (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleUnarchive(wr.id)}>
                        <ToggleRight size={14} />
                      </Button>
                    ) : null}
                    {wr.is_edited && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditHistoryId(wr.id); setShowEditHistory(true); }}>
                        <History size={14} />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handlePrintWaste(wr)}>
                      <Printer size={14} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { setDeleteRecord(wr); setShowDeleteConfirm(true); }}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* New Waste Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>إضافة هالك جديد</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>التاريخ</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}>
                    <CalendarIcon className="ml-2 h-4 w-4" />
                    {date ? format(date, "yyyy-MM-dd") : "اختر التاريخ"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label>نوع الموقع</Label>
              <Select value={locationType} onValueChange={(v: any) => { setLocationType(v); setLocationId(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="branch">فرع</SelectItem>
                  <SelectItem value="warehouse">مخزن</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{locationType === "branch" ? "الفرع" : "المخزن"}</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger><SelectValue placeholder="اختر..." /></SelectTrigger>
                <SelectContent>
                  {(locationType === "branch" ? branches : warehouses).map((loc: any) => (
                    <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>ملاحظة إدارية (اختياري)</Label>
              <Textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)} placeholder="أضف ملاحظة..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>إلغاء</Button>
            <Button onClick={handleCreate}>حفظ واستكمال</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit History Dialog */}
      <Dialog open={showEditHistory} onOpenChange={setShowEditHistory}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader><DialogTitle>تفاصيل التعديلات</DialogTitle></DialogHeader>
          {editHistory.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">لا توجد تعديلات مسجلة</p>
          ) : (
            <div className="space-y-4">
              {editHistory.map((entry: any) => (
                <div key={entry.id} className="glass-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{entry.editor_name || "—"}</span>
                    <span className="text-xs text-muted-foreground">{new Date(entry.edited_at).toLocaleString("ar-EG")}</span>
                  </div>
                  <div className="space-y-2">
                    {(entry.changes as any[]).map((change: any, idx: number) => (
                      <div key={idx} className="border rounded-md p-3 text-sm">
                        {change.field === "notes" ? (
                          <div>
                            <p className="text-muted-foreground mb-1">تعديل الملاحظات</p>
                            <p><span className="text-red-600 line-through">{change.old_value || "فارغ"}</span> → <span className="text-green-600">{change.new_value}</span></p>
                          </div>
                        ) : (
                          <div>
                            <p className="font-medium">{change.item_name} <span className="text-muted-foreground font-mono text-xs">({change.item_code})</span></p>
                            {change.old_quantity !== undefined && (
                              <p className="text-muted-foreground">
                                الكمية: <span className="text-red-600 line-through">{Number(change.old_quantity).toFixed(2)}</span> → <span className="text-green-600">{Number(change.new_quantity).toFixed(2)}</span>
                              </p>
                            )}
                            {change.old_reason !== undefined && (
                              <p className="text-muted-foreground">
                                السبب: <span className="text-red-600 line-through">{change.old_reason || "—"}</span> → <span className="text-green-600">{change.new_reason}</span>
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>تأكيد الحذف</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">هل تريد حذف هذا السجل؟ سيتم إعادة تحديث أرصدة المخزون.</p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>إلغاء</Button>
            <Button variant="destructive" size="sm" onClick={handleDelete}>حذف</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
