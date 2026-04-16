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
  ChefHat, PackageCheck, Send, Star, PhoneCall, MessageSquare,
  Users, TrendingUp, FileText, AlertCircle
} from "lucide-react";
import { PosReceiptPrint } from "@/components/pos/PosReceiptPrint";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

const FEEDBACK_TYPES = [
  { value: "شكوى", label: "شكوى", color: "text-red-500" },
  { value: "مقترح", label: "مقترح", color: "text-blue-500" },
];

const FEEDBACK_STATUSES = [
  { value: "جديد", label: "جديد", color: "bg-amber-500/10 text-amber-500 border-amber-500/30" },
  { value: "قيد المراجعة", label: "قيد المراجعة", color: "bg-blue-500/10 text-blue-500 border-blue-500/30" },
  { value: "تم الحل", label: "تم الحل", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" },
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
  const [customerPhone2, setCustomerPhone2] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [deliveryFee, setDeliveryFee] = useState<number>(0);
  // driver selection removed - cashier handles it

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("كاش");
  const [receiptData, setReceiptData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("new-order");

  // Rating dialog
  const [ratingDialog, setRatingDialog] = useState<{ open: boolean; saleId: string; currentRating: number }>({ open: false, saleId: "", currentRating: 0 });
  const [ratingValue, setRatingValue] = useState(0);

  // Feedback dialog
  const [feedbackDialog, setFeedbackDialog] = useState(false);
  const [feedbackCustomerId, setFeedbackCustomerId] = useState<string | null>(null);
  const [feedbackCustomerName, setFeedbackCustomerName] = useState("");
  const [feedbackCustomerPhone, setFeedbackCustomerPhone] = useState("");
  const [feedbackType, setFeedbackType] = useState("شكوى");
  const [feedbackMessage, setFeedbackMessage] = useState("");

  // Feedback detail dialog
  const [feedbackDetailDialog, setFeedbackDetailDialog] = useState<any>(null);
  const [feedbackReply, setFeedbackReply] = useState("");
  const [feedbackStatusUpdate, setFeedbackStatusUpdate] = useState("");

  // Customer registry search
  const [customerRegistrySearch, setCustomerRegistrySearch] = useState("");

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
      setCustomerPhone2((foundCustomer as any).phone2 || "");
      setCustomerAddress(foundCustomer.address || "");
      setCustomerId(foundCustomer.id);
    }
  }, [foundCustomer]);

  // Driver selection removed - handled by cashier in POS

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

  // Delivered orders
  const { data: deliveredOrders } = useQuery({
    queryKey: ["call-center-delivered-orders", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pos_sales")
        .select("*, pos_sale_items(*, pos_items:pos_item_id(name))")
        .eq("company_id", companyId!)
        .eq("order_type", "دليفري")
        .eq("delivery_status", "تم التسليم")
        .order("date", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // All customers
  const { data: allCustomers } = useQuery({
    queryKey: ["call-center-customers", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Customer feedback
  const { data: allFeedback } = useQuery({
    queryKey: ["call-center-feedback", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_feedback")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Customer order counts
  const customerOrderStats = useMemo(() => {
    if (!deliveredOrders) return {};
    const stats: Record<string, { count: number; total: number }> = {};
    deliveredOrders.forEach((o: any) => {
      if (o.customer_phone) {
        if (!stats[o.customer_phone]) stats[o.customer_phone] = { count: 0, total: 0 };
        stats[o.customer_phone].count++;
        stats[o.customer_phone].total += o.total_amount;
      }
    });
    return stats;
  }, [deliveredOrders]);

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

  const filteredCustomers = useMemo(() => {
    if (!allCustomers) return [];
    if (!customerRegistrySearch) return allCustomers;
    const q = customerRegistrySearch.toLowerCase();
    return allCustomers.filter((c: any) => c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.address?.toLowerCase().includes(q));
  }, [allCustomers, customerRegistrySearch]);

  const subtotal = useMemo(() => cart.reduce((s, c) => s + c.unit_price * c.quantity, 0), [cart]);
  const total = subtotal;

  // Delivered orders stats
  const deliveredStats = useMemo(() => {
    if (!deliveredOrders) return { count: 0, total: 0, avgRating: 0, ratedCount: 0, topCustomer: "" };
    const totalAmount = deliveredOrders.reduce((s: number, o: any) => s + o.total_amount, 0);
    const rated = deliveredOrders.filter((o: any) => o.customer_rating);
    const avgRating = rated.length > 0 ? rated.reduce((s: number, o: any) => s + (o.customer_rating || 0), 0) / rated.length : 0;
    
    // Top customer
    const customerCounts: Record<string, { name: string; count: number }> = {};
    deliveredOrders.forEach((o: any) => {
      if (o.customer_name) {
        if (!customerCounts[o.customer_name]) customerCounts[o.customer_name] = { name: o.customer_name, count: 0 };
        customerCounts[o.customer_name].count++;
      }
    });
    const topCustomer = Object.values(customerCounts).sort((a, b) => b.count - a.count)[0]?.name || "—";

    return { count: deliveredOrders.length, total: totalAmount, avgRating, ratedCount: rated.length, topCustomer };
  }, [deliveredOrders]);

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
    setCustomerPhone2("");
    setCustomerAddress("");
    setCustomerId(null);
    setPhoneSearch("");
    setPaymentMethod("كاش");
    setDeliveryFee(0);
  }, []);

  // Save/create customer and order
  const saveSale = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("لا يوجد شركة");
      if (!customerPhone) throw new Error("رقم التليفون مطلوب");
      if (!customerName) throw new Error("اسم العميل مطلوب");
      if (!customerAddress) throw new Error("العنوان مطلوب");
      if (cart.length === 0) throw new Error("السلة فارغة");

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
          await supabase.from("customers").update({ name: customerName, address: customerAddress, phone2: customerPhone2 || null } as any).eq("id", cId);
        } else {
          const { data: newCust, error: custErr } = await supabase
            .from("customers")
            .insert({ company_id: companyId, name: customerName, phone: customerPhone, phone2: customerPhone2 || null, address: customerAddress } as any)
            .select()
            .single();
          if (custErr) throw custErr;
          cId = newCust.id;
        }
      } else {
        await supabase.from("customers").update({ name: customerName, address: customerAddress, phone2: customerPhone2 || null } as any).eq("id", cId);
      }

      const { data: invoiceNum, error: numErr } = await supabase.rpc("generate_invoice_number", { p_company_id: companyId });
      if (numErr) throw numErr;

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
        delivery_fee: deliveryFee || 0,
        driver_id: null,
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
      queryClient.invalidateQueries({ queryKey: ["call-center-delivered-orders"] });
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
      queryClient.invalidateQueries({ queryKey: ["call-center-delivered-orders"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Save rating
  const saveRating = useMutation({
    mutationFn: async ({ saleId, rating }: { saleId: string; rating: number }) => {
      const { error } = await supabase.from("pos_sales").update({ customer_rating: rating } as any).eq("id", saleId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حفظ التقييم");
      setRatingDialog({ open: false, saleId: "", currentRating: 0 });
      queryClient.invalidateQueries({ queryKey: ["call-center-delivered-orders"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Save feedback
  const saveFeedback = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("لا يوجد شركة");
      if (!feedbackMessage.trim()) throw new Error("يرجى كتابة الرسالة");
      if (!feedbackCustomerName.trim()) throw new Error("اسم العميل مطلوب");

      const { error } = await supabase.from("customer_feedback").insert({
        company_id: companyId,
        customer_id: feedbackCustomerId,
        customer_name: feedbackCustomerName,
        customer_phone: feedbackCustomerPhone || null,
        type: feedbackType,
        message: feedbackMessage,
        status: "جديد",
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تسجيل الشكوى/المقترح بنجاح");
      setFeedbackDialog(false);
      setFeedbackMessage("");
      setFeedbackCustomerId(null);
      setFeedbackCustomerName("");
      setFeedbackCustomerPhone("");
      setFeedbackType("شكوى");
      queryClient.invalidateQueries({ queryKey: ["call-center-feedback"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Update feedback status/reply
  const updateFeedback = useMutation({
    mutationFn: async ({ id, status, reply }: { id: string; status: string; reply?: string }) => {
      const updateData: any = { status };
      if (reply !== undefined) updateData.reply = reply;
      if (status === "تم الحل") updateData.resolved_at = new Date().toISOString();
      const { error } = await supabase.from("customer_feedback").update(updateData).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم التحديث");
      setFeedbackDetailDialog(null);
      queryClient.invalidateQueries({ queryKey: ["call-center-feedback"] });
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

  const renderStars = (rating: number, interactive = false, onSelect?: (v: number) => void) => (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(v => (
        <Star
          key={v}
          className={cn(
            "h-4 w-4 transition-colors",
            v <= rating ? "text-amber-400 fill-amber-400" : "text-muted-foreground/30",
            interactive && "cursor-pointer hover:text-amber-400"
          )}
          onClick={() => interactive && onSelect?.(v)}
        />
      ))}
    </div>
  );

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
          <TabsList className="mx-4 mt-2 grid w-auto grid-cols-4 max-w-lg">
            <TabsTrigger value="new-order" className="text-xs gap-1"><ShoppingCart className="h-3 w-3" />أوردر جديد</TabsTrigger>
            <TabsTrigger value="tracking" className="text-xs gap-1"><Truck className="h-3 w-3" />تتبع الأوردرات</TabsTrigger>
            <TabsTrigger value="delivered" className="text-xs gap-1"><PackageCheck className="h-3 w-3" />تم التسليم</TabsTrigger>
            <TabsTrigger value="customers" className="text-xs gap-1"><Users className="h-3 w-3" />سجل العملاء</TabsTrigger>
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
                        if (!e.target.value) { setCustomerName(""); setCustomerPhone2(""); setCustomerAddress(""); setCustomerId(null); }
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
                    <Phone className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground opacity-50" />
                    <Input
                      placeholder="رقم تليفون ثاني (اختياري)"
                      value={customerPhone2}
                      onChange={e => setCustomerPhone2(e.target.value)}
                      className="glass-input pr-8 text-xs h-8"
                    />
                  </div>
                  <div className="relative">
                    <MapPin className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="العنوان"
                      value={customerAddress}
                      onChange={e => setCustomerAddress(e.target.value)}
                      className="glass-input pr-8 text-xs h-8"
                    />
                  </div>
                  <div className="relative">
                    <Truck className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      type="number"
                      placeholder="رسوم التوصيل"
                      value={deliveryFee || ""}
                      onChange={e => setDeliveryFee(Number(e.target.value))}
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

                  {deliveryFee > 0 && (
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>رسوم التوصيل</span>
                      <span>{deliveryFee.toFixed(0)} EGP</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-sm font-bold">
                    <span>الإجمالي</span>
                    <span className="text-primary">{(total + deliveryFee).toFixed(0)} EGP</span>
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
                            {order.customer_phone && (
                              <a href={`tel:${order.customer_phone}`} className="mr-1">
                                <PhoneCall className="h-3 w-3 text-emerald-500 hover:text-emerald-400" />
                              </a>
                            )}
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

          {/* DELIVERED ORDERS TAB */}
          <TabsContent value="delivered" className="flex-1 overflow-hidden m-0">
            <ScrollArea className="h-full p-4">
              {/* Stats cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <Card className="bg-card/50 border-border/30">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <PackageCheck className="h-4 w-4 text-emerald-500" />
                      <span className="text-[10px] text-muted-foreground">عدد الأوردرات</span>
                    </div>
                    <p className="text-lg font-bold">{deliveredStats.count}</p>
                  </CardContent>
                </Card>
                <Card className="bg-card/50 border-border/30">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      <span className="text-[10px] text-muted-foreground">إجمالي المبيعات</span>
                    </div>
                    <p className="text-lg font-bold">{deliveredStats.total.toFixed(0)} <span className="text-xs text-muted-foreground">EGP</span></p>
                  </CardContent>
                </Card>
                <Card className="bg-card/50 border-border/30">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Star className="h-4 w-4 text-amber-400" />
                      <span className="text-[10px] text-muted-foreground">متوسط التقييم</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-bold">{deliveredStats.avgRating.toFixed(1)}</p>
                      {renderStars(Math.round(deliveredStats.avgRating))}
                    </div>
                    <p className="text-[10px] text-muted-foreground">{deliveredStats.ratedCount} تقييم</p>
                  </CardContent>
                </Card>
                <Card className="bg-card/50 border-border/30">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <User className="h-4 w-4 text-blue-500" />
                      <span className="text-[10px] text-muted-foreground">أكثر عميل طلباً</span>
                    </div>
                    <p className="text-sm font-bold truncate">{deliveredStats.topCustomer}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Delivered orders list */}
              {!deliveredOrders?.length ? (
                <div className="text-center py-16 text-muted-foreground">
                  <PackageCheck className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">لا توجد أوردرات مستلمة</p>
                </div>
              ) : (
                <div className="rounded-lg border border-border/30 overflow-hidden" dir="rtl">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs text-right">رقم الفاتورة</TableHead>
                        <TableHead className="text-xs text-right">العميل</TableHead>
                        <TableHead className="text-xs text-right">التليفون</TableHead>
                        <TableHead className="text-xs text-right">الإجمالي</TableHead>
                        <TableHead className="text-xs text-right">التاريخ</TableHead>
                        <TableHead className="text-xs text-right">التقييم</TableHead>
                        <TableHead className="text-xs text-right">إجراءات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deliveredOrders.map((order: any) => (
                        <TableRow key={order.id}>
                          <TableCell className="text-xs text-right font-mono">{order.invoice_number}</TableCell>
                          <TableCell className="text-xs text-right">{order.customer_name || "—"}</TableCell>
                          <TableCell className="text-xs text-right" dir="ltr">{order.customer_phone || "—"}</TableCell>
                          <TableCell className="text-xs text-right font-bold">{order.total_amount.toFixed(0)} EGP</TableCell>
                          <TableCell className="text-xs text-right">{format(new Date(order.date), "yyyy/MM/dd HH:mm")}</TableCell>
                          <TableCell className="text-right">
                            {order.customer_rating ? renderStars(order.customer_rating) : (
                              <span className="text-[10px] text-muted-foreground">بدون تقييم</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[10px] gap-1"
                                onClick={() => {
                                  setRatingValue(order.customer_rating || 0);
                                  setRatingDialog({ open: true, saleId: order.id, currentRating: order.customer_rating || 0 });
                                }}
                              >
                                <Star className="h-3 w-3" /> تقييم
                              </Button>
                              {order.customer_phone && (
                                <a href={`tel:${order.customer_phone}`}>
                                  <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 text-emerald-500">
                                    <PhoneCall className="h-3 w-3" /> اتصال
                                  </Button>
                                </a>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* CUSTOMERS TAB */}
          <TabsContent value="customers" className="flex-1 overflow-hidden m-0">
            <div className="flex h-full">
              {/* Customer list */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-3 flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="بحث باسم العميل أو التليفون..."
                      value={customerRegistrySearch}
                      onChange={e => setCustomerRegistrySearch(e.target.value)}
                      className="glass-input pr-8 text-xs h-8"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1"
                    onClick={() => setFeedbackDialog(true)}
                  >
                    <Plus className="h-3 w-3" /> شكوى / مقترح
                  </Button>
                </div>

                <ScrollArea className="flex-1 p-3">
                  {/* Customer cards */}
                  {!filteredCustomers.length ? (
                    <div className="text-center py-16 text-muted-foreground">
                      <Users className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      <p className="text-sm">لا يوجد عملاء</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Customers Table */}
                      <div className="rounded-lg border border-border/30 overflow-hidden" dir="rtl">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs text-right">الاسم</TableHead>
                              <TableHead className="text-xs text-right">التليفون</TableHead>
                              <TableHead className="text-xs text-right">العنوان</TableHead>
                              <TableHead className="text-xs text-right">عدد الطلبات</TableHead>
                              <TableHead className="text-xs text-right">إجمالي المشتريات</TableHead>
                              <TableHead className="text-xs text-right">اتصال</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredCustomers.map((cust: any) => {
                              const stats = customerOrderStats[cust.phone] || { count: 0, total: 0 };
                              return (
                                <TableRow key={cust.id}>
                                  <TableCell className="text-xs text-right font-medium">{cust.name}</TableCell>
                                  <TableCell className="text-xs text-right" dir="ltr">{cust.phone}</TableCell>
                                  <TableCell className="text-xs text-right truncate max-w-[200px]">{cust.address || "—"}</TableCell>
                                  <TableCell className="text-xs text-right">{stats.count}</TableCell>
                                  <TableCell className="text-xs text-right font-bold">{stats.total.toFixed(0)} EGP</TableCell>
                                  <TableCell className="text-right">
                                    <a href={`tel:${cust.phone}`}>
                                      <Button variant="ghost" size="icon" className="h-6 w-6 text-emerald-500">
                                        <PhoneCall className="h-3 w-3" />
                                      </Button>
                                    </a>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Feedback section */}
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <MessageSquare className="h-4 w-4 text-primary" />
                          <h2 className="text-sm font-bold">الشكاوى والمقترحات</h2>
                          <Badge variant="outline" className="text-[10px]">{allFeedback?.length ?? 0}</Badge>
                        </div>

                        {!allFeedback?.length ? (
                          <div className="text-center py-8 text-muted-foreground">
                            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-20" />
                            <p className="text-xs">لا توجد شكاوى أو مقترحات</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                            {allFeedback.map((fb: any) => {
                              const typeInfo = FEEDBACK_TYPES.find(t => t.value === fb.type) ?? FEEDBACK_TYPES[0];
                              const statusInfo = FEEDBACK_STATUSES.find(s => s.value === fb.status) ?? FEEDBACK_STATUSES[0];
                              return (
                                <div
                                  key={fb.id}
                                  className="p-3 rounded-xl border border-border/30 bg-card/50 space-y-2 cursor-pointer hover:border-primary/30 transition-colors"
                                  onClick={() => {
                                    setFeedbackDetailDialog(fb);
                                    setFeedbackReply(fb.reply || "");
                                    setFeedbackStatusUpdate(fb.status);
                                  }}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                      {fb.type === "شكوى" ? (
                                        <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                                      ) : (
                                        <FileText className="h-3.5 w-3.5 text-blue-500" />
                                      )}
                                      <span className={cn("text-xs font-bold", typeInfo.color)}>{fb.type}</span>
                                    </div>
                                    <Badge variant="outline" className={cn("text-[10px]", statusInfo.color)}>
                                      {fb.status}
                                    </Badge>
                                  </div>
                                  <div className="space-y-1 text-xs">
                                    <div className="flex items-center gap-1.5">
                                      <User className="h-3 w-3 text-muted-foreground" />
                                      <span>{fb.customer_name}</span>
                                    </div>
                                    {fb.customer_phone && (
                                      <div className="flex items-center gap-1.5">
                                        <Phone className="h-3 w-3 text-muted-foreground" />
                                        <span dir="ltr">{fb.customer_phone}</span>
                                      </div>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-muted-foreground line-clamp-2">{fb.message}</p>
                                  <p className="text-[10px] text-muted-foreground">{format(new Date(fb.created_at), "yyyy/MM/dd HH:mm")}</p>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Rating Dialog */}
      <Dialog open={ratingDialog.open} onOpenChange={open => !open && setRatingDialog({ open: false, saleId: "", currentRating: 0 })}>
        <DialogContent className="max-w-xs" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-sm">تقييم العميل</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map(v => (
                <Star
                  key={v}
                  className={cn(
                    "h-8 w-8 cursor-pointer transition-colors",
                    v <= ratingValue ? "text-amber-400 fill-amber-400" : "text-muted-foreground/30 hover:text-amber-300"
                  )}
                  onClick={() => setRatingValue(v)}
                />
              ))}
            </div>
            <span className="text-sm font-bold">{ratingValue > 0 ? `${ratingValue} / 5` : "اختر التقييم"}</span>
          </div>
          <DialogFooter>
            <Button
              size="sm"
              disabled={ratingValue === 0 || saveRating.isPending}
              onClick={() => saveRating.mutate({ saleId: ratingDialog.saleId, rating: ratingValue })}
            >
              حفظ التقييم
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Feedback Dialog */}
      <Dialog open={feedbackDialog} onOpenChange={setFeedbackDialog}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-sm">إضافة شكوى / مقترح</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              {FEEDBACK_TYPES.map(ft => (
                <Button
                  key={ft.value}
                  variant={feedbackType === ft.value ? "default" : "outline"}
                  size="sm"
                  className="flex-1 h-8 text-xs"
                  onClick={() => setFeedbackType(ft.value)}
                >
                  {ft.label}
                </Button>
              ))}
            </div>
            <Input
              placeholder="اسم العميل"
              value={feedbackCustomerName}
              onChange={e => setFeedbackCustomerName(e.target.value)}
              className="text-xs h-8"
            />
            <Input
              placeholder="رقم التليفون (اختياري)"
              value={feedbackCustomerPhone}
              onChange={e => setFeedbackCustomerPhone(e.target.value)}
              className="text-xs h-8"
            />
            <Textarea
              placeholder="تفاصيل الشكوى أو المقترح..."
              value={feedbackMessage}
              onChange={e => setFeedbackMessage(e.target.value)}
              className="text-xs min-h-[80px]"
            />
          </div>
          <DialogFooter>
            <Button
              size="sm"
              disabled={!feedbackCustomerName || !feedbackMessage || saveFeedback.isPending}
              onClick={() => saveFeedback.mutate()}
            >
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Feedback Detail Dialog */}
      <Dialog open={!!feedbackDetailDialog} onOpenChange={open => !open && setFeedbackDetailDialog(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              {feedbackDetailDialog?.type === "شكوى" ? (
                <AlertCircle className="h-4 w-4 text-red-500" />
              ) : (
                <FileText className="h-4 w-4 text-blue-500" />
              )}
              {feedbackDetailDialog?.type} - {feedbackDetailDialog?.customer_name}
            </DialogTitle>
          </DialogHeader>
          {feedbackDetailDialog && (
            <div className="space-y-3">
              <div className="space-y-1.5 text-xs">
                {feedbackDetailDialog.customer_phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-3 w-3 text-muted-foreground" />
                    <span dir="ltr">{feedbackDetailDialog.customer_phone}</span>
                    <a href={`tel:${feedbackDetailDialog.customer_phone}`} className="mr-1">
                      <PhoneCall className="h-3 w-3 text-emerald-500" />
                    </a>
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground">{format(new Date(feedbackDetailDialog.created_at), "yyyy/MM/dd HH:mm")}</p>
              </div>

              <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
                <p className="text-xs">{feedbackDetailDialog.message}</p>
              </div>

              <div>
                <label className="text-xs font-medium mb-1 block">الحالة</label>
                <Select value={feedbackStatusUpdate} onValueChange={setFeedbackStatusUpdate}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FEEDBACK_STATUSES.map(s => (
                      <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium mb-1 block">الرد</label>
                <Textarea
                  placeholder="اكتب الرد..."
                  value={feedbackReply}
                  onChange={e => setFeedbackReply(e.target.value)}
                  className="text-xs min-h-[60px]"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              size="sm"
              disabled={updateFeedback.isPending}
              onClick={() => updateFeedback.mutate({
                id: feedbackDetailDialog.id,
                status: feedbackStatusUpdate,
                reply: feedbackReply,
              })}
            >
              حفظ التحديث
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
