import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Users, UserCheck, UserX, TrendingUp, Search, MessageCircle,
  Phone, Edit, CheckCircle2, XCircle, Clock, Sparkles, RefreshCw, Filter,
  Trash2, Key, Copy,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  new_lead: { label: "عميل جديد", color: "text-slate-700", bg: "bg-slate-100" },
  trial_active: { label: "تجربة نشطة", color: "text-emerald-700", bg: "bg-emerald-100" },
  contacted: { label: "تم التواصل", color: "text-blue-700", bg: "bg-blue-100" },
  demo_scheduled: { label: "عرض تجريبي", color: "text-purple-700", bg: "bg-purple-100" },
  converted: { label: "تم التحويل", color: "text-green-700", bg: "bg-green-100" },
  lost: { label: "لم يشترك", color: "text-red-700", bg: "bg-red-100" },
  expired: { label: "منتهية", color: "text-orange-700", bg: "bg-orange-100" },
};

const daysBetween = (a?: string | null, b: Date = new Date()) => {
  if (!a) return null;
  const diff = new Date(a).getTime() - b.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

export const AdminLeadsPage: React.FC = () => {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editing, setEditing] = useState<any>(null);
  const [resetResult, setResetResult] = useState<null | { email: string; password: string }>(null);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["admin-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trial_leads" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: activity = [] } = useQuery({
    queryKey: ["admin-activity"],
    queryFn: async () => {
      const { data } = await supabase.from("company_activity" as any).select("*");
      return (data as any[]) || [];
    },
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["admin-companies-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("id, name, code, subscription_status, trial_start_date, trial_end_date, active");
      return (data as any[]) || [];
    },
  });

  // KPIs
  const kpis = useMemo(() => {
    const total = leads.length;
    const trialActive = leads.filter((l) => l.status === "trial_active" && (!l.trial_end_date || new Date(l.trial_end_date) > new Date())).length;
    const expired = leads.filter((l) => l.trial_end_date && new Date(l.trial_end_date) < new Date() && l.status !== "converted").length;
    const converted = leads.filter((l) => l.status === "converted").length;
    return { total, trialActive, expired, converted };
  }, [leads]);

  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (search && ![l.restaurant_name, l.contact_name, l.phone, l.email, l.city].some((v) => String(v || "").toLowerCase().includes(search.toLowerCase()))) return false;
      return true;
    });
  }, [leads, statusFilter, search]);

  // Activity dashboard: join leads with activity + companies
  const activityRows = useMemo(() => {
    return leads.map((l) => {
      const act = activity.find((a) => a.company_id === l.company_id);
      const comp = companies.find((c) => c.id === l.company_id);
      const lastLogin = act?.last_login_at ? new Date(act.last_login_at) : null;
      const daysSinceLogin = lastLogin ? Math.floor((Date.now() - lastLogin.getTime()) / (1000 * 60 * 60 * 24)) : null;
      const loginCount = act?.login_count || 0;
      // Activity score: 0-100
      let score = 0;
      if (loginCount > 0) score += Math.min(loginCount * 5, 40);
      if (daysSinceLogin !== null && daysSinceLogin < 2) score += 30;
      else if (daysSinceLogin !== null && daysSinceLogin < 5) score += 15;
      if ((l.branches_count || 0) > 1) score += 15;
      score = Math.min(100, score);
      let priority: "high" | "medium" | "low" | "none" = "none";
      if (score >= 60) priority = "high";
      else if (score >= 30) priority = "medium";
      else if (score > 0) priority = "low";

      return {
        lead: l,
        company: comp,
        lastLogin,
        daysSinceLogin,
        loginCount,
        score,
        priority,
      };
    });
  }, [leads, activity, companies]);

  const updateLead = useMutation({
    mutationFn: async (payload: any) => {
      const { id, ...rest } = payload;
      const { error } = await supabase.from("trial_leads" as any).update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-leads"] });
      toast.success("تم التحديث");
      setEditing(null);
    },
    onError: (e: any) => toast.error(e?.message || "فشل التحديث"),
  });

  const convertToPaid = useMutation({
    mutationFn: async (companyId: string) => {
      // Update company + lead
      await supabase.from("companies").update({ subscription_status: "active" }).eq("id", companyId);
      await supabase.from("trial_leads" as any).update({ status: "converted", last_contact_at: new Date().toISOString() }).eq("company_id", companyId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-leads"] });
      qc.invalidateQueries({ queryKey: ["admin-companies-all"] });
      toast.success("تم تحويل الشركة لاشتراك مدفوع");
    },
  });

  const deleteLead = useMutation({
    mutationFn: async (leadId: string) => {
      const { data, error } = await supabase.functions.invoke("admin-lead-actions", {
        body: { action: "delete_lead", lead_id: leadId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-leads"] });
      qc.invalidateQueries({ queryKey: ["admin-companies-all"] });
      qc.invalidateQueries({ queryKey: ["admin-activity"] });
      toast.success("تم حذف السجل بالكامل");
    },
    onError: (e: any) => toast.error(e?.message || "فشل الحذف"),
  });

  const resetPassword = useMutation({
    mutationFn: async (leadId: string) => {
      const { data, error } = await supabase.functions.invoke("admin-lead-actions", {
        body: { action: "reset_password", lead_id: leadId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { email: string; password: string };
    },
    onSuccess: (data) => {
      setResetResult({ email: data.email, password: data.password });
      toast.success("تم إنشاء كلمة سر جديدة");
    },
    onError: (e: any) => toast.error(e?.message || "فشل التعيين"),
  });

  return (
    <div dir="rtl" className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-foreground">إدارة العملاء</h1>
          <p className="text-sm text-muted-foreground mt-1">تتبع العملاء المحتملين وحالة التجارب المجانية</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["admin-leads"] })}>
          <RefreshCw size={16} className="ml-1" /> تحديث
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Users} label="إجمالي العملاء" value={kpis.total} color="from-blue-500 to-blue-600" />
        <KpiCard icon={UserCheck} label="تجارب نشطة" value={kpis.trialActive} color="from-emerald-500 to-emerald-600" />
        <KpiCard icon={Clock} label="منتهية" value={kpis.expired} color="from-orange-500 to-orange-600" />
        <KpiCard icon={TrendingUp} label="تم التحويل" value={kpis.converted} color="from-purple-500 to-purple-600" />
      </div>

      <Tabs defaultValue="leads" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="leads">العملاء المحتملون</TabsTrigger>
          <TabsTrigger value="activity">لوحة نشاط المبيعات</TabsTrigger>
        </TabsList>

        {/* Tab 1: Leads */}
        <TabsContent value="leads" className="mt-4">
          <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="بحث بالاسم، الهاتف، الإيميل..."
                  className="w-full pr-10 pl-4 py-2 rounded-xl border border-border bg-background text-sm"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 rounded-xl border border-border bg-background text-sm font-bold"
              >
                <option value="all">كل الحالات</option>
                {Object.entries(STATUS_META).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-center border-b border-border text-xs font-black text-muted-foreground">
                    <th className="p-3">المطعم</th>
                    <th className="p-3">المسؤول</th>
                    <th className="p-3">الاتصال</th>
                    <th className="p-3">المدينة</th>
                    <th className="p-3">الفروع</th>
                    <th className="p-3">الحالة</th>
                    <th className="p-3">التسجيل</th>
                    <th className="p-3">نهاية التجربة</th>
                    <th className="p-3">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">جاري التحميل...</td></tr>
                  )}
                  {!isLoading && filteredLeads.length === 0 && (
                    <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">لا يوجد عملاء</td></tr>
                  )}
                  {filteredLeads.map((l) => {
                    const daysLeft = daysBetween(l.trial_end_date);
                    const meta = STATUS_META[l.status] || STATUS_META.new_lead;
                    return (
                      <tr key={l.id} className="border-b border-border/50 hover:bg-muted/30 text-center align-middle">
                        <td className="p-3 font-bold">{l.restaurant_name}</td>
                        <td className="p-3">{l.contact_name}</td>
                        <td className="p-3">
                          <div className="flex flex-col gap-0.5 text-xs items-center">
                            <span>{l.phone}</span>
                            <span className="text-muted-foreground">{l.email}</span>
                          </div>
                        </td>
                        <td className="p-3 text-xs">{l.city || "-"}</td>
                        <td className="p-3">{l.branches_count || 1}</td>
                        <td className="p-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${meta.color} ${meta.bg}`}>
                            {meta.label}
                          </span>
                        </td>
                        <td className="p-3 text-xs">{new Date(l.created_at).toLocaleDateString("ar-EG")}</td>
                        <td className="p-3 text-xs">
                          {l.trial_end_date && (
                            <div>
                              <div>{new Date(l.trial_end_date).toLocaleDateString("ar-EG")}</div>
                              {daysLeft !== null && (
                                <div className={`text-[10px] font-bold ${daysLeft < 0 ? "text-red-600" : daysLeft <= 3 ? "text-orange-600" : "text-emerald-600"}`}>
                                  {daysLeft < 0 ? `منتهية منذ ${Math.abs(daysLeft)} يوم` : `متبقي ${daysLeft} يوم`}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1 justify-center flex-wrap">
                            <a
                              href={`https://wa.me/${(l.whatsapp || l.phone || "").replace(/\D/g, "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                              title="واتساب"
                            >
                              <MessageCircle size={14} />
                            </a>
                            <a
                              href={`tel:${l.phone}`}
                              className="p-1.5 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200"
                              title="اتصال"
                            >
                              <Phone size={14} />
                            </a>
                            <button
                              onClick={() => setEditing(l)}
                              className="p-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
                              title="تعديل"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`إنشاء كلمة سر جديدة لـ ${l.email}؟`)) {
                                  resetPassword.mutate(l.id);
                                }
                              }}
                              disabled={resetPassword.isPending}
                              className="p-1.5 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50"
                              title="تعيين كلمة سر جديدة"
                            >
                              <Key size={14} />
                            </button>
                            {l.status !== "converted" && l.company_id && (
                              <button
                                onClick={() => {
                                  if (confirm("تحويل هذه الشركة لاشتراك مدفوع؟")) {
                                    convertToPaid.mutate(l.company_id);
                                  }
                                }}
                                className="p-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200"
                                title="تحويل لمدفوع"
                              >
                                <CheckCircle2 size={14} />
                              </button>
                            )}
                            <button
                              onClick={() => {
                                if (confirm(`⚠️ حذف نهائي لسجل ${l.restaurant_name} وكل بياناته؟\nلا يمكن التراجع.`)) {
                                  deleteLead.mutate(l.id);
                                }
                              }}
                              disabled={deleteLead.isPending}
                              className="p-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
                              title="حذف نهائي"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: Activity Dashboard */}
        <TabsContent value="activity" className="mt-4">
          <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles size={16} className="text-amber-500" />
              العملاء مرتبين حسب نسبة النشاط — الأعلى يستحق الاتصال أولاً
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-center border-b border-border text-xs font-black text-muted-foreground">
                    <th className="p-3">العميل</th>
                    <th className="p-3">الحالة</th>
                    <th className="p-3">آخر دخول</th>
                    <th className="p-3">مرات الدخول</th>
                    <th className="p-3">الفروع</th>
                    <th className="p-3">نسبة النشاط</th>
                    <th className="p-3">أولوية التواصل</th>
                    <th className="p-3">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {activityRows
                    .sort((a, b) => b.score - a.score)
                    .map(({ lead: l, lastLogin, daysSinceLogin, loginCount, score, priority }) => {
                      const meta = STATUS_META[l.status] || STATUS_META.new_lead;
                      const scoreColor = score >= 60 ? "bg-emerald-500" : score >= 30 ? "bg-amber-500" : score > 0 ? "bg-orange-500" : "bg-slate-300";
                      const priorityMeta = {
                        high: { label: "عالية 🔥", cls: "bg-red-100 text-red-700" },
                        medium: { label: "متوسطة", cls: "bg-amber-100 text-amber-700" },
                        low: { label: "منخفضة", cls: "bg-blue-100 text-blue-700" },
                        none: { label: "لم يدخل", cls: "bg-slate-100 text-slate-500" },
                      }[priority];
                      return (
                        <tr key={l.id} className="border-b border-border/50 hover:bg-muted/30 text-center align-middle">
                          <td className="p-3">
                            <div className="font-bold">{l.restaurant_name}</div>
                            <div className="text-xs text-muted-foreground">{l.contact_name}</div>
                          </td>
                          <td className="p-3">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${meta.color} ${meta.bg}`}>{meta.label}</span>
                          </td>
                          <td className="p-3 text-xs">
                            {lastLogin ? (
                              <div>
                                <div>{lastLogin.toLocaleDateString("ar-EG")}</div>
                                <div className="text-muted-foreground">منذ {daysSinceLogin} يوم</div>
                              </div>
                            ) : (
                              <span className="text-red-600 font-bold">لم يدخل بعد</span>
                            )}
                          </td>
                          <td className="p-3 text-center font-bold">{loginCount}</td>
                          <td className="p-3 text-center">{l.branches_count || 1}</td>
                          <td className="p-3 min-w-[140px]">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                                <div className={`h-full ${scoreColor}`} style={{ width: `${score}%` }} />
                              </div>
                              <span className="text-xs font-bold w-8">{score}%</span>
                            </div>
                          </td>
                          <td className="p-3">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${priorityMeta.cls}`}>{priorityMeta.label}</span>
                          </td>
                          <td className="p-3">
                            <a
                              href={`https://wa.me/${(l.whatsapp || l.phone || "").replace(/\D/g, "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"
                            >
                              <MessageCircle size={12} /> تواصل
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل العميل</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-bold">الحالة</label>
                <select
                  value={editing.status}
                  onChange={(e) => setEditing({ ...editing, status: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-border bg-background text-sm"
                >
                  {Object.entries(STATUS_META).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-bold">ملاحظات المبيعات</label>
                <textarea
                  value={editing.admin_notes || ""}
                  onChange={(e) => setEditing({ ...editing, admin_notes: e.target.value })}
                  rows={4}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-border bg-background text-sm"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>إلغاء</Button>
            <Button
              onClick={() => updateLead.mutate({
                id: editing.id,
                status: editing.status,
                admin_notes: editing.admin_notes,
                last_contact_at: new Date().toISOString(),
              })}
              disabled={updateLead.isPending}
            >
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password result dialog */}
      <Dialog open={!!resetResult} onOpenChange={(o) => !o && setResetResult(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-emerald-700">تم تعيين كلمة سر جديدة ✅</DialogTitle>
          </DialogHeader>
          {resetResult && (
            <div className="space-y-3 text-sm">
              <p className="text-slate-600">شارك هذه البيانات مع العميل عبر الواتساب فوراً. لن تظهر مرة أخرى.</p>
              <div className="rounded-xl border border-border bg-muted/50 p-3 space-y-2">
                <div>
                  <div className="text-xs text-muted-foreground font-bold">البريد الإلكتروني</div>
                  <div className="font-mono font-bold">{resetResult.email}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground font-bold">كلمة السر الجديدة</div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 font-mono font-bold text-lg tracking-wider bg-white px-3 py-2 rounded-lg border">{resetResult.password}</code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(resetResult.password);
                        toast.success("تم النسخ");
                      }}
                      className="p-2 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                      title="نسخ"
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setResetResult(null)}>تم</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const KpiCard: React.FC<{ icon: any; label: string; value: number; color: string }> = ({ icon: Icon, label, value, color }) => (
  <div className="relative overflow-hidden rounded-2xl bg-card border border-border p-5">
    <div className={`absolute -top-4 -left-4 w-24 h-24 rounded-full bg-gradient-to-br ${color} opacity-10`} />
    <div className="relative flex items-center justify-between">
      <div>
        <div className="text-xs text-muted-foreground font-bold mb-1">{label}</div>
        <div className="text-3xl font-black">{value}</div>
      </div>
      <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${color} text-white flex items-center justify-center shadow-lg`}>
        <Icon size={22} />
      </div>
    </div>
  </div>
);

export default AdminLeadsPage;
