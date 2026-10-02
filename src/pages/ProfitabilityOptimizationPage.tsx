import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMenuChannelPricing } from "@/hooks/useMenuChannelPricing";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { TrendingUp, Printer, AlertTriangle, CheckCircle2, Target } from "lucide-react";
import { ExportButtons } from "@/components/ExportButtons";
import { printHTML } from "@/lib/posPrintUtils";

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
  expected_sales: number;
  media: number; bills: number; salaries: number; other_expenses: number;
  maintenance: number; rent: number; default_consumables_pct: number; default_consumables_pct_bar: number;
  custom_expenses: { name: string; value: number }[];
  tax_rate: number; branch_id: string | null;
  consumables_kitchen_categories?: string[];
  consumables_bar_categories?: string[];
}

interface CostOverride {
  pos_item_id: string; side_cost: number; consumables_pct: number | null; packing_cost: number;
}

interface PackingItem { id: string; category_name: string; packing_name: string; cost: number; }
interface SideCostItem { id: string; category_name: string; cost_name: string; cost: number; }

interface ItemRow {
  id: string;
  name: string;
  category: string;
  price: number;          // effective (channel) price
  basePrice: number;
  directCost: number;
  indirectCost: number;
  totalCost: number;
  profitBefore: number;
  profitPctBefore: number;
  costPct: number;
  suggestedPrice: number;
  profitAfter: number;
  profitPctAfter: number;
  priceIncrease: number;
  belowTarget: boolean;
}

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (n: number) => n.toFixed(2) + "%";

export const ProfitabilityOptimizationPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;

  const [periods, setPeriods] = useState<CostingPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState(() => sessionStorage.getItem("menu_period") || "");
  const [rawPosItems, setRawPosItems] = useState<PosItem[]>([]);
  const [recipes, setRecipes] = useState<Map<string, number>>(new Map());
  const [costOverrides, setCostOverrides] = useState<Map<string, CostOverride>>(new Map());
  const [categoryPackingItems, setCategoryPackingItems] = useState<PackingItem[]>([]);
  const [categorySideCostItems, setCategorySideCostItems] = useState<SideCostItem[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState(() => sessionStorage.getItem("menu_branch") || "all");
  const [targetPct, setTargetPct] = useState<number>(20);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState("");

  const { channels, channelId, setChannelId, applyChannelPrices, channelLabel, customCount } = useMenuChannelPricing(companyId);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (companyId) fetchAll(); }, [companyId, selectedBranchId]);
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
    const branchFilter = selectedBranchId && selectedBranchId !== "all" ? selectedBranchId : null;
    const [periodsRes, itemsRes, recipesRes, overridesRes, branchesRes, companyRes, branchCostsRes] = await Promise.all([
      supabase.from("menu_costing_periods").select("*").eq("company_id", companyId!).order("created_at", { ascending: false }),
      supabase.from("pos_items").select("*, categories:category_id(name, menu_engineering_class)").eq("company_id", companyId!).eq("active", true),
      supabase.from("recipes").select("id, menu_item_id, recipe_ingredients(stock_item_id, qty, stock_items:stock_item_id(avg_cost, conversion_factor))").eq("company_id", companyId!),
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
      const savedPeriod = sessionStorage.getItem("menu_period");
      if (periodsRes.data.length > 0 && !selectedPeriodId) {
        const initId = savedPeriod && periodsRes.data.some((p: any) => p.id === savedPeriod) ? savedPeriod : periodsRes.data[0].id;
        setSelectedPeriodId(initId);
        sessionStorage.setItem("menu_period", initId);
      }
    }
    if (itemsRes.data) {
      const mapped = (itemsRes.data as any[]).map(item => ({
        ...item,
        category: item.categories?.name || item.category || null,
      }));
      setRawPosItems(mapped as PosItem[]);
    }
    if (branchesRes.data) setBranches(branchesRes.data as Branch[]);

    const branchCostMap = new Map<string, number>();
    ((branchCostsRes as any).data || []).forEach((bc: any) => {
      if (bc.stock_item_id && bc.avg_cost != null) branchCostMap.set(bc.stock_item_id, Number(bc.avg_cost));
    });
    const resolveCost = (stockItemId: string, globalCost: number): number => {
      if (!branchFilter) return globalCost;
      const bc = branchCostMap.get(stockItemId);
      return bc != null ? bc : globalCost;
    };

    const recipeCostMap = new Map<string, number>();
    if (recipesRes.data) {
      for (const recipe of recipesRes.data as any[]) {
        let totalCost = 0;
        for (const ing of recipe.recipe_ingredients || []) {
          const si = ing.stock_items;
          if (si) {
            const unitCost = resolveCost(ing.stock_item_id, Number(si.avg_cost || 0));
            totalCost += ing.qty * (unitCost / (si.conversion_factor || 1));
          }
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

  useEffect(() => {
    if (filteredPeriods.length > 0 && !filteredPeriods.find(p => p.id === selectedPeriodId)) {
      const newId = filteredPeriods[0].id;
      setSelectedPeriodId(newId);
      sessionStorage.setItem("menu_period", newId);
    }
  }, [filteredPeriods, selectedPeriodId]);

  const handleBranchChange = (val: string) => {
    setSelectedBranchId(val);
    sessionStorage.setItem("menu_branch", val);
    setSelectedPeriodId("");
    sessionStorage.removeItem("menu_period");
  };

  const handlePeriodChange = (val: string) => {
    setSelectedPeriodId(val);
    sessionStorage.setItem("menu_period", val);
  };

  const posItems = useMemo(
    () => applyChannelPrices(rawPosItems as any[]) as any[],
    [rawPosItems, applyChannelPrices]
  );

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

  const rows = useMemo<ItemRow[]>(() => {
    if (!selectedPeriod) return [];
    let items = posItems.filter((i: any) => i.menu_engineering_class !== "none" && i.categories?.menu_engineering_class !== "none");
    if (selectedBranchId !== "all") items = items.filter((i: any) => i.branch_id === selectedBranchId);

    const target = targetPct / 100;
    const out: ItemRow[] = [];

    for (const item of items as any[]) {
      const catName = item.category || "بدون تصنيف";
      const mainCost = recipes.get(item.id) || 0;
      const override = costOverrides.get(item.id);
      const sideCost = (override?.side_cost || 0) + getCatSideCost(catName);
      const kitchenCats = Array.isArray(selectedPeriod.consumables_kitchen_categories) ? selectedPeriod.consumables_kitchen_categories : [];
      const barCats = Array.isArray(selectedPeriod.consumables_bar_categories) ? selectedPeriod.consumables_bar_categories : [];
      const isInKitchen = kitchenCats.length === 0 || kitchenCats.includes(catName);
      const isInBar = barCats.includes(catName);
      let defaultPct = 0;
      if (isInBar) defaultPct = selectedPeriod.default_consumables_pct_bar ?? selectedPeriod.default_consumables_pct;
      else if (isInKitchen) defaultPct = selectedPeriod.default_consumables_pct;
      const consumablesPct = override?.consumables_pct ?? defaultPct;
      const consumables = (item.price * consumablesPct) / 100;
      const packingCost = getCatPackingCost(catName) + (override?.packing_cost || 0);
      const directCost = mainCost + sideCost + consumables + packingCost;
      const indirectCost = item.price * indirectCostPct;
      const totalCost = directCost + indirectCost;

      const price = Number(item.price ?? 0);
      const profitBefore = price - totalCost;
      const profitPctBefore = price > 0 ? (profitBefore / price) * 100 : 0;
      const costPct = price > 0 ? (totalCost / price) * 100 : 0;

      // Selling price = Total Cost / (1 - target profit margin)
      const suggestedPrice = target < 1 ? totalCost / (1 - target) : 0;
      const profitAfter = suggestedPrice - totalCost;
      const profitPctAfter = suggestedPrice > 0 ? (profitAfter / suggestedPrice) * 100 : 0;
      const priceIncrease = suggestedPrice - price;
      const belowTarget = profitPctBefore < targetPct;

      out.push({
        id: item.id, name: item.name, category: catName,
        price, basePrice: Number(item.base_price ?? price),
        directCost, indirectCost, totalCost,
        profitBefore, profitPctBefore, costPct,
        suggestedPrice, profitAfter, profitPctAfter, priceIncrease,
        belowTarget,
      });
    }
    out.sort((a, b) => a.profitPctBefore - b.profitPctBefore);
    return out;
  }, [posItems, selectedPeriod, selectedBranchId, recipes, costOverrides, indirectCostPct, categoryPackingItems, categorySideCostItems, targetPct]);

  const visibleRows = useMemo(() => (showAll ? rows : rows.filter(r => r.belowTarget)), [rows, showAll]);

  const kpis = useMemo(() => {
    const below = rows.filter(r => r.belowTarget);
    const avgProfit = rows.length > 0 ? rows.reduce((s, r) => s + r.profitPctBefore, 0) / rows.length : 0;
    const potentialGain = below.reduce((s, r) => s + Math.max(0, r.priceIncrease), 0);
    return { total: rows.length, belowCount: below.length, avgProfit, potentialGain };
  }, [rows]);

  const branchName = selectedBranchId === "all" ? "كل الفروع" : branches.find(b => b.id === selectedBranchId)?.name || "";
  const reportTitle = `تحسين ربحية الأصناف - ${branchName} - ${channelLabel}`;

  const exportColumns = [
    { key: "name", label: "الصنف" },
    { key: "category", label: "التصنيف" },
    { key: "price", label: "السعر الحالي" },
    { key: "totalCost", label: "إجمالي التكلفة" },
    { key: "costPct", label: "نسبة التكلفة %" },
    { key: "profitBefore", label: "صافي الربح قبل" },
    { key: "profitPctBefore", label: "نسبة الربح قبل %" },
    { key: "suggestedPrice", label: "السعر المقترح" },
    { key: "priceIncrease", label: "الزيادة المطلوبة" },
    { key: "profitAfter", label: "صافي الربح بعد" },
    { key: "profitPctAfter", label: "نسبة الربح بعد %" },
  ];

  const exportData = visibleRows.map(r => ({
    name: r.name, category: r.category,
    price: fmt(r.price), totalCost: fmt(r.totalCost), costPct: fmtPct(r.costPct),
    profitBefore: fmt(r.profitBefore), profitPctBefore: fmtPct(r.profitPctBefore),
    suggestedPrice: fmt(r.suggestedPrice), priceIncrease: fmt(r.priceIncrease),
    profitAfter: fmt(r.profitAfter), profitPctAfter: fmtPct(r.profitPctAfter),
  }));

  const handlePrint = () => {
    const rowsHtml = visibleRows.map((r, i) => `
      <tr class="${r.belowTarget ? "below" : ""}">
        <td>${i + 1}</td>
        <td style="text-align:right">${r.name}</td>
        <td>${r.category}</td>
        <td>${fmt(r.price)}</td>
        <td>${fmt(r.totalCost)}</td>
        <td>${fmtPct(r.costPct)}</td>
        <td class="${r.profitBefore < 0 ? "neg" : ""}">${fmt(r.profitBefore)}</td>
        <td class="${r.profitPctBefore < targetPct ? "neg" : "pos"}">${fmtPct(r.profitPctBefore)}</td>
        <td class="suggested">${fmt(r.suggestedPrice)}</td>
        <td>${fmt(r.priceIncrease)}</td>
        <td class="pos">${fmt(r.profitAfter)}</td>
        <td class="pos">${fmtPct(r.profitPctAfter)}</td>
      </tr>`).join("");

    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${reportTitle}</title>
      <style>
        body{font-family:'Segoe UI',Tahoma,sans-serif;padding:20px;color:#111}
        h1{font-size:20px;text-align:center;margin-bottom:4px}
        .sub{text-align:center;color:#555;font-size:12px;margin-bottom:16px}
        .formula{background:#f0f7ff;border:1px solid #bcd7f5;border-radius:8px;padding:10px 14px;font-size:13px;margin-bottom:16px;text-align:center}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th,td{border:1px solid #ccc;padding:5px 6px;text-align:center}
        th{background:#1e3a5f;color:#fff}
        tr.below td{background:#fff5f5}
        .neg{color:#dc2626;font-weight:bold}
        .pos{color:#059669;font-weight:bold}
        .suggested{background:#ecfdf5;font-weight:bold;color:#065f46}
        .footer{margin-top:14px;font-size:11px;color:#666;text-align:center}
        @media print{body{padding:0}}
      </style></head><body>
      <h1>${companyName} — ${reportTitle}</h1>
      <div class="sub">الفترة: ${selectedPeriod?.name || "-"} | نسبة الربح المستهدفة: ${targetPct}% | ${showAll ? "كل الأصناف" : "الأصناف أقل من المستهدف فقط"}</div>
      <div class="formula">سعر البيع المقترح = إجمالي التكلفة ÷ (1 - نسبة الربح المستهدفة ${targetPct}%)</div>
      <table><thead><tr>
        <th>#</th><th>الصنف</th><th>التصنيف</th><th>السعر الحالي</th><th>إجمالي التكلفة</th><th>نسبة التكلفة</th>
        <th>صافي الربح قبل</th><th>نسبة الربح قبل</th><th>السعر المقترح</th><th>الزيادة المطلوبة</th><th>صافي الربح بعد</th><th>نسبة الربح بعد</th>
      </tr></thead><tbody>${rowsHtml}</tbody></table>
      <div class="footer">عدد الأصناف المعروضة: ${visibleRows.length} من ${rows.length} — أصناف تحت المستهدف: ${kpis.belowCount}</div>
      </body></html>`;
    printHTML(html);
  };

  if (loading) return <div className="p-6 text-center text-muted-foreground">جاري التحميل...</div>;

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="text-primary" size={26} />
          <div>
            <h1 className="text-xl font-bold">تحسين ربحية الأصناف</h1>
            <p className="text-xs text-muted-foreground">دراسة سعر البيع المطلوب لتحقيق نسبة الربح المستهدفة لكل صنف</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrint} disabled={visibleRows.length === 0}>
            <Printer size={14} /> طباعة
          </Button>
          <ExportButtons
            data={exportData}
            columns={exportColumns}
            filename="profitability-optimization"
            title={reportTitle}
            filters={[
              { label: "الفترة", value: selectedPeriod?.name || "-" },
              { label: "الفرع", value: branchName },
              { label: "القناة", value: channelLabel },
              { label: "نسبة الربح المستهدفة", value: `${targetPct}%` },
            ]}
          />
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label className="text-xs">قناة البيع</Label>
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="base">السعر الأساسي</SelectItem>
                {channels.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}{c.markup_percent ? ` (+${c.markup_percent}%)` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">الفرع</Label>
            <Select value={selectedBranchId} onValueChange={handleBranchChange}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الفروع</SelectItem>
                {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">الفترة</Label>
            <Select value={selectedPeriodId} onValueChange={handlePeriodChange}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {filteredPeriods.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">نسبة الربح المستهدفة %</Label>
            <Input
              type="number" inputMode="decimal" min={1} max={95}
              className="w-[110px]"
              value={targetPct}
              onChange={e => setTargetPct(Math.min(95, Math.max(1, Number(e.target.value) || 20)))}
            />
          </div>
          <div className="flex items-center gap-2 pb-1">
            <Switch id="show-all" checked={showAll} onCheckedChange={setShowAll} />
            <Label htmlFor="show-all" className="text-xs cursor-pointer">عرض كل الأصناف</Label>
          </div>
          {channelId !== "base" && (
            <Badge variant="secondary" className="text-xs">أسعار {channelLabel} • {customCount} سعر خاص</Badge>
          )}
        </CardContent>
      </Card>

      {/* Formula box */}
      <div className="border rounded-lg bg-primary/5 p-3 text-center text-sm">
        <Target size={14} className="inline-block ml-1 text-primary" />
        سعر البيع المقترح = إجمالي التكلفة ÷ (1 - نسبة الربح المستهدفة {targetPct}%)
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 text-center">
          <div className="text-2xl font-bold">{kpis.total}</div>
          <div className="text-xs text-muted-foreground">إجمالي الأصناف</div>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <div className="text-2xl font-bold text-red-500 flex items-center justify-center gap-1">
            <AlertTriangle size={18} /> {kpis.belowCount}
          </div>
          <div className="text-xs text-muted-foreground">أصناف أقل من {targetPct}%</div>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <div className={`text-2xl font-bold ${kpis.avgProfit < targetPct ? "text-red-500" : "text-emerald-600"}`}>{fmtPct(kpis.avgProfit)}</div>
          <div className="text-xs text-muted-foreground">متوسط نسبة الربح الحالية</div>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <div className="text-2xl font-bold text-emerald-600 flex items-center justify-center gap-1">
            <CheckCircle2 size={18} /> {fmt(kpis.potentialGain)}
          </div>
          <div className="text-xs text-muted-foreground">إجمالي الزيادة المقترحة (للصنف الواحد)</div>
        </CardContent></Card>
      </div>

      {/* Table */}
      <div className="border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-primary/10">
              <TableHead className="text-center font-bold">#</TableHead>
              <TableHead className="text-center font-bold">الصنف</TableHead>
              <TableHead className="text-center font-bold">التصنيف</TableHead>
              <TableHead className="text-center font-bold">السعر الحالي</TableHead>
              <TableHead className="text-center font-bold">إجمالي التكلفة</TableHead>
              <TableHead className="text-center font-bold">نسبة التكلفة</TableHead>
              <TableHead className="text-center font-bold">صافي الربح قبل</TableHead>
              <TableHead className="text-center font-bold">نسبة الربح قبل</TableHead>
              <TableHead className="text-center font-bold">السعر المقترح</TableHead>
              <TableHead className="text-center font-bold">الزيادة المطلوبة</TableHead>
              <TableHead className="text-center font-bold">صافي الربح بعد</TableHead>
              <TableHead className="text-center font-bold">نسبة الربح بعد</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.length === 0 && (
              <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                {rows.length === 0 ? "لا توجد أصناف" : "كل الأصناف تحقق نسبة الربح المستهدفة 🎉"}
              </TableCell></TableRow>
            )}
            {visibleRows.map((r, i) => (
              <TableRow key={r.id} className={r.belowTarget ? "bg-red-500/5" : ""}>
                <TableCell className="text-center text-xs">{i + 1}</TableCell>
                <TableCell className="text-sm font-semibold">{r.name}</TableCell>
                <TableCell className="text-center text-xs">{r.category}</TableCell>
                <TableCell className="text-center text-sm">
                  {fmt(r.price)}
                  {channelId !== "base" && r.basePrice !== r.price && (
                    <div className="text-[10px] text-muted-foreground line-through">{fmt(r.basePrice)}</div>
                  )}
                </TableCell>
                <TableCell className="text-center text-sm">{fmt(r.totalCost)}</TableCell>
                <TableCell className="text-center text-sm">{fmtPct(r.costPct)}</TableCell>
                <TableCell className={`text-center text-sm font-semibold ${r.profitBefore < 0 ? "text-red-500" : ""}`}>{fmt(r.profitBefore)}</TableCell>
                <TableCell className="text-center text-sm">
                  <span className={`px-2 py-0.5 rounded text-xs text-white ${r.profitPctBefore < targetPct ? "bg-red-500" : "bg-emerald-500"}`}>
                    {fmtPct(r.profitPctBefore)}
                  </span>
                </TableCell>
                <TableCell className="text-center text-sm font-bold text-emerald-700 bg-emerald-500/10">{fmt(r.suggestedPrice)}</TableCell>
                <TableCell className="text-center text-sm font-semibold">{fmt(r.priceIncrease)}</TableCell>
                <TableCell className="text-center text-sm font-semibold text-emerald-600">{fmt(r.profitAfter)}</TableCell>
                <TableCell className="text-center text-sm">
                  <span className="px-2 py-0.5 rounded text-xs text-white bg-emerald-500">{fmtPct(r.profitPctAfter)}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default ProfitabilityOptimizationPage;
