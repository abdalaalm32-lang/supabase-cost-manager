import React from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  TrendingUp, Package, DollarSign, ShoppingCart,
  Factory, Trash2, ArrowRightLeft, BarChart3,
} from "lucide-react";

const StatCard: React.FC<{
  title: string;
  value: string;
  icon: React.ElementType;
  color: string;
}> = ({ title, value, icon: Icon, color }) => (
  <div className="glass-card p-6 hover:scale-[1.02] transition-all duration-300 group">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-2xl ${color} group-hover:scale-110 transition-transform duration-300`}>
        <Icon size={22} />
      </div>
    </div>
    <p className="text-2xl font-black text-foreground">{value}</p>
    <p className="text-xs text-muted-foreground font-medium mt-1">{title}</p>
  </div>
);

export const DashboardPage: React.FC = () => {
  const { auth } = useAuth();

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-foreground">
          مرحباً، {auth.profile?.full_name || "مستخدم"} 👋
        </h1>
        <p className="text-muted-foreground mt-1">هذه نظرة عامة على نظام التكاليف</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="إجمالي المبيعات"
          value="0 ج.م"
          icon={DollarSign}
          color="bg-primary/10 text-primary"
        />
        <StatCard
          title="أصناف المخزون"
          value="0"
          icon={Package}
          color="bg-success/10 text-success"
        />
        <StatCard
          title="المشتريات"
          value="0 ج.م"
          icon={ShoppingCart}
          color="bg-warning/10 text-warning"
        />
        <StatCard
          title="الهالك"
          value="0 ج.م"
          icon={Trash2}
          color="bg-destructive/10 text-destructive"
        />
      </div>

      {/* Quick Actions */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-bold mb-4">إجراءات سريعة</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "فاتورة شراء", icon: ShoppingCart, color: "bg-primary/10 text-primary" },
            { label: "عملية إنتاج", icon: Factory, color: "bg-success/10 text-success" },
            { label: "تحويل مخزون", icon: ArrowRightLeft, color: "bg-warning/10 text-warning" },
            { label: "التقارير", icon: BarChart3, color: "bg-secondary/10 text-secondary" },
          ].map((action) => (
            <button
              key={action.label}
              className="flex flex-col items-center gap-2 p-4 rounded-xl hover:bg-muted/50 transition-colors"
            >
              <div className={`p-3 rounded-xl ${action.color}`}>
                <action.icon size={20} />
              </div>
              <span className="text-xs font-medium text-muted-foreground">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Info Banner */}
      <div className="glass-card p-6 border-primary/20">
        <div className="flex items-center gap-3">
          <TrendingUp className="text-primary" size={24} />
          <div>
            <p className="font-bold text-sm">نظام التكاليف متصل بقاعدة بيانات مركزية</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              جميع البيانات محفوظة بأمان ويمكن الوصول إليها من أي مكان
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
