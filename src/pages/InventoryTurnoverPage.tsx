import React, { useState, useMemo, useRef } from "react";
import { ExportButtons } from "@/components/ExportButtons";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  CalendarIcon, Search, TrendingUp, TrendingDown, Package,
  FileText, FileSpreadsheet, AlertTriangle, Activity, Timer,
  DollarSign, Layers, Store, Warehouse, CircleDot, ShoppingCart,
  ArrowDown, ArrowUp, Minus, Zap, Snail, Ban, RefreshCw, PieChart as PieChartIcon
} from "lucide-react";
import {
  Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart as RechartsPieChart, Pie, Cell, LineChart, Line, ScatterChart, Scatter, ZAxis, RadarChart,
  Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";

const COLORS = [
  "hsl(221, 83%, 53%)", "hsl(142, 76%, 36%)", "hsl(38, 92%, 50%)",
  "hsl(199, 89%, 48%)", "hsl(262, 83%, 58%)", "hsl(0, 84%, 60%)",
  "hsl(174, 72%, 40%)", "hsl(326, 78%, 55%)",
];

const SPEED_COLORS = {
  fast: "hsl(221, 83%, 53%)",
  medium: "hsl(38, 92%, 50%)",
  slow: "hsl(0, 84%, 60%)",
  dead: "hsl(0, 0%, 30%)",
};

type TurnoverItem = {
  id: string;
  code: string | null;
  name: string;
  unit: string;
  categoryName: string;
  categoryId: string | null;
  avgCost: number;
  currentStock: number;
  // Consumption data
  totalConsumptionQty: number;
  totalConsumptionCost: number;
  // Inventory values
  avgInventoryValue: number;
  currentInventoryValue: number;
  // Calculated KPIs
  turnoverRate: number;
  holdingDays: number;
  // Classification
  speed: "fast" | "medium" | "slow" | "dead";
  speedLabel: string;
  // Recommendation
  recommendation: string;
  recommendationColor: string;
  // Last movement date
  lastMovementDate: string | null;
  daysSinceLastMovement: number;
  // Purchase data
  totalPurchaseQty: number;
};

const PERIOD_DAYS = 30;

export const InventoryTurnoverPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const tableRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [speedFilter, setSpeedFilter] = useState<string>("all");
  const [locationType, setLocationType] = useState<"branch" | "warehouse">("branch");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  });
  const [dateTo, setDateTo] = useState<Date | undefined>(new Date());

  const branchFilter = locationType === "branch" ? locationFilter : "all";
  const warehouseFilter = locationType === "warehouse" ? locationFilter : "all";

  // --- Data queries ---
  const { data: branches } = useQuery({
    queryKey: ["branches-turnover", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("id, name").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses-turnover", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("id, name").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: inventoryCategories } = useQuery({
    queryKey: ["inv-categories-turnover", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_categories").select("id, name").eq("company_id", companyId!).eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: stockItems } = useQuery({
    queryKey: ["stock-items-turnover", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_items").select("*, inventory_categories:category_id(id, name)")
        .eq("company_id", companyId!).eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: stockItemLocations } = useQuery({
    queryKey: ["stock-item-locations-turnover", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_item_locations").select("*").eq("company_id", companyId!);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: purchaseData } = useQuery({
    queryKey: ["purchase-data-turnover", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_items").select("*, purchase_orders!inner(id, date, status, company_id, branch_id, warehouse_id)")
        .eq("purchase_orders.company_id", companyId!).eq("purchase_orders.status", "مكتمل");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: productionIngData } = useQuery({
    queryKey: ["production-ing-turnover", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_ingredients").select("*, production_records!inner(id, date, status, company_id, branch_id, warehouse_id)")
        .eq("production_records.company_id", companyId!).eq("production_records.status", "مكتمل");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: productionRecords } = useQuery({
    queryKey: ["production-rec-turnover", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_records").select("*").eq("company_id", companyId!).eq("status", "مكتمل");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: wasteData } = useQuery({
    queryKey: ["waste-data-turnover", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("waste_items").select("*, waste_records!inner(id, date, status, company_id, branch_id, warehouse_id)")
        .eq("waste_records.company_id", companyId!).eq("waste_records.status", "مكتمل");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: transferData } = useQuery({
    queryKey: ["transfer-data-turnover", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfer_items").select("*, transfers!inner(id, date, status, company_id, source_id, destination_id)")
        .eq("transfers.company_id", companyId!).eq("transfers.status", "مكتمل");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: posSaleItems } = useQuery({
    queryKey: ["pos-sale-items-turnover", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pos_sale_items").select("*, pos_sales!inner(id, date, status, company_id, branch_id)")
        .eq("pos_sales.company_id", companyId!).eq("pos_sales.status", "مكتمل");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: recipeIngredients } = useQuery({
    queryKey: ["recipe-ingredients-turnover", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipe_ingredients").select("*, recipes!inner(id, menu_item_id, company_id)")
        .eq("recipes.company_id", companyId!);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Helpers
  const inDateRange = (dateStr: string) => {
    if (!dateFrom && !dateTo) return true;
    const d = new Date(dateStr);
    if (dateFrom && d < dateFrom) return false;
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      if (d > end) return false;
    }
    return true;
  };

  const periodDays = useMemo(() => {
    if (!dateFrom || !dateTo) return PERIOD_DAYS;
    return Math.max(1, Math.ceil((dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24)));
  }, [dateFrom, dateTo]);

  // Filter items by location
  const locationItemIds = useMemo(() => {
    if (locationFilter === "all" || !stockItemLocations) return null;
    const ids = new Set<string>();
    for (const loc of stockItemLocations) {
      if (locationType === "branch" && loc.branch_id === locationFilter) ids.add(loc.stock_item_id);
      if (locationType === "warehouse" && loc.warehouse_id === locationFilter) ids.add(loc.stock_item_id);
    }
    return ids;
  }, [stockItemLocations, locationFilter, locationType]);

  // Main calculation
  const calcData = useMemo(() => {
    if (!stockItems) return [];
    const now = new Date();

    const itemMap = new Map<string, {
      totalConsumptionQty: number;
      totalConsumptionCost: number;
      totalPurchaseQty: number;
      lastMovementDate: string | null;
      movementDates: string[];
    }>();

    // Initialize
    for (const si of stockItems) {
      if (locationItemIds && !locationItemIds.has(si.id)) continue;
      itemMap.set(si.id, {
        totalConsumptionQty: 0,
        totalConsumptionCost: 0,
        totalPurchaseQty: 0,
        lastMovementDate: null,
        movementDates: [],
      });
    }

    const updateLastDate = (itemId: string, dateStr: string) => {
      const item = itemMap.get(itemId);
      if (!item) return;
      item.movementDates.push(dateStr);
      if (!item.lastMovementDate || dateStr > item.lastMovementDate) {
        item.lastMovementDate = dateStr;
      }
    };

    // Purchases
    if (purchaseData) {
      for (const pi of purchaseData) {
        const poDate = (pi as any).purchase_orders?.date;
        const poBranch = (pi as any).purchase_orders?.branch_id;
        const poWarehouse = (pi as any).purchase_orders?.warehouse_id;
        if (!poDate || !inDateRange(poDate)) continue;
        if (branchFilter !== "all" && poBranch !== branchFilter) continue;
        if (warehouseFilter !== "all" && poWarehouse !== warehouseFilter) continue;
        if (!pi.stock_item_id) continue;
        const item = itemMap.get(pi.stock_item_id);
        if (item) {
          item.totalPurchaseQty += Number(pi.quantity);
          updateLastDate(pi.stock_item_id, poDate);
        }
      }
    }

    // Production ingredients consumption
    if (productionIngData) {
      for (const ing of productionIngData) {
        const prDate = (ing as any).production_records?.date;
        const prBranch = (ing as any).production_records?.branch_id;
        const prWarehouse = (ing as any).production_records?.warehouse_id;
        if (!prDate || !inDateRange(prDate)) continue;
        if (branchFilter !== "all" && prBranch !== branchFilter) continue;
        if (warehouseFilter !== "all" && prWarehouse !== warehouseFilter) continue;
        if (!ing.stock_item_id) continue;
        const item = itemMap.get(ing.stock_item_id);
        if (item) {
          const qty = Number(ing.required_qty);
          item.totalConsumptionQty += qty;
          item.totalConsumptionCost += Number(ing.total_cost);
          updateLastDate(ing.stock_item_id, prDate);
        }
      }
    }

    // POS consumption via recipes
    if (posSaleItems && recipeIngredients) {
      const recipeMap = new Map<string, { stock_item_id: string; qty: number }[]>();
      for (const ri of recipeIngredients) {
        const menuItemId = (ri as any).recipes?.menu_item_id;
        if (!menuItemId) continue;
        if (!recipeMap.has(menuItemId)) recipeMap.set(menuItemId, []);
        const si = stockItems?.find(s => s.id === ri.stock_item_id);
        const convFactor = Number(si?.conversion_factor) || 1;
        recipeMap.get(menuItemId)!.push({ stock_item_id: ri.stock_item_id, qty: Number(ri.qty) / convFactor });
      }
      for (const saleItem of posSaleItems) {
        const saleDate = (saleItem as any).pos_sales?.date;
        const saleBranch = (saleItem as any).pos_sales?.branch_id;
        if (!saleDate || !inDateRange(saleDate)) continue;
        if (branchFilter !== "all" && saleBranch !== branchFilter) continue;
        if (!saleItem.pos_item_id) continue;
        const ingredients = recipeMap.get(saleItem.pos_item_id);
        if (ingredients) {
          for (const ing of ingredients) {
            const item = itemMap.get(ing.stock_item_id);
            if (item) {
              const si = stockItems?.find(s => s.id === ing.stock_item_id);
              const avgCost = Number(si?.avg_cost) || 0;
              const qty = ing.qty * Number(saleItem.quantity);
              item.totalConsumptionQty += qty;
              item.totalConsumptionCost += qty * avgCost;
              updateLastDate(ing.stock_item_id, saleDate.substring(0, 10));
            }
          }
        }
      }
    }

    // Waste consumption
    if (wasteData) {
      for (const wi of wasteData) {
        const wrDate = (wi as any).waste_records?.date;
        const wrBranch = (wi as any).waste_records?.branch_id;
        const wrWarehouse = (wi as any).waste_records?.warehouse_id;
        if (!wrDate || !inDateRange(wrDate)) continue;
        if (branchFilter !== "all" && wrBranch !== branchFilter) continue;
        if (warehouseFilter !== "all" && wrWarehouse !== warehouseFilter) continue;
        if (!wi.stock_item_id) continue;
        const item = itemMap.get(wi.stock_item_id);
        if (item) {
          const qty = Number(wi.quantity);
          item.totalConsumptionQty += qty;
          item.totalConsumptionCost += Number(wi.cost);
          updateLastDate(wi.stock_item_id, wrDate);
        }
      }
    }

    // Transfers out
    if (transferData) {
      for (const ti of transferData) {
        const trDate = (ti as any).transfers?.date;
        const trSource = (ti as any).transfers?.source_id;
        if (!trDate || !inDateRange(trDate)) continue;
        if (branchFilter !== "all" && trSource !== branchFilter) continue;
        if (warehouseFilter !== "all" && trSource !== warehouseFilter) continue;
        if (!ti.stock_item_id) continue;
        const item = itemMap.get(ti.stock_item_id);
        if (item) {
          const qty = Number(ti.quantity);
          item.totalConsumptionQty += qty;
          item.totalConsumptionCost += Number(ti.total_cost);
          updateLastDate(ti.stock_item_id, trDate);
        }
      }
    }

    // Build results
    const results: TurnoverItem[] = [];
    for (const si of stockItems) {
      const itemData = itemMap.get(si.id);
      if (!itemData) continue;

      const avgCost = Number(si.avg_cost) || 0;
      const currentStock = Number(si.current_stock) || 0;
      const currentInventoryValue = currentStock * avgCost;
      const catName = (si as any).inventory_categories?.name || "بدون مجموعة";

      // Average inventory = (current + (current + purchased - consumed)) / 2 approximation
      // Simplified: use current inventory value as proxy
      const avgInventoryValue = currentInventoryValue > 0 ? currentInventoryValue : 1;

      // Turnover rate = consumption cost / avg inventory value (normalized to 30 days)
      const normalizedConsumptionCost = periodDays > 0 ? (itemData.totalConsumptionCost / periodDays) * 30 : 0;
      const turnoverRate = avgInventoryValue > 0 ? normalizedConsumptionCost / avgInventoryValue : 0;

      // Holding days = 30 / turnover rate
      const holdingDays = turnoverRate > 0 ? 30 / turnoverRate : 999;

      // Days since last movement
      const daysSinceLastMovement = itemData.lastMovementDate
        ? Math.floor((now.getTime() - new Date(itemData.lastMovementDate).getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      // Classification
      let speed: TurnoverItem["speed"];
      let speedLabel: string;
      let recommendation: string;
      let recommendationColor: string;

      if (turnoverRate >= 4 || (holdingDays <= 7 && itemData.totalConsumptionQty > 0)) {
        speed = "fast";
        speedLabel = "سريعة الحركة";
        recommendation = "استمر في الطلب المنتظم — أداء ممتاز";
        recommendationColor = "text-blue-600";
      } else if (turnoverRate >= 1.5 || (holdingDays <= 20 && itemData.totalConsumptionQty > 0)) {
        speed = "medium";
        speedLabel = "متوسطة الحركة";
        recommendation = "راجع كميات الطلب — قلل حجم الشراء";
        recommendationColor = "text-amber-600";
      } else if (itemData.totalConsumptionQty > 0) {
        speed = "slow";
        speedLabel = "بطيئة الحركة";
        recommendation = "خفض المخزون — تقليل تجميد رأس المال";
        recommendationColor = "text-red-600";
      } else {
        speed = "dead";
        speedLabel = "راكدة";
        recommendation = "إيقاف الشراء فوراً — تصريف المخزون الحالي";
        recommendationColor = "text-destructive";
      }

      // Override if high stock with no movement
      if (currentStock > 0 && daysSinceLastMovement > 60) {
        speed = "dead";
        speedLabel = "راكدة";
        recommendation = "⚠️ لم تتحرك منذ " + daysSinceLastMovement + " يوم — صرف أو إعادة تقييم";
        recommendationColor = "text-destructive";
      }

      results.push({
        id: si.id,
        code: si.code,
        name: si.name,
        unit: si.stock_unit,
        categoryName: catName,
        categoryId: si.category_id,
        avgCost,
        currentStock,
        totalConsumptionQty: itemData.totalConsumptionQty,
        totalConsumptionCost: itemData.totalConsumptionCost,
        avgInventoryValue,
        currentInventoryValue,
        turnoverRate,
        holdingDays: Math.min(holdingDays, 999),
        speed,
        speedLabel,
        recommendation,
        recommendationColor,
        lastMovementDate: itemData.lastMovementDate,
        daysSinceLastMovement,
        totalPurchaseQty: itemData.totalPurchaseQty,
      });
    }

    results.sort((a, b) => a.turnoverRate - b.turnoverRate);
    return results;
  }, [stockItems, stockItemLocations, purchaseData, productionIngData, productionRecords, wasteData, transferData, posSaleItems, recipeIngredients, dateFrom, dateTo, branchFilter, warehouseFilter, locationItemIds, periodDays]);

  // Filtering
  const filteredData = useMemo(() => {
    let result = calcData;
    if (categoryFilter !== "all") {
      result = result.filter(i => i.categoryId === categoryFilter);
    }
    if (speedFilter !== "all") {
      result = result.filter(i => i.speed === speedFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(i =>
        i.name.toLowerCase().includes(q) ||
        (i.code || "").toLowerCase().includes(q) ||
        i.categoryName.toLowerCase().includes(q)
      );
    }
    return result;
  }, [calcData, categoryFilter, speedFilter, searchQuery]);

  // Stats
  const stats = useMemo(() => {
    const fastCount = filteredData.filter(i => i.speed === "fast").length;
    const mediumCount = filteredData.filter(i => i.speed === "medium").length;
    const slowCount = filteredData.filter(i => i.speed === "slow").length;
    const deadCount = filteredData.filter(i => i.speed === "dead").length;

    const totalLockedCapital = filteredData
      .filter(i => i.speed === "slow" || i.speed === "dead")
      .reduce((s, i) => s + i.currentInventoryValue, 0);

    const avgTurnover = filteredData.length > 0
      ? filteredData.reduce((s, i) => s + i.turnoverRate, 0) / filteredData.length
      : 0;

    const totalConsumptionCost = filteredData.reduce((s, i) => s + i.totalConsumptionCost, 0);
    const totalInventoryValue = filteredData.reduce((s, i) => s + i.currentInventoryValue, 0);

    const needReorder = filteredData.filter(i => i.speed === "fast" && i.currentStock <= 0).length;

    return { fastCount, mediumCount, slowCount, deadCount, totalLockedCapital, avgTurnover, totalConsumptionCost, totalInventoryValue, needReorder };
  }, [filteredData]);

  // Chart data
  const speedDistChart = useMemo(() => [
    { name: "سريعة الحركة", value: stats.fastCount, color: SPEED_COLORS.fast },
    { name: "متوسطة الحركة", value: stats.mediumCount, color: SPEED_COLORS.medium },
    { name: "بطيئة الحركة", value: stats.slowCount, color: SPEED_COLORS.slow },
    { name: "راكدة", value: stats.deadCount, color: SPEED_COLORS.dead },
  ].filter(d => d.value > 0), [stats]);

  const lockedCapitalChart = useMemo(() => {
    const catMap = new Map<string, number>();
    for (const i of filteredData) {
      if (i.speed !== "slow" && i.speed !== "dead") continue;
      catMap.set(i.categoryName, (catMap.get(i.categoryName) || 0) + i.currentInventoryValue);
    }
    return Array.from(catMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [filteredData]);

  const topSlowItems = useMemo(() => {
    return filteredData
      .filter(i => i.speed === "slow" || i.speed === "dead")
      .sort((a, b) => b.currentInventoryValue - a.currentInventoryValue)
      .slice(0, 10)
      .map(i => ({
        name: i.name.length > 14 ? i.name.substring(0, 14) + "..." : i.name,
        القيمة_المجمدة: Number(i.currentInventoryValue.toFixed(0)),
        معدل_الدوران: Number(i.turnoverRate.toFixed(2)),
      }));
  }, [filteredData]);

  const turnoverByCategory = useMemo(() => {
    const catMap = new Map<string, { totalTurnover: number; count: number }>();
    for (const i of filteredData) {
      const existing = catMap.get(i.categoryName) || { totalTurnover: 0, count: 0 };
      existing.totalTurnover += i.turnoverRate;
      existing.count += 1;
      catMap.set(i.categoryName, existing);
    }
    return Array.from(catMap.entries()).map(([name, data]) => ({
      name: name.length > 12 ? name.substring(0, 12) + "..." : name,
      متوسط_الدوران: Number((data.totalTurnover / data.count).toFixed(2)),
    })).sort((a, b) => b.متوسط_الدوران - a.متوسط_الدوران).slice(0, 8);
  }, [filteredData]);

  // Export
  const exportCSV = () => {
    const headers = ["الكود", "اسم الخامة", "المجموعة", "الوحدة", "المخزون الحالي", "قيمة المخزون", "الاستهلاك (كمية)", "تكلفة الاستهلاك", "معدل الدوران", "فترة الاحتفاظ (يوم)", "التصنيف", "التوصية", "آخر حركة"];
    const rows = filteredData.map(i => [
      i.code || "", i.name, i.categoryName, i.unit, i.currentStock.toFixed(2),
      i.currentInventoryValue.toFixed(2), i.totalConsumptionQty.toFixed(2),
      i.totalConsumptionCost.toFixed(2), i.turnoverRate.toFixed(2),
      i.holdingDays >= 999 ? "∞" : i.holdingDays.toFixed(1),
      i.speedLabel, i.recommendation, i.lastMovementDate || "لا يوجد",
    ]);
    const bom = "\uFEFF";
    const csv = bom + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `تحليل_حركة_المخزون_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtInt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

  const getSpeedBadge = (speed: TurnoverItem["speed"], label: string) => {
    const styles: Record<string, string> = {
      fast: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
      medium: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
      slow: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",
      dead: "bg-gray-200 text-gray-800 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600",
    };
    const icons: Record<string, React.ReactNode> = {
      fast: <Zap size={12} />,
      medium: <Activity size={12} />,
      slow: <Snail size={12} />,
      dead: <Ban size={12} />,
    };
    return (
      <span className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border", styles[speed])}>
        {icons[speed]} {label}
      </span>
    );
  };

  return (
    <div className="space-y-6 print:space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
            <Activity className="text-primary" size={28} />
            تحليل حركة المخزون
          </h1>
          <p className="text-muted-foreground text-sm mt-1">تحليل معدل الدوران والركود والتوصيات الاستراتيجية لكل خامة</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <FileSpreadsheet size={16} className="ml-1" /> تصدير Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <FileText size={16} className="ml-1" /> طباعة PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="print:hidden">
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <Input placeholder="بحث بالاسم أو الكود..." value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)} className="pr-9 text-sm" />
            </div>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="المجموعة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المجموعات</SelectItem>
                {inventoryCategories?.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={speedFilter} onValueChange={setSpeedFilter}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="تصنيف الحركة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل التصنيفات</SelectItem>
                <SelectItem value="fast">🔵 سريعة الحركة</SelectItem>
                <SelectItem value="medium">🟡 متوسطة الحركة</SelectItem>
                <SelectItem value="slow">🔴 بطيئة الحركة</SelectItem>
                <SelectItem value="dead">⚫ راكدة</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex gap-1">
              <div className="flex items-center gap-0.5 bg-muted/40 rounded-lg p-0.5 border border-border/40">
                <Button variant={locationType === "branch" ? "default" : "ghost"} size="sm" className="h-8 text-xs px-2"
                  onClick={() => { setLocationType("branch"); setLocationFilter("all"); }}>
                  <Store className="h-3.5 w-3.5 ml-1" /> فرع
                </Button>
                <Button variant={locationType === "warehouse" ? "default" : "ghost"} size="sm" className="h-8 text-xs px-2"
                  onClick={() => { setLocationType("warehouse"); setLocationFilter("all"); }}>
                  <Warehouse className="h-3.5 w-3.5 ml-1" /> مخزن
                </Button>
              </div>
              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger className="text-sm flex-1"><SelectValue placeholder={locationType === "branch" ? "كل الفروع" : "كل المخازن"} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{locationType === "branch" ? "كل الفروع" : "كل المخازن"}</SelectItem>
                  {locationType === "branch"
                    ? branches?.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)
                    : warehouses?.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)
                  }
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("flex-1 justify-start text-xs", !dateFrom && "text-muted-foreground")}>
                    <CalendarIcon className="ml-1 h-3.5 w-3.5" />
                    {dateFrom ? format(dateFrom, "yyyy-MM-dd") : "من تاريخ"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus />
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("flex-1 justify-start text-xs", !dateTo && "text-muted-foreground")}>
                    <CalendarIcon className="ml-1 h-3.5 w-3.5" />
                    {dateTo ? format(dateTo, "yyyy-MM-dd") : "إلى تاريخ"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
          <CardContent className="p-4 text-center">
            <Zap className="mx-auto mb-1 text-blue-600" size={22} />
            <p className="text-2xl font-black text-blue-700 dark:text-blue-400">{stats.fastCount}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">سريعة الحركة</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="p-4 text-center">
            <Activity className="mx-auto mb-1 text-amber-600" size={22} />
            <p className="text-2xl font-black text-amber-700 dark:text-amber-400">{stats.mediumCount}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">متوسطة الحركة</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20">
          <CardContent className="p-4 text-center">
            <Snail className="mx-auto mb-1 text-red-600" size={22} />
            <p className="text-2xl font-black text-red-700 dark:text-red-400">{stats.slowCount}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">بطيئة الحركة</p>
          </CardContent>
        </Card>
        <Card className="border-gray-300 dark:border-gray-600 bg-gray-100/50 dark:bg-gray-900/30">
          <CardContent className="p-4 text-center">
            <Ban className="mx-auto mb-1 text-gray-600" size={22} />
            <p className="text-2xl font-black text-gray-700 dark:text-gray-400">{stats.deadCount}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">راكدة</p>
          </CardContent>
        </Card>
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 text-center">
            <DollarSign className="mx-auto mb-1 text-destructive" size={22} />
            <p className="text-lg font-black text-destructive">{fmtInt(stats.totalLockedCapital)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">رأس مال مجمد</p>
          </CardContent>
        </Card>
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 text-center">
            <RefreshCw className="mx-auto mb-1 text-primary" size={22} />
            <p className="text-lg font-black text-primary">{stats.avgTurnover.toFixed(1)}x</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">متوسط معدل الدوران</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 print:hidden">
        {/* Speed Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <PieChartIcon size={16} className="text-primary" /> توزيع تصنيف الحركة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <RechartsPieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <Pie data={speedDistChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name} (${value})`}>
                  {speedDistChart.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </RechartsPieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Slow/Dead Items */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <AlertTriangle size={16} className="text-destructive" /> أعلى أصناف في تجميد رأس المال
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topSlowItems} layout="vertical" margin={{ top: 20, right: 80, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickMargin={10} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} tickMargin={10} />
                <Tooltip />
                <Bar dataKey="القيمة_المجمدة" fill="hsl(0, 84%, 60%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Locked Capital by Category */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <DollarSign size={16} className="text-amber-600" /> رأس المال المجمد حسب المجموعة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <RechartsPieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <Pie data={lockedCapitalChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name}: ${fmtInt(value)}`}>
                  {lockedCapitalChart.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => fmt(v)} />
              </RechartsPieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Turnover by Category */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <RefreshCw size={16} className="text-primary" /> متوسط معدل الدوران حسب المجموعة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={turnoverByCategory} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} tickMargin={10} />
                <YAxis tickMargin={10} />
                <Tooltip />
                <Bar dataKey="متوسط_الدوران" fill="hsl(221, 83%, 53%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h3 className="text-sm font-bold">جدول تحليل حركة المخزون</h3>
          <ExportButtons
            data={filteredData.map((i: any) => ({ code: i.code || "—", name: i.name, category: i.categoryName, unit: i.unit, stock: i.currentStock.toFixed(2), value: i.currentInventoryValue.toFixed(2), consumption: i.totalConsumptionQty.toFixed(2), turnover: i.turnoverRate.toFixed(2), holding: i.holdingDays >= 999 ? "∞" : i.holdingDays.toFixed(1), speed: i.speedLabel, recommendation: i.recommendation }))}
            columns={[{ key: "code", label: "الكود" }, { key: "name", label: "الصنف" }, { key: "category", label: "المجموعة" }, { key: "unit", label: "الوحدة" }, { key: "stock", label: "المخزون" }, { key: "value", label: "القيمة" }, { key: "consumption", label: "الاستهلاك" }, { key: "turnover", label: "معدل الدوران" }, { key: "holding", label: "فترة الاحتفاظ" }, { key: "speed", label: "التصنيف" }, { key: "recommendation", label: "التوصية" }]}
            filename="تحليل_حركة_المخزون"
            title="تحليل حركة المخزون"
          />
        </div>
        <CardContent className="p-0" ref={tableRef}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-right text-xs font-bold w-[60px]">الكود</TableHead>
                  <TableHead className="text-right text-xs font-bold">اسم الخامة</TableHead>
                  <TableHead className="text-right text-xs font-bold">المجموعة</TableHead>
                  <TableHead className="text-center text-xs font-bold">المخزون الحالي</TableHead>
                  <TableHead className="text-center text-xs font-bold">قيمة المخزون</TableHead>
                  <TableHead className="text-center text-xs font-bold">الاستهلاك</TableHead>
                  <TableHead className="text-center text-xs font-bold">تكلفة الاستهلاك</TableHead>
                  <TableHead className="text-center text-xs font-bold">معدل الدوران</TableHead>
                  <TableHead className="text-center text-xs font-bold">فترة الاحتفاظ</TableHead>
                  <TableHead className="text-center text-xs font-bold">التصنيف</TableHead>
                  <TableHead className="text-right text-xs font-bold min-w-[200px]">التوصية</TableHead>
                  <TableHead className="text-center text-xs font-bold">آخر حركة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-12 text-muted-foreground">
                      <Package className="mx-auto mb-2" size={32} />
                      <p className="text-sm">لا توجد بيانات للعرض</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredData.map((item) => (
                    <TableRow key={item.id} className={cn(
                      "transition-colors",
                      item.speed === "dead" && "bg-gray-50/50 dark:bg-gray-900/20",
                      item.speed === "slow" && "bg-red-50/30 dark:bg-red-950/10",
                    )}>
                      <TableCell className="text-xs font-mono text-muted-foreground">{item.code || "-"}</TableCell>
                      <TableCell className="text-xs font-semibold">{item.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{item.categoryName}</TableCell>
                      <TableCell className="text-center text-xs">{fmt(item.currentStock)} <span className="text-muted-foreground">{item.unit}</span></TableCell>
                      <TableCell className="text-center text-xs font-semibold">{fmt(item.currentInventoryValue)}</TableCell>
                      <TableCell className="text-center text-xs">{fmt(item.totalConsumptionQty)}</TableCell>
                      <TableCell className="text-center text-xs font-semibold">{fmt(item.totalConsumptionCost)}</TableCell>
                      <TableCell className="text-center">
                        <span className={cn(
                          "text-xs font-black",
                          item.turnoverRate >= 4 ? "text-blue-600" :
                            item.turnoverRate >= 1.5 ? "text-amber-600" :
                              item.turnoverRate > 0 ? "text-red-600" : "text-gray-500"
                        )}>
                          {item.turnoverRate.toFixed(1)}x
                        </span>
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        {item.holdingDays >= 999 ? (
                          <span className="text-destructive font-bold">∞</span>
                        ) : (
                          <span className={cn(
                            "font-bold",
                            item.holdingDays <= 7 ? "text-blue-600" :
                              item.holdingDays <= 20 ? "text-amber-600" : "text-red-600"
                          )}>
                            {item.holdingDays.toFixed(0)} يوم
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">{getSpeedBadge(item.speed, item.speedLabel)}</TableCell>
                      <TableCell className={cn("text-xs", item.recommendationColor)}>{item.recommendation}</TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground">
                        {item.lastMovementDate || "لا يوجد"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {filteredData.length > 0 && (
                <TableFooter>
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell colSpan={4} className="text-right text-xs">الإجمالي</TableCell>
                    <TableCell className="text-center text-xs">{fmt(stats.totalInventoryValue)}</TableCell>
                    <TableCell />
                    <TableCell className="text-center text-xs">{fmt(stats.totalConsumptionCost)}</TableCell>
                    <TableCell className="text-center text-xs">{stats.avgTurnover.toFixed(1)}x</TableCell>
                    <TableCell colSpan={4} />
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Strategic Summary */}
      {filteredData.length > 0 && (
        <Card className="border-primary/20 bg-primary/5 print:break-before-page">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-black flex items-center gap-2 text-primary">
              <FileText size={16} /> الخلاصة التنفيذية
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-2 text-foreground/80">
            <p>• <strong className="text-blue-600">{stats.fastCount}</strong> صنف سريع الحركة — أداء تشغيلي ممتاز، استمر في الطلب المنتظم.</p>
            <p>• <strong className="text-amber-600">{stats.mediumCount}</strong> صنف متوسط الحركة — راجع كميات الطلب لتقليل التخزين الزائد.</p>
            <p>• <strong className="text-red-600">{stats.slowCount}</strong> صنف بطيء الحركة — خفض المخزون وقلل حجم الشراء.</p>
            <p>• <strong className="text-destructive">{stats.deadCount}</strong> صنف راكد — أوقف الشراء فوراً وصرّف المخزون الحالي.</p>
            <div className="border-t border-border/40 pt-2 mt-3">
              <p className="font-bold text-destructive">
                💰 إجمالي رأس المال المجمد في المخزون البطيء والراكد: <span className="text-base">{fmtInt(stats.totalLockedCapital)}</span> ج.م
              </p>
              <p className="text-muted-foreground mt-1">كل جنيه مجمد في مخزون راكد هو خصم مباشر من قدرتك على التوسع.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
