import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { LoginPage } from "@/pages/LoginPage";
import { CreateCompanyPage } from "@/pages/CreateCompanyPage";
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

const queryClient = new QueryClient();

const SuspendedOverlay = () => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center">
    <div className="absolute inset-0 bg-background/60 backdrop-blur-xl" />
    <div className="relative z-10 text-center p-8 max-w-md">
      <div className="w-20 h-20 rounded-full bg-destructive/15 flex items-center justify-center mx-auto mb-6">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-destructive"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
      </div>
      <h2 className="text-2xl font-black text-foreground mb-3">تم إيقاف الحساب</h2>
      <p className="text-muted-foreground text-sm mb-6">
        تم إيقاف حسابك من قبل الإدارة. لا يمكنك الوصول إلى النظام حالياً.
        <br />تواصل مع مدير النظام لإعادة تفعيل حسابك.
      </p>
    </div>
  </div>
);

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { auth } = useAuth();
  if (!auth.isReady) return null;
  if (!auth.session) return <Navigate to="/login" replace />;
  if (auth.profile && auth.profile.status !== "نشط") return <SuspendedOverlay />;
  return <>{children}</>;
};

const LoginPageWrapper = () => {
  const navigate = useNavigate();
  return <LoginPage onCreateCompany={() => navigate("/register")} />;
};

const CreateCompanyPageWrapper = () => {
  const navigate = useNavigate();
  return <CreateCompanyPage onBack={() => navigate("/login")} />;
};

const PermissionGuard: React.FC<{ permKey: string; children: React.ReactNode }> = ({ permKey, children }) => {
  const { hasPermission } = useAuth();
  if (!hasPermission(permKey)) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const AdminGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { auth } = useAuth();
  if (!auth.isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const OwnerOrAdminGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { auth, hasPermission } = useAuth();
  if (!auth.isAdmin && !auth.isOwner && !hasPermission("settings")) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const AppRoutes = () => {
  const { auth, logout } = useAuth();

  if (!auth.isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-bg">
        <div className="text-center animate-fade-in-up">
          <h1 className="text-4xl font-black text-gradient mb-2">3M GSC</h1>
          <p className="text-muted-foreground text-sm">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={auth.session ? <Navigate to="/" replace /> : <LoginPageWrapper />} />
      <Route path="/register" element={auth.session ? <Navigate to="/" replace /> : <CreateCompanyPageWrapper />} />

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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <AppRoutes />
        </TooltipProvider>
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
