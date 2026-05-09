/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBranchCosts } from "@/hooks/useBranchCosts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Plus, Save, Trash2, Search, Tags, FilePlus2, Package, ChefHat, FileText,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MenuOfferPrintButton, type OfferPrintData } from "@/components/MenuOfferPrint";

interface OfferIngredient {
  tempId: string;
  id?: string;
  stock_item_id: string | null;
  name: string;
  unit: string;
  qty: number;
  conversion_factor: number;
  avg_cost: number;
}
interface OfferItem {
  tempId: string;
  id?: string;
  name: string;
  source_pos_item_id: string | null;
  ingredients: OfferIngredient[];
}

const uid = () => Math.random().toString(36).slice(2, 10);

export const MenuOffersPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const { toast } = useToast();
  const qc = useQueryClient();

  // Form state
  const [offerId, setOfferId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [branchId, setBranchId] = useState<string>("");
  const [salePrice, setSalePrice] = useState<number>(0);
  const [orderType, setOrderType] = useState<string>("صالة");
  const [taxRate, setTaxRate] = useState<number>(14);
  const [packingCost, setPackingCost] = useState<number>(0);
  const [consumablesPct, setConsumablesPct] = useState<number>(0);
  const [sideCost, setSideCost] = useState<number>(0);
  const [indirectExpensesPct, setIndirectExpensesPct] = useState<number>(0);
  const [notes, setNotes] = useState<string>("");
  const [items, setItems] = useState<OfferItem[]>([]);
  const [status, setStatus] = useState<string>("مسودة");

  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [filterBranch, setFilterBranch] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Add-item dialog
  const [showAddItem, setShowAddItem] = useState(false);
  const [addTab, setAddTab] = useState<"menu" | "custom">("menu");
  const [customName, setCustomName] = useState("");
  const [posSearch, setPosSearch] = useState("");

  // Add ingredient dialog
  const [showAddIng, setShowAddIng] = useState(false);
  const [addIngTargetItem, setAddIngTargetItem] = useState<string | null>(null);
  const [ingSearch, setIngSearch] = useState("");

  const branchCostBranchId = branchId || null;
  const { getCost } = useBranchCosts(branchCostBranchId);

  // Queries
  const { data: branches = [] } = useQuery({
    queryKey: ["branches-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").eq("active", true).order("name");
      if (error) throw error; return data;
    },
    enabled: !!companyId,
  });

  const { data: stockItems = [] } = useQuery({
    queryKey: ["stock-items-all-offers", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_items").select("*").eq("active", true).order("name");
      if (error) throw error; return data;
    },
    enabled: !!companyId,
  });

  const { data: posItems = [] } = useQuery({
    queryKey: ["pos-items-active-offers", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("pos_items").select("*").eq("active", true).order("name");
      if (error) throw error; return data;
    },
    enabled: !!companyId,
  });

  const { data: recipes = [] } = useQuery({
    queryKey: ["recipes-for-offers", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("recipes").select("*, recipe_ingredients(*)");
      if (error) throw error; return data;
    },
    enabled: !!companyId,
  });

  const { data: offers = [], refetch: refetchOffers } = useQuery({
    queryKey: ["menu-offers", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_offers")
        .select("*, menu_offer_items(*, menu_offer_ingredients(*))")
        .order("created_at", { ascending: false });
      if (error) throw error; return data as any[];
    },
    enabled: !!companyId,
  });

  const recipeMap = useMemo(() => {
    const m: Record<string, any> = {};
    recipes.forEach((r: any) => { m[r.menu_item_id] = r; });
    return m;
  }, [recipes]);

  const stockMap = useMemo(() => {
    const m: Record<string, any> = {};
    stockItems.forEach((s: any) => { m[s.id] = s; });
    return m;
  }, [stockItems]);

  // Filtered list of offers in sidebar
  const filteredOffers = useMemo(() => {
    let list = offers;
    if (filterBranch !== "all") list = list.filter((o) => o.branch_id === filterBranch);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((o) => (o.name ?? "").toLowerCase().includes(q) || (o.code ?? "").toLowerCase().includes(q));
    }
    return list;
  }, [offers, filterBranch, search]);

  // Calculations
  const calcs = useMemo(() => {
    const ingTotal = items.reduce((sum, it) => {
      return sum + it.ingredients.reduce((s, ing) => s + (ing.qty / (ing.conversion_factor || 1)) * ing.avg_cost, 0);
    }, 0);
    const consumablesAmount = (ingTotal * (consumablesPct ?? 0)) / 100;
    const directCost = ingTotal + (packingCost ?? 0) + consumablesAmount + (sideCost ?? 0);
    const indirectAmount = (directCost * (indirectExpensesPct ?? 0)) / 100;
    const fullCost = directCost + indirectAmount;
    const isTakeAway = orderType.includes("تيك") || orderType.toLowerCase().includes("away");
    const sale = salePrice ?? 0;
    const netSale = isTakeAway ? sale : (sale > 0 ? sale / (1 + (taxRate ?? 0) / 100) : 0);
    const taxAmount = isTakeAway ? 0 : sale - netSale;
    const profit = netSale - fullCost;
    const margin = netSale > 0 ? (profit / netSale) * 100 : 0;
    return { ingTotal, consumablesAmount, directCost, indirectAmount, fullCost, netSale, taxAmount, profit, margin };
  }, [items, consumablesPct, packingCost, sideCost, indirectExpensesPct, orderType, salePrice, taxRate]);

  const marginColor = calcs.margin < 20 ? "text-red-500" : calcs.margin <= 40 ? "text-green-500" : "text-yellow-500";

  // Reset form
  const resetForm = () => {
    setOfferId(null); setName(""); setCode(""); setBranchId(""); setSalePrice(0);
    setOrderType("صالة"); setTaxRate(14); setPackingCost(0); setConsumablesPct(0);
    setSideCost(0); setIndirectExpensesPct(0); setNotes(""); setItems([]); setStatus("مسودة");
  };

  // Hydrate offer
  const hydrateOffer = (o: any) => {
    setOfferId(o.id);
    setName(o.name ?? "");
    setCode(o.code ?? "");
    setBranchId(o.branch_id ?? "");
    setSalePrice(Number(o.sale_price) ?? 0);
    setOrderType(o.order_type ?? "صالة");
    setTaxRate(Number(o.tax_rate) ?? 0);
    setPackingCost(Number(o.packing_cost) ?? 0);
    setConsumablesPct(Number(o.consumables_pct) ?? 0);
    setSideCost(Number(o.side_cost) ?? 0);
    setIndirectExpensesPct(Number(o.indirect_expenses_pct) ?? 0);
    setNotes(o.notes ?? "");
    setStatus(o.status ?? "مسودة");
    const sortedItems = [...(o.menu_offer_items ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    setItems(sortedItems.map((it: any) => ({
      tempId: uid(),
      id: it.id,
      name: it.name,
      source_pos_item_id: it.source_pos_item_id ?? null,
      ingredients: (it.menu_offer_ingredients ?? []).map((ing: any) => ({
        tempId: uid(),
        id: ing.id,
        stock_item_id: ing.stock_item_id ?? null,
        name: ing.name,
        unit: ing.unit ?? "",
        qty: Number(ing.qty) ?? 0,
        conversion_factor: Number(ing.conversion_factor) ?? 1,
        avg_cost: Number(ing.avg_cost) ?? 0,
      })),
    })));
  };

  // Per-row quantity (multiplier) for menu items in the add dialog
  const [posQtyMap, setPosQtyMap] = useState<Record<string, number>>({});

  // Add item from POS menu (with full recipe snapshot) — multiplied by qty
  const addFromPosItem = (posItemId: string, qty: number = 1) => {
    const p = posItems.find((x: any) => x.id === posItemId);
    if (!p) return;
    const multiplier = qty > 0 ? qty : 1;
    const r = recipeMap[posItemId];
    const ings: OfferIngredient[] = (r?.recipe_ingredients ?? []).map((ri: any) => {
      const si = stockMap[ri.stock_item_id];
      return {
        tempId: uid(),
        stock_item_id: ri.stock_item_id,
        name: si?.name ?? "",
        unit: si?.recipe_unit ?? si?.stock_unit ?? "",
        qty: (Number(ri.qty) ?? 0) * multiplier,
        conversion_factor: Number(si?.conversion_factor) ?? 1,
        avg_cost: getCost(ri.stock_item_id, si?.avg_cost),
      };
    });
    const displayName = multiplier > 1 ? `${p.name} ×${multiplier}` : p.name;
    setItems((prev) => [...prev, { tempId: uid(), name: displayName, source_pos_item_id: p.id, ingredients: ings }]);
    setShowAddItem(false);
  };

  // Add custom item
  const addCustomItem = () => {
    if (!customName.trim()) { toast({ title: "ادخل اسم الصنف", variant: "destructive" }); return; }
    setItems((prev) => [...prev, { tempId: uid(), name: customName.trim(), source_pos_item_id: null, ingredients: [] }]);
    setCustomName("");
    setShowAddItem(false);
  };

  const removeItem = (tempId: string) => setItems((p) => p.filter((i) => i.tempId !== tempId));

  // Add ingredient to item
  const openAddIng = (itemTempId: string) => { setAddIngTargetItem(itemTempId); setIngSearch(""); setShowAddIng(true); };
  const addIngredient = (siId: string) => {
    if (!addIngTargetItem) return;
    const si = stockMap[siId];
    if (!si) return;
    const newIng: OfferIngredient = {
      tempId: uid(),
      stock_item_id: siId,
      name: si.name,
      unit: si.recipe_unit ?? si.stock_unit ?? "",
      qty: 0,
      conversion_factor: Number(si.conversion_factor) ?? 1,
      avg_cost: getCost(siId, si.avg_cost),
    };
    setItems((prev) => prev.map((it) =>
      it.tempId === addIngTargetItem
        ? { ...it, ingredients: it.ingredients.find((i) => i.stock_item_id === siId) ? it.ingredients : [...it.ingredients, newIng] }
        : it,
    ));
  };
  const updateIngQty = (itemTempId: string, ingTempId: string, qty: number) => {
    setItems((prev) => prev.map((it) =>
      it.tempId === itemTempId
        ? { ...it, ingredients: it.ingredients.map((i) => i.tempId === ingTempId ? { ...i, qty } : i) }
        : it,
    ));
  };
  const removeIng = (itemTempId: string, ingTempId: string) => {
    setItems((prev) => prev.map((it) =>
      it.tempId === itemTempId
        ? { ...it, ingredients: it.ingredients.filter((i) => i.tempId !== ingTempId) }
        : it,
    ));
  };
  const updateItemName = (tempId: string, n: string) => {
    setItems((prev) => prev.map((it) => it.tempId === tempId ? { ...it, name: n } : it));
  };

  // Save
  const handleSave = async (finalize: boolean) => {
    if (!companyId) return;
    if (!name.trim()) { toast({ title: "ادخل اسم العرض", variant: "destructive" }); return; }
    setSaving(true);
    try {
      let savedId = offerId;
      let savedCode = code;
      const newStatus = finalize ? "جاهز" : "مسودة";
      if (!savedId) {
        // Generate code
        const { data: codeData } = await supabase.rpc("generate_offer_code", { p_company_id: companyId });
        savedCode = (codeData as string) ?? code ?? "";
        const { data: ins, error } = await supabase.from("menu_offers").insert({
          company_id: companyId,
          branch_id: branchId || null,
          code: savedCode,
          name: name.trim(),
          status: newStatus,
          sale_price: salePrice ?? 0,
          tax_rate: taxRate ?? 0,
          order_type: orderType,
          packing_cost: packingCost ?? 0,
          consumables_pct: consumablesPct ?? 0,
          side_cost: sideCost ?? 0,
          indirect_expenses_pct: indirectExpensesPct ?? 0,
          notes: notes || null,
        }).select().single();
        if (error) throw error;
        savedId = ins.id;
        setOfferId(savedId);
        setCode(savedCode);
      } else {
        const { error } = await supabase.from("menu_offers").update({
          branch_id: branchId || null,
          name: name.trim(),
          status: newStatus,
          sale_price: salePrice ?? 0,
          tax_rate: taxRate ?? 0,
          order_type: orderType,
          packing_cost: packingCost ?? 0,
          consumables_pct: consumablesPct ?? 0,
          side_cost: sideCost ?? 0,
          indirect_expenses_pct: indirectExpensesPct ?? 0,
          notes: notes || null,
        }).eq("id", savedId);
        if (error) throw error;
        // Wipe existing items (cascade deletes ingredients)
        await supabase.from("menu_offer_items").delete().eq("offer_id", savedId);
      }
      // Insert items + ingredients
      for (let idx = 0; idx < items.length; idx++) {
        const it = items[idx];
        const { data: insItem, error: e1 } = await supabase.from("menu_offer_items").insert({
          offer_id: savedId,
          name: it.name,
          source_pos_item_id: it.source_pos_item_id,
          sort_order: idx,
        }).select().single();
        if (e1) throw e1;
        if (it.ingredients.length > 0) {
          const ingsRows = it.ingredients.map((ing) => ({
            offer_item_id: insItem.id,
            stock_item_id: ing.stock_item_id,
            name: ing.name,
            unit: ing.unit,
            qty: ing.qty ?? 0,
            conversion_factor: ing.conversion_factor ?? 1,
            avg_cost: ing.avg_cost ?? 0,
          }));
          const { error: e2 } = await supabase.from("menu_offer_ingredients").insert(ingsRows);
          if (e2) throw e2;
        }
      }
      setStatus(newStatus);
      toast({ title: "تم الحفظ بنجاح" });
      qc.invalidateQueries({ queryKey: ["menu-offers", companyId] });
      refetchOffers();
    } catch (e: any) {
      toast({ title: "خطأ في الحفظ", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const { error } = await supabase.from("menu_offers").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      toast({ title: "تم الحذف" });
      if (offerId === deleteTarget.id) resetForm();
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["menu-offers", companyId] });
    } catch (e: any) {
      toast({ title: "خطأ في الحذف", description: e.message, variant: "destructive" });
    }
  };

  // Print data
  const printData: OfferPrintData = useMemo(() => ({
    name,
    code,
    branchName: branches.find((b: any) => b.id === branchId)?.name ?? "—",
    orderType,
    salePrice: salePrice ?? 0,
    taxRate: taxRate ?? 0,
    packingCost: packingCost ?? 0,
    consumablesPct: consumablesPct ?? 0,
    sideCost: sideCost ?? 0,
    indirectExpensesPct: indirectExpensesPct ?? 0,
    notes,
    items: items.map((it) => ({
      name: it.name,
      ingredients: it.ingredients.map((ing) => ({
        name: ing.name, unit: ing.unit, qty: ing.qty, avg_cost: ing.avg_cost, conversion_factor: ing.conversion_factor,
      })),
    })),
  }), [name, code, branches, branchId, orderType, salePrice, taxRate, packingCost, consumablesPct, sideCost, indirectExpensesPct, notes, items]);

  const filteredPosForAdd = useMemo(() => {
    let list = posItems;
    if (branchId) list = list.filter((p: any) => p.branch_id === branchId);
    if (posSearch.trim()) {
      const q = posSearch.trim().toLowerCase();
      list = list.filter((p: any) => (p.name ?? "").toLowerCase().includes(q) || (p.code ?? "").toLowerCase().includes(q));
    }
    return list.slice(0, 200);
  }, [posItems, branchId, posSearch]);

  const filteredStockForAdd = useMemo(() => {
    let list = stockItems;
    if (ingSearch.trim()) {
      const q = ingSearch.trim().toLowerCase();
      list = list.filter((s: any) => (s.name ?? "").toLowerCase().includes(q) || (s.code ?? "").toLowerCase().includes(q));
    }
    return list.slice(0, 200);
  }, [stockItems, ingSearch]);

  return (
    <div className="p-4 md:p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Tags className="text-primary" />
          <h1 className="text-xl font-bold">تسعير العروض / الأصناف الجديدة</h1>
        </div>
        <Button onClick={resetForm} variant="outline" className="gap-2">
          <FilePlus2 size={16} /> عرض جديد
        </Button>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Sidebar of saved offers */}
        <Card className="col-span-12 lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">العروض المحفوظة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="space-y-2">
              <Select value={filterBranch} onValueChange={setFilterBranch}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الفروع</SelectItem>
                  {branches.map((b: any) => (<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute right-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث..." className="pr-7 h-8 text-xs" />
              </div>
            </div>
            <div className="max-h-[600px] overflow-auto space-y-1">
              {filteredOffers.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">لا توجد عروض</p>}
              {filteredOffers.map((o: any) => (
                <div key={o.id} className={`flex items-center gap-1 group rounded-md border p-2 text-xs cursor-pointer hover:bg-accent ${offerId === o.id ? "border-primary bg-accent" : ""}`}
                  onClick={() => hydrateOffer(o)}>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{o.name}</div>
                    <div className="text-muted-foreground">{o.code} • <Badge variant={o.status === "جاهز" ? "default" : "secondary"} className="text-[10px]">{o.status}</Badge></div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(o); }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Main editor */}
        <div className="col-span-12 lg:col-span-9 space-y-4">
          {/* Header */}
          <Card>
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <CardTitle className="text-sm">بيانات العرض {code && <span className="text-xs text-muted-foreground">({code})</span>}</CardTitle>
              <div className="flex items-center gap-2">
                <MenuOfferPrintButton data={printData} disabled={!name || items.length === 0} />
                <Button size="sm" variant="secondary" onClick={() => handleSave(false)} disabled={saving}>
                  <Save size={14} /> حفظ مسودة
                </Button>
                <Button size="sm" onClick={() => handleSave(true)} disabled={saving}>
                  <Save size={14} /> حفظ نهائي
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-12 md:col-span-4">
                  <Label className="text-xs">اسم العرض *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: عرض السندوتش المضاعف" />
                </div>
                <div className="col-span-12 md:col-span-3">
                  <Label className="text-xs">الفرع</Label>
                  <Select value={branchId || "none"} onValueChange={(v) => setBranchId(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— بدون فرع —</SelectItem>
                      {branches.map((b: any) => (<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-6 md:col-span-2">
                  <Label className="text-xs">نوع الطلب</Label>
                  <Select value={orderType} onValueChange={setOrderType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="صالة">صالة</SelectItem>
                      <SelectItem value="تيك أواي">تيك أواي</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-6 md:col-span-3">
                  <Label className="text-xs">سعر البيع (EGP)</Label>
                  <Input type="number" value={salePrice} onChange={(e) => setSalePrice(Number(e.target.value))} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Items */}
          <Card>
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2"><Package size={14} /> أصناف العرض ({items.length})</CardTitle>
              <Button size="sm" variant="default" onClick={() => setShowAddItem(true)}>
                <Plus size={14} /> إضافة صنف
              </Button>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <ChefHat className="mx-auto mb-2 opacity-40" size={32} />
                  لم تضف أي صنف بعد. اضغط "إضافة صنف" للبدء.
                </div>
              ) : (
                <Accordion type="multiple" defaultValue={items.map((i) => i.tempId)} className="space-y-2">
                  {items.map((item, idx) => {
                    const itemCost = item.ingredients.reduce((s, i) => s + (i.qty / (i.conversion_factor || 1)) * i.avg_cost, 0);
                    return (
                      <AccordionItem key={item.tempId} value={item.tempId} className="border rounded-md px-3">
                        <AccordionTrigger className="hover:no-underline py-2">
                          <div className="flex-1 flex items-center gap-3 text-sm">
                            <Badge variant="outline">صنف {idx + 1}</Badge>
                            <span className="font-medium">{item.name || "(بدون اسم)"}</span>
                            <span className="text-muted-foreground text-xs">— {item.ingredients.length} مكونات</span>
                            <span className="ms-auto text-primary font-semibold">{itemCost.toFixed(2)} EGP</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-2">
                            <div className="flex gap-2 items-end flex-wrap">
                              <div className="flex-1 min-w-[200px]">
                                <Label className="text-xs">اسم الصنف</Label>
                                <Input value={item.name} onChange={(e) => updateItemName(item.tempId, e.target.value)} className="h-8" />
                              </div>
                              <Button size="sm" variant="outline" onClick={() => openAddIng(item.tempId)}>
                                <Plus size={14} /> إضافة خامة
                              </Button>
                              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeItem(item.tempId)}>
                                <Trash2 size={14} /> حذف الصنف
                              </Button>
                            </div>
                            {item.ingredients.length === 0 ? (
                              <p className="text-xs text-muted-foreground text-center py-2">لا توجد مكونات</p>
                            ) : (
                              <div className="overflow-x-auto">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="text-xs">اسم الخامة</TableHead>
                                      <TableHead className="text-xs">الوحدة</TableHead>
                                      <TableHead className="text-xs">الكمية</TableHead>
                                      <TableHead className="text-xs">م.التكلفة</TableHead>
                                      <TableHead className="text-xs">الإجمالي</TableHead>
                                      <TableHead className="w-8"></TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {item.ingredients.map((ing) => {
                                      const c = (ing.qty / (ing.conversion_factor || 1)) * ing.avg_cost;
                                      return (
                                        <TableRow key={ing.tempId}>
                                          <TableCell className="text-xs">{ing.name}</TableCell>
                                          <TableCell className="text-xs">{ing.unit}</TableCell>
                                          <TableCell>
                                            <Input type="number" value={ing.qty} onChange={(e) => updateIngQty(item.tempId, ing.tempId, Number(e.target.value))} className="h-7 w-24" />
                                          </TableCell>
                                          <TableCell className="text-xs">{ing.avg_cost.toFixed(2)}</TableCell>
                                          <TableCell className="text-xs font-semibold">{c.toFixed(2)}</TableCell>
                                          <TableCell>
                                            <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeIng(item.tempId, ing.tempId)}>
                                              <Trash2 className="h-3 w-3" />
                                            </Button>
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })}
                                  </TableBody>
                                </Table>
                              </div>
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              )}
            </CardContent>
          </Card>

          {/* Indirect expenses + summary */}
          <div className="grid grid-cols-12 gap-4">
            <Card className="col-span-12 md:col-span-6">
              <CardHeader className="pb-2"><CardTitle className="text-sm">المصاريف الإضافية والغير مباشرة</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">تكلفة التعبئة (Packing)</Label>
                    <Input type="number" value={packingCost} onChange={(e) => setPackingCost(Number(e.target.value))} />
                  </div>
                  <div>
                    <Label className="text-xs">نسبة المستهلكات %</Label>
                    <Input type="number" value={consumablesPct} onChange={(e) => setConsumablesPct(Number(e.target.value))} />
                  </div>
                  <div>
                    <Label className="text-xs">Side Cost</Label>
                    <Input type="number" value={sideCost} onChange={(e) => setSideCost(Number(e.target.value))} />
                  </div>
                  <div>
                    <Label className="text-xs">المصاريف غير المباشرة %</Label>
                    <Input type="number" value={indirectExpensesPct} onChange={(e) => setIndirectExpensesPct(Number(e.target.value))} />
                  </div>
                  <div>
                    <Label className="text-xs">نسبة الضريبة %</Label>
                    <Input type="number" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">ملاحظات</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
                </div>
              </CardContent>
            </Card>

            <Card className="col-span-12 md:col-span-6">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><FileText size={14} /> الملخص المالي</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <Row label="إجمالي تكلفة الخامات" value={calcs.ingTotal} />
                <Row label="+ التعبئة" value={packingCost ?? 0} />
                <Row label={`+ المستهلكات (${consumablesPct}%)`} value={calcs.consumablesAmount} />
                <Row label="+ Side Cost" value={sideCost ?? 0} />
                <Row label="= التكلفة المباشرة" value={calcs.directCost} bold />
                <Row label={`+ المصاريف غير المباشرة (${indirectExpensesPct}%)`} value={calcs.indirectAmount} />
                <Row label="= التكلفة الكاملة" value={calcs.fullCost} bold highlight />
                <div className="border-t pt-2 mt-2">
                  <Row label="سعر البيع" value={salePrice ?? 0} />
                  <Row label="قيمة الضريبة" value={calcs.taxAmount} />
                  <Row label="صافي البيع" value={calcs.netSale} />
                  <Row label="صافي الربح" value={calcs.profit} valueClass={calcs.profit >= 0 ? "text-green-500" : "text-red-500"} bold />
                  <div className="flex items-center justify-between py-1">
                    <span className="font-bold">هامش الربح</span>
                    <span className={`font-bold ${marginColor}`}>{calcs.margin.toFixed(2)}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Add item dialog */}
      <Dialog open={showAddItem} onOpenChange={setShowAddItem}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
          <DialogHeader><DialogTitle>إضافة صنف للعرض</DialogTitle></DialogHeader>
          <Tabs value={addTab} onValueChange={(v) => setAddTab(v as any)}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="menu">من منتجات المنيو</TabsTrigger>
              <TabsTrigger value="custom">صنف مخصص جديد</TabsTrigger>
            </TabsList>
            <TabsContent value="menu" className="space-y-2">
              <Input placeholder="بحث في المنيو..." value={posSearch} onChange={(e) => setPosSearch(e.target.value)} />
              <div className="max-h-[400px] overflow-auto border rounded-md">
                {filteredPosForAdd.map((p: any) => {
                  const hasRecipe = !!recipeMap[p.id];
                  return (
                    <div key={p.id} className="flex items-center justify-between p-2 border-b text-sm hover:bg-accent">
                      <div>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.code} {!hasRecipe && <Badge variant="outline" className="text-[10px] ms-1">بدون ريسبي</Badge>}</div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => addFromPosItem(p.id)}>إضافة</Button>
                    </div>
                  );
                })}
                {filteredPosForAdd.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">لا توجد منتجات</p>}
              </div>
            </TabsContent>
            <TabsContent value="custom" className="space-y-2">
              <Label>اسم الصنف الجديد</Label>
              <Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="مثال: سندوتش خاص بالعرض" />
              <p className="text-xs text-muted-foreground">سيتم إضافة الخامات يدويًا بعد إنشاء الصنف.</p>
              <DialogFooter>
                <Button onClick={addCustomItem}><Plus size={14} /> إضافة الصنف</Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Add ingredient dialog */}
      <Dialog open={showAddIng} onOpenChange={setShowAddIng}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
          <DialogHeader><DialogTitle>إضافة خامة</DialogTitle></DialogHeader>
          <Input placeholder="بحث..." value={ingSearch} onChange={(e) => setIngSearch(e.target.value)} />
          <div className="max-h-[400px] overflow-auto border rounded-md">
            {filteredStockForAdd.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between p-2 border-b text-sm hover:bg-accent">
                <div>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{s.code} • {s.recipe_unit ?? s.stock_unit}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => addIngredient(s.id)}>إضافة</Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddIng(false)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>هل تريد حذف العرض "{deleteTarget?.name}"؟ لا يمكن التراجع.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const Row: React.FC<{ label: string; value: number; bold?: boolean; highlight?: boolean; valueClass?: string }> = ({ label, value, bold, highlight, valueClass }) => (
  <div className={`flex items-center justify-between py-1 ${highlight ? "bg-primary/10 rounded px-2" : ""}`}>
    <span className={bold ? "font-bold" : ""}>{label}</span>
    <span className={`${bold ? "font-bold" : ""} ${valueClass ?? ""}`}>{value.toFixed(2)}</span>
  </div>
);

export default MenuOffersPage;
