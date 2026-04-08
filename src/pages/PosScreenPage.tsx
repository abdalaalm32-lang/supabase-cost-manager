import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Plus, Minus, Trash2, ShoppingCart, CalendarIcon, Store,
  FileText, Printer, AlertCircle, Archive, LayoutGrid, Percent, Tag
} from "lucide-react";

interface CartItem {
  id: string;
  pos_item_id: string;
  name: string;
  category_name: string;
  unit_price: number;
  quantity: number;
}

export const PosScreenPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();

  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [branchId, setBranchId] = useState<string>("");
  const [saleDate, setSaleDate] = useState<Date | undefined>(undefined);
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxRate, setTaxRate] = useState<number>(0);
  const [taxInputVisible, setTaxInputVisible] = useState(false);
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);

  // Load archived sale from navigation state
  useEffect(() => {
    const state = location.state as { editSaleId?: string } | null;
    if (!state?.editSaleId) return;
    const saleId = state.editSaleId;
    // Clear navigation state
    navigate(location.pathname, { replace: true, state: {} });

    (async () => {
      const { data: sale } = await supabase.from("pos_sales").select("*, branches:branch_id(name)").eq("id", saleId).single();
      if (!sale) return;

      const { data: saleItems } = await supabase
        .from("pos_sale_items")
        .select("*, pos_items:pos_item_id(name, categories:category_id(name))")
        .eq("sale_id", saleId);
      if (!saleItems) return;

      setEditingSaleId(saleId);
      setBranchId(sale.branch_id || "");
      setSaleDate(new Date(sale.date));
      setTaxEnabled(sale.tax_enabled);
      setTaxRate(sale.tax_rate || 0);
      setTaxInputVisible(sale.tax_enabled);
      if (sale.discount_amount > 0) {
        setDiscountEnabled(true);
        setDiscountType("fixed");
        setDiscountValue(sale.discount_amount);
      }

      setCart(saleItems.map((item: any) => ({
        id: crypto.randomUUID(),
        pos_item_id: item.pos_item_id,
        name: item.pos_items?.name || "صنف",
        category_name: item.pos_items?.categories?.name || "",
        unit_price: item.unit_price,
        quantity: item.quantity,
      })));

      toast.info("تم تحميل الفاتورة المؤرشفة - يمكنك التعديل عليها");
    })();
  }, [location.state]);

  const { data: branches } = useQuery({
    queryKey: ["branches", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").eq("company_id", companyId!).eq("active", true);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: categories } = useQuery({
    queryKey: ["pos-categories-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").eq("company_id", companyId!).eq("active", true);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: items } = useQuery({
    queryKey: ["pos-items-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("pos_items").select("*, categories:category_id(name)").eq("company_id", companyId!).eq("active", true);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Filter categories by selected branch
  const filteredCategories = useMemo(() => {
    if (!categories) return [];
    if (!branchId) return categories;
    return categories.filter((c) => !c.branch_id || c.branch_id === branchId);
  }, [categories, branchId]);

  const filteredItems = useMemo(() => {
    if (!items) return [];
    let result = items;
    // Filter by branch
    if (branchId) {
      result = result.filter((i) => !i.branch_id || i.branch_id === branchId);
    }
    // Filter by category
    if (selectedCategory !== "all") {
      result = result.filter((i) => i.category_id === selectedCategory);
    }
    return result;
  }, [items, selectedCategory, branchId]);

  const addToCart = (item: any) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.pos_item_id === item.id);
      if (existing) {
        return prev.map((c) => c.pos_item_id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, { id: crypto.randomUUID(), pos_item_id: item.id, name: item.name, category_name: (item.categories as any)?.name || "", unit_price: item.price, quantity: 1 }];
    });
  };

  const updateQty = (id: string, delta: number) => {
    setCart((prev) => prev.map((c) => (c.id === id ? { ...c, quantity: Math.max(0, c.quantity + delta) } : c)).filter((c) => c.quantity > 0));
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((c) => c.id !== id));
  };

  const subtotal = cart.reduce((s, c) => s + c.unit_price * c.quantity, 0);
  const discountAmount = discountEnabled
    ? discountType === "percent"
      ? (subtotal * discountValue) / 100
      : discountValue
    : 0;
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = taxEnabled ? (afterDiscount * taxRate) / 100 : 0;
  const total = afterDiscount + taxAmount;

  const saveSale = useMutation({
    mutationFn: async (status: string) => {
      if (!companyId) throw new Error("No company");
      if (cart.length === 0) throw new Error("السلة فارغة");
      if (!branchId) throw new Error("يجب اختيار الفرع");

      const { data: invoiceNum, error: numErr } = await supabase.rpc("generate_invoice_number", { p_company_id: companyId });
      if (numErr) throw numErr;

      const { data: sale, error: saleErr } = await supabase.from("pos_sales").insert({
        company_id: companyId, branch_id: branchId || null,
        date: saleDate ? saleDate.toISOString() : new Date().toISOString(),
        total_amount: total, status, invoice_number: invoiceNum,
        tax_enabled: taxEnabled, tax_rate: taxEnabled ? taxRate : 0, tax_amount: taxAmount,
        discount_amount: discountAmount,
      } as any).select().single();
      if (saleErr) throw saleErr;

      const saleItems = cart.map((c) => ({ sale_id: sale.id, pos_item_id: c.pos_item_id, quantity: c.quantity, unit_price: c.unit_price, total: c.unit_price * c.quantity }));
      const { error: itemsErr } = await supabase.from("pos_sale_items").insert(saleItems);
      if (itemsErr) throw itemsErr;
      return sale;
    },
    onSuccess: (_, status) => {
      toast.success(status === "مكتمل" ? "تم تنفيذ الفاتورة بنجاح" : "تم أرشفة الفاتورة");
      setCart([]);
      queryClient.invalidateQueries({ queryKey: ["pos-sales"] });
    },
    onError: (e: any) => toast.error(e.message || "حدث خطأ"),
  });

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4 p-4" dir="rtl">
      {/* Right side - Products */}
      <div className="flex-1 flex flex-col gap-4 overflow-hidden">
        {/* Category filter */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          <Button variant={selectedCategory === "all" ? "default" : "outline"} size="sm" className="rounded-full shrink-0" onClick={() => setSelectedCategory("all")}>
            <LayoutGrid className="h-4 w-4 ml-1" />
            الكل
          </Button>
          {filteredCategories?.map((cat) => (
            <Button key={cat.id} variant={selectedCategory === cat.id ? "default" : "outline"} size="sm" className="rounded-full shrink-0" onClick={() => setSelectedCategory(cat.id)}>
              {cat.name}
            </Button>
          ))}
        </div>

        {/* Product grid */}
        <ScrollArea className="flex-1">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3" dir="rtl">
            {filteredItems.map((item) => (
              <div key={item.id} className="glass-card p-4 rounded-2xl flex flex-col gap-2 hover:border-primary/50 transition-all cursor-pointer group" onClick={() => addToCart(item)}>
                <h4 className="font-bold text-foreground text-sm leading-tight">{item.name}</h4>
                <span className="text-xs text-muted-foreground">{(item.categories as any)?.name || "—"}</span>
                <div className="flex items-center justify-between mt-auto">
                  <span className="font-black text-primary text-base">{item.price} EGP</span>
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                    <Plus className="h-4 w-4" />
                  </div>
                </div>
              </div>
            ))}
            {filteredItems.length === 0 && (
              <div className="col-span-full text-center text-muted-foreground py-20">لا توجد أصناف</div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Left side - Invoice */}
      <div className="w-[380px] shrink-0 glass-card rounded-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-border/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <h3 className="font-bold text-foreground">تفاصيل الفاتورة</h3>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">خصم</span>
                <Switch
                  dir="ltr"
                  checked={discountEnabled}
                  onCheckedChange={(v) => {
                    setDiscountEnabled(v);
                    if (!v) setDiscountValue(0);
                  }}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">ضريبة</span>
                <Switch
                  dir="ltr"
                  checked={taxEnabled}
                  onCheckedChange={(v) => {
                    setTaxEnabled(v);
                    if (v) setTaxInputVisible(true);
                    else { setTaxInputVisible(false); setTaxRate(0); }
                  }}
                />
              </div>
            </div>
          </div>

          {discountEnabled && (
            <div className="mb-3">
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border border-border/50 overflow-hidden shrink-0">
                  <button
                    className={cn("px-2.5 py-1.5 text-xs font-medium transition-colors", discountType === "percent" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted")}
                    onClick={() => setDiscountType("percent")}
                  >
                    <Percent className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className={cn("px-2.5 py-1.5 text-xs font-medium transition-colors", discountType === "fixed" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted")}
                    onClick={() => setDiscountType("fixed")}
                  >
                    EGP
                  </button>
                </div>
                <Input
                  type="number"
                  placeholder={discountType === "percent" ? "نسبة الخصم %" : "مبلغ الخصم"}
                  value={discountValue || ""}
                  onChange={(e) => setDiscountValue(Number(e.target.value))}
                  className="glass-input h-9 text-sm"
                />
              </div>
            </div>
          )}

          {taxEnabled && taxInputVisible && (
            <div className="mb-3">
              <div className="flex items-center gap-2">
                <Input type="number" placeholder="نسبة الضريبة %" value={taxRate || ""} onChange={(e) => setTaxRate(Number(e.target.value))} className="glass-input h-9 text-sm" />
                <span className="text-muted-foreground text-sm shrink-0">%</span>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <div className="flex-1">
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger className={cn("glass-input h-9 text-sm", !branchId && "border-destructive/50")}>
                  <Store className="h-4 w-4 ml-1 text-muted-foreground" />
                  <SelectValue placeholder="الفرع *" />
                </SelectTrigger>
                <SelectContent>
                  {branches?.map((b) => (<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("glass-input h-9 text-sm w-full justify-start", !saleDate && "text-muted-foreground")}>
                    <CalendarIcon className="h-4 w-4 ml-1" />
                    {saleDate ? format(saleDate, "yyyy/MM/dd") : "التاريخ"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={saleDate} onSelect={setSaleDate} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>

        {/* Cart items */}
        <ScrollArea className="flex-1 p-4">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 py-20">
              <ShoppingCart className="h-12 w-12 opacity-30" />
              <span className="text-sm">أضف أصناف للفاتورة</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {cart.map((item) => (
                <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-muted/30">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-sm truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.category_name}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateQty(item.id, -1)}><Minus className="h-3 w-3" /></Button>
                    <Input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        if (!isNaN(val) && val > 0) {
                          setCart((prev) => prev.map((c) => c.id === item.id ? { ...c, quantity: val } : c));
                        } else if (e.target.value === "") {
                          setCart((prev) => prev.map((c) => c.id === item.id ? { ...c, quantity: 1 } : c));
                        }
                      }}
                      className="w-12 h-7 text-center font-bold text-foreground text-sm p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateQty(item.id, 1)}><Plus className="h-3 w-3" /></Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-primary text-sm whitespace-nowrap">{(item.unit_price * item.quantity).toFixed(2)}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeFromCart(item.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="p-4 border-t border-border/50 space-y-3">
          {cart.length > 0 && (
            <>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>الإجمالي الفرعي</span>
                <span>{subtotal.toFixed(2)} EGP</span>
              </div>
              {discountEnabled && discountValue > 0 && (
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="gap-1 text-xs text-destructive border-destructive/30">
                    <Tag className="h-3 w-3" />
                    خصم {discountType === "percent" ? `${discountValue}%` : `${discountValue} EGP`}
                  </Badge>
                  <span className="text-sm font-semibold text-destructive">- {discountAmount.toFixed(2)} EGP</span>
                </div>
              )}
              {taxEnabled && taxRate > 0 && (
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="gap-1 text-xs">
                    <AlertCircle className="h-3 w-3" />
                    ضريبة {taxRate}%
                  </Badge>
                  <span className="text-sm font-semibold text-warning">{taxAmount.toFixed(2)} EGP</span>
                </div>
              )}
              <div className="border-t border-border/30 pt-2 flex justify-between items-center">
                <span className="text-muted-foreground text-sm">الإجمالي النهائي</span>
                <span className="text-2xl font-black text-gradient">{total.toFixed(2)} <span className="text-base">EGP</span></span>
              </div>
            </>
          )}

          <div className="flex gap-2">
            <Button className="flex-1 gradient-primary text-primary-foreground font-bold gap-2" disabled={cart.length === 0 || saveSale.isPending} onClick={() => saveSale.mutate("مكتمل")}>
              <Printer className="h-4 w-4" />
              تنفيذ الدفع والطباعة
            </Button>
          </div>
          <Button variant="outline" className="w-full gap-2 text-muted-foreground" disabled={cart.length === 0 || saveSale.isPending} onClick={() => saveSale.mutate("مؤرشف")}>
            <Archive className="h-4 w-4" />
            حفظ كمؤرشف
          </Button>
        </div>
      </div>
    </div>
  );
};
