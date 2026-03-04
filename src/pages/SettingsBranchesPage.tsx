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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Building2, MapPin, Plus, MoreHorizontal, Pencil, Trash2, ToggleLeft, Search, MessageCircle, AlertTriangle
} from "lucide-react";

export const SettingsBranchesPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const queryClient = useQueryClient();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editBranch, setEditBranch] = useState<any>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLimitDialogOpen, setIsLimitDialogOpen] = useState(false);

  // Form
  const [formName, setFormName] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formManagerId, setFormManagerId] = useState("");
  const [formActive, setFormActive] = useState(true);

  const { data: branches, isLoading } = useQuery({
    queryKey: ["settings-branches", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: companyData } = useQuery({
    queryKey: ["company-data-full", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").eq("id", companyId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: warehouseCount } = useQuery({
    queryKey: ["warehouse-count", companyId],
    queryFn: async () => {
      const { count, error } = await supabase.from("warehouses").select("id", { count: "exact", head: true }).eq("company_id", companyId!);
      if (error) throw error;
      return count || 0;
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

  const totalBranches = branches?.length || 0;
  const addressCount = branches?.filter(b => b.address).length || 0;
  const maxBranches = companyData?.max_branches ?? 999;
  const maxWarehouses = companyData?.max_warehouses ?? 999;

  const resetForm = () => {
    setFormName(""); setFormAddress(""); setFormManagerId(""); setFormActive(true); setEditBranch(null);
  };

  const openAdd = () => {
    if (totalBranches >= maxBranches && !auth.isAdmin) {
      setIsLimitDialogOpen(true);
      return;
    }
    resetForm(); setIsDialogOpen(true);
  };
  const openEdit = (b: any) => {
    setEditBranch(b);
    setFormName(b.name);
    setFormAddress(b.address || "");
    setFormManagerId(b.manager_id || "");
    setFormActive(b.active);
    setIsDialogOpen(true);
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

  const saveBranch = useMutation({
    mutationFn: async () => {
      if (!formName.trim()) throw new Error("اسم الفرع مطلوب");
      if (editBranch) {
        const { error } = await supabase.from("branches").update({
          name: formName, address: formAddress || null,
          manager_id: formManagerId || null, active: formActive,
        }).eq("id", editBranch.id);
        if (error) throw error;
      } else {
        const { data: code } = await supabase.rpc("generate_branch_code", { p_company_id: companyId! });
        const { error } = await supabase.from("branches").insert({
          name: formName, address: formAddress || null,
          manager_id: formManagerId || null, active: formActive,
          company_id: companyId!, code,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editBranch ? "تم تحديث الفرع" : "تم إضافة الفرع");
      setIsDialogOpen(false); resetForm();
      queryClient.invalidateQueries({ queryKey: ["settings-branches"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async (branch: any) => {
      const { error } = await supabase.from("branches").update({ active: !branch.active }).eq("id", branch.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تحديث الحالة");
      queryClient.invalidateQueries({ queryKey: ["settings-branches"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteBranch = useMutation({
    mutationFn: async () => {
      if (!deleteTarget) return;
      await supabase.from("categories").update({ branch_id: null }).eq("branch_id", deleteTarget.id);
      await supabase.from("profiles").update({ branch_id: null }).eq("branch_id", deleteTarget.id);
      await supabase.from("warehouse_branches").delete().eq("branch_id", deleteTarget.id);
      const { error } = await supabase.from("branches").delete().eq("id", deleteTarget.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حذف الفرع");
      setIsDeleteOpen(false); setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["settings-branches"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const getManagerName = (managerId: string | null) => {
    if (!managerId || !users) return "—";
    return users.find(u => u.user_id === managerId)?.full_name || "—";
  };

  const filtered = branches?.filter(b =>
    b.name.includes(searchQuery) || b.code?.includes(searchQuery) || b.address?.includes(searchQuery)
  ) || [];

  return (
    <div className="space-y-6" dir="rtl">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="glass-card">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center">
              <Building2 className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">إجمالي الفروع</p>
              <p className="text-2xl font-black text-foreground">{totalBranches}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center">
              <MapPin className="h-6 w-6 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">التغطية الجغرافية</p>
              <p className="text-2xl font-black text-foreground">{addressCount} عنوان</p>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card flex items-center justify-center">
          <CardContent className="p-5">
            <Button className="gradient-primary text-primary-foreground font-bold gap-2" onClick={openAdd}>
              <Plus className="h-5 w-5" /> إضافة فرع جديد
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="بحث بالاسم أو الكود أو العنوان..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pr-9" />
      </div>

      {/* Table */}
      <Card className="glass-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الكود</TableHead>
                <TableHead className="text-right">الاسم</TableHead>
                <TableHead className="text-right">العنوان</TableHead>
                <TableHead className="text-right">المدير</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">جاري التحميل...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">لا يوجد فروع</TableCell></TableRow>
              ) : (
                filtered.map(branch => (
                  <TableRow key={branch.id}>
                    <TableCell className="font-mono text-xs">{branch.code || "—"}</TableCell>
                    <TableCell className="font-semibold">{branch.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{branch.address || "—"}</TableCell>
                    <TableCell className="text-sm">{getManagerName(branch.manager_id)}</TableCell>
                    <TableCell>
                      <Badge variant={branch.active ? "default" : "destructive"} className="text-xs">
                        {branch.active ? "نشط" : "متوقف"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(branch)}>
                            <Pencil className="h-4 w-4 ml-2" /> تعديل
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggleActive.mutate(branch)}>
                            <ToggleLeft className="h-4 w-4 ml-2" /> {branch.active ? "إيقاف" : "تفعيل"}
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => { setDeleteTarget(branch); setIsDeleteOpen(true); }}>
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
            <DialogTitle>{editBranch ? "تعديل الفرع" : "إضافة فرع جديد"}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[65vh] pr-3">
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>اسم الفرع *</Label>
                <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="مثال: الفرع الرئيسي" />
              </div>
              <div className="space-y-2">
                <Label>عنوان الفرع</Label>
                <Input value={formAddress} onChange={e => setFormAddress(e.target.value)} placeholder="مثال: شارع التحرير، القاهرة" />
              </div>
              <div className="space-y-2">
                <Label>مدير الفرع</Label>
                <Select value={formManagerId} onValueChange={setFormManagerId}>
                  <SelectTrigger><SelectValue placeholder="اختر مدير الفرع" /></SelectTrigger>
                  <SelectContent>
                    {users?.map(u => (
                      <SelectItem key={u.user_id} value={u.user_id}>{u.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label>حالة الفرع</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{formActive ? "نشط" : "مغلق"}</span>
                  <Switch checked={formActive} onCheckedChange={setFormActive} />
                </div>
              </div>
            </div>
          </ScrollArea>
          <div className="flex gap-2 pt-2 border-t border-border">
            <Button className="flex-1 gradient-primary text-primary-foreground font-bold" onClick={() => saveBranch.mutate()} disabled={saveBranch.isPending}>
              {saveBranch.isPending ? "جاري الحفظ..." : "حفظ"}
            </Button>
            <Button variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>إلغاء</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الفرع</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف الفرع "{deleteTarget?.name}"؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteBranch.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              حذف
            </AlertDialogAction>
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
