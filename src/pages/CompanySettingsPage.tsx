/* eslint-disable @typescript-eslint/no-explicit-any */
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Users, UserCheck, Plus, Eye, CalendarIcon, Clock, KeyRound, Trash2, AlertTriangle, RotateCcw, Building2, Briefcase, X, Pencil
} from "lucide-react";

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
  { key: "settings", label: "إعدادات الشركة" },
];

export const CompanySettingsPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const queryClient = useQueryClient();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"account" | "permissions">("account");
  const [detailUser, setDetailUser] = useState<any>(null);

  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [passwordTargetUser, setPasswordTargetUser] = useState<any>(null);
  const [newPassword, setNewPassword] = useState("");

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteTargetUser, setDeleteTargetUser] = useState<any>(null);

  const [resetStep, setResetStep] = useState(0);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formJobRoleId, setFormJobRoleId] = useState("");
  const [formBranchId, setFormBranchId] = useState("");
  const [formStatus, setFormStatus] = useState(true);
  const [formPermissions, setFormPermissions] = useState<string[]>(["dashboard"]);
  const [formSubscriptionType, setFormSubscriptionType] = useState("unlimited");
  const [formSubscriptionMinutes, setFormSubscriptionMinutes] = useState<number | "">("");
  const [formSubscriptionStart, setFormSubscriptionStart] = useState<Date | undefined>();
  const [formSubscriptionEnd, setFormSubscriptionEnd] = useState<Date | undefined>();

  // Company name edit
  const [isEditCompanyName, setIsEditCompanyName] = useState(false);
  const [editCompanyName, setEditCompanyName] = useState("");

  // Job roles management
  const [newJobRoleName, setNewJobRoleName] = useState("");
  const [editingJobRole, setEditingJobRole] = useState<any>(null);
  const [editJobRoleName, setEditJobRoleName] = useState("");

  const { data: profiles, isLoading } = useQuery({
    queryKey: ["company-users", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*, branches:branch_id(name), job_roles:job_role_id(name)")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: branches } = useQuery({
    queryKey: ["branches", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").eq("company_id", companyId!).eq("active", true);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: jobRoles } = useQuery({
    queryKey: ["job-roles", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("job_roles").select("*").eq("company_id", companyId!).eq("active", true);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: allJobRoles } = useQuery({
    queryKey: ["all-job-roles", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("job_roles").select("*").eq("company_id", companyId!).order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: companyData } = useQuery({
    queryKey: ["company", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").eq("id", companyId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const totalUsers = profiles?.length || 0;
  const activeUsers = profiles?.filter((p) => p.status === "نشط").length || 0;

  const resetForm = () => {
    setFormName(""); setFormEmail(""); setFormPassword(""); setFormJobRoleId(""); setFormBranchId("");
    setFormStatus(true); setFormPermissions(["dashboard"]); setFormSubscriptionType("unlimited");
    setFormSubscriptionMinutes(""); setFormSubscriptionStart(undefined); setFormSubscriptionEnd(undefined);
    setActiveTab("account"); setDetailUser(null);
  };

  const openAddDialog = () => { resetForm(); setIsDialogOpen(true); };

  const openDetailDialog = (user: any) => {
    setDetailUser(user);
    setFormName(user.full_name); setFormEmail(user.email); setFormPassword("");
    setFormJobRoleId(user.job_role_id || ""); setFormBranchId(user.branch_id || "");
    setFormStatus(user.status === "نشط"); setFormPermissions(user.permissions || ["dashboard"]);
    setFormSubscriptionType(user.subscription_type || "unlimited");
    setFormSubscriptionMinutes(user.subscription_minutes || "");
    setFormSubscriptionStart(user.subscription_start ? new Date(user.subscription_start) : undefined);
    setFormSubscriptionEnd(user.subscription_end ? new Date(user.subscription_end) : undefined);
    setActiveTab("account"); setIsDialogOpen(true);
  };

  const togglePermission = (key: string) => {
    setFormPermissions((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  };

  const createUser = useMutation({
    mutationFn: async () => {
      if (!formName || !formEmail || !formPassword) throw new Error("الاسم والبريد وكلمة المرور مطلوبين");
      
      // Check email uniqueness
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", formEmail)
        .maybeSingle();
      if (existingProfile) throw new Error("هذا البريد الإلكتروني مستخدم بالفعل");

      const { data: userCode } = await supabase.rpc("generate_user_code", { p_company_id: companyId! });
      const res = await supabase.functions.invoke("create-admin-user", {
        body: {
          email: formEmail, password: formPassword, full_name: formName, company_id: companyId,
          role: "مستخدم", permissions: formPermissions, branch_id: formBranchId || null,
          job_role_id: formJobRoleId || null, user_code: userCode,
          status: formStatus ? "نشط" : "موقف", subscription_type: formSubscriptionType,
          subscription_minutes: formSubscriptionType === "minutes" ? formSubscriptionMinutes : null,
          subscription_start: formSubscriptionType === "date_range" && formSubscriptionStart ? formSubscriptionStart.toISOString() : null,
          subscription_end: formSubscriptionType === "date_range" && formSubscriptionEnd ? formSubscriptionEnd.toISOString() : null,
        },
      });
      if (res.error) throw new Error(res.error.message || "حدث خطأ");
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      toast.success("تم إضافة المستخدم بنجاح");
      setIsDialogOpen(false); resetForm();
      queryClient.invalidateQueries({ queryKey: ["company-users"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateUser = useMutation({
    mutationFn: async () => {
      if (!detailUser) return;
      const { error } = await supabase.from("profiles").update({
        full_name: formName, branch_id: formBranchId || null, job_role_id: formJobRoleId || null,
        status: formStatus ? "نشط" : "موقف", permissions: formPermissions,
        subscription_type: formSubscriptionType,
        subscription_minutes: formSubscriptionType === "minutes" ? (formSubscriptionMinutes as number) : null,
        subscription_start: formSubscriptionType === "date_range" && formSubscriptionStart ? formSubscriptionStart.toISOString() : null,
        subscription_end: formSubscriptionType === "date_range" && formSubscriptionEnd ? formSubscriptionEnd.toISOString() : null,
      }).eq("id", detailUser.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تحديث المستخدم");
      setIsDialogOpen(false); resetForm();
      queryClient.invalidateQueries({ queryKey: ["company-users"] });
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
      setIsPasswordDialogOpen(false); setNewPassword("");
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
      queryClient.invalidateQueries({ queryKey: ["company-users"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateCompanyName = useMutation({
    mutationFn: async () => {
      if (!editCompanyName.trim()) throw new Error("اسم الشركة مطلوب");
      // Owner can update company name - need edge function since RLS restricts to admin
      // For now, owners who are also admins can update. Otherwise we use the manage-user edge function pattern
      const { error } = await supabase.from("companies").update({ name: editCompanyName }).eq("id", companyId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تحديث اسم الشركة");
      setIsEditCompanyName(false);
      queryClient.invalidateQueries({ queryKey: ["company"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleResetData = async () => {
    if (resetConfirmText !== "تصفير") return;
    setIsResetting(true);
    try {
      const res = await supabase.functions.invoke("reset-company-data", {
        body: { company_id: companyId },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      toast.success("تم تصفير جميع البيانات بنجاح");
      queryClient.invalidateQueries();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsResetting(false); setResetStep(0); setResetConfirmText("");
    }
  };

  const handleSave = () => { detailUser ? updateUser.mutate() : createUser.mutate(); };

  // Job role CRUD
  const addJobRole = useMutation({
    mutationFn: async () => {
      if (!newJobRoleName.trim()) throw new Error("اسم الدور مطلوب");
      const { error } = await supabase.from("job_roles").insert({ company_id: companyId!, name: newJobRoleName.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم إضافة الدور الوظيفي");
      setNewJobRoleName("");
      queryClient.invalidateQueries({ queryKey: ["all-job-roles"] });
      queryClient.invalidateQueries({ queryKey: ["job-roles"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateJobRole = useMutation({
    mutationFn: async () => {
      if (!editingJobRole || !editJobRoleName.trim()) throw new Error("اسم الدور مطلوب");
      const { error } = await supabase.from("job_roles").update({ name: editJobRoleName.trim() }).eq("id", editingJobRole.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تعديل الدور الوظيفي");
      setEditingJobRole(null);
      queryClient.invalidateQueries({ queryKey: ["all-job-roles"] });
      queryClient.invalidateQueries({ queryKey: ["job-roles"] });
      queryClient.invalidateQueries({ queryKey: ["company-users"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleJobRoleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("job_roles").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-job-roles"] });
      queryClient.invalidateQueries({ queryKey: ["job-roles"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteJobRole = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("job_roles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حذف الدور الوظيفي");
      queryClient.invalidateQueries({ queryKey: ["all-job-roles"] });
      queryClient.invalidateQueries({ queryKey: ["job-roles"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6" dir="rtl">
      {/* Company Info */}
      <Card className="glass-card">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center">
                <Building2 className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                {isEditCompanyName ? (
                  <div className="flex items-center gap-2">
                    <Input className="glass-input w-60" value={editCompanyName} onChange={(e) => setEditCompanyName(e.target.value)} />
                    <Button size="sm" onClick={() => updateCompanyName.mutate()}>حفظ</Button>
                    <Button size="sm" variant="ghost" onClick={() => setIsEditCompanyName(false)}>إلغاء</Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-black text-foreground">{companyData?.name || "—"}</h2>
                    <Button size="sm" variant="ghost" onClick={() => { setEditCompanyName(companyData?.name || ""); setIsEditCompanyName(true); }}>تعديل</Button>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">كود: {companyData?.code || "—"}</p>
              </div>
            </div>
            <Button
              variant="outline"
              className="text-orange-600 border-orange-300 hover:bg-orange-50 gap-2"
              onClick={() => { setResetStep(1); setResetConfirmText(""); }}
            >
              <RotateCcw className="h-4 w-4" />
              تصفير البيانات
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="glass-card">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center">
              <Users className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">إجمالي المستخدمين</p>
              <p className="text-2xl font-black text-foreground">{totalUsers}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center">
              <UserCheck className="h-6 w-6 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">المستخدمين النشطين</p>
              <p className="text-2xl font-black text-foreground">{activeUsers}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card flex items-center justify-center">
          <CardContent className="p-5">
            <Button className="gradient-primary text-primary-foreground font-bold gap-2" onClick={openAddDialog}>
              <Plus className="h-5 w-5" />
              إضافة مستخدم جديد
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <Card className="glass-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الكود</TableHead>
                <TableHead className="text-right">الاسم</TableHead>
                <TableHead className="text-right">البريد</TableHead>
                <TableHead className="text-right">الدور</TableHead>
                <TableHead className="text-right">الفرع</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">جاري التحميل...</TableCell></TableRow>
              ) : profiles?.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">لا يوجد مستخدمين</TableCell></TableRow>
              ) : (
                profiles?.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-mono text-xs">{user.user_code || "—"}</TableCell>
                    <TableCell className="font-semibold">{user.full_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground" dir="ltr">{user.email}</TableCell>
                    <TableCell>{(user.job_roles as any)?.name || user.role}</TableCell>
                    <TableCell>{(user.branches as any)?.name || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={user.status === "نشط" ? "default" : "destructive"} className="text-xs">{user.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openDetailDialog(user)}><Eye className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => { setPasswordTargetUser(user); setNewPassword(""); setIsPasswordDialogOpen(true); }}>
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        {user.user_id !== auth.user?.id && (
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { setDeleteTargetUser(user); setIsDeleteDialogOpen(true); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add/Edit User Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) { setIsDialogOpen(false); resetForm(); } else setIsDialogOpen(true); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" dir="rtl">
          <DialogHeader>
            <DialogTitle>{detailUser ? "تعديل المستخدم" : "إضافة مستخدم جديد"}</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2 border-b border-border pb-2">
            <Button variant={activeTab === "account" ? "default" : "ghost"} size="sm" onClick={() => setActiveTab("account")}>بيانات الحساب</Button>
            <Button variant={activeTab === "permissions" ? "default" : "ghost"} size="sm" onClick={() => setActiveTab("permissions")}>صلاحيات الوصول</Button>
          </div>
          <ScrollArea className="flex-1 min-h-0 max-h-[55vh] px-1 overflow-y-auto">
            {activeTab === "account" && (
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>الاسم الكامل *</Label>
                  <Input className="glass-input" value={formName} onChange={(e) => setFormName(e.target.value)} />
                </div>
                {!detailUser && (
                  <>
                    <div className="space-y-2">
                      <Label>البريد الإلكتروني *</Label>
                      <Input className="glass-input" type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} dir="ltr" />
                    </div>
                    <div className="space-y-2">
                      <Label>كلمة المرور *</Label>
                      <Input className="glass-input" type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} dir="ltr" />
                    </div>
                  </>
                )}
                <div className="space-y-2">
                  <Label>الدور الوظيفي</Label>
                  <Select value={formJobRoleId} onValueChange={setFormJobRoleId}>
                    <SelectTrigger className="glass-input"><SelectValue placeholder="اختر الدور" /></SelectTrigger>
                    <SelectContent>{jobRoles?.map((jr) => <SelectItem key={jr.id} value={jr.id}>{jr.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>الفرع</Label>
                  <Select value={formBranchId} onValueChange={setFormBranchId}>
                    <SelectTrigger className="glass-input"><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                    <SelectContent>{branches?.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-muted/30">
                  <Label>حالة الحساب</Label>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-sm", formStatus ? "text-success" : "text-destructive")}>{formStatus ? "نشط" : "موقف"}</span>
                    <Switch checked={formStatus} onCheckedChange={setFormStatus} dir="ltr" />
                  </div>
                </div>
                <div className="space-y-3 p-3 rounded-xl border border-border/50 bg-muted/30">
                  <Label className="font-bold">مدة الاشتراك</Label>
                  <Select value={formSubscriptionType} onValueChange={setFormSubscriptionType}>
                    <SelectTrigger className="glass-input"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unlimited">غير محدود</SelectItem>
                      <SelectItem value="minutes">بالدقائق</SelectItem>
                      <SelectItem value="date_range">بالتاريخ</SelectItem>
                    </SelectContent>
                  </Select>
                  {formSubscriptionType === "minutes" && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <Input type="number" className="glass-input" value={formSubscriptionMinutes} onChange={(e) => setFormSubscriptionMinutes(e.target.value ? Number(e.target.value) : "")} />
                      <span className="text-sm text-muted-foreground shrink-0">دقيقة</span>
                    </div>
                  )}
                  {formSubscriptionType === "date_range" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">من</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className={cn("glass-input w-full justify-start text-sm", !formSubscriptionStart && "text-muted-foreground")}>
                              <CalendarIcon className="h-4 w-4 ml-1" />
                              {formSubscriptionStart ? format(formSubscriptionStart, "yyyy/MM/dd") : "اختر"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={formSubscriptionStart} onSelect={setFormSubscriptionStart} className="pointer-events-auto" />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">إلى</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className={cn("glass-input w-full justify-start text-sm", !formSubscriptionEnd && "text-muted-foreground")}>
                              <CalendarIcon className="h-4 w-4 ml-1" />
                              {formSubscriptionEnd ? format(formSubscriptionEnd, "yyyy/MM/dd") : "اختر"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={formSubscriptionEnd} onSelect={setFormSubscriptionEnd} className="pointer-events-auto" />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {activeTab === "permissions" && (
              <div className="space-y-3 py-2 pr-1">
                <p className="text-sm text-muted-foreground">اختر الصفحات التي يمكن لهذا المستخدم الوصول إليها:</p>
                <div className="space-y-2">
                  {ALL_PERMISSIONS.map((perm) => (
                    <div key={perm.key} className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-muted/30 cursor-pointer hover:border-primary/30 transition-colors" onClick={() => togglePermission(perm.key)}>
                      <Checkbox checked={formPermissions.includes(perm.key)} onCheckedChange={() => togglePermission(perm.key)} />
                      <span className="text-sm font-medium">{perm.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </ScrollArea>
          <div className="flex gap-2 pt-3 border-t border-border">
            <Button className="flex-1 gradient-primary text-primary-foreground font-bold" onClick={handleSave} disabled={createUser.isPending || updateUser.isPending}>
              {detailUser ? "حفظ التعديلات" : "إضافة المستخدم"}
            </Button>
            <Button variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>إلغاء</Button>
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
            <AlertDialogTitle>حذف المستخدم</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف <strong>{deleteTargetUser?.full_name}</strong>؟</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => deleteUser.mutate()}>حذف</AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Dialogs */}
      <AlertDialog open={resetStep === 1} onOpenChange={(open) => { if (!open) setResetStep(0); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-orange-600"><AlertTriangle className="h-5 w-5" />تصفير البيانات</AlertDialogTitle>
            <AlertDialogDescription>سيتم حذف جميع البيانات التشغيلية. لا يمكن التراجع!</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction className="bg-orange-600 text-white" onClick={(e) => { e.preventDefault(); setResetStep(2); }}>متابعة</AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={resetStep === 2} onOpenChange={(open) => { if (!open) setResetStep(0); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">تأكيد نهائي</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد تماماً؟</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={(e) => { e.preventDefault(); setResetStep(3); }}>نعم</AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={resetStep === 3} onOpenChange={(open) => { if (!open) { setResetStep(0); setResetConfirmText(""); } }}>
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
