import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  maintenance: number; rent: number; default_consumables_pct: number;
  default_packing_cost: number; custom_expenses: { name: string; value: number }[];
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
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [posItems, setPosItems] = useState<PosItem[]>([]);
  const [recipes, setRecipes] = useState<Map<string, number>>(new Map());
  const [costOverrides, setCostOverrides] = useState<Map<string, CostOverride>>(new Map());
  const [categoryPackingItems, setCategoryPackingItems] = useState<PackingItem[]>([]);
  const [categorySideCostItems, setCategorySideCostItems] = useState<SideCostItem[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("all");
  const [activeTab, setActiveTab] = useState("kitchen");
  const [taxRate, setTaxRate] = useState(14);
  const [loading, setLoading] = useState(true);

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
    const [periodsRes, itemsRes, recipesRes, overridesRes, branchesRes] = await Promise.all([
      supabase.from("menu_costing_periods").select("*").eq("company_id", companyId!).order("created_at", { ascending: false }),
      supabase.from("pos_items").select("*").eq("company_id", companyId!).eq("active", true),
      supabase.from("recipes").select("id, menu_item_id, recipe_ingredients(stock_item_id, qty, stock_items:stock_item_id(avg_cost, conversion_factor))").eq("company_id", companyId!),
      supabase.from("pos_item_cost_settings").select("*").eq("company_id", companyId!),
      supabase.from("branches").select("id, name").eq("company_id", companyId!).eq("active", true),
    ]);
    if (periodsRes.data) {
      setPeriods(periodsRes.data as unknown as CostingPeriod[]);
      if (periodsRes.data.length > 0 && !selectedPeriodId) setSelectedPeriodId(periodsRes.data[0].id);
    }
    if (itemsRes.data) setPosItems(itemsRes.data as PosItem[]);
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

  const selectedPeriod = periods.find(p => p.id === selectedPeriodId);

  const filteredPosItems = useMemo(() => {
    let items = posItems;
    if (selectedBranchId !== "all") items = items.filter(i => i.branch_id === selectedBranchId);
    if (activeTab === "kitchen") items = items.filter(i => i.menu_engineering_class === "Kitchen" || !i.menu_engineering_class);
    else items = items.filter(i => i.menu_engineering_class === "Bar");
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
      const consumablesPct = override?.consumables_pct ?? selectedPeriod.default_consumables_pct;
      const consumables = (item.price * consumablesPct) / 100;
      const packingCost = getCatPackingCost(catName);
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
      cat.netTable = (cat.totalPrice * (1 - taxRate / 100)) - cat.totalCost - cat.totalIndirect;
    }
    return Array.from(map.values());
  }, [filteredPosItems, selectedPeriod, recipes, costOverrides, indirectCostPct, categoryPackingItems, categorySideCostItems, taxRate]);

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
        <div className="lg:col-span-2">
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

            {/* Summary rows */}
            <div className="border-t bg-muted/30">
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="text-sm font-bold" colSpan={2}>
                      إجمالي سعر بيع {activeTab === "kitchen" ? "المطبخ" : "البار"}
                    </TableCell>
                    <TableCell className="text-center text-sm font-bold" colSpan={2}>{fmt(grandTotals.totalPrice)}</TableCell>
                    <TableCell colSpan={2}></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-sm font-bold" colSpan={2}>
                      إجمالي تكلفة مباشرة {activeTab === "kitchen" ? "المطبخ" : "البار"}
                    </TableCell>
                    <TableCell className="text-center text-sm font-bold" colSpan={2}>{fmt(grandTotals.totalCost)}</TableCell>
                    <TableCell className="text-center text-sm" colSpan={2}>{fmtPct(grandTotals.totalPrice > 0 ? grandTotals.totalCost / grandTotals.totalPrice * 100 : 0)}</TableCell>
                  </TableRow>
                  <TableRow className="bg-orange-500/10">
                    <TableCell className="text-sm font-bold text-orange-600" colSpan={2}>
                      إجمالي تكلفة غير مباشرة {activeTab === "kitchen" ? "المطبخ" : "البار"}
                    </TableCell>
                    <TableCell className="text-center text-sm font-bold text-orange-600" colSpan={2}>{fmt(grandTotals.totalIndirect)}</TableCell>
                    <TableCell className="text-center text-sm text-orange-600" colSpan={2}>{fmtPct(indirectCostPct * 100)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-sm font-bold" colSpan={2}>
                      صافي ربح Net Take Away
                    </TableCell>
                    <TableCell className="text-center text-sm font-bold" colSpan={2}>{fmt(grandTotals.netTakeAway)}</TableCell>
                    <TableCell className="text-center text-sm" colSpan={2}>{grandTotals.totalPrice > 0 ? fmtPct(grandTotals.netTakeAway / grandTotals.totalPrice * 100) : "0%"}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-sm font-bold" colSpan={2}>
                      صافي ربح Net Table (بعد ضريبة {taxRate}%)
                    </TableCell>
                    <TableCell className="text-center text-sm font-bold" colSpan={2}>{fmt(grandTotals.netTable)}</TableCell>
                    <TableCell className="text-center text-sm" colSpan={2}>{grandTotals.totalPrice > 0 ? fmtPct(grandTotals.netTable / grandTotals.totalPrice * 100) : "0%"}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-sm font-bold" colSpan={2}>عدد الأصناف</TableCell>
                    <TableCell className="text-center text-sm font-bold" colSpan={2}>{grandTotals.itemCount}</TableCell>
                    <TableCell colSpan={2}></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {/* Packing & Consumables percentages */}
            <div className="border-t bg-muted/20">
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="text-sm font-bold" colSpan={3}>
                      إجمالي نسبة التغليف ({activeTab === "kitchen" ? "مطبخ" : "بار"})
                    </TableCell>
                    <TableCell className="text-center text-sm font-bold" colSpan={3}>{fmtPct(totalPackingPer)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-sm font-bold" colSpan={3}>
                      إجمالي نسبة المستهلكات ({activeTab === "kitchen" ? "مطبخ" : "بار"})
                    </TableCell>
                    <TableCell className="text-center text-sm font-bold" colSpan={3}>{fmtPct(totalConsumablesPer)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {/* Cost percentage legend */}
            <div className="border-t p-3 flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1"><span className="w-4 h-3 rounded bg-emerald-500 inline-block"></span> 20% : 40%</div>
              <div className="flex items-center gap-1"><span className="w-4 h-3 rounded bg-red-500 inline-block"></span> أقل من 20%</div>
              <div className="flex items-center gap-1"><span className="w-4 h-3 rounded bg-yellow-500 inline-block"></span> أكثر من 40%</div>
            </div>
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

  return (
    <div className="space-y-6 animate-fade-in-up" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText size={24} className="text-primary" />
          التقرير النهائي
        </h1>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-muted-foreground">نسبة الضريبة:</span>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              value={taxRate}
              onChange={e => setTaxRate(parseFloat(e.target.value) || 0)}
              className="w-20 h-9 text-center text-sm"
              min={0}
              max={100}
            />
            <span className="text-sm">%</span>
          </div>
          <span className="text-sm text-muted-foreground">الفرع:</span>
          <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
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
              {periods.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer size={16} className="ml-1" /> طباعة
          </Button>
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
