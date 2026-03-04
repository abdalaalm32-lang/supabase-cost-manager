import React, { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Package, ChefHat, ShoppingCart, Calculator,
  FileText, Settings, LogOut, Menu,
  Store, ArrowRightLeft, ClipboardCheck, Trash2,
  Layers, PieChart, BarChart3, ShieldBan, Factory,
  ChevronDown, Monitor, Receipt, BrainCircuit, FolderOpen, UtensilsCrossed
} from "lucide-react";

interface SystemLayoutProps {
  children: React.ReactNode;
  onLogout: () => void;
  companyName: string;
  userName: string;
}

interface NavItem {
  id: string;
  path: string;
  label: string;
  icon: React.ElementType;
  children?: NavItem[];
}

const navItems: NavItem[] = [
  { id: "dashboard", path: "/", label: "لوحة التحكم", icon: LayoutDashboard },
  {
    id: "pos", path: "/pos", label: "نقطة البيع (POS)", icon: Store,
    children: [
      { id: "pos-screen", path: "/pos/screen", label: "شاشة البيع", icon: Monitor },
      { id: "pos-invoices", path: "/pos/invoices", label: "سجل الفواتير", icon: Receipt },
      { id: "pos-analytics", path: "/pos/analytics", label: "ذكاء المبيعات", icon: BrainCircuit },
      { id: "pos-groups", path: "/pos/groups", label: "المجموعات", icon: FolderOpen },
      { id: "pos-items", path: "/pos/items", label: "الأصناف", icon: UtensilsCrossed },
    ],
  },
  {
    id: "inventory", path: "/inventory", label: "إدارة المخزون", icon: Package,
    children: [
      { id: "inventory-materials", path: "/inventory/materials", label: "مواد المخزون", icon: Package },
      { id: "inventory-balances", path: "/inventory/balances", label: "أرصدة المخزون", icon: Layers },
    ],
  },
  { id: "transfers", path: "/transfers", label: "أذونات الصرف والتحويل", icon: ArrowRightLeft },
  {
    id: "stocktake", path: "/stocktake", label: "جرد المخزون", icon: ClipboardCheck,
    children: [
      { id: "stocktake-periodic", path: "/stocktake/periodic", label: "الجرد الدوري", icon: ClipboardCheck },
      { id: "stocktake-instant", path: "/stocktake/instant", label: "فحص مخزون فوري", icon: ClipboardCheck },
    ],
  },
  {
    id: "recipes", path: "/recipes", label: "Recipes", icon: ChefHat,
    children: [
      { id: "recipes-products", path: "/recipes/products", label: "ريسيبي المنتجات", icon: UtensilsCrossed },
      { id: "recipes-production", path: "/recipes/production", label: "ريسيبي تركيبة الإنتاج", icon: Layers },
    ],
  },
  { id: "production", path: "/production", label: "عمليات الإنتاج", icon: Layers },
  { id: "waste", path: "/waste", label: "الهالك", icon: Trash2 },
  {
    id: "purchases", path: "/purchases", label: "المشتريات", icon: ShoppingCart,
    children: [
      { id: "purchases-invoices", path: "/purchases/invoices", label: "فواتير المشتريات", icon: Receipt },
      { id: "purchases-suppliers", path: "/purchases/suppliers", label: "الموردين", icon: Store },
    ],
  },
  { id: "costing", path: "/costing", label: "تحليل التكاليف", icon: Calculator },
  {
    id: "menu-costing", path: "/menu-costing", label: "تكلفة المنيو", icon: PieChart,
    children: [
      { id: "menu-costing-indirect", path: "/menu-costing/indirect-expenses", label: "تحليل المصاريف الغير مباشرة", icon: Calculator },
      { id: "menu-costing-analysis", path: "/menu-costing/analysis", label: "تحليل المنيو", icon: PieChart },
      { id: "menu-costing-report", path: "/menu-costing/report", label: "التقرير النهائي", icon: FileText },
    ],
  },
  
  { id: "cost-adjustment", path: "/cost-adjustment", label: "تعديل التكاليف", icon: Calculator },
  {
    id: "reports", path: "/reports", label: "التقارير", icon: FileText,
    children: [
      { id: "reports-inventory-movement", path: "/reports/inventory-movement", label: "حركة المخزون", icon: ArrowRightLeft },
      { id: "reports-purchases", path: "/reports/purchases", label: "تقارير المشتريات", icon: ShoppingCart },
      { id: "reports-inventory-levels", path: "/reports/inventory-levels", label: "مستويات المخزون", icon: Layers },
      { id: "reports-production", path: "/reports/production", label: "تقارير الإنتاج", icon: Factory },
      { id: "reports-waste", path: "/reports/waste", label: "تقارير الهالك", icon: Trash2 },
      { id: "reports-transfers", path: "/reports/transfers", label: "تقارير التحويلات", icon: ArrowRightLeft },
      { id: "reports-cost-adjustments", path: "/reports/cost-adjustments", label: "تقارير تعديل التكاليف", icon: Calculator },
      { id: "reports-inventory-turnover", path: "/reports/inventory-turnover", label: "تحليل حركة المخزون", icon: BarChart3 },
      { id: "reports-menu-engineering", path: "/menu-engineering", label: "هندسة المنيو", icon: BarChart3 },
    ],
  },
  {
    id: "settings", path: "/settings", label: "الإعدادات", icon: Settings,
    children: [
      { id: "settings-companies", path: "/settings/companies", label: "إدارة الشركات", icon: Settings },
      { id: "settings-warehouses", path: "/settings/warehouses", label: "المخازن", icon: Settings },
      { id: "settings-branches", path: "/settings/branches", label: "الفروع", icon: Settings },
    ],
  },
  {
    id: "company-settings", path: "/company-settings", label: "إعدادات الشركة", icon: Settings,
    children: [
      { id: "company-settings-users", path: "/company-settings/users", label: "المستخدمين", icon: Settings },
      { id: "company-settings-warehouses", path: "/company-settings/warehouses", label: "المخازن", icon: Settings },
      { id: "company-settings-branches", path: "/company-settings/branches", label: "الفروع", icon: Settings },
    ],
  },
];

export const SystemLayout: React.FC<SystemLayoutProps> = ({
  children, onLogout, companyName, userName,
}) => {
  const { hasPermission, auth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isAccessDenied, setIsAccessDenied] = useState(false);
  const [deniedModule, setDeniedModule] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const isChildActive = (item: NavItem) =>
    item.children?.some((c) => location.pathname === c.path || location.pathname.startsWith(c.path + "/")) ?? false;

  // Auto-expand group if a child is active
  React.useEffect(() => {
    navItems.forEach((item) => {
      if (item.children && isChildActive(item)) {
        setExpandedGroups((prev) => ({ ...prev, [item.id]: true }));
      }
    });
  }, [location.pathname]);

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const canAccessItem = (item: NavItem) => {
    // Admin-only settings
    if (item.id === "settings") return auth.isAdmin;
    // Company settings for admin or owner (or user with settings permission)
    if (item.id === "company-settings") return auth.isAdmin || auth.isOwner || hasPermission("settings");
    return hasPermission(item.id);
  };

  const handleNavigate = (item: NavItem, parentId?: string) => {
    const permKey = parentId || item.id;
    // Settings check uses admin
    if (permKey === "settings" && !auth.isAdmin) {
      setDeniedModule(item.label);
      setIsAccessDenied(true);
      return;
    }
    // Company settings check
    if (permKey === "company-settings" && !auth.isAdmin && !auth.isOwner && !hasPermission("settings")) {
      setDeniedModule(item.label);
      setIsAccessDenied(true);
      return;
    }
    if (permKey !== "settings" && permKey !== "company-settings" && !hasPermission(permKey)) {
      setDeniedModule(item.label);
      setIsAccessDenied(true);
      return;
    }
    navigate(item.path);
  };

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    const hasChildren = !!item.children;
    const isExpanded = expandedGroups[item.id];
    const isActive = location.pathname === item.path;
    const isGroupActive = hasChildren && isChildActive(item);
    const hasAccess = canAccessItem(item);

    // Hide settings entirely if not admin
    if (item.id === "settings" && !auth.isAdmin) return null;
    // Hide company settings if not admin, not owner, and no settings permission
    if (item.id === "company-settings" && !auth.isAdmin && !auth.isOwner && !hasPermission("settings")) return null;

    if (hasChildren) {
      return (
        <div key={item.id}>
          <button
            onClick={() => {
              if (!hasAccess) {
                setDeniedModule(item.label);
                setIsAccessDenied(true);
                return;
              }
              toggleGroup(item.id);
            }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
              isGroupActive
                ? "bg-primary/15 text-primary border border-primary/20"
                : hasAccess
                ? "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                : "text-sidebar-foreground/30 cursor-not-allowed"
            }`}
            title={isSidebarCollapsed ? item.label : undefined}
          >
            <Icon size={18} className="flex-shrink-0" />
            {!isSidebarCollapsed && (
              <>
                <span className="truncate flex-1 text-start">{item.label}</span>
                <ChevronDown
                  size={14}
                  className={`flex-shrink-0 transition-transform duration-200 ${
                    isExpanded ? "rotate-180" : ""
                  }`}
                />
              </>
            )}
          </button>
          {!isSidebarCollapsed && isExpanded && (
            <div className="mr-4 mt-0.5 space-y-0.5 border-r border-border/30 pr-2">
              {item.children!.map((child) => {
                const ChildIcon = child.icon;
                const childActive = location.pathname === child.path;
                return (
                  <button
                    key={child.id}
                    onClick={() => handleNavigate(child, item.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                      childActive
                        ? "bg-primary/15 text-primary"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    }`}
                  >
                    <ChildIcon size={15} className="flex-shrink-0" />
                    <span className="truncate">{child.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    return (
      <button
        key={item.id}
        onClick={() => handleNavigate(item)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
          isActive
            ? "bg-primary/15 text-primary border border-primary/20"
            : hasAccess
            ? "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            : "text-sidebar-foreground/30 cursor-not-allowed"
        }`}
        title={isSidebarCollapsed ? item.label : undefined}
      >
        <Icon size={18} className="flex-shrink-0" />
        {!isSidebarCollapsed && <span className="truncate">{item.label}</span>}
      </button>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className={`${
          isSidebarCollapsed ? "w-[70px]" : "w-[260px]"
        } bg-sidebar border-l border-sidebar-border flex flex-col transition-all duration-300 flex-shrink-0`}
      >
        {/* Logo */}
        <div className="p-4 border-b border-sidebar-border flex items-center justify-between">
          {!isSidebarCollapsed && (
            <div>
              <h1 className="text-xl font-black text-gradient">3M GSC</h1>
              <p className="text-[10px] text-sidebar-foreground/60 truncate">{companyName}</p>
            </div>
          )}
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="p-2 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground transition-colors"
          >
            <Menu size={18} />
          </button>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {navItems.map(renderNavItem)}
        </nav>

        {/* User & Logout */}
        <div className="p-3 border-t border-sidebar-border">
          {!isSidebarCollapsed && (
            <div className="flex items-center gap-2 mb-2 px-2">
              <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
                {userName?.charAt(0) || "U"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{userName}</p>
                <p className="text-[10px] text-muted-foreground truncate">{companyName}</p>
              </div>
            </div>
          )}
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut size={16} />
            {!isSidebarCollapsed && <span>تسجيل الخروج</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6">{children}</div>
      </main>

      {/* Access Denied Modal */}
      {isAccessDenied && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="glass-card p-8 max-w-sm text-center animate-fade-in-up">
            <ShieldBan size={48} className="mx-auto mb-4 text-destructive" />
            <h3 className="text-lg font-bold mb-2">غير مصرح</h3>
            <p className="text-muted-foreground text-sm mb-4">
              ليس لديك صلاحية الوصول لـ "{deniedModule}"
            </p>
            <button
              onClick={() => setIsAccessDenied(false)}
              className="gradient-primary text-primary-foreground px-6 py-2 rounded-xl font-bold text-sm"
            >
              حسناً
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
