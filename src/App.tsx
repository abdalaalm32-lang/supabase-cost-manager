/* eslint-disable @typescript-eslint/no-explicit-any */
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import React, { Suspense, lazy, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import logo3m from "@/assets/logo-3m.png";
import loginBg from "@/assets/login-bg.jpg";
import { LoginPage } from "@/pages/LoginPage";
import { HomePage } from "@/pages/HomePage";
import { TrialSignupPage } from "@/pages/TrialSignupPage";
import { useTrackCompanyLogin } from "@/hooks/useTrackCompanyLogin";
// Resilient lazy loader: retries once (cache-busted) if a chunk fails or the
// module namespace comes back undefined after a new deploy.
function lazyPage<T extends React.ComponentType<any>>(
  loader: () => Promise<any>,
  name: string
) {
  return lazy(async () => {
    let mod: any;
    try {
      mod = await loader();
    } catch {
      mod = undefined;
    }
    const pick = (m: any) => (m ? (m[name] ?? m.default) : undefined);
    let Comp = pick(mod);
    if (!Comp) {
      try {
        mod = await loader();
        Comp = pick(mod);
      } catch {
        /* ignore */
      }
    }
    if (!Comp) {
      if (!sessionStorage.getItem("chunk-reload-attempt")) {
        sessionStorage.setItem("chunk-reload-attempt", "1");
        window.location.reload();
      }
      return { default: (() => null) as unknown as T };
    }
    return { default: Comp as T };
  });
}

const AdminLeadsPage = lazyPage(() => import("@/pages/AdminLeadsPage"), "AdminLeadsPage");
const AdminTestimonialsPage = lazyPage(() => import("@/pages/AdminTestimonialsPage"), "AdminTestimonialsPage");

const DashboardPage = lazyPage(() => import("@/pages/DashboardPage"), "DashboardPage");
const RecipesPage = lazyPage(() => import("@/pages/RecipesPage"), "RecipesPage");
const PosGroupsPage = lazyPage(() => import("@/pages/PosGroupsPage"), "PosGroupsPage");
const PosItemsPage = lazyPage(() => import("@/pages/PosItemsPage"), "PosItemsPage");
const PosChannelsPage = lazyPage(() => import("@/pages/PosChannelsPage"), "PosChannelsPage");
const PosImportPage = lazyPage(() => import("@/pages/PosImportPage"), "PosImportPage");
const PosApiPage = lazyPage(() => import("@/pages/PosApiPage"), "PosApiPage");
const PosIntegrationPage = lazyPage(() => import("@/pages/PosIntegrationPage"), "PosIntegrationPage");
const PosScreenPage = lazyPage(() => import("@/pages/PosScreenPage"), "PosScreenPage");
const PosInvoicesPage = lazyPage(() => import("@/pages/PosInvoicesPage"), "PosInvoicesPage");
const PosItemSalesPage = lazyPage(() => import("@/pages/PosItemSalesPage"), "PosItemSalesPage");
const PosAnalyticsPage = lazyPage(() => import("@/pages/PosAnalyticsPage"), "PosAnalyticsPage");
const SettingsUsersPage = lazyPage(() => import("@/pages/SettingsUsersPage"), "SettingsUsersPage");
const AdminCompaniesPage = lazyPage(() => import("@/pages/AdminCompaniesPage"), "AdminCompaniesPage");
const CompanySettingsPage = lazyPage(() => import("@/pages/CompanySettingsPage"), "CompanySettingsPage");
const SettingsBranchesPage = lazyPage(() => import("@/pages/SettingsBranchesPage"), "SettingsBranchesPage");
const SettingsWarehousesPage = lazyPage(() => import("@/pages/SettingsWarehousesPage"), "SettingsWarehousesPage");
const InventoryMaterialsPage = lazyPage(() => import("@/pages/InventoryMaterialsPage"), "InventoryMaterialsPage");
const InventoryBalancesPage = lazyPage(() => import("@/pages/InventoryBalancesPage"), "InventoryBalancesPage");
const SupplyPricingPage = lazyPage(() => import("@/pages/SupplyPricingPage"), "SupplyPricingPage");
const PurchaseInvoicesPage = lazyPage(() => import("@/pages/PurchaseInvoicesPage"), "PurchaseInvoicesPage");
const PurchaseSuppliersPage = lazyPage(() => import("@/pages/PurchaseSuppliersPage"), "PurchaseSuppliersPage");
const AddPurchaseInvoicePage = lazyPage(() => import("@/pages/AddPurchaseInvoicePage"), "AddPurchaseInvoicePage");
const EditPurchaseInvoicePage = lazyPage(() => import("@/pages/EditPurchaseInvoicePage"), "EditPurchaseInvoicePage");
const SupplierDebtsPage = lazyPage(() => import("@/pages/SupplierDebtsPage"), "SupplierDebtsPage");
const CostAdjustmentPage = lazyPage(() => import("@/pages/CostAdjustmentPage"), "CostAdjustmentPage");
const AddCostAdjustmentPage = lazyPage(() => import("@/pages/AddCostAdjustmentPage"), "AddCostAdjustmentPage");
const StocktakeListPage = lazyPage(() => import("@/pages/StocktakeListPage"), "StocktakeListPage");
const InstantStocktakeListPage = lazyPage(() => import("@/pages/InstantStocktakeListPage"), "InstantStocktakeListPage");
const StocktakeDetailPage = lazyPage(() => import("@/pages/StocktakeDetailPage"), "StocktakeDetailPage");
const WasteListPage = lazyPage(() => import("@/pages/WasteListPage"), "WasteListPage");
const WasteDetailPage = lazyPage(() => import("@/pages/WasteDetailPage"), "WasteDetailPage");
const ProductionListPage = lazyPage(() => import("@/pages/ProductionListPage"), "ProductionListPage");
const ProductionDetailPage = lazyPage(() => import("@/pages/ProductionDetailPage"), "ProductionDetailPage");
const TransferListPage = lazyPage(() => import("@/pages/TransferListPage"), "TransferListPage");
const TransferDetailPage = lazyPage(() => import("@/pages/TransferDetailPage"), "TransferDetailPage");
const SupplyInvoicesToBranchesPage = lazyPage(() => import("@/pages/SupplyInvoicesToBranchesPage"), "SupplyInvoicesToBranchesPage");
const ProductionRecipesPage = lazyPage(() => import("@/pages/ProductionRecipesPage"), "ProductionRecipesPage");
const MenuOffersPage = lazyPage(() => import("@/pages/MenuOffersPage"), "MenuOffersPage");
const CostAnalysisPage = lazyPage(() => import("@/pages/CostAnalysisPage"), "CostAnalysisPage");
const VarianceAnalysisPage = lazyPage(() => import("@/pages/VarianceAnalysisPage"), "VarianceAnalysisPage");
const InventoryMovementPage = lazyPage(() => import("@/pages/InventoryMovementPage"), "InventoryMovementPage");
const PurchaseReportsPage = lazyPage(() => import("@/pages/PurchaseReportsPage"), "PurchaseReportsPage");
const InventoryLevelsPage = lazyPage(() => import("@/pages/InventoryLevelsPage"), "InventoryLevelsPage");
const ProductionReportsPage = lazyPage(() => import("@/pages/ProductionReportsPage"), "ProductionReportsPage");
const WasteReportsPage = lazyPage(() => import("@/pages/WasteReportsPage"), "WasteReportsPage");
const CostAdjustmentReportsPage = lazyPage(() => import("@/pages/CostAdjustmentReportsPage"), "CostAdjustmentReportsPage");
const TransferReportsPage = lazyPage(() => import("@/pages/TransferReportsPage"), "TransferReportsPage");
const InventoryTurnoverPage = lazyPage(() => import("@/pages/InventoryTurnoverPage"), "InventoryTurnoverPage");
const MenuEngineeringPage = lazyPage(() => import("@/pages/MenuEngineeringPage"), "MenuEngineeringPage");
const IndirectExpensesPage = lazyPage(() => import("@/pages/IndirectExpensesPage"), "IndirectExpensesPage");
const MenuAnalysisPage = lazyPage(() => import("@/pages/MenuAnalysisPage"), "MenuAnalysisPage");
const MenuFinalReportPage = lazyPage(() => import("@/pages/MenuFinalReportPage"), "MenuFinalReportPage");
const SystemLayout = lazyPage(() => import("@/components/SystemLayout"), "SystemLayout");
const AdminMessagesPage = lazyPage(() => import("@/pages/AdminMessagesPage"), "AdminMessagesPage");
const AdminSubscriptionLogPage = lazyPage(() => import("@/pages/AdminSubscriptionLogPage"), "AdminSubscriptionLogPage");
const PnlPage = lazyPage(() => import("@/pages/PnlPage"), "PnlPage");
const BranchComparisonPage = lazyPage(() => import("@/pages/BranchComparisonPage"), "BranchComparisonPage");
const CallCenterPage = lazyPage(() => import("@/pages/CallCenterPage"), "CallCenterPage");
const DriverSettlementPage = lazyPage(() => import("@/pages/DriverSettlementPage"), "DriverSettlementPage");
const DeliveryCompaniesPage = lazyPage(() => import("@/pages/DeliveryCompaniesPage"), "DeliveryCompaniesPage");
const PosShiftsPage = lazyPage(() => import("@/pages/PosShiftsPage"), "PosShiftsPage");
const PosShiftReportsPage = lazyPage(() => import("@/pages/PosShiftReportsPage"), "PosShiftReportsPage");

const queryClient = new QueryClient();

const OfflineScreen = () => (
  <div className="fixed inset-0 z-[200] flex items-center justify-center">
    <img src={loginBg} alt="" className="absolute inset-0 w-full h-full object-cover" />
    <div className="absolute inset-0 bg-[hsl(220,60%,8%)]/80 backdrop-blur-sm" />
    <div className="relative z-10 text-center p-8">
      <img src={logo3m} alt="3M GSC Logo" className="w-36 h-36 mx-auto mb-6 object-contain drop-shadow-lg" />
      <h2 className="text-2xl font-black text-foreground mb-3">لا يوجد اتصال بالإنترنت</h2>
      <p className="text-muted-foreground text-sm max-w-xs mx-auto">
        عليك الاتصال بالإنترنت لاستكمال استخدام النظام
      </p>
    </div>
  </div>
);

const AppLoadingScreen: React.FC<{ message?: string }> = ({ message = "جاري التحميل..." }) => (
  <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 p-6">
    <div className="w-full max-w-sm rounded-3xl border border-border/50 bg-card/90 p-8 text-center shadow-2xl backdrop-blur-xl">
      <div className="mx-auto mb-5 h-14 w-14 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
      <h1 className="mb-2 text-2xl font-black text-foreground">جاري التحميل</h1>
      <p className="text-sm leading-6 text-muted-foreground">{message}</p>
    </div>
  </div>
);

const useOnlineStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);
  return isOnline;
};

const SuspendedOverlay = () => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center">
    <div className="absolute inset-0 bg-background/60 backdrop-blur-xl" />
    <div className="relative z-10 text-center p-8 max-w-md">
      <div className="w-20 h-20 rounded-full bg-destructive/15 flex items-center justify-center mx-auto mb-6">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-destructive"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>
      </div>
      <h2 className="text-2xl font-black text-foreground mb-3">تم إيقاف الحساب</h2>
      <p className="text-muted-foreground text-sm mb-6">
        تم إيقاف حسابك من قبل الإدارة. لا يمكنك الوصول إلى النظام حالياً.
        <br />تواصل مع مدير النظام لإعادة تفعيل حسابك.
      </p>
    </div>
  </div>
);

const MissingProfileScreen: React.FC<{ onLogout: () => Promise<void> }> = ({ onLogout }) => (
  <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 p-6">
    <div className="w-full max-w-md rounded-3xl border border-border/50 bg-card/95 p-8 text-center shadow-2xl backdrop-blur-xl">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
      </div>
      <h2 className="mb-3 text-2xl font-black text-foreground">تعذر تجهيز الحساب</h2>
      <p className="text-sm leading-6 text-muted-foreground">
        حصل تأخير أو مشكلة في تحميل بيانات الحساب، لذلك النظام لم يعد يتركك على شاشة سوداء.
        يمكنك إعادة المحاولة أو تسجيل الخروج ثم الدخول مرة أخرى.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          onClick={() => window.location.reload()}
          className="rounded-xl bg-secondary px-5 py-2.5 text-sm font-bold text-secondary-foreground transition-opacity hover:opacity-90"
        >
          إعادة المحاولة
        </button>
        <button
          onClick={() => void onLogout()}
          className="rounded-xl bg-destructive px-5 py-2.5 text-sm font-bold text-destructive-foreground transition-opacity hover:opacity-90"
        >
          تسجيل الخروج
        </button>
      </div>
    </div>
  </div>
);

const CompanyDeactivatedOverlay: React.FC<{ isOwner: boolean }> = ({ isOwner }) => {
  const { auth } = useAuth();
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [replyData, setReplyData] = useState<any>(null);

  const { data: existingTicket } = useQuery({
    queryKey: ["suspension-inquiry", auth.profile?.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("support_tickets")
        .select("*")
        .eq("company_id", auth.profile!.company_id)
        .eq("subject", "استعلام عن سبب تعطيل الشركة")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: isOwner && !!auth.profile?.company_id,
  });

  const sendInquiry = async () => {
    if (!auth.profile) return;
    setIsSending(true);
    try {
      const { data: company } = await supabase
        .from("companies")
        .select("name, code")
        .eq("id", auth.profile.company_id)
        .single();

      await supabase.from("support_tickets").insert({
        company_id: auth.profile.company_id,
        company_name: company?.name || "",
        company_code: company?.code || "",
        sender_id: auth.user!.id,
        sender_name: auth.profile.full_name,
        subject: "استعلام عن سبب تعطيل الشركة",
        message: `تم تعطيل الشركة "${company?.name}" (${company?.code}) وأريد معرفة السبب.`,
      });
      setSent(true);
    } catch {
    } finally {
      setIsSending(false);
    }
  };

  const hasReply = existingTicket?.admin_reply;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-background/60 backdrop-blur-xl" />
      <div className="relative z-10 text-center p-8 max-w-md">
        <div className="w-20 h-20 rounded-full bg-destructive/15 flex items-center justify-center mx-auto mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-destructive"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>
        </div>
        {isOwner ? (
          <>
            <h2 className="text-2xl font-black text-foreground mb-3">تم تعطيل الشركة</h2>
            <p className="text-muted-foreground text-sm mb-6">
              تم تعطيل شركتك من خلال الإدارة. لا يمكنك الوصول إلى النظام حالياً.
            </p>

            {hasReply && (
              <div className="mb-4 p-4 rounded-xl bg-primary/5 border border-primary/20 text-start" dir="rtl">
                <p className="text-xs font-bold text-primary mb-1">رد الإدارة:</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{existingTicket.admin_reply}</p>
              </div>
            )}

            {sent ? (
              <p className="text-sm text-primary font-medium">تم إرسال الاستعلام بنجاح ✓</p>
            ) : (
              <button
                onClick={sendInquiry}
                disabled={isSending}
                className="gradient-primary text-primary-foreground px-6 py-3 rounded-xl font-bold text-sm disabled:opacity-50"
              >
                {isSending ? "جاري الإرسال..." : "استعلام عن السبب"}
              </button>
            )}
          </>
        ) : (
          <>
            <h2 className="text-2xl font-black text-foreground mb-3">النظام معطل</h2>
            <p className="text-muted-foreground text-sm mb-6">
              سيستم الشركة معطل من خلال الإدارة.
              <br />تواصل مع مدير الشركة لمزيد من المعلومات.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

const SubscriptionExpiredOverlay: React.FC<{ type: "company" | "user" }> = ({ type }) => {
  const { logout } = useAuth();
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-background/60 backdrop-blur-xl" />
      <div className="relative z-10 text-center p-8 max-w-md">
        <div className="w-20 h-20 rounded-full bg-primary/15 flex items-center justify-center mx-auto mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
        </div>
        <h2 className="text-2xl font-black text-foreground mb-3">
          {type === "company" ? "انتهت مدة اشتراك الشركة" : "انتهت مدة اشتراكك"}
        </h2>
        <p className="text-muted-foreground text-sm mb-6">
          {type === "company"
            ? "انتهت مدة اشتراك الشركة في النظام. تواصل مع الإدارة لتجديد الاشتراك."
            : "انتهت مدة اشتراكك في النظام. تواصل مع مدير الشركة لتجديد الاشتراك."}
        </p>
        <button
          onClick={() => logout()}
          className="bg-destructive text-destructive-foreground px-6 py-3 rounded-xl font-bold text-sm"
        >
          تسجيل الخروج
        </button>
      </div>
    </div>
  );
};

const TrialExpiredOverlay: React.FC<{ endDate?: string }> = ({ endDate }) => {
  const { logout } = useAuth();
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-background/70 backdrop-blur-xl" />
      <div className="relative z-10 text-center p-8 max-w-md">
        <div className="w-20 h-20 rounded-full bg-orange-500/15 flex items-center justify-center mx-auto mb-6">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-orange-500"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
        </div>
        <h2 className="text-2xl font-black text-foreground mb-3">انتهت الفترة التجريبية</h2>
        <p className="text-muted-foreground text-sm mb-2">
          انتهت فترة التجربة المجانية {endDate && `بتاريخ ${new Date(endDate).toLocaleDateString("ar-EG")}`}.
        </p>
        <p className="text-muted-foreground text-sm mb-6">يرجى التواصل معنا لتفعيل الاشتراك المدفوع.</p>
        <div className="flex flex-col gap-3">
          <a
            href="https://wa.me/201061208033"
            target="_blank" rel="noopener noreferrer"
            className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-emerald-700"
          >
            تواصل عبر واتساب لتفعيل الاشتراك
          </a>
          <button onClick={() => logout()} className="bg-slate-200 text-slate-700 px-6 py-2.5 rounded-xl font-bold text-sm">
            تسجيل الخروج
          </button>
        </div>
      </div>
    </div>
  );
};

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { auth, logout } = useAuth();
  const qc = useQueryClient();
  useTrackCompanyLogin();

  const { data: companyStatus } = useQuery({
    queryKey: ["company-active-status", auth.profile?.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("active, subscription_type, subscription_minutes, subscription_start, subscription_end, subscription_status, trial_end_date")
        .eq("id", auth.profile!.company_id)
        .single();
      return data;
    },
    enabled: !!auth.profile?.company_id && !auth.isAdmin,
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (!auth.profile?.company_id || auth.isAdmin) return;
    const channel = supabase
      .channel("company-active-watch")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "companies", filter: `id=eq.${auth.profile.company_id}` }, () => {
        qc.invalidateQueries({ queryKey: ["company-active-status", auth.profile?.company_id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [auth.profile?.company_id, auth.isAdmin, qc]);

  const companyDeactivated = !auth.isAdmin && companyStatus && !companyStatus.active;
  const userSuspended = !!(auth.profile && auth.profile.status !== "نشط");

  // Company subscription expiration check
  const companySubscriptionExpired = !auth.isAdmin && !!companyStatus
    && companyStatus.subscription_type
    && companyStatus.subscription_type !== "unlimited"
    && !!companyStatus.subscription_end
    && new Date(companyStatus.subscription_end) < new Date();

  useEffect(() => {
    if (companyDeactivated) {
      supabase.auth.signOut();
    }
  }, [companyDeactivated]);

  useEffect(() => {
    if (userSuspended) {
      supabase.auth.signOut();
    }
  }, [userSuspended]);

  // Notify admin once when company subscription expires (auto-create support ticket)
  useEffect(() => {
    if (!companySubscriptionExpired || !auth.profile?.company_id) return;
    const flagKey = `subscription_expired_notified_${auth.profile.company_id}_${companyStatus?.subscription_end}`;
    if (sessionStorage.getItem(flagKey)) return;
    (async () => {
      try {
        const { data: existing } = await supabase
          .from("support_tickets")
          .select("id")
          .eq("company_id", auth.profile!.company_id)
          .eq("subject", "انتهاء اشتراك الشركة")
          .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .limit(1)
          .maybeSingle();
        if (existing) {
          sessionStorage.setItem(flagKey, "1");
          return;
        }
        const { data: company } = await supabase
          .from("companies")
          .select("name, code")
          .eq("id", auth.profile!.company_id)
          .single();
        await supabase.from("support_tickets").insert({
          company_id: auth.profile!.company_id,
          company_name: company?.name || "",
          company_code: company?.code || "",
          sender_id: auth.user!.id,
          sender_name: auth.profile!.full_name,
          subject: "انتهاء اشتراك الشركة",
          message: `انتهى اشتراك الشركة "${company?.name}" (${company?.code}) بتاريخ ${new Date(companyStatus!.subscription_end!).toLocaleString("ar-EG")}. الرجاء التجديد.`,
        });
        sessionStorage.setItem(flagKey, "1");
      } catch {}
    })();
  }, [companySubscriptionExpired, auth.profile?.company_id, auth.user?.id, companyStatus?.subscription_end]);

  if (!auth.isReady) return <AppLoadingScreen message="جاري تجهيز الجلسة..." />;
  if (companyDeactivated) return <Navigate to="/login?reason=company_deactivated" replace />;
  if (userSuspended) return <Navigate to="/login?reason=user_suspended" replace />;
  if (!auth.session) return <Navigate to="/login" replace />;
  if (!auth.profile && !auth.isAdmin && !auth.isOwner) return <MissingProfileScreen onLogout={logout} />;

  // Trial expired check
  const cs: any = companyStatus || {};
  const trialExpired = !auth.isAdmin && (
    cs.subscription_status === "expired"
    || (cs.subscription_status === "trial" && cs.trial_end_date && new Date(cs.trial_end_date) < new Date())
  );
  if (trialExpired) {
    return <TrialExpiredOverlay endDate={cs.trial_end_date} />;
  }

  // Block company-wide access when subscription expired (applies to both owner and users)
  if (companySubscriptionExpired) {
    return <SubscriptionExpiredOverlay type="company" />;
  }

  if (!auth.isAdmin && !auth.isOwner && auth.profile) {
    const p = auth.profile as any;
    if (p.subscription_type && p.subscription_type !== "unlimited" && p.subscription_end) {
      const endDate = new Date(p.subscription_end);
      if (endDate < new Date()) {
        return <SubscriptionExpiredOverlay type="user" />;
      }
    }
  }

  return <>{children}</>;
};

const LoginPageWrapper = () => <LoginPage />;

const PermissionGuard: React.FC<{ permKey: string; children: React.ReactNode }> = ({ permKey, children }) => {
  const { auth, hasPermission, logout } = useAuth();
  if (!auth.isReady) return <AppLoadingScreen message="جاري التحقق من الصلاحيات..." />;
  if (!auth.session) return <Navigate to="/login" replace />;
  if (!auth.profile && !auth.isAdmin && !auth.isOwner) return <MissingProfileScreen onLogout={logout} />;
  if (!hasPermission(permKey)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

const AdminGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { auth } = useAuth();
  if (!auth.isReady) return <AppLoadingScreen message="جاري التحقق من الحساب..." />;
  if (!auth.session) return <Navigate to="/login" replace />;
  if (!auth.isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

const OwnerOrAdminGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { auth, hasPermission, logout } = useAuth();
  if (!auth.isReady) return <AppLoadingScreen message="جاري التحقق من الحساب..." />;
  if (!auth.session) return <Navigate to="/login" replace />;
  if (!auth.profile && !auth.isAdmin && !auth.isOwner) return <MissingProfileScreen onLogout={logout} />;
  if (!auth.isAdmin && !auth.isOwner && !hasPermission("settings")) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

const AppRoutes = () => {
  const { auth, logout } = useAuth();
  const location = useLocation();

  const loginReason = new URLSearchParams(location.search).get("reason");
  const allowLoginMessage = location.pathname === "/login" && !!loginReason;

  if (!auth.isReady) {
    return <AppLoadingScreen />;
  }

  return (
    <Suspense fallback={<AppLoadingScreen message="جاري فتح الصفحة..." />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/trial-signup" element={<TrialSignupPage />} />
        <Route path="/login" element={auth.session && !allowLoginMessage ? <Navigate to="/dashboard" replace /> : <LoginPageWrapper />} />

        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <SystemLayout
                onLogout={logout}
                companyName={auth.profile?.company_id || ""}
                userName={auth.profile?.full_name || ""}
              >
                <Routes>
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/pos" element={<Navigate to="/pos/screen" replace />} />
                  <Route path="/pos/screen" element={<PermissionGuard permKey="pos"><PosScreenPage /></PermissionGuard>} />
                  <Route path="/sales" element={<Navigate to="/pos/invoices" replace />} />
                  <Route path="/pos/invoices" element={<PermissionGuard permKey="sales_management"><PosInvoicesPage /></PermissionGuard>} />
                  <Route path="/pos/item-sales" element={<PermissionGuard permKey="sales_management"><PosItemSalesPage /></PermissionGuard>} />
                  <Route path="/pos/analytics" element={<PermissionGuard permKey="sales_management"><PosAnalyticsPage /></PermissionGuard>} />
                  <Route path="/pos/groups" element={<PermissionGuard permKey="sales_management"><PosGroupsPage /></PermissionGuard>} />
                  <Route path="/pos/items" element={<PermissionGuard permKey="sales_management"><PosItemsPage /></PermissionGuard>} />
                  <Route path="/pos/channels" element={<PermissionGuard permKey="sales_management"><PosChannelsPage /></PermissionGuard>} />
                  <Route path="/integrations/pos-import" element={<PermissionGuard permKey="sales_management"><PosImportPage /></PermissionGuard>} />
                  <Route path="/integrations/pos-api" element={<PermissionGuard permKey="sales_management"><PosIntegrationPage /></PermissionGuard>} />
                  <Route path="/call-center" element={<PermissionGuard permKey="call_center"><CallCenterPage /></PermissionGuard>} />
                  <Route path="/sales/driver-settlement" element={<PermissionGuard permKey="sales_management"><DriverSettlementPage /></PermissionGuard>} />
                  <Route path="/sales/delivery-companies" element={<PermissionGuard permKey="sales_management"><DeliveryCompaniesPage /></PermissionGuard>} />
                  <Route path="/sales/shifts" element={<PermissionGuard permKey="sales_management"><PosShiftsPage /></PermissionGuard>} />
                  <Route path="/sales/shift-reports" element={<PermissionGuard permKey="sales_management"><PosShiftReportsPage /></PermissionGuard>} />
                  <Route path="/inventory" element={<PermissionGuard permKey="inventory"><Navigate to="/inventory/materials" replace /></PermissionGuard>} />
                  <Route path="/inventory/materials" element={<PermissionGuard permKey="inventory"><InventoryMaterialsPage /></PermissionGuard>} />
                  <Route path="/inventory/balances" element={<PermissionGuard permKey="inventory"><InventoryBalancesPage /></PermissionGuard>} />
                  <Route path="/inventory/supply-pricing" element={<PermissionGuard permKey="inventory"><SupplyPricingPage /></PermissionGuard>} />
                  <Route path="/transfers" element={<PermissionGuard permKey="transfers"><TransferListPage /></PermissionGuard>} />
                  <Route path="/transfers/supply-invoices" element={<PermissionGuard permKey="transfers"><SupplyInvoicesToBranchesPage /></PermissionGuard>} />
                  <Route path="/transfers/add" element={<PermissionGuard permKey="transfers"><TransferDetailPage /></PermissionGuard>} />
                  <Route path="/transfers/:id" element={<PermissionGuard permKey="transfers"><TransferDetailPage /></PermissionGuard>} />
                  <Route path="/stocktake" element={<PermissionGuard permKey="stocktake"><Navigate to="/stocktake/periodic" replace /></PermissionGuard>} />
                  <Route path="/stocktake/periodic" element={<PermissionGuard permKey="stocktake"><StocktakeListPage /></PermissionGuard>} />
                  <Route path="/stocktake/periodic/:id" element={<PermissionGuard permKey="stocktake"><StocktakeDetailPage /></PermissionGuard>} />
                  <Route path="/stocktake/instant" element={<PermissionGuard permKey="stocktake"><InstantStocktakeListPage /></PermissionGuard>} />
                  <Route path="/stocktake/instant/:id" element={<PermissionGuard permKey="stocktake"><StocktakeDetailPage /></PermissionGuard>} />
                  <Route path="/stocktake/:id" element={<PermissionGuard permKey="stocktake"><StocktakeDetailPage /></PermissionGuard>} />
                  <Route path="/recipes" element={<PermissionGuard permKey="recipes"><Navigate to="/recipes/products" replace /></PermissionGuard>} />
                  <Route path="/recipes/products" element={<PermissionGuard permKey="recipes"><RecipesPage /></PermissionGuard>} />
                  <Route path="/recipes/production" element={<PermissionGuard permKey="recipes"><ProductionRecipesPage /></PermissionGuard>} />
                  <Route path="/recipes/offers" element={<PermissionGuard permKey="recipes"><MenuOffersPage /></PermissionGuard>} />
                  <Route path="/production" element={<PermissionGuard permKey="production"><ProductionListPage /></PermissionGuard>} />
                  <Route path="/production/add" element={<PermissionGuard permKey="production"><ProductionDetailPage /></PermissionGuard>} />
                  <Route path="/production/:id" element={<PermissionGuard permKey="production"><ProductionDetailPage /></PermissionGuard>} />
                  <Route path="/waste" element={<PermissionGuard permKey="waste"><WasteListPage /></PermissionGuard>} />
                  <Route path="/waste/:id" element={<PermissionGuard permKey="waste"><WasteDetailPage /></PermissionGuard>} />
                  <Route path="/purchases" element={<PermissionGuard permKey="purchases"><Navigate to="/purchases/invoices" replace /></PermissionGuard>} />
                  <Route path="/purchases/invoices" element={<PermissionGuard permKey="purchases"><PurchaseInvoicesPage /></PermissionGuard>} />
                  <Route path="/purchases/suppliers" element={<PermissionGuard permKey="purchases"><PurchaseSuppliersPage /></PermissionGuard>} />
                  <Route path="/purchases/add-invoice" element={<PermissionGuard permKey="purchases"><AddPurchaseInvoicePage /></PermissionGuard>} />
                  <Route path="/purchases/edit-invoice/:id" element={<PermissionGuard permKey="purchases"><EditPurchaseInvoicePage /></PermissionGuard>} />
                  <Route path="/purchases/view-invoice/:id" element={<PermissionGuard permKey="purchases"><EditPurchaseInvoicePage /></PermissionGuard>} />
                  <Route path="/purchases/debts" element={<PermissionGuard permKey="purchases"><SupplierDebtsPage /></PermissionGuard>} />
                  <Route path="/costing" element={<PermissionGuard permKey="costing"><CostAnalysisPage /></PermissionGuard>} />
                  <Route path="/variance-analysis" element={<PermissionGuard permKey="variance-analysis"><VarianceAnalysisPage /></PermissionGuard>} />
                  <Route path="/menu-costing" element={<PermissionGuard permKey="menu-costing"><Navigate to="/menu-costing/indirect-expenses" replace /></PermissionGuard>} />
                  <Route path="/menu-costing/indirect-expenses" element={<PermissionGuard permKey="menu-costing"><IndirectExpensesPage /></PermissionGuard>} />
                  <Route path="/menu-costing/analysis" element={<PermissionGuard permKey="menu-costing"><MenuAnalysisPage /></PermissionGuard>} />
                  <Route path="/menu-costing/report" element={<PermissionGuard permKey="menu-costing"><MenuFinalReportPage /></PermissionGuard>} />
                  <Route path="/menu-engineering" element={<PermissionGuard permKey="menu-engineering"><MenuEngineeringPage /></PermissionGuard>} />
                  <Route path="/cost-adjustment" element={<PermissionGuard permKey="cost-adjustment"><CostAdjustmentPage /></PermissionGuard>} />
                  <Route path="/cost-adjustment/add" element={<PermissionGuard permKey="cost-adjustment"><AddCostAdjustmentPage /></PermissionGuard>} />
                  <Route path="/cost-adjustment/edit/:id" element={<PermissionGuard permKey="cost-adjustment"><AddCostAdjustmentPage /></PermissionGuard>} />
                  <Route path="/cost-adjustment/view/:id" element={<PermissionGuard permKey="cost-adjustment"><AddCostAdjustmentPage /></PermissionGuard>} />
                  <Route path="/pnl" element={<PnlPage />} />
                  <Route path="/reports" element={<PermissionGuard permKey="reports"><Navigate to="/reports/inventory-movement" replace /></PermissionGuard>} />
                  <Route path="/reports/inventory-movement" element={<PermissionGuard permKey="reports"><InventoryMovementPage /></PermissionGuard>} />
                  <Route path="/reports/purchases" element={<PermissionGuard permKey="reports"><PurchaseReportsPage /></PermissionGuard>} />
                  <Route path="/reports/inventory-levels" element={<PermissionGuard permKey="reports"><InventoryLevelsPage /></PermissionGuard>} />
                  <Route path="/reports/production" element={<PermissionGuard permKey="reports"><ProductionReportsPage /></PermissionGuard>} />
                  <Route path="/reports/waste" element={<PermissionGuard permKey="reports"><WasteReportsPage /></PermissionGuard>} />
                  <Route path="/reports/transfers" element={<PermissionGuard permKey="reports"><TransferReportsPage /></PermissionGuard>} />
                  <Route path="/reports/cost-adjustments" element={<PermissionGuard permKey="reports"><CostAdjustmentReportsPage /></PermissionGuard>} />
                  <Route path="/reports/inventory-turnover" element={<PermissionGuard permKey="reports"><InventoryTurnoverPage /></PermissionGuard>} />
                  <Route path="/reports/branch-comparison" element={<PermissionGuard permKey="reports"><BranchComparisonPage /></PermissionGuard>} />
                  <Route path="/settings" element={<AdminGuard><Navigate to="/settings/companies" replace /></AdminGuard>} />
                  <Route path="/settings/companies" element={<AdminGuard><AdminCompaniesPage /></AdminGuard>} />
                  <Route path="/settings/messages" element={<AdminGuard><AdminMessagesPage /></AdminGuard>} />
                  <Route path="/settings/subscription-log" element={<AdminGuard><AdminSubscriptionLogPage /></AdminGuard>} />
                  <Route path="/settings/users" element={<AdminGuard><SettingsUsersPage /></AdminGuard>} />
                  <Route path="/settings/warehouses" element={<AdminGuard><SettingsWarehousesPage /></AdminGuard>} />
                  <Route path="/settings/branches" element={<AdminGuard><SettingsBranchesPage /></AdminGuard>} />
                  <Route path="/settings/leads" element={<AdminGuard><AdminLeadsPage /></AdminGuard>} />
                  <Route path="/admin/leads" element={<AdminGuard><AdminLeadsPage /></AdminGuard>} />
                  <Route path="/admin/testimonials" element={<AdminGuard><AdminTestimonialsPage /></AdminGuard>} />
                  <Route path="/settings/testimonials" element={<AdminGuard><AdminTestimonialsPage /></AdminGuard>} />
                  <Route path="/company-settings" element={<OwnerOrAdminGuard><Navigate to="/company-settings/users" replace /></OwnerOrAdminGuard>} />
                  <Route path="/company-settings/users" element={<OwnerOrAdminGuard><CompanySettingsPage /></OwnerOrAdminGuard>} />
                  <Route path="/company-settings/warehouses" element={<OwnerOrAdminGuard><SettingsWarehousesPage /></OwnerOrAdminGuard>} />
                  <Route path="/company-settings/branches" element={<OwnerOrAdminGuard><SettingsBranchesPage /></OwnerOrAdminGuard>} />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </SystemLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </Suspense>
  );
};

const App = () => {
  const isOnline = useOnlineStatus();
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            {!isOnline && <OfflineScreen />}
            <AppRoutes />
          </TooltipProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
