import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
  import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PieChart, Pie, Cell, Legend, ResponsiveContainer, Tooltip } from "recharts";

interface PosItem {
  id: string;
  name: string;
  price: number;
  category: string | null;
  menu_engineering_class: string | null;
  branch_id: string | null;
}

interface Branch { id: string; name: string; }

interface CostingPeriod {
  id: string; name: string; start_date: string; end_date: string;
  expected_sales: number; capacity: number; turn_over: number; avg_check: number;
  media: number; bills: number; salaries: number; other_expenses: number;
  maintenance: number; rent: number; default_consumables_pct: number; default_consumables_pct_bar: number;
  default_packing_cost: number; custom_expenses: { name: string; value: number }[];
  tax_rate: number; branch_id: string | null;
  consumables_kitchen_categories?: string[];
  consumables_bar_categories?: string[];
}

interface CostOverride {
  pos_item_id: string; side_cost: number; consumables_pct: number | null; packing_cost: number;
}

interface PackingItem { id: string; category_name: string; packing_name: string; cost: number; }
interface SideCostItem { id: string; category_name: string; cost_name: string; cost: number; }

interface CategoryReport {
  name: string;
  totalPrice: number;
  totalCost: number;
  totalProfit: number;
  costPer: number;
  profitPer: number;
  itemCount: number;
  totalPacking: number;
  totalConsumables: number;
  totalIndirect: number;
  netTakeAway: number;
  netTable: number;
}

const CHART_COLORS = ["hsl(142, 71%, 45%)", "hsl(25, 95%, 53%)", "hsl(217, 91%, 60%)"];

export const MenuFinalReportPage: React.FC = () => {
  const { auth } = useAuth();
  const [periods, setPeriods] = useState<CostingPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState(() => sessionStorage.getItem("menu_period") || "");
  const [posItems, setPosItems] = useState<PosItem[]>([]);
  const [recipes, setRecipes] = useState<Map<string, number>>(new Map());
  const [costOverrides, setCostOverrides] = useState<Map<string, CostOverride>>(new Map());
  const [categoryPackingItems, setCategoryPackingItems] = useState<PackingItem[]>([]);
  const [categorySideCostItems, setCategorySideCostItems] = useState<SideCostItem[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState(() => sessionStorage.getItem("menu_branch") || "all");
  const [activeTab, setActiveTab] = useState("kitchen");
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState("");

  const companyId = auth.profile?.company_id;

  useEffect(() => { if (companyId) fetchAll(); }, [companyId]);
  useEffect(() => {
    if (companyId && selectedPeriodId) { fetchPackingItems(); fetchSideCostItems(); }
  }, [selectedPeriodId, companyId]);

  const fetchPackingItems = async () => {
    if (!companyId || !selectedPeriodId) return;
    const { data } = await supabase.from("category_packing_items").select("*").eq("company_id", companyId).eq("period_id", selectedPeriodId);
    if (data) setCategoryPackingItems(data as PackingItem[]);
  };
  const fetchSideCostItems = async () => {
    if (!companyId || !selectedPeriodId) return;
    const { data } = await supabase.from("category_side_costs" as any).select("*").eq("company_id", companyId).eq("period_id", selectedPeriodId);
    if (data) setCategorySideCostItems(data as unknown as SideCostItem[]);
  };

  const fetchAll = async () => {
    setLoading(true);
    const [periodsRes, itemsRes, recipesRes, overridesRes, branchesRes, companyRes] = await Promise.all([
      supabase.from("menu_costing_periods").select("*").eq("company_id", companyId!).order("created_at", { ascending: false }),
      supabase.from("pos_items").select("*, categories:category_id(name)").eq("company_id", companyId!).eq("active", true),
      supabase.from("recipes").select("id, menu_item_id, recipe_ingredients(stock_item_id, qty, stock_items:stock_item_id(avg_cost, conversion_factor))").eq("company_id", companyId!),
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
          const si = ing.stock_items;
          if (si) totalCost += ing.qty * (si.avg_cost / (si.conversion_factor || 1));
        }
        recipeCostMap.set(recipe.menu_item_id, totalCost);
      }
    }
    setRecipes(recipeCostMap);
    const overrideMap = new Map<string, CostOverride>();
    if (overridesRes.data) for (const o of overridesRes.data as any[]) overrideMap.set(o.pos_item_id, o as CostOverride);
    setCostOverrides(overrideMap);
    setLoading(false);
  };

  const filteredPeriods = useMemo(() => {
    if (selectedBranchId === "all") return periods;
    return periods.filter(p => p.branch_id === selectedBranchId || !p.branch_id);
  }, [periods, selectedBranchId]);

  const selectedPeriod = periods.find(p => p.id === selectedPeriodId);

  // Auto-select first filtered period when branch changes
  useEffect(() => {
    if (filteredPeriods.length > 0 && !filteredPeriods.find(p => p.id === selectedPeriodId)) {
      setSelectedPeriodId(filteredPeriods[0].id);
    }
  }, [filteredPeriods, selectedPeriodId]);

  const filteredPosItems = useMemo(() => {
    let items = posItems;
    if (selectedBranchId !== "all") items = items.filter(i => i.branch_id === selectedBranchId);
    if (activeTab === "kitchen") items = items.filter(i => !i.menu_engineering_class || i.menu_engineering_class.toLowerCase() === "kitchen");
    else items = items.filter(i => i.menu_engineering_class?.toLowerCase() === "bar");
    return items;
  }, [posItems, selectedBranchId, activeTab]);

  const monthSales = useMemo(() => {
    if (!selectedPeriod) return 0;
    const days = Math.max(1, Math.round((new Date(selectedPeriod.end_date).getTime() - new Date(selectedPeriod.start_date).getTime()) / 86400000) + 1);
    return selectedPeriod.expected_sales * days;
  }, [selectedPeriod]);

  const totalIndirectCost = useMemo(() => {
    if (!selectedPeriod) return 0;
    const fixed = selectedPeriod.media + selectedPeriod.bills + selectedPeriod.salaries + selectedPeriod.other_expenses + selectedPeriod.maintenance + selectedPeriod.rent;
    const custom = (selectedPeriod.custom_expenses || []).reduce((s, e) => s + e.value, 0);
    return fixed + custom;
  }, [selectedPeriod]);

  const indirectCostPct = monthSales > 0 ? totalIndirectCost / monthSales : 0;

  const getCatPackingCost = (catName: string) => categoryPackingItems.filter(p => p.category_name === catName).reduce((s, p) => s + p.cost, 0);
  const getCatSideCost = (catName: string) => categorySideCostItems.filter(p => p.category_name === catName).reduce((s, p) => s + p.cost, 0);

  const categoryReports = useMemo(() => {
    if (!selectedPeriod) return [];
    const map = new Map<string, CategoryReport>();

    for (const item of filteredPosItems) {
      const catName = item.category || "بدون تصنيف";
      if (!map.has(catName)) map.set(catName, {
        name: catName, totalPrice: 0, totalCost: 0, totalProfit: 0, costPer: 0, profitPer: 0,
        itemCount: 0, totalPacking: 0, totalConsumables: 0, totalIndirect: 0, netTakeAway: 0, netTable: 0,
      });

      const cat = map.get(catName)!;
      const mainCost = recipes.get(item.id) || 0;
      const override = costOverrides.get(item.id);
      const sideCost = (override?.side_cost || 0) + getCatSideCost(catName);
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
      const categoryPacking = getCatPackingCost(catName);
      const itemPacking = override?.packing_cost || 0;
      const packingCost = categoryPacking + itemPacking;
      const finalDirectCost = mainCost + sideCost + consumables + packingCost;
      const indirectExpenses = item.price * indirectCostPct;

      cat.totalPrice += item.price;
      cat.totalCost += finalDirectCost;
      cat.totalIndirect += indirectExpenses;
      cat.totalPacking += packingCost;
      cat.totalConsumables += consumables;
      cat.itemCount++;
    }

    for (const cat of map.values()) {
      cat.totalProfit = cat.totalPrice - cat.totalCost;
      cat.costPer = cat.totalPrice > 0 ? (cat.totalCost / cat.totalPrice) * 100 : 0;
      cat.profitPer = cat.totalPrice > 0 ? (cat.totalProfit / cat.totalPrice) * 100 : 0;
      // Net Take Away = Total Price - Total Cost - Indirect
      cat.netTakeAway = cat.totalPrice - cat.totalCost - cat.totalIndirect;
      // Net Table = (Total Price * (1 - taxRate/100)) - Total Cost - Indirect
      const periodTaxRate = selectedPeriod?.tax_rate || 0;
      cat.netTable = (cat.totalPrice * (1 - periodTaxRate / 100)) - cat.totalCost - cat.totalIndirect;
    }
    return Array.from(map.values());
  }, [filteredPosItems, selectedPeriod, recipes, costOverrides, indirectCostPct, categoryPackingItems, categorySideCostItems]);

  const grandTotals = useMemo(() => {
    const t = { totalPrice: 0, totalCost: 0, totalProfit: 0, totalIndirect: 0, itemCount: 0, netTakeAway: 0, netTable: 0, totalPacking: 0, totalConsumables: 0 };
    for (const c of categoryReports) {
      t.totalPrice += c.totalPrice; t.totalCost += c.totalCost; t.totalProfit += c.totalProfit;
      t.totalIndirect += c.totalIndirect; t.itemCount += c.itemCount; t.netTakeAway += c.netTakeAway;
      t.netTable += c.netTable; t.totalPacking += c.totalPacking; t.totalConsumables += c.totalConsumables;
    }
    return t;
  }, [categoryReports]);

  // Summary stats for the tab
  const periodDays = selectedPeriod ? Math.max(1, Math.round((new Date(selectedPeriod.end_date).getTime() - new Date(selectedPeriod.start_date).getTime()) / 86400000) + 1) : 30;
  const avgOrderPrice = grandTotals.itemCount > 0 ? grandTotals.totalPrice / grandTotals.itemCount : 0;
  const avgDirectCost = grandTotals.itemCount > 0 ? grandTotals.totalCost / grandTotals.itemCount : 0;
  const avgDirectProfit = avgOrderPrice - avgDirectCost;
  const dailyIndirect = periodDays > 0 ? totalIndirectCost / periodDays : 0;
  const breakEvenOrders = avgDirectProfit > 0 ? dailyIndirect / avgDirectProfit : 0;

  const totalPackingPer = grandTotals.totalPrice > 0 ? (grandTotals.totalPacking / grandTotals.totalPrice) * 100 : 0;
  const totalConsumablesPer = grandTotals.totalPrice > 0 ? (grandTotals.totalConsumables / grandTotals.totalPrice) * 100 : 0;

  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct = (n: number) => n.toFixed(2) + "%";

  const pieData = [
    { name: "تكلفة مباشرة", value: grandTotals.totalCost },
    { name: "غير مباشرة", value: grandTotals.totalIndirect },
    { name: "صافي الربح", value: Math.max(0, grandTotals.netTakeAway) },
  ];

  const costPctColor = (pct: number) => {
    if (pct >= 20 && pct <= 40) return "bg-emerald-500";
    if (pct < 20) return "bg-red-500";
    return "bg-yellow-500";
  };

  if (loading) return <div className="p-6 text-center text-muted-foreground">جاري التحميل...</div>;

  const renderTabContent = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Table */}
        <div className="lg:col-span-2 space-y-4">
          {/* Table 1: Category Breakdown */}
          <div className="border rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-primary/10">
                  <TableHead className="text-center font-bold">التصنيف</TableHead>
                  <TableHead className="text-center font-bold">إجمالي السعر</TableHead>
                  <TableHead className="text-center font-bold">إجمالي التكلفة</TableHead>
                  <TableHead className="text-center font-bold">إجمالي الربح</TableHead>
                  <TableHead className="text-center font-bold">نسبة التكلفة</TableHead>
                  <TableHead className="text-center font-bold">نسبة الربح</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categoryReports.map((cat, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="text-center text-sm font-semibold">{cat.name}</TableCell>
                    <TableCell className="text-center text-sm">{fmt(cat.totalPrice)}</TableCell>
                    <TableCell className="text-center text-sm">{fmt(cat.totalCost)}</TableCell>
                    <TableCell className="text-center text-sm">{fmt(cat.totalProfit)}</TableCell>
                    <TableCell className="text-center text-sm">
                      <span className={`px-2 py-0.5 rounded text-xs text-white ${costPctColor(cat.costPer)}`}>{fmtPct(cat.costPer)}</span>
                    </TableCell>
                    <TableCell className={`text-center text-sm ${cat.profitPer >= 0 ? "text-emerald-600" : "text-red-500"} font-semibold`}>{fmtPct(cat.profitPer)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {/* Cost percentage legend */}
            <div className="border-t p-3 flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1"><span className="w-4 h-3 rounded bg-emerald-500 inline-block"></span> 20% : 40%</div>
              <div className="flex items-center gap-1"><span className="w-4 h-3 rounded bg-red-500 inline-block"></span> أقل من 20%</div>
              <div className="flex items-center gap-1"><span className="w-4 h-3 rounded bg-yellow-500 inline-block"></span> أكثر من 40%</div>
            </div>
          </div>

          {/* Table 2: Summary Totals */}
          <div className="border rounded-xl overflow-hidden">
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell className="text-sm font-bold" colSpan={2}>
                    إجمالي سعر بيع {activeTab === "kitchen" ? "المطبخ" : "البار"}
                  </TableCell>
                  <TableCell className="text-center text-sm font-bold">{fmt(grandTotals.totalPrice)}</TableCell>
                  <TableCell className="text-center text-sm font-bold">Percentage</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-sm font-bold" colSpan={2}>
                    إجمالي تكلفة مباشرة {activeTab === "kitchen" ? "المطبخ" : "البار"}
                  </TableCell>
                  <TableCell className="text-center text-sm font-bold">{fmt(grandTotals.totalCost)}</TableCell>
                  <TableCell className="text-center text-sm font-bold">{fmtPct(grandTotals.totalPrice > 0 ? grandTotals.totalCost / grandTotals.totalPrice * 100 : 0)}</TableCell>
                </TableRow>
                <TableRow className="bg-blue-200/40">
                  <TableCell className="text-sm font-bold" colSpan={2}>
                    إجمالي تكلفة غير مباشرة {activeTab === "kitchen" ? "المطبخ" : "البار"}
                  </TableCell>
                  <TableCell className="text-center text-sm font-bold">{fmt(grandTotals.totalIndirect)}</TableCell>
                  <TableCell className="text-center text-sm font-bold">{fmtPct(indirectCostPct * 100)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-sm font-bold" colSpan={2}>
                    صافي ربح Net Take Away
                  </TableCell>
                  <TableCell className="text-center text-sm font-bold">{fmt(grandTotals.netTakeAway)}</TableCell>
                  <TableCell className="text-center text-sm font-bold">{grandTotals.totalPrice > 0 ? fmtPct(grandTotals.netTakeAway / grandTotals.totalPrice * 100) : "0%"}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-sm font-bold" colSpan={2}>
                    صافي ربح Net Table (بعد ضريبة {selectedPeriod?.tax_rate || 0}%)
                  </TableCell>
                  <TableCell className="text-center text-sm font-bold">{fmt(grandTotals.netTable)}</TableCell>
                  <TableCell className="text-center text-sm font-bold">{grandTotals.totalPrice > 0 ? fmtPct(grandTotals.netTable / grandTotals.totalPrice * 100) : "0%"}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-sm font-bold" colSpan={2}>عدد الأصناف</TableCell>
                  <TableCell className="text-center text-sm font-bold">{grandTotals.itemCount}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Right side: Pie Chart + Summary */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={70} innerRadius={35} dataKey="value" label={({ value }) => fmt(value)}>
                    {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i]} />)}
                  </Pie>
                  <Legend />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="bg-primary/10 px-4 py-2 text-center font-bold text-sm">
                إجمالي {activeTab === "kitchen" ? "المطبخ" : "المشروبات"}
              </div>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="text-sm">مصاريف غير مباشرة</TableCell>
                    <TableCell className="text-center text-sm font-bold">{fmt(dailyIndirect)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-sm">متوسط سعر الأوردر</TableCell>
                    <TableCell className="text-center text-sm font-bold">{fmt(avgOrderPrice)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-sm">متوسط تكلفة مباشرة</TableCell>
                    <TableCell className="text-center text-sm font-bold">{fmt(avgDirectCost)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-sm">متوسط ربحية مباشرة</TableCell>
                    <TableCell className="text-center text-sm font-bold">{fmt(avgDirectProfit)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-sm">عدد الأوردرات لتحقيق نقطة التعادل</TableCell>
                    <TableCell className="text-center text-sm font-bold">{Math.ceil(breakEvenOrders)} أوردر</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );

  const handlePrint = () => {
    if (!selectedPeriod || categoryReports.length === 0) return;
    const dateStr = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
    const logoSrc = `${window.location.origin}/logo.png`;
    const tabLabel = activeTab === "kitchen" ? "المطبخ" : "البار";
    const branchName = selectedBranchId !== "all" ? branches.find(b => b.id === selectedBranchId)?.name : "كل الفروع";
    const costPctBg = (pct: number) => pct >= 20 && pct <= 40 ? '#22c55e' : pct < 20 ? '#ef4444' : '#eab308';

    let catTableHTML = `<table><thead><tr>
      <th>التصنيف</th><th>إجمالي السعر</th><th>إجمالي التكلفة</th><th>إجمالي الربح</th><th>نسبة التكلفة</th><th>نسبة الربح</th>
    </tr></thead><tbody>`;
    for (const cat of categoryReports) {
      catTableHTML += `<tr>
        <td style="font-weight:bold">${cat.name}</td><td>${fmt(cat.totalPrice)}</td><td>${fmt(cat.totalCost)}</td><td>${fmt(cat.totalProfit)}</td>
        <td><span style="background:${costPctBg(cat.costPer)};color:#fff;padding:1px 6px;border-radius:3px;font-size:9px">${fmtPct(cat.costPer)}</span></td>
        <td style="${cat.profitPer < 0 ? 'color:red' : 'color:green'};font-weight:bold">${fmtPct(cat.profitPer)}</td>
      </tr>`;
    }
    catTableHTML += `</tbody></table>`;

    const periodTaxRate = selectedPeriod?.tax_rate || 0;
    const summaryHTML = `<h3 style="margin:15px 0 5px;font-size:13px;font-weight:bold;">ملخص إجمالي ${tabLabel}</h3>
    <table><tbody>
      <tr><td style="font-weight:bold">إجمالي سعر بيع ${tabLabel}</td><td style="font-weight:bold">${fmt(grandTotals.totalPrice)}</td><td></td></tr>
      <tr><td style="font-weight:bold">إجمالي تكلفة مباشرة ${tabLabel}</td><td style="font-weight:bold">${fmt(grandTotals.totalCost)}</td><td>${fmtPct(grandTotals.totalPrice > 0 ? grandTotals.totalCost / grandTotals.totalPrice * 100 : 0)}</td></tr>
      <tr style="background:#d4e8ff"><td style="font-weight:bold">إجمالي تكلفة غير مباشرة ${tabLabel}</td><td style="font-weight:bold">${fmt(grandTotals.totalIndirect)}</td><td>${fmtPct(indirectCostPct * 100)}</td></tr>
      <tr><td style="font-weight:bold">صافي ربح Net Take Away</td><td style="font-weight:bold">${fmt(grandTotals.netTakeAway)}</td><td>${grandTotals.totalPrice > 0 ? fmtPct(grandTotals.netTakeAway / grandTotals.totalPrice * 100) : "0%"}</td></tr>
      <tr><td style="font-weight:bold">صافي ربح Net Table (بعد ضريبة ${periodTaxRate}%)</td><td style="font-weight:bold">${fmt(grandTotals.netTable)}</td><td>${grandTotals.totalPrice > 0 ? fmtPct(grandTotals.netTable / grandTotals.totalPrice * 100) : "0%"}</td></tr>
      <tr><td style="font-weight:bold">عدد الأصناف</td><td style="font-weight:bold">${grandTotals.itemCount}</td><td></td></tr>
    </tbody></table>
    <h3 style="margin:15px 0 5px;font-size:13px;font-weight:bold;">ملخص التشغيل</h3>
    <table><tbody>
      <tr><td>مصاريف غير مباشرة يومية</td><td style="font-weight:bold">${fmt(dailyIndirect)}</td></tr>
      <tr><td>متوسط سعر الأوردر</td><td style="font-weight:bold">${fmt(avgOrderPrice)}</td></tr>
      <tr><td>متوسط تكلفة مباشرة</td><td style="font-weight:bold">${fmt(avgDirectCost)}</td></tr>
      <tr><td>متوسط ربحية مباشرة</td><td style="font-weight:bold">${fmt(avgDirectProfit)}</td></tr>
      <tr><td>أوردرات نقطة التعادل</td><td style="font-weight:bold">${Math.ceil(breakEvenOrders)} أوردر</td></tr>
    </tbody></table>`;

    const printHTML = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>التقرير النهائي - ${tabLabel}</title>
    <style>
      @font-face { font-family:'CairoLocal'; src:url('${window.location.origin}/fonts/Cairo-Regular.ttf') format('truetype'); }
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:'CairoLocal',sans-serif; direction:rtl; padding:20px; color:#000; background:#fff; }
      @media print { @page { size:auto; margin:10mm; } body { padding:0; } }
      .header { text-align:center; margin-bottom:12px; border-bottom:2px solid #000; padding-bottom:10px; }
      .header-top { display:flex; align-items:center; justify-content:center; gap:12px; margin-bottom:6px; }
      .logo { width:70px; height:70px; object-fit:contain; }
      .header h1 { font-size:16px; font-weight:bold; margin:0; }
      .header .company-name { font-size:18px; font-weight:bold; margin-bottom:2px; }
      .header .sub-info { font-size:10px; color:#555; }
      .header .sub-info span { margin:0 8px; }
      table { width:100%; border-collapse:collapse; margin-bottom:10px; }
      th, td { border:1px solid #000; padding:5px 8px; text-align:center; font-size:10px; }
      th { background:#eee; font-weight:bold; }
      .footer { text-align:center; margin-top:12px; font-size:8px; border-top:1px solid #000; padding-top:5px; }
    </style></head><body>
    <div class="header">
      <div class="header-top"><img src="${logoSrc}" alt="Logo" class="logo"/><div><div class="company-name">${companyName}</div><h1>التقرير النهائي - ${tabLabel}</h1></div></div>
      <div class="sub-info"><span>الفرع: ${branchName || "كل الفروع"}</span><span>الفترة: ${selectedPeriod.name}</span><span>${dateStr}</span></div>
    </div>
    ${catTableHTML}${summaryHTML}
    <div class="footer">Powered by Mohamed Abdel Aal</div>
    <script>(async()=>{try{if(document.fonts&&document.fonts.ready)await document.fonts.ready}catch(e){}window.print();window.onafterprint=()=>window.close();})()</script>
    </body></html>`;

    const w = window.open("", "_blank");
    if (w) { w.document.write(printHTML); w.document.close(); }
  };

  return (
    <div className="space-y-6 animate-fade-in-up" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText size={24} className="text-primary" />
          التقرير النهائي
        </h1>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-muted-foreground">الفرع:</span>
          <Select value={selectedBranchId} onValueChange={(val) => { setSelectedBranchId(val); setSelectedPeriodId(""); }}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="كل الفروع" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الفروع</SelectItem>
              {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">الفترة:</span>
          <Select value={selectedPeriodId} onValueChange={setSelectedPeriodId}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="اختر الفترة" /></SelectTrigger>
            <SelectContent>
              {filteredPeriods.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {selectedPeriod && categoryReports.length > 0 && (
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
          <TabsContent value="kitchen" className="space-y-6">{renderTabContent()}</TabsContent>
          <TabsContent value="bar" className="space-y-6">{renderTabContent()}</TabsContent>
        </Tabs>
      )}
    </div>
  );
};
