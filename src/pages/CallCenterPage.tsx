/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Phone, Plus, Minus, Trash2, Search, Truck, User, MapPin,
  ShoppingCart, LayoutGrid, Banknote, CreditCard, Clock, CheckCircle2,
  ChefHat, PackageCheck, Send
} from "lucide-react";
import { PosReceiptPrint } from "@/components/pos/PosReceiptPrint";

interface CartItem {
  id: string;
  pos_item_id: string;
  name: string;
  category_name: string;
  unit_price: number;
  quantity: number;
  notes?: string;
}

const DELIVERY_STATUSES = [
  { value: "جديد", label: "جديد", icon: Clock, color: "text-amber-500" },
  { value: "قيد التحضير", label: "قيد التحضير", icon: ChefHat, color: "text-blue-500" },
  { value: "خرج للتوصيل", label: "خرج للتوصيل", icon: Truck, color: "text-purple-500" },
  { value: "تم التسليم", label: "تم التسليم", icon: CheckCircle2, color: "text-emerald-500" },
];

const PAYMENT_METHODS = [
  { value: "كاش", label: "كاش", icon: Banknote },
  { value: "فيزا", label: "فيزا", icon: CreditCard },
];

export const CallCenterPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const branchId = (auth.profile as any)?.branch_id || "";
  const queryClient = useQueryClient();
  const receiptRef = useRef<HTMLDivElement>(null);

  // Customer search
  const [phoneSearch, setPhoneSearch] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("كاش");
  const [receiptData, setReceiptData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("new-order");

  // Customer lookup
  const { data: foundCustomer, isFetching: searchingCustomer } = useQuery({
    queryKey: ["customer-search", companyId, phoneSearch],
    queryFn: async () => {
      if (!phoneSearch || phoneSearch.length < 4) return null;
      const { data } = await supabase
        .from("customers")
        .select("*")
        .eq("company_id", companyId!)
        .eq("phone", phoneSearch)
        .maybeSingle();
      return data;
    },
    enabled: !!companyId && phoneSearch.length >= 4,
  });

  // Auto-fill customer data
  useEffect(() => {
    if (foundCustomer) {
      setCustomerName(foundCustomer.name);
      setCustomerPhone(foundCustomer.phone);
      setCustomerAddress(foundCustomer.address || "");
      setCustomerId(foundCustomer.id);
    }
  }, [foundCustomer]);

  // Branches, categories, items
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

  const { data: company } = useQuery({
    queryKey: ["company-info", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("name").eq("id", companyId!).single();
      return data;
    },
    enabled: !!companyId,
  });

  // Active delivery orders
  const { data: activeOrders } = useQuery({
    queryKey: ["call-center-active-orders", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pos_sales")
        .select("*, pos_sale_items(*, pos_items:pos_item_id(name))")
        .eq("company_id", companyId!)
        .eq("order_type", "دليفري")
        .in("delivery_status", ["جديد", "قيد التحضير", "خرج للتوصيل"])
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
    refetchInterval: 15000,
  });

  const filteredItems = useMemo(() => {
    if (!items) return [];
    let filtered = branchId
      ? items.filter((i: any) => !i.branch_id || i.branch_id === branchId)
      : items;
    if (selectedCategory !== "all") {
      filtered = filtered.filter((i: any) => i.category_id === selectedCategory);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((i: any) => i.name.toLowerCase().includes(q) || i.code?.toLowerCase().includes(q));
    }
    return filtered.sort((a: any, b: any) => (a.code || "").localeCompare(b.code || ""));
  }, [items, branchId, selectedCategory, searchQuery]);

  const subtotal = useMemo(() => cart.reduce((s, c) => s + c.unit_price * c.quantity, 0), [cart]);
  const total = subtotal;

  const addToCart = useCallback((item: any) => {
    setCart(prev => {
      const existing = prev.find(c => c.pos_item_id === item.id);
      if (existing) return prev.map(c => c.pos_item_id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { id: crypto.randomUUID(), pos_item_id: item.id, name: item.name, category_name: (item as any).categories?.name || "", unit_price: item.price, quantity: 1 }];
    });
  }, []);

  const updateQty = useCallback((id: string, delta: number) => {
    setCart(prev => prev.map(c => c.id === id ? { ...c, quantity: Math.max(1, c.quantity + delta) } : c));
  }, []);

  const removeFromCart = useCallback((id: string) => {
    setCart(prev => prev.filter(c => c.id !== id));
  }, []);

  const updateItemNotes = useCallback((id: string, notes: string) => {
    setCart(prev => prev.map(c => c.id === id ? { ...c, notes } : c));
  }, []);

  const clearAll = useCallback(() => {
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerAddress("");
    setCustomerId(null);
    setPhoneSearch("");
    setPaymentMethod("كاش");
  }, []);

  // Save/create customer and order
  const saveSale = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("لا يوجد شركة");
      if (!customerPhone) throw new Error("رقم التليفون مطلوب");
      if (!customerName) throw new Error("اسم العميل مطلوب");
      if (!customerAddress) throw new Error("العنوان مطلوب");
      if (cart.length === 0) throw new Error("السلة فارغة");

      // Upsert customer
      let cId = customerId;
      if (!cId) {
        const { data: existingCust } = await supabase
          .from("customers")
          .select("id")
          .eq("company_id", companyId)
          .eq("phone", customerPhone)
          .maybeSingle();

        if (existingCust) {
          cId = existingCust.id;
          await supabase.from("customers").update({ name: customerName, address: customerAddress }).eq("id", cId);
        } else {
          const { data: newCust, error: custErr } = await supabase
            .from("customers")
            .insert({ company_id: companyId, name: customerName, phone: customerPhone, address: customerAddress })
            .select()
            .single();
          if (custErr) throw custErr;
          cId = newCust.id;
        }
      } else {
        await supabase.from("customers").update({ name: customerName, address: customerAddress }).eq("id", cId);
      }

      // Generate invoice number
      const { data: invoiceNum, error: numErr } = await supabase.rpc("generate_invoice_number", { p_company_id: companyId });
      if (numErr) throw numErr;

      // Create sale
      const { data: sale, error: saleErr } = await supabase.from("pos_sales").insert({
        company_id: companyId,
        branch_id: branchId || null,
        invoice_number: invoiceNum,
        date: new Date().toISOString(),
        total_amount: total,
        tax_amount: 0,
        tax_enabled: false,
        tax_rate: 0,
        discount_amount: 0,
        status: "مكتمل",
        order_type: "دليفري",
        payment_method: paymentMethod,
        delivery_status: "جديد",
        customer_id: cId,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_address: customerAddress,
        notes: cart.filter(c => c.notes).map(c => `${c.name}: ${c.notes}`).join(" | ") || null,
      } as any).select().single();
      if (saleErr) throw saleErr;

      const saleItems = cart.map(c => ({
        sale_id: sale.id,
        pos_item_id: c.pos_item_id,
        quantity: c.quantity,
        unit_price: c.unit_price,
        total: c.unit_price * c.quantity,
      }));
      const { error: itemsErr } = await supabase.from("pos_sale_items").insert(saleItems);
      if (itemsErr) throw itemsErr;

      return sale;
    },
    onSuccess: (sale) => {
      const branchName = branches?.find(b => b.id === branchId)?.name || "";
      setReceiptData({
        invoiceNumber: (sale as any).invoice_number,
        branchName,
        customerName,
        date: format(new Date(), "yyyy/MM/dd HH:mm"),
        items: cart.map(c => ({ name: c.name, quantity: c.quantity, unit_price: c.unit_price, notes: c.notes })),
        subtotal, discountAmount: 0, discountLabel: "",
        taxAmount: 0, taxRate: 0, total,
        companyName: company?.name,
        orderType: "دليفري",
        paymentMethod,
      });
      toast.success("تم إنشاء أوردر الدليفري بنجاح");
      clearAll();
      queryClient.invalidateQueries({ queryKey: ["call-center-active-orders"] });
      queryClient.invalidateQueries({ queryKey: ["pos-sales"] });
      queryClient.invalidateQueries({ queryKey: ["pos-daily-stats"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Update delivery status
  const updateStatus = useMutation({
    mutationFn: async ({ saleId, newStatus }: { saleId: string; newStatus: string }) => {
      const { error } = await supabase.from("pos_sales").update({ delivery_status: newStatus } as any).eq("id", saleId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تحديث حالة الأوردر");
      queryClient.invalidateQueries({ queryKey: ["call-center-active-orders"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Print receipt
  const printReceipt = useCallback(() => {
    if (!receiptRef.current) return;
    const printContent = receiptRef.current.innerHTML;
    const printWindow = window.open("", "_blank", "width=320,height=600");
    if (!printWindow) { toast.error("يرجى السماح بالنوافذ المنبثقة"); return; }
    printWindow.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"/><title>إيصال</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap');*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Cairo',monospace;direction:rtl;width:80mm;margin:0 auto;padding:8px;font-size:12px;color:#000;}table{width:100%;border-collapse:collapse;}th,td{padding:2px 0;font-size:10px;}.text-center{text-align:center;}.font-bold{font-weight:bold;}.border-dashed{border-style:dashed;}.border-b{border-bottom-width:1px;}.border-t{border-top-width:1px;}.border-gray-400{border-color:#9ca3af;}.pb-2{padding-bottom:8px;}.pt-2{padding-top:8px;}.mb-2{margin-bottom:8px;}.mt-2{margin-top:8px;}.flex{display:flex;}.justify-between{justify-content:space-between;}.text-gray-500{color:#6b7280;}@media print{body{width:80mm;}}</style></head><body>${printContent}</body></html>`);
    printWindow.document.close();
    printWindow.onload = () => { printWindow.focus(); printWindow.print(); printWindow.close(); };
  }, []);

  useEffect(() => {
    if (receiptData) {
      const timer = setTimeout(() => { printReceipt(); setReceiptData(null); }, 400);
      return () => clearTimeout(timer);
    }
  }, [receiptData, printReceipt]);

  const getNextStatus = (current: string) => {
    const idx = DELIVERY_STATUSES.findIndex(s => s.value === current);
    if (idx < DELIVERY_STATUSES.length - 1) return DELIVERY_STATUSES[idx + 1].value;
    return null;
  };

  return (
    <>
      {receiptData && <PosReceiptPrint ref={receiptRef} {...receiptData} />}

      <div className="flex flex-col h-[calc(100vh-4rem)]" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-card/50">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" />
            <h1 className="text-sm font-bold">الكول سنتر</h1>
            <Badge variant="outline" className="text-[10px]">
              {activeOrders?.length ?? 0} أوردر نشط
            </Badge>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-4 mt-2 grid w-auto grid-cols-2 max-w-xs">
            <TabsTrigger value="new-order" className="text-xs gap-1"><ShoppingCart className="h-3 w-3" />أوردر جديد</TabsTrigger>
            <TabsTrigger value="tracking" className="text-xs gap-1"><Truck className="h-3 w-3" />تتبع الأوردرات</TabsTrigger>
          </TabsList>

          {/* NEW ORDER TAB */}
          <TabsContent value="new-order" className="flex-1 overflow-hidden m-0">
            <div className="flex h-full">
              {/* Left panel - Customer + Cart */}
              <div className="w-[380px] flex flex-col border-l border-border/50 bg-card/30">
                {/* Customer section */}
                <div className="p-3 border-b border-border/50 space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <User className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-bold">بيانات العميل</span>
                  </div>
                  <div className="relative">
                    <Phone className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="بحث برقم التليفون..."
                      value={phoneSearch}
                      onChange={e => {
                        setPhoneSearch(e.target.value);
                        setCustomerPhone(e.target.value);
                        if (!e.target.value) { setCustomerName(""); setCustomerAddress(""); setCustomerId(null); }
                      }}
                      className="glass-input pr-8 text-xs h-8"
                    />
                    {searchingCustomer && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">جاري البحث...</span>}
                  </div>
                  {foundCustomer && (
                    <Badge variant="outline" className="text-[10px] gap-1 border-emerald-500/30 text-emerald-500">
                      <CheckCircle2 className="h-3 w-3" /> عميل مسجل
                    </Badge>
                  )}
                  <Input
                    placeholder="اسم العميل"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    className="glass-input text-xs h-8"
                  />
                  <div className="relative">
                    <MapPin className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="العنوان"
                      value={customerAddress}
                      onChange={e => setCustomerAddress(e.target.value)}
                      className="glass-input pr-8 text-xs h-8"
                    />
                  </div>
                </div>

                {/* Cart */}
                <ScrollArea className="flex-1 p-3">
                  {cart.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-xs">السلة فارغة</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {cart.map(item => (
                        <div key={item.id} className="p-2 rounded-lg bg-muted/30 border border-border/30 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium truncate flex-1">{item.name}</span>
                            <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={() => removeFromCart(item.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                              <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateQty(item.id, -1)}>
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="text-xs font-bold w-6 text-center">{item.quantity}</span>
                              <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateQty(item.id, 1)}>
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                            <span className="text-xs font-bold">{(item.unit_price * item.quantity).toFixed(0)} EGP</span>
                          </div>
                          <Input
                            placeholder="ملاحظة على الصنف..."
                            value={item.notes || ""}
                            onChange={e => updateItemNotes(item.id, e.target.value)}
                            className="glass-input text-[10px] h-6 mt-1"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>

                {/* Footer */}
                <div className="p-3 border-t border-border/50 space-y-2">
                  {/* Payment method */}
                  <div className="flex gap-1">
                    {PAYMENT_METHODS.map(pm => (
                      <Button
                        key={pm.value}
                        variant={paymentMethod === pm.value ? "default" : "outline"}
                        size="sm"
                        className="flex-1 h-7 text-[10px] gap-1"
                        onClick={() => setPaymentMethod(pm.value)}
                      >
                        <pm.icon className="h-3 w-3" />
                        {pm.label}
                      </Button>
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-sm font-bold">
                    <span>الإجمالي</span>
                    <span className="text-primary">{total.toFixed(0)} EGP</span>
                  </div>

                  <Button
                    className="w-full gap-1"
                    disabled={cart.length === 0 || !customerPhone || !customerName || saveSale.isPending}
                    onClick={() => saveSale.mutate()}
                  >
                    <Send className="h-4 w-4" />
                    إرسال الأوردر
                  </Button>
                </div>
              </div>

              {/* Right panel - Menu items */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-3 flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="بحث عن صنف..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="glass-input pr-8 text-xs h-8"
                    />
                  </div>
                </div>

                {/* Categories */}
                <div className="px-3 flex gap-1 overflow-x-auto pb-2">
                  <Button
                    variant={selectedCategory === "all" ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-[10px] shrink-0"
                    onClick={() => setSelectedCategory("all")}
                  >
                    <LayoutGrid className="h-3 w-3 ml-1" />
                    الكل
                  </Button>
                  {categories?.sort((a: any, b: any) => (a.code || "").localeCompare(b.code || "")).map((cat: any) => (
                    <Button
                      key={cat.id}
                      variant={selectedCategory === cat.id ? "default" : "outline"}
                      size="sm"
                      className="h-7 text-[10px] shrink-0"
                      onClick={() => setSelectedCategory(cat.id)}
                    >
                      {cat.name}
                    </Button>
                  ))}
                </div>

                {/* Items grid */}
                <ScrollArea className="flex-1 px-3 pb-3">
                  <div className="grid grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2">
                    {filteredItems.map((item: any) => (
                      <button
                        key={item.id}
                        onClick={() => addToCart(item)}
                        className="p-3 rounded-xl border border-border/30 bg-card/50 hover:bg-primary/10 hover:border-primary/30 transition-all text-center group"
                      >
                        <p className="text-xs font-bold text-foreground truncate">{item.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{(item as any).categories?.name}</p>
                        <p className="text-xs font-bold text-primary mt-1">{item.price} EGP</p>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </TabsContent>

          {/* TRACKING TAB */}
          <TabsContent value="tracking" className="flex-1 overflow-hidden m-0">
            <ScrollArea className="h-full p-4">
              {!activeOrders?.length ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Truck className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">لا توجد أوردرات نشطة</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {activeOrders.map((order: any) => {
                    const statusInfo = DELIVERY_STATUSES.find(s => s.value === order.delivery_status) ?? DELIVERY_STATUSES[0];
                    const nextStatus = getNextStatus(order.delivery_status || "جديد");
                    const StatusIcon = statusInfo.icon;
                    return (
                      <div key={order.id} className="p-4 rounded-xl border border-border/30 bg-card/50 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono text-muted-foreground">{order.invoice_number}</span>
                          <Badge variant="outline" className={cn("text-[10px] gap-1", statusInfo.color)}>
                            <StatusIcon className="h-3 w-3" />
                            {statusInfo.label}
                          </Badge>
                        </div>
                        <div className="space-y-1 text-xs">
                          <div className="flex items-center gap-1.5">
                            <User className="h-3 w-3 text-muted-foreground" />
                            <span>{order.customer_name || "—"}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            <span dir="ltr">{order.customer_phone || "—"}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            <span className="truncate">{order.customer_address || "—"}</span>
                          </div>
                        </div>
                        <div className="text-[10px] text-muted-foreground space-y-0.5">
                          {(order.pos_sale_items as any[])?.map((si: any, i: number) => (
                            <div key={i} className="flex justify-between">
                              <span>{si.pos_items?.name} × {si.quantity}</span>
                              <span>{si.total.toFixed(0)} EGP</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-border/30">
                          <span className="text-xs font-bold text-primary">{order.total_amount.toFixed(0)} EGP</span>
                          {nextStatus && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[10px] gap-1"
                              disabled={updateStatus.isPending}
                              onClick={() => updateStatus.mutate({ saleId: order.id, newStatus: nextStatus })}
                            >
                              {DELIVERY_STATUSES.find(s => s.value === nextStatus)?.label}
                              <PackageCheck className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
};
