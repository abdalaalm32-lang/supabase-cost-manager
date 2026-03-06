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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Building2, Plus, ChevronDown, ChevronUp, Users, Eye, KeyRound, Trash2, UserCheck, Settings2, RotateCcw, AlertTriangle, Search, CalendarIcon, Clock, RefreshCw, History
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
  const [searchCode, setSearchCode] = useState("");

  // Add company form
  const [companyName, setCompanyName] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [maxBranches, setMaxBranches] = useState(2);
  const [maxWarehouses, setMaxWarehouses] = useState(1);
  const [subType, setSubType] = useState("unlimited");
  const [subMinutes, setSubMinutes] = useState<number | undefined>(undefined);
  const [subMonths, setSubMonths] = useState<number | undefined>(undefined);
  const [subStart, setSubStart] = useState<Date | undefined>(undefined);
  const [subEnd, setSubEnd] = useState<Date | undefined>(undefined);

  // Edit user form
  const [editFormPermissions, setEditFormPermissions] = useState<string[]>([]);
  const [editFormStatus, setEditFormStatus] = useState(true);

  // Password dialog
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [passwordTargetUser, setPasswordTargetUser] = useState<any>(null);
  const [newPassword, setNewPassword] = useState("");

  // Delete user dialog
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteTargetUser, setDeleteTargetUser] = useState<any>(null);

  // Delete company dialog
  const [isDeleteCompanyOpen, setIsDeleteCompanyOpen] = useState(false);
  const [deleteTargetCompany, setDeleteTargetCompany] = useState<any>(null);
  const [deleteCompanyConfirmText, setDeleteCompanyConfirmText] = useState("");

  // Reset data dialog
  const [resetStep, setResetStep] = useState(0);
  const [resetTargetCompany, setResetTargetCompany] = useState<any>(null);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  // Renew subscription dialog
  const [isRenewOpen, setIsRenewOpen] = useState(false);
  const [renewTarget, setRenewTarget] = useState<any>(null);
  const [renewType, setRenewType] = useState("months");
  const [renewMonths, setRenewMonths] = useState<number>(1);
  const [renewDays, setRenewDays] = useState<number>(30);
  const [renewNotes, setRenewNotes] = useState("");

  // Subscription log dialog
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [logTargetCompany, setLogTargetCompany] = useState<any>(null);

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

  // Filter companies by code search
  const filteredCompanies = companies?.filter(c =>
    !searchCode || c.code?.toLowerCase().includes(searchCode.toLowerCase()) || c.name?.toLowerCase().includes(searchCode.toLowerCase())
  ) || [];

  // Fetch subscription log for a company
  const { data: subscriptionLogs } = useQuery({
    queryKey: ["subscription-log", logTargetCompany?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_subscription_log")
        .select("*")
        .eq("company_id", logTargetCompany!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!logTargetCompany?.id,
  });

  const createCompany = useMutation({
    mutationFn: async () => {
      if (!companyName || !ownerEmail || !ownerPassword || !ownerName) throw new Error("جميع الحقول مطلوبة");
      
      // Check email uniqueness
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", ownerEmail)
        .maybeSingle();
      if (existingProfile) throw new Error("هذا البريد الإلكتروني مستخدم بالفعل");

      const subStartDate = subStart || new Date();
      let subEndDate = subEnd;
      if (subType === "months" && subMonths) {
        subEndDate = new Date(subStartDate);
        subEndDate.setMonth(subEndDate.getMonth() + subMonths);
      } else if (subType === "minutes" && subMinutes) {
        subEndDate = new Date(subStartDate.getTime() + subMinutes * 60 * 1000);
      }

      const res = await supabase.functions.invoke("create-company", {
        body: {
          company_name: companyName,
          company_code: companyCode || undefined,
          owner_email: ownerEmail,
          owner_password: ownerPassword,
          owner_name: ownerName,
          max_branches: maxBranches,
          max_warehouses: maxWarehouses,
          subscription_type: subType,
          subscription_minutes: subType === "minutes" ? subMinutes : undefined,
          subscription_start: subType !== "unlimited" ? subStartDate.toISOString() : undefined,
          subscription_end: subType !== "unlimited" && subEndDate ? subEndDate.toISOString() : undefined,
        },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data: any) => {
      // Log company creation
      if (data?.company_id) {
        supabase.from("company_subscription_log").insert({
          company_id: data.company_id,
          action: "إنشاء",
          previous_type: "—",
          new_type: subType,
          new_end: subType !== "unlimited" && data?.subscription_end ? data.subscription_end : null,
          notes: `تم إنشاء الشركة - اشتراك: ${subType === "unlimited" ? "غير محدود" : subType === "months" ? `${subMonths} شهر` : `${subMinutes} دقيقة`}`,
          created_by: auth.user?.id || null,
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["subscription-log"] });
        });
      }
      toast.success("تم إنشاء الشركة والمالك بنجاح");
      setIsAddCompanyOpen(false);
      resetAddForm();
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleCompanyActive = useMutation({
    mutationFn: async ({ companyId, active, companyName }: { companyId: string; active: boolean; companyName?: string }) => {
      const { error } = await supabase.from("companies").update({ active }).eq("id", companyId);
      if (error) throw error;
      // Log the event
      await supabase.from("company_subscription_log").insert({
        company_id: companyId,
        action: active ? "تفعيل" : "تعطيل",
        previous_type: "—",
        new_type: "—",
        notes: active ? "تم إعادة تفعيل الشركة" : "تم تعطيل الشركة",
        created_by: auth.user?.id || null,
      });
    },
    onSuccess: (_, { active }) => {
      toast.success(active ? "تم تفعيل الشركة" : "تم تعطيل الشركة");
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      queryClient.invalidateQueries({ queryKey: ["admin-company-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["subscription-log"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateCompanyLimits = useMutation({
    mutationFn: async ({ companyId, max_branches, max_warehouses, max_users }: { companyId: string; max_branches: number; max_warehouses: number; max_users?: number }) => {
      const update: any = { max_branches, max_warehouses };
      if (max_users !== undefined) update.max_users = max_users;
      const { error } = await supabase.from("companies").update(update).eq("id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تحديث الحدود");
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateCompanySubscription = useMutation({
    mutationFn: async ({ companyId, subscription_type, subscription_minutes, subscription_start, subscription_end }: { companyId: string; subscription_type: string; subscription_minutes?: number | null; subscription_start?: string | null; subscription_end?: string | null }) => {
      const { error } = await supabase.from("companies").update({
        subscription_type,
        subscription_minutes: subscription_minutes || null,
        subscription_start: subscription_start || null,
        subscription_end: subscription_end || null,
      }).eq("id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تحديث الاشتراك");
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const renewSubscription = useMutation({
    mutationFn: async () => {
      if (!renewTarget) throw new Error("لا توجد شركة محددة");
      const now = new Date();
      // Start from current end date if still valid, otherwise from now
      const currentEnd = renewTarget.subscription_end ? new Date(renewTarget.subscription_end) : now;
      const startFrom = currentEnd > now ? currentEnd : now;
      
      let newEnd: Date;
      let durationDays: number | null = null;
      let durationMonths: number | null = null;

      if (renewType === "months") {
        newEnd = new Date(startFrom);
        newEnd.setMonth(newEnd.getMonth() + renewMonths);
        durationMonths = renewMonths;
        durationDays = Math.round((newEnd.getTime() - startFrom.getTime()) / (1000 * 60 * 60 * 24));
      } else {
        newEnd = new Date(startFrom);
        newEnd.setDate(newEnd.getDate() + renewDays);
        durationDays = renewDays;
      }

      // Update company subscription
      const { error: updateError } = await supabase.from("companies").update({
        subscription_type: renewType === "months" ? "months" : "months",
        subscription_start: (currentEnd > now ? renewTarget.subscription_start : now.toISOString()),
        subscription_end: newEnd.toISOString(),
      }).eq("id", renewTarget.id);
      if (updateError) throw updateError;

      // Log the renewal
      const { error: logError } = await supabase.from("company_subscription_log").insert({
        company_id: renewTarget.id,
        action: "تجديد",
        previous_type: renewTarget.subscription_type || "unlimited",
        new_type: renewType === "months" ? "months" : "months",
        previous_end: renewTarget.subscription_end || null,
        new_end: newEnd.toISOString(),
        duration_days: durationDays,
        duration_months: durationMonths,
        notes: renewNotes || null,
        created_by: auth.user?.id || null,
      });
      if (logError) throw logError;
    },
    onSuccess: () => {
      toast.success("تم تجديد الاشتراك بنجاح");
      setIsRenewOpen(false);
      setRenewTarget(null);
      setRenewNotes("");
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      queryClient.invalidateQueries({ queryKey: ["subscription-log"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateUserFromAdmin = useMutation({
    mutationFn: async () => {
      if (!editingUser) return;
      const { error } = await supabase.from("profiles").update({
        status: editFormStatus ? "نشط" : "موقف",
        permissions: editFormPermissions,
      }).eq("id", editingUser.id);
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

  const deleteCompany = useMutation({
    mutationFn: async () => {
      if (!deleteTargetCompany || deleteCompanyConfirmText !== "حذف") return;
      const res = await supabase.functions.invoke("delete-company", {
        body: { company_id: deleteTargetCompany.id },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      toast.success("تم حذف الشركة وجميع بياناتها");
      setIsDeleteCompanyOpen(false);
      setDeleteTargetCompany(null);
      setDeleteCompanyConfirmText("");
      setExpandedCompany(null);
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
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
    setCompanyName(""); setCompanyCode(""); setOwnerName(""); setOwnerEmail(""); setOwnerPassword("");
    setMaxBranches(2); setMaxWarehouses(1);
    setSubType("unlimited"); setSubMinutes(undefined); setSubMonths(undefined); setSubStart(undefined); setSubEnd(undefined);
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

      {/* Search by code */}
      <div className="relative max-w-sm">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="بحث بالكود أو اسم الشركة..."
          value={searchCode}
          onChange={(e) => setSearchCode(e.target.value)}
          className="pr-9"
        />
      </div>

      {/* Companies List */}
      <div className="space-y-3">
        {isLoading ? (
          <p className="text-center text-muted-foreground py-10">جاري التحميل...</p>
        ) : filteredCompanies.length === 0 ? (
          <p className="text-center text-muted-foreground py-10">لا توجد شركات</p>
        ) : (
          filteredCompanies.map((company: any) => (
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
                          الحد: {company.max_branches} فروع / {company.max_warehouses} مخازن / {company.max_users ?? 5} مستخدمين
                        </span>
                        {company.subscription_type !== "unlimited" && (
                          <Badge variant={company.subscription_end && new Date(company.subscription_end) < new Date() ? "destructive" : "secondary"} className="text-xs">
                            {company.subscription_type === "months" ? "اشتراك شهري" : "اشتراك بالدقائق"}
                            {company.subscription_end && ` - ينتهي ${format(new Date(company.subscription_end), "yyyy-MM-dd")}`}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {company.code !== "GSC-ADMIN" && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              title="حذف الشركة"
                              onClick={() => {
                                setDeleteTargetCompany(company);
                                setDeleteCompanyConfirmText("");
                                setIsDeleteCompanyOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
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
                                onCheckedChange={(checked) => toggleCompanyActive.mutate({ companyId: company.id, active: checked, companyName: company.name })}
                                dir="ltr"
                              />
                            </div>
                          </>
                        )}
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
                          <Label className="text-xs mr-2">مستخدمين:</Label>
                          <Input
                            type="number"
                            className="w-14 h-7 text-xs text-center"
                            value={company.max_users ?? 5}
                            onChange={(e) => updateCompanyLimits.mutate({ companyId: company.id, max_branches: company.max_branches, max_warehouses: company.max_warehouses, max_users: Number(e.target.value) })}
                            min={0}
                          />
                        </div>
                        {expandedCompany === company.id ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t border-border/30 p-4 space-y-4">
                      {/* Subscription Management */}
                      {company.code !== "GSC-ADMIN" && (
                        <div className="p-3 rounded-xl border border-border/50 bg-muted/20 space-y-3">
                          <h4 className="text-sm font-bold flex items-center gap-2"><Clock className="h-4 w-4" />إدارة الاشتراك</h4>
                          <div className="flex flex-wrap items-end gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">النوع</Label>
                              <Select
                                value={company.subscription_type || "unlimited"}
                                onValueChange={(val) => {
                                  const startDate = company.subscription_start || new Date().toISOString();
                                  updateCompanySubscription.mutate({
                                    companyId: company.id,
                                    subscription_type: val,
                                    subscription_minutes: val === "minutes" ? (company.subscription_minutes || 1000) : null,
                                    subscription_start: val !== "unlimited" ? startDate : null,
                                    subscription_end: val !== "unlimited" ? company.subscription_end : null,
                                  });
                                }}
                              >
                                <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="unlimited">غير محدود</SelectItem>
                                  <SelectItem value="months">بالأشهر</SelectItem>
                                  <SelectItem value="minutes">بالدقائق</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            {company.subscription_type === "minutes" && (
                              <div className="space-y-1">
                                <Label className="text-xs">عدد الدقائق</Label>
                                <Input
                                  type="number"
                                  className="w-24 h-8 text-xs text-center"
                                  value={company.subscription_minutes || ""}
                                  onChange={(e) => {
                                    const mins = Number(e.target.value);
                                    if (!mins || mins <= 0) return;
                                    const now = new Date();
                                    const endDate = new Date(now.getTime() + mins * 60 * 1000);
                                    updateCompanySubscription.mutate({
                                      companyId: company.id,
                                      subscription_type: "minutes",
                                      subscription_minutes: mins,
                                      subscription_start: now.toISOString(),
                                      subscription_end: endDate.toISOString(),
                                    });
                                  }}
                                  min={1}
                                  placeholder="مثال: 2"
                                />
                                <p className="text-[10px] text-muted-foreground">بعد الحفظ سيبدأ العد التنازلي</p>
                              </div>
                            )}
                            {company.subscription_type !== "unlimited" && (
                              <>
                                <div className="space-y-1">
                                  <Label className="text-xs">بداية</Label>
                                  <Input type="date" className="w-36 h-8 text-xs" value={company.subscription_start ? format(new Date(company.subscription_start), "yyyy-MM-dd") : ""} onChange={(e) => updateCompanySubscription.mutate({ companyId: company.id, subscription_type: company.subscription_type, subscription_minutes: company.subscription_minutes, subscription_start: e.target.value ? new Date(e.target.value).toISOString() : null, subscription_end: company.subscription_end })} />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">نهاية</Label>
                                  <Input type="date" className="w-36 h-8 text-xs" value={company.subscription_end ? format(new Date(company.subscription_end), "yyyy-MM-dd") : ""} onChange={(e) => updateCompanySubscription.mutate({ companyId: company.id, subscription_type: company.subscription_type, subscription_minutes: company.subscription_minutes, subscription_start: company.subscription_start, subscription_end: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                                </div>
                              </>
                            )}
                          </div>
                          {company.subscription_type !== "unlimited" && company.subscription_end && (
                            <p className={cn("text-xs font-medium", new Date(company.subscription_end) < new Date() ? "text-destructive" : "text-muted-foreground")}>
                              {new Date(company.subscription_end) < new Date() ? "⚠️ الاشتراك منتهي!" : `⏳ ينتهي في ${format(new Date(company.subscription_end), "yyyy-MM-dd")}`}
                            </p>
                          )}
                          <div className="flex items-center gap-2 pt-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 text-xs"
                              onClick={() => {
                                setRenewTarget(company);
                                setRenewType("months");
                                setRenewMonths(1);
                                setRenewDays(30);
                                setRenewNotes("");
                                setIsRenewOpen(true);
                              }}
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                              تجديد الاشتراك
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="gap-1 text-xs"
                              onClick={() => {
                                setLogTargetCompany(company);
                                setIsLogOpen(true);
                              }}
                            >
                              <History className="h-3.5 w-3.5" />
                              سجل التجديدات
                            </Button>
                          </div>
                        </div>
                      )}
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
        <DialogContent className="max-w-lg max-h-[90vh]" dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة شركة جديدة</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[65vh] pr-3">
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
              {/* Subscription Section */}
              <div className="border-t border-border pt-4 space-y-4">
                <h3 className="font-bold text-sm flex items-center gap-2"><Clock className="h-4 w-4" />مدة الاشتراك</h3>
                <div className="space-y-2">
                  <Label>نوع الاشتراك</Label>
                  <Select value={subType} onValueChange={setSubType}>
                    <SelectTrigger className="glass-input"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unlimited">غير محدود</SelectItem>
                      <SelectItem value="months">بالأشهر</SelectItem>
                      <SelectItem value="minutes">بالدقائق</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {subType === "months" && (
                  <div className="space-y-2">
                    <Label>عدد الأشهر</Label>
                    <Input type="number" className="glass-input" value={subMonths || ""} onChange={(e) => setSubMonths(Number(e.target.value) || undefined)} min={1} placeholder="مثال: 6" />
                  </div>
                )}
                {subType === "minutes" && (
                  <div className="space-y-2">
                    <Label>عدد الدقائق</Label>
                    <Input type="number" className="glass-input" value={subMinutes || ""} onChange={(e) => setSubMinutes(Number(e.target.value) || undefined)} min={1} placeholder="مثال: 1000" />
                  </div>
                )}
                {subType !== "unlimited" && (
                  <div className="space-y-2">
                    <Label>تاريخ بدء الاشتراك</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-right font-normal glass-input", !subStart && "text-muted-foreground")}>
                          <CalendarIcon className="ml-2 h-4 w-4" />
                          {subStart ? format(subStart, "yyyy-MM-dd") : "اختر تاريخ البدء"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={subStart} onSelect={setSubStart} />
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
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
        <DialogContent className="max-w-lg max-h-[90vh]" dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل المستخدم: {editingUser?.full_name}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[65vh] pr-3">
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

      {/* Delete User Dialog */}
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

      {/* Delete Company Dialog */}
      <Dialog open={isDeleteCompanyOpen} onOpenChange={(open) => { if (!open) { setIsDeleteCompanyOpen(false); setDeleteTargetCompany(null); setDeleteCompanyConfirmText(""); } }}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              حذف الشركة نهائياً
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              سيتم حذف شركة <strong>{deleteTargetCompany?.name}</strong> وجميع بياناتها وحسابات المستخدمين نهائياً. لا يمكن التراجع عن هذا الإجراء!
            </p>
            <p className="text-sm font-bold text-destructive">اكتب "حذف" للتأكيد</p>
            <Input
              value={deleteCompanyConfirmText}
              onChange={(e) => setDeleteCompanyConfirmText(e.target.value)}
              placeholder='اكتب "حذف"'
              className="text-center text-lg font-bold"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              className="flex-1 bg-destructive text-destructive-foreground font-bold"
              onClick={() => deleteCompany.mutate()}
              disabled={deleteCompanyConfirmText !== "حذف" || deleteCompany.isPending}
            >
              {deleteCompany.isPending ? "جاري الحذف..." : "حذف نهائي"}
            </Button>
            <Button variant="outline" onClick={() => { setIsDeleteCompanyOpen(false); setDeleteCompanyConfirmText(""); }}>إلغاء</Button>
          </div>
        </DialogContent>
      </Dialog>

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

      {/* Renew Subscription Dialog */}
      <Dialog open={isRenewOpen} onOpenChange={(open) => { if (!open) { setIsRenewOpen(false); setRenewTarget(null); } }}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" />
              تجديد اشتراك: {renewTarget?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {renewTarget?.subscription_end && (
              <div className={cn("p-3 rounded-lg text-sm", new Date(renewTarget.subscription_end) < new Date() ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>
                {new Date(renewTarget.subscription_end) < new Date()
                  ? `⚠️ الاشتراك منتهي منذ ${format(new Date(renewTarget.subscription_end), "yyyy-MM-dd")}`
                  : `⏳ الاشتراك الحالي ينتهي في ${format(new Date(renewTarget.subscription_end), "yyyy-MM-dd")}`}
              </div>
            )}
            <div className="space-y-2">
              <Label>طريقة التجديد</Label>
              <Select value={renewType} onValueChange={setRenewType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="months">بالأشهر</SelectItem>
                  <SelectItem value="days">بالأيام</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {renewType === "months" ? (
              <div className="space-y-2">
                <Label>عدد الأشهر</Label>
                <Input type="number" value={renewMonths} onChange={(e) => setRenewMonths(Number(e.target.value) || 1)} min={1} />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>عدد الأيام</Label>
                <Input type="number" value={renewDays} onChange={(e) => setRenewDays(Number(e.target.value) || 1)} min={1} />
              </div>
            )}
            <div className="space-y-2">
              <Label>ملاحظات (اختياري)</Label>
              <Input value={renewNotes} onChange={(e) => setRenewNotes(e.target.value)} placeholder="مثال: تجديد سنوي" />
            </div>
          </div>
          <div className="flex gap-2 pt-3 border-t border-border">
            <Button className="flex-1 gradient-primary text-primary-foreground font-bold" onClick={() => renewSubscription.mutate()} disabled={renewSubscription.isPending}>
              {renewSubscription.isPending ? "جاري التجديد..." : "تجديد الاشتراك"}
            </Button>
            <Button variant="outline" onClick={() => setIsRenewOpen(false)}>إلغاء</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Subscription Log Dialog */}
      <Dialog open={isLogOpen} onOpenChange={(open) => { if (!open) { setIsLogOpen(false); setLogTargetCompany(null); } }}>
        <DialogContent className="max-w-2xl max-h-[80vh]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              سجل تجديدات: {logTargetCompany?.name}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {!subscriptionLogs || subscriptionLogs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">لا توجد سجلات تجديد</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">الإجراء</TableHead>
                    <TableHead className="text-right">المدة</TableHead>
                    <TableHead className="text-right">من</TableHead>
                    <TableHead className="text-right">إلى</TableHead>
                    <TableHead className="text-right">ملاحظات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscriptionLogs.map((log: any) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs">{format(new Date(log.created_at), "yyyy-MM-dd HH:mm")}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">{log.action}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {log.duration_months ? `${log.duration_months} شهر` : log.duration_days ? `${log.duration_days} يوم` : "—"}
                      </TableCell>
                      <TableCell className="text-xs">{log.previous_end ? format(new Date(log.previous_end), "yyyy-MM-dd") : "—"}</TableCell>
                      <TableCell className="text-xs">{log.new_end ? format(new Date(log.new_end), "yyyy-MM-dd") : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{log.notes || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};
