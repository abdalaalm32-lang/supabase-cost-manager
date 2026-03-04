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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  Building2, Plus, ChevronDown, ChevronUp, Users, Eye, KeyRound, Trash2, UserCheck, Settings2, RotateCcw, AlertTriangle
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const ALL_PERMISSIONS = [
  { key: "dashboard", label: "لوحة التحكم" },
  { key: "pos", label: "نقطة البيع (POS)" },
  { key: "inventory", label: "إدارة المخزون" },
  { key: "transfers", label: "أذونات الصرف والتحويل" },
  { key: "stocktake", label: "جرد المخزون" },
  { key: "recipes", label: "الوصفات والإنتاج" },
  { key: "production", label: "عمليات الإنتاج" },
  { key: "waste", label: "الهالك" },
  { key: "purchases", label: "المشتريات" },
  { key: "costing", label: "تحليل التكاليف" },
  { key: "menu-costing", label: "تكلفة المنيو" },
  { key: "menu-engineering", label: "هندسة المنيو" },
  { key: "cost-adjustment", label: "تعديل التكاليف" },
  { key: "reports", label: "التقارير" },
  { key: "settings", label: "الإعدادات" },
];

export const AdminCompaniesPage: React.FC = () => {
  const { auth } = useAuth();
  const queryClient = useQueryClient();
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const [isAddCompanyOpen, setIsAddCompanyOpen] = useState(false);
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);

  // Add company form
  const [companyName, setCompanyName] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [maxBranches, setMaxBranches] = useState(2);
  const [maxWarehouses, setMaxWarehouses] = useState(1);

  // Edit user form
  const [editFormPermissions, setEditFormPermissions] = useState<string[]>([]);
  const [editFormStatus, setEditFormStatus] = useState(true);

  // Password dialog
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [passwordTargetUser, setPasswordTargetUser] = useState<any>(null);
  const [newPassword, setNewPassword] = useState("");

  // Delete dialog
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteTargetUser, setDeleteTargetUser] = useState<any>(null);

  // Reset data dialog
  const [resetStep, setResetStep] = useState(0);
  const [resetTargetCompany, setResetTargetCompany] = useState<any>(null);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  // Fetch all companies (admin only)
  const { data: companies, isLoading } = useQuery({
    queryKey: ["admin-companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: auth.isAdmin,
  });

  // Fetch all profiles for expanded company
  const { data: companyProfiles } = useQuery({
    queryKey: ["admin-company-profiles", expandedCompany],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*, branches:branch_id(name), job_roles:job_role_id(name)")
        .eq("company_id", expandedCompany!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!expandedCompany,
  });

  const createCompany = useMutation({
    mutationFn: async () => {
      if (!companyName || !ownerEmail || !ownerPassword || !ownerName) throw new Error("جميع الحقول مطلوبة");
      const res = await supabase.functions.invoke("create-company", {
        body: {
          company_name: companyName,
          company_code: companyCode || undefined,
          owner_email: ownerEmail,
          owner_password: ownerPassword,
          owner_name: ownerName,
          max_branches: maxBranches,
          max_warehouses: maxWarehouses,
        },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: () => {
      toast.success("تم إنشاء الشركة والمالك بنجاح");
      setIsAddCompanyOpen(false);
      resetAddForm();
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleCompanyActive = useMutation({
    mutationFn: async ({ companyId, active }: { companyId: string; active: boolean }) => {
      // Update company active status
      const { error } = await supabase
        .from("companies")
        .update({ active })
        .eq("id", companyId);
      if (error) throw error;

      // If deactivating, suspend all users
      if (!active) {
        const { error: profileError } = await supabase
          .from("profiles")
          .update({ status: "موقف" })
          .eq("company_id", companyId);
        if (profileError) throw profileError;
      }
    },
    onSuccess: (_, { active }) => {
      toast.success(active ? "تم تفعيل الشركة" : "تم تعطيل الشركة وجميع مستخدميها");
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      queryClient.invalidateQueries({ queryKey: ["admin-company-profiles"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateCompanyLimits = useMutation({
    mutationFn: async ({ companyId, max_branches, max_warehouses }: { companyId: string; max_branches: number; max_warehouses: number }) => {
      const { error } = await supabase
        .from("companies")
        .update({ max_branches, max_warehouses })
        .eq("id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تحديث الحدود");
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateUserFromAdmin = useMutation({
    mutationFn: async () => {
      if (!editingUser) return;
      const { error } = await supabase
        .from("profiles")
        .update({
          status: editFormStatus ? "نشط" : "موقف",
          permissions: editFormPermissions,
        })
        .eq("id", editingUser.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تحديث المستخدم");
      setIsEditUserOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin-company-profiles"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const changePassword = useMutation({
    mutationFn: async () => {
      if (!passwordTargetUser || !newPassword) throw new Error("كلمة المرور مطلوبة");
      const res = await supabase.functions.invoke("manage-user", {
        body: { action: "change_password", target_user_id: passwordTargetUser.user_id, new_password: newPassword },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      toast.success("تم تغيير كلمة المرور");
      setIsPasswordDialogOpen(false);
      setNewPassword("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteUser = useMutation({
    mutationFn: async () => {
      if (!deleteTargetUser) return;
      const res = await supabase.functions.invoke("manage-user", {
        body: { action: "delete_user", target_user_id: deleteTargetUser.user_id },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      toast.success("تم حذف المستخدم");
      setIsDeleteDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin-company-profiles"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleResetData = async () => {
    if (resetConfirmText !== "تصفير" || !resetTargetCompany) return;
    setIsResetting(true);
    try {
      const res = await supabase.functions.invoke("reset-company-data", {
        body: { company_id: resetTargetCompany.id },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      toast.success("تم تصفير بيانات الشركة");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsResetting(false);
      setResetStep(0);
      setResetTargetCompany(null);
      setResetConfirmText("");
    }
  };

  const resetAddForm = () => {
    setCompanyName("");
    setCompanyCode("");
    setOwnerName("");
    setOwnerEmail("");
    setOwnerPassword("");
    setMaxBranches(2);
    setMaxWarehouses(1);
  };

  const openEditUser = (user: any) => {
    setEditingUser(user);
    setEditFormPermissions(user.permissions || ["dashboard"]);
    setEditFormStatus(user.status === "نشط");
    setIsEditUserOpen(true);
  };

  const togglePermission = (key: string) => {
    setEditFormPermissions((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-foreground">إدارة الشركات</h2>
          <p className="text-sm text-muted-foreground">إضافة وإدارة الشركات والمستخدمين</p>
        </div>
        <Button className="gradient-primary text-primary-foreground font-bold gap-2" onClick={() => setIsAddCompanyOpen(true)}>
          <Plus className="h-5 w-5" />
          إضافة شركة جديدة
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="glass-card">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center">
              <Building2 className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">إجمالي الشركات</p>
              <p className="text-2xl font-black text-foreground">{companies?.length || 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">الشركات النشطة</p>
              <p className="text-2xl font-black text-foreground">{companies?.filter((c: any) => c.active).length || 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Companies List */}
      <div className="space-y-3">
        {isLoading ? (
          <p className="text-center text-muted-foreground py-10">جاري التحميل...</p>
        ) : companies?.length === 0 ? (
          <p className="text-center text-muted-foreground py-10">لا توجد شركات</p>
        ) : (
          companies?.map((company: any) => (
            <Card key={company.id} className={cn("glass-card", !company.active && "opacity-60")}>
              <CardContent className="p-0">
                <Collapsible
                  open={expandedCompany === company.id}
                  onOpenChange={(open) => setExpandedCompany(open ? company.id : null)}
                >
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors rounded-xl">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
                          <Building2 className="h-5 w-5 text-primary-foreground" />
                        </div>
                        <div className="text-start">
                          <p className="font-bold text-foreground">{company.name}</p>
                          <p className="text-xs text-muted-foreground">{company.code}</p>
                        </div>
                        <Badge variant={company.active ? "default" : "destructive"} className="text-xs">
                          {company.active ? "نشط" : "معطل"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          الحد: {company.max_branches} فروع / {company.max_warehouses} مخازن
                        </span>
                      </div>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-orange-600 hover:text-orange-700"
                          title="تصفير البيانات"
                          onClick={() => {
                            setResetTargetCompany(company);
                            setResetStep(1);
                            setResetConfirmText("");
                          }}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">{company.active ? "نشط" : "معطل"}</span>
                          <Switch
                            checked={company.active}
                            onCheckedChange={(checked) => toggleCompanyActive.mutate({ companyId: company.id, active: checked })}
                            dir="ltr"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <Label className="text-xs">فروع:</Label>
                          <Input
                            type="number"
                            className="w-14 h-7 text-xs text-center"
                            value={company.max_branches}
                            onChange={(e) => updateCompanyLimits.mutate({ companyId: company.id, max_branches: Number(e.target.value), max_warehouses: company.max_warehouses })}
                            min={0}
                          />
                          <Label className="text-xs mr-2">مخازن:</Label>
                          <Input
                            type="number"
                            className="w-14 h-7 text-xs text-center"
                            value={company.max_warehouses}
                            onChange={(e) => updateCompanyLimits.mutate({ companyId: company.id, max_branches: company.max_branches, max_warehouses: Number(e.target.value) })}
                            min={0}
                          />
                        </div>
                        {expandedCompany === company.id ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t border-border/30 p-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-right">الكود</TableHead>
                            <TableHead className="text-right">الاسم</TableHead>
                            <TableHead className="text-right">البريد</TableHead>
                            <TableHead className="text-right">الدور</TableHead>
                            <TableHead className="text-right">الحالة</TableHead>
                            <TableHead className="text-right">إجراءات</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {companyProfiles?.map((user: any) => (
                            <TableRow key={user.id}>
                              <TableCell className="font-mono text-xs">{user.user_code || "—"}</TableCell>
                              <TableCell className="font-semibold">{user.full_name}</TableCell>
                              <TableCell className="text-xs text-muted-foreground" dir="ltr">{user.email}</TableCell>
                              <TableCell>{user.role}</TableCell>
                              <TableCell>
                                <Badge variant={user.status === "نشط" ? "default" : "destructive"} className="text-xs">
                                  {user.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Button variant="ghost" size="sm" onClick={() => openEditUser(user)}>
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => {
                                    setPasswordTargetUser(user);
                                    setNewPassword("");
                                    setIsPasswordDialogOpen(true);
                                  }}>
                                    <KeyRound className="h-4 w-4" />
                                  </Button>
                                  {user.user_id !== auth.user?.id && (
                                    <Button
                                      variant="ghost" size="sm"
                                      className="text-destructive hover:text-destructive"
                                      onClick={() => { setDeleteTargetUser(user); setIsDeleteDialogOpen(true); }}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                          {(!companyProfiles || companyProfiles.length === 0) && (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center text-muted-foreground py-4">لا يوجد مستخدمين</TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Add Company Dialog */}
      <Dialog open={isAddCompanyOpen} onOpenChange={(open) => { if (!open) { setIsAddCompanyOpen(false); resetAddForm(); } else setIsAddCompanyOpen(true); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col" dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة شركة جديدة</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0 max-h-[60vh] px-1">
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>اسم الشركة *</Label>
                <Input className="glass-input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="اسم الشركة" />
              </div>
              <div className="space-y-2">
                <Label>كود الشركة (اختياري)</Label>
                <Input className="glass-input" value={companyCode} onChange={(e) => setCompanyCode(e.target.value)} placeholder="GSC-XXXX" dir="ltr" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>حد الفروع</Label>
                  <Input type="number" className="glass-input" value={maxBranches} onChange={(e) => setMaxBranches(Number(e.target.value))} min={0} />
                </div>
                <div className="space-y-2">
                  <Label>حد المخازن</Label>
                  <Input type="number" className="glass-input" value={maxWarehouses} onChange={(e) => setMaxWarehouses(Number(e.target.value))} min={0} />
                </div>
              </div>
              <div className="border-t border-border pt-4 space-y-4">
                <h3 className="font-bold text-sm">بيانات المالك</h3>
                <div className="space-y-2">
                  <Label>اسم المالك *</Label>
                  <Input className="glass-input" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="اسم المالك" />
                </div>
                <div className="space-y-2">
                  <Label>البريد الإلكتروني *</Label>
                  <Input className="glass-input" type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="email@example.com" dir="ltr" />
                </div>
                <div className="space-y-2">
                  <Label>كلمة المرور *</Label>
                  <Input className="glass-input" type="password" value={ownerPassword} onChange={(e) => setOwnerPassword(e.target.value)} placeholder="كلمة المرور" dir="ltr" />
                </div>
              </div>
            </div>
          </ScrollArea>
          <div className="flex gap-2 pt-3 border-t border-border">
            <Button className="flex-1 gradient-primary text-primary-foreground font-bold" onClick={() => createCompany.mutate()} disabled={createCompany.isPending}>
              {createCompany.isPending ? "جاري الإنشاء..." : "إنشاء الشركة"}
            </Button>
            <Button variant="outline" onClick={() => { setIsAddCompanyOpen(false); resetAddForm(); }}>إلغاء</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={isEditUserOpen} onOpenChange={setIsEditUserOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col" dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل المستخدم: {editingUser?.full_name}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0 max-h-[60vh] px-1">
            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-muted/30">
                <Label>حالة الحساب</Label>
                <div className="flex items-center gap-2">
                  <span className={cn("text-sm", editFormStatus ? "text-success" : "text-destructive")}>
                    {editFormStatus ? "نشط" : "موقف"}
                  </span>
                  <Switch checked={editFormStatus} onCheckedChange={setEditFormStatus} dir="ltr" />
                </div>
              </div>

              <div className="space-y-3">
                <Label className="font-bold">صلاحيات الوصول</Label>
                <div className="space-y-2">
                  {ALL_PERMISSIONS.map((perm) => (
                    <div
                      key={perm.key}
                      className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-muted/30 cursor-pointer hover:border-primary/30 transition-colors"
                      onClick={() => togglePermission(perm.key)}
                    >
                      <Checkbox checked={editFormPermissions.includes(perm.key)} onCheckedChange={() => togglePermission(perm.key)} />
                      <span className="text-sm font-medium">{perm.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
          <div className="flex gap-2 pt-3 border-t border-border">
            <Button className="flex-1 gradient-primary text-primary-foreground font-bold" onClick={() => updateUserFromAdmin.mutate()} disabled={updateUserFromAdmin.isPending}>
              حفظ التعديلات
            </Button>
            <Button variant="outline" onClick={() => setIsEditUserOpen(false)}>إلغاء</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Password Dialog */}
      <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>تغيير كلمة المرور</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">المستخدم: <strong>{passwordTargetUser?.full_name}</strong></p>
          <div className="space-y-2">
            <Label>كلمة المرور الجديدة</Label>
            <Input className="glass-input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} dir="ltr" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button className="flex-1 gradient-primary text-primary-foreground font-bold" onClick={() => changePassword.mutate()} disabled={changePassword.isPending || !newPassword}>تغيير</Button>
            <Button variant="outline" onClick={() => setIsPasswordDialogOpen(false)}>إلغاء</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف المستخدم</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف <strong>{deleteTargetUser?.full_name}</strong>؟</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => deleteUser.mutate()} disabled={deleteUser.isPending}>حذف</AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Data Dialogs */}
      <AlertDialog open={resetStep === 1} onOpenChange={(open) => { if (!open) { setResetStep(0); setResetTargetCompany(null); } }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-orange-600"><AlertTriangle className="h-5 w-5" />تصفير بيانات الشركة</AlertDialogTitle>
            <AlertDialogDescription>سيتم تصفير جميع البيانات التشغيلية لشركة <strong>{resetTargetCompany?.name}</strong>. هذا لا يمكن التراجع عنه!</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction className="bg-orange-600 text-white" onClick={(e) => { e.preventDefault(); setResetStep(2); }}>متابعة</AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={resetStep === 2} onOpenChange={(open) => { if (!open) { setResetStep(0); setResetTargetCompany(null); } }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">تأكيد نهائي</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد تماماً من تصفير بيانات <strong>{resetTargetCompany?.name}</strong>؟</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={(e) => { e.preventDefault(); setResetStep(3); }}>نعم</AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={resetStep === 3} onOpenChange={(open) => { if (!open) { setResetStep(0); setResetTargetCompany(null); setResetConfirmText(""); } }}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle className="text-destructive">اكتب "تصفير" للتأكيد</DialogTitle></DialogHeader>
          <Input value={resetConfirmText} onChange={(e) => setResetConfirmText(e.target.value)} placeholder='اكتب "تصفير"' className="text-center text-lg font-bold" />
          <div className="flex gap-2 pt-2">
            <Button className="flex-1 bg-destructive text-destructive-foreground font-bold" onClick={handleResetData} disabled={resetConfirmText !== "تصفير" || isResetting}>
              {isResetting ? "جاري التصفير..." : "تصفير نهائي"}
            </Button>
            <Button variant="outline" onClick={() => { setResetStep(0); setResetConfirmText(""); }}>إلغاء</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
