import React, { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { CalendarIcon, Plus, Search, Archive, Pencil, Eye, History, Printer } from "lucide-react";
import { ExportButtons } from "@/components/ExportButtons";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

const STOCKTAKE_TYPES = [
  
  { value: "جرد أول المدة", label: "جرد أول المدة" },
  { value: "جرد آخر المدة", label: "جرد آخر المدة" },
];

type FilterTab = "مكتمل" | "مؤرشف" | "معدل";

export const StocktakeListPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showDialog, setShowDialog] = useState(false);
  const [date, setDate] = useState<Date>(new Date());
  const [locationType, setLocationType] = useState<"branch" | "warehouse">("branch");
  const [locationId, setLocationId] = useState("");
  const [stocktakeType, setStocktakeType] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterTab>("مكتمل");
  const [showEditHistory, setShowEditHistory] = useState(false);
  const [editHistoryStocktakeId, setEditHistoryStocktakeId] = useState<string | null>(null);

  const { data: stocktakes = [], isLoading } = useQuery({
    queryKey: ["periodic-stocktakes", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stocktakes")
        .select("*")
        .neq("type", "فحص مخزون فوري")
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
    queryKey: ["stocktake-edit-history", editHistoryStocktakeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stocktake_edit_history")
        .select("*")
        .eq("stocktake_id", editHistoryStocktakeId!)
        .order("edited_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!editHistoryStocktakeId,
  });

  const getLocationName = (st: any) => {
    if (st.branch_id) {
      const b = branches.find((br: any) => br.id === st.branch_id);
      return b ? b.name : "—";
    }
    if (st.warehouse_id) {
      const w = warehouses.find((wr: any) => wr.id === st.warehouse_id);
      return w ? w.name : "—";
    }
    return "—";
  };

  const handleCreate = async () => {
    if (!stocktakeType || !locationId || !companyId) {
      toast({ title: "يرجى ملء جميع الحقول", variant: "destructive" });
      return;
    }

    const { data: recNum } = await supabase.rpc("generate_stocktake_number", { p_company_id: companyId });

    const insertData: any = {
      company_id: companyId,
      date: format(date, "yyyy-MM-dd"),
      type: stocktakeType,
      status: "مسودة",
      record_number: recNum,
      creator_name: auth.profile?.full_name || "",
    };

    if (locationType === "branch") {
      insertData.branch_id = locationId;
    } else {
      insertData.warehouse_id = locationId;
    }

    const { data, error } = await supabase.from("stocktakes").insert(insertData).select().single();
    if (error) {
      toast({ title: "خطأ في إنشاء الجرد", description: error.message, variant: "destructive" });
      return;
    }

    setShowDialog(false);
    navigate(`/stocktake/periodic/${data.id}`);
  };

  const handleArchive = async (stId: string) => {
    const { error } = await supabase.from("stocktakes").update({ status: "مؤرشف" }).eq("id", stId);
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["periodic-stocktakes"] });
    toast({ title: "تم أرشفة الجرد بنجاح" });
  };

  // Calculate difference values per stocktake
  const { data: allStocktakeItems = [] } = useQuery({
    queryKey: ["all-stocktake-items", companyId],
    queryFn: async () => {
      const stIds = stocktakes.map((s: any) => s.id);
      if (stIds.length === 0) return [];
      const { data, error } = await supabase.from("stocktake_items").select("*").in("stocktake_id", stIds);
      if (error) throw error;
      return data;
    },
    enabled: stocktakes.length > 0,
  });

  const getDiffValue = (stId: string) => {
    const items = allStocktakeItems.filter((i: any) => i.stocktake_id === stId);
    return items.reduce((sum: number, i: any) => {
      const diff = Number(i.counted_qty) - Number(i.book_qty);
      return sum + diff * Number(i.avg_cost);
    }, 0);
  };

  const filtered = useMemo(() => {
    let list = stocktakes;

    // Filter by tab
    if (activeFilter === "مكتمل") {
      list = list.filter((st: any) => st.status === "مكتمل" || st.status === "مسودة");
    } else if (activeFilter === "مؤرشف") {
      list = list.filter((st: any) => st.status === "مؤرشف");
    } else if (activeFilter === "معدل") {
      list = list.filter((st: any) => st.is_edited === true);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((st: any) =>
        (st.record_number || "").toLowerCase().includes(q) ||
        (st.type || "").toLowerCase().includes(q) ||
        getLocationName(st).toLowerCase().includes(q)
      );
    }

    return list;
  }, [stocktakes, searchQuery, branches, warehouses, activeFilter]);

  const getStatusBadge = (st: any) => {
    if (st.status === "مؤرشف") return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">مؤرشف</span>;
    if (st.status === "مكتمل") return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">مكتمل</span>;
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">مسودة</span>;
  };

  const openEditHistory = (stId: string) => {
    setEditHistoryStocktakeId(stId);
    setShowEditHistory(true);
  };

  const handlePrintStocktake = async (record: any) => {
    const { data: items } = await supabase
      .from("stocktake_items")
      .select("*, stock_items(name, code, stock_unit)")
      .eq("stocktake_id", record.id);

    const dateStr = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
    const logoSrc = `${window.location.origin}/logo.png`;
    const locName = getLocationName(record);

    let itemsHTML = "";
    let totalDiffValue = 0;
    (items || []).forEach((item: any, idx: number) => {
      const diff = Number(item.counted_qty) - Number(item.book_qty);
      const diffValue = diff * Number(item.avg_cost);
      totalDiffValue += diffValue;
      const si = item.stock_items;
      itemsHTML += `<tr>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${idx + 1}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${si?.code || "—"}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:right;">${si?.name || "—"}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${si?.stock_unit || "—"}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${Number(item.book_qty).toFixed(2)}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${Number(item.counted_qty).toFixed(2)}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;${diff !== 0 ? (diff > 0 ? 'color:green;' : 'color:red;') : ''}">${diff.toFixed(2)}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${Number(item.avg_cost).toFixed(2)}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${(Number(item.counted_qty) * Number(item.avg_cost)).toFixed(2)}</td>
        <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;${diffValue !== 0 ? (diffValue > 0 ? 'color:green;' : 'color:red;') : ''}">${diffValue.toFixed(2)}</td>
      </tr>`;
    });
    const totalValue = (items || []).reduce((s: number, item: any) => s + Number(item.counted_qty) * Number(item.avg_cost), 0);
    itemsHTML += `<tr style="font-weight:bold;background:#f5f5f5;">
      <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;"></td>
      <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;"></td>
      <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">الإجمالي</td>
      <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;"></td>
      <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;"></td>
      <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;"></td>
      <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;"></td>
      <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;"></td>
      <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;">${totalValue.toFixed(2)}</td>
      <td style="border:1px solid #000;padding:4px 6px;font-size:10px;text-align:center;${totalDiffValue !== 0 ? (totalDiffValue > 0 ? 'color:green;' : 'color:red;') : ''}">${totalDiffValue.toFixed(2)}</td>
    </tr>`;

    const printHTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>جرد ${record.record_number || ""}</title>
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
      <h1>محضر جرد</h1>
      <p>Cost Management System • ${dateStr}</p>
    </div>
  </div>
  <div class="info-grid">
    <div class="info-item"><strong>رقم الجرد:</strong> ${record.record_number || "—"}</div>
    <div class="info-item"><strong>التاريخ:</strong> ${record.date || "—"}</div>
    <div class="info-item"><strong>نوع الجرد:</strong> ${record.type || "—"}</div>
    <div class="info-item"><strong>الموقع:</strong> ${locName}</div>
    <div class="info-item"><strong>المنشئ:</strong> ${record.creator_name || "—"}</div>
    <div class="info-item"><strong>الحالة:</strong> ${record.is_edited ? "معدّل" : record.status || "—"}</div>
    ${record.notes ? `<div class="info-item" style="grid-column:span 2;"><strong>ملاحظات:</strong> ${record.notes}</div>` : ""}
  </div>
  <table>
    <thead>
      <tr>
        <th>م</th>
        <th>الكود</th>
        <th>اسم الصنف</th>
        <th>الوحدة</th>
        <th>الرصيد الدفتري</th>
        <th>الكمية الفعلية</th>
        <th>الفرق</th>
        <th>متوسط التكلفة</th>
        <th>القيمة</th>
        <th>قيمة الفرق</th>
      </tr>
    </thead>
    <tbody>${itemsHTML}</tbody>
  </table>
  <div class="signatures">
    <div class="sig-box">لجنة الجرد</div>
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
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">الجرد الدوري</h1>
        <Button onClick={() => { setShowDialog(true); setLocationId(""); setStocktakeType(""); setDate(new Date()); }}>
          <Plus size={16} /> إضافة جرد جديد
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2">
        {(["مكتمل", "مؤرشف", "معدل"] as FilterTab[]).map(tab => (
          <Button
            key={tab}
            variant={activeFilter === tab ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveFilter(tab)}
          >
            {tab}
            <Badge variant="secondary" className="mr-2 text-xs">
              {tab === "مكتمل" ? stocktakes.filter((s: any) => s.status === "مكتمل" || s.status === "مسودة").length
                : tab === "مؤرشف" ? stocktakes.filter((s: any) => s.status === "مؤرشف").length
                : stocktakes.filter((s: any) => s.is_edited === true).length}
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
          data={filtered.map((st: any) => ({ record: st.record_number || "—", date: st.date, type: st.type, location: getLocationName(st), status: st.is_edited ? "معدل" : st.status, diff: getDiffValue(st.id).toFixed(2) }))}
          columns={[{ key: "record", label: "رقم الجرد" }, { key: "date", label: "تاريخ الجرد" }, { key: "type", label: "نوع الجرد" }, { key: "location", label: "الفرع / المخزن" }, { key: "status", label: "الحالة" }, { key: "diff", label: "قيمة الفروقات" }]}
          filename="الجرد_الدوري"
          title="الجرد الدوري"
        />
      </div>

      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">رقم الجرد</TableHead>
              <TableHead className="text-right">تاريخ الجرد</TableHead>
              <TableHead className="text-right">نوع الجرد</TableHead>
              <TableHead className="text-right">الفرع / المخزن</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              <TableHead className="text-right">قيمة الفروقات</TableHead>
              <TableHead className="text-right">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">جاري التحميل...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">لا توجد عمليات جرد</TableCell></TableRow>
            ) : filtered.map((st: any) => {
              const diffVal = getDiffValue(st.id);
              return (
                <TableRow key={st.id}>
                  <TableCell className="font-mono text-xs">{st.record_number || "—"}</TableCell>
                  <TableCell>{st.date}</TableCell>
                  <TableCell>{st.type}</TableCell>
                  <TableCell>{getLocationName(st)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {getStatusBadge(st)}
                      {st.is_edited && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">معدل</span>}
                    </div>
                  </TableCell>
                  <TableCell className={cn("font-semibold", diffVal >= 0 ? "text-green-600" : "text-red-600")}>
                    {diffVal.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/stocktake/periodic/${st.id}`)} title="عرض">
                        <Eye size={14} />
                      </Button>
                      {st.status === "مكتمل" && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleArchive(st.id)} title="أرشفة">
                          <Archive size={14} />
                        </Button>
                      )}
                      {st.status === "مؤرشف" && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/stocktake/periodic/${st.id}?edit=true`)} title="تعديل">
                          <Pencil size={14} />
                        </Button>
                      )}
                      {st.is_edited && activeFilter === "معدل" && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditHistory(st.id)} title="تفاصيل التعديل">
                          <History size={14} />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handlePrintStocktake(st)} title="طباعة">
                        <Printer size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* New Stocktake Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>إضافة جرد جديد</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>تاريخ الجرد</Label>
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
              <Label>نوع الجرد</Label>
              <Select value={stocktakeType} onValueChange={setStocktakeType}>
                <SelectTrigger><SelectValue placeholder="اختر نوع الجرد..." /></SelectTrigger>
                <SelectContent>
                  {STOCKTAKE_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>إلغاء</Button>
            <Button onClick={handleCreate}>إنشاء الجرد</Button>
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
                            <p className="font-medium">{change.stock_item_name} <span className="text-muted-foreground font-mono text-xs">({change.stock_item_code})</span></p>
                            <p className="text-muted-foreground">
                              الرصيد الفعلي: <span className="text-red-600 line-through">{Number(change.old_counted_qty).toFixed(2)}</span> → <span className="text-green-600">{Number(change.new_counted_qty).toFixed(2)}</span>
                            </p>
                            <p className="text-muted-foreground text-xs">
                              الرصيد الدفتري: {Number(change.book_qty).toFixed(2)} | متوسط التكلفة: {Number(change.avg_cost).toFixed(2)}
                            </p>
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
    </div>
  );
};
