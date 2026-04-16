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
  Users, UserCheck, Plus, Eye, CalendarIcon, Clock, KeyRound, Trash2, AlertTriangle, RotateCcw
} from "lucide-react";
import { ExportButtons } from "@/components/ExportButtons";

const ALL_PERMISSIONS = [
  { key: "dashboard", label: "لوحة التحكم" },
  { key: "pos", label: "نقطة البيع" },
  { key: "sales_management", label: "إدارة المبيعات" },
  { key: "call_center", label: "الكول سنتر" },
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
  { key: "pnl", label: "قائمة P&L" },
  { key: "reports", label: "التقارير" },
  { key: "settings", label: "الإعدادات" },
];

export const SettingsUsersPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const queryClient = useQueryClient();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"account" | "permissions">("account");
  const [detailUser, setDetailUser] = useState<any>(null);

  // Password change dialog
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [passwordTargetUser, setPasswordTargetUser] = useState<any>(null);
  const [newPassword, setNewPassword] = useState("");

  // Delete confirm dialog
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteTargetUser, setDeleteTargetUser] = useState<any>(null);

  // Reset data dialogs (3 steps)
  const [resetStep, setResetStep] = useState(0); // 0=closed, 1=first confirm, 2=second confirm, 3=type confirm
  const [resetTargetUser, setResetTargetUser] = useState<any>(null);
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

  // Queries
  const { data: profiles, isLoading } = useQuery({
    queryKey: ["settings-users", companyId],
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

  const { data: companyData } = useQuery({
    queryKey: ["company", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("name, code, max_users, max_branches, max_warehouses").eq("id", companyId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const totalUsers = profiles?.length || 0;
  const activeUsers = profiles?.filter((p) => p.status === "نشط").length || 0;

  const resetForm = () => {
    setFormName("");
    setFormEmail("");
    setFormPassword("");
    setFormJobRoleId("");
    setFormBranchId("");
    setFormStatus(true);
    setFormPermissions(["dashboard"]);
    setFormSubscriptionType("unlimited");
    setFormSubscriptionMinutes("");
    setFormSubscriptionStart(undefined);
    setFormSubscriptionEnd(undefined);
    setActiveTab("account");
    setDetailUser(null);
  };

  const [isLimitDialogOpen, setIsLimitDialogOpen] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState(false);

  const maxUsers = (companyData as any)?.max_users ?? 5;

  const sendUpgradeRequest = async () => {
    if (!companyData || !auth.profile) return;
    setUpgradeLoading(true);
    try {
      const { error } = await supabase.from("support_tickets").insert({
        company_id: companyId!,
        company_name: (companyData as any).name,
        company_code: (companyData as any).code,
        sender_id: auth.profile.user_id,
        sender_name: auth.profile.full_name,
        subject: "طلب ترقية حساب",
        message: `اهلا انا مدير شركه ${(companyData as any).name} المشترك معك في السيستم\nاريد ترقيه حسابي لتزويد limit المستخدمين\nدا كود شركتي ${(companyData as any).code}\nشكرا`,
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

  const openAddDialog = () => {
    if (totalUsers >= maxUsers && !auth.isAdmin) {
      setIsLimitDialogOpen(true);
      return;
    }
    resetForm();
    setIsDialogOpen(true);
  };

  const openDetailDialog = (user: any) => {
    setDetailUser(user);
    setFormName(user.full_name);
    setFormEmail(user.email);
    setFormPassword("");
    setFormJobRoleId(user.job_role_id || "");
    setFormBranchId(user.branch_id || "");
    setFormStatus(user.status === "نشط");
    setFormPermissions(user.permissions || ["dashboard"]);
    setFormSubscriptionType(user.subscription_type || "unlimited");
    setFormSubscriptionMinutes(user.subscription_minutes || "");
    setFormSubscriptionStart(user.subscription_start ? new Date(user.subscription_start) : undefined);
    setFormSubscriptionEnd(user.subscription_end ? new Date(user.subscription_end) : undefined);
    setActiveTab("account");
    setIsDialogOpen(true);
  };

  const togglePermission = (key: string) => {
    setFormPermissions((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const createUser = useMutation({
    mutationFn: async () => {
      if (!formName || !formEmail || !formPassword) throw new Error("الاسم والبريد وكلمة المرور مطلوبين");

      const { data: userCode } = await supabase.rpc("generate_user_code", { p_company_id: companyId! });

      const res = await supabase.functions.invoke("create-admin-user", {
        body: {
          email: formEmail,
          password: formPassword,
          full_name: formName,
          company_id: companyId,
          role: "مستخدم",
          permissions: formPermissions,
          branch_id: formBranchId || null,
          job_role_id: formJobRoleId || null,
          user_code: userCode,
          status: formStatus ? "نشط" : "موقف",
          subscription_type: formSubscriptionType,
          subscription_minutes: formSubscriptionType === "minutes" ? formSubscriptionMinutes : null,
          subscription_start: formSubscriptionType === "date_range" && formSubscriptionStart ? formSubscriptionStart.toISOString() : null,
          subscription_end: formSubscriptionType === "date_range" && formSubscriptionEnd ? formSubscriptionEnd.toISOString() : null,
        },
      });

      if (res.error) throw new Error(res.error.message || "حدث خطأ");
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: () => {
      toast.success("تم إضافة المستخدم بنجاح");
      setIsDialogOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["settings-users"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateUser = useMutation({
    mutationFn: async () => {
      if (!detailUser) return;
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: formName,
          branch_id: formBranchId || null,
          job_role_id: formJobRoleId || null,
          status: formStatus ? "نشط" : "موقف",
          permissions: formPermissions,
          subscription_type: formSubscriptionType,
          subscription_minutes: formSubscriptionType === "minutes" ? (formSubscriptionMinutes as number) : null,
          subscription_start: formSubscriptionType === "date_range" && formSubscriptionStart ? formSubscriptionStart.toISOString() : null,
          subscription_end: formSubscriptionType === "date_range" && formSubscriptionEnd ? formSubscriptionEnd.toISOString() : null,
        })
        .eq("id", detailUser.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تحديث المستخدم بنجاح");
      setIsDialogOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["settings-users"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const changePassword = useMutation({
    mutationFn: async () => {
      if (!passwordTargetUser || !newPassword) throw new Error("كلمة المرور مطلوبة");
      const res = await supabase.functions.invoke("manage-user", {
        body: {
          action: "change_password",
          target_user_id: passwordTargetUser.user_id,
          new_password: newPassword,
        },
      });
      if (res.error) throw new Error(res.error.message || "حدث خطأ");
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      toast.success("تم تغيير كلمة المرور بنجاح");
      setIsPasswordDialogOpen(false);
      setPasswordTargetUser(null);
      setNewPassword("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteUser = useMutation({
    mutationFn: async () => {
      if (!deleteTargetUser) return;
      const res = await supabase.functions.invoke("manage-user", {
        body: {
          action: "delete_user",
          target_user_id: deleteTargetUser.user_id,
        },
      });
      if (res.error) throw new Error(res.error.message || "حدث خطأ");
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      toast.success("تم حذف المستخدم بنجاح");
      setIsDeleteDialogOpen(false);
      setDeleteTargetUser(null);
      queryClient.invalidateQueries({ queryKey: ["settings-users"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSave = () => {
    if (detailUser) {
      updateUser.mutate();
    } else {
      createUser.mutate();
    }
  };

  const handleResetData = async () => {
    if (resetConfirmText !== "تصفير") return;
    setIsResetting(true);
    try {
      const res = await supabase.functions.invoke("reset-company-data", {
        body: { company_id: companyId },
      });
      if (res.error) throw new Error(res.error.message || "حدث خطأ");
      if (res.data?.error) throw new Error(res.data.error);
      toast.success("تم تصفير جميع البيانات بنجاح");
      queryClient.invalidateQueries();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsResetting(false);
      setResetStep(0);
      setResetTargetUser(null);
      setResetConfirmText("");
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Stats Cards */}
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
      <div className="flex justify-end mb-2">
        <ExportButtons
          data={(profiles || []).map((u: any) => ({ code: u.user_code || "—", name: u.full_name, email: u.email, role: (u.job_roles as any)?.name || "—", branch: (u.branches as any)?.name || "—", status: u.status }))}
          columns={[{ key: "code", label: "الكود" }, { key: "name", label: "الاسم" }, { key: "email", label: "البريد الإلكتروني" }, { key: "role", label: "الدور الوظيفي" }, { key: "branch", label: "الفرع" }, { key: "status", label: "الحالة" }]}
          filename="المستخدمين"
          title="المستخدمين"
        />
      </div>
      <Card className="glass-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الكود</TableHead>
                <TableHead className="text-right">الاسم</TableHead>
                <TableHead className="text-right">البريد الإلكتروني</TableHead>
                <TableHead className="text-right">الدور الوظيفي</TableHead>
                <TableHead className="text-right">الفرع</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">جاري التحميل...</TableCell>
                </TableRow>
              ) : profiles?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">لا يوجد مستخدمين</TableCell>
                </TableRow>
              ) : (
                profiles?.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-mono text-xs">{user.user_code || "—"}</TableCell>
                    <TableCell className="font-semibold">{user.full_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground" dir="ltr">{user.email}</TableCell>
                    <TableCell>{(user.job_roles as any)?.name || "—"}</TableCell>
                    <TableCell>{(user.branches as any)?.name || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={user.status === "نشط" ? "default" : "destructive"} className="text-xs">
                        {user.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="gap-1" onClick={() => openDetailDialog(user)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setPasswordTargetUser(user);
                            setNewPassword("");
                            setIsPasswordDialogOpen(true);
                          }}
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                         {user.user_id !== auth.user?.id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => {
                              setDeleteTargetUser(user);
                              setIsDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-orange-600 hover:text-orange-700"
                          title="تصفير الداتا"
                          onClick={() => {
                            setResetTargetUser(user);
                            setResetStep(1);
                            setResetConfirmText("");
                          }}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
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
            <Button variant={activeTab === "account" ? "default" : "ghost"} size="sm" onClick={() => setActiveTab("account")}>
              بيانات الحساب
            </Button>
            <Button variant={activeTab === "permissions" ? "default" : "ghost"} size="sm" onClick={() => setActiveTab("permissions")}>
              صلاحيات الوصول
            </Button>
          </div>

          <ScrollArea className="flex-1 min-h-0 h-[50vh] px-1 overflow-y-auto">
            {activeTab === "account" && (
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>الاسم الكامل *</Label>
                  <Input className="glass-input" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="اسم المستخدم" />
                </div>

                {!detailUser && (
                  <>
                    <div className="space-y-2">
                      <Label>البريد الإلكتروني *</Label>
                      <Input className="glass-input" type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="email@example.com" dir="ltr" />
                    </div>
                    <div className="space-y-2">
                      <Label>كلمة المرور *</Label>
                      <Input className="glass-input" type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} placeholder="كلمة المرور" dir="ltr" />
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <Label>اسم الشركة</Label>
                  <Input className="glass-input" value={companyData?.name || ""} disabled />
                </div>

                <div className="space-y-2">
                  <Label>الدور الوظيفي</Label>
                  <Select value={formJobRoleId} onValueChange={(val) => {
                    setFormJobRoleId(val);
                    const selectedRole = jobRoles?.find((jr) => jr.id === val);
                    if (selectedRole && (selectedRole as any).default_permissions) {
                      setFormPermissions((selectedRole as any).default_permissions);
                    }
                  }}>
                    <SelectTrigger className="glass-input"><SelectValue placeholder="اختر الدور الوظيفي" /></SelectTrigger>
                    <SelectContent>
                      {jobRoles?.map((jr) => (
                        <SelectItem key={jr.id} value={jr.id}>{jr.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>الفرع</Label>
                  <Select value={formBranchId} onValueChange={setFormBranchId}>
                    <SelectTrigger className="glass-input"><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                    <SelectContent>
                      {branches?.map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-muted/30">
                  <Label>حالة الحساب</Label>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-sm", formStatus ? "text-success" : "text-destructive")}>
                      {formStatus ? "نشط" : "موقف"}
                    </span>
                    <Switch checked={formStatus} onCheckedChange={async (checked) => {
                      setFormStatus(checked);
                      if (detailUser) {
                        const newStatus = checked ? "نشط" : "موقف";
                        const { error } = await supabase
                          .from("profiles")
                          .update({ status: newStatus })
                          .eq("id", detailUser.id);
                        if (error) {
                          toast.error("فشل تحديث حالة الحساب");
                          setFormStatus(!checked);
                        } else {
                          toast.success(`تم تغيير حالة الحساب إلى "${newStatus}"`);
                          queryClient.invalidateQueries({ queryKey: ["settings-users"] });
                        }
                      }
                    }} dir="ltr" />
                  </div>
                </div>

                <div className="space-y-3 p-3 rounded-xl border border-border/50 bg-muted/30">
                  <Label className="font-bold">مدة الاشتراك</Label>
                  <Select value={formSubscriptionType} onValueChange={setFormSubscriptionType}>
                    <SelectTrigger className="glass-input"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unlimited">غير محدود</SelectItem>
                      <SelectItem value="minutes">بالدقائق</SelectItem>
                      <SelectItem value="date_range">بالتاريخ (من - إلى)</SelectItem>
                    </SelectContent>
                  </Select>

                  {formSubscriptionType === "minutes" && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <Input type="number" className="glass-input" placeholder="عدد الدقائق" value={formSubscriptionMinutes} onChange={(e) => setFormSubscriptionMinutes(e.target.value ? Number(e.target.value) : "")} />
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
                              {formSubscriptionStart ? format(formSubscriptionStart, "yyyy/MM/dd") : "اختر التاريخ"}
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
                              {formSubscriptionEnd ? format(formSubscriptionEnd, "yyyy/MM/dd") : "اختر التاريخ"}
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
                <div className="space-y-2 pr-1">
                  {ALL_PERMISSIONS.map((perm) => (
                    <div
                      key={perm.key}
                      className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-muted/30 cursor-pointer hover:border-primary/30 transition-colors"
                      onClick={() => togglePermission(perm.key)}
                    >
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

      {/* Password Change Dialog */}
      <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>تغيير كلمة المرور</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            تغيير كلمة المرور للمستخدم: <strong>{passwordTargetUser?.full_name}</strong>
          </p>
          <div className="space-y-2">
            <Label>كلمة المرور الجديدة</Label>
            <Input
              className="glass-input"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="أدخل كلمة المرور الجديدة"
              dir="ltr"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              className="flex-1 gradient-primary text-primary-foreground font-bold"
              onClick={() => changePassword.mutate()}
              disabled={changePassword.isPending || !newPassword}
            >
              تغيير كلمة المرور
            </Button>
            <Button variant="outline" onClick={() => setIsPasswordDialogOpen(false)}>إلغاء</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف المستخدم</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف المستخدم <strong>{deleteTargetUser?.full_name}</strong>؟ هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteUser.mutate()}
              disabled={deleteUser.isPending}
            >
              حذف
            </AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Data - Step 1: First Warning */}
      <AlertDialog open={resetStep === 1} onOpenChange={(open) => { if (!open) { setResetStep(0); setResetTargetUser(null); } }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="h-5 w-5" />
              تحذير - تصفير البيانات
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              أنت على وشك تصفير <strong>جميع البيانات التشغيلية</strong> للشركة بالكامل.
              <br /><br />
              سيتم حذف: المبيعات، المشتريات، الإنتاج، الجرد، الهالك، التحويلات، تعديلات التكلفة، الوصفات، وإعادة تعيين أرصدة المخزون إلى صفر.
              <br /><br />
              <strong className="text-destructive">هذا الإجراء لا يمكن التراجع عنه!</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction
              className="bg-orange-600 text-white hover:bg-orange-700"
              onClick={(e) => { e.preventDefault(); setResetStep(2); }}
            >
              متابعة
            </AlertDialogAction>
            <AlertDialogCancel onClick={() => { setResetStep(0); setResetTargetUser(null); }}>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Data - Step 2: Second Confirmation */}
      <AlertDialog open={resetStep === 2} onOpenChange={(open) => { if (!open) { setResetStep(0); setResetTargetUser(null); } }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              تأكيد نهائي - هل أنت متأكد تماماً؟
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              ستقوم بحذف <strong>كل</strong> البيانات التشغيلية. لن تتمكن من استرجاع أي بيانات بعد هذه العملية.
              <br /><br />
              المستخدمين والإعدادات والأصناف والفروع والموردين <strong>لن يتم حذفها</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); setResetStep(3); }}
            >
              نعم، أنا متأكد
            </AlertDialogAction>
            <AlertDialogCancel onClick={() => { setResetStep(0); setResetTargetUser(null); }}>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Data - Step 3: Type to confirm */}
      <Dialog open={resetStep === 3} onOpenChange={(open) => { if (!open) { setResetStep(0); setResetTargetUser(null); setResetConfirmText(""); } }}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              الخطوة الأخيرة - اكتب "تصفير" للتأكيد
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              اكتب كلمة <strong className="text-destructive">"تصفير"</strong> في الحقل أدناه لتأكيد حذف جميع البيانات التشغيلية.
            </p>
            <Input
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              placeholder='اكتب "تصفير" هنا'
              className="text-center text-lg font-bold border-destructive/50 focus:border-destructive"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90 font-bold"
              onClick={handleResetData}
              disabled={resetConfirmText !== "تصفير" || isResetting}
            >
              {isResetting ? "جاري التصفير..." : "تصفير البيانات نهائياً"}
            </Button>
            <Button variant="outline" onClick={() => { setResetStep(0); setResetTargetUser(null); setResetConfirmText(""); }}>
              إلغاء
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* User Limit Dialog */}
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
              لقد وصلت للحد الأقصى المسموح به من المستخدمين في خطتك الحالية:
            </p>
            <div className="p-3 rounded-xl border border-border/50 bg-muted/30 text-center">
              <p className="text-xs text-muted-foreground">حد المستخدمين</p>
              <p className="text-2xl font-black text-foreground">{maxUsers}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              يمكنك طلب ترقية حسابك لزيادة عدد المستخدمين.
            </p>
            <Button
              className="w-full gap-2 gradient-primary text-primary-foreground font-bold"
              onClick={sendUpgradeRequest}
              disabled={upgradeLoading}
            >
              {upgradeLoading ? "جاري الإرسال..." : "إرسال طلب ترقية"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
