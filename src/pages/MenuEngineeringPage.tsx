/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useMemo } from "react";
import { ExportButtons } from "@/components/ExportButtons";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis, Legend, ReferenceLine,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from "recharts";
import {
  ChefHat, Wine, Star, HelpCircle, Tractor, Dog,
  TrendingUp, DollarSign, BarChart3, PieChart as PieChartIcon, CalendarIcon,
  Printer, Loader2,
} from "lucide-react";

// Thresholds
const THRESHOLDS = {
  kitchen: { high: 60, medium: 45 },
  bar: { high: 70, medium: 50 },
};

type EngClass = "kitchen" | "bar";
type ProfitLevel = "عالية" | "منخفضة";
type PopularityLevel = "عالية" | "منخفضة";
type Strategic = "Stars" | "Puzzles" | "Plow Horses" | "Dogs";

interface EngRow {
  id: string;
  name: string;
  itemCode: string;
  categoryId: string | null;
  categoryCode: string;
  categoryName: string;
  qty: number;
  price: number;
  directCost: number;
  totalSales: number;
  totalCostSales: number;
  costRatio: number;
  netProfit: number;
  totalProfit: number;
  profitRatio: number;
  salesSharePct: number;
  profitLevel: ProfitLevel;
  popularityLevel: PopularityLevel;
  strategic: Strategic;
  decision: string;
}

const COLORS = {
  Stars: "hsl(145, 65%, 45%)",
  Puzzles: "hsl(38, 92%, 55%)",
  "Plow Horses": "hsl(199, 89%, 60%)",
  Dogs: "hsl(0, 70%, 55%)",
};

const STRATEGIC_ICONS: Record<Strategic, React.ReactNode> = {
  Stars: <Star size={14} />,
  Puzzles: <HelpCircle size={14} />,
  "Plow Horses": <Tractor size={14} />,
  Dogs: <Dog size={14} />,
};

const DECISIONS: Record<Strategic, string> = {
  Stars: "حافظ عليه وروّج له",
  Puzzles: "زوّد المبيعات",
  "Plow Horses": "حسّن الربحية",
  Dogs: "احذف أو عدّل",
};

function getProfitLevel(profitRatio: number, cls: EngClass): ProfitLevel {
  const t = THRESHOLDS[cls];
  return profitRatio >= t.medium ? "عالية" : "منخفضة";
}

function getPopularityLevel(salesSharePct: number, totalItems: number): PopularityLevel {
  if (totalItems === 0) return "منخفضة";
  const avgShare = 100 / totalItems;
  return salesSharePct >= avgShare * 0.8 ? "عالية" : "منخفضة";
}

function getStrategic(profit: ProfitLevel, popularity: PopularityLevel): Strategic {
  if (profit === "عالية" && popularity === "عالية") return "Stars";
  if (profit === "عالية" && popularity === "منخفضة") return "Puzzles";
  if (profit === "منخفضة" && popularity === "عالية") return "Plow Horses";
  return "Dogs";
}

const levelBadgeClass: Record<string, string> = {
  "عالية": "bg-green-500/15 text-green-400 border-green-500/30",
  "منخفضة": "bg-red-500/15 text-red-400 border-red-500/30",
};

const strategicBadgeClass: Record<Strategic, string> = {
  Stars: "bg-green-500/15 text-green-400 border-green-500/30",
  Puzzles: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  "Plow Horses": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  Dogs: "bg-red-500/15 text-red-400 border-red-500/30",
};

const strategicRowBg: Record<Strategic, string> = {
  Stars: "bg-green-500/5 hover:bg-green-500/10",
  Puzzles: "bg-yellow-500/5 hover:bg-yellow-500/10",
  "Plow Horses": "bg-blue-500/5 hover:bg-blue-500/10",
  Dogs: "bg-red-500/5 hover:bg-red-500/10",
};

export const MenuEngineeringPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const [activeTab, setActiveTab] = useState<EngClass>("kitchen");
  const [selectedBranch, setSelectedBranch] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [strategicFilter, setStrategicFilter] = useState<Strategic | "all">("all");

  // Queries
  const { data: branches = [] } = useQuery({
    queryKey: ["branches-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: posItems = [] } = useQuery({
    queryKey: ["pos-items-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("pos_items").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: categoriesList = [] } = useQuery({
    queryKey: ["categories-eng", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id, code, name").eq("company_id", companyId!);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  const categoryMap = useMemo(() => {
    const m = new Map<string, { code: string; name: string }>();
    (categoriesList as any[]).forEach((c) => m.set(c.id, { code: c.code || "", name: c.name || "" }));
    return m;
  }, [categoriesList]);


  const { data: recipes = [] } = useQuery({
    queryKey: ["recipes-with-ingredients", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("recipes").select("*, recipe_ingredients(*, stock_items:stock_item_id(*))");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const dateFromStr = dateFrom ? format(dateFrom, "yyyy-MM-dd") : null;
  const dateToStr = dateTo ? format(dateTo, "yyyy-MM-dd") : null;

  const { data: sales = [] } = useQuery({
    queryKey: ["pos-sales-with-items", companyId, selectedBranch, dateFromStr, dateToStr],
    queryFn: async () => {
      const all: any[] = [];
      const pageSize = 1000;
      let from = 0;
      // Paginate to bypass the 1000-row default limit
      // and filter server-side by branch + date range
      while (true) {
        let q = supabase
          .from("pos_sales")
          .select("*, pos_sale_items(*, pos_items(id, name, price, branch_id, menu_engineering_class))")
          .eq("company_id", companyId!)
          .eq("status", "مكتمل");
        if (selectedBranch && selectedBranch !== "all") q = q.eq("branch_id", selectedBranch);
        if (dateFromStr) q = q.gte("date", `${dateFromStr}T00:00:00`);
        if (dateToStr) q = q.lte("date", `${dateToStr}T23:59:59`);
        const { data, error } = await q.range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return all;
    },
    enabled: !!companyId,
  });

  const { data: stockItems = [] } = useQuery({
    queryKey: ["stock-items-all-eng", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_items").select("*").eq("active", true);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Per-branch costs (only when a specific branch is selected)
  const branchFilter = selectedBranch && selectedBranch !== "all" ? selectedBranch : null;
  const { data: branchCosts = [] } = useQuery({
    queryKey: ["eng-branch-costs", companyId, branchFilter],
    queryFn: async () => {
      if (!branchFilter) return [];
      const { data, error } = await supabase
        .from("stock_item_branch_costs")
        .select("stock_item_id, avg_cost")
        .eq("company_id", companyId!)
        .eq("branch_id", branchFilter);
      if (error) throw error;
      return (data as { stock_item_id: string; avg_cost: number }[]) || [];
    },
    enabled: !!companyId && !!branchFilter,
  });

  // Build recipe cost map: posItemId -> direct cost
  const recipeCostMap = useMemo(() => {
    const branchCostMap = new Map<string, number>();
    (branchCosts as any[]).forEach((bc) => {
      if (bc.stock_item_id && bc.avg_cost != null) {
        branchCostMap.set(bc.stock_item_id, Number(bc.avg_cost));
      }
    });
    const resolveCost = (stockItemId: string, globalCost: number): number => {
      if (!branchFilter) return globalCost;
      const bc = branchCostMap.get(stockItemId);
      return bc != null ? bc : globalCost;
    };

    const map: Record<string, number> = {};
    recipes.forEach((r: any) => {
      let totalCost = 0;
      (r.recipe_ingredients || []).forEach((ri: any) => {
        const si = ri.stock_items || stockItems.find((s: any) => s.id === ri.stock_item_id);
        if (si) {
          const qtyInStockUnit = Number(ri.qty) / (Number(si.conversion_factor) || 1);
          const unitCost = resolveCost(ri.stock_item_id, Number(si.avg_cost || 0));
          totalCost += qtyInStockUnit * unitCost;
        }
      });
      map[r.menu_item_id] = totalCost;
    });
    return map;
  }, [recipes, stockItems, branchCosts, branchFilter]);

  // Normalize names: trim + collapse internal whitespace so "كرسبي  L" matches "كرسبي L"
  const normName = (s: any) => String(s || "").trim().replace(/\s+/g, " ");

  // Aggregate sales by canonical pos_item NAME (from the joined pos_items row on the sale line).
  // This ensures sales referencing items from another branch, or items that no longer exist in
  // this branch's pos_items list, are still counted in the total.
  const salesAggByName = useMemo(() => {
    const map: Record<string, { qty: number; revenue: number; sourceItem?: any }> = {};
    sales.forEach((sale: any) => {
      (sale.pos_sale_items || []).forEach((si: any) => {
        const name = normName(si?.pos_items?.name);
        if (!name) return;
        const qty = Number(si.quantity ?? 0);
        const unitPrice = Number(si.unit_price ?? 0);
        const storedLineTotal = Number(si.total ?? NaN);
        const lineTotal = Number.isFinite(storedLineTotal) ? storedLineTotal : qty * unitPrice;
        if (!map[name]) map[name] = { qty: 0, revenue: 0, sourceItem: si.pos_items };
        map[name].qty += qty;
        map[name].revenue += lineTotal;
        if (!map[name].sourceItem && si.pos_items) map[name].sourceItem = si.pos_items;
      });
    });
    return map;
  }, [sales]);

  const salesQtyMap = useMemo(() => {
    const map: Record<string, number> = {};
    posItems.forEach((pi: any) => {
      const name = normName(pi.name);
      map[pi.id] = salesAggByName[name]?.qty || 0;
    });
    return map;
  }, [posItems, salesAggByName]);

  const salesRevenueMap = useMemo(() => {
    const map: Record<string, number> = {};
    posItems.forEach((pi: any) => {
      const name = normName(pi.name);
      map[pi.id] = salesAggByName[name]?.revenue || 0;
    });
    return map;
  }, [posItems, salesAggByName]);

  // Grand total = sum of ALL aggregated sales (even items not matched to current branch's pos_items)
  const grandTotalSalesAll = useMemo(() => {
    return Object.values(salesAggByName).reduce((s, v) => s + (v.revenue || 0), 0);
  }, [salesAggByName]);

  const displayPosItems = useMemo(() => {
    const byName = new Map<string, any>();
    posItems.forEach((pi: any) => {
      const name = normName(pi.name);
      if (!name) return;
      const isCurrentBranch = !pi.branch_id || pi.branch_id === branchFilter;
      const existing = byName.get(name);
      if (!existing || (branchFilter && isCurrentBranch)) byName.set(name, pi);
    });

    Object.entries(salesAggByName).forEach(([name, agg]) => {
      if (byName.has(name) || !agg.sourceItem) return;
      byName.set(name, { ...agg.sourceItem, id: `sold-${agg.sourceItem.id}`, name, branch_id: branchFilter ?? agg.sourceItem.branch_id, __source_pos_item_id: agg.sourceItem.id });
    });

    return Array.from(byName.values());
  }, [posItems, salesAggByName, branchFilter]);

  // Get POS items classified as kitchen/bar, with recipe ingredients as fallback
  const classifiedPosItems = useMemo(() => {
    const result: Record<EngClass, Set<string>> = { kitchen: new Set(), bar: new Set() };

    displayPosItems.forEach((pi: any) => {
      const cls = String(pi.menu_engineering_class || "").toLowerCase();
      if (cls === "kitchen" || cls === "bar") {
        result[cls as EngClass].add(pi.id);
      }
    });

    const stockClassMap: Record<string, string> = {};
    stockItems.forEach((si: any) => {
      const cls = String(si.menu_engineering_class || "").toLowerCase();
      if (cls === "kitchen" || cls === "bar") {
        stockClassMap[si.id] = cls;
      }
    });

    recipes.forEach((r: any) => {
      const classes = new Set<string>();
      (r.recipe_ingredients || []).forEach((ri: any) => {
        const cls = stockClassMap[ri.stock_item_id];
        if (cls) classes.add(cls);
      });

      const itemIds = displayPosItems.filter((pi: any) => pi.id === r.menu_item_id || pi.__source_pos_item_id === r.menu_item_id).map((pi: any) => pi.id);
      if (classes.has("kitchen")) itemIds.forEach((id: string) => result.kitchen.add(id));
      if (classes.has("bar")) itemIds.forEach((id: string) => result.bar.add(id));
    });

    return result;
  }, [displayPosItems, recipes, stockItems]);

  // Build engineering rows for active tab
  const engineeringData = useMemo(() => {
    const relevantPosItemIds = classifiedPosItems[activeTab];
    const items = displayPosItems.filter((pi: any) => {
      if (!relevantPosItemIds.has(pi.id)) return false;
      if (selectedBranch !== "all" && pi.branch_id && pi.branch_id !== selectedBranch) return false;
      return true;
    });

    const totalAllSales = items.reduce((sum: number, pi: any) => {
      const name = normName(pi.name);
      return sum + (salesAggByName[name]?.revenue || salesRevenueMap[pi.id] || 0);
    }, 0);

    const rows: EngRow[] = items.map((pi: any) => {
      const name = normName(pi.name);
      const qty = salesAggByName[name]?.qty || salesQtyMap[pi.id] || 0;
      const price = Number(pi.price);
      const costKey = pi.__source_pos_item_id || pi.id;
      const directCost = recipeCostMap[costKey] || recipeCostMap[pi.id] || 0;
      const totalSales = salesAggByName[name]?.revenue || salesRevenueMap[pi.id] || 0;
      const totalCostSales = qty * directCost;
      const costRatio = totalCostSales > 0 ? (totalSales / totalCostSales) * 100 : 0;
      const netProfit = (price || 0) - directCost;
      const totalProfit = netProfit * qty;
      const profitRatio = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;
      const salesSharePct = totalAllSales > 0 ? (totalSales / totalAllSales) * 100 : 0;

      const profitLevel = getProfitLevel(profitRatio, activeTab);
      const popularityLevel = getPopularityLevel(salesSharePct, items.length);
      const strategic = getStrategic(profitLevel, popularityLevel);

      const catInfo = pi.category_id ? categoryMap.get(pi.category_id) : undefined;
      const categoryName = catInfo?.name || pi.category || "بدون مجموعة";
      const categoryCode = catInfo?.code || "ZZZ";

      return {
        id: pi.id,
        name: pi.name,
        itemCode: pi.code || "",
        categoryId: pi.category_id || null,
        categoryCode,
        categoryName,
        qty,
        price,
        directCost,
        totalSales,
        totalCostSales,
        costRatio,
        netProfit,
        totalProfit,
        profitRatio,
        salesSharePct,
        profitLevel,
        popularityLevel,
        strategic,
        decision: DECISIONS[strategic],
      };
    });

    // Sort by category code, then by item code, then by name — deterministic & professional
    return rows.sort((a, b) => {
      const c = a.categoryCode.localeCompare(b.categoryCode, "ar", { numeric: true });
      if (c !== 0) return c;
      const ic = a.itemCode.localeCompare(b.itemCode, "ar", { numeric: true });
      if (ic !== 0) return ic;
      return a.name.localeCompare(b.name, "ar");
    });
  }, [displayPosItems, classifiedPosItems, activeTab, salesAggByName, salesQtyMap, salesRevenueMap, recipeCostMap, selectedBranch, categoryMap]);

  // Group rows by category for grouped rendering
  const groupedEngineeringData = useMemo(() => {
    const groups = new Map<string, { categoryCode: string; categoryName: string; rows: EngRow[] }>();
    engineeringData.forEach((r) => {
      const key = `${r.categoryCode}__${r.categoryName}`;
      if (!groups.has(key)) groups.set(key, { categoryCode: r.categoryCode, categoryName: r.categoryName, rows: [] });
      groups.get(key)!.rows.push(r);
    });
    return Array.from(groups.values());
  }, [engineeringData]);


  // Totals
  const totals = useMemo(() => {
    return {
      qty: engineeringData.reduce((s, r) => s + r.qty, 0),
      totalSales: engineeringData.reduce((s, r) => s + r.totalSales, 0),
      totalCostSales: engineeringData.reduce((s, r) => s + r.totalCostSales, 0),
      totalProfit: engineeringData.reduce((s, r) => s + r.totalProfit, 0),
    };
  }, [engineeringData]);

  // Chart data
  const strategicCounts = useMemo(() => {
    const counts: Record<Strategic, number> = { Stars: 0, Puzzles: 0, "Plow Horses": 0, Dogs: 0 };
    engineeringData.forEach((r) => counts[r.strategic]++);
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [engineeringData]);

  const topProfitItems = useMemo(() => {
    return [...engineeringData]
      .sort((a, b) => b.totalProfit - a.totalProfit)
      .slice(0, 10)
      .map((r) => ({ name: r.name, profit: Math.round(r.totalProfit), sales: Math.round(r.totalSales) }));
  }, [engineeringData]);

  const scatterData = useMemo(() => {
    return engineeringData.map((r) => ({
      name: r.name,
      x: r.salesSharePct,
      y: r.profitRatio,
      z: r.totalSales,
      strategic: r.strategic,
    }));
  }, [engineeringData]);

  const radarData = useMemo(() => {
    const strategics: Strategic[] = ["Stars", "Puzzles", "Plow Horses", "Dogs"];
    return strategics.map((s) => {
      const items = engineeringData.filter((r) => r.strategic === s);
      return {
        category: s,
        count: items.length,
        avgProfit: items.length > 0 ? items.reduce((sum, r) => sum + r.profitRatio, 0) / items.length : 0,
        totalRevenue: items.reduce((sum, r) => sum + r.totalSales, 0),
      };
    });
  }, [engineeringData]);

  const t = THRESHOLDS[activeTab];

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <BarChart3 size={28} className="text-primary" />
          <h1 className="text-2xl font-bold">هندسة المنيو</h1>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <ExportButtons
            data={engineeringData.map((r, idx) => ({
              "#": idx + 1,
              الصنف: r.name,
              "كمية المبيعات": r.qty,
              "سعر البيع": r.price.toFixed(2),
              "التكلفة المباشرة": r.directCost.toFixed(2),
              "إجمالي المبيعات": r.totalSales.toFixed(2),
              "إجمالي تكلفة المبيعات": r.totalCostSales.toFixed(2),
              "النسبة للتكلفة %": r.costRatio.toFixed(1),
              "صافي ربح الصنف": r.netProfit.toFixed(2),
              "إجمالي الربح": r.totalProfit.toFixed(2),
              "نسبة الربح %": r.profitRatio.toFixed(1),
              "% مبيعات الصنف": r.salesSharePct.toFixed(1),
              الربحية: r.profitLevel,
              الشعبية: r.popularityLevel,
              التصنيف: r.strategic,
              القرار: r.decision,
            }))}
            columns={[
              { key: "#", label: "#" },
              { key: "الصنف", label: "الصنف" },
              { key: "كمية المبيعات", label: "كمية المبيعات" },
              { key: "سعر البيع", label: "سعر البيع" },
              { key: "التكلفة المباشرة", label: "التكلفة المباشرة" },
              { key: "إجمالي المبيعات", label: "إجمالي المبيعات" },
              { key: "إجمالي تكلفة المبيعات", label: "إجمالي تكلفة المبيعات" },
              { key: "النسبة للتكلفة %", label: "النسبة للتكلفة %" },
              { key: "صافي ربح الصنف", label: "صافي ربح الصنف" },
              { key: "إجمالي الربح", label: "إجمالي الربح" },
              { key: "نسبة الربح %", label: "نسبة الربح %" },
              { key: "% مبيعات الصنف", label: "% مبيعات الصنف" },
              { key: "الربحية", label: "الربحية" },
              { key: "الشعبية", label: "الشعبية" },
              { key: "التصنيف", label: "التصنيف" },
              { key: "القرار", label: "القرار" },
            ]}
            filename="هندسة_المنيو"
            title={`هندسة المنيو - ${activeTab === "kitchen" ? "المطبخ" : "البار"}`}
            filters={[
              { label: "الفرع", value: selectedBranch === "all" ? "الكل" : (branches.find((b: any) => b.id === selectedBranch)?.name ?? "—") },
              { label: "من تاريخ", value: dateFrom ? format(dateFrom, "yyyy/MM/dd") : "—" },
              { label: "إلى تاريخ", value: dateTo ? format(dateTo, "yyyy/MM/dd") : "—" },
            ]}
          />
          <Button variant="outline" size="sm" className="gap-2" onClick={() => {
            const dateStr = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
            const logoSrc = `${window.location.origin}/logo.png`;
            const titleText = `هندسة المنيو - ${activeTab === "kitchen" ? "المطبخ" : "البار"}`;
            const cols = [
              { key: "#", label: "#" },
              { key: "الصنف", label: "الصنف" },
              { key: "كمية المبيعات", label: "كمية المبيعات" },
              { key: "سعر البيع", label: "سعر البيع" },
              { key: "التكلفة المباشرة", label: "التكلفة المباشرة" },
              { key: "إجمالي المبيعات", label: "إجمالي المبيعات" },
              { key: "إجمالي تكلفة المبيعات", label: "إجمالي تكلفة المبيعات" },
              { key: "النسبة للتكلفة %", label: "النسبة للتكلفة %" },
              { key: "صافي ربح الصنف", label: "صافي ربح الصنف" },
              { key: "إجمالي الربح", label: "إجمالي الربح" },
              { key: "نسبة الربح %", label: "نسبة الربح %" },
              { key: "% مبيعات الصنف", label: "% مبيعات الصنف" },
              { key: "الربحية", label: "الربحية" },
              { key: "الشعبية", label: "الشعبية" },
              { key: "التصنيف", label: "التصنيف" },
              { key: "القرار", label: "القرار" },
            ];
            let theadHTML = "<tr>";
            for (const col of cols) {
              theadHTML += `<th style="border:1px solid #000;padding:3px 4px;font-size:7px;text-align:center;white-space:nowrap;">${col.label}</th>`;
            }
            theadHTML += "</tr>";

            const colCount = cols.length;
            let tbodyHTML = "";
            let runningIdx = 0;
            groupedEngineeringData.forEach((grp) => {
              const groupSubtotal = {
                qty: grp.rows.reduce((s, r) => s + r.qty, 0),
                totalSales: grp.rows.reduce((s, r) => s + r.totalSales, 0),
                totalCostSales: grp.rows.reduce((s, r) => s + r.totalCostSales, 0),
                totalProfit: grp.rows.reduce((s, r) => s + r.totalProfit, 0),
              };
              // Group header row
              tbodyHTML += `<tr><td colspan="${colCount}" style="border:1px solid #000;padding:4px 6px;font-size:9px;text-align:right;font-weight:bold;background:#d9e7ff;">📁 ${grp.categoryCode ? `[${grp.categoryCode}] ` : ""}${grp.categoryName} &nbsp;(${grp.rows.length} صنف)</td></tr>`;
              // Item rows
              grp.rows.forEach((r) => {
                runningIdx++;
                const cells: Record<string, any> = {
                  "#": runningIdx,
                  "الصنف": r.itemCode ? `${r.itemCode} - ${r.name}` : r.name,
                  "كمية المبيعات": r.qty,
                  "سعر البيع": r.price.toFixed(2),
                  "التكلفة المباشرة": r.directCost.toFixed(2),
                  "إجمالي المبيعات": r.totalSales.toFixed(2),
                  "إجمالي تكلفة المبيعات": r.totalCostSales.toFixed(2),
                  "النسبة للتكلفة %": r.costRatio.toFixed(1),
                  "صافي ربح الصنف": r.netProfit.toFixed(2),
                  "إجمالي الربح": r.totalProfit.toFixed(2),
                  "نسبة الربح %": r.profitRatio.toFixed(1),
                  "% مبيعات الصنف": r.salesSharePct.toFixed(1),
                  "الربحية": r.profitLevel,
                  "الشعبية": r.popularityLevel,
                  "التصنيف": r.strategic,
                  "القرار": r.decision,
                };
                tbodyHTML += "<tr>";
                for (const col of cols) {
                  const val = cells[col.key] !== null && cells[col.key] !== undefined ? String(cells[col.key]) : "—";
                  tbodyHTML += `<td style="border:1px solid #000;padding:2px 3px;font-size:7px;text-align:center;">${val}</td>`;
                }
                tbodyHTML += "</tr>";
              });
              // Group subtotal row
              const subCells: Record<string, any> = {
                "#": "",
                "الصنف": `إجمالي ${grp.categoryName}`,
                "كمية المبيعات": groupSubtotal.qty,
                "سعر البيع": "",
                "التكلفة المباشرة": "",
                "إجمالي المبيعات": groupSubtotal.totalSales.toFixed(2),
                "إجمالي تكلفة المبيعات": groupSubtotal.totalCostSales.toFixed(2),
                "النسبة للتكلفة %": "",
                "صافي ربح الصنف": "",
                "إجمالي الربح": groupSubtotal.totalProfit.toFixed(2),
                "نسبة الربح %": "",
                "% مبيعات الصنف": "",
                "الربحية": "",
                "الشعبية": "",
                "التصنيف": "",
                "القرار": "",
              };
              tbodyHTML += "<tr>";
              for (const col of cols) {
                const val = subCells[col.key] !== "" ? String(subCells[col.key]) : "—";
                tbodyHTML += `<td style="border:1px solid #000;padding:2px 3px;font-size:7px;text-align:center;font-weight:bold;background:#f0f4ff;">${val}</td>`;
              }
              tbodyHTML += "</tr>";
            });
            // Grand total row
            const grandCells: Record<string, any> = {
              "#": "",
              "الصنف": "الإجمالي العام",
              "كمية المبيعات": totals.qty,
              "سعر البيع": "",
              "التكلفة المباشرة": "",
              "إجمالي المبيعات": totals.totalSales.toFixed(2),
              "إجمالي تكلفة المبيعات": totals.totalCostSales.toFixed(2),
              "النسبة للتكلفة %": totals.totalSales > 0 ? ((totals.totalCostSales / totals.totalSales) * 100).toFixed(1) : "0",
              "صافي ربح الصنف": "",
              "إجمالي الربح": totals.totalProfit.toFixed(2),
              "نسبة الربح %": totals.totalSales > 0 ? ((totals.totalProfit / totals.totalSales) * 100).toFixed(1) : "0",
              "% مبيعات الصنف": "100.0",
              "الربحية": "",
              "الشعبية": "",
              "التصنيف": "",
              "القرار": "",
            };
            tbodyHTML += "<tr>";
            for (const col of cols) {
              const val = grandCells[col.key] !== "" ? String(grandCells[col.key]) : "—";
              tbodyHTML += `<td style="border:1px solid #000;padding:3px 4px;font-size:8px;text-align:center;font-weight:bold;background:#ffe9b3;">${val}</td>`;
            }
            tbodyHTML += "</tr>";


            const printHTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>${titleText}</title>
  <style>
    @font-face { font-family: 'CairoLocal'; src: url('${window.location.origin}/fonts/Cairo-Regular.ttf') format('truetype'); font-display: swap; }
    @font-face { font-family: 'AmiriLocal'; src: url('${window.location.origin}/fonts/Amiri-Regular.ttf') format('truetype'); font-display: swap; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'CairoLocal', 'AmiriLocal', sans-serif; direction: rtl; padding: 10px; color: #000; background: #fff; }
    @media print { @page { size: landscape; margin: 5mm; } body { padding: 0; } }
    .header { text-align: center; margin-bottom: 8px; border-bottom: 1px solid #000; padding-bottom: 6px; display: flex; align-items: center; justify-content: center; gap: 8px; }
    .logo { width: 50px; height: 50px; object-fit: contain; }
    .header h1 { font-size: 14px; font-weight: bold; margin-bottom: 1px; }
    .header p { font-size: 9px; color: #000; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .footer { text-align: center; margin-top: 8px; font-size: 7px; color: #000; border-top: 1px solid #000; padding-top: 4px; }
  </style>
</head>
<body>
  <div class="header">
    <img src="${logoSrc}" alt="Logo" class="logo" />
    <div>
      <h1>${titleText}</h1>
      <p>Cost Management System • ${dateStr}</p>
    </div>
  </div>
  <div style="text-align:center;margin-bottom:8px;font-size:9px;font-weight:bold;border:1px solid #000;padding:4px 6px;">
    الفرع: ${selectedBranch === "all" ? "كل الفروع" : (branches.find((b: any) => b.id === selectedBranch)?.name ?? "—")}
    &nbsp;•&nbsp; من تاريخ: ${dateFrom ? format(dateFrom, "yyyy/MM/dd") : "—"}
    &nbsp;•&nbsp; إلى تاريخ: ${dateTo ? format(dateTo, "yyyy/MM/dd") : "—"}
    &nbsp;•&nbsp; القسم: ${activeTab === "kitchen" ? "المطبخ" : "البار"}
  </div>
  <table>
    <thead>${theadHTML}</thead>
    <tbody>${tbodyHTML}</tbody>
  </table>
  <div class="footer">Powered by Mohamed Abdel Aal</div>
  <script>
    (async function () {
      try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) {}
      window.print();
      window.onafterprint = function() { window.close(); };
    })();
  </script>
</body>
</html>`;
            const w = window.open("", "_blank");
            if (w) { w.document.write(printHTML); w.document.close(); }
          }}>
            <Printer size={14} />
            طباعة
          </Button>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={selectedBranch} onValueChange={setSelectedBranch}>
            <SelectTrigger className="w-44"><SelectValue placeholder="كل الفروع" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الفروع</SelectItem>
              {branches.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("text-sm justify-start min-w-[160px]", !dateFrom && "text-muted-foreground")}>
                <CalendarIcon size={14} className="ml-1" />
                {dateFrom ? format(dateFrom, "yyyy/MM/dd") : "من تاريخ"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("text-sm justify-start min-w-[160px]", !dateTo && "text-muted-foreground")}>
                <CalendarIcon size={14} className="ml-1" />
                {dateTo ? format(dateTo, "yyyy/MM/dd") : "إلى تاريخ"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>

          {(dateFrom || dateTo || selectedBranch !== "all") && (
            <Button variant="ghost" size="sm" onClick={() => { setSelectedBranch("all"); setDateFrom(undefined); setDateTo(undefined); }}>
              مسح الفلاتر
            </Button>
          )}
        </div>
      </div>

      {/* Thresholds info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">إجمالي الأصناف</p>
            <p className="text-2xl font-bold text-foreground">{engineeringData.length}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">إجمالي المبيعات ({activeTab === "kitchen" ? "مطبخ" : "بار"})</p>
            <p className="text-2xl font-bold text-primary">{totals.totalSales.toLocaleString("en", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">إجمالي الأرباح</p>
            <p className="text-2xl font-bold text-accent">{totals.totalProfit.toLocaleString("en", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">نسب الربحية ({activeTab === "kitchen" ? "مطبخ" : "بار"})</p>
            <div className="flex gap-1 justify-center mt-1 text-xs">
              <Badge className={levelBadgeClass["عالية"]}>{"≥"}{t.medium}% عالية</Badge>
              <Badge className={levelBadgeClass["منخفضة"]}>{"<"}{t.medium}% منخفضة</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Kitchen vs Bar */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as EngClass)} dir="rtl">
        <TabsList className="grid w-full grid-cols-2 max-w-xs">
          <TabsTrigger value="kitchen" className="gap-2">
            <ChefHat size={16} /> المطبخ
          </TabsTrigger>
          <TabsTrigger value="bar" className="gap-2">
            <Wine size={16} /> البار
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab}>
          {/* Quick strategic filters */}
          {engineeringData.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-xs text-muted-foreground">تصفية سريعة:</span>
              <Button
                variant={strategicFilter === "all" ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setStrategicFilter("all")}
              >
                الكل ({engineeringData.length})
              </Button>
              {(["Stars", "Puzzles", "Plow Horses", "Dogs"] as Strategic[]).map((s) => {
                const count = engineeringData.filter((r) => r.strategic === s).length;
                return (
                  <Button
                    key={s}
                    variant={strategicFilter === s ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => setStrategicFilter(s)}
                  >
                    {STRATEGIC_ICONS[s]}
                    {s} ({count})
                  </Button>
                );
              })}
            </div>
          )}

          {/* Analysis Table */}
          <div className="glass-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right text-xs">#</TableHead>
                  <TableHead className="text-right text-xs">الصنف</TableHead>
                  <TableHead className="text-right text-xs">كمية المبيعات</TableHead>
                  <TableHead className="text-right text-xs">سعر البيع</TableHead>
                  <TableHead className="text-right text-xs">التكلفة المباشرة</TableHead>
                  <TableHead className="text-right text-xs">إجمالي المبيعات</TableHead>
                  <TableHead className="text-right text-xs">إجمالي تكلفة المبيعات</TableHead>
                  <TableHead className="text-right text-xs">النسبة للتكلفة %</TableHead>
                  <TableHead className="text-right text-xs">صافي ربح الصنف</TableHead>
                  <TableHead className="text-right text-xs">إجمالي الربح</TableHead>
                  <TableHead className="text-right text-xs">نسبة الربح %</TableHead>
                  <TableHead className="text-right text-xs">% مبيعات الصنف</TableHead>
                  <TableHead className="text-right text-xs">ربح الكاتجوري</TableHead>
                  <TableHead className="text-right text-xs">شعبية الكاتجوري</TableHead>
                  <TableHead className="text-right text-xs">التصنيف</TableHead>
                  <TableHead className="text-right text-xs">القرار</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {engineeringData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={16} className="text-center py-8 text-muted-foreground">
                      لا توجد بيانات - تأكد من تكويد تصنيف هندسة المنيو للخامات وربطها بالوصفات
                    </TableCell>
                  </TableRow>
                ) : (
                  (() => {
                    let runningIdx = 0;
                    const filteredGroups = groupedEngineeringData
                      .map((grp) => ({
                        ...grp,
                        rows: strategicFilter === "all" ? grp.rows : grp.rows.filter((r) => r.strategic === strategicFilter),
                      }))
                      .filter((grp) => grp.rows.length > 0);
                    return filteredGroups.map((grp) => {
                      const groupSubtotal = {
                        qty: grp.rows.reduce((s, r) => s + r.qty, 0),
                        totalSales: grp.rows.reduce((s, r) => s + r.totalSales, 0),
                        totalCostSales: grp.rows.reduce((s, r) => s + r.totalCostSales, 0),
                        totalProfit: grp.rows.reduce((s, r) => s + r.totalProfit, 0),
                      };
                      return (
                        <React.Fragment key={`${grp.categoryCode}-${grp.categoryName}`}>
                          <TableRow className="bg-primary/10 hover:bg-primary/10">
                            <TableCell colSpan={16} className="text-sm font-bold text-primary">
                              📁 {grp.categoryCode ? `[${grp.categoryCode}] ` : ""}{grp.categoryName} <span className="text-xs text-muted-foreground font-normal">({grp.rows.length} صنف)</span>
                            </TableCell>
                          </TableRow>
                          {grp.rows.map((row) => {
                            runningIdx++;
                            return (
                              <TableRow key={row.id} className={strategicRowBg[row.strategic]}>
                                <TableCell className="text-xs">{runningIdx}</TableCell>
                                <TableCell className="font-medium text-sm whitespace-nowrap">{row.itemCode ? `${row.itemCode} - ` : ""}{row.name}</TableCell>
                                <TableCell className="text-xs">{row.qty}</TableCell>
                                <TableCell className="text-xs">{row.price.toFixed(2)}</TableCell>
                                <TableCell className="text-xs">{row.directCost.toFixed(2)}</TableCell>
                                <TableCell className="text-xs">{row.totalSales.toFixed(2)}</TableCell>
                                <TableCell className="text-xs">{row.totalCostSales.toFixed(2)}</TableCell>
                                <TableCell className="text-xs">{row.costRatio.toFixed(1)}%</TableCell>
                                <TableCell className="text-xs">{row.netProfit.toFixed(2)}</TableCell>
                                <TableCell className="text-xs font-semibold">{row.totalProfit.toFixed(2)}</TableCell>
                                <TableCell className="text-xs">{row.profitRatio.toFixed(1)}%</TableCell>
                                <TableCell className="text-xs">{row.salesSharePct.toFixed(1)}%</TableCell>
                                <TableCell><Badge className={`text-[10px] ${levelBadgeClass[row.profitLevel]}`}>{row.profitLevel}</Badge></TableCell>
                                <TableCell><Badge className={`text-[10px] ${levelBadgeClass[row.popularityLevel]}`}>{row.popularityLevel}</Badge></TableCell>
                                <TableCell>
                                  <Badge className={`text-[10px] gap-1 ${strategicBadgeClass[row.strategic]}`}>
                                    {STRATEGIC_ICONS[row.strategic]}
                                    {row.strategic}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <span className={`text-[10px] font-semibold ${strategicBadgeClass[row.strategic].replace(/bg-\S+/g, '').trim()}`}>
                                    {row.decision}
                                  </span>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          <TableRow className="bg-muted/20 font-semibold">
                            <TableCell colSpan={2} className="text-xs text-muted-foreground">إجمالي المجموعة: {grp.categoryName}</TableCell>
                            <TableCell className="text-xs">{groupSubtotal.qty}</TableCell>
                            <TableCell className="text-xs">—</TableCell>
                            <TableCell className="text-xs">—</TableCell>
                            <TableCell className="text-xs">{groupSubtotal.totalSales.toFixed(2)}</TableCell>
                            <TableCell className="text-xs">{groupSubtotal.totalCostSales.toFixed(2)}</TableCell>
                            <TableCell className="text-xs">—</TableCell>
                            <TableCell className="text-xs">—</TableCell>
                            <TableCell className="text-xs">{groupSubtotal.totalProfit.toFixed(2)}</TableCell>
                            <TableCell colSpan={6} className="text-xs">—</TableCell>
                          </TableRow>
                        </React.Fragment>
                      );
                    });
                  })()
                )}
                {/* Totals row */}
                {engineeringData.length > 0 && (
                  <TableRow className="bg-muted/30 font-bold">
                    <TableCell colSpan={2} className="text-sm">الإجماليات</TableCell>
                    <TableCell className="text-xs">{totals.qty}</TableCell>
                    <TableCell className="text-xs">—</TableCell>
                    <TableCell className="text-xs">—</TableCell>
                    <TableCell className="text-xs">{totals.totalSales.toFixed(2)}</TableCell>
                    <TableCell className="text-xs">{totals.totalCostSales.toFixed(2)}</TableCell>
                    <TableCell className="text-xs">—</TableCell>
                    <TableCell className="text-xs">—</TableCell>
                    <TableCell className="text-xs">{totals.totalProfit.toFixed(2)}</TableCell>
                    <TableCell colSpan={6} className="text-xs">—</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Charts */}
          {engineeringData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              {/* Strategic Distribution Pie */}
              <Card className="glass-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <PieChartIcon size={16} className="text-primary" />
                    توزيع التصنيف الاستراتيجي
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                      <Pie
                        data={strategicCounts}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {strategicCounts.map((entry) => (
                          <Cell key={entry.name} fill={COLORS[entry.name as Strategic]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: "hsl(222, 47%, 8%)", border: "1px solid hsl(217, 33%, 18%)", borderRadius: "8px", color: "#000" }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Top 10 Profit Bar Chart */}
              <Card className="glass-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <DollarSign size={16} className="text-accent" />
                    أعلى 10 أصناف ربحية
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={topProfitItems} layout="vertical" margin={{ top: 20, right: 20, bottom: 20, left: 80 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(217, 33%, 18%)" />
                      <XAxis type="number" tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 10 }} tickMargin={10} />
                      <YAxis dataKey="name" type="category" tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 10 }} width={95} tickMargin={70} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(222, 47%, 8%)", border: "1px solid hsl(217, 33%, 18%)", borderRadius: "8px", color: "#000" }} />
                      <Bar dataKey="profit" fill="hsl(145, 65%, 45%)" name="الربح" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="sales" fill="hsl(199, 89%, 60%)" name="المبيعات" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Scatter: Popularity vs Profitability */}
              <Card className="glass-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp size={16} className="text-secondary" />
                    مصفوفة الربحية vs الشعبية
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={320}>
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 30, left: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(217, 33%, 18%)" />
                      <XAxis dataKey="x" name="% مبيعات" tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 10 }} label={{ value: "شعبية (%)", position: "bottom", offset: 15, fill: "hsl(215, 20%, 55%)", fontSize: 11 }} tickMargin={10} />
                      <YAxis dataKey="y" name="% ربح" tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 10 }} label={{ value: "ربحية (%)", angle: -90, position: "insideLeft", offset: -5, fill: "hsl(215, 20%, 55%)", fontSize: 11 }} tickMargin={10} />
                      <ZAxis dataKey="z" range={[40, 400]} name="المبيعات" />
                      <ReferenceLine y={t.medium} stroke="hsl(145, 65%, 45%)" strokeDasharray="4 4" label={{ value: `حد الربحية ${t.medium}%`, position: "insideTopRight", fill: "hsl(145, 65%, 45%)", fontSize: 10 }} />
                      <ReferenceLine x={engineeringData.length > 0 ? (100 / engineeringData.length) * 0.8 : 0} stroke="hsl(199, 89%, 60%)" strokeDasharray="4 4" label={{ value: "حد الشعبية", position: "insideTopLeft", fill: "hsl(199, 89%, 60%)", fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "hsl(222, 47%, 8%)", border: "1px solid hsl(217, 33%, 18%)", borderRadius: "8px", color: "#000" }}
                        formatter={(val: any, name: string) => [typeof val === 'number' ? val.toFixed(1) : val, name]}
                        labelFormatter={(label) => {
                          const item = scatterData.find((d) => d.x === label);
                          return item?.name || "";
                        }}
                      />
                      {(["Stars", "Puzzles", "Plow Horses", "Dogs"] as Strategic[]).map((s) => (
                        <Scatter
                          key={s}
                          name={s}
                          data={scatterData.filter((d) => d.strategic === s)}
                          fill={COLORS[s]}
                        />
                      ))}
                      <Legend />
                    </ScatterChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Radar Chart */}
              <Card className="glass-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 size={16} className="text-warning" />
                    تحليل الأداء حسب التصنيف
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={320}>
                    <RadarChart data={radarData} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                      <PolarGrid stroke="hsl(217, 33%, 18%)" />
                      <PolarAngleAxis dataKey="category" tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 11 }} />
                      <PolarRadiusAxis tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 9 }} />
                      <Radar name="عدد الأصناف" dataKey="count" stroke="hsl(199, 89%, 60%)" fill="hsl(199, 89%, 60%)" fillOpacity={0.3} />
                      <Radar name="متوسط الربح %" dataKey="avgProfit" stroke="hsl(145, 65%, 45%)" fill="hsl(145, 65%, 45%)" fillOpacity={0.2} />
                      <Legend />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(222, 47%, 8%)", border: "1px solid hsl(217, 33%, 18%)", borderRadius: "8px", color: "#000" }} />
                    </RadarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
