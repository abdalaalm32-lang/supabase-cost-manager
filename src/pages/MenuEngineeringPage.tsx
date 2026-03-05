/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useMemo } from "react";
import { ExportButtons } from "@/components/ExportButtons";
import { PrintButton } from "@/components/PrintButton";
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
  PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis, Legend,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from "recharts";
import {
  ChefHat, Wine, Star, HelpCircle, Tractor, Dog,
  TrendingUp, DollarSign, BarChart3, PieChart as PieChartIcon, CalendarIcon,
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

export const MenuEngineeringPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const [activeTab, setActiveTab] = useState<EngClass>("kitchen");
  const [selectedBranch, setSelectedBranch] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

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

  const { data: recipes = [] } = useQuery({
    queryKey: ["recipes-with-ingredients", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("recipes").select("*, recipe_ingredients(*, stock_items:stock_item_id(*))");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: sales = [] } = useQuery({
    queryKey: ["pos-sales-with-items", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("pos_sales").select("*, pos_sale_items(*)").eq("status", "مكتمل");
      if (error) throw error;
      return data;
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

  // Build recipe cost map: posItemId -> direct cost
  const recipeCostMap = useMemo(() => {
    const map: Record<string, number> = {};
    recipes.forEach((r: any) => {
      let totalCost = 0;
      (r.recipe_ingredients || []).forEach((ri: any) => {
        const si = ri.stock_items || stockItems.find((s: any) => s.id === ri.stock_item_id);
        if (si) {
          const qtyInStockUnit = Number(ri.qty) / (Number(si.conversion_factor) || 1);
          totalCost += qtyInStockUnit * Number(si.avg_cost || 0);
        }
      });
      map[r.menu_item_id] = totalCost;
    });
    return map;
  }, [recipes, stockItems]);

  // Build recipe net profit map: posItemId -> net profit
  const recipeNetProfitMap = useMemo(() => {
    const map: Record<string, number> = {};
    posItems.forEach((pi: any) => {
      const cost = recipeCostMap[pi.id] || 0;
      map[pi.id] = Number(pi.price) - cost;
    });
    return map;
  }, [posItems, recipeCostMap]);

  // Build sales qty map: posItemId -> total qty sold
  const salesQtyMap = useMemo(() => {
    const map: Record<string, number> = {};
    sales.forEach((sale: any) => {
      if (selectedBranch !== "all" && sale.branch_id !== selectedBranch) return;
      // Date filter
      if (dateFrom && sale.date < format(dateFrom, "yyyy-MM-dd")) return;
      if (dateTo && sale.date > format(dateTo, "yyyy-MM-dd")) return;
      (sale.pos_sale_items || []).forEach((si: any) => {
        if (si.pos_item_id) {
          map[si.pos_item_id] = (map[si.pos_item_id] || 0) + Number(si.quantity);
        }
      });
    });
    return map;
  }, [sales, selectedBranch, dateFrom, dateTo]);

  // Get stock items classified as kitchen/bar and map to POS items via recipes
  const classifiedPosItems = useMemo(() => {
    const result: Record<EngClass, Set<string>> = { kitchen: new Set(), bar: new Set() };

    // Map: stock_item_id -> menu_engineering_class
    const stockClassMap: Record<string, string> = {};
    stockItems.forEach((si: any) => {
      if (si.menu_engineering_class) {
        stockClassMap[si.id] = si.menu_engineering_class;
      }
    });

    // For each recipe, check if any ingredient is classified
    recipes.forEach((r: any) => {
      const classes = new Set<string>();
      (r.recipe_ingredients || []).forEach((ri: any) => {
        const cls = stockClassMap[ri.stock_item_id];
        if (cls) classes.add(cls);
      });

      if (classes.has("kitchen")) result.kitchen.add(r.menu_item_id);
      if (classes.has("bar")) result.bar.add(r.menu_item_id);
      // If no classification, default to kitchen
      if (classes.size === 0 && r.recipe_ingredients?.length > 0) {
        result.kitchen.add(r.menu_item_id);
      }
    });

    return result;
  }, [recipes, stockItems]);

  // Build engineering rows for active tab
  const engineeringData = useMemo(() => {
    const relevantPosItemIds = classifiedPosItems[activeTab];
    const items = posItems.filter((pi: any) => relevantPosItemIds.has(pi.id));

    const totalAllSales = items.reduce((sum: number, pi: any) => {
      const qty = salesQtyMap[pi.id] || 0;
      return sum + qty * Number(pi.price);
    }, 0);

    const rows: EngRow[] = items.map((pi: any) => {
      const qty = salesQtyMap[pi.id] || 0;
      const price = Number(pi.price);
      const directCost = recipeCostMap[pi.id] || 0;
      const totalSales = qty * price;
      const totalCostSales = qty * directCost;
      const costRatio = totalCostSales > 0 ? (totalSales / totalCostSales) * 100 : 0;
      const netProfit = recipeNetProfitMap[pi.id] || 0;
      const totalProfit = netProfit * qty;
      const profitRatio = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;
      const salesSharePct = totalAllSales > 0 ? (totalSales / totalAllSales) * 100 : 0;

      const profitLevel = getProfitLevel(profitRatio, activeTab);
      const popularityLevel = getPopularityLevel(salesSharePct, items.length);
      const strategic = getStrategic(profitLevel, popularityLevel);

      return {
        id: pi.id,
        name: pi.name,
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

    return rows.sort((a, b) => b.totalProfit - a.totalProfit);
  }, [posItems, classifiedPosItems, activeTab, salesQtyMap, recipeCostMap, recipeNetProfitMap]);

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
          />
          <PrintButton
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
            title={`هندسة المنيو - ${activeTab === "kitchen" ? "المطبخ" : "البار"}`}
          />
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
            <p className="text-xs text-muted-foreground">إجمالي المبيعات</p>
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
                  engineeringData.map((row, idx) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs">{idx + 1}</TableCell>
                      <TableCell className="font-medium text-sm whitespace-nowrap">{row.name}</TableCell>
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
                  ))
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
                      <YAxis dataKey="name" type="category" tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 10 }} width={75} tickMargin={10} />
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
