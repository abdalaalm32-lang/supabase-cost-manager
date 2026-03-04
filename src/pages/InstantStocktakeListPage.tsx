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
import { CalendarIcon, Search, Archive, Pencil, Eye, History, Zap } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

type FilterTab = "مكتمل" | "مؤرشف" | "معدل";

export const InstantStocktakeListPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showDialog, setShowDialog] = useState(false);
  const [date, setDate] = useState<Date>(new Date());
  const [locationType, setLocationType] = useState<"branch" | "warehouse">("branch");
  const [locationId, setLocationId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterTab>("مكتمل");
  const [showEditHistory, setShowEditHistory] = useState(false);
  const [editHistoryStocktakeId, setEditHistoryStocktakeId] = useState<string | null>(null);

  // Only fetch instant/surprise stocktakes
  const { data: stocktakes = [], isLoading } = useQuery({
    queryKey: ["instant-stocktakes", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stocktakes")
        .select("*")
        .eq("type", "فحص مخزون فوري")
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
    if (!locationId || !companyId) {
      toast({ title: "يرجى ملء جميع الحقول", variant: "destructive" });
      return;
    }

    const { data: recNum } = await supabase.rpc("generate_stocktake_number", { p_company_id: companyId });

    const insertData: any = {
      company_id: companyId,
      date: format(date, "yyyy-MM-dd"),
      type: "فحص مخزون فوري",
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
      toast({ title: "خطأ في إنشاء الفحص", description: error.message, variant: "destructive" });
      return;
    }

    setShowDialog(false);
    navigate(`/stocktake/instant/${data.id}`);
  };

  const handleArchive = async (stId: string) => {
    const { error } = await supabase.from("stocktakes").update({ status: "مؤرشف" }).eq("id", stId);
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["instant-stocktakes"] });
    toast({ title: "تم أرشفة الفحص بنجاح" });
  };

  const { data: allStocktakeItems = [] } = useQuery({
    queryKey: ["instant-stocktake-items", companyId],
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

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">فحص مخزون فوري</h1>
        <Button onClick={() => { setShowDialog(true); setLocationId(""); setDate(new Date()); }}>
          <Zap size={16} /> فحص فوري جديد
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

      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">رقم الفحص</TableHead>
              <TableHead className="text-right">التاريخ</TableHead>
              <TableHead className="text-right">الفرع / المخزن</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              <TableHead className="text-right">قيمة الفروقات</TableHead>
              <TableHead className="text-right">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">جاري التحميل...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">لا توجد عمليات فحص</TableCell></TableRow>
            ) : filtered.map((st: any) => {
              const diffVal = getDiffValue(st.id);
              return (
                <TableRow key={st.id}>
                  <TableCell className="font-mono text-xs">{st.record_number || "—"}</TableCell>
                  <TableCell>{st.date}</TableCell>
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
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/stocktake/instant/${st.id}`)} title="عرض">
                        <Eye size={14} />
                      </Button>
                      {st.status === "مكتمل" && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleArchive(st.id)} title="أرشفة">
                          <Archive size={14} />
                        </Button>
                      )}
                      {st.status === "مؤرشف" && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/stocktake/instant/${st.id}?edit=true`)} title="تعديل">
                          <Pencil size={14} />
                        </Button>
                      )}
                      {st.is_edited && activeFilter === "معدل" && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditHistory(st.id)} title="تفاصيل التعديل">
                          <History size={14} />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* New Instant Stocktake Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>فحص فوري جديد</DialogTitle></DialogHeader>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>إلغاء</Button>
            <Button onClick={handleCreate}>إنشاء الفحص</Button>
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
