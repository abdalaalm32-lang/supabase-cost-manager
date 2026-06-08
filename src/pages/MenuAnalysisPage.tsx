import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle, Package, Printer, FileSpreadsheet, Loader2, GitCompareArrows, FileText, Zap } from "lucide-react";
import { exportToExcel, exportToPDF } from "@/lib/exportUtils";
import { toast as sonnerToast } from "sonner";
import { CategoryPackingTable } from "@/components/menu-analysis/CategoryPackingTable";
import { CategorySummaryTable } from "@/components/menu-analysis/CategorySummaryTable";
import { CategorySideCostTable } from "@/components/menu-analysis/CategorySideCostTable";
import { CategoryFinancialTable } from "@/components/menu-analysis/CategoryFinancialTable";
import { MenuAnalysisComparisonDialog, MenuBreakdown } from "@/components/menu-analysis/MenuAnalysisComparisonDialog";

interface RecipeIngredientDetail {
  name: string;
  code: string;
  qty: number;
  recipeUnit: string;
  stockUnit: string;
  unitCost: number;
  totalCost: number;
}

interface PosItem {
  id: string;
  name: string;
  price: number;
  category: string | null;
  category_id: string | null;
  category_code: string | null;
  code: string | null;
  menu_engineering_class: string | null;
  branch_id: string | null;
}

interface Branch {
  id: string;
  name: string;
}

interface CostingPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  expected_sales: number;
  capacity: number;
  turn_over: number;
  avg_check: number;
  media: number;
  bills: number;
  salaries: number;
  other_expenses: number;
  maintenance: number;
  rent: number;
  default_consumables_pct: number;
  default_consumables_pct_bar: number;
  default_packing_cost: number;
  custom_expenses: { name: string; value: number }[];
  tax_rate: number;
  consumables_kitchen_categories?: string[];
  consumables_bar_categories?: string[];
}

interface CostOverride {
  pos_item_id: string;
  side_cost: number;
  consumables_pct: number | null;
  packing_cost: number;
}

interface PackingItem {
  id: string;
  category_name: string;
  packing_name: string;
  cost: number;
}

interface SideCostItem {
  id: string;
  category_name: string;
  cost_name: string;
  cost: number;
}

interface ItemAnalysis {
  id: string;
  name: string;
  code: string;
  categoryName: string;
  classification: string;
  price: number;
  mainCost: number;
  sideCost: number;
  consumables: number;
  packingCost: number;
  finalDirectCost: number;
  directCostPct: number;
  netTakeAway: number;
  indirectExpenses: number;
  totalCost: number;
  netProfit: number;
  finalCostPct: number;
  finalNetPct: number;
}

interface CategoryData {
  name: string;
  items: ItemAnalysis[];
}

export const MenuAnalysisPage: React.FC = () => {
  const { auth } = useAuth();
  const [periods, setPeriods] = useState<CostingPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodIdRaw] = useState<string>(() => sessionStorage.getItem("menu_period") || "");
  const [posItems, setPosItems] = useState<PosItem[]>([]);
  const [recipes, setRecipes] = useState<Map<string, number>>(new Map());
  const [recipeDetails, setRecipeDetails] = useState<Map<string, RecipeIngredientDetail[]>>(new Map());
  const [detailItem, setDetailItem] = useState<ItemAnalysis | null>(null);
  const [costOverrides, setCostOverrides] = useState<Map<string, CostOverride>>(new Map());
  const [categoryPackingItems, setCategoryPackingItems] = useState<PackingItem[]>([]);
  const [categorySideCostItems, setCategorySideCostItems] = useState<SideCostItem[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchIdRaw] = useState<string>(() => sessionStorage.getItem("menu_branch") || "all");

  const setSelectedPeriodId = (v: string) => {
    setSelectedPeriodIdRaw(v);
    if (v) sessionStorage.setItem("menu_period", v);
    else sessionStorage.removeItem("menu_period");
  };
  const setSelectedBranchId = (v: string) => {
    setSelectedBranchIdRaw(v);
    sessionStorage.setItem("menu_branch", v);
  };
  const [activeTab, setActiveTab] = useState<string>("kitchen");
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState("");
  const [excelLoading, setExcelLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [efficiencyPeriodAId, setEfficiencyPeriodAId] = useState<string>("");
  const [efficiencyPeriodBId, setEfficiencyPeriodBId] = useState<string>("");
  const [periodBPacking, setPeriodBPacking] = useState<PackingItem[]>([]);
  const [periodBSideCost, setPeriodBSideCost] = useState<SideCostItem[]>([]);

  const companyId = auth.profile?.company_id;

  useEffect(() => {
    if (!companyId) return;
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, selectedBranchId]);

  useEffect(() => {
    if (companyId && selectedPeriodId) {
      fetchPackingItems();
      fetchSideCostItems();
    }
  }, [selectedPeriodId, companyId]);

  const fetchPackingItems = async () => {
    if (!companyId || !selectedPeriodId) return;
    const { data } = await supabase
      .from("category_packing_items")
      .select("*")
      .eq("company_id", companyId)
      .eq("period_id", selectedPeriodId);
    if (data) setCategoryPackingItems(data as PackingItem[]);
  };

  const fetchSideCostItems = async () => {
    if (!companyId || !selectedPeriodId) return;
    const { data } = await supabase
      .from("category_side_costs" as any)
      .select("*")
      .eq("company_id", companyId)
      .eq("period_id", selectedPeriodId);
    if (data) setCategorySideCostItems(data as unknown as SideCostItem[]);
  };

  const fetchAll = async () => {
    setLoading(true);
    const branchFilter = selectedBranchId && selectedBranchId !== "all" ? selectedBranchId : null;
    const [periodsRes, itemsRes, recipesRes, overridesRes, branchesRes, companyRes, branchCostsRes] = await Promise.all([
      supabase.from("menu_costing_periods").select("*").eq("company_id", companyId!).order("created_at", { ascending: false }),
      supabase.from("pos_items").select("*, categories:category_id(name, code, menu_engineering_class)").eq("company_id", companyId!).eq("active", true),
      supabase.from("recipes").select("id, menu_item_id, recipe_ingredients(stock_item_id, qty, stock_items:stock_item_id(name, code, avg_cost, conversion_factor, recipe_unit, stock_unit))").eq("company_id", companyId!),
      supabase.from("pos_item_cost_settings").select("*").eq("company_id", companyId!),
      supabase.from("branches").select("id, name").eq("company_id", companyId!).eq("active", true),
      supabase.from("companies").select("name").eq("id", companyId!).single(),
      branchFilter
        ? supabase.from("stock_item_branch_costs").select("stock_item_id, avg_cost").eq("company_id", companyId!).eq("branch_id", branchFilter)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    if (companyRes.data) setCompanyName(companyRes.data.name);

    if (periodsRes.data) {
      setPeriods(periodsRes.data as unknown as CostingPeriod[]);
      if (periodsRes.data.length > 0 && !selectedPeriodId) setSelectedPeriodId(periodsRes.data[0].id);
    }
    if (itemsRes.data) {
      const mapped = (itemsRes.data as any[]).map(item => ({
        ...item,
        category: item.categories?.name || item.category || null,
        category_code: item.categories?.code || null,
      }));
      setPosItems(mapped as PosItem[]);
    }
    if (branchesRes.data) setBranches(branchesRes.data as Branch[]);

    // Build per-branch cost map (fallback to global avg_cost)
    const branchCostMap = new Map<string, number>();
    ((branchCostsRes as any).data || []).forEach((bc: any) => {
      if (bc.stock_item_id && bc.avg_cost != null) {
        branchCostMap.set(bc.stock_item_id, Number(bc.avg_cost));
      }
    });
    const resolveCost = (stockItemId: string, globalCost: number): number => {
      if (!branchFilter) return globalCost;
      const bc = branchCostMap.get(stockItemId);
      return bc != null ? bc : globalCost;
    };

    const recipeCostMap = new Map<string, number>();
    const recipeDetailsMap = new Map<string, RecipeIngredientDetail[]>();
    if (recipesRes.data) {
      for (const recipe of recipesRes.data as any[]) {
        let totalCost = 0;
        const details: RecipeIngredientDetail[] = [];
        for (const ing of recipe.recipe_ingredients || []) {
          const stockItem = ing.stock_items;
          if (stockItem) {
            const convFactor = stockItem.conversion_factor || 1;
            const unitCost = resolveCost(ing.stock_item_id, Number(stockItem.avg_cost || 0));
            const costPerRecipeUnit = unitCost / convFactor;
            const lineCost = ing.qty * costPerRecipeUnit;
            totalCost += lineCost;
            details.push({
              name: stockItem.name || "—",
              code: stockItem.code || "",
              qty: Number(ing.qty) || 0,
              recipeUnit: stockItem.recipe_unit || "",
              stockUnit: stockItem.stock_unit || "",
              unitCost: costPerRecipeUnit,
              totalCost: lineCost,
            });
          }
        }
        recipeCostMap.set(recipe.menu_item_id, totalCost);
        recipeDetailsMap.set(recipe.menu_item_id, details);
      }
    }
    setRecipes(recipeCostMap);
    setRecipeDetails(recipeDetailsMap);

    const overrideMap = new Map<string, CostOverride>();
    if (overridesRes.data) {
      for (const o of overridesRes.data as any[]) {
        overrideMap.set(o.pos_item_id, o as CostOverride);
      }
    }
    setCostOverrides(overrideMap);
    setLoading(false);
  };

  const selectedPeriod = periods.find(p => p.id === selectedPeriodId);

  // Filter items by branch and tab
  const filteredPosItems = useMemo(() => {
    let items = posItems.filter(i => i.menu_engineering_class !== "none" && (i as any).categories?.menu_engineering_class !== "none");
    if (selectedBranchId !== "all") {
      items = items.filter(i => i.branch_id === selectedBranchId);
    }
    // Filter by Kitchen/Bar tab
    if (activeTab === "kitchen") {
      items = items.filter(i => !i.menu_engineering_class || i.menu_engineering_class.toLowerCase() === "kitchen");
    } else {
      items = items.filter(i => i.menu_engineering_class?.toLowerCase() === "bar");
    }
    // Sort by item code
    items = [...items].sort((a, b) => (a.code || "").localeCompare(b.code || "", undefined, { numeric: true }));
    return items;
  }, [posItems, selectedBranchId, activeTab]);

  const monthSales = useMemo(() => {
    if (!selectedPeriod) return 0;
    const start = new Date(selectedPeriod.start_date);
    const end = new Date(selectedPeriod.end_date);
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    return selectedPeriod.expected_sales * days;
  }, [selectedPeriod]);

  const totalIndirectCost = useMemo(() => {
    if (!selectedPeriod) return 0;
    const fixed = selectedPeriod.media + selectedPeriod.bills + selectedPeriod.salaries + selectedPeriod.other_expenses + selectedPeriod.maintenance + selectedPeriod.rent;
    const custom = (selectedPeriod.custom_expenses || []).reduce((s, e) => s + e.value, 0);
    return fixed + custom;
  }, [selectedPeriod]);

  const indirectCostPct = monthSales > 0 ? totalIndirectCost / monthSales : 0;

  const getCategoryPackingCost = (catName: string) => {
    return categoryPackingItems
      .filter(p => p.category_name === catName)
      .reduce((s, p) => s + p.cost, 0);
  };

  const getCategorySideCost = (catName: string) => {
    return categorySideCostItems
      .filter(p => p.category_name === catName)
      .reduce((s, p) => s + p.cost, 0);
  };

  const handleItemPackingChange = useCallback(async (posItemId: string, value: number) => {
    if (!companyId) return;
    const existing = costOverrides.get(posItemId);
    if (existing) {
      await supabase.from("pos_item_cost_settings").update({ packing_cost: value }).eq("pos_item_id", posItemId).eq("company_id", companyId);
    } else {
      await supabase.from("pos_item_cost_settings").insert({ company_id: companyId, pos_item_id: posItemId, packing_cost: value, side_cost: 0 });
    }
    setCostOverrides(prev => {
      const next = new Map(prev);
      const cur = next.get(posItemId) || { pos_item_id: posItemId, side_cost: 0, consumables_pct: null, packing_cost: 0 };
      next.set(posItemId, { ...cur, packing_cost: value });
      return next;
    });
  }, [companyId, costOverrides]);

  const categorizedData = useMemo(() => {
    if (!selectedPeriod) return [];

    const categoryMap = new Map<string, CategoryData & { code: string }>();

    for (const item of filteredPosItems) {
      const catName = item.category || "بدون تصنيف";
      if (!categoryMap.has(catName)) categoryMap.set(catName, { name: catName, code: item.category_code || "", items: [] });

      const mainCost = recipes.get(item.id) || 0;
      const override = costOverrides.get(item.id);
      const sideCost = override?.side_cost || 0;
      const categorySideCost = getCategorySideCost(catName);
      const kitchenCats = Array.isArray(selectedPeriod.consumables_kitchen_categories) ? selectedPeriod.consumables_kitchen_categories : [];
      const barCats = Array.isArray(selectedPeriod.consumables_bar_categories) ? selectedPeriod.consumables_bar_categories : [];
      const isInKitchen = kitchenCats.length === 0 || kitchenCats.includes(catName);
      const isInBar = barCats.includes(catName);
      let defaultPct = 0;
      if (isInBar) {
        defaultPct = selectedPeriod.default_consumables_pct_bar ?? selectedPeriod.default_consumables_pct;
      } else if (isInKitchen) {
        defaultPct = selectedPeriod.default_consumables_pct;
      }
      const consumablesPct = override?.consumables_pct ?? defaultPct;
      const consumables = (item.price * consumablesPct) / 100;
      const categoryPacking = getCategoryPackingCost(catName);
      const itemPacking = override?.packing_cost || 0;
      const packingCost = categoryPacking + itemPacking;

      const finalDirectCost = mainCost + sideCost + categorySideCost + consumables + packingCost;
      const directCostPct = item.price > 0 ? (finalDirectCost / item.price) * 100 : 0;
      const netTakeAway = item.price - finalDirectCost;
      const indirectExpenses = item.price * indirectCostPct;
      const totalCost = finalDirectCost + indirectExpenses;
      const netProfit = item.price - totalCost;
      const finalCostPct = item.price > 0 ? (totalCost / item.price) * 100 : 0;
      const finalNetPct = item.price > 0 ? (netProfit / item.price) * 100 : 0;

      categoryMap.get(catName)!.items.push({
        id: item.id, name: item.name, code: item.code || "", categoryName: catName,
        classification: (item as any).categories?.menu_engineering_class || item.menu_engineering_class || "",
        price: item.price, mainCost, sideCost: sideCost + categorySideCost, consumables, packingCost,
        finalDirectCost, directCostPct, netTakeAway, indirectExpenses, totalCost, netProfit, finalCostPct, finalNetPct,
      });
    }

    // Sort categories by their code
    return Array.from(categoryMap.values()).sort((a, b) => (a.code || "").localeCompare(b.code || "", undefined, { numeric: true }));
  }, [filteredPosItems, selectedPeriod, recipes, costOverrides, indirectCostPct, categoryPackingItems, categorySideCostItems]);

  const grandTotals = useMemo(() => {
    let totalPrice = 0, totalDirectCost = 0, totalIndirect = 0, totalProfit = 0, itemCount = 0;
    for (const cat of categorizedData) {
      for (const item of cat.items) {
        totalPrice += item.price;
        totalDirectCost += item.finalDirectCost;
        totalIndirect += item.indirectExpenses;
        totalProfit += item.netProfit;
        itemCount++;
      }
    }
    return { totalPrice, totalDirectCost, totalIndirect, totalProfit, itemCount };
  }, [categorizedData]);

  // ===== Period A/B metrics for in-page efficiency comparison =====
  const periodAResolved = useMemo(() => periods.find(p => p.id === efficiencyPeriodAId) ?? selectedPeriod ?? null, [periods, efficiencyPeriodAId, selectedPeriod]);
  const periodBResolved = useMemo(() => periods.find(p => p.id === efficiencyPeriodBId) ?? null, [periods, efficiencyPeriodBId]);

  // Load packing/side cost items for Period B when chosen
  useEffect(() => {
    if (!companyId || !efficiencyPeriodBId) {
      setPeriodBPacking([]);
      setPeriodBSideCost([]);
      return;
    }
    (async () => {
      const [p, s] = await Promise.all([
        supabase.from("category_packing_items").select("*").eq("company_id", companyId).eq("period_id", efficiencyPeriodBId),
        supabase.from("category_side_costs" as any).select("*").eq("company_id", companyId).eq("period_id", efficiencyPeriodBId),
      ]);
      setPeriodBPacking((p.data as PackingItem[]) || []);
      setPeriodBSideCost((s.data as unknown as SideCostItem[]) || []);
    })();
  }, [companyId, efficiencyPeriodBId]);

  // Reusable: compute period metrics from a period + its packing/side cost items
  const computeMetrics = useCallback((period: CostingPeriod | null, packing: PackingItem[], sideCosts: SideCostItem[]) => {
    if (!period) return null;
    const start = new Date(period.start_date);
    const end = new Date(period.end_date);
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    const monthly = period.expected_sales * days;
    const fixedExp = period.media + period.bills + period.salaries + period.other_expenses + period.maintenance + period.rent;
    const customExp = (period.custom_expenses || []).reduce((s, e) => s + e.value, 0);
    const indirect = fixedExp + customExp;
    const indirectPct = monthly > 0 ? indirect / monthly : 0;

    let totalPrice = 0, totalDirect = 0, totalProfit = 0;
    for (const item of filteredPosItems) {
      const catName = item.category || "بدون تصنيف";
      const mainCost = recipes.get(item.id) || 0;
      const override = costOverrides.get(item.id);
      const sideCost = override?.side_cost || 0;
      const categorySideCost = sideCosts.filter(p => p.category_name === catName).reduce((s, p) => s + p.cost, 0);
      const kitchenCats = Array.isArray(period.consumables_kitchen_categories) ? period.consumables_kitchen_categories : [];
      const barCats = Array.isArray(period.consumables_bar_categories) ? period.consumables_bar_categories : [];
      const isInBar = barCats.includes(catName);
      const isInKitchen = kitchenCats.length === 0 || kitchenCats.includes(catName);
      let defaultPct = 0;
      if (isInBar) defaultPct = period.default_consumables_pct_bar ?? period.default_consumables_pct;
      else if (isInKitchen) defaultPct = period.default_consumables_pct;
      const consumablesPct = override?.consumables_pct ?? defaultPct;
      const consumables = (item.price * consumablesPct) / 100;
      const categoryPacking = packing.filter(p => p.category_name === catName).reduce((s, p) => s + p.cost, 0);
      const itemPacking = override?.packing_cost || 0;
      const packingCost = categoryPacking + itemPacking;
      const finalDirectCost = mainCost + sideCost + categorySideCost + consumables + packingCost;
      const indirectExp = item.price * indirectPct;
      const totalCost = finalDirectCost + indirectExp;
      const netProfit = item.price - totalCost;
      totalPrice += item.price;
      totalDirect += finalDirectCost;
      totalProfit += netProfit;
    }
    const avgDirectPct = totalPrice > 0 ? (totalDirect / totalPrice) * 100 : 0;
    const netProfitPct = totalPrice > 0 ? (totalProfit / totalPrice) * 100 : 0;
    return { monthlySales: monthly, indirectCost: indirect, indirectPct: indirectPct * 100, totalPrice, totalDirect, totalProfit, avgDirectPct, netProfitPct };
  }, [filteredPosItems, recipes, costOverrides]);

  const metricsA = useMemo(() => computeMetrics(periodAResolved, categoryPackingItems, categorySideCostItems), [computeMetrics, periodAResolved, categoryPackingItems, categorySideCostItems]);
  const metricsB = useMemo(() => computeMetrics(periodBResolved, periodBPacking, periodBSideCost), [computeMetrics, periodBResolved, periodBPacking, periodBSideCost]);


  const formatNum = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatPct = (n: number) => n.toFixed(2) + "%";

  const profitColor = (pct: number) => {
    if (pct < 0) return "text-red-500 font-bold";
    if (pct < 10) return "text-orange-500 font-semibold";
    if (pct < 25) return "text-yellow-600";
    return "text-emerald-600 font-semibold";
  };

  if (loading) return <div className="p-6 text-center text-muted-foreground">جاري التحميل...</div>;

  const renderCategoryContent = () => (
    <>
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground">إجمالي أسعار البيع</p>
            <p className="text-lg font-bold text-primary">{formatNum(grandTotals.totalPrice)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground">إجمالي التكلفة المباشرة</p>
            <p className="text-lg font-bold">{formatNum(grandTotals.totalDirectCost)}</p>
            <Badge variant="secondary" className="text-[10px]">{grandTotals.totalPrice > 0 ? formatPct(grandTotals.totalDirectCost / grandTotals.totalPrice * 100) : "0%"}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground">إجمالي المصاريف الغير مباشرة</p>
            <p className="text-lg font-bold text-orange-600">{formatNum(grandTotals.totalIndirect)}</p>
            <Badge variant="secondary" className="text-[10px]">{formatPct(indirectCostPct * 100)}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground">صافي الربح</p>
            <p className={`text-lg font-bold ${grandTotals.totalProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>{formatNum(grandTotals.totalProfit)}</p>
            <Badge variant={grandTotals.totalProfit >= 0 ? "default" : "destructive"} className="text-[10px]">
              {grandTotals.totalPrice > 0 ? formatPct(grandTotals.totalProfit / grandTotals.totalPrice * 100) : "0%"}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground">عدد الأصناف</p>
            <p className="text-lg font-bold">{grandTotals.itemCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Categories Accordion */}
      <Accordion type="multiple" className="space-y-3">
        {categorizedData.map((cat, catIdx) => {
          const catTotalPrice = cat.items.reduce((s, i) => s + i.price, 0);
          const catTotalDirect = cat.items.reduce((s, i) => s + i.finalDirectCost, 0);
          const catTotalProfit = cat.items.reduce((s, i) => s + i.netProfit, 0);
          const catDirectPct = catTotalPrice > 0 ? (catTotalDirect / catTotalPrice) * 100 : 0;
          const catProfitPct = catTotalPrice > 0 ? (catTotalProfit / catTotalPrice) * 100 : 0;

          const catItemCount = cat.items.length;
          const avgOrderPrice = catItemCount > 0 ? catTotalPrice / catItemCount : 0;
          const avgDirectCost = catItemCount > 0 ? catTotalDirect / catItemCount : 0;
          const avgDirectProfit = avgOrderPrice - avgDirectCost;
          const catItemsIndirectSum = cat.items.reduce((s, i) => s + i.indirectExpenses, 0);
          const periodDays = selectedPeriod ? (() => {
            const s = new Date(selectedPeriod.start_date);
            const e = new Date(selectedPeriod.end_date);
            return Math.max(1, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1);
          })() : 30;
          const catSummaryIndirect = periodDays > 0 ? totalIndirectCost / periodDays : 0;
          const breakEvenOrders = avgDirectProfit > 0 ? catSummaryIndirect / avgDirectProfit : 0;

          const catPackingItems = categoryPackingItems.filter(p => p.category_name === cat.name);
          const catSideCostItems = categorySideCostItems.filter(p => p.category_name === cat.name);

          return (
            <AccordionItem key={catIdx} value={`cat-${catIdx}`} className="border rounded-xl overflow-hidden">
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex items-center justify-between w-full ml-3">
                  <div className="flex items-center gap-2">
                    <Package size={18} className="text-primary" />
                    <span className="font-bold text-base">{cat.name}</span>
                    <Badge variant="secondary" className="text-xs">{catItemCount} صنف</Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span>المبيعات: <strong>{formatNum(catTotalPrice)}</strong></span>
                    <span>التكلفة: <strong>{formatPct(catDirectPct)}</strong></span>
                    <span className={catTotalProfit >= 0 ? "text-emerald-600" : "text-red-500"}>
                      الربح: <strong>{formatPct(catProfitPct)}</strong>
                    </span>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-0 pb-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="text-center w-10">#</TableHead>
                        <TableHead>اسم الصنف</TableHead>
                        <TableHead className="text-center">السعر</TableHead>
                        <TableHead className="text-center">التكلفة الرئيسية</TableHead>
                        <TableHead className="text-center">تكلفة إضافية</TableHead>
                        <TableHead className="text-center">مستهلكات</TableHead>
                        <TableHead className="text-center">تغليف</TableHead>
                        <TableHead className="text-center">إجمالي مباشر</TableHead>
                        <TableHead className="text-center">نسبة مباشرة</TableHead>
                        <TableHead className="text-center">صافي مباشر</TableHead>
                        <TableHead className="text-center">غير مباشرة</TableHead>
                        <TableHead className="text-center">إجمالي التكلفة</TableHead>
                        <TableHead className="text-center">صافي الربح</TableHead>
                        <TableHead className="text-center">نسبة التكلفة</TableHead>
                        <TableHead className="text-center">نسبة الربح</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cat.items.map((item, idx) => (
                        <TableRow key={item.id} className={item.netProfit < 0 ? "bg-red-500/5" : ""}>
                          <TableCell className="text-center text-xs">{idx + 1}</TableCell>
                          <TableCell className="text-sm font-medium">
                            <button
                              type="button"
                              onClick={() => setDetailItem(item)}
                              className="text-right hover:text-primary hover:underline transition-colors cursor-pointer"
                            >
                              {item.name}
                            </button>
                          </TableCell>
                          <TableCell className="text-center text-sm">{formatNum(item.price)}</TableCell>
                          <TableCell className="text-center text-sm">{formatNum(item.mainCost)}</TableCell>
                          <TableCell className="text-center text-sm">{formatNum(item.sideCost)}</TableCell>
                          <TableCell className="text-center text-sm">{formatNum(item.consumables)}</TableCell>
                          <TableCell className="text-center text-sm p-1">
                            <div className="flex flex-col items-center gap-1">
                              <Input
                                type="number"
                                className="h-7 w-20 text-center text-sm mx-auto"
                                defaultValue={costOverrides.get(item.id)?.packing_cost || 0}
                                onBlur={(e) => handleItemPackingChange(item.id, parseFloat(e.target.value) || 0)}
                              />
                              {item.packingCost > 0 && (
                                <span className="text-xs text-muted-foreground font-semibold">{formatNum(item.packingCost)}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center text-sm font-semibold">{formatNum(item.finalDirectCost)}</TableCell>
                          <TableCell className="text-center text-sm">{formatPct(item.directCostPct)}</TableCell>
                          <TableCell className={`text-center text-sm ${item.netTakeAway < 0 ? "text-red-500" : ""}`}>{formatNum(item.netTakeAway)}</TableCell>
                          <TableCell className="text-center text-sm text-orange-600">{formatNum(item.indirectExpenses)}</TableCell>
                          <TableCell className="text-center text-sm font-semibold">{formatNum(item.totalCost)}</TableCell>
                          <TableCell className={`text-center text-sm ${profitColor(item.finalNetPct)}`}>{formatNum(item.netProfit)}</TableCell>
                          <TableCell className="text-center text-sm">{formatPct(item.finalCostPct)}</TableCell>
                          <TableCell className={`text-center text-sm ${profitColor(item.finalNetPct)}`}>{formatPct(item.finalNetPct)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/50 font-bold">
                        <TableCell colSpan={2} className="text-sm">إجمالي {cat.name}</TableCell>
                        <TableCell className="text-center text-sm">{formatNum(catTotalPrice)}</TableCell>
                        <TableCell className="text-center text-sm">{formatNum(cat.items.reduce((s, i) => s + i.mainCost, 0))}</TableCell>
                        <TableCell className="text-center text-sm">{formatNum(cat.items.reduce((s, i) => s + i.sideCost, 0))}</TableCell>
                        <TableCell className="text-center text-sm">{formatNum(cat.items.reduce((s, i) => s + i.consumables, 0))}</TableCell>
                        <TableCell className="text-center text-sm">{formatNum(cat.items.reduce((s, i) => s + i.packingCost, 0))}</TableCell>
                        <TableCell className="text-center text-sm">{formatNum(catTotalDirect)}</TableCell>
                        <TableCell className="text-center text-sm">{formatPct(catDirectPct)}</TableCell>
                        <TableCell className="text-center text-sm">{formatNum(cat.items.reduce((s, i) => s + i.netTakeAway, 0))}</TableCell>
                        <TableCell className="text-center text-sm text-orange-600">{formatNum(catItemsIndirectSum)}</TableCell>
                        <TableCell className="text-center text-sm">{formatNum(cat.items.reduce((s, i) => s + i.totalCost, 0))}</TableCell>
                        <TableCell className={`text-center text-sm ${catTotalProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>{formatNum(catTotalProfit)}</TableCell>
                        <TableCell className="text-center text-sm">{catTotalPrice > 0 ? formatPct(cat.items.reduce((s, i) => s + i.totalCost, 0) / catTotalPrice * 100) : "0%"}</TableCell>
                        <TableCell className={`text-center text-sm ${catTotalProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>{formatPct(catProfitPct)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                {/* Side Cost, Packing, Summary & Financial tables */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-muted/20">
                  <div>
                    <h4 className="text-sm font-bold mb-2">تكلفة إضافية للكاتجوري</h4>
                    <CategorySideCostTable
                      categoryName={cat.name}
                      periodId={selectedPeriodId}
                      companyId={companyId!}
                      sideCostItems={catSideCostItems}
                      onRefresh={fetchSideCostItems}
                    />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold mb-2">تغليف الكاتجوري (Packing)</h4>
                    <CategoryPackingTable
                      categoryName={cat.name}
                      periodId={selectedPeriodId}
                      companyId={companyId!}
                      packingItems={catPackingItems}
                      avgPrice={avgOrderPrice}
                      onRefresh={fetchPackingItems}
                    />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold mb-2">ملخص الكاتجوري</h4>
                    <CategorySummaryTable
                      totalIndirectExpenses={catSummaryIndirect}
                      avgOrderPrice={avgOrderPrice}
                      avgDirectCost={avgDirectCost}
                      avgDirectProfit={avgDirectProfit}
                      breakEvenOrders={breakEvenOrders}
                    />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold mb-2">الملخص المالي للكاتجوري</h4>
                    <CategoryFinancialTable
                      categoryName={cat.name}
                      totalSellingPrice={catTotalPrice}
                      totalDirectCost={catTotalDirect}
                      totalIndirectCost={catItemsIndirectSum}
                      netTakeAway={catTotalPrice - catTotalDirect - catItemsIndirectSum}
                      netTable={(catTotalPrice * (1 - (selectedPeriod?.tax_rate || 0) / 100)) - catTotalDirect - catItemsIndirectSum}
                      itemsCount={catItemCount}
                    />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {categorizedData.length === 0 && (
        <Card className="p-12 text-center">
          <Package size={48} className="mx-auto mb-4 text-muted-foreground/30" />
          <h3 className="text-lg font-semibold mb-2">لا توجد أصناف</h3>
          <p className="text-muted-foreground text-sm">أضف أصناف في صفحة نقطة البيع لتظهر هنا تلقائياً</p>
        </Card>
      )}
    </>
  );

  const handleExcelExport = async () => {
    if (!selectedPeriod || categorizedData.length === 0) return;
    setExcelLoading(true);
    try {
      const tabLabel = activeTab === "kitchen" ? "المطبخ" : "البار";
      const branchName = selectedBranchId !== "all" ? branches.find(b => b.id === selectedBranchId)?.name : "كل الفروع";
      const columns = [
        { key: "catName", label: "التصنيف" },
        { key: "idx", label: "#" },
        { key: "name", label: "اسم الصنف" },
        { key: "price", label: "السعر" },
        { key: "mainCost", label: "التكلفة الرئيسية" },
        { key: "sideCost", label: "تكلفة إضافية" },
        { key: "consumables", label: "مستهلكات" },
        { key: "packingCost", label: "تغليف" },
        { key: "finalDirectCost", label: "إجمالي مباشر" },
        { key: "directCostPct", label: "نسبة مباشرة" },
        { key: "netTakeAway", label: "صافي مباشر" },
        { key: "indirectExpenses", label: "غير مباشرة" },
        { key: "totalCost", label: "إجمالي التكلفة" },
        { key: "netProfit", label: "صافي الربح" },
        { key: "finalCostPct", label: "نسبة التكلفة" },
        { key: "finalNetPct", label: "نسبة الربح" },
      ];
      const rows: Record<string, any>[] = [];
      for (const cat of categorizedData) {
        cat.items.forEach((item, idx) => {
          rows.push({
            catName: cat.name,
            idx: idx + 1,
            name: item.name,
            price: formatNum(item.price),
            mainCost: formatNum(item.mainCost),
            sideCost: formatNum(item.sideCost),
            consumables: formatNum(item.consumables),
            packingCost: formatNum(item.packingCost),
            finalDirectCost: formatNum(item.finalDirectCost),
            directCostPct: formatPct(item.directCostPct),
            netTakeAway: formatNum(item.netTakeAway),
            indirectExpenses: formatNum(item.indirectExpenses),
            totalCost: formatNum(item.totalCost),
            netProfit: formatNum(item.netProfit),
            finalCostPct: formatPct(item.finalCostPct),
            finalNetPct: formatPct(item.finalNetPct),
          });
        });
        const catTotalPrice = cat.items.reduce((s, i) => s + i.price, 0);
        const catTotalDirect = cat.items.reduce((s, i) => s + i.finalDirectCost, 0);
        const catTotalProfit = cat.items.reduce((s, i) => s + i.netProfit, 0);
        rows.push({
          __rowType: "group-total",
          catName: `إجمالي ${cat.name}`,
          idx: "",
          name: "",
          price: formatNum(catTotalPrice),
          mainCost: formatNum(cat.items.reduce((s, i) => s + i.mainCost, 0)),
          sideCost: formatNum(cat.items.reduce((s, i) => s + i.sideCost, 0)),
          consumables: formatNum(cat.items.reduce((s, i) => s + i.consumables, 0)),
          packingCost: formatNum(cat.items.reduce((s, i) => s + i.packingCost, 0)),
          finalDirectCost: formatNum(catTotalDirect),
          directCostPct: catTotalPrice > 0 ? formatPct(catTotalDirect / catTotalPrice * 100) : "0%",
          netTakeAway: formatNum(cat.items.reduce((s, i) => s + i.netTakeAway, 0)),
          indirectExpenses: formatNum(cat.items.reduce((s, i) => s + i.indirectExpenses, 0)),
          totalCost: formatNum(cat.items.reduce((s, i) => s + i.totalCost, 0)),
          netProfit: formatNum(catTotalProfit),
          finalCostPct: catTotalPrice > 0 ? formatPct(cat.items.reduce((s, i) => s + i.totalCost, 0) / catTotalPrice * 100) : "0%",
          finalNetPct: catTotalPrice > 0 ? formatPct(catTotalProfit / catTotalPrice * 100) : "0%",
        });
      }
      rows.push({
        __rowType: "grand-total",
        catName: "الإجمالي الكلي",
        idx: "",
        name: `${grandTotals.itemCount} صنف`,
        price: formatNum(grandTotals.totalPrice),
        mainCost: "",
        sideCost: "",
        consumables: "",
        packingCost: "",
        finalDirectCost: formatNum(grandTotals.totalDirectCost),
        directCostPct: grandTotals.totalPrice > 0 ? formatPct(grandTotals.totalDirectCost / grandTotals.totalPrice * 100) : "0%",
        netTakeAway: "",
        indirectExpenses: formatNum(grandTotals.totalIndirect),
        totalCost: "",
        netProfit: formatNum(grandTotals.totalProfit),
        finalCostPct: "",
        finalNetPct: grandTotals.totalPrice > 0 ? formatPct(grandTotals.totalProfit / grandTotals.totalPrice * 100) : "0%",
      });
      await exportToExcel({
        title: `تحليل المنيو - ${tabLabel} - ${branchName} - ${selectedPeriod.name}`,
        filename: `menu-analysis-${tabLabel}-${selectedPeriod.name}`,
        columns,
        data: rows,
      });
      sonnerToast.success("تم تصدير Excel بنجاح");
    } catch (err) {
      console.error(err);
      sonnerToast.error("حدث خطأ أثناء التصدير");
    } finally {
      setExcelLoading(false);
    }
  };

  const handlePdfExport = async () => {
    if (!selectedPeriod || categorizedData.length === 0) return;
    setPdfLoading(true);
    try {
      const tabLabel = activeTab === "kitchen" ? "المطبخ" : "البار";
      const branchName = selectedBranchId !== "all" ? branches.find(b => b.id === selectedBranchId)?.name : "كل الفروع";
      const columns = [
        { key: "catName", label: "التصنيف" },
        { key: "idx", label: "#" },
        { key: "name", label: "اسم الصنف" },
        { key: "price", label: "السعر" },
        { key: "finalDirectCost", label: "إجمالي مباشر" },
        { key: "directCostPct", label: "% مباشرة" },
        { key: "indirectExpenses", label: "غير مباشرة" },
        { key: "totalCost", label: "إجمالي التكلفة" },
        { key: "netProfit", label: "صافي الربح" },
        { key: "finalNetPct", label: "% الربح" },
      ];
      const rows: Record<string, any>[] = [];
      for (const cat of categorizedData) {
        cat.items.forEach((item, idx) => {
          rows.push({
            catName: cat.name, idx: idx + 1, name: item.name,
            price: formatNum(item.price),
            finalDirectCost: formatNum(item.finalDirectCost),
            directCostPct: formatPct(item.directCostPct),
            indirectExpenses: formatNum(item.indirectExpenses),
            totalCost: formatNum(item.totalCost),
            netProfit: formatNum(item.netProfit),
            finalNetPct: formatPct(item.finalNetPct),
          });
        });
        const catTotalPrice = cat.items.reduce((s, i) => s + i.price, 0);
        const catTotalDirect = cat.items.reduce((s, i) => s + i.finalDirectCost, 0);
        const catTotalProfit = cat.items.reduce((s, i) => s + i.netProfit, 0);
        rows.push({
          __rowType: "group-total",
          catName: `إجمالي ${cat.name}`, idx: "", name: "",
          price: formatNum(catTotalPrice),
          finalDirectCost: formatNum(catTotalDirect),
          directCostPct: catTotalPrice > 0 ? formatPct(catTotalDirect / catTotalPrice * 100) : "0%",
          indirectExpenses: formatNum(cat.items.reduce((s, i) => s + i.indirectExpenses, 0)),
          totalCost: formatNum(cat.items.reduce((s, i) => s + i.totalCost, 0)),
          netProfit: formatNum(catTotalProfit),
          finalNetPct: catTotalPrice > 0 ? formatPct(catTotalProfit / catTotalPrice * 100) : "0%",
        });
      }
      rows.push({
        __rowType: "grand-total",
        catName: "الإجمالي الكلي", idx: "", name: `${grandTotals.itemCount} صنف`,
        price: formatNum(grandTotals.totalPrice),
        finalDirectCost: formatNum(grandTotals.totalDirectCost),
        directCostPct: grandTotals.totalPrice > 0 ? formatPct(grandTotals.totalDirectCost / grandTotals.totalPrice * 100) : "0%",
        indirectExpenses: formatNum(grandTotals.totalIndirect),
        totalCost: "",
        netProfit: formatNum(grandTotals.totalProfit),
        finalNetPct: grandTotals.totalPrice > 0 ? formatPct(grandTotals.totalProfit / grandTotals.totalPrice * 100) : "0%",
      });
      await exportToPDF({
        title: `تحليل المنيو - ${tabLabel} - ${branchName} - ${selectedPeriod.name}`,
        filename: `menu-analysis-${tabLabel}-${selectedPeriod.name}`,
        columns,
        data: rows,
      });
      sonnerToast.success("تم تصدير PDF بنجاح");
    } catch (err) {
      console.error(err);
      sonnerToast.error("حدث خطأ أثناء تصدير PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  const handlePrint = () => {
    if (!selectedPeriod || categorizedData.length === 0) return;
    const dateStr = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
    const logoSrc = `${window.location.origin}/logo.png`;
    const tabLabel = activeTab === "kitchen" ? "المطبخ" : "البار";
    const branchName = selectedBranchId !== "all" ? branches.find(b => b.id === selectedBranchId)?.name : "كل الفروع";

    let categoriesHTML = "";
    for (const cat of categorizedData) {
      const catTotalPrice = cat.items.reduce((s, i) => s + i.price, 0);
      const catTotalDirect = cat.items.reduce((s, i) => s + i.finalDirectCost, 0);
      const catTotalProfit = cat.items.reduce((s, i) => s + i.netProfit, 0);
      const catDirectPct = catTotalPrice > 0 ? (catTotalDirect / catTotalPrice * 100) : 0;
      const catProfitPct = catTotalPrice > 0 ? (catTotalProfit / catTotalPrice * 100) : 0;

      categoriesHTML += `<h3 style="margin:15px 0 5px;font-size:13px;font-weight:bold;border-bottom:1px solid #000;padding-bottom:4px;">${cat.name} (${cat.items.length} صنف)</h3>`;
      categoriesHTML += `<table><thead><tr>
        <th>#</th><th>اسم الصنف</th><th>السعر</th><th>التكلفة الرئيسية</th><th>تكلفة إضافية</th>
        <th>مستهلكات</th><th>تغليف</th><th>إجمالي مباشر</th><th>نسبة مباشرة</th><th>صافي مباشر</th>
        <th>غير مباشرة</th><th>إجمالي التكلفة</th><th>صافي الربح</th><th>نسبة التكلفة</th><th>نسبة الربح</th>
      </tr></thead><tbody>`;

      cat.items.forEach((item, idx) => {
        categoriesHTML += `<tr>
          <td>${idx + 1}</td><td>${item.name}</td><td>${formatNum(item.price)}</td>
          <td>${formatNum(item.mainCost)}</td><td>${formatNum(item.sideCost)}</td>
          <td>${formatNum(item.consumables)}</td><td>${formatNum(item.packingCost)}</td>
          <td style="font-weight:bold">${formatNum(item.finalDirectCost)}</td><td>${formatPct(item.directCostPct)}</td>
          <td style="${item.netTakeAway < 0 ? 'color:red' : ''}">${formatNum(item.netTakeAway)}</td>
          <td>${formatNum(item.indirectExpenses)}</td><td style="font-weight:bold">${formatNum(item.totalCost)}</td>
          <td style="${item.netProfit < 0 ? 'color:red' : 'color:green'}">${formatNum(item.netProfit)}</td>
          <td>${formatPct(item.finalCostPct)}</td>
          <td style="${item.finalNetPct < 0 ? 'color:red' : 'color:green'}">${formatPct(item.finalNetPct)}</td>
        </tr>`;
      });

      categoriesHTML += `<tr style="font-weight:bold;background:#eee;">
        <td colspan="2">إجمالي ${cat.name}</td><td>${formatNum(catTotalPrice)}</td>
        <td>${formatNum(cat.items.reduce((s, i) => s + i.mainCost, 0))}</td>
        <td>${formatNum(cat.items.reduce((s, i) => s + i.sideCost, 0))}</td>
        <td>${formatNum(cat.items.reduce((s, i) => s + i.consumables, 0))}</td>
        <td>${formatNum(cat.items.reduce((s, i) => s + i.packingCost, 0))}</td>
        <td>${formatNum(catTotalDirect)}</td><td>${formatPct(catDirectPct)}</td>
        <td>${formatNum(cat.items.reduce((s, i) => s + i.netTakeAway, 0))}</td>
        <td>${formatNum(cat.items.reduce((s, i) => s + i.indirectExpenses, 0))}</td>
        <td>${formatNum(cat.items.reduce((s, i) => s + i.totalCost, 0))}</td>
        <td style="${catTotalProfit < 0 ? 'color:red' : 'color:green'}">${formatNum(catTotalProfit)}</td>
        <td>${catTotalPrice > 0 ? formatPct(cat.items.reduce((s, i) => s + i.totalCost, 0) / catTotalPrice * 100) : "0%"}</td>
        <td style="${catTotalProfit < 0 ? 'color:red' : 'color:green'}">${formatPct(catProfitPct)}</td>
      </tr></tbody></table>`;
    }

    const summaryHTML = `<h3 style="margin:20px 0 5px;font-size:13px;font-weight:bold;">الملخص الإجمالي</h3>
    <table><tbody>
      <tr><td style="font-weight:bold">إجمالي أسعار البيع</td><td style="font-weight:bold">${formatNum(grandTotals.totalPrice)}</td></tr>
      <tr><td style="font-weight:bold">إجمالي التكلفة المباشرة</td><td>${formatNum(grandTotals.totalDirectCost)} (${grandTotals.totalPrice > 0 ? formatPct(grandTotals.totalDirectCost / grandTotals.totalPrice * 100) : "0%"})</td></tr>
      <tr><td style="font-weight:bold">إجمالي المصاريف الغير مباشرة</td><td>${formatNum(grandTotals.totalIndirect)} (${formatPct(indirectCostPct * 100)})</td></tr>
      <tr><td style="font-weight:bold">صافي الربح</td><td style="${grandTotals.totalProfit < 0 ? 'color:red' : 'color:green'};font-weight:bold">${formatNum(grandTotals.totalProfit)} (${grandTotals.totalPrice > 0 ? formatPct(grandTotals.totalProfit / grandTotals.totalPrice * 100) : "0%"})</td></tr>
      <tr><td style="font-weight:bold">عدد الأصناف</td><td style="font-weight:bold">${grandTotals.itemCount}</td></tr>
    </tbody></table>`;

    const printHTML = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>تحليل المنيو - ${tabLabel}</title>
    <style>
      @font-face { font-family:'CairoLocal'; src:url('${window.location.origin}/fonts/Cairo-Regular.ttf') format('truetype'); }
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:'CairoLocal',sans-serif; direction:rtl; padding:15px; color:#000; background:#fff; font-size:9px; }
      @media print { @page { size:landscape; margin:8mm; } body { padding:0; } }
      .header { text-align:center; margin-bottom:10px; border-bottom:2px solid #000; padding-bottom:10px; }
      .header-top { display:flex; align-items:center; justify-content:center; gap:12px; margin-bottom:6px; }
      .logo { width:60px; height:60px; object-fit:contain; }
      .header h1 { font-size:16px; font-weight:bold; margin:0; }
      .header .company-name { font-size:18px; font-weight:bold; margin-bottom:2px; }
      .header .sub-info { font-size:10px; color:#555; }
      .header .sub-info span { margin:0 8px; }
      table { width:100%; border-collapse:collapse; margin-bottom:10px; }
      th, td { border:1px solid #000; padding:3px 4px; text-align:center; font-size:8px; }
      th { background:#eee; font-weight:bold; font-size:8px; }
      .footer { text-align:center; margin-top:10px; font-size:8px; border-top:1px solid #000; padding-top:5px; }
    </style></head><body>
    <div class="header">
      <div class="header-top"><img src="${logoSrc}" alt="Logo" class="logo"/><div><div class="company-name">${companyName}</div><h1>تحليل المنيو - ${tabLabel}</h1></div></div>
      <div class="sub-info"><span>الفرع: ${branchName || "كل الفروع"}</span><span>الفترة: ${selectedPeriod.name}</span><span>${dateStr}</span></div>
    </div>
    ${categoriesHTML}${summaryHTML}
    <div class="footer">Powered by Mohamed Abdel Aal</div>
    <script>(async()=>{try{if(document.fonts&&document.fonts.ready)await document.fonts.ready}catch(e){}window.print();window.onafterprint=()=>window.close();})()</script>
    </body></html>`;

    const w = window.open("", "_blank");
    if (w) { w.document.write(printHTML); w.document.close(); }
  };

  const classificationLabel = (cls: string) => {
    const c = (cls || "").toLowerCase();
    if (c === "stars") return { label: "Stars ⭐ (نجم)", color: "#10b981" };
    if (c === "plow horses" || c === "plowhorses" || c === "plow_horses") return { label: "Plow Horses 🐎 (حصان شغّال)", color: "#3b82f6" };
    if (c === "puzzles") return { label: "Puzzles 🧩 (لغز)", color: "#f59e0b" };
    if (c === "dogs") return { label: "Dogs 🐕 (كلب)", color: "#ef4444" };
    return { label: cls || "—", color: "#6b7280" };
  };

  const costRecommendation = (pct: number) => {
    if (!isFinite(pct)) return { label: "بيانات غير صحيحة", color: "#6b7280", advice: "راجع السعر أو التكلفة" };
    if (pct < 20) return { label: "هامش ربح ضعيف", color: "#ef4444", advice: "🔴 نسبة الربح أقل من 20% — راجع تكلفة الوصفة، قلّل الفاقد، أو ارفع سعر البيع" };
    if (pct <= 30) return { label: "وضع مقبول", color: "#3b82f6", advice: "🔵 نسبة الربح بين 20% و30% — الوضع تمام، مفيش مشكلة" };
    return { label: "هامش ربح ممتاز", color: "#10b981", advice: "🟢 نسبة الربح أعلى من 30% — هامش ربح ممتاز، حافظ على جودة المنتج" };
  };

  const handlePrintDetail = (item: ItemAnalysis) => {
    const ingredients = recipeDetails.get(item.id) || [];
    const dateStr = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
    const logoSrc = `${window.location.origin}/logo.png`;
    const branchName = selectedBranchId !== "all" ? branches.find(b => b.id === selectedBranchId)?.name : "كل الفروع";
    const cls = classificationLabel(item.classification);
    const rec = costRecommendation(item.finalNetPct);

    const ingredientsHTML = ingredients.length > 0
      ? `<table style="width:100%;border-collapse:collapse;margin-top:6px;">
          <thead><tr>
            <th style="border:1px solid #000;padding:5px;background:#eee;font-size:10px;">#</th>
            <th style="border:1px solid #000;padding:5px;background:#eee;font-size:10px;">الكود</th>
            <th style="border:1px solid #000;padding:5px;background:#eee;font-size:10px;">اسم الخامة</th>
            <th style="border:1px solid #000;padding:5px;background:#eee;font-size:10px;">الكمية</th>
            <th style="border:1px solid #000;padding:5px;background:#eee;font-size:10px;">الوحدة</th>
            <th style="border:1px solid #000;padding:5px;background:#eee;font-size:10px;">سعر الوحدة</th>
            <th style="border:1px solid #000;padding:5px;background:#eee;font-size:10px;">الإجمالي</th>
          </tr></thead><tbody>
          ${ingredients.map((ing, i) => `<tr>
            <td style="border:1px solid #000;padding:4px;text-align:center;font-size:10px;">${i + 1}</td>
            <td style="border:1px solid #000;padding:4px;text-align:center;font-size:10px;">${ing.code}</td>
            <td style="border:1px solid #000;padding:4px;text-align:right;font-size:10px;">${ing.name}</td>
            <td style="border:1px solid #000;padding:4px;text-align:center;font-size:10px;">${formatNum(ing.qty)}</td>
            <td style="border:1px solid #000;padding:4px;text-align:center;font-size:10px;">${ing.recipeUnit}</td>
            <td style="border:1px solid #000;padding:4px;text-align:center;font-size:10px;">${formatNum(ing.unitCost)}</td>
            <td style="border:1px solid #000;padding:4px;text-align:center;font-size:10px;font-weight:bold;">${formatNum(ing.totalCost)}</td>
          </tr>`).join("")}
          <tr style="background:#f5f5f5;font-weight:bold;">
            <td colspan="6" style="border:1px solid #000;padding:5px;text-align:right;font-size:11px;">إجمالي تكلفة الوصفة الأساسية</td>
            <td style="border:1px solid #000;padding:5px;text-align:center;font-size:11px;">${formatNum(item.mainCost)}</td>
          </tr>
        </tbody></table>`
      : `<p style="text-align:center;padding:15px;color:#888;font-size:11px;">لا توجد مكونات وصفة مسجلة لهذا الصنف</p>`;

    const printHTML = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>تفاصيل ${item.name}</title>
    <style>
      @font-face { font-family:'CairoLocal'; src:url('${window.location.origin}/fonts/Cairo-Regular.ttf') format('truetype'); }
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:'CairoLocal',sans-serif; direction:rtl; padding:20px; color:#000; background:#fff; }
      @media print { @page { size:A4 portrait; margin:10mm; } body { padding:0; } }
      .header { text-align:center; border-bottom:2px solid #000; padding-bottom:12px; margin-bottom:15px; }
      .header-top { display:flex; align-items:center; justify-content:center; gap:14px; }
      .logo { width:70px; height:70px; object-fit:contain; }
      .company-name { font-size:18px; font-weight:bold; }
      .item-title { font-size:16px; font-weight:bold; margin-top:4px; }
      .item-code { font-size:11px; color:#555; }
      .meta { display:flex; justify-content:space-between; flex-wrap:wrap; font-size:10px; color:#444; margin-top:6px; padding:0 10px; }
      .classification-banner { background:${cls.color}; color:#fff; text-align:center; padding:8px; font-weight:bold; font-size:13px; border-radius:6px; margin-bottom:15px; }
      h3 { font-size:13px; font-weight:bold; margin:15px 0 6px; border-bottom:1px solid #000; padding-bottom:3px; }
      .kpi-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-bottom:10px; }
      .kpi { border:1px solid #000; padding:7px; text-align:center; border-radius:4px; }
      .kpi-label { font-size:9px; color:#555; margin-bottom:3px; }
      .kpi-value { font-size:13px; font-weight:bold; }
      .breakdown-table { width:100%; border-collapse:collapse; margin-top:6px; }
      .breakdown-table th, .breakdown-table td { border:1px solid #000; padding:5px 7px; font-size:10px; }
      .breakdown-table th { background:#eee; text-align:center; }
      .breakdown-table td.right { text-align:right; }
      .breakdown-table td.center { text-align:center; }
      .breakdown-table tr.total { background:#f5f5f5; font-weight:bold; }
      .recommend { border:2px solid ${rec.color}; border-radius:6px; padding:10px; margin-top:12px; }
      .recommend-title { font-weight:bold; color:${rec.color}; font-size:12px; margin-bottom:4px; }
      .recommend-text { font-size:11px; }
      .footer { text-align:center; margin-top:18px; font-size:9px; border-top:1px solid #000; padding-top:6px; }
    </style></head><body>
    <div class="header">
      <div class="header-top">
        <img src="${logoSrc}" alt="Logo" class="logo"/>
        <div>
          <div class="company-name">${companyName}</div>
          <div class="item-title">${item.name}</div>
          <div class="item-code">كود: ${item.code || "—"}</div>
        </div>
      </div>
      <div class="meta">
        <span>الفرع: ${branchName || "كل الفروع"}</span>
        <span>القسم: ${activeTab === "kitchen" ? "المطبخ" : "البار"}</span>
        <span>الفئة: ${item.categoryName}</span>
        <span>الفترة: ${selectedPeriod?.name || ""}</span>
        <span>${dateStr}</span>
      </div>
    </div>

    <div class="classification-banner">التصنيف الاستراتيجي: ${cls.label}</div>

    <h3>المؤشرات الأساسية</h3>
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-label">سعر البيع</div><div class="kpi-value">${formatNum(item.price)}</div></div>
      <div class="kpi"><div class="kpi-label">صافي السعر بعد الضريبة</div><div class="kpi-value">${formatNum(item.price * (1 - (selectedPeriod?.tax_rate || 0) / 100))}</div></div>
      <div class="kpi"><div class="kpi-label">إجمالي التكلفة المباشرة</div><div class="kpi-value">${formatNum(item.finalDirectCost)}</div></div>
      <div class="kpi"><div class="kpi-label">نسبة التكلفة المباشرة</div><div class="kpi-value">${formatPct(item.directCostPct)}</div></div>
      <div class="kpi"><div class="kpi-label">إجمالي التكلفة النهائية</div><div class="kpi-value">${formatNum(item.totalCost)}</div></div>
      <div class="kpi"><div class="kpi-label">نسبة التكلفة النهائية</div><div class="kpi-value">${formatPct(item.finalCostPct)}</div></div>
      <div class="kpi"><div class="kpi-label">صافي الربح</div><div class="kpi-value" style="color:${item.netProfit >= 0 ? '#10b981' : '#ef4444'}">${formatNum(item.netProfit)}</div></div>
      <div class="kpi"><div class="kpi-label">نسبة صافي الربح</div><div class="kpi-value" style="color:${item.finalNetPct >= 0 ? '#10b981' : '#ef4444'}">${formatPct(item.finalNetPct)}</div></div>
    </div>

    <h3>تشريح التكلفة (Cost Breakdown)</h3>
    <table class="breakdown-table">
      <thead><tr><th>البند</th><th>القيمة</th><th>النسبة من السعر</th></tr></thead>
      <tbody>
        <tr><td class="right">تكلفة الوصفة الأساسية (Main Cost)</td><td class="center">${formatNum(item.mainCost)}</td><td class="center">${item.price > 0 ? formatPct(item.mainCost / item.price * 100) : "0%"}</td></tr>
        <tr><td class="right">تكلفة جانبية (Side Cost)</td><td class="center">${formatNum(item.sideCost)}</td><td class="center">${item.price > 0 ? formatPct(item.sideCost / item.price * 100) : "0%"}</td></tr>
        <tr><td class="right">استهلاكيات (Consumables)</td><td class="center">${formatNum(item.consumables)}</td><td class="center">${item.price > 0 ? formatPct(item.consumables / item.price * 100) : "0%"}</td></tr>
        <tr><td class="right">تغليف (Packing)</td><td class="center">${formatNum(item.packingCost)}</td><td class="center">${item.price > 0 ? formatPct(item.packingCost / item.price * 100) : "0%"}</td></tr>
        <tr class="total"><td class="right">إجمالي التكلفة المباشرة</td><td class="center">${formatNum(item.finalDirectCost)}</td><td class="center">${formatPct(item.directCostPct)}</td></tr>
        <tr><td class="right">مصاريف غير مباشرة (حصة الصنف)</td><td class="center">${formatNum(item.indirectExpenses)}</td><td class="center">${item.price > 0 ? formatPct(item.indirectExpenses / item.price * 100) : "0%"}</td></tr>
        <tr class="total"><td class="right">إجمالي التكلفة النهائية</td><td class="center">${formatNum(item.totalCost)}</td><td class="center">${formatPct(item.finalCostPct)}</td></tr>
      </tbody>
    </table>

    <h3>مكونات الوصفة (Recipe Ingredients)</h3>
    ${ingredientsHTML}

    <div class="recommend">
      <div class="recommend-title">التقييم: ${rec.label}</div>
      <div class="recommend-text">${rec.advice}</div>
    </div>

    <div class="footer">Powered by Mohamed Abdel Aal</div>
    <script>(async()=>{try{if(document.fonts&&document.fonts.ready)await document.fonts.ready}catch(e){}window.print();window.onafterprint=()=>window.close();})()</script>
    </body></html>`;

    const w = window.open("", "_blank");
    if (w) { w.document.write(printHTML); w.document.close(); }
  };


  return (
    <div className="space-y-6 animate-fade-in-up" dir="rtl">
      <PeriodComparisonDialog
        open={compareOpen}
        onOpenChange={setCompareOpen}
        periods={periods as any}
        branches={branches}
        defaultPeriodId={selectedPeriod?.id || null}
        avgDirectCostPct={grandTotals.totalPrice > 0 ? (grandTotals.totalDirectCost / grandTotals.totalPrice) * 100 : 0}
      />

      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold">تحليل المنيو</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-muted-foreground">الفرع:</span>
          <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="كل الفروع" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الفروع</SelectItem>
              {branches.map(b => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">الفترة:</span>
          <Select value={selectedPeriodId} onValueChange={setSelectedPeriodId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="اختر الفترة" />
            </SelectTrigger>
            <SelectContent>
              {periods.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedPeriod && categorizedData.length > 0 && (
            <>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setCompareOpen(true)} disabled={periods.length < 2}>
                <GitCompareArrows size={14} className="text-blue-500" />
                قارن مع فترة سابقة
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={handleExcelExport} disabled={excelLoading}>
                {excelLoading ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} className="text-green-600" />}
                Excel
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={handlePdfExport} disabled={pdfLoading}>
                {pdfLoading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} className="text-red-500" />}
                PDF
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={handlePrint}>
                <Printer size={14} /> طباعة
              </Button>
            </>
          )}
        </div>
      </div>


      {!selectedPeriod && (
        <Card className="p-12 text-center">
          <AlertTriangle size={48} className="mx-auto mb-4 text-muted-foreground/30" />
          <h3 className="text-lg font-semibold mb-2">لا توجد فترة محددة</h3>
          <p className="text-muted-foreground text-sm">يرجى إضافة فترة من صفحة "تحليل المصاريف الغير مباشرة" أولاً</p>
        </Card>
      )}

      {selectedPeriod && (() => {
        const a = metricsA;
        const b = metricsB;
        const periodALabel = periodAResolved?.name ?? "—";
        const periodBLabel = periodBResolved?.name ?? "—";

        const delta = (av: number, bv: number) => bv - av;
        const fmtNum = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
        const fmtPct = (n: number) => `${n.toFixed(2)}%`;
        const signed = (n: number) => `${n >= 0 ? "+" : ""}${fmtNum(n)}`;
        const signedPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

        return (
          <Card className="border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Zap className="text-yellow-500" size={20} />
                كفاءة المنيو (مقارنة بين فترتين)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground mb-2">الفترة الأساسية (أ)</p>
                  <Select value={efficiencyPeriodAId || selectedPeriod.id} onValueChange={setEfficiencyPeriodAId}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="اختر الفترة الأساسية" /></SelectTrigger>
                    <SelectContent>
                      {periods.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground mb-2">فترة المقارنة (ب)</p>
                  <Select value={efficiencyPeriodBId} onValueChange={setEfficiencyPeriodBId}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="اختر فترة للمقارنة" /></SelectTrigger>
                    <SelectContent>
                      {periods.filter(p => p.id !== (efficiencyPeriodAId || selectedPeriod.id)).map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {!b || !a ? (
                <p className="text-sm text-muted-foreground text-center py-4">اختر فترتين لعرض مقارنة كفاءة المنيو</p>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-right py-2 px-3 font-semibold">المؤشر</th>
                        <th className="text-center py-2 px-3 font-semibold">الفترة (أ)<br/><span className="text-[10px] text-muted-foreground font-normal">{periodALabel}</span></th>
                        <th className="text-center py-2 px-3 font-semibold">الفترة (ب)<br/><span className="text-[10px] text-muted-foreground font-normal">{periodBLabel}</span></th>
                        <th className="text-center py-2 px-3 font-semibold">الفرق</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t">
                        <td className="py-2 px-3 font-medium">إجمالي المبيعات الشهرية</td>
                        <td className="text-center py-2 px-3">{fmtNum(a.monthlySales)}</td>
                        <td className="text-center py-2 px-3">{fmtNum(b.monthlySales)}</td>
                        <td className={`text-center py-2 px-3 font-semibold ${delta(a.monthlySales, b.monthlySales) >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>{signed(delta(a.monthlySales, b.monthlySales))}</td>
                      </tr>
                      <tr className="border-t">
                        <td className="py-2 px-3 font-medium">متوسط نسبة التكلفة المباشرة (Avg Direct Cost %)</td>
                        <td className="text-center py-2 px-3">{fmtPct(a.avgDirectPct)}</td>
                        <td className="text-center py-2 px-3">{fmtPct(b.avgDirectPct)}</td>
                        <td className={`text-center py-2 px-3 font-semibold ${delta(a.avgDirectPct, b.avgDirectPct) <= 0 ? 'text-emerald-500' : 'text-destructive'}`}>{signedPct(delta(a.avgDirectPct, b.avgDirectPct))}</td>
                      </tr>
                      <tr className="border-t">
                        <td className="py-2 px-3 font-medium">نسبة الربح الصافي (Net Profit %)</td>
                        <td className="text-center py-2 px-3">{fmtPct(a.netProfitPct)}</td>
                        <td className="text-center py-2 px-3">{fmtPct(b.netProfitPct)}</td>
                        <td className={`text-center py-2 px-3 font-semibold ${delta(a.netProfitPct, b.netProfitPct) >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>{signedPct(delta(a.netProfitPct, b.netProfitPct))}</td>
                      </tr>
                      <tr className="border-t">
                        <td className="py-2 px-3 font-medium">نسبة المصاريف الغير مباشرة</td>
                        <td className="text-center py-2 px-3">{fmtPct(a.indirectPct)}</td>
                        <td className="text-center py-2 px-3">{fmtPct(b.indirectPct)}</td>
                        <td className={`text-center py-2 px-3 font-semibold ${delta(a.indirectPct, b.indirectPct) <= 0 ? 'text-emerald-500' : 'text-destructive'}`}>{signedPct(delta(a.indirectPct, b.indirectPct))}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              <p className="text-[11px] text-muted-foreground leading-relaxed bg-yellow-500/5 border border-yellow-500/20 rounded p-2 mt-3">
                <strong>ملاحظة:</strong> هذه المقارنة مبنية على نفس قوائم الأصناف الحالية (فلتر الفرع/القسم) مع تطبيق إعدادات كل فترة (المستهلكات/التغليف/الإكسترا/المصاريف).
              </p>
            </CardContent>
          </Card>
        );
      })()}

      {selectedPeriod && (

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="kitchen">المطبخ (Kitchen)</TabsTrigger>
            <TabsTrigger value="bar">البار (Bar)</TabsTrigger>
          </TabsList>
          <TabsContent value="kitchen" className="space-y-6">
            {renderCategoryContent()}
          </TabsContent>
          <TabsContent value="bar" className="space-y-6">
            {renderCategoryContent()}
          </TabsContent>
        </Tabs>
      )}

      {/* Item Detail Modal */}
      <Dialog open={!!detailItem} onOpenChange={(o) => !o && setDetailItem(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
          {detailItem && (() => {
            const ingredients = recipeDetails.get(detailItem.id) || [];
            const cls = classificationLabel(detailItem.classification);
            const rec = costRecommendation(detailItem.finalNetPct);
            const taxRate = selectedPeriod?.tax_rate || 0;
            const netAfterTax = detailItem.price * (1 - taxRate / 100);
            const rows: { label: string; value: number; pct: number; bold?: boolean; color?: string }[] = [
              { label: "تكلفة الوصفة الأساسية (Main Cost)", value: detailItem.mainCost, pct: detailItem.price > 0 ? detailItem.mainCost / detailItem.price * 100 : 0 },
              { label: "تكلفة جانبية (Side Cost)", value: detailItem.sideCost, pct: detailItem.price > 0 ? detailItem.sideCost / detailItem.price * 100 : 0 },
              { label: "استهلاكيات (Consumables)", value: detailItem.consumables, pct: detailItem.price > 0 ? detailItem.consumables / detailItem.price * 100 : 0 },
              { label: "تغليف (Packing)", value: detailItem.packingCost, pct: detailItem.price > 0 ? detailItem.packingCost / detailItem.price * 100 : 0 },
              { label: "إجمالي التكلفة المباشرة", value: detailItem.finalDirectCost, pct: detailItem.directCostPct, bold: true },
              { label: "مصاريف غير مباشرة (حصة الصنف)", value: detailItem.indirectExpenses, pct: detailItem.price > 0 ? detailItem.indirectExpenses / detailItem.price * 100 : 0, color: "text-orange-600" },
              { label: "إجمالي التكلفة النهائية", value: detailItem.totalCost, pct: detailItem.finalCostPct, bold: true },
            ];
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="text-xl flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span>{detailItem.name}</span>
                      <Badge variant="outline" className="text-xs">{detailItem.code || "—"}</Badge>
                    </div>
                    <Button size="sm" variant="outline" className="gap-2" onClick={() => handlePrintDetail(detailItem)}>
                      <Printer size={14} /> طباعة التفاصيل
                    </Button>
                  </DialogTitle>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground pt-2">
                    <Badge variant="secondary">القسم: {activeTab === "kitchen" ? "المطبخ" : "البار"}</Badge>
                    <Badge variant="secondary">الفئة: {detailItem.categoryName}</Badge>
                    <Badge style={{ background: cls.color, color: "#fff" }}>{cls.label}</Badge>
                  </div>
                </DialogHeader>

                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                  <Card><CardContent className="p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">سعر البيع</p>
                    <p className="text-base font-bold text-primary">{formatNum(detailItem.price)}</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">صافي بعد الضريبة</p>
                    <p className="text-base font-bold">{formatNum(netAfterTax)}</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">إجمالي تكلفة مباشرة</p>
                    <p className="text-base font-bold">{formatNum(detailItem.finalDirectCost)}</p>
                    <Badge variant="secondary" className="text-[10px]">{formatPct(detailItem.directCostPct)}</Badge>
                  </CardContent></Card>
                  <Card><CardContent className="p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">إجمالي تكلفة نهائية</p>
                    <p className="text-base font-bold">{formatNum(detailItem.totalCost)}</p>
                    <Badge variant="secondary" className="text-[10px]">{formatPct(detailItem.finalCostPct)}</Badge>
                  </CardContent></Card>
                  <Card><CardContent className="p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">صافي الربح</p>
                    <p className={`text-base font-bold ${detailItem.netProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>{formatNum(detailItem.netProfit)}</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">نسبة صافي الربح</p>
                    <p className={`text-base font-bold ${profitColor(detailItem.finalNetPct)}`}>{formatPct(detailItem.finalNetPct)}</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">مصاريف غير مباشرة</p>
                    <p className="text-base font-bold text-orange-600">{formatNum(detailItem.indirectExpenses)}</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">عدد مكونات الوصفة</p>
                    <p className="text-base font-bold">{ingredients.length}</p>
                  </CardContent></Card>
                </div>

                {/* Cost Breakdown */}
                <div className="mt-4">
                  <h3 className="text-sm font-bold mb-2 border-b pb-1">تشريح التكلفة (Cost Breakdown)</h3>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>البند</TableHead>
                        <TableHead className="text-center">القيمة</TableHead>
                        <TableHead className="text-center">النسبة من السعر</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r, i) => (
                        <TableRow key={i} className={r.bold ? "bg-muted/30 font-bold" : ""}>
                          <TableCell className={`${r.color || ""} text-sm`}>{r.label}</TableCell>
                          <TableCell className={`text-center text-sm ${r.color || ""}`}>{formatNum(r.value)}</TableCell>
                          <TableCell className={`text-center text-sm ${r.color || ""}`}>{formatPct(r.pct)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Recipe Ingredients */}
                <div className="mt-4">
                  <h3 className="text-sm font-bold mb-2 border-b pb-1">مكونات الوصفة ({ingredients.length})</h3>
                  {ingredients.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground py-4">لا توجد مكونات وصفة مسجلة لهذا الصنف</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead className="w-10 text-center">#</TableHead>
                          <TableHead>الخامة</TableHead>
                          <TableHead className="text-center">الكمية</TableHead>
                          <TableHead className="text-center">الوحدة</TableHead>
                          <TableHead className="text-center">سعر الوحدة</TableHead>
                          <TableHead className="text-center">الإجمالي</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ingredients.map((ing, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-center text-xs">{i + 1}</TableCell>
                            <TableCell className="text-sm">
                              <div className="font-medium">{ing.name}</div>
                              {ing.code && <div className="text-[10px] text-muted-foreground">{ing.code}</div>}
                            </TableCell>
                            <TableCell className="text-center text-sm">{formatNum(ing.qty)}</TableCell>
                            <TableCell className="text-center text-sm">{ing.recipeUnit}</TableCell>
                            <TableCell className="text-center text-sm">{formatNum(ing.unitCost)}</TableCell>
                            <TableCell className="text-center text-sm font-semibold">{formatNum(ing.totalCost)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/40 font-bold">
                          <TableCell colSpan={5} className="text-sm">إجمالي تكلفة الوصفة الأساسية</TableCell>
                          <TableCell className="text-center text-sm">{formatNum(detailItem.mainCost)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  )}
                </div>

                {/* Recommendation */}
                <div className="mt-4 p-3 rounded-lg border-2" style={{ borderColor: rec.color }}>
                  <div className="font-bold text-sm mb-1" style={{ color: rec.color }}>التقييم: {rec.label}</div>
                  <div className="text-xs">{rec.advice}</div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};
