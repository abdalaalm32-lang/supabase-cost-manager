import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useDashboardData(filters?: { branchId?: string; warehouseId?: string }) {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const branchId = filters?.branchId;
  const warehouseId = filters?.warehouseId;

  // Sales only support branch filter (pos_sales has branch_id, not warehouse_id)
  const { data: salesData } = useQuery({
    queryKey: ["dashboard-sales", companyId, branchId, warehouseId],
    queryFn: async () => {
      // If warehouse filter is active, sales can't be filtered by warehouse - return empty
      if (warehouseId) return [];
      let q = supabase
        .from("pos_sales")
        .select("total_amount, date, status")
        .eq("company_id", companyId!);
      if (branchId) q = q.eq("branch_id", branchId);
      const { data } = await q;
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: stockItems } = useQuery({
    queryKey: ["dashboard-stock", companyId, branchId, warehouseId],
    queryFn: async () => {
      if (branchId || warehouseId) {
        // Filter via stock_item_locations
        let locQ = supabase.from("stock_item_locations").select("stock_item_id").eq("company_id", companyId!);
        if (branchId) locQ = locQ.eq("branch_id", branchId);
        if (warehouseId) locQ = locQ.eq("warehouse_id", warehouseId);
        const { data: locs } = await locQ;
        const ids = (locs || []).map((l: any) => l.stock_item_id);
        if (ids.length === 0) return [];
        const { data } = await supabase
          .from("stock_items")
          .select("id, name, current_stock, avg_cost, min_level, max_level, category_id, active")
          .eq("company_id", companyId!)
          .in("id", ids);
        return data || [];
      }
      const { data } = await supabase
        .from("stock_items")
        .select("id, name, current_stock, avg_cost, min_level, max_level, category_id, active")
        .eq("company_id", companyId!);
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: purchases } = useQuery({
    queryKey: ["dashboard-purchases", companyId, branchId, warehouseId],
    queryFn: async () => {
      let q = supabase
        .from("purchase_orders")
        .select("total_amount, date, status, supplier_name, created_at")
        .eq("company_id", companyId!);
      if (branchId) q = q.eq("branch_id", branchId);
      if (warehouseId) q = q.eq("warehouse_id", warehouseId);
      const { data } = await q;
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: wasteRecords } = useQuery({
    queryKey: ["dashboard-waste", companyId, branchId, warehouseId],
    queryFn: async () => {
      let q = supabase
        .from("waste_records" as any)
        .select("total_cost, date, status")
        .eq("company_id", companyId!);
      if (branchId) q = q.eq("branch_id", branchId);
      if (warehouseId) q = q.eq("warehouse_id", warehouseId);
      const { data } = await q;
      return (data as any[]) || [];
    },
    enabled: !!companyId,
  });

  const { data: productions } = useQuery({
    queryKey: ["dashboard-production", companyId, branchId, warehouseId],
    queryFn: async () => {
      let q = supabase
        .from("production_records")
        .select("total_production_cost, date, status, product_name, produced_qty")
        .eq("company_id", companyId!);
      if (branchId) q = q.eq("branch_id", branchId);
      if (warehouseId) q = q.eq("warehouse_id", warehouseId);
      const { data } = await q;
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: transfers } = useQuery({
    queryKey: ["dashboard-transfers", companyId, branchId, warehouseId],
    queryFn: async () => {
      let q = supabase
        .from("transfers")
        .select("total_cost, date, status, source_name, destination_name, source_id, destination_id")
        .eq("company_id", companyId!);
      if (branchId || warehouseId) {
        const locId = branchId || warehouseId;
        q = q.or(`source_id.eq.${locId},destination_id.eq.${locId}`);
      }
      const { data } = await q;
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: stocktakes } = useQuery({
    queryKey: ["dashboard-stocktakes", companyId, branchId, warehouseId],
    queryFn: async () => {
      let q = supabase
        .from("stocktakes")
        .select("total_actual_value, date, status, type")
        .eq("company_id", companyId!);
      if (branchId) q = q.eq("branch_id", branchId);
      if (warehouseId) q = q.eq("warehouse_id", warehouseId);
      const { data } = await q;
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: suppliers } = useQuery({
    queryKey: ["dashboard-suppliers", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("suppliers")
        .select("id, name, active")
        .eq("company_id", companyId!);
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: branches } = useQuery({
    queryKey: ["dashboard-branches", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("branches")
        .select("id, name, active")
        .eq("company_id", companyId!);
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: warehouses } = useQuery({
    queryKey: ["dashboard-warehouses", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("warehouses")
        .select("id, name, active")
        .eq("company_id", companyId!);
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: costAdjustments } = useQuery({
    queryKey: ["dashboard-cost-adj", companyId, branchId, warehouseId],
    queryFn: async () => {
      // Cost adjustments only support branch filter
      if (warehouseId) return [];
      let q = supabase
        .from("cost_adjustments")
        .select("date, status")
        .eq("company_id", companyId!);
      if (branchId) q = q.eq("branch_id", branchId);
      const { data } = await q;
      return data || [];
    },
    enabled: !!companyId,
  });

  // Compute KPIs
  const totalSales = (salesData || []).reduce((s, r) => s + Number(r.total_amount || 0), 0);
  const totalPurchases = (purchases || []).reduce((s, r) => s + Number(r.total_amount || 0), 0);
  const totalWaste = (wasteRecords || []).reduce((s, r) => s + Number(r.total_cost || 0), 0);
  const totalProduction = (productions || []).reduce((s, r) => s + Number(r.total_production_cost || 0), 0);
  const totalTransfers = (transfers || []).reduce((s, r) => s + Number(r.total_cost || 0), 0);
  const stockValue = (stockItems || []).reduce((s, r) => s + Number(r.current_stock || 0) * Number(r.avg_cost || 0), 0);
  const activeItems = (stockItems || []).filter(i => i.active).length;
  const lowStockItems = (stockItems || []).filter(i => i.active && Number(i.current_stock) <= Number(i.min_level) && Number(i.min_level) > 0);
  const overStockItems = (stockItems || []).filter(i => i.active && Number(i.max_level) > 0 && Number(i.current_stock) > Number(i.max_level));

  // Monthly data for charts
  const getMonthlyData = () => {
    const months: Record<string, { sales: number; purchases: number; waste: number; production: number }> = {};
    const monthNames = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
    
    // Initialize last 6 months
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months[key] = { sales: 0, purchases: 0, waste: 0, production: 0 };
    }

    (salesData || []).forEach(r => {
      const key = String(r.date).slice(0, 7);
      if (months[key]) months[key].sales += Number(r.total_amount || 0);
    });
    (purchases || []).forEach(r => {
      const key = String(r.date).slice(0, 7);
      if (months[key]) months[key].purchases += Number(r.total_amount || 0);
    });
    (wasteRecords || []).forEach(r => {
      const key = String(r.date).slice(0, 7);
      if (months[key]) months[key].waste += Number(r.total_cost || 0);
    });
    (productions || []).forEach(r => {
      const key = String(r.date).slice(0, 7);
      if (months[key]) months[key].production += Number(r.total_production_cost || 0);
    });

    return Object.entries(months).map(([key, val]) => {
      const [y, m] = key.split("-");
      return { month: monthNames[parseInt(m) - 1], ...val };
    });
  };

  // Status distribution for pie
  const purchaseStatusDist = () => {
    const dist: Record<string, number> = {};
    (purchases || []).forEach(r => { dist[r.status] = (dist[r.status] || 0) + 1; });
    return Object.entries(dist).map(([name, value]) => ({ name, value }));
  };

  // Operations radar
  const operationsRadar = () => [
    { metric: "المبيعات", value: (salesData || []).length },
    { metric: "المشتريات", value: (purchases || []).length },
    { metric: "الإنتاج", value: (productions || []).length },
    { metric: "التحويلات", value: (transfers || []).length },
    { metric: "الجرد", value: (stocktakes || []).length },
    { metric: "الهالك", value: (wasteRecords || []).length },
  ];

  // Top suppliers by purchase amount
  const topSuppliers = () => {
    const map: Record<string, number> = {};
    (purchases || []).forEach(r => {
      map[r.supplier_name] = (map[r.supplier_name] || 0) + Number(r.total_amount || 0);
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, total]) => ({ name, total }));
  };

  // Recent activity
  const recentActivity = () => {
    const items: { type: string; label: string; date: string; amount?: number }[] = [];
    (purchases || []).slice(-5).forEach(r => items.push({ type: "purchase", label: `شراء - ${r.supplier_name}`, date: r.date, amount: Number(r.total_amount) }));
    (productions || []).slice(-5).forEach(r => items.push({ type: "production", label: `إنتاج - ${r.product_name}`, date: r.date, amount: Number(r.total_production_cost) }));
    (transfers || []).slice(-3).forEach(r => items.push({ type: "transfer", label: `تحويل - ${r.source_name || ""} → ${r.destination_name || ""}`, date: r.date, amount: Number(r.total_cost || 0) }));
    (wasteRecords || []).slice(-3).forEach(r => items.push({ type: "waste", label: `هالك`, date: r.date, amount: Number(r.total_cost || 0) }));
    (stocktakes || []).slice(-3).forEach(r => items.push({ type: "stocktake", label: `جرد - ${r.type || ""}`, date: r.date, amount: Number(r.total_actual_value || 0) }));
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 8);
  };

  return {
    totalSales, totalPurchases, totalWaste, totalProduction, totalTransfers, stockValue,
    activeItems, lowStockItems, overStockItems, stockItems: stockItems || [],
    salesCount: (salesData || []).length,
    purchasesCount: (purchases || []).length,
    productionCount: (productions || []).length,
    transfersCount: (transfers || []).length,
    stocktakesCount: (stocktakes || []).length,
    wasteCount: (wasteRecords || []).length,
    suppliersCount: (suppliers || []).length,
    branchesCount: (branches || []).length,
    warehousesCount: (warehouses || []).length,
    costAdjCount: (costAdjustments || []).length,
    monthlyData: getMonthlyData(),
    purchaseStatusDist: purchaseStatusDist(),
    operationsRadar: operationsRadar(),
    topSuppliers: topSuppliers(),
    recentActivity: recentActivity(),
    profitMargin: totalSales > 0 ? ((totalSales - totalPurchases - totalWaste) / totalSales * 100) : 0,
  };
}
