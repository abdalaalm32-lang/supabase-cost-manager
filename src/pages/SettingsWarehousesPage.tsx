import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Warehouse, Building2, Plus, MoreHorizontal, Pencil, Trash2, ToggleLeft, Search, Filter, MessageCircle, AlertTriangle
} from "lucide-react";
import { ExportButtons } from "@/components/ExportButtons";

const CLASSIFICATIONS = [
  "مخزن رئيسي",
  "مخزن فرعي",
  "مطبخ / إنتاج",
  "مخزن خامات أولية",
];

export const SettingsWarehousesPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const queryClient = useQueryClient();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editWarehouse, setEditWarehouse] = useState<any>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterClassification, setFilterClassification] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [isLimitDialogOpen, setIsLimitDialogOpen] = useState(false);

  // Form
  const [formName, setFormName] = useState("");
  const [formClassification, setFormClassification] = useState("مخزن رئيسي");
  const [formManagerId, setFormManagerId] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [formLinkedBranches, setFormLinkedBranches] = useState<string[]>([]);

  const { data: warehouses, isLoading } = useQuery({
    queryKey: ["settings-warehouses", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: branches } = useQuery({
    queryKey: ["all-branches", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("id, name, active")
        .eq("company_id", companyId!)
        .eq("active", true);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: users } = useQuery({
    queryKey: ["all-users", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .eq("company_id", companyId!)
        .eq("status", "نشط");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: warehouseBranches } = useQuery({
    queryKey: ["warehouse-branches", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouse_branches")
        .select("warehouse_id, branch_id");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: companyData } = useQuery({
    queryKey: ["company-data-full-wh", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").eq("id", companyId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: branchCount } = useQuery({
    queryKey: ["branch-count", companyId],
    queryFn: async () => {
      const { count, error } = await supabase.from("branches").select("id", { count: "exact", head: true }).eq("company_id", companyId!);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!companyId,
  });

  const totalWarehouses = warehouses?.length || 0;
  const linkedBranchesCount = new Set(warehouseBranches?.map(wb => wb.branch_id) || []).size;
  const maxWarehouses = companyData?.max_warehouses ?? 999;
  const maxBranches = companyData?.max_branches ?? 999;

  const resetForm = () => {
    setFormName(""); setFormClassification("مخزن رئيسي"); setFormManagerId("");
    setFormActive(true); setFormLinkedBranches([]); setEditWarehouse(null);
  };

  const [upgradeLoading, setUpgradeLoading] = useState(false);

  const sendUpgradeRequest = async () => {
    if (!companyData || !auth.profile) return;
    setUpgradeLoading(true);
    try {
      const { error } = await supabase.from("support_tickets").insert({
        company_id: companyId!,
        company_name: companyData.name,
        company_code: companyData.code,
        sender_id: auth.profile.user_id,
        sender_name: auth.profile.full_name,
        subject: "طلب ترقية حساب",
        message: `اهلا انا مدير شركه ${companyData.name} المشترك معك في السيستم\nاريد ترقيه حسابي لتزويد limit الفروع والمخازن\nدا كود شركتي ${companyData.code}\nشكرا`,
      });
      if (error) throw error;
      toast.success("تم إرسال طلب الترقية بنجاح");
      setIsLimitDialogOpen(false);
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ");
    } finally {
      setUpgradeLoading(false);
    }
  };

  const openAdd = () => {
    if (totalWarehouses >= maxWarehouses && !auth.isAdmin) {
      setIsLimitDialogOpen(true);
      return;
    }
    resetForm(); setIsDialogOpen(true);
  };
  const openEdit = (w: any) => {
    setEditWarehouse(w);
    setFormName(w.name);
    setFormClassification(w.classification || "مخزن رئيسي");
    setFormManagerId(w.manager_id || "");
    setFormActive(w.active);
    const linked = warehouseBranches?.filter(wb => wb.warehouse_id === w.id).map(wb => wb.branch_id) || [];
    setFormLinkedBranches(linked);
    setIsDialogOpen(true);
  };

  const toggleLinkedBranch = (branchId: string) => {
    setFormLinkedBranches(prev =>
      prev.includes(branchId) ? prev.filter(id => id !== branchId) : [...prev, branchId]
    );
  };

  const saveWarehouse = useMutation({
    mutationFn: async () => {
      if (!formName.trim()) throw new Error("اسم المخزن مطلوب");

      let warehouseId: string;

      if (editWarehouse) {
        const { error } = await supabase.from("warehouses").update({
          name: formName, classification: formClassification,
          manager_id: formManagerId || null, active: formActive,
        }).eq("id", editWarehouse.id);
        if (error) throw error;
        warehouseId = editWarehouse.id;
        await supabase.from("warehouse_branches").delete().eq("warehouse_id", warehouseId);
      } else {
        const { data: code } = await supabase.rpc("generate_warehouse_code", { p_company_id: companyId! });
        const { data, error } = await supabase.from("warehouses").insert({
          name: formName, classification: formClassification,
          manager_id: formManagerId || null, active: formActive,
          company_id: companyId!, code,
        }).select("id").single();
        if (error) throw error;
        warehouseId = data.id;
      }

      if (formLinkedBranches.length > 0) {
        const links = formLinkedBranches.map(bid => ({ warehouse_id: warehouseId, branch_id: bid }));
        const { error } = await supabase.from("warehouse_branches").insert(links);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editWarehouse ? "تم تحديث المخزن" : "تم إضافة المخزن");
      setIsDialogOpen(false); resetForm();
      queryClient.invalidateQueries({ queryKey: ["settings-warehouses"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-branches"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async (w: any) => {
      const { error } = await supabase.from("warehouses").update({ active: !w.active }).eq("id", w.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تحديث الحالة");
      queryClient.invalidateQueries({ queryKey: ["settings-warehouses"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteWarehouse = useMutation({
    mutationFn: async () => {
      if (!deleteTarget) return;
      const { error } = await supabase.from("warehouses").delete().eq("id", deleteTarget.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حذف المخزن");
      setIsDeleteOpen(false); setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["settings-warehouses"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-branches"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const getManagerName = (managerId: string | null) => {
    if (!managerId || !users) return "—";
    return users.find(u => u.user_id === managerId)?.full_name || "—";
  };

  const getBranchNames = (warehouseId: string) => {
    const linked = warehouseBranches?.filter(wb => wb.warehouse_id === warehouseId) || [];
    if (linked.length === 0) return "—";
    return linked.map(wb => branches?.find(b => b.id === wb.branch_id)?.name || "").filter(Boolean).join("، ") || "—";
  };

  const filtered = warehouses?.filter(w => {
    const matchSearch = w.name.includes(searchQuery) || w.code?.includes(searchQuery);
    const matchClass = filterClassification === "all" || w.classification === filterClassification;
    const matchStatus = filterStatus === "all" || (filterStatus === "active" ? w.active : !w.active);
    return matchSearch && matchClass && matchStatus;
  }) || [];

  return (
    <div className="space-y-6" dir="rtl">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="glass-card">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center">
              <Warehouse className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">إجمالي المخازن</p>
              <p className="text-2xl font-black text-foreground">{totalWarehouses}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">الفروع المرتبطة</p>
              <p className="text-2xl font-black text-foreground">{linkedBranchesCount}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card flex items-center justify-center">
          <CardContent className="p-5">
            <Button className="gradient-primary text-primary-foreground font-bold gap-2" onClick={openAdd}>
              <Plus className="h-5 w-5" /> إضافة مخزن جديد
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث بالاسم أو الكود..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pr-9" />
        </div>
        <Select value={filterClassification} onValueChange={setFilterClassification}>
          <SelectTrigger className="w-[180px]">
            <Filter className="h-4 w-4 ml-2" />
            <SelectValue placeholder="التصنيف" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل التصنيفات</SelectItem>
            {CLASSIFICATIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="الحالة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="active">نشط</SelectItem>
            <SelectItem value="inactive">متوقف</SelectItem>
          </SelectContent>
        </Select>
        <ExportButtons
          data={filtered.map((w: any) => ({ code: w.code || "—", name: w.name, classification: w.classification || "—", manager: getManagerName(w.manager_id), branches: getBranchNames(w.id), status: w.active ? "نشط" : "متوقف" }))}
          columns={[{ key: "code", label: "الكود" }, { key: "name", label: "الاسم" }, { key: "classification", label: "التصنيف" }, { key: "manager", label: "المسؤول" }, { key: "branches", label: "الفروع المرتبطة" }, { key: "status", label: "الحالة" }]}
          filename="المخازن"
          title="المخازن"
        />
      </div>

      {/* Table */}
      <Card className="glass-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الكود</TableHead>
                <TableHead className="text-right">الاسم</TableHead>
                <TableHead className="text-right">التصنيف</TableHead>
                <TableHead className="text-right">المسؤول</TableHead>
                <TableHead className="text-right">الفروع المرتبطة</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">جاري التحميل...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">لا يوجد مخازن</TableCell></TableRow>
              ) : (
                filtered.map(w => (
                  <TableRow key={w.id}>
                    <TableCell className="font-mono text-xs">{w.code || "—"}</TableCell>
                    <TableCell className="font-semibold">{w.name}</TableCell>
                    <TableCell className="text-sm">{w.classification || "—"}</TableCell>
                    <TableCell className="text-sm">{getManagerName(w.manager_id)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{getBranchNames(w.id)}</TableCell>
                    <TableCell>
                      <Badge variant={w.active ? "default" : "destructive"} className="text-xs">
                        {w.active ? "نشط" : "متوقف"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(w)}>
                            <Pencil className="h-4 w-4 ml-2" /> تعديل
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggleActive.mutate(w)}>
                            <ToggleLeft className="h-4 w-4 ml-2" /> {w.active ? "إيقاف" : "تفعيل"}
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => { setDeleteTarget(w); setIsDeleteOpen(true); }}>
                            <Trash2 className="h-4 w-4 ml-2" /> حذف
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={open => { if (!open) { setIsDialogOpen(false); resetForm(); } else setIsDialogOpen(true); }}>
        <DialogContent className="max-w-md max-h-[90vh]" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editWarehouse ? "تعديل المخزن" : "إضافة مخزن جديد"}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[65vh] pr-3">
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>اسم المخزن *</Label>
                <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="مثال: المخزن الرئيسي" />
              </div>
              <div className="space-y-2">
                <Label>تصنيف المخزن</Label>
                <Select value={formClassification} onValueChange={setFormClassification}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CLASSIFICATIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>مسؤول المخزن</Label>
                <Select value={formManagerId} onValueChange={setFormManagerId}>
                  <SelectTrigger><SelectValue placeholder="اختر مسؤول المخزن" /></SelectTrigger>
                  <SelectContent>
                    {users?.map(u => (
                      <SelectItem key={u.user_id} value={u.user_id}>{u.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label className="text-base font-bold">ربط الفروع</Label>
                <p className="text-xs text-muted-foreground">اختر الفروع التي تريد ربطها بهذا المخزن</p>
                <div className="space-y-2">
                  {branches?.map(branch => (
                    <label key={branch.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                      <Checkbox
                        checked={formLinkedBranches.includes(branch.id)}
                        onCheckedChange={() => toggleLinkedBranch(branch.id)}
                      />
                      <span className="text-sm">{branch.name}</span>
                    </label>
                  ))}
                  {(!branches || branches.length === 0) && (
                    <p className="text-xs text-muted-foreground text-center py-2">لا يوجد فروع نشطة</p>
                  )}
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <Label>حالة المخزن</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{formActive ? "نشط" : "متوقف"}</span>
                  <Switch checked={formActive} onCheckedChange={setFormActive} />
                </div>
              </div>
            </div>
          </ScrollArea>
          <div className="flex gap-2 pt-2 border-t border-border">
            <Button className="flex-1 gradient-primary text-primary-foreground font-bold" onClick={() => saveWarehouse.mutate()} disabled={saveWarehouse.isPending}>
              {saveWarehouse.isPending ? "جاري الحفظ..." : "حفظ"}
            </Button>
            <Button variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>إلغاء</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المخزن</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف المخزن "{deleteTarget?.name}"؟</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteWarehouse.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Limit Reached Dialog */}
      <Dialog open={isLimitDialogOpen} onOpenChange={setIsLimitDialogOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="h-5 w-5" />
              تم الوصول للحد الأقصى
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              لقد وصلت للحد الأقصى المسموح به في خطتك الحالية:
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl border border-border/50 bg-muted/30 text-center">
                <p className="text-xs text-muted-foreground">حد الفروع</p>
                <p className="text-2xl font-black text-foreground">{maxBranches}</p>
              </div>
              <div className="p-3 rounded-xl border border-border/50 bg-muted/30 text-center">
                <p className="text-xs text-muted-foreground">حد المخازن</p>
                <p className="text-2xl font-black text-foreground">{maxWarehouses}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              يمكنك طلب ترقية حسابك لزيادة الحدود عبر الواتساب.
            </p>
            <Button
              className="w-full gap-2 gradient-primary text-primary-foreground font-bold"
              onClick={sendUpgradeRequest}
              disabled={upgradeLoading}
            >
              <MessageCircle className="h-5 w-5" />
              {upgradeLoading ? "جاري الإرسال..." : "إرسال طلب ترقية"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
