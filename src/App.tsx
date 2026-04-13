/* eslint-disable @typescript-eslint/no-explicit-any */
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import logo3m from "@/assets/logo-3m.png";
import loginBg from "@/assets/login-bg.jpg";
import { LoginPage } from "@/pages/LoginPage";
import { InstallPWA } from "@/components/InstallPWA";
import { DashboardPage } from "@/pages/DashboardPage";
import { PlaceholderPage } from "@/pages/PlaceholderPage";
import { RecipesPage } from "@/pages/RecipesPage";
import { PosGroupsPage } from "@/pages/PosGroupsPage";
import { PosItemsPage } from "@/pages/PosItemsPage";
import { PosScreenPage } from "@/pages/PosScreenPage";
import { PosInvoicesPage } from "@/pages/PosInvoicesPage";
import { PosAnalyticsPage } from "@/pages/PosAnalyticsPage";
import { SettingsUsersPage } from "@/pages/SettingsUsersPage";
import { AdminCompaniesPage } from "@/pages/AdminCompaniesPage";
import { CompanySettingsPage } from "@/pages/CompanySettingsPage";
import { SettingsBranchesPage } from "@/pages/SettingsBranchesPage";
import { SettingsWarehousesPage } from "@/pages/SettingsWarehousesPage";
import { InventoryMaterialsPage } from "@/pages/InventoryMaterialsPage";
import { InventoryBalancesPage } from "@/pages/InventoryBalancesPage";
import { PurchaseInvoicesPage } from "@/pages/PurchaseInvoicesPage";
import { PurchaseSuppliersPage } from "@/pages/PurchaseSuppliersPage";
import { AddPurchaseInvoicePage } from "@/pages/AddPurchaseInvoicePage";
import { EditPurchaseInvoicePage } from "@/pages/EditPurchaseInvoicePage";
import { CostAdjustmentPage } from "@/pages/CostAdjustmentPage";
import { AddCostAdjustmentPage } from "@/pages/AddCostAdjustmentPage";
import { StocktakeListPage } from "@/pages/StocktakeListPage";
import { InstantStocktakeListPage } from "@/pages/InstantStocktakeListPage";
import { StocktakeDetailPage } from "@/pages/StocktakeDetailPage";
import { WasteListPage } from "@/pages/WasteListPage";
import { WasteDetailPage } from "@/pages/WasteDetailPage";
import { ProductionListPage } from "@/pages/ProductionListPage";
import { ProductionDetailPage } from "@/pages/ProductionDetailPage";
import { TransferListPage } from "@/pages/TransferListPage";
import { TransferDetailPage } from "@/pages/TransferDetailPage";
import { ProductionRecipesPage } from "@/pages/ProductionRecipesPage";
import { CostAnalysisPage } from "@/pages/CostAnalysisPage";
import { InventoryMovementPage } from "@/pages/InventoryMovementPage";
import { PurchaseReportsPage } from "@/pages/PurchaseReportsPage";
import { InventoryLevelsPage } from "@/pages/InventoryLevelsPage";
import { ProductionReportsPage } from "@/pages/ProductionReportsPage";
import { WasteReportsPage } from "@/pages/WasteReportsPage";
import { CostAdjustmentReportsPage } from "@/pages/CostAdjustmentReportsPage";
import { TransferReportsPage } from "@/pages/TransferReportsPage";
import { InventoryTurnoverPage } from "@/pages/InventoryTurnoverPage";
import { MenuEngineeringPage } from "@/pages/MenuEngineeringPage";
import { IndirectExpensesPage } from "@/pages/IndirectExpensesPage";
import { MenuAnalysisPage } from "@/pages/MenuAnalysisPage";
import { MenuFinalReportPage } from "@/pages/MenuFinalReportPage";
import { SystemLayout } from "@/components/SystemLayout";
import { AdminMessagesPage } from "@/pages/AdminMessagesPage";
import { AdminSubscriptionLogPage } from "@/pages/AdminSubscriptionLogPage";
import { PnlPage } from "@/pages/PnlPage";

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

const CompanyDeactivatedOverlay: React.FC<{ isOwner: boolean }> = ({ isOwner }) => {
  const { auth } = useAuth();
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [replyData, setReplyData] = useState<any>(null);

  // Check if there's already a reply to a previous inquiry
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
      // silent
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
        <div className="w-20 h-20 rounded-full bg-amber-500/15 flex items-center justify-center mx-auto mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
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

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { auth } = useAuth();
  const qc = useQueryClient();

  // Check if company is active and subscription status
  const { data: companyStatus } = useQuery({
    queryKey: ["company-active-status", auth.profile?.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("active, subscription_type, subscription_minutes, subscription_start, subscription_end")
        .eq("id", auth.profile!.company_id)
        .single();
      return data;
    },
    enabled: !!auth.profile?.company_id && !auth.isAdmin,
    refetchInterval: 15000,
  });

  // Subscribe to company changes for instant deactivation
  useEffect(() => {
    if (!auth.profile?.company_id || auth.isAdmin) return;
    const channel = supabase
      .channel("company-active-watch")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "companies", filter: `id=eq.${auth.profile.company_id}` }, () => {
        qc.invalidateQueries({ queryKey: ["company-active-status", auth.profile?.company_id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [auth.profile?.company_id, auth.isAdmin]);

  // Company deactivation: auto-logout and redirect to login
  const companyDeactivated = !auth.isAdmin && companyStatus && !companyStatus.active;
  const userSuspended = !!(auth.profile && auth.profile.status !== "نشط");

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

  if (!auth.isReady) return null;
  if (!auth.session) return <Navigate to="/login" replace />;

  if (companyDeactivated) {
    return <Navigate to="/login?reason=company_deactivated" replace />;
  }

  // Company subscription expiry check (not for admins)
  if (!auth.isAdmin && companyStatus && companyStatus.subscription_type !== "unlimited" && companyStatus.subscription_end) {
    const endDate = new Date(companyStatus.subscription_end);
    if (endDate < new Date()) {
      return <SubscriptionExpiredOverlay type="company" />;
    }
  }

  // Individual user suspension: redirect to login
  if (userSuspended) {
    return <Navigate to="/login?reason=user_suspended" replace />;
  }

  // Individual user subscription expiry check (not for admins/owners)
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

const LoginPageWrapper = () => {
  return <LoginPage />;
};

const PermissionGuard: React.FC<{ permKey: string; children: React.ReactNode }> = ({ permKey, children }) => {
  const { auth, hasPermission } = useAuth();
  if (!auth.isReady) return null;
  if (!auth.session) return <Navigate to="/login" replace />;
  if (!auth.profile && !auth.isAdmin && !auth.isOwner) return null;
  if (!hasPermission(permKey)) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const AdminGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { auth } = useAuth();
  if (!auth.isReady) return null;
  if (!auth.session) return <Navigate to="/login" replace />;
  if (!auth.isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const OwnerOrAdminGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { auth, hasPermission } = useAuth();
  if (!auth.isReady) return null;
  if (!auth.session) return <Navigate to="/login" replace />;
  if (!auth.profile && !auth.isAdmin && !auth.isOwner) return null;
  if (!auth.isAdmin && !auth.isOwner && !hasPermission("settings")) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const AppRoutes = () => {
  const { auth, logout } = useAuth();

  if (!auth.isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
        <img src={loginBg} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-[hsl(220,60%,8%)]/75 backdrop-blur-sm" />
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(199,89%,40%)]/15 via-transparent to-[hsl(260,60%,30%)]/10" />
        <div className="relative z-10 text-center animate-fade-in-up">
          <img src={logo3m} alt="3M GSC Logo" className="w-32 h-32 mx-auto mb-4 object-contain drop-shadow-lg" />
          <h1 className="text-3xl font-black text-gradient mb-2">3M GSC</h1>
          <p className="text-muted-foreground text-sm">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={auth.session ? <Navigate to="/" replace /> : <LoginPageWrapper />} />
      {/* Registration removed */}

      {/* Protected routes inside SystemLayout */}
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
                <Route path="/" element={<DashboardPage />} />
                <Route path="/pos" element={<Navigate to="/pos/screen" replace />} />
                <Route path="/pos/screen" element={<PermissionGuard permKey="pos"><PosScreenPage /></PermissionGuard>} />
                <Route path="/pos/invoices" element={<PermissionGuard permKey="pos"><PosInvoicesPage /></PermissionGuard>} />
                <Route path="/pos/analytics" element={<PermissionGuard permKey="pos"><PosAnalyticsPage /></PermissionGuard>} />
                <Route path="/pos/groups" element={<PermissionGuard permKey="pos"><PosGroupsPage /></PermissionGuard>} />
                <Route path="/pos/items" element={<PermissionGuard permKey="pos"><PosItemsPage /></PermissionGuard>} />
                <Route path="/inventory" element={<PermissionGuard permKey="inventory"><Navigate to="/inventory/materials" replace /></PermissionGuard>} />
                <Route path="/inventory/materials" element={<PermissionGuard permKey="inventory"><InventoryMaterialsPage /></PermissionGuard>} />
                <Route path="/inventory/balances" element={<PermissionGuard permKey="inventory"><InventoryBalancesPage /></PermissionGuard>} />
                <Route path="/transfers" element={<PermissionGuard permKey="transfers"><TransferListPage /></PermissionGuard>} />
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
                <Route path="/costing" element={<PermissionGuard permKey="costing"><CostAnalysisPage /></PermissionGuard>} />
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
                <Route path="/settings" element={<AdminGuard><Navigate to="/settings/companies" replace /></AdminGuard>} />
                <Route path="/settings/companies" element={<AdminGuard><AdminCompaniesPage /></AdminGuard>} />
                <Route path="/settings/messages" element={<AdminGuard><AdminMessagesPage /></AdminGuard>} />
                <Route path="/settings/subscription-log" element={<AdminGuard><AdminSubscriptionLogPage /></AdminGuard>} />
                <Route path="/settings/users" element={<AdminGuard><SettingsUsersPage /></AdminGuard>} />
                <Route path="/settings/warehouses" element={<AdminGuard><SettingsWarehousesPage /></AdminGuard>} />
                <Route path="/settings/branches" element={<AdminGuard><SettingsBranchesPage /></AdminGuard>} />
                <Route path="/company-settings" element={<OwnerOrAdminGuard><Navigate to="/company-settings/users" replace /></OwnerOrAdminGuard>} />
                <Route path="/company-settings/users" element={<OwnerOrAdminGuard><CompanySettingsPage /></OwnerOrAdminGuard>} />
                <Route path="/company-settings/warehouses" element={<OwnerOrAdminGuard><SettingsWarehousesPage /></OwnerOrAdminGuard>} />
                <Route path="/company-settings/branches" element={<OwnerOrAdminGuard><SettingsBranchesPage /></OwnerOrAdminGuard>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </SystemLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
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
            <InstallPWA />
          </TooltipProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
