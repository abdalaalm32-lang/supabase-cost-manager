import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Plus, Minus, Trash2, ShoppingCart, CalendarIcon, Store,
  FileText, Printer, AlertCircle, Archive, LayoutGrid, Percent, Tag,
  Search, Maximize, Minimize, Pause, StickyNote, User, Keyboard,
  UtensilsCrossed, ShoppingBag, Truck, Banknote, CreditCard
} from "lucide-react";
import { PosReceiptPrint } from "@/components/pos/PosReceiptPrint";
import { PosHeldInvoices } from "@/components/pos/PosHeldInvoices";
import { PosDailyStats } from "@/components/pos/PosDailyStats";
import { PosShiftManager } from "@/components/pos/PosShiftManager";

interface CartItem {
  id: string;
  pos_item_id: string;
  name: string;
  category_name: string;
  unit_price: number;
  quantity: number;
  notes?: string;
}

const ORDER_TYPES = [
  { value: "صالة", label: "صالة", icon: UtensilsCrossed },
  { value: "تيك أواي", label: "تيك أواي", icon: ShoppingBag },
  { value: "دليفري", label: "دليفري", icon: Truck },
];

const PAYMENT_METHODS = [
  { value: "كاش", label: "كاش", icon: Banknote },
  { value: "فيزا", label: "فيزا", icon: CreditCard },
];

export const PosScreenPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const receiptRef = useRef<HTMLDivElement>(null);

  // Restore state from sessionStorage
  const saved = useMemo(() => {
    try {
      const raw = sessionStorage.getItem("pos_draft");
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  }, []);

  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [cart, setCart] = useState<CartItem[]>(saved?.cart || []);
  const [branchId, setBranchId] = useState<string>(saved?.branchId || "");
  // Date is always today - no picker needed
  const [taxEnabled, setTaxEnabled] = useState(saved?.taxEnabled || false);
  const [taxRate, setTaxRate] = useState<number>(saved?.taxRate || 0);
  const [taxInputVisible, setTaxInputVisible] = useState(saved?.taxInputVisible || false);
  const [discountEnabled, setDiscountEnabled] = useState(saved?.discountEnabled || false);
  const [discountType, setDiscountType] = useState<"percent" | "fixed">(saved?.discountType || "percent");
  const [discountValue, setDiscountValue] = useState<number>(saved?.discountValue || 0);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(saved?.editingSaleId || null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [customerName, setCustomerName] = useState(saved?.customerName || "");
  const [invoiceNotes, setInvoiceNotes] = useState(saved?.invoiceNotes || "");
  const [receiptData, setReceiptData] = useState<any>(null);
  const [orderType, setOrderType] = useState<string>(saved?.orderType || "صالة");
  const [paymentMethod, setPaymentMethod] = useState<string>(saved?.paymentMethod || "كاش");

  // Persist draft to sessionStorage
  useEffect(() => {
    const draft = { cart, branchId, saleDate: saleDate?.toISOString(), taxEnabled, taxRate, taxInputVisible, discountEnabled, discountType, discountValue, editingSaleId, customerName, invoiceNotes, orderType, paymentMethod };
    sessionStorage.setItem("pos_draft", JSON.stringify(draft));
  }, [cart, branchId, saleDate, taxEnabled, taxRate, taxInputVisible, discountEnabled, discountType, discountValue, editingSaleId, customerName, invoiceNotes, orderType, paymentMethod]);

  // Load archived sale from navigation state
  useEffect(() => {
    const state = location.state as { editSaleId?: string } | null;
    if (!state?.editSaleId) return;
    const saleId = state.editSaleId;
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
      setOrderType((sale as any).order_type || "صالة");
      setPaymentMethod((sale as any).payment_method || "كاش");
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

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F1") { e.preventDefault(); if (cart.length > 0 && !saveSale.isPending) saveSale.mutate("مكتمل"); }
      if (e.key === "F2") { e.preventDefault(); if (cart.length > 0 && !saveSale.isPending) saveSale.mutate("معلق"); }
      if (e.key === "Escape") { e.preventDefault(); clearAll(); }
      if (e.key === "F11") { e.preventDefault(); toggleFullscreen(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [cart, toggleFullscreen]);

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

  const filteredCategories = useMemo(() => {
    if (!categories) return [];
    if (!branchId) return categories;
    return categories.filter((c) => !c.branch_id || c.branch_id === branchId);
  }, [categories, branchId]);

  const filteredItems = useMemo(() => {
    if (!items) return [];
    let result = items;
    if (branchId) result = result.filter((i) => !i.branch_id || i.branch_id === branchId);
    if (selectedCategory !== "all") result = result.filter((i) => i.category_id === selectedCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((i) => i.name.toLowerCase().includes(q) || (i.code && i.code.toLowerCase().includes(q)));
    }
    return result;
  }, [items, selectedCategory, branchId, searchQuery]);

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

  const removeFromCart = (id: string) => setCart((prev) => prev.filter((c) => c.id !== id));

  const clearAll = () => {
    setCart([]);
    setEditingSaleId(null);
    setDiscountEnabled(false);
    setDiscountValue(0);
    setTaxEnabled(false);
    setTaxRate(0);
    setTaxInputVisible(false);
    setSaleDate(undefined);
    setCustomerName("");
    setInvoiceNotes("");
    setShowNotes(false);
    setOrderType("صالة");
    setPaymentMethod("كاش");
    sessionStorage.removeItem("pos_draft");
  };

  const cartItemCount = cart.reduce((s, c) => s + c.quantity, 0);
  const subtotal = cart.reduce((s, c) => s + c.unit_price * c.quantity, 0);
  const discountAmount = discountEnabled
    ? discountType === "percent" ? (subtotal * discountValue) / 100 : discountValue
    : 0;
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = taxEnabled ? (afterDiscount * taxRate) / 100 : 0;
  const total = afterDiscount + taxAmount;

  // Resume held invoice
  const handleResumeHeld = (sale: any, saleItems: any[]) => {
    setEditingSaleId(sale.id);
    setBranchId(sale.branch_id || "");
    setSaleDate(new Date(sale.date));
    setTaxEnabled(sale.tax_enabled);
    setTaxRate(sale.tax_rate || 0);
    setTaxInputVisible(sale.tax_enabled);
    setOrderType(sale.order_type || "صالة");
    setPaymentMethod(sale.payment_method || "كاش");
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
    toast.info("تم استرجاع الفاتورة المعلقة");
  };

  const saveSale = useMutation({
    mutationFn: async (status: string) => {
      if (!companyId) throw new Error("No company");
      if (cart.length === 0) throw new Error("السلة فارغة");
      if (!branchId) throw new Error("يجب اختيار الفرع");

      const salePayload = {
        branch_id: branchId || null,
        date: saleDate ? saleDate.toISOString() : new Date().toISOString(),
        total_amount: total, status,
        tax_enabled: taxEnabled, tax_rate: taxEnabled ? taxRate : 0, tax_amount: taxAmount,
        discount_amount: discountAmount,
        order_type: orderType,
        payment_method: paymentMethod,
        notes: invoiceNotes || null,
      };

      if (editingSaleId) {
        const { data: existingSale } = await supabase.from("pos_sales").select("id, invoice_number").eq("id", editingSaleId).maybeSingle();
        
        if (existingSale) {
          const { error: delErr } = await supabase.from("pos_sale_items").delete().eq("sale_id", editingSaleId);
          if (delErr) throw delErr;

          const { error: saleErr } = await supabase.from("pos_sales").update(salePayload as any).eq("id", editingSaleId);
          if (saleErr) throw saleErr;

          const saleItems = cart.map((c) => ({ sale_id: editingSaleId, pos_item_id: c.pos_item_id, quantity: c.quantity, unit_price: c.unit_price, total: c.unit_price * c.quantity }));
          const { error: itemsErr } = await supabase.from("pos_sale_items").insert(saleItems);
          if (itemsErr) throw itemsErr;

          const { data: updatedSale } = await supabase.from("pos_sales").select("invoice_number").eq("id", editingSaleId).single();
          return { id: editingSaleId, invoice_number: updatedSale?.invoice_number };
        }
        setEditingSaleId(null);
      }

      const { data: invoiceNum, error: numErr } = await supabase.rpc("generate_invoice_number", { p_company_id: companyId });
      if (numErr) throw numErr;

      const { data: sale, error: saleErr } = await supabase.from("pos_sales").insert({
        company_id: companyId, invoice_number: invoiceNum, ...salePayload,
      } as any).select().single();
      if (saleErr) throw saleErr;

      const saleItems = cart.map((c) => ({ sale_id: sale.id, pos_item_id: c.pos_item_id, quantity: c.quantity, unit_price: c.unit_price, total: c.unit_price * c.quantity }));
      const { error: itemsErr } = await supabase.from("pos_sale_items").insert(saleItems);
      if (itemsErr) throw itemsErr;
      return sale;
    },
    onSuccess: (sale, status) => {
      const branchName = branches?.find((b) => b.id === branchId)?.name || "";

      if (status === "مكتمل") {
        setReceiptData({
          invoiceNumber: sale.invoice_number,
          branchName,
          customerName,
          date: format(saleDate || new Date(), "yyyy/MM/dd HH:mm"),
          items: cart.map((c) => ({ name: c.name, quantity: c.quantity, unit_price: c.unit_price })),
          subtotal, discountAmount,
          discountLabel: discountEnabled ? (discountType === "percent" ? `${discountValue}%` : `${discountValue} EGP`) : "",
          taxAmount, taxRate, total,
          companyName: company?.name,
          notes: invoiceNotes || undefined,
          orderType,
          paymentMethod,
        });
        toast.success("تم تنفيذ الفاتورة بنجاح");
      } else if (status === "معلق") {
        toast.success("تم تعليق الفاتورة");
      } else {
        toast.success("تم أرشفة الفاتورة");
      }

      clearAll();
      queryClient.invalidateQueries({ queryKey: ["pos-sales"] });
      queryClient.invalidateQueries({ queryKey: ["pos-held-sales"] });
      queryClient.invalidateQueries({ queryKey: ["pos-daily-stats"] });
      queryClient.invalidateQueries({ queryKey: ["pos-current-shift"] });
      queryClient.invalidateQueries({ queryKey: ["pos-shift-sales"] });
    },
    onError: (e: any) => toast.error(e.message || "حدث خطأ"),
  });

  // Print receipt using printable iframe
  const printReceipt = useCallback(() => {
    if (!receiptRef.current) return;
    const printContent = receiptRef.current.innerHTML;
    const printWindow = window.open("", "_blank", "width=320,height=600");
    if (!printWindow) {
      toast.error("يرجى السماح بالنوافذ المنبثقة للطباعة");
      return;
    }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>إيصال</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap');
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Cairo', monospace; direction: rtl; width: 80mm; margin: 0 auto; padding: 8px; font-size: 12px; color: #000; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 2px 0; font-size: 10px; }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .text-left { text-align: left; }
          .font-bold { font-weight: bold; }
          .text-sm { font-size: 12px; }
          .text-xs { font-size: 10px; }
          .text-\\[9px\\] { font-size: 9px; }
          .text-\\[10px\\] { font-size: 10px; }
          .border-dashed { border-style: dashed; }
          .border-dotted { border-style: dotted; }
          .border-gray-400 { border-color: #9ca3af; }
          .border-gray-200 { border-color: #e5e7eb; }
          .border-b { border-bottom-width: 1px; }
          .border-t { border-top-width: 1px; }
          .pb-2 { padding-bottom: 8px; }
          .pt-2 { padding-top: 8px; }
          .mb-2 { margin-bottom: 8px; }
          .mt-1 { margin-top: 4px; }
          .mt-2 { margin-top: 8px; }
          .mt-3 { margin-top: 12px; }
          .py-1 { padding-top: 4px; padding-bottom: 4px; }
          .pt-1 { padding-top: 4px; }
          .space-y-1 > * + * { margin-top: 4px; }
          .flex { display: flex; }
          .justify-between { justify-content: space-between; }
          .text-gray-500 { color: #6b7280; }
          .w-full { width: 100%; }
          @media print { body { width: 80mm; } }
        </style>
      </head>
      <body>${printContent}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    };
  }, []);

  // Auto-print receipt
  useEffect(() => {
    if (receiptData) {
      const timer = setTimeout(() => {
        printReceipt();
        setReceiptData(null);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [receiptData, printReceipt]);

  return (
    <>
      {/* Print-only receipt */}
      {receiptData && (
        <PosReceiptPrint ref={receiptRef} {...receiptData} />
      )}

      <div className="flex flex-col h-[calc(100vh-4rem)]" dir="rtl">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-card/50 print:hidden flex-wrap gap-2">
          <PosDailyStats companyId={companyId || ""} branchId={branchId} />
          <div className="flex items-center gap-2">
            {companyId && (
              <PosShiftManager companyId={companyId} branchId={branchId} userName={auth.profile?.full_name || ""} />
            )}
            <div className="hidden lg:flex items-center gap-1 text-[10px] text-muted-foreground border border-border/30 rounded-md px-2 py-1">
              <Keyboard className="h-3 w-3" />
              <span>F1 دفع</span>
              <span>·</span>
              <span>F2 تعليق</span>
              <span>·</span>
              <span>Esc مسح</span>
            </div>
            {companyId && (
              <PosHeldInvoices companyId={companyId} branchId={branchId} onResume={handleResumeHeld} />
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleFullscreen}>
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="flex flex-1 gap-4 p-4 overflow-hidden print:hidden">
          {/* Right side - Products */}
          <div className="flex-1 flex flex-col gap-3 overflow-hidden">
            {/* Search */}
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم أو الكود..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="glass-input pr-9 h-9 text-sm"
              />
            </div>

            {/* Category filter */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <Button variant={selectedCategory === "all" ? "default" : "outline"} size="sm" className="rounded-full shrink-0 h-8 text-xs" onClick={() => setSelectedCategory("all")}>
                <LayoutGrid className="h-3.5 w-3.5 ml-1" />
                الكل
              </Button>
              {filteredCategories?.map((cat) => (
                <Button key={cat.id} variant={selectedCategory === cat.id ? "default" : "outline"} size="sm" className="rounded-full shrink-0 h-8 text-xs" onClick={() => setSelectedCategory(cat.id)}>
                  {cat.name}
                </Button>
              ))}
            </div>

            {/* Product grid */}
            <ScrollArea className="flex-1">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5" dir="rtl">
                {filteredItems.map((item) => {
                  const inCart = cart.find((c) => c.pos_item_id === item.id);
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "glass-card p-3 rounded-xl flex flex-col gap-1.5 hover:border-primary/50 transition-all cursor-pointer group relative",
                        inCart && "border-primary/40 bg-primary/5"
                      )}
                      onClick={() => addToCart(item)}
                    >
                      {inCart && (
                        <Badge className="absolute -top-1.5 -left-1.5 h-5 min-w-5 px-1.5 text-[10px] bg-primary text-primary-foreground">
                          {inCart.quantity}
                        </Badge>
                      )}
                      <h4 className="font-bold text-foreground text-xs leading-tight">{item.name}</h4>
                      <span className="text-[10px] text-muted-foreground">{(item.categories as any)?.name || "—"}</span>
                      <div className="flex items-center justify-between mt-auto">
                        <span className="font-black text-primary text-sm">{item.price} EGP</span>
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                          <Plus className="h-3.5 w-3.5" />
                        </div>
                      </div>
                    </div>
                  );
                })}
                {filteredItems.length === 0 && (
                  <div className="col-span-full text-center text-muted-foreground py-20">لا توجد أصناف</div>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Left side - Invoice */}
          <div className="w-[380px] shrink-0 glass-card rounded-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-3 border-b border-border/50">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <h3 className="font-bold text-foreground text-sm">
                    {editingSaleId ? "تعديل فاتورة" : "فاتورة جديدة"}
                  </h3>
                  {cartItemCount > 0 && (
                    <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                      {cartItemCount} صنف
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowNotes(!showNotes)} title="ملاحظات">
                    <StickyNote className={cn("h-3.5 w-3.5", invoiceNotes && "text-primary")} />
                  </Button>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">خصم</span>
                    <Switch dir="ltr" checked={discountEnabled} onCheckedChange={(v) => { setDiscountEnabled(v); if (!v) setDiscountValue(0); }} className="scale-75" />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">ضريبة</span>
                    <Switch dir="ltr" checked={taxEnabled} onCheckedChange={(v) => { setTaxEnabled(v); if (v) setTaxInputVisible(true); else { setTaxInputVisible(false); setTaxRate(0); } }} className="scale-75" />
                  </div>
                </div>
              </div>

              {/* Order Type & Payment Method */}
              <div className="flex gap-2 mb-2">
                {/* Order Type Selector */}
                <div className="flex-1">
                  <div className="flex rounded-lg border border-border/50 overflow-hidden">
                    {ORDER_TYPES.map((type) => (
                      <button
                        key={type.value}
                        className={cn(
                          "flex-1 flex items-center justify-center gap-1 px-1.5 py-1.5 text-[10px] font-medium transition-colors",
                          orderType === type.value
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/30 text-muted-foreground hover:bg-muted/60"
                        )}
                        onClick={() => setOrderType(type.value)}
                      >
                        <type.icon className="h-3 w-3" />
                        {type.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Payment Method Selector */}
              <div className="flex gap-2 mb-2">
                <div className="flex-1">
                  <div className="flex rounded-lg border border-border/50 overflow-hidden">
                    {PAYMENT_METHODS.map((method) => (
                      <button
                        key={method.value}
                        className={cn(
                          "flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-medium transition-colors",
                          paymentMethod === method.value
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/30 text-muted-foreground hover:bg-muted/60"
                        )}
                        onClick={() => setPaymentMethod(method.value)}
                      >
                        <method.icon className="h-3 w-3" />
                        {method.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Customer name */}
              <div className="mb-2">
                <div className="relative">
                  <User className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="اسم العميل / رقم الطاولة (اختياري)"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="glass-input h-8 text-xs pr-8"
                  />
                </div>
              </div>

              {showNotes && (
                <div className="mb-2">
                  <Textarea
                    placeholder="ملاحظات على الفاتورة..."
                    value={invoiceNotes}
                    onChange={(e) => setInvoiceNotes(e.target.value)}
                    className="glass-input text-xs min-h-[50px] resize-none"
                    rows={2}
                  />
                </div>
              )}

              {discountEnabled && (
                <div className="mb-2">
                  <div className="flex items-center gap-2">
                    <div className="flex rounded-lg border border-border/50 overflow-hidden shrink-0">
                      <button className={cn("px-2 py-1 text-[10px] font-medium transition-colors", discountType === "percent" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted")} onClick={() => setDiscountType("percent")}>
                        <Percent className="h-3 w-3" />
                      </button>
                      <button className={cn("px-2 py-1 text-[10px] font-medium transition-colors", discountType === "fixed" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted")} onClick={() => setDiscountType("fixed")}>
                        EGP
                      </button>
                    </div>
                    <Input type="number" placeholder={discountType === "percent" ? "%" : "مبلغ"} value={discountValue || ""} onChange={(e) => setDiscountValue(Number(e.target.value))} className="glass-input h-8 text-xs" />
                  </div>
                </div>
              )}

              {taxEnabled && taxInputVisible && (
                <div className="mb-2">
                  <div className="flex items-center gap-2">
                    <Input type="number" placeholder="نسبة الضريبة %" value={taxRate || ""} onChange={(e) => setTaxRate(Number(e.target.value))} className="glass-input h-8 text-xs" />
                    <span className="text-muted-foreground text-xs shrink-0">%</span>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <div className="flex-1">
                  <Select value={branchId} onValueChange={setBranchId}>
                    <SelectTrigger className={cn("glass-input h-8 text-xs", !branchId && "border-destructive/50")}>
                      <Store className="h-3.5 w-3.5 ml-1 text-muted-foreground" />
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
                      <Button variant="outline" className={cn("glass-input h-8 text-xs w-full justify-start", !saleDate && "text-muted-foreground")}>
                        <CalendarIcon className="h-3.5 w-3.5 ml-1" />
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
            <ScrollArea className="flex-1 p-3">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 py-20">
                  <ShoppingCart className="h-12 w-12 opacity-30" />
                  <span className="text-sm">أضف أصناف للفاتورة</span>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {cart.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 p-2 rounded-lg border border-border/50 bg-muted/30">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground text-xs truncate">{item.name}</p>
                        <p className="text-[10px] text-muted-foreground">{item.category_name}</p>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateQty(item.id, -1)}><Minus className="h-3 w-3" /></Button>
                        <Input
                          type="number" min={1} value={item.quantity}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            if (!isNaN(val) && val > 0) setCart((prev) => prev.map((c) => c.id === item.id ? { ...c, quantity: val } : c));
                            else if (e.target.value === "") setCart((prev) => prev.map((c) => c.id === item.id ? { ...c, quantity: 1 } : c));
                          }}
                          className="w-10 h-6 text-center font-bold text-foreground text-xs p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateQty(item.id, 1)}><Plus className="h-3 w-3" /></Button>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-primary text-xs whitespace-nowrap">{(item.unit_price * item.quantity).toFixed(2)}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => removeFromCart(item.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Footer */}
            <div className="p-3 border-t border-border/50 space-y-2">
              {cart.length > 0 && (
                <>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>الإجمالي الفرعي</span>
                    <span>{subtotal.toFixed(2)} EGP</span>
                  </div>
                  {discountEnabled && discountValue > 0 && (
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="gap-1 text-[10px] text-destructive border-destructive/30">
                        <Tag className="h-2.5 w-2.5" />
                        خصم {discountType === "percent" ? `${discountValue}%` : `${discountValue} EGP`}
                      </Badge>
                      <span className="text-xs font-semibold text-destructive">- {discountAmount.toFixed(2)} EGP</span>
                    </div>
                  )}
                  {taxEnabled && taxRate > 0 && (
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <AlertCircle className="h-2.5 w-2.5" />
                        ضريبة {taxRate}%
                      </Badge>
                      <span className="text-xs font-semibold text-warning">{taxAmount.toFixed(2)} EGP</span>
                    </div>
                  )}
                  <div className="border-t border-border/30 pt-2 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs">الإجمالي النهائي</span>
                      <Badge variant="outline" className="text-[9px] h-4 px-1">
                        {ORDER_TYPES.find(t => t.value === orderType)?.label} · {paymentMethod}
                      </Badge>
                    </div>
                    <span className="text-xl font-black text-gradient">{total.toFixed(2)} <span className="text-sm">EGP</span></span>
                  </div>
                </>
              )}

              <div className="flex gap-2">
                <Button className="flex-1 gradient-primary text-primary-foreground font-bold gap-1.5 text-xs h-9" disabled={cart.length === 0 || saveSale.isPending} onClick={() => saveSale.mutate("مكتمل")}>
                  <Printer className="h-3.5 w-3.5" />
                  تنفيذ الدفع والطباعة
                </Button>
                <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" disabled={cart.length === 0 || saveSale.isPending} onClick={() => saveSale.mutate("معلق")} title="تعليق الفاتورة (F2)">
                  <Pause className="h-4 w-4" />
                </Button>
              </div>
              <Button variant="outline" className="w-full gap-1.5 text-muted-foreground text-xs h-8" disabled={cart.length === 0 || saveSale.isPending} onClick={() => saveSale.mutate("مؤرشف")}>
                <Archive className="h-3.5 w-3.5" />
                حفظ كمؤرشف
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body > *:not(.print\\:block) { display: none !important; }
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          @page { size: 80mm auto; margin: 0; }
        }
      `}</style>
    </>
  );
};
