import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Plus, Edit2, Trash2, TrendingUp, DollarSign, Percent, Target, Building2, Zap, Users, Megaphone, Wrench, MoreHorizontal, Calendar as CalendarIcon, X, Printer, FileSpreadsheet, Loader2, GitCompareArrows } from "lucide-react";
import { PeriodComparisonDialog } from "@/components/menu-analysis/PeriodComparisonDialog";
import { exportToExcel, exportToPDF } from "@/lib/exportUtils";
import { FileText, Lightbulb, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { toast as sonnerToast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";

interface CustomExpense {
  name: string;
  value: number;
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
  tax_rate: number;
  status: string;
  created_at: string;
  custom_expenses: CustomExpense[];
  branch_id: string | null;
  consumables_kitchen_categories: string[];
  consumables_bar_categories: string[];
  venue_type: string;
}

const emptyForm = {
  name: "",
  start_date: undefined as Date | undefined,
  end_date: undefined as Date | undefined,
  expected_sales: 0,
  capacity: 0,
  turn_over: 0,
  avg_check: 0,
  media: 0,
  bills: 0,
  salaries: 0,
  other_expenses: 0,
  maintenance: 0,
  rent: 0,
  default_consumables_pct: 1,
  default_consumables_pct_bar: 1,
  default_packing_cost: 0,
  tax_rate: 0,
  custom_expenses: [] as CustomExpense[],
  branch_id: "" as string,
  consumables_kitchen_categories: [] as string[],
  consumables_bar_categories: [] as string[],
  venue_type: "صالة" as "صالة" | "تيك اواي",
};

const getDaysInPeriod = (start: string, end: string) => {
  const s = new Date(start);
  const e = new Date(end);
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1);
};

interface CostOverride {
  pos_item_id: string; side_cost: number; consumables_pct: number | null; packing_cost: number;
}

export const IndirectExpensesPage: React.FC = () => {
  const { auth } = useAuth();
  const [periods, setPeriods] = useState<CostingPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedPeriod, setSelectedPeriodRaw] = useState<CostingPeriod | null>(null);
  const [newCustomName, setNewCustomName] = useState("");
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [selectedBranchId, setSelectedBranchIdRaw] = useState<string>(() => sessionStorage.getItem("menu_branch") || "all");

  const setSelectedPeriod = (p: CostingPeriod | null) => {
    setSelectedPeriodRaw(p);
    if (p) sessionStorage.setItem("menu_period", p.id);
    else sessionStorage.removeItem("menu_period");
  };
  const setSelectedBranchId = (v: string) => {
    setSelectedBranchIdRaw(v);
    sessionStorage.setItem("menu_branch", v);
  };
  const [posItems, setPosItems] = useState<any[]>([]);
  const [recipeCosts, setRecipeCosts] = useState<Map<string, number>>(new Map());
  const [costOverrides, setCostOverrides] = useState<Map<string, CostOverride>>(new Map());
  const [categoryPackingItems, setCategoryPackingItems] = useState<any[]>([]);
  const [categorySideCostItems, setCategorySideCostItems] = useState<any[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [categoryClassMap, setCategoryClassMap] = useState<Map<string, string | null>>(new Map());
  const [costScope, setCostScope] = useState<"all" | "kitchen" | "bar">("all");
  const [excelLoading, setExcelLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [efficiencyPeriodAId, setEfficiencyPeriodAId] = useState<string>("");
  const [efficiencyPeriodBId, setEfficiencyPeriodBId] = useState<string>("");

  const companyId = auth.profile?.company_id;

  const fetchPeriods = async () => {
    if (!companyId) return;
    const { data, error } = await supabase
      .from("menu_costing_periods")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    if (!error && data) {
      const mapped = data.map((d: any) => ({
        ...d,
        custom_expenses: Array.isArray(d.custom_expenses) ? d.custom_expenses : [],
        consumables_kitchen_categories: Array.isArray(d.consumables_kitchen_categories) ? d.consumables_kitchen_categories : [],
        consumables_bar_categories: Array.isArray(d.consumables_bar_categories) ? d.consumables_bar_categories : [],
      })) as CostingPeriod[];
      setPeriods(mapped);
      const savedId = sessionStorage.getItem("menu_period");
      if (selectedPeriod) {
        const updated = mapped.find(m => m.id === selectedPeriod.id);
        if (updated) setSelectedPeriod(updated);
        else if (mapped.length > 0) setSelectedPeriod(mapped[0]);
      } else if (savedId) {
        const saved = mapped.find(m => m.id === savedId);
        setSelectedPeriod(saved || mapped[0]);
      } else if (mapped.length > 0) {
        setSelectedPeriod(mapped[0]);
      }
    }
    setLoading(false);
  };

  const fetchCostData = async () => {
    if (!companyId) return;
    const branchFilter = selectedBranchId !== "all" ? selectedBranchId : null;
    const [itemsRes, recipesRes, overridesRes, catsRes, branchCostsRes] = await Promise.all([
      supabase.from("pos_items").select("*, categories:category_id(name, menu_engineering_class)").eq("company_id", companyId).eq("active", true),
      supabase.from("recipes").select("id, menu_item_id, recipe_ingredients(stock_item_id, qty, stock_items:stock_item_id(avg_cost, conversion_factor))").eq("company_id", companyId),
      supabase.from("pos_item_cost_settings").select("*").eq("company_id", companyId),
      supabase.from("categories").select("name, branch_id, menu_engineering_class").eq("company_id", companyId).eq("active", true),
      branchFilter
        ? supabase.from("stock_item_branch_costs").select("stock_item_id, avg_cost").eq("company_id", companyId).eq("branch_id", branchFilter)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    if (catsRes.data) {
      const map = new Map<string, string | null>();
      for (const c of catsRes.data as any[]) {
        // Key by branch+name so the same category name in different branches doesn't overwrite each other
        map.set(`${c.branch_id || ""}::${c.name}`, c.menu_engineering_class || null);
      }
      setCategoryClassMap(map);
    }
    if (itemsRes.data) {
      setPosItems((itemsRes.data as any[]).map(item => ({ ...item, category: item.categories?.name || item.category || null })));
    }

    // Build per-branch cost map (fallback to global avg_cost) — matches MenuAnalysisPage logic
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
    setRecipeCosts(recipeCostMap);
    const overrideMap = new Map<string, CostOverride>();
    if (overridesRes.data) for (const o of overridesRes.data as any[]) overrideMap.set(o.pos_item_id, o as CostOverride);
    setCostOverrides(overrideMap);
  };

  const fetchPackingSideCosts = async () => {
    if (!companyId || !selectedPeriod) return;
    const [packRes, sideRes] = await Promise.all([
      supabase.from("category_packing_items").select("*").eq("company_id", companyId).eq("period_id", selectedPeriod.id),
      supabase.from("category_side_costs" as any).select("*").eq("company_id", companyId).eq("period_id", selectedPeriod.id),
    ]);
    if (packRes.data) setCategoryPackingItems(packRes.data);
    if (sideRes.data) setCategorySideCostItems(sideRes.data as any[]);
  };

  useEffect(() => {
    if (!companyId) return;
    const loadAll = async () => {
      const [branchesRes, companyRes] = await Promise.all([
        supabase.from("branches").select("id, name").eq("company_id", companyId).eq("active", true),
        supabase.from("companies").select("name").eq("id", companyId!).single(),
      ]);
      if (branchesRes.data) setBranches(branchesRes.data);
      if (companyRes.data) setCompanyName(companyRes.data.name);
      await fetchCostData();
    };
    fetchPeriods();
    loadAll();
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    fetchCostData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId, companyId]);

  useEffect(() => {
    fetchPackingSideCosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod?.id, companyId]);





  const totalIndirectCost = (p: CostingPeriod) => {
    const base = p.media + p.bills + p.salaries + p.other_expenses + p.maintenance + p.rent;
    const customTotal = (p.custom_expenses || []).reduce((sum, c) => sum + c.value, 0);
    return base + customTotal;
  };

  const expectedDailySales = (p: CostingPeriod) => {
    const isTakeaway = (p as any).venue_type === "تيك اواي";
    if (isTakeaway) return p.capacity * p.avg_check; // capacity = عدد الطلبات اليومي
    return p.capacity * p.turn_over * p.avg_check;
  };

  const monthlyExpectedSales = (p: CostingPeriod) => {
    const days = getDaysInPeriod(p.start_date, p.end_date);
    return expectedDailySales(p) * days;
  };

  const indirectCostPct = (p: CostingPeriod) => {
    const monthly = monthlyExpectedSales(p);
    return monthly > 0 ? (totalIndirectCost(p) / monthly) * 100 : 0;
  };

  const breakEvenPoint = (p: CostingPeriod) => {
    const denominator = 1 - (avgDirectCostPct / 100);
    if (denominator <= 0) return 0;
    const start = new Date(p.start_date);
    const end = new Date(p.end_date);
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    return (totalIndirectCost(p) / days) / denominator;
  };

  const handleAddCustomExpense = () => {
    if (!newCustomName.trim()) return;
    setForm({
      ...form,
      custom_expenses: [...form.custom_expenses, { name: newCustomName.trim(), value: 0 }],
    });
    setNewCustomName("");
  };

  const handleRemoveCustomExpense = (index: number) => {
    setForm({
      ...form,
      custom_expenses: form.custom_expenses.filter((_, i) => i !== index),
    });
  };

  const handleCustomExpenseChange = (index: number, value: number) => {
    const updated = [...form.custom_expenses];
    updated[index] = { ...updated[index], value };
    setForm({ ...form, custom_expenses: updated });
  };

  const handleSave = async () => {
    if (!companyId || !form.name || !form.start_date || !form.end_date) {
      toast({ title: "خطأ", description: "يرجى ملء جميع الحقول المطلوبة", variant: "destructive" });
      return;
    }

    const isTakeaway = form.venue_type === "تيك اواي";
    const effectiveTurnOver = isTakeaway ? 1 : form.turn_over;
    const expSales = isTakeaway
      ? form.capacity * form.avg_check
      : form.capacity * form.turn_over * form.avg_check;

    const payload = {
      company_id: companyId,
      name: form.name,
      start_date: format(form.start_date, "yyyy-MM-dd"),
      end_date: format(form.end_date, "yyyy-MM-dd"),
      expected_sales: expSales,
      capacity: form.capacity,
      turn_over: effectiveTurnOver,
      avg_check: form.avg_check,
      media: form.media,
      bills: form.bills,
      salaries: form.salaries,
      other_expenses: form.other_expenses,
      maintenance: form.maintenance,
      rent: form.rent,
      default_consumables_pct: form.default_consumables_pct,
      default_consumables_pct_bar: form.default_consumables_pct_bar,
      default_packing_cost: form.default_packing_cost,
      tax_rate: form.tax_rate,
      custom_expenses: form.custom_expenses as any,
      branch_id: form.branch_id || null,
      consumables_kitchen_categories: form.consumables_kitchen_categories as any,
      consumables_bar_categories: form.consumables_bar_categories as any,
      venue_type: form.venue_type,
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from("menu_costing_periods").update(payload).eq("id", editingId));
    } else {
      ({ error } = await supabase.from("menu_costing_periods").insert(payload));
    }

    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "تم", description: editingId ? "تم تحديث الفترة" : "تم إضافة الفترة" });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      fetchPeriods();
    }
  };

  const handleEdit = (p: CostingPeriod) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      start_date: new Date(p.start_date),
      end_date: new Date(p.end_date),
      expected_sales: p.expected_sales,
      capacity: p.capacity,
      turn_over: p.turn_over,
      avg_check: p.avg_check,
      media: p.media,
      bills: p.bills,
      salaries: p.salaries,
      other_expenses: p.other_expenses,
      maintenance: p.maintenance,
      rent: p.rent,
      default_consumables_pct: p.default_consumables_pct,
      default_consumables_pct_bar: (p as any).default_consumables_pct_bar ?? 1,
      default_packing_cost: p.default_packing_cost,
      tax_rate: (p as any).tax_rate || 0,
      custom_expenses: p.custom_expenses || [],
      branch_id: p.branch_id || "",
      consumables_kitchen_categories: Array.isArray((p as any).consumables_kitchen_categories) ? (p as any).consumables_kitchen_categories : [],
      consumables_bar_categories: Array.isArray((p as any).consumables_bar_categories) ? (p as any).consumables_bar_categories : [],
      venue_type: ((p as any).venue_type === "تيك اواي" ? "تيك اواي" : "صالة") as "صالة" | "تيك اواي",
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("menu_costing_periods").delete().eq("id", id);
    if (!error) {
      toast({ title: "تم", description: "تم حذف الفترة" });
      if (selectedPeriod?.id === id) setSelectedPeriod(null);
      fetchPeriods();
    }
  };

  const getExpenseItems = (p: CostingPeriod) => {
    const items = [
      { label: "الإيجار", value: p.rent, icon: Building2, color: "text-blue-500" },
      { label: "المرتبات", value: p.salaries, icon: Users, color: "text-emerald-500" },
      { label: "الفواتير", value: p.bills, icon: Zap, color: "text-yellow-500" },
      { label: "الميديا والتسويق", value: p.media, icon: Megaphone, color: "text-purple-500" },
      { label: "الصيانة", value: p.maintenance, icon: Wrench, color: "text-orange-500" },
      { label: "أخرى", value: p.other_expenses, icon: MoreHorizontal, color: "text-muted-foreground" },
    ];
    (p.custom_expenses || []).forEach((c) => {
      items.push({ label: c.name, value: c.value, icon: MoreHorizontal, color: "text-cyan-500" });
    });
    return items;
  };

  const expenseItems = selectedPeriod ? getExpenseItems(selectedPeriod) : [];
  const total = selectedPeriod ? totalIndirectCost(selectedPeriod) : 0;
  const monthSales = selectedPeriod ? monthlyExpectedSales(selectedPeriod) : 0;

  // Calculate totals for direct cost and selling price (matching MenuAnalysisPage logic)
  const { totalSellingPrice, totalDirectCostSum, avgDirectCostPct } = (() => {
    if (!selectedPeriod || posItems.length === 0) return { totalSellingPrice: 0, totalDirectCostSum: 0, avgDirectCostPct: 0 };
    let items = selectedBranchId !== "all" 
      ? posItems.filter(i => i.branch_id === selectedBranchId) 
      : posItems;

    // Match MenuAnalysisPage logic: exclude items classified as "none"
    items = items.filter((i: any) => i.menu_engineering_class !== "none" && i.categories?.menu_engineering_class !== "none");

    // Filter by cost scope using item's own menu_engineering_class (matches MenuAnalysisPage)
    if (costScope === "kitchen") {
      items = items.filter((i: any) => !i.menu_engineering_class || i.menu_engineering_class.toLowerCase() === "kitchen");
    } else if (costScope === "bar") {
      items = items.filter((i: any) => i.menu_engineering_class?.toLowerCase() === "bar");
    }
    
    let totalPrice = 0;
    let totalDirectCost = 0;
    const getCatPackingCost = (catName: string) => categoryPackingItems.filter((p: any) => p.category_name === catName).reduce((s: number, p: any) => s + p.cost, 0);
    const getCatSideCost = (catName: string) => categorySideCostItems.filter((p: any) => p.category_name === catName).reduce((s: number, p: any) => s + p.cost, 0);

    for (const item of items) {
      const catName = item.category || "بدون تصنيف";
      const mainCost = recipeCosts.get(item.id) || 0;
      const override = costOverrides.get(item.id);
      const sideCost = (override?.side_cost || 0) + getCatSideCost(catName);
      const kitchenCats = Array.isArray((selectedPeriod as any).consumables_kitchen_categories) ? (selectedPeriod as any).consumables_kitchen_categories : [];
      const barCats = Array.isArray((selectedPeriod as any).consumables_bar_categories) ? (selectedPeriod as any).consumables_bar_categories : [];
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

      totalPrice += item.price;
      totalDirectCost += finalDirectCost;
    }
    const pct = totalPrice > 0 ? (totalDirectCost / totalPrice) * 100 : 0;
    return { totalSellingPrice: totalPrice, totalDirectCostSum: totalDirectCost, avgDirectCostPct: pct };
  })();

  const indirectPctValue = selectedPeriod ? indirectCostPct(selectedPeriod) : 0;
  const netProfitPct = 100 - indirectPctValue - avgDirectCostPct;

  // ─── Executive Summary & Recommendations ──────────────────────────
  const summaryData = (() => {
    if (!selectedPeriod) return null;
    const expItems = getExpenseItems(selectedPeriod);
    const topExpense = [...expItems].sort((a, b) => b.value - a.value)[0];
    const topExpensePct = topExpense && monthSales > 0 ? (topExpense.value / monthSales * 100) : 0;
    const rentPct = monthSales > 0 ? (selectedPeriod.rent / monthSales * 100) : 0;
    const salariesPct = monthSales > 0 ? (selectedPeriod.salaries / monthSales * 100) : 0;
    const bep = breakEvenPoint(selectedPeriod);
    const dailySales = expectedDailySales(selectedPeriod);
    const bepCoverage = dailySales > 0 ? (bep / dailySales * 100) : 0;

    const recommendations: { type: "success" | "warning" | "danger" | "info"; text: string }[] = [];

    if (netProfitPct < 0) recommendations.push({ type: "danger", text: `الربح الصافي سالب (${netProfitPct.toFixed(1)}%) — المنشأة تعمل بخسارة. يجب مراجعة الأسعار أو تقليل المصاريف فوراً.` });
    else if (netProfitPct < 10) recommendations.push({ type: "warning", text: `هامش الربح منخفض (${netProfitPct.toFixed(1)}%) — حاول رفع الأسعار أو تقليل التكاليف للوصول لـ 15% على الأقل.` });
    else if (netProfitPct < 20) recommendations.push({ type: "info", text: `هامش الربح مقبول (${netProfitPct.toFixed(1)}%) — هناك مجال للتحسين للوصول للنطاق الصحي (20%+).` });
    else recommendations.push({ type: "success", text: `هامش ربح ممتاز (${netProfitPct.toFixed(1)}%) — استمر في هذا الأداء.` });

    if (avgDirectCostPct > 40) recommendations.push({ type: "warning", text: `تكلفة الأصناف المباشرة مرتفعة (${avgDirectCostPct.toFixed(1)}%) — راجع أسعار البيع أو تكاليف المكونات.` });
    if (indirectPctValue > 40) recommendations.push({ type: "warning", text: `نسبة المصاريف الغير مباشرة مرتفعة (${indirectPctValue.toFixed(1)}%) — راجع البنود الأكبر.` });
    if (rentPct > 12) recommendations.push({ type: "warning", text: `الإيجار يمثل ${rentPct.toFixed(1)}% من المبيعات (المُوصى به أقل من 10%).` });
    if (salariesPct > 30) recommendations.push({ type: "warning", text: `المرتبات تمثل ${salariesPct.toFixed(1)}% من المبيعات (المُوصى به أقل من 25%).` });
    if (bepCoverage > 90) recommendations.push({ type: "danger", text: `نقطة التعادل تستهلك ${bepCoverage.toFixed(1)}% من مبيعاتك اليومية — هامش الأمان ضعيف جداً.` });
    else if (bepCoverage > 70) recommendations.push({ type: "warning", text: `نقطة التعادل تستهلك ${bepCoverage.toFixed(1)}% من مبيعاتك اليومية — هامش الأمان منخفض.` });
    if (topExpense && topExpensePct > 25) recommendations.push({ type: "info", text: `أكبر بند مصروفات: "${topExpense.label}" يمثل ${topExpensePct.toFixed(1)}% من المبيعات.` });

    return { topExpense, topExpensePct, rentPct, salariesPct, bep, dailySales, bepCoverage, recommendations };
  })();

  // ─── Shared exporter rows ─────────────────────────────────────────
  const buildExportRows = () => {
    if (!selectedPeriod) return [] as Record<string, any>[];
    const expItems = getExpenseItems(selectedPeriod);
    const rows: Record<string, any>[] = [];
    rows.push({ __rowType: "group-total", label: "المؤشرات الرئيسية", value: "", pct: "" });
    rows.push({ label: "المبيعات الشهرية المتوقعة", value: monthSales.toLocaleString(), pct: "" });
    rows.push({ label: "إجمالي المصاريف الغير مباشرة", value: total.toLocaleString(), pct: monthSales > 0 ? `${(total / monthSales * 100).toFixed(2)}%` : "0%" });
    rows.push({ label: "نقطة التعادل اليومية", value: breakEvenPoint(selectedPeriod).toLocaleString(undefined, { maximumFractionDigits: 2 }), pct: "" });
    rows.push({ __rowType: "group-total", label: "جدول الربحية", value: "", pct: "" });
    rows.push({ label: "Indirect Cost Per.", value: `${indirectPctValue.toFixed(2)}%`, pct: "" });
    rows.push({ label: "Avg Direct Cost Per.", value: `${avgDirectCostPct.toFixed(2)}%`, pct: "" });
    rows.push({ label: "Net Profit Per.", value: `${netProfitPct.toFixed(2)}%`, pct: "" });
    rows.push({ label: "Break-Even Point (Daily)", value: breakEvenPoint(selectedPeriod).toLocaleString(undefined, { maximumFractionDigits: 2 }), pct: "" });
    rows.push({ __rowType: "group-total", label: "توزيع المصاريف", value: "", pct: "" });
    for (const item of expItems) {
      const pct = monthSales > 0 ? (item.value / monthSales * 100) : 0;
      rows.push({ label: item.label, value: item.value.toLocaleString(), pct: `${pct.toFixed(2)}%` });
    }
    rows.push({ __rowType: "grand-total", label: "الإجمالي", value: total.toLocaleString(), pct: monthSales > 0 ? `${(total / monthSales * 100).toFixed(2)}%` : "0%" });
    rows.push({ __rowType: "group-total", label: "بيانات التشغيل", value: "", pct: "" });
    const isTakeawayX = (selectedPeriod as any).venue_type === "تيك اواي";
    rows.push({ label: "نوع المكان", value: isTakeawayX ? "تيك اواي" : "صالة", pct: "" });
    if (isTakeawayX) {
      rows.push({ label: "عدد الطلبات اليومي (عدد الزوار)", value: String(selectedPeriod.capacity), pct: "" });
    } else {
      rows.push({ label: "السعة (عدد الكراسي)", value: String(selectedPeriod.capacity), pct: "" });
      rows.push({ label: "معدل الدوران", value: String(selectedPeriod.turn_over), pct: "" });
    }
    rows.push({ label: "متوسط الفاتورة", value: selectedPeriod.avg_check.toLocaleString(), pct: "" });
    rows.push({ label: "المبيعات اليومية المتوقعة", value: expectedDailySales(selectedPeriod).toLocaleString(), pct: "" });
    rows.push({ label: "المبيعات الشهرية المتوقعة", value: monthSales.toLocaleString(), pct: "" });
    if (summaryData && summaryData.recommendations.length > 0) {
      rows.push({ __rowType: "group-total", label: "الملخص والتوصيات", value: "", pct: "" });
      summaryData.recommendations.forEach((r, idx) => {
        const prefix = r.type === "danger" ? "⚠️ تحذير" : r.type === "warning" ? "⚠️ انتباه" : r.type === "success" ? "✅ ممتاز" : "💡 معلومة";
        rows.push({ label: `${idx + 1}. ${prefix}`, value: r.text, pct: "" });
      });
    }
    return rows;
  };

  const handleExcelExport = async () => {
    if (!selectedPeriod) return;
    setExcelLoading(true);
    try {
      const branchName = selectedBranchId !== "all" ? branches.find(b => b.id === selectedBranchId)?.name : "كل الفروع";
      const periodBranchName = selectedPeriod.branch_id ? branches.find(b => b.id === selectedPeriod.branch_id)?.name : null;
      await exportToExcel({
        title: `تحليل المصاريف الغير مباشرة - ${periodBranchName || branchName} - ${selectedPeriod.name}`,
        filename: `indirect-expenses-${selectedPeriod.name}`,
        columns: [
          { key: "label", label: "البند" },
          { key: "value", label: "القيمة" },
          { key: "pct", label: "النسبة من المبيعات" },
        ],
        data: buildExportRows(),
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
    if (!selectedPeriod) return;
    setPdfLoading(true);
    try {
      const branchName = selectedBranchId !== "all" ? branches.find(b => b.id === selectedBranchId)?.name : "كل الفروع";
      const periodBranchName = selectedPeriod.branch_id ? branches.find(b => b.id === selectedPeriod.branch_id)?.name : null;
      await exportToPDF({
        title: `تحليل المصاريف الغير مباشرة - ${periodBranchName || branchName} - ${selectedPeriod.name}`,
        filename: `indirect-expenses-${selectedPeriod.name}`,
        columns: [
          { key: "label", label: "البند" },
          { key: "value", label: "القيمة" },
          { key: "pct", label: "النسبة من المبيعات" },
        ],
        data: buildExportRows(),
      });
      sonnerToast.success("تم تصدير PDF بنجاح");
    } catch (err) {
      console.error(err);
      sonnerToast.error("حدث خطأ أثناء التصدير");
    } finally {
      setPdfLoading(false);
    }
  };

  const handlePrint = () => {
    if (!selectedPeriod) return;
    const dateStr = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
    const logoSrc = `${window.location.origin}/logo.png`;
    const expItems = getExpenseItems(selectedPeriod);
    
    const branchName = selectedBranchId !== "all" ? branches.find(b => b.id === selectedBranchId)?.name : "كل الفروع";
    const periodBranchName = selectedPeriod.branch_id ? branches.find(b => b.id === selectedPeriod.branch_id)?.name : null;

    let expenseRowsHTML = "";
    for (const item of expItems) {
      const pct = monthSales > 0 ? (item.value / monthSales * 100) : 0;
      expenseRowsHTML += `<tr><td>${item.label}</td><td style="font-weight:bold">${item.value.toLocaleString()}</td><td>${pct.toFixed(2)}%</td></tr>`;
    }
    expenseRowsHTML += `<tr style="font-weight:bold;background:#eee;"><td>الإجمالي</td><td>${total.toLocaleString()}</td><td>${monthSales > 0 ? (total / monthSales * 100).toFixed(2) : 0}%</td></tr>`;

    const printHTML = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>تحليل المصاريف الغير مباشرة</title>
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
      table { width:100%; border-collapse:collapse; margin-bottom:15px; }
      th, td { border:1px solid #000; padding:6px 10px; text-align:center; font-size:11px; }
      th { background:#eee; font-weight:bold; }
      h3 { font-size:13px; font-weight:bold; margin:15px 0 5px; border-bottom:1px solid #ccc; padding-bottom:3px; }
      .footer { text-align:center; margin-top:12px; font-size:8px; border-top:1px solid #000; padding-top:5px; }
    </style></head><body>
    <div class="header">
      <div class="header-top"><img src="${logoSrc}" alt="Logo" class="logo"/><div><div class="company-name">${companyName}</div><h1>تحليل المصاريف الغير مباشرة</h1></div></div>
      <div class="sub-info"><span>الفرع: ${periodBranchName || branchName || "كل الفروع"}</span><span>الفترة: ${selectedPeriod.name}</span><span>${dateStr}</span></div>
    </div>

    <h3>المؤشرات الرئيسية</h3>
    <table><tbody>
      <tr><td>المبيعات الشهرية المتوقعة</td><td style="font-weight:bold">${monthSales.toLocaleString()}</td></tr>
      <tr><td>إجمالي المصاريف الغير مباشرة</td><td style="font-weight:bold">${total.toLocaleString()}</td></tr>
      <tr><td>نسبة المصاريف الغير مباشرة</td><td style="font-weight:bold">${indirectCostPct(selectedPeriod).toFixed(2)}%</td></tr>
      <tr><td>نقطة التعادل اليومية</td><td style="font-weight:bold">${breakEvenPoint(selectedPeriod).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td></tr>
    </tbody></table>

    <h3>جدول الربحية</h3>
    <table><tbody>
      <tr><td>Indirect Cost Per.</td><td style="font-weight:bold">${indirectPctValue.toFixed(2)}%</td></tr>
      <tr><td>Avg Direct Cost Per.</td><td style="font-weight:bold">${avgDirectCostPct.toFixed(2)}%</td></tr>
      <tr><td>Net Profit Per.</td><td style="font-weight:bold;${netProfitPct < 0 ? 'color:red' : 'color:green'}">${netProfitPct.toFixed(2)}%</td></tr>
      <tr><td>Break-Even Point (Daily)</td><td style="font-weight:bold">${breakEvenPoint(selectedPeriod).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td></tr>
    </tbody></table>

    <h3>توزيع المصاريف</h3>
    <table><thead><tr><th>البند</th><th>القيمة</th><th>النسبة</th></tr></thead><tbody>${expenseRowsHTML}</tbody></table>

    <h3>بيانات التشغيل</h3>
    <table><tbody>
      <tr><td>نوع المكان</td><td style="font-weight:bold">${(selectedPeriod as any).venue_type === "تيك اواي" ? "تيك اواي" : "صالة"}</td></tr>
      ${(selectedPeriod as any).venue_type === "تيك اواي"
        ? `<tr><td>عدد الطلبات اليومي (عدد الزوار)</td><td style="font-weight:bold">${selectedPeriod.capacity}</td></tr>`
        : `<tr><td>السعة (عدد الكراسي)</td><td style="font-weight:bold">${selectedPeriod.capacity}</td></tr>
           <tr><td>معدل الدوران</td><td style="font-weight:bold">${selectedPeriod.turn_over}</td></tr>`}
      <tr><td>متوسط الفاتورة</td><td style="font-weight:bold">${selectedPeriod.avg_check.toLocaleString()}</td></tr>
      <tr><td>المبيعات اليومية المتوقعة</td><td style="font-weight:bold">${expectedDailySales(selectedPeriod).toLocaleString()}</td></tr>
      <tr><td>المبيعات الشهرية المتوقعة</td><td style="font-weight:bold">${monthSales.toLocaleString()}</td></tr>
    </tbody></table>

    ${summaryData && summaryData.recommendations.length > 0 ? `
    <h3>💡 الملخص التنفيذي والتوصيات</h3>
    <table><tbody>
      ${summaryData.recommendations.map((r, i) => {
        const bg = r.type === "danger" ? "#fee" : r.type === "warning" ? "#fff8e6" : r.type === "success" ? "#eaf7ea" : "#eef4fb";
        const icon = r.type === "danger" ? "⚠️" : r.type === "warning" ? "⚠️" : r.type === "success" ? "✅" : "💡";
        return `<tr style="background:${bg};"><td style="width:30px;font-size:14px;">${icon}</td><td style="text-align:right;">${i + 1}. ${r.text}</td></tr>`;
      }).join("")}
    </tbody></table>
    ` : ""}

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
        avgDirectCostPct={avgDirectCostPct}
      />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold">تحليل المصاريف الغير مباشرة</h1>
        <div className="flex items-center gap-3 flex-wrap">
          {selectedPeriod && (
            <>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setCompareOpen(true)} disabled={periods.length < 2}>
                <GitCompareArrows size={14} className="text-blue-500" />
                قارن مع فترة سابقة
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={handlePdfExport} disabled={pdfLoading}>
                {pdfLoading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                PDF
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={handleExcelExport} disabled={excelLoading}>
                {excelLoading ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} className="text-green-600" />}
                Excel
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={handlePrint}>
                <Printer size={14} /> طباعة
              </Button>
            </>
          )}
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
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) { setEditingId(null); setForm(emptyForm); }
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus size={16} /> إضافة فترة</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "تعديل الفترة" : "إضافة فترة جديدة"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>اسم الفترة *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: أكتوبر 2025" />
                </div>
                <div>
                  <Label>الفرع</Label>
                  <Select value={form.branch_id} onValueChange={(v) => setForm({ ...form, branch_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر الفرع" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map(b => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>من تاريخ *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start gap-2">
                        <CalendarIcon size={14} />
                        {form.start_date ? format(form.start_date, "yyyy/MM/dd") : "اختر التاريخ"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={form.start_date} onSelect={(d) => setForm({ ...form, start_date: d })} /></PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label>إلى تاريخ *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start gap-2">
                        <CalendarIcon size={14} />
                        {form.end_date ? format(form.end_date, "yyyy/MM/dd") : "اختر التاريخ"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={form.end_date} onSelect={(d) => setForm({ ...form, end_date: d })} /></PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">المصاريف الغير مباشرة</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: "rent", label: "الإيجار" },
                    { key: "salaries", label: "المرتبات" },
                    { key: "bills", label: "الفواتير" },
                    { key: "media", label: "الميديا والتسويق" },
                    { key: "maintenance", label: "الصيانة" },
                    { key: "other_expenses", label: "أخرى" },
                  ].map((item) => (
                    <div key={item.key}>
                      <Label>{item.label}</Label>
                      <Input type="number" value={(form as any)[item.key]} onChange={(e) => setForm({ ...form, [item.key]: parseFloat(e.target.value) || 0 })} />
                    </div>
                  ))}
                </div>

                {/* Custom expenses */}
                {form.custom_expenses.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    {form.custom_expenses.map((ce, idx) => (
                      <div key={idx} className="relative">
                        <Label className="flex items-center gap-1">
                          {ce.name}
                          <button type="button" onClick={() => handleRemoveCustomExpense(idx)} className="text-destructive hover:text-destructive/80">
                            <X size={12} />
                          </button>
                        </Label>
                        <Input type="number" value={ce.value} onChange={(e) => handleCustomExpenseChange(idx, parseFloat(e.target.value) || 0)} />
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 mt-3">
                  <Input
                    placeholder="اسم البند الجديد"
                    value={newCustomName}
                    onChange={(e) => setNewCustomName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddCustomExpense())}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={handleAddCustomExpense} className="gap-1 shrink-0">
                    <Plus size={14} /> إضافة بند
                  </Button>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">بيانات التشغيل</h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <Label>نوع المكان</Label>
                    <Select
                      value={form.venue_type}
                      onValueChange={(v) => setForm({ ...form, venue_type: v as "صالة" | "تيك اواي" })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="صالة">صالة (Dine-in)</SelectItem>
                        <SelectItem value="تيك اواي">تيك اواي (Take Away)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>المبيعات المتوقعة (تلقائي)</Label>
                    <Input
                      type="number"
                      value={
                        form.venue_type === "تيك اواي"
                          ? form.capacity * form.avg_check
                          : form.capacity * form.turn_over * form.avg_check
                      }
                      readOnly
                      className="bg-muted"
                    />
                  </div>
                  {form.venue_type === "تيك اواي" ? (
                    <div>
                      <Label>عدد الطلبات اليومي (عدد الزوار)</Label>
                      <Input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: parseFloat(e.target.value) || 0 })} />
                    </div>
                  ) : (
                    <>
                      <div><Label>السعة (عدد الكراسي)</Label><Input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: parseFloat(e.target.value) || 0 })} /></div>
                      <div><Label>معدل الدوران</Label><Input type="number" step="0.1" value={form.turn_over} onChange={(e) => setForm({ ...form, turn_over: parseFloat(e.target.value) || 0 })} /></div>
                    </>
                  )}
                  <div><Label>متوسط الفاتورة</Label><Input type="number" value={form.avg_check} onChange={(e) => setForm({ ...form, avg_check: parseFloat(e.target.value) || 0 })} /></div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">إعدادات التكاليف الافتراضية</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>نسبة مستهلكات المطبخ (%)</Label><Input type="number" step="0.1" value={form.default_consumables_pct} onChange={(e) => setForm({ ...form, default_consumables_pct: parseFloat(e.target.value) || 0 })} /></div>
                  <div><Label>نسبة مستهلكات البار (%)</Label><Input type="number" step="0.1" value={form.default_consumables_pct_bar} onChange={(e) => setForm({ ...form, default_consumables_pct_bar: parseFloat(e.target.value) || 0 })} /></div>
                  <div><Label>نسبة الضريبة (%)</Label><Input type="number" step="0.1" value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: parseFloat(e.target.value) || 0 })} /></div>
                </div>

                {(() => {
                  // Filter pos items by selected branch in the form, so categories shown match the period's branch
                  const branchScopedItems = form.branch_id
                    ? posItems.filter(i => i.branch_id === form.branch_id)
                    : posItems.filter(i => !i.branch_id);
                  const uniqueCats = [...new Set(branchScopedItems.map(i => (i.category || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar"));
                  const classFor = (cat: string) => categoryClassMap.get(`${form.branch_id || ""}::${cat}`) ?? categoryClassMap.get(`::${cat}`);
                  const kitchenCats = uniqueCats.filter(cat => classFor(cat) === "kitchen");
                  const barCats = uniqueCats.filter(cat => classFor(cat) === "bar");
                  if (kitchenCats.length === 0 && barCats.length === 0) return (
                    <p className="text-xs text-muted-foreground mt-2">لا توجد مجموعات مصنفة كـ Kitchen أو Bar. يرجى تحديد التصنيف في صفحة المجموعات أولاً.</p>
                  );
                  return (
                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div>
                        <Label className="mb-2 block font-semibold">كاتجوري مستهلكات المطبخ (Kitchen)</Label>
                        <div className="border rounded-md p-3 max-h-40 overflow-y-auto space-y-2">
                          {kitchenCats.length === 0 ? (
                            <p className="text-xs text-muted-foreground">لا توجد مجموعات مصنفة كـ Kitchen</p>
                          ) : kitchenCats.map(cat => (
                            <div key={`kitchen-${cat}`} className="flex items-center gap-2">
                              <Checkbox
                                id={`kitchen-${cat}`}
                                checked={form.consumables_kitchen_categories.includes(cat)}
                                onCheckedChange={(checked) => {
                                  setForm(prev => ({
                                    ...prev,
                                    consumables_kitchen_categories: checked
                                      ? [...prev.consumables_kitchen_categories, cat]
                                      : prev.consumables_kitchen_categories.filter(c => c !== cat),
                                  }));
                                }}
                              />
                              <label htmlFor={`kitchen-${cat}`} className="text-sm cursor-pointer">{cat}</label>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">إذا لم يتم تحديد أي كاتجوري، ستُطبق النسبة على الكل</p>
                      </div>
                      <div>
                        <Label className="mb-2 block font-semibold">كاتجوري مستهلكات البار (Bar)</Label>
                        <div className="border rounded-md p-3 max-h-40 overflow-y-auto space-y-2">
                          {barCats.length === 0 ? (
                            <p className="text-xs text-muted-foreground">لا توجد مجموعات مصنفة كـ Bar</p>
                          ) : barCats.map(cat => (
                            <div key={`bar-${cat}`} className="flex items-center gap-2">
                              <Checkbox
                                id={`bar-${cat}`}
                                checked={form.consumables_bar_categories.includes(cat)}
                                onCheckedChange={(checked) => {
                                  setForm(prev => ({
                                    ...prev,
                                    consumables_bar_categories: checked
                                      ? [...prev.consumables_bar_categories, cat]
                                      : prev.consumables_bar_categories.filter(c => c !== cat),
                                  }));
                                }}
                              />
                              <label htmlFor={`bar-${cat}`} className="text-sm cursor-pointer">{cat}</label>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">حدد الكاتجوري التي تنتمي للبار</p>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <Button onClick={handleSave} className="w-full mt-2">{editingId ? "تحديث" : "حفظ"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>


      {periods.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {periods.map((p) => {
            const branchName = branches.find(b => b.id === p.branch_id)?.name;
            return (
              <Button
                key={p.id}
                variant={selectedPeriod?.id === p.id ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedPeriod(p)}
                className="gap-2"
              >
                {p.name}
                {branchName && <Badge variant="secondary" className="text-[10px] mr-1">{branchName}</Badge>}
              </Button>
            );
          })}
        </div>
      )}

      {selectedPeriod && (
        <>
          {/* Actions */}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => handleEdit(selectedPeriod)} className="gap-1">
              <Edit2 size={14} /> تعديل
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleDelete(selectedPeriod.id)} className="gap-1 text-destructive hover:text-destructive">
              <Trash2 size={14} /> حذف
            </Button>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-4 text-center">
                <TrendingUp className="mx-auto mb-1 text-primary" size={24} />
                <p className="text-xs text-muted-foreground">المبيعات الشهرية المتوقعة</p>
                <p className="text-xl font-bold text-primary">{monthSales.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card className="border-destructive/20 bg-destructive/5">
              <CardContent className="p-4 text-center">
                <DollarSign className="mx-auto mb-1 text-destructive" size={24} />
                <p className="text-xs text-muted-foreground">إجمالي المصاريف الغير مباشرة</p>
                <p className="text-xl font-bold text-destructive">{total.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card className="border-warning/20 bg-warning/5">
              <CardContent className="p-4 text-center">
                <Percent className="mx-auto mb-1 text-warning" size={24} />
                <p className="text-xs text-muted-foreground">نسبة المصاريف الغير مباشرة</p>
                <p className="text-xl font-bold text-warning">{indirectCostPct(selectedPeriod).toFixed(2)}%</p>
              </CardContent>
            </Card>
            <Card className="border-emerald-500/20 bg-emerald-500/5">
              <CardContent className="p-4 text-center">
                <Target className="mx-auto mb-1 text-emerald-500" size={24} />
                <p className="text-xs text-muted-foreground">نقطة التعادل</p>
                <p className="text-xl font-bold text-emerald-500">{breakEvenPoint(selectedPeriod).toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
              </CardContent>
            </Card>
          </div>

          {/* Profitability Summary Table */}
          <Card>
            <CardContent className="p-0 overflow-hidden rounded-lg">
              <table className="w-full text-sm">
                <tbody>
                  <tr>
                    <td className="px-6 py-3 bg-muted text-right font-semibold border-b border-border w-1/2">
                      Indirect Cost Per.
                    </td>
                    <td className="px-6 py-3 bg-card text-center font-bold border-b border-border w-1/2 text-destructive">
                      {indirectPctValue.toFixed(2)}%
                    </td>
                  </tr>
                  <tr>
                    <td className="px-6 py-3 bg-muted text-right font-semibold border-b border-border">
                      <div className="flex items-center gap-3 justify-end">
                        <Select value={costScope} onValueChange={(v: "all" | "kitchen" | "bar") => setCostScope(v)}>
                          <SelectTrigger className="w-[120px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">الكل</SelectItem>
                            <SelectItem value="kitchen">Kitchen</SelectItem>
                            <SelectItem value="bar">Bar</SelectItem>
                          </SelectContent>
                        </Select>
                        <span>Avg Direct Cost Per.</span>
                      </div>
                    </td>
                    <td className="px-6 py-3 bg-card text-center font-bold border-b border-border text-warning">
                      {avgDirectCostPct.toFixed(2)}%
                    </td>
                  </tr>
                  <tr>
                    <td className="px-6 py-3 bg-muted text-right font-semibold border-b border-border">
                      Net Profit Per.
                    </td>
                    <td className={`px-6 py-3 bg-card text-center font-bold border-b border-border ${netProfitPct >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {netProfitPct.toFixed(2)}%
                    </td>
                  </tr>
                  <tr>
                    <td className="px-6 py-3 bg-muted text-right font-semibold">
                      Break-Even Point (Daily)
                    </td>
                    <td className="px-6 py-3 bg-card text-center font-bold text-primary">
                      {selectedPeriod ? breakEvenPoint(selectedPeriod).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Executive Summary & Recommendations */}
          {summaryData && (
            <Card className="border-primary/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Lightbulb className="text-yellow-500" size={20} />
                  الملخص التنفيذي والتوصيات
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Executive snapshot */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-[11px] text-muted-foreground mb-1">أكبر بند مصروف</p>
                    <p className="text-sm font-bold">{summaryData.topExpense?.label || "—"}</p>
                    <p className="text-xs text-muted-foreground">{summaryData.topExpensePct.toFixed(1)}% من المبيعات</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-[11px] text-muted-foreground mb-1">الإيجار / المبيعات</p>
                    <p className={`text-sm font-bold ${summaryData.rentPct > 12 ? 'text-destructive' : summaryData.rentPct > 8 ? 'text-warning' : 'text-emerald-500'}`}>
                      {summaryData.rentPct.toFixed(1)}%
                    </p>
                    <p className="text-xs text-muted-foreground">المستهدف &lt; 10%</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-[11px] text-muted-foreground mb-1">المرتبات / المبيعات</p>
                    <p className={`text-sm font-bold ${summaryData.salariesPct > 30 ? 'text-destructive' : summaryData.salariesPct > 25 ? 'text-warning' : 'text-emerald-500'}`}>
                      {summaryData.salariesPct.toFixed(1)}%
                    </p>
                    <p className="text-xs text-muted-foreground">المستهدف &lt; 25%</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-[11px] text-muted-foreground mb-1">تغطية نقطة التعادل</p>
                    <p className={`text-sm font-bold ${summaryData.bepCoverage > 90 ? 'text-destructive' : summaryData.bepCoverage > 70 ? 'text-warning' : 'text-emerald-500'}`}>
                      {summaryData.bepCoverage.toFixed(1)}%
                    </p>
                    <p className="text-xs text-muted-foreground">من المبيعات اليومية</p>
                  </div>
                </div>

                {/* Recommendations */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <Lightbulb size={14} className="text-yellow-500" />
                    توصيات وتحذيرات
                  </p>
                  {summaryData.recommendations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">لا توجد توصيات.</p>
                  ) : (
                    summaryData.recommendations.map((r, i) => {
                      const Icon = r.type === "danger" ? AlertTriangle : r.type === "warning" ? AlertTriangle : r.type === "success" ? CheckCircle2 : Info;
                      const styles = r.type === "danger"
                        ? "border-destructive/30 bg-destructive/10 text-destructive"
                        : r.type === "warning"
                        ? "border-warning/30 bg-warning/10 text-warning-foreground"
                        : r.type === "success"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "border-primary/20 bg-primary/5 text-foreground";
                      return (
                        <div key={i} className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${styles}`}>
                          <Icon size={16} className="mt-0.5 flex-shrink-0" />
                          <span className="leading-relaxed">{r.text}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Sales Growth Efficiency Card */}
          {(() => {
            const periodA = periods.find(p => p.id === efficiencyPeriodAId) ?? selectedPeriod;
            const periodB = periods.find(p => p.id === efficiencyPeriodBId) ?? null;

            const aSales = periodA ? monthlyExpectedSales(periodA) : 0;
            const aIndirect = periodA ? totalIndirectCost(periodA) : 0;
            const bSales = periodB ? monthlyExpectedSales(periodB) : 0;
            const bIndirect = periodB ? totalIndirectCost(periodB) : 0;

            const extraSales = bSales - aSales;
            const extraExpenses = bIndirect - aIndirect;
            const costPerExtraEgp = periodB && extraSales > 0 ? extraExpenses / extraSales : null;
            const retentionPct = periodB && extraSales > 0 ? ((extraSales - extraExpenses) / extraSales) * 100 : null;

            const rating = (() => {
              if (costPerExtraEgp === null) return { label: "—", color: "text-muted-foreground", emoji: "" };
              if (costPerExtraEgp < 0.25) return { label: "ممتاز", color: "text-emerald-500", emoji: "🟢" };
              if (costPerExtraEgp < 0.40) return { label: "جيد", color: "text-green-500", emoji: "🟢" };
              if (costPerExtraEgp < 0.60) return { label: "متوسط", color: "text-yellow-500", emoji: "🟡" };
              if (costPerExtraEgp <= 1.00) return { label: "ضعيف", color: "text-orange-500", emoji: "🟠" };
              return { label: "خطر", color: "text-destructive", emoji: "🔴" };
            })();

            const periodALabel = periodA ? `${periodA.name}${branches.find(b => b.id === periodA.branch_id)?.name ? ` - ${branches.find(b => b.id === periodA.branch_id)?.name}` : ""}` : "—";
            const periodBLabel = periodB ? `${periodB.name}${branches.find(b => b.id === periodB.branch_id)?.name ? ` - ${branches.find(b => b.id === periodB.branch_id)?.name}` : ""}` : "—";

            return (
              <Card className="border-primary/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Zap className="text-yellow-500" size={20} />
                    كفاءة نمو المبيعات (مقارنة بين فترتين)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Two period selectors */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground mb-2">الفترة الأساسية (أ)</p>
                      <Select value={efficiencyPeriodAId || selectedPeriod.id} onValueChange={setEfficiencyPeriodAId}>
                        <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="اختر الفترة الأساسية" /></SelectTrigger>
                        <SelectContent>
                          {periods.map(p => {
                            const bn = branches.find(b => b.id === p.branch_id)?.name;
                            return <SelectItem key={p.id} value={p.id}>{p.name}{bn ? ` - ${bn}` : ""}</SelectItem>;
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground mb-2">فترة المقارنة (ب)</p>
                      <Select value={efficiencyPeriodBId} onValueChange={setEfficiencyPeriodBId}>
                        <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="اختر فترة للمقارنة" /></SelectTrigger>
                        <SelectContent>
                          {periods.filter(p => p.id !== (efficiencyPeriodAId || selectedPeriod.id)).map(p => {
                            const bn = branches.find(b => b.id === p.branch_id)?.name;
                            return <SelectItem key={p.id} value={p.id}>{p.name}{bn ? ` - ${bn}` : ""}</SelectItem>;
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {!periodB ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      اختر فترتين لعرض تحليل كفاءة نمو المبيعات
                    </p>
                  ) : (
                    <>
                      {/* Comparison table */}
                      <div className="rounded-lg border overflow-hidden mb-4">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="text-right py-2 px-3 font-semibold">البند</th>
                              <th className="text-center py-2 px-3 font-semibold">الفترة (أ)<br/><span className="text-[10px] text-muted-foreground font-normal">{periodALabel}</span></th>
                              <th className="text-center py-2 px-3 font-semibold">الفترة (ب)<br/><span className="text-[10px] text-muted-foreground font-normal">{periodBLabel}</span></th>
                              <th className="text-center py-2 px-3 font-semibold">الفرق</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-t">
                              <td className="py-2 px-3 font-medium">المبيعات الشهرية</td>
                              <td className="text-center py-2 px-3">{aSales.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                              <td className="text-center py-2 px-3">{bSales.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                              <td className={`text-center py-2 px-3 font-semibold ${extraSales >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                                {extraSales >= 0 ? '+' : ''}{extraSales.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </td>
                            </tr>
                            <tr className="border-t">
                              <td className="py-2 px-3 font-medium">المصاريف الغير مباشرة</td>
                              <td className="text-center py-2 px-3">{aIndirect.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                              <td className="text-center py-2 px-3">{bIndirect.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                              <td className={`text-center py-2 px-3 font-semibold ${extraExpenses <= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                                {extraExpenses >= 0 ? '+' : ''}{extraExpenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* KPI mini cards */}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                        <div className="rounded-lg border bg-card p-3 text-center">
                          <p className="text-[11px] text-muted-foreground mb-1">تكلفة كل 1ج مبيعات إضافية</p>
                          <p className={`text-base font-bold ${rating.color}`}>
                            {costPerExtraEgp !== null ? `${costPerExtraEgp.toFixed(2)} ج` : "—"}
                          </p>
                        </div>
                        <div className="rounded-lg border bg-card p-3 text-center">
                          <p className="text-[11px] text-muted-foreground mb-1">الاحتفاظ من نمو المبيعات</p>
                          <p className={`text-base font-bold ${(retentionPct ?? 0) >= 50 ? 'text-emerald-500' : (retentionPct ?? 0) >= 0 ? 'text-yellow-500' : 'text-destructive'}`}>
                            {retentionPct !== null ? `${retentionPct.toFixed(1)}%` : "—"}
                          </p>
                        </div>
                        <div className="rounded-lg border bg-card p-3 text-center">
                          <p className="text-[11px] text-muted-foreground mb-1">التقييم</p>
                          <p className={`text-base font-bold ${rating.color}`}>
                            {rating.emoji} {rating.label}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-lg border bg-muted/30 p-3 mb-3">
                        <p className="text-xs font-semibold mb-2">سلم التصنيف:</p>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b">
                                <th className="text-right py-1 px-2 font-semibold">القيمة</th>
                                <th className="text-right py-1 px-2 font-semibold">التقييم</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="border-b"><td className="py-1 px-2">أقل من 0.25</td><td className="py-1 px-2 text-emerald-500 font-semibold">🟢 ممتاز</td></tr>
                              <tr className="border-b"><td className="py-1 px-2">0.25 - 0.40</td><td className="py-1 px-2 text-green-500 font-semibold">🟢 جيد</td></tr>
                              <tr className="border-b"><td className="py-1 px-2">0.40 - 0.60</td><td className="py-1 px-2 text-yellow-500 font-semibold">🟡 متوسط</td></tr>
                              <tr className="border-b"><td className="py-1 px-2">0.60 - 1.00</td><td className="py-1 px-2 text-orange-500 font-semibold">🟠 ضعيف</td></tr>
                              <tr><td className="py-1 px-2">أكبر من 1.00</td><td className="py-1 px-2 text-destructive font-semibold">🔴 خطر</td></tr>
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <p className="text-[11px] text-muted-foreground leading-relaxed bg-yellow-500/5 border border-yellow-500/20 rounded p-2">
                        <strong>ملاحظة:</strong> هذا المؤشر يعتمد على المصاريف غير المباشرة فقط (لا يشمل تكلفة البضاعة)، لقياس كفاءة التشغيل مع نمو المبيعات بدقة. الفترة (ب) هي الفترة الأحدث/المقارنة.
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })()}



          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-lg">توزيع المصاريف</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {expenseItems.map((item) => {
                    const Icon = item.icon;
                    const pct = monthSales > 0 ? (item.value / monthSales * 100) : 0;
                    return (
                      <div key={item.label} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon size={16} className={item.color} />
                          <span className="text-sm">{item.label}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold">{item.value.toLocaleString()}</span>
                          <Badge variant="secondary" className="text-xs">{pct.toFixed(2)}%</Badge>
                        </div>
                      </div>
                    );
                  })}
                  <div className="border-t pt-2 flex items-center justify-between font-bold">
                    <span>الإجمالي</span>
                    <span className="text-primary">{total.toLocaleString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-lg">بيانات التشغيل</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {(() => {
                    const isTakeaway = (selectedPeriod as any).venue_type === "تيك اواي";
                    const opItems = [
                      { label: "نوع المكان", value: isTakeaway ? "تيك اواي" : "صالة" },
                      ...(isTakeaway
                        ? [{ label: "عدد الطلبات اليومي (عدد الزوار)", value: selectedPeriod.capacity }]
                        : [
                            { label: "السعة (عدد الكراسي)", value: selectedPeriod.capacity },
                            { label: "معدل الدوران", value: selectedPeriod.turn_over },
                          ]),
                      { label: "متوسط الفاتورة", value: selectedPeriod.avg_check.toLocaleString() },
                      { label: "المبيعات اليومية المتوقعة", value: expectedDailySales(selectedPeriod).toLocaleString() },
                      { label: "المبيعات الشهرية المتوقعة", value: monthSales.toLocaleString() },
                    ];
                    return opItems.map((item) => (
                      <div key={item.label} className="flex items-center justify-between border-b pb-2 last:border-0">
                        <span className="text-sm text-muted-foreground">{item.label}</span>
                        <span className="font-semibold">{item.value}</span>
                      </div>
                    ));
                  })()}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Visual bar chart of expenses */}
          <Card>
            <CardHeader><CardTitle className="text-lg">نسب المصاريف من المبيعات الشهرية المتوقعة</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {expenseItems.map((item) => {
                  const pct = monthSales > 0 ? (item.value / monthSales * 100) : 0;
                  return (
                    <div key={item.label}>
                      <div className="flex justify-between text-sm mb-1">
                        <span>{item.label}</span>
                        <span className="font-medium">{pct.toFixed(2)}%</span>
                      </div>
                      <div className="h-3 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${Math.min(pct * 3, 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!loading && periods.length === 0 && (
        <Card className="p-12 text-center">
          <DollarSign size={48} className="mx-auto mb-4 text-muted-foreground/30" />
          <h3 className="text-lg font-semibold mb-2">لا توجد فترات محفوظة</h3>
          <p className="text-muted-foreground text-sm mb-4">أضف فترة جديدة لبدء تحليل المصاريف الغير مباشرة</p>
          <Button onClick={() => setDialogOpen(true)} className="gap-2"><Plus size={16} /> إضافة فترة</Button>
        </Card>
      )}
    </div>
  );
};
