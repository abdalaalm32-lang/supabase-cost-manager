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
import { Plus, Search, Pencil, Trash2, Eye, ToggleLeft, ToggleRight } from "lucide-react";
import { ExportButtons } from "@/components/ExportButtons";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

type FilterStatus = "الكل" | "مكتمل" | "مؤرشف" | "معدل";

export const CostAdjustmentPage: React.FC = () => {
  const { auth } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const companyId = auth.profile?.company_id;

  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FilterStatus>("الكل");

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["cost-adjustments", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cost_adjustments")
        .select("*, cost_adjustment_items(id)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ["branches-all", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("id, name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const toggleArchiveMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const newStatus = status === "مؤرشف" ? "مكتمل" : "مؤرشف";
      const { error } = await supabase.from("cost_adjustments").update({ status: newStatus }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cost-adjustments"] });
      toast.success("تم تحديث الحالة");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Delete items first, then record
      await supabase.from("cost_adjustment_items").delete().eq("cost_adjustment_id", id);
      const { error } = await supabase.from("cost_adjustments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cost-adjustments"] });
      toast.success("تم حذف السجل بنجاح");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    let result = records;
    if (filter === "مكتمل") result = result.filter((r: any) => r.status === "مكتمل");
    else if (filter === "مؤرشف") result = result.filter((r: any) => r.status === "مؤرشف");
    else if (filter === "معدل") result = result.filter((r: any) => r.status === "مكتمل" && (r as any).is_edited === true);

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((r: any) =>
        (r.record_number || "").toLowerCase().includes(q) ||
        (r.branch_name || "").toLowerCase().includes(q) ||
        (r.notes || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [records, filter, searchQuery]);

  const getLocation = (r: any) => {
    if (r.branch_name) return r.branch_name;
    if (r.branch_id) {
      const b = branches.find((b: any) => b.id === r.branch_id);
      return b?.name || "—";
    }
    return "—";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-gradient">تعديل التكاليف</h1>
        <Button className="gap-2" onClick={() => navigate("/cost-adjustment/add")}>
          <Plus size={18} /> إضافة تعديل جديد
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث برقم السجل أو الموقع أو الملاحظات..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="glass-input pr-9" />
        </div>
        <div className="flex gap-2">
          {(["الكل", "مكتمل", "مؤرشف", "معدل"] as FilterStatus[]).map((s) => (
            <Button key={s} variant={filter === s ? "default" : "outline"} size="sm" onClick={() => setFilter(s)}>{s}</Button>
          ))}
        </div>
        <ExportButtons
          data={filtered.map((r: any) => ({ record: r.record_number || "—", date: new Date(r.date).toLocaleDateString("ar-EG"), location: getLocation(r), status: (r as any).is_edited && r.status === "مكتمل" ? "معدل" : r.status, items: r.cost_adjustment_items?.length || 0 }))}
          columns={[{ key: "record", label: "رقم السجل" }, { key: "date", label: "التاريخ" }, { key: "location", label: "الموقع" }, { key: "status", label: "الحالة" }, { key: "items", label: "عدد الأصناف" }]}
          filename="تعديل_التكاليف"
          title="تعديل التكاليف"
        />
      </div>

      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">رقم السجل</TableHead>
              <TableHead className="text-right">التاريخ</TableHead>
              <TableHead className="text-right">الموقع</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              <TableHead className="text-right">عدد الأصناف</TableHead>
              <TableHead className="text-right">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">جاري التحميل...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">لا توجد سجلات</TableCell></TableRow>
            ) : filtered.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.record_number || "—"}</TableCell>
                <TableCell>{new Date(r.date).toLocaleDateString("ar-EG")}</TableCell>
                <TableCell>{getLocation(r)}</TableCell>
                <TableCell>
                  {(r as any).is_edited && r.status === "مكتمل" ? (
                    <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30">● معدّل</Badge>
                  ) : (
                    <Badge variant={r.status === "مكتمل" ? "default" : "secondary"} className={r.status === "مكتمل" ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" : "bg-amber-500/15 text-amber-600 border-amber-500/30"}>
                      {r.status}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{r.cost_adjustment_items?.length || 0}</TableCell>
                <TableCell>
                   <div className="flex gap-1">
                     <Button variant="ghost" size="icon" className="h-7 w-7" title="عرض" onClick={() => navigate(`/cost-adjustment/view/${r.id}?view=true`)}>
                       <Eye size={14} />
                     </Button>
                     {r.status === "مؤرشف" && (
                       <Button variant="ghost" size="icon" className="h-7 w-7" title="تعديل" onClick={() => navigate(`/cost-adjustment/edit/${r.id}`)}>
                         <Pencil size={14} />
                       </Button>
                     )}
                    <Button variant="ghost" size="icon" className="h-7 w-7" title={r.status === "مؤرشف" ? "إلغاء الأرشفة" : "أرشفة"} onClick={() => toggleArchiveMutation.mutate({ id: r.id, status: r.status })}>
                      {r.status === "مؤرشف" ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="حذف">
                          <Trash2 size={14} />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
                          <AlertDialogDescription>هل أنت متأكد من حذف هذا السجل؟ لا يمكن التراجع عن هذا الإجراء.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>إلغاء</AlertDialogCancel>
                          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteMutation.mutate(r.id)}>حذف</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
