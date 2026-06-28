import React, { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  computeSupplyPrice,
  useBranchPolicies,
  useSupplyPricing,
  type BranchSupplyPolicy,
  type SupplyPricingRow,
} from "@/hooks/useSupplyPricing";
import {
  Search, Package, TrendingUp, Building2, RefreshCw, Eye, Save,
  Calculator, Truck, Boxes, Percent, ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

const fmt = (n: number) => `${n.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م`;
const fmtPct = (n: number) => `${Number(n).toFixed(1)}%`;

export const SupplyPricingPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const qc = useQueryClient();
  const { toast } = useToast();

  // Data — only items linked to at least one warehouse
  const { data: stockItems = [] } = useQuery({
    queryKey: ["stock-items-supply", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      // 1) get stock_item ids that exist in a warehouse location
      const { data: locs } = await supabase
        .from("stock_item_locations")
        .select("stock_item_id, warehouse_id")
        .eq("company_id", companyId!)
        .not("warehouse_id", "is", null);
      const ids = Array.from(new Set((locs ?? []).map((r: any) => r.stock_item_id))).filter(Boolean);
      if (ids.length === 0) return [];
      const { data } = await supabase
        .from("stock_items")
        .select("id, code, name, stock_unit, current_stock, avg_cost, category_id, inventory_categories(name)")
        .eq("company_id", companyId!)
        .eq("active", true)
        .in("id", ids)
        .order("code", { ascending: true });
      return data ?? [];
    },
  });

  const { data: branches = [] } = useQuery({
    queryKey: ["branches-supply", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("branches")
        .select("id, name, code")
        .eq("company_id", companyId!)
        .eq("active", true)
        .order("name");
      return data ?? [];
    },
  });

  const { data: pricing = [] } = useSupplyPricing(companyId);
  const { data: policies = [] } = useBranchPolicies(companyId);

  // last purchase prices (in bulk)
  const { data: lastPurchases = {} } = useQuery({
    queryKey: ["last-purchases", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("purchase_items")
        .select("stock_item_id, unit_price, created_at")
        .order("created_at", { ascending: false });
      const map: Record<string, number> = {};
      (data ?? []).forEach((r: any) => {
        if (r.stock_item_id && map[r.stock_item_id] == null) {
          map[r.stock_item_id] = Number(r.unit_price) || 0;
        }
      });
      return map;
    },
  });

  const pricingByItem = useMemo(() => {
    const m = new Map<string, SupplyPricingRow>();
    pricing.forEach((p) => m.set(p.stock_item_id, p));
    return m;
  }, [pricing]);

  // Filters
  const [search, setSearch] = useState("");
  const [supplyTypeFilter, setSupplyTypeFilter] = useState<"all" | "cost" | "cost_plus_profit">("all");

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stockItems.filter((it: any) => {
      if (q && !`${it.name} ${it.code ?? ""}`.toLowerCase().includes(q)) return false;
      const p = pricingByItem.get(it.id);
      const type = p?.supply_type ?? "cost_plus_profit";
      if (supplyTypeFilter !== "all" && type !== supplyTypeFilter) return false;
      return true;
    });
  }, [stockItems, search, supplyTypeFilter, pricingByItem]);

  // KPIs
  const kpis = useMemo(() => {
    const total = stockItems.length;
    const configured = pricing.length;
    const avgProfit =
      policies.length > 0
        ? policies.reduce((s, p) => s + Number(p.profit_percentage ?? 0), 0) / policies.length
        : 0;
    return { total, configured, avgProfit };
  }, [stockItems, pricing, policies]);

  // Save handlers
  const upsertPricing = async (row: Partial<SupplyPricingRow> & { stock_item_id: string }) => {
    if (!companyId) return;
    const existing = pricingByItem.get(row.stock_item_id);
    if (existing) {
      const { error } = await (supabase as any)
        .from("stock_item_supply_pricing")
        .update({ ...row, last_calculated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await (supabase as any)
        .from("stock_item_supply_pricing")
        .insert({
          company_id: companyId,
          stock_item_id: row.stock_item_id,
          supply_type: row.supply_type ?? "cost_plus_profit",
          manufacturing_cost: row.manufacturing_cost ?? 0,
          packaging_cost: row.packaging_cost ?? 0,
          auto_calculate: row.auto_calculate ?? true,
          manual_base_price: row.manual_base_price ?? null,
          last_calculated_at: new Date().toISOString(),
        });
      if (error) throw error;
    }
    await qc.invalidateQueries({ queryKey: ["supply-pricing", companyId] });
  };

  const upsertPolicy = async (branchId: string, patch: Partial<BranchSupplyPolicy>) => {
    if (!companyId) return;
    const existing = policies.find((p) => p.branch_id === branchId);
    if (existing) {
      const { error } = await (supabase as any)
        .from("branch_supply_policies")
        .update(patch)
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await (supabase as any)
        .from("branch_supply_policies")
        .insert({
          company_id: companyId,
          branch_id: branchId,
          profit_percentage: patch.profit_percentage ?? 0,
          transportation_cost: patch.transportation_cost ?? 0,
          loading_cost: patch.loading_cost ?? 0,
          minimum_order_value: patch.minimum_order_value ?? 0,
          is_active: patch.is_active ?? true,
        });
      if (error) throw error;
    }
    await qc.invalidateQueries({ queryKey: ["branch-supply-policies", companyId] });
  };

  // Per-row preview dialog
  const [previewItem, setPreviewItem] = useState<any | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Bulk apply profit
  const [bulkPct, setBulkPct] = useState<number>(14);

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto" dir="rtl">
      {/* Header */}
      <div className="glass-card p-6 rounded-2xl">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2">
              <Boxes className="text-primary" size={28} />
              تسعير المخزن المركزي
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              إدارة أسعار التوريد الداخلية للفروع بناءً على التكلفة + نسبة الربح + النقل + التحميل
            </p>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          <div className="rounded-xl bg-primary/10 border border-primary/20 p-4 flex items-center gap-3">
            <Package className="text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">إجمالي الخامات</p>
              <p className="text-xl font-black">{kpis.total}</p>
            </div>
          </div>
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 flex items-center gap-3">
            <Calculator className="text-emerald-500" />
            <div>
              <p className="text-xs text-muted-foreground">خامات مُسعَّرة</p>
              <p className="text-xl font-black">{kpis.configured} / {kpis.total}</p>
            </div>
          </div>
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 flex items-center gap-3">
            <Percent className="text-amber-500" />
            <div>
              <p className="text-xs text-muted-foreground">متوسط هامش الربح (الفروع)</p>
              <p className="text-xl font-black">{fmtPct(kpis.avgProfit)}</p>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="items" className="w-full">
        <TabsList className="grid grid-cols-2 w-full md:w-[500px]">
          <TabsTrigger value="items" className="gap-2"><Package size={16}/>تسعير الخامات</TabsTrigger>
          <TabsTrigger value="policies" className="gap-2"><Building2 size={16}/>سياسات الفروع</TabsTrigger>
        </TabsList>

        {/* ----------------- TAB 1: Items pricing ----------------- */}
        <TabsContent value="items" className="space-y-4">
          {/* Filters + Bulk */}
          <Card>
            <CardContent className="p-4 flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <Input
                  className="pr-9"
                  placeholder="بحث بالاسم أو الكود..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={supplyTypeFilter} onValueChange={(v: any) => setSupplyTypeFilter(v)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل أنواع التوريد</SelectItem>
                  <SelectItem value="cost">تكلفة فقط</SelectItem>
                  <SelectItem value="cost_plus_profit">تكلفة + ربح</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2 mr-auto">
                <span className="text-xs text-muted-foreground">تطبيق نوع موحّد:</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      for (const it of filteredItems) {
                        await upsertPricing({ stock_item_id: it.id, supply_type: "cost_plus_profit", auto_calculate: true });
                      }
                      toast({ title: "تم", description: `تم تطبيق "تكلفة + ربح" على ${filteredItems.length} صنف` });
                    } catch (e: any) {
                      toast({ title: "خطأ", description: e.message, variant: "destructive" });
                    }
                  }}
                >
                  تكلفة + ربح
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-center w-12"></TableHead>
                    <TableHead className="text-center">الكود</TableHead>
                    <TableHead className="text-center">اسم الخامة</TableHead>
                    <TableHead className="text-center">المجموعة</TableHead>
                    <TableHead className="text-center">الرصيد</TableHead>
                    <TableHead className="text-center">WAC</TableHead>
                    <TableHead className="text-center">آخر شراء</TableHead>
                    <TableHead className="text-center">نوع التوريد</TableHead>
                    <TableHead className="text-center">تكلفة تصنيع</TableHead>
                    <TableHead className="text-center">تعبئة</TableHead>
                    <TableHead className="text-center">حساب تلقائي</TableHead>
                    <TableHead className="text-center">السعر الأساسي</TableHead>
                    <TableHead className="text-center">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((it: any) => {
                    const p = pricingByItem.get(it.id);
                    const lastP = lastPurchases[it.id] ?? 0;
                    const basePreview = computeSupplyPrice({
                      wac: Number(it.avg_cost) || 0,
                      lastPurchasePrice: lastP,
                      currentStock: Number(it.current_stock) || 0,
                      pricing: p,
                    }).baseCost;
                    const isExpanded = expandedId === it.id;
                    return (
                      <React.Fragment key={it.id}>
                        <TableRow className="hover:bg-muted/30">
                          <TableCell className="text-center">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => setExpandedId(isExpanded ? null : it.id)}
                            >
                              {isExpanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                            </Button>
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs">{it.code ?? "—"}</TableCell>
                          <TableCell className="text-center font-medium">{it.name}</TableCell>
                          <TableCell className="text-center text-xs text-muted-foreground">
                            {it.inventory_categories?.name ?? "—"}
                          </TableCell>
                          <TableCell className="text-center text-xs">
                            {Number(it.current_stock).toFixed(2)} {it.stock_unit}
                          </TableCell>
                          <TableCell className="text-center text-xs">{fmt(Number(it.avg_cost) || 0)}</TableCell>
                          <TableCell className="text-center text-xs">{fmt(lastP)}</TableCell>
                          <TableCell className="text-center">
                            <Select
                              value={p?.supply_type ?? "cost_plus_profit"}
                              onValueChange={(v: any) => upsertPricing({ stock_item_id: it.id, supply_type: v })}
                            >
                              <SelectTrigger className="h-8 w-[120px] mx-auto text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="cost">تكلفة فقط</SelectItem>
                                <SelectItem value="cost_plus_profit">تكلفة + ربح</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              className="h-8 w-20 mx-auto text-xs text-center"
                              defaultValue={p?.manufacturing_cost ?? 0}
                              onBlur={(e) => {
                                const v = Number(e.target.value) || 0;
                                if (v !== Number(p?.manufacturing_cost ?? 0)) {
                                  upsertPricing({ stock_item_id: it.id, manufacturing_cost: v });
                                }
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              className="h-8 w-20 mx-auto text-xs text-center"
                              defaultValue={p?.packaging_cost ?? 0}
                              onBlur={(e) => {
                                const v = Number(e.target.value) || 0;
                                if (v !== Number(p?.packaging_cost ?? 0)) {
                                  upsertPricing({ stock_item_id: it.id, packaging_cost: v });
                                }
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Switch
                              checked={p?.auto_calculate ?? true}
                              onCheckedChange={(v) => upsertPricing({ stock_item_id: it.id, auto_calculate: v })}
                            />
                          </TableCell>
                          <TableCell className="text-center text-xs font-bold text-primary">
                            {fmt(basePreview)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              onClick={() => setPreviewItem({ ...it, lastP })}
                            >
                              <Eye size={12}/> الأسعار
                            </Button>
                          </TableCell>
                        </TableRow>

                        {isExpanded && (
                          <TableRow className="bg-muted/20">
                            <TableCell colSpan={13} className="p-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="text-xs text-muted-foreground">سعر يدوي (يستخدم لو "حساب تلقائي" مغلق)</label>
                                  <Input
                                    type="number"
                                    className="mt-1 h-9"
                                    defaultValue={p?.manual_base_price ?? ""}
                                    onBlur={(e) => {
                                      const v = e.target.value === "" ? null : Number(e.target.value);
                                      upsertPricing({ stock_item_id: it.id, manual_base_price: v as any });
                                    }}
                                  />
                                </div>
                                <div className="rounded-lg bg-card p-3 text-xs space-y-1 border">
                                  <p className="font-bold mb-1">معاينة معادلة التسعير:</p>
                                  <p>WAC: <span className="font-mono">{fmt(Number(it.avg_cost)||0)}</span></p>
                                  <p>+ تصنيع: <span className="font-mono">{fmt(Number(p?.manufacturing_cost ?? 0))}</span></p>
                                  <p>+ تعبئة: <span className="font-mono">{fmt(Number(p?.packaging_cost ?? 0))}</span></p>
                                  <p className="border-t pt-1 font-bold text-primary">= السعر الأساسي: {fmt(basePreview)}</p>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {filteredItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                        لا توجد خامات
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ----------------- TAB 2: Branch policies ----------------- */}
        <TabsContent value="policies" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 size={18}/> سياسة التوريد لكل فرع
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                كل فرع له نسبة ربح وتكلفة نقل وتكلفة تحميل خاصة به. السعر النهائي يحسب تلقائيًا عند التحويل.
              </p>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-center">الفرع</TableHead>
                    <TableHead className="text-center">تفعيل التوريد الداخلي</TableHead>
                    <TableHead className="text-center">نسبة الربح %</TableHead>
                    <TableHead className="text-center">تكلفة النقل (للتحويل)</TableHead>
                    <TableHead className="text-center">تكلفة التحميل</TableHead>
                    <TableHead className="text-center">حد أدنى للأمر</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {branches.map((br: any) => {
                    const pol = policies.find((p) => p.branch_id === br.id);
                    const isActive = pol?.is_active ?? true;
                    return (
                      <TableRow key={br.id} className={!isActive ? "opacity-60" : ""}>
                        <TableCell className="text-center font-medium">
                          <div className="flex items-center gap-2 justify-center">
                            <Building2 size={14} className="text-primary"/>
                            {br.name}
                            {br.code && <Badge variant="outline" className="font-mono text-[10px]">{br.code}</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center gap-1">
                            <Switch
                              checked={isActive}
                              onCheckedChange={(v) => upsertPolicy(br.id, { is_active: v })}
                            />
                            <Badge
                              variant={isActive ? "default" : "outline"}
                              className={cn(
                                "text-[10px] font-bold",
                                isActive ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/15" : "text-muted-foreground"
                              )}
                            >
                              {isActive ? "مُفعَّل — يطبق سعر التوريد" : "مُعطَّل — ينتقل بالتكلفة فقط"}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            step="0.1"
                            disabled={!isActive}
                            className="h-8 w-24 mx-auto text-center"
                            defaultValue={pol?.profit_percentage ?? 0}
                            onBlur={(e) => upsertPolicy(br.id, { profit_percentage: Number(e.target.value) || 0 })}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            disabled={!isActive}
                            className="h-8 w-28 mx-auto text-center"
                            defaultValue={pol?.transportation_cost ?? 0}
                            onBlur={(e) => upsertPolicy(br.id, { transportation_cost: Number(e.target.value) || 0 })}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            disabled={!isActive}
                            className="h-8 w-28 mx-auto text-center"
                            defaultValue={pol?.loading_cost ?? 0}
                            onBlur={(e) => upsertPolicy(br.id, { loading_cost: Number(e.target.value) || 0 })}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            disabled={!isActive}
                            className="h-8 w-28 mx-auto text-center"
                            defaultValue={pol?.minimum_order_value ?? 0}
                            onBlur={(e) => upsertPolicy(br.id, { minimum_order_value: Number(e.target.value) || 0 })}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {branches.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        لا توجد فروع. أضف فروعًا من إعدادات الشركة.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Preview Dialog */}
      <Dialog open={!!previewItem} onOpenChange={(o) => !o && setPreviewItem(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck size={18} className="text-primary"/>
              معاينة سعر التوريد لكل فرع — {previewItem?.name}
            </DialogTitle>
          </DialogHeader>
          {previewItem && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-center">الفرع</TableHead>
                  <TableHead className="text-center">السعر الأساسي</TableHead>
                  <TableHead className="text-center">الربح %</TableHead>
                  <TableHead className="text-center">قيمة الربح</TableHead>
                  <TableHead className="text-center">نقل + تحميل</TableHead>
                  <TableHead className="text-center">السعر النهائي</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.map((br: any) => {
                  const p = pricingByItem.get(previewItem.id);
                  const pol = policies.find((x) => x.branch_id === br.id);
                  const r = computeSupplyPrice({
                    wac: Number(previewItem.avg_cost) || 0,
                    lastPurchasePrice: previewItem.lastP,
                    currentStock: Number(previewItem.current_stock) || 0,
                    pricing: p,
                    policy: pol,
                    quantity: 1,
                  });
                  return (
                    <TableRow key={br.id}>
                      <TableCell className="text-center font-medium">{br.name}</TableCell>
                      <TableCell className="text-center font-mono text-xs">{fmt(r.baseCost)}</TableCell>
                      <TableCell className="text-center text-xs">{fmtPct(Number(pol?.profit_percentage ?? 0))}</TableCell>
                      <TableCell className="text-center font-mono text-xs text-emerald-600">{fmt(r.profitAmount)}</TableCell>
                      <TableCell className="text-center font-mono text-xs text-amber-600">
                        {fmt(r.transportPerUnit + r.loadingPerUnit)}
                      </TableCell>
                      <TableCell className="text-center font-mono text-sm font-black text-primary">
                        {fmt(r.finalUnitPrice)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SupplyPricingPage;
