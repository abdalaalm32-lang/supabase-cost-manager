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
import { toast } from "@/hooks/use-toast";
import { AlertTriangle, Package, Printer } from "lucide-react";
import { CategoryPackingTable } from "@/components/menu-analysis/CategoryPackingTable";
import { CategorySummaryTable } from "@/components/menu-analysis/CategorySummaryTable";
import { CategorySideCostTable } from "@/components/menu-analysis/CategorySideCostTable";
import { CategoryFinancialTable } from "@/components/menu-analysis/CategoryFinancialTable";

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
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const [posItems, setPosItems] = useState<PosItem[]>([]);
  const [recipes, setRecipes] = useState<Map<string, number>>(new Map());
  const [costOverrides, setCostOverrides] = useState<Map<string, CostOverride>>(new Map());
  const [categoryPackingItems, setCategoryPackingItems] = useState<PackingItem[]>([]);
  const [categorySideCostItems, setCategorySideCostItems] = useState<SideCostItem[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<string>("kitchen");
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState("");

  const companyId = auth.profile?.company_id;

  useEffect(() => {
    if (!companyId) return;
    fetchAll();
  }, [companyId]);

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
    const [periodsRes, itemsRes, recipesRes, overridesRes, branchesRes, companyRes] = await Promise.all([
      supabase.from("menu_costing_periods").select("*").eq("company_id", companyId!).order("created_at", { ascending: false }),
      supabase.from("pos_items").select("*, categories:category_id(name, code)").eq("company_id", companyId!).eq("active", true),
      supabase.from("recipes").select("id, menu_item_id, recipe_ingredients(stock_item_id, qty, stock_items:stock_item_id(avg_cost, conversion_factor, recipe_unit, stock_unit))").eq("company_id", companyId!),
      supabase.from("pos_item_cost_settings").select("*").eq("company_id", companyId!),
      supabase.from("branches").select("id, name").eq("company_id", companyId!).eq("active", true),
      supabase.from("companies").select("name").eq("id", companyId!).single(),
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
      }));
      setPosItems(mapped as PosItem[]);
    }
    if (branchesRes.data) setBranches(branchesRes.data as Branch[]);

    const recipeCostMap = new Map<string, number>();
    if (recipesRes.data) {
      for (const recipe of recipesRes.data as any[]) {
        let totalCost = 0;
        for (const ing of recipe.recipe_ingredients || []) {
          const stockItem = ing.stock_items;
          if (stockItem) {
            const convFactor = stockItem.conversion_factor || 1;
            const costPerRecipeUnit = stockItem.avg_cost / convFactor;
            totalCost += ing.qty * costPerRecipeUnit;
          }
        }
        recipeCostMap.set(recipe.menu_item_id, totalCost);
      }
    }
    setRecipes(recipeCostMap);

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
    let items = posItems;
    if (selectedBranchId !== "all") {
      items = items.filter(i => i.branch_id === selectedBranchId);
    }
    // Filter by Kitchen/Bar tab
    if (activeTab === "kitchen") {
      items = items.filter(i => !i.menu_engineering_class || i.menu_engineering_class.toLowerCase() === "kitchen");
    } else {
      items = items.filter(i => i.menu_engineering_class?.toLowerCase() === "bar");
    }
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

    const categoryMap = new Map<string, CategoryData>();

    for (const item of filteredPosItems) {
      const catName = item.category || "بدون تصنيف";
      if (!categoryMap.has(catName)) categoryMap.set(catName, { name: catName, items: [] });

      const mainCost = recipes.get(item.id) || 0;
      const override = costOverrides.get(item.id);
      const sideCost = override?.side_cost || 0;
      const categorySideCost = getCategorySideCost(catName);
      const isBar = item.menu_engineering_class?.toLowerCase() === "bar";
      const defaultPct = isBar ? (selectedPeriod.default_consumables_pct_bar ?? selectedPeriod.default_consumables_pct) : selectedPeriod.default_consumables_pct;
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
        id: item.id, name: item.name, price: item.price, mainCost, sideCost: sideCost + categorySideCost, consumables, packingCost,
        finalDirectCost, directCostPct, netTakeAway, indirectExpenses, totalCost, netProfit, finalCostPct, finalNetPct,
      });
    }

    return Array.from(categoryMap.values());
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
                          <TableCell className="text-sm font-medium">{item.name}</TableCell>
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

  return (
    <div className="space-y-6 animate-fade-in-up" dir="rtl">
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
            <Button variant="outline" size="sm" className="gap-2" onClick={handlePrint}>
              <Printer size={14} /> طباعة
            </Button>
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
    </div>
  );
};
