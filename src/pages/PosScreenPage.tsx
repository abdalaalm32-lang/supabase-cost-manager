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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Plus, Minus, Trash2, ShoppingCart, CalendarIcon, Store,
  FileText, Printer, AlertCircle, Archive, LayoutGrid, Percent, Tag,
  Search, Maximize, Minimize, Pause, User, Keyboard,
  UtensilsCrossed, ShoppingBag, Truck, Banknote, CreditCard, Bell,
  ChefHat, CheckCircle2, Clock, MapPin, Phone, PlayCircle
} from "lucide-react";
import { PosReceiptPrint } from "@/components/pos/PosReceiptPrint";
import { PosHeldInvoices } from "@/components/pos/PosHeldInvoices";
import { PosDailyStats } from "@/components/pos/PosDailyStats";
import { PosShiftManager } from "@/components/pos/PosShiftManager";
import { PosShiftExpenses } from "@/components/pos/PosShiftExpenses";
import { PosReturnsManager } from "@/components/pos/PosReturnsManager";

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

const DELIVERY_STATUSES = [
  { value: "جديد", label: "جديد", icon: Clock, color: "text-amber-500" },
  { value: "قيد التحضير", label: "قيد التحضير", icon: ChefHat, color: "text-blue-500" },
  { value: "خرج للتوصيل", label: "خرج للتوصيل", icon: Truck, color: "text-purple-500" },
  { value: "تم التسليم", label: "تم التسليم", icon: CheckCircle2, color: "text-emerald-500" },
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
  const [saleDate, setSaleDate] = useState<Date>(saved?.saleDate ? new Date(saved.saleDate) : new Date());
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
  
  const [receiptData, setReceiptData] = useState<any>(null);
  const [orderType, setOrderType] = useState<string>(saved?.orderType || "صالة");
  const [paymentMethod, setPaymentMethod] = useState<string>(saved?.paymentMethod || "كاش");

  // Delivery orders notification
  const [newDeliveryCount, setNewDeliveryCount] = useState(0);
  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false);
  const deliveryAudioRef = useRef<HTMLAudioElement | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [deliveryFee, setDeliveryFee] = useState<number>(saved?.deliveryFee || 0);

  // Current shift query for expenses
  const { data: currentShiftForExpenses } = useQuery({
    queryKey: ["pos-current-shift", companyId, branchId],
    queryFn: async () => {
      let query = supabase
        .from("pos_shifts")
        .select("id")
        .eq("company_id", companyId!)
        .eq("status", "مفتوح")
        .order("opened_at", { ascending: false })
        .limit(1);
      if (branchId) query = query.eq("branch_id", branchId);
      const { data, error } = await query;
      if (error) throw error;
      return data?.[0] || null;
    },
    enabled: !!companyId,
  });

  // Pending delivery orders query
  const { data: pendingDeliveryOrders } = useQuery({
    queryKey: ["pos-pending-delivery", companyId, branchId],
    queryFn: async () => {
      let query = supabase
        .from("pos_sales")
        .select("id, invoice_number, customer_name, customer_phone, customer_address, customer_id, total_amount, delivery_fee, date, delivery_status, driver_id, notes, discount_amount, tax_amount, tax_rate, payment_method, branch_id, assigned_cashier_id")
        .eq("company_id", companyId!)
        .eq("order_type", "دليفري")
        .in("delivery_status", ["جديد", "قيد التحضير", "خرج للتوصيل"])
        .order("date", { ascending: false });
      if (branchId) {
        query = query.eq("branch_id", branchId);
      }
      const { data, error } = await query;
      if (error) throw error;

      // Filter by assigned_cashier_id: show orders assigned to current user OR unassigned
      const currentProfileId = auth.profile?.id;
      const filtered = (data || []).filter((o: any) => !o.assigned_cashier_id || o.assigned_cashier_id === currentProfileId);

      // Fetch phone2 for customers
      const customerIds = [...new Set(filtered.map((o: any) => o.customer_id).filter(Boolean))];
      let phone2Map: Record<string, string> = {};
      if (customerIds.length > 0) {
        const { data: customers } = await supabase
          .from("customers")
          .select("id, phone2")
          .in("id", customerIds);
        if (customers) {
          customers.forEach((c: any) => { if (c.phone2) phone2Map[c.id] = c.phone2; });
        }
      }
      return filtered.map((o: any) => ({ ...o, customer_phone2: o.customer_id ? phone2Map[o.customer_id] || null : null }));
    },
    enabled: !!companyId,
    refetchInterval: 15000,
  });

  // Fetch items for expanded delivery order
  const { data: expandedOrderItems } = useQuery({
    queryKey: ["delivery-order-items", expandedOrderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pos_sale_items")
        .select("*, pos_items:pos_item_id(name)")
        .eq("sale_id", expandedOrderId!);
      if (error) throw error;
      return data;
    },
    enabled: !!expandedOrderId,
  });

  // Delivery drivers
  const { data: deliveryDrivers } = useQuery({
    queryKey: ["delivery-drivers", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_drivers")
        .select("*")
        .eq("company_id", companyId!)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Realtime subscription for new delivery orders
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel("pos-delivery-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "pos_sales",
          filter: `company_id=eq.${companyId}`,
        },
        (payload: any) => {
          if (payload.new?.order_type === "دليفري" && payload.new?.delivery_status === "جديد") {
            // Only notify if the order is for the selected branch
            if (branchId && payload.new?.branch_id !== branchId) return;
            setNewDeliveryCount(prev => prev + 1);
            // Play notification sound
            try {
              const audio = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgobm0iFY0LWOlurGJWTc0YaijqJlxUUFUgJeflm1OPU1zi5iaj2dFO01yjZuYjWRDOk5yjpuXi2JCOU9zjpuXi2JCOVBzjpuYjGNCOU9zjpuYjWRDOlB0j5yZjmRDO09zjpuXi2JCOU9zjZqWimFBOE5xjJmViV9AN01wi5eUh15ANkxwipaThV1ANkxviZOQgl1ANktuh5GOgFxANkpthZCMflk/NUlsg46KfFc+NEhrgoyIelU+NEhrgoqGeFQ9NEhrgoqGeFQ9NEhrgoqGeFQ9M0dqgYmFd1M9M0dqgYmFd1M9M0dqgYmFd1M9M0ZpgIiEdVI8MkZpgIiEdVI8MkZpgIiEdVI8");
              audio.volume = 0.7;
              audio.play().catch(() => {});
            } catch {}
            toast.info(`🚚 أوردر دليفري جديد من ${payload.new?.customer_name || "عميل"}`, {
              duration: 8000,
              action: {
                label: "عرض",
                onClick: () => setDeliveryDialogOpen(true),
              },
            });
            queryClient.invalidateQueries({ queryKey: ["pos-pending-delivery"] });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [companyId, branchId, queryClient]);

  // Update delivery order (status + driver)
  const updateDeliveryOrder = useMutation({
    mutationFn: async ({ saleId, updates }: { saleId: string; updates: Record<string, any> }) => {
      const { error } = await supabase.from("pos_sales").update(updates as any).eq("id", saleId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تحديث الأوردر");
      queryClient.invalidateQueries({ queryKey: ["pos-pending-delivery"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  useEffect(() => {
    const draft = { cart, branchId, saleDate: saleDate.toISOString(), taxEnabled, taxRate, taxInputVisible, discountEnabled, discountType, discountValue, editingSaleId, customerName, orderType, paymentMethod, deliveryFee };
    sessionStorage.setItem("pos_draft", JSON.stringify(draft));
  }, [cart, branchId, saleDate, taxEnabled, taxRate, taxInputVisible, discountEnabled, discountType, discountValue, editingSaleId, customerName, orderType, paymentMethod, deliveryFee]);

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
      // date is always today
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
    if (!currentShiftForExpenses) {
      toast.error("يجب فتح شيفت أولاً قبل إضافة أصناف");
      return;
    }
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

  const clearAll = (keepOrderType = false) => {
    setCart([]);
    setEditingSaleId(null);
    setDiscountEnabled(false);
    setDiscountValue(0);
    setTaxEnabled(false);
    setTaxRate(0);
    setTaxInputVisible(false);
    setCustomerName("");
    setDeliveryFee(0);
    
    if (!keepOrderType) {
      setOrderType("صالة");
      setPaymentMethod("كاش");
    }
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
    // date is always today
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
        date: saleDate.toISOString(),
        total_amount: total, status,
        tax_enabled: taxEnabled, tax_rate: taxEnabled ? taxRate : 0, tax_amount: taxAmount,
        discount_amount: discountAmount,
        order_type: orderType,
        payment_method: paymentMethod,
        delivery_fee: orderType === "دليفري" ? deliveryFee : 0,
        notes: cart.filter(c => c.notes).map(c => `${c.name}: ${c.notes}`).join(" | ") || null,
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
          date: format(saleDate, "yyyy/MM/dd HH:mm"),
          items: cart.map((c) => ({ name: c.name, quantity: c.quantity, unit_price: c.unit_price, notes: c.notes })),
          subtotal, discountAmount,
          discountLabel: discountEnabled ? (discountType === "percent" ? `${discountValue}%` : `${discountValue} EGP`) : "",
          taxAmount, taxRate, total,
          companyName: company?.name,
          notes: cart.filter(c => c.notes).map(c => `${c.name}: ${c.notes}`).join(" | ") || undefined,
          orderType,
          paymentMethod,
          deliveryFee: orderType === "دليفري" ? deliveryFee : 0,
        });
        toast.success("تم تنفيذ الفاتورة بنجاح");
      } else if (status === "معلق") {
        toast.success("تم تعليق الفاتورة");
      } else {
        toast.success("تم أرشفة الفاتورة");
      }

      clearAll(true);
      queryClient.invalidateQueries({ queryKey: ["pos-sales"] });
      queryClient.invalidateQueries({ queryKey: ["pos-held-sales"] });
      queryClient.invalidateQueries({ queryKey: ["pos-daily-stats"] });
      queryClient.invalidateQueries({ queryKey: ["pos-current-shift"] });
      queryClient.invalidateQueries({ queryKey: ["pos-shift-sales"] });
    },
    onError: (e: any) => toast.error(e.message || "حدث خطأ"),
  });

  // Silent print using hidden iframe (no new tab)
  const printViaIframe = useCallback((htmlContent: string) => {
    const existingFrame = document.getElementById("silent-print-frame");
    if (existingFrame) existingFrame.remove();
    const iframe = document.createElement("iframe");
    iframe.id = "silent-print-frame";
    iframe.style.cssText = "position:fixed;left:-9999px;top:0;width:0;height:0;border:none;";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) { toast.error("تعذر فتح الطباعة"); return; }
    doc.open();
    doc.write(htmlContent);
    doc.close();
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) { console.error("Print error", e); }
      setTimeout(() => iframe.remove(), 2000);
    };
  }, []);

  // Print receipt using hidden iframe - direct HTML approach for reliability
  const printReceipt = useCallback(() => {
    if (!receiptData) return;
    const { invoiceNumber, branchName, customerName: cn2, date, items, subtotal, discountAmount: da, discountLabel: dl, taxAmount: ta, taxRate: tr, total: t, companyName: cName, notes, orderType: ot, paymentMethod: pm, deliveryFee: df } = receiptData;
    const itemsRows = items.map((item: any) => 
      `<tr style="border-bottom:1px dotted #ccc"><td style="text-align:right;padding:2px 0;font-size:10px">${item.name}</td><td style="text-align:center;padding:2px 0;font-size:10px">${item.quantity}</td><td style="text-align:center;padding:2px 0;font-size:10px">${item.unit_price.toFixed(2)}</td><td style="text-align:left;padding:2px 0;font-size:10px">${(item.unit_price * item.quantity).toFixed(2)}</td></tr>${item.notes ? `<tr><td colspan="4" style="text-align:right;font-size:9px;color:#666;padding-bottom:2px;padding-right:8px">⤷ ${item.notes}</td></tr>` : ""}`
    ).join("");
    const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"/><title>إيصال</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap');*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Cairo','Tahoma',sans-serif;direction:rtl;width:72mm;margin:0 auto;padding:4px 6px;font-size:11px;color:#000;line-height:1.4;}table{width:100%;border-collapse:collapse;}@media print{@page{size:80mm auto;margin:0;}body{width:72mm;}}</style></head><body>
<div style="text-align:center;border-bottom:1px dashed #000;padding-bottom:6px;margin-bottom:6px">
<div style="font-size:14px;font-weight:bold">${cName || "CostControl"}</div>
${branchName ? `<div style="font-size:10px">${branchName}</div>` : ""}
<div style="font-size:10px;margin-top:3px">${date}</div>
${invoiceNumber ? `<div style="font-size:10px">فاتورة رقم: ${invoiceNumber}</div>` : ""}
${cn2 ? `<div style="font-size:10px">العميل: ${cn2}</div>` : ""}
${ot ? `<div style="font-size:10px">نوع الطلب: ${ot}</div>` : ""}
${pm ? `<div style="font-size:10px">طريقة الدفع: ${pm}</div>` : ""}
</div>
<table style="width:100%;border-collapse:collapse;margin-bottom:6px"><thead><tr style="border-bottom:1px dashed #000"><th style="text-align:right;font-size:10px;padding:2px 0">الصنف</th><th style="text-align:center;font-size:10px;padding:2px 0">الكمية</th><th style="text-align:center;font-size:10px;padding:2px 0">السعر</th><th style="text-align:left;font-size:10px;padding:2px 0">المجموع</th></tr></thead><tbody>${itemsRows}</tbody></table>
<div style="border-top:1px dashed #000;padding-top:6px">
<div style="display:flex;justify-content:space-between;font-size:10px"><span>الإجمالي الفرعي:</span><span>${subtotal.toFixed(2)}</span></div>
${da > 0 ? `<div style="display:flex;justify-content:space-between;font-size:10px"><span>خصم ${dl || ""}:</span><span>- ${da.toFixed(2)}</span></div>` : ""}
${ta > 0 ? `<div style="display:flex;justify-content:space-between;font-size:10px"><span>ضريبة ${tr}%:</span><span>${ta.toFixed(2)}</span></div>` : ""}
${(df ?? 0) > 0 ? `<div style="display:flex;justify-content:space-between;font-size:10px"><span>رسوم التوصيل:</span><span>${(df ?? 0).toFixed(2)}</span></div>` : ""}
<div style="display:flex;justify-content:space-between;font-weight:bold;font-size:13px;border-top:1px dashed #000;padding-top:4px;margin-top:4px"><span>الإجمالي:</span><span>${(t + (df ?? 0)).toFixed(2)} EGP</span></div>
</div>
${notes ? `<div style="border-top:1px dashed #000;padding-top:6px;margin-top:6px"><div style="font-size:10px"><span style="font-weight:bold">ملاحظات:</span> ${notes}</div></div>` : ""}
<div style="text-align:center;margin-top:8px;border-top:1px dashed #000;padding-top:6px"><div style="font-size:10px">شكراً لزيارتكم</div><div style="font-size:9px;color:#666;margin-top:3px">CostControl POS System</div></div>
</body></html>`;
    printViaIframe(html);
  }, [receiptData, printViaIframe]);

  // Auto-print receipt
  useEffect(() => {
    if (receiptData) {
      const timer = setTimeout(() => {
        printReceipt();
        setReceiptData(null);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [receiptData, printReceipt]);

  return (
    <>
      <div className="flex flex-col h-[calc(100vh-4rem)]" dir="rtl">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-card/50 print:hidden flex-wrap gap-2">
          <PosDailyStats companyId={companyId || ""} branchId={branchId} />
          <div className="flex items-center gap-2">
            {(pendingDeliveryOrders?.length ?? 0) > 0 && (
              <button
                onClick={() => { setDeliveryDialogOpen(true); setNewDeliveryCount(0); }}
                className="relative flex items-center gap-1 px-2 py-1 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-500 text-[10px] font-bold animate-pulse hover:bg-amber-500/20 transition-colors cursor-pointer"
              >
                <Bell className="h-3 w-3" />
                <Truck className="h-3 w-3" />
                {pendingDeliveryOrders?.length} دليفري
                {newDeliveryCount > 0 && (
                  <Badge className="absolute -top-2 -left-2 h-4 min-w-4 px-1 text-[9px] bg-destructive text-destructive-foreground">
                    {newDeliveryCount}
                  </Badge>
                )}
              </button>
            )}
            {companyId && (
              <PosShiftManager companyId={companyId} branchId={branchId} userName={auth.profile?.full_name || ""} printViaIframe={printViaIframe} />
            )}
            {companyId && currentShiftForExpenses && (
              <PosShiftExpenses companyId={companyId} shiftId={currentShiftForExpenses.id} userName={auth.profile?.full_name || ""} />
            )}
            {companyId && (
              <PosReturnsManager
                companyId={companyId}
                branchId={branchId}
                userName={auth.profile?.full_name || ""}
                userRole={auth.profile?.role || "مستخدم"}
                printViaIframe={printViaIframe}
                companyName={company?.name}
              />
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
            <ScrollArea className="flex-1 relative">
              {!currentShiftForExpenses && (
                <div className="absolute inset-0 z-10 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 rounded-lg">
                  <PlayCircle className="h-12 w-12 text-muted-foreground opacity-40" />
                  <p className="text-sm font-bold text-muted-foreground">يجب فتح شيفت أولاً</p>
                  <p className="text-xs text-muted-foreground">اضغط على زر "فتح شيفت" في الشريط العلوي</p>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5" dir="rtl">
                {filteredItems.map((item) => {
                  const inCart = cart.find((c) => c.pos_item_id === item.id);
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "glass-card p-3 rounded-xl flex flex-col gap-1.5 hover:border-primary/50 transition-all cursor-pointer group relative",
                        inCart && "border-primary/40 bg-primary/5",
                        !currentShiftForExpenses && "pointer-events-none opacity-50"
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

              {/* Delivery fee input */}
              {orderType === "دليفري" && (
                <div className="mb-2">
                  <div className="relative">
                    <Truck className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      type="number"
                      placeholder="رسوم التوصيل (EGP)"
                      value={deliveryFee || ""}
                      onChange={(e) => setDeliveryFee(Number(e.target.value))}
                      className="glass-input h-8 text-xs pr-8"
                    />
                  </div>
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
                      <Button variant="outline" className="glass-input h-8 text-xs w-full justify-start">
                        <CalendarIcon className="h-3.5 w-3.5 ml-1" />
                        {format(saleDate, "yyyy/MM/dd")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={saleDate} onSelect={(d) => d && setSaleDate(d)} className="p-3 pointer-events-auto" />
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
                    <div key={item.id} className="flex flex-col gap-1 p-2 rounded-lg border border-border/50 bg-muted/30">
                      <div className="flex items-center gap-2">
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
                      <Input
                        placeholder="ملاحظات على الصنف..."
                        value={item.notes || ""}
                        onChange={(e) => setCart((prev) => prev.map((c) => c.id === item.id ? { ...c, notes: e.target.value } : c))}
                        className="glass-input h-6 text-[10px] px-2"
                      />
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

      {/* Delivery Management Dialog */}
      <Dialog open={deliveryDialogOpen} onOpenChange={(open) => { setDeliveryDialogOpen(open); if (!open) setExpandedOrderId(null); }}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              إدارة أوردرات الدليفري
              <Badge variant="outline" className="text-xs">{pendingDeliveryOrders?.length ?? 0} أوردر</Badge>
            </DialogTitle>
          </DialogHeader>

          {(!pendingDeliveryOrders || pendingDeliveryOrders.length === 0) ? (
            <div className="text-center py-12 text-muted-foreground">
              <Truck className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">لا توجد أوردرات دليفري حالياً</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingDeliveryOrders.map((order: any) => {
                const statusInfo = DELIVERY_STATUSES.find(s => s.value === order.delivery_status);
                const StatusIcon = statusInfo?.icon || Clock;
                const nextStatus = (() => {
                  const idx = DELIVERY_STATUSES.findIndex(s => s.value === order.delivery_status);
                  return idx < DELIVERY_STATUSES.length - 1 ? DELIVERY_STATUSES[idx + 1] : null;
                })();
                const isExpanded = expandedOrderId === order.id;
                const driverName = deliveryDrivers?.find((d: any) => d.id === order.driver_id)?.name;
                const driverPhone = deliveryDrivers?.find((d: any) => d.id === order.driver_id)?.phone;

                return (
                  <div key={order.id} className="p-3 rounded-xl border border-border/50 bg-card/50 space-y-2">
                    <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] font-mono">{order.invoice_number}</Badge>
                        <Badge variant="outline" className={cn("text-[10px] gap-1", statusInfo?.color)}>
                          <StatusIcon className="h-3 w-3" />
                          {order.delivery_status}
                        </Badge>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{format(new Date(order.date), "HH:mm")}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3 w-3 text-muted-foreground" />
                        <span>{order.customer_name || "—"}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        <span dir="ltr">{order.customer_phone || "—"}</span>
                        {order.customer_phone2 && (
                          <span dir="ltr" className="text-muted-foreground">/ {order.customer_phone2}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 col-span-2">
                        <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="truncate">{order.customer_address || "—"}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-primary">{order.total_amount?.toFixed(0)} EGP</span>
                      {order.delivery_fee > 0 && (
                        <Badge variant="outline" className="text-[10px]">توصيل: {order.delivery_fee} EGP</Badge>
                      )}
                    </div>

                    {order.notes && (
                      <p className="text-[10px] text-muted-foreground bg-muted/30 p-1.5 rounded">{order.notes}</p>
                    )}

                    {/* Expanded: Show items */}
                    {isExpanded && (
                      <div className="border-t border-border/30 pt-2 space-y-2">
                        <p className="text-xs font-bold">الأصناف:</p>
                        {expandedOrderItems && expandedOrderItems.length > 0 ? (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs text-right h-7">الصنف</TableHead>
                                <TableHead className="text-xs text-center h-7">الكمية</TableHead>
                                <TableHead className="text-xs text-center h-7">السعر</TableHead>
                                <TableHead className="text-xs text-center h-7">الإجمالي</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {expandedOrderItems.map((item: any) => (
                                <TableRow key={item.id}>
                                  <TableCell className="text-xs py-1">{(item.pos_items as any)?.name || "—"}</TableCell>
                                  <TableCell className="text-xs text-center py-1">{item.quantity}</TableCell>
                                  <TableCell className="text-xs text-center py-1">{item.unit_price?.toFixed(2)}</TableCell>
                                  <TableCell className="text-xs text-center py-1">{item.total?.toFixed(2)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        ) : (
                          <p className="text-[10px] text-muted-foreground">جاري التحميل...</p>
                        )}

                        {/* Print Buttons */}
                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs h-8"
                            onClick={() => {
                              const items = expandedOrderItems?.map((i: any) => `${(i.pos_items as any)?.name || "—"} × ${i.quantity}`) || [];
                              const kitchenHTML = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>طلب مطبخ</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Cairo','Tahoma',sans-serif;width:72mm;margin:0 auto;padding:4px 6px;font-size:12px;color:#000;line-height:1.4}h2{text-align:center;font-size:14px;border-bottom:2px dashed #000;padding-bottom:6px;margin-bottom:8px}.item{padding:4px 0;border-bottom:1px dotted #ccc;font-size:13px;font-weight:bold}.footer{text-align:center;margin-top:10px;font-size:10px;border-top:1px dashed #000;padding-top:6px}@media print{@page{size:80mm auto;margin:0}}</style></head><body><h2>🍳 طلب مطبخ</h2><p style="text-align:center;font-size:11px;margin-bottom:8px">${order.invoice_number} • ${order.customer_name || "عميل"}</p>${items.map(i => `<div class="item">▸ ${i}</div>`).join("")}${order.notes ? `<div style="margin-top:8px;padding:4px;background:#f5f5f5;font-size:10px;border-radius:4px">ملاحظات: ${order.notes}</div>` : ""}<div class="footer">${format(new Date(order.date), "yyyy/MM/dd HH:mm")}</div></body></html>`;
                              printViaIframe(kitchenHTML);
                            }}
                          >
                            <ChefHat className="h-3.5 w-3.5" />
                            طباعة المطبخ
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs h-8"
                            onClick={() => {
                              const items = expandedOrderItems?.map((i: any) => ({
                                name: (i.pos_items as any)?.name || "—",
                                qty: i.quantity,
                                price: i.unit_price,
                                total: i.total,
                              })) || [];
                              const itemsRows = items.map(i => `<tr><td style="text-align:right;padding:3px 0;font-size:10px">${i.name}</td><td style="text-align:center;font-size:10px">${i.qty}</td><td style="text-align:center;font-size:10px">${i.price?.toFixed(2)}</td><td style="text-align:left;font-size:10px">${i.total?.toFixed(2)}</td></tr>`).join("");
                              const phone2Line = order.customer_phone2 ? `<div class="info"><span class="label">هاتف 2:</span> <span dir="ltr">${order.customer_phone2}</span></div>` : "";
                              const driverReceiptHTML = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>إيصال توصيل</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Cairo','Tahoma',sans-serif;width:72mm;margin:0 auto;padding:4px 6px;font-size:11px;color:#000;line-height:1.4}h2{text-align:center;font-size:14px;margin-bottom:4px}.sep{border-bottom:1px dashed #000;margin:6px 0}.info{font-size:10px;padding:2px 0}.label{font-weight:bold}table{width:100%;border-collapse:collapse;margin:6px 0}th{font-size:10px;border-bottom:1px solid #000;padding:3px 0;text-align:center}td{padding:3px 0;font-size:10px}.total-row{font-weight:bold;font-size:13px;text-align:center;padding:6px 0;border-top:2px dashed #000;margin-top:6px}.footer{text-align:center;font-size:9px;color:#666;margin-top:8px;border-top:1px dashed #ccc;padding-top:4px}@media print{@page{size:80mm auto;margin:0}}</style></head><body><h2>🚚 إيصال توصيل</h2><p style="text-align:center;font-size:10px">${company?.name || "CostControl"}</p><div class="sep"></div><div class="info"><span class="label">فاتورة:</span> ${order.invoice_number}</div><div class="info"><span class="label">التاريخ:</span> ${format(new Date(order.date), "yyyy/MM/dd HH:mm")}</div><div class="sep"></div><div class="info"><span class="label">العميل:</span> ${order.customer_name || "—"}</div><div class="info"><span class="label">الهاتف:</span> <span dir="ltr">${order.customer_phone || "—"}</span></div>${phone2Line}<div class="info"><span class="label">العنوان:</span> ${order.customer_address || "—"}</div>${driverName ? `<div class="sep"></div><div class="info"><span class="label">الطيار:</span> ${driverName}</div>${driverPhone ? `<div class="info"><span class="label">هاتف الطيار:</span> <span dir="ltr">${driverPhone}</span></div>` : ""}` : ""}<div class="sep"></div><table><thead><tr><th style="text-align:right">الصنف</th><th>الكمية</th><th>السعر</th><th style="text-align:left">الإجمالي</th></tr></thead><tbody>${itemsRows}</tbody></table>${order.discount_amount > 0 ? `<div class="info"><span class="label">خصم:</span> ${order.discount_amount?.toFixed(2)} EGP</div>` : ""}${order.tax_amount > 0 ? `<div class="info"><span class="label">ضريبة ${order.tax_rate}%:</span> ${order.tax_amount?.toFixed(2)} EGP</div>` : ""}<div class="info"><span class="label">رسوم التوصيل:</span> ${order.delivery_fee?.toFixed(2) || "0.00"} EGP</div><div class="total-row">الإجمالي المطلوب: ${((order.total_amount ?? 0) + (order.delivery_fee ?? 0)).toFixed(2)} EGP</div><div class="info" style="text-align:center;font-size:10px;margin-top:4px"><span class="label">طريقة الدفع:</span> ${order.payment_method || "كاش"}</div>${order.notes ? `<div class="sep"></div><div class="info" style="font-size:10px"><span class="label">ملاحظات:</span> ${order.notes}</div>` : ""}<div class="footer">شكراً لتعاملكم معنا • ${company?.name || "CostControl"}</div></body></html>`;
                              printViaIframe(driverReceiptHTML);
                            }}
                          >
                            <Printer className="h-3.5 w-3.5" />
                            إيصال الطيار
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      {/* Expand/collapse button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-xs h-8"
                        onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                      >
                        <FileText className="h-3 w-3" />
                        {isExpanded ? "إخفاء" : "التفاصيل"}
                      </Button>

                      {/* Driver selection */}
                      <Select
                        value={order.driver_id || ""}
                        onValueChange={(driverId) => updateDeliveryOrder.mutate({
                          saleId: order.id,
                          updates: { driver_id: driverId || null }
                        })}
                      >
                        <SelectTrigger className="glass-input h-8 text-xs flex-1">
                          <SelectValue placeholder="اختر الطيار" />
                        </SelectTrigger>
                        <SelectContent>
                          {deliveryDrivers?.map((d: any) => (
                            <SelectItem key={d.id} value={d.id} className="text-xs">{d.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Next status button */}
                      {nextStatus && (
                        <Button
                          size="sm"
                          className="gap-1 text-xs h-8"
                          onClick={() => updateDeliveryOrder.mutate({
                            saleId: order.id,
                            updates: { delivery_status: nextStatus.value }
                          })}
                          disabled={updateDeliveryOrder.isPending}
                        >
                          <nextStatus.icon className="h-3 w-3" />
                          {nextStatus.label}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
