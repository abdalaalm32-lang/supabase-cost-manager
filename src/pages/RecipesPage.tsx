/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useMemo, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Plus,
  Save,
  Pencil,
  Trash2,
  Search,
  ChefHat,
  DollarSign,
  TrendingUp,
  Percent,
  ShoppingBasket,
  Copy,
  ClipboardPaste,
  CheckCircle2,
  Clock,
  Edit3,
  Printer,
  FileText,
  FileSpreadsheet,
  Loader2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { RecipePrintExport, MaterialUsagePrintExport } from "@/components/RecipePrintExport";
import { exportToExcel, exportToPDF, type ExportColumn } from "@/lib/exportUtils";

// Local types
interface LocalIngredient {
  id?: string;
  stock_item_id: string;
  name: string;
  code: string;
  recipe_unit: string; // Unit used in recipe (e.g., جرام)
  stock_unit: string; // Unit for storage/cost (e.g., كجم)
  conversion_factor: number; // e.g., 1000 means 1kg = 1000g
  qty: number; // Quantity in recipe_unit
  avg_cost: number; // Cost per stock_unit
}

type RecipeStatus = "ready" | "draft" | "editing";
type ProductFilter = "all" | "ready" | "draft";

export const RecipesPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [selectedEngClass, setSelectedEngClass] = useState<string>("all");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [productFilter, setProductFilter] = useState<ProductFilter>("all");

  const [ingredients, setIngredients] = useState<LocalIngredient[]>([]);
  const [recipeStatus, setRecipeStatus] = useState<RecipeStatus>("draft");
  const [isEditing, setIsEditing] = useState(false);
  const [recipeId, setRecipeId] = useState<string | null>(null);

  const [showAddIngredients, setShowAddIngredients] = useState(false);
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [filterDept, setFilterDept] = useState("all");
  const [filterCat, setFilterCat] = useState("all");
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  // Replace ingredient state
  const [showReplaceDialog, setShowReplaceDialog] = useState(false);
  const [replaceIdx, setReplaceIdx] = useState<number | null>(null);
  const [replaceSearch, setReplaceSearch] = useState("");
  const [replaceFilterDept, setReplaceFilterDept] = useState("all");
  const [replaceFilterCat, setReplaceFilterCat] = useState("all");

  // Clipboard for copy/paste recipe
  const [copiedIngredients, setCopiedIngredients] = useState<LocalIngredient[] | null>(null);

  // Global raw material search
  const [globalSearch, setGlobalSearch] = useState("");
  const [showGlobalResults, setShowGlobalResults] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<any>(null);

  // All recipes print/export
  const [loadingAllPdf, setLoadingAllPdf] = useState(false);
  const [loadingAllExcel, setLoadingAllExcel] = useState(false);
  const [selectedPrintCategory, setSelectedPrintCategory] = useState<string>("all");

  const { data: branches = [] } = useQuery({
    queryKey: ["branches-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: posItems = [] } = useQuery({
    queryKey: ["pos-items-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("pos_items").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: recipes = [] } = useQuery({
    queryKey: ["recipes", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("recipes").select("*, recipe_ingredients(*)");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: allStockItems = [] } = useQuery({
    queryKey: ["stock-items-all", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_items").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["inv-categories-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_categories").select("*").eq("active", true);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: posCategories = [] } = useQuery({
    queryKey: ["pos-categories", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Derived
  const recipeMap = useMemo(() => {
    const map: Record<string, any> = {};
    recipes.forEach((r: any) => {
      map[r.menu_item_id] = r;
    });
    return map;
  }, [recipes]);

  const posCategoryMap = useMemo(() => {
    const map: Record<string, string> = {};
    posCategories.forEach((c: any) => { map[c.id] = c.name; });
    return map;
  }, [posCategories]);

  const filteredProducts = useMemo(() => {
    let items = posItems;
    if (selectedBranch !== "all") {
      items = items.filter((p: any) => p.branch_id === selectedBranch);
    }
    if (selectedEngClass !== "all") {
      items = items.filter((p: any) => p.menu_engineering_class === selectedEngClass);
    }
    if (productSearch.trim()) {
      const q = productSearch.trim().toLowerCase();
      items = items.filter((p: any) => {
        const catName = (p.category_id ? posCategoryMap[p.category_id] : p.category) || "";
        return p.name.toLowerCase().includes(q) || (p.code || "").toLowerCase().includes(q) || catName.toLowerCase().includes(q);
      });
    }
    if (productFilter === "ready") {
      items = items.filter((p: any) => !!recipeMap[p.id]);
    } else if (productFilter === "draft") {
      items = items.filter((p: any) => !recipeMap[p.id]);
    }
    return items;
  }, [posItems, selectedBranch, selectedEngClass, productSearch, productFilter, recipeMap, posCategoryMap]);

  const selectedProduct = useMemo(() => {
    if (!selectedProductId) return null;
    return posItems.find((p: any) => p.id === selectedProductId) || null;
  }, [selectedProductId, posItems]);

  const getProductCategory = (product: any) => {
    if (!product) return "—";
    if (product.category) return product.category;
    if (product.category_id) {
      const cat = posCategories.find((c: any) => c.id === product.category_id);
      return cat?.name || "—";
    }
    return "—";
  };

  const getProductRecipeStatus = (productId: string): RecipeStatus => {
    return recipeMap[productId] ? "ready" : "draft";
  };

  const getStatusBadge = (status: RecipeStatus) => {
    switch (status) {
      case "ready":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/15 text-green-400">
            <CheckCircle2 size={10} /> Ready
          </span>
        );
      case "editing":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-400">
            <Edit3 size={10} /> Editing
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/15 text-yellow-400">
            <Clock size={10} /> Draft
          </span>
        );
    }
  };

  // Load recipe for product
  const loadRecipe = useCallback(
    async (productId: string) => {
      const recipe = recipeMap[productId];
      if (recipe) {
        setRecipeId(recipe.id);
        setRecipeStatus("ready");
        setIsEditing(false);
        // Load ingredients
        const ings: LocalIngredient[] = (recipe.recipe_ingredients || []).map((ri: any) => {
          const si = allStockItems.find((s: any) => s.id === ri.stock_item_id);
          return {
            id: ri.id,
            stock_item_id: ri.stock_item_id,
            name: si?.name || "—",
            code: si?.code || "—",
            recipe_unit: si?.recipe_unit || si?.stock_unit || "كجم",
            stock_unit: si?.stock_unit || "كجم",
            conversion_factor: Number(si?.conversion_factor) || 1,
            qty: Number(ri.qty),
            avg_cost: Number(si?.avg_cost || 0),
          };
        });
        setIngredients(ings);
      } else {
        setRecipeId(null);
        setRecipeStatus("draft");
        setIsEditing(true);
        setIngredients([]);
      }
    },
    [recipeMap, allStockItems],
  );

  const handleSelectProduct = (productId: string) => {
    setSelectedProductId(productId);
    loadRecipe(productId);
  };

  // Ingredient management
  const existingStockIds = useMemo(() => new Set(ingredients.map((i) => i.stock_item_id)), [ingredients]);

  const availableIngredients = useMemo(() => {
    let items = allStockItems.filter((s: any) => !existingStockIds.has(s.id));
    if (filterDept !== "all") items = items.filter((s: any) => s.department_id === filterDept);
    if (filterCat !== "all") items = items.filter((s: any) => s.category_id === filterCat);
    if (ingredientSearch.trim()) {
      const q = ingredientSearch.trim().toLowerCase();
      items = items.filter((s: any) => s.name.toLowerCase().includes(q) || (s.code || "").toLowerCase().includes(q));
    }
    return items;
  }, [allStockItems, existingStockIds, filterDept, filterCat, ingredientSearch]);

  const toggleItem = (id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddIngredients = () => {
    const newIngs: LocalIngredient[] = Array.from(selectedItemIds).map((siId) => {
      const si = allStockItems.find((s: any) => s.id === siId)!;
      return {
        stock_item_id: siId,
        name: si.name,
        code: si.code || "—",
        recipe_unit: si.recipe_unit || si.stock_unit || "كجم",
        stock_unit: si.stock_unit || "كجم",
        conversion_factor: Number(si.conversion_factor) || 1,
        qty: 0,
        avg_cost: Number(si.avg_cost) || 0,
      };
    });
    setIngredients((prev) => [...prev, ...newIngs]);
    setShowAddIngredients(false);
    setSelectedItemIds(new Set());
    setIngredientSearch("");
  };

  const handleDeleteIngredient = (idx: number) => {
    setIngredients((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateIngredientQty = (idx: number, val: string) => {
    setIngredients((prev) => prev.map((ing, i) => (i === idx ? { ...ing, qty: Number(val) || 0 } : ing)));
  };

  // Replace ingredient
  const availableReplacements = useMemo(() => {
    let items = allStockItems.filter((s: any) => !existingStockIds.has(s.id));
    if (replaceFilterDept !== "all") items = items.filter((s: any) => s.department_id === replaceFilterDept);
    if (replaceFilterCat !== "all") items = items.filter((s: any) => s.category_id === replaceFilterCat);
    if (replaceSearch.trim()) {
      const q = replaceSearch.trim().toLowerCase();
      items = items.filter((s: any) => s.name.toLowerCase().includes(q) || (s.code || "").toLowerCase().includes(q));
    }
    return items;
  }, [allStockItems, existingStockIds, replaceFilterDept, replaceFilterCat, replaceSearch]);

  const handleOpenReplace = (idx: number) => {
    setReplaceIdx(idx);
    setReplaceSearch("");
    setReplaceFilterDept("all");
    setReplaceFilterCat("all");
    setShowReplaceDialog(true);
  };

  const handleReplaceIngredient = (newStockItem: any) => {
    if (replaceIdx === null) return;
    setIngredients((prev) =>
      prev.map((ing, i) =>
        i === replaceIdx
          ? {
              ...ing,
              stock_item_id: newStockItem.id,
              name: newStockItem.name,
              code: newStockItem.code || "—",
              recipe_unit: newStockItem.recipe_unit || newStockItem.stock_unit || "كجم",
              stock_unit: newStockItem.stock_unit || "كجم",
              conversion_factor: Number(newStockItem.conversion_factor) || 1,
              avg_cost: Number(newStockItem.avg_cost) || 0,
            }
          : ing
      )
    );
    setShowReplaceDialog(false);
    setReplaceIdx(null);
    toast({ title: "تم استبدال الخامة بنجاح" });
  };

  // Cost calculations - convert qty from recipe_unit to stock_unit before calculating cost
  const totalIngredientsCost = useMemo(() => {
    return ingredients.reduce((sum, ing) => {
      const qtyInStockUnit = ing.qty / (ing.conversion_factor || 1);
      return sum + qtyInStockUnit * ing.avg_cost;
    }, 0);
  }, [ingredients]);

  const sellingPrice = selectedProduct ? Number(selectedProduct.price) : 0;
  const netProfit = sellingPrice - totalIngredientsCost;
  const profitMargin = sellingPrice > 0 ? (netProfit / sellingPrice) * 100 : 0;

  const getMarginColor = (margin: number) => {
    if (margin < 10) return "text-red-400";
    if (margin < 25) return "text-orange-400";
    return "text-green-400";
  };

  // Save recipe
  const handleSave = async () => {
    if (!selectedProductId || !companyId) return;

    try {
      if (recipeId) {
        // Delete old ingredients and re-insert
        await supabase.from("recipe_ingredients").delete().eq("recipe_id", recipeId);
        if (ingredients.length > 0) {
          const rows = ingredients.map((ing) => ({
            recipe_id: recipeId,
            stock_item_id: ing.stock_item_id,
            qty: ing.qty,
          }));
          const { error } = await supabase.from("recipe_ingredients").insert(rows);
          if (error) throw error;
        }
        await supabase.from("recipes").update({ last_updated: new Date().toISOString() }).eq("id", recipeId);
      } else {
        // Create new recipe
        const branchId = selectedProduct?.branch_id || null;
        const { data: newRecipe, error } = await supabase
          .from("recipes")
          .insert({
            company_id: companyId,
            menu_item_id: selectedProductId,
            branch_id: branchId,
          })
          .select()
          .single();
        if (error) throw error;

        if (ingredients.length > 0) {
          const rows = ingredients.map((ing) => ({
            recipe_id: newRecipe.id,
            stock_item_id: ing.stock_item_id,
            qty: ing.qty,
          }));
          await supabase.from("recipe_ingredients").insert(rows);
        }
        setRecipeId(newRecipe.id);
      }

      setRecipeStatus("ready");
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      toast({ title: "تم حفظ الوصفة بنجاح" });
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    }
  };

  // Delete recipe
  const handleDeleteRecipe = async () => {
    if (!recipeId) return;
    await supabase.from("recipe_ingredients").delete().eq("recipe_id", recipeId);
    await supabase.from("recipes").delete().eq("id", recipeId);
    setRecipeId(null);
    setIngredients([]);
    setRecipeStatus("draft");
    setIsEditing(true);
    queryClient.invalidateQueries({ queryKey: ["recipes"] });
    toast({ title: "تم حذف الوصفة" });
  };

  // Duplicate recipe
  const handleDuplicate = () => {
    if (ingredients.length === 0) {
      toast({ title: "لا توجد مكونات لنسخها", variant: "destructive" });
      return;
    }
    setCopiedIngredients([...ingredients]);
    toast({ title: "تم نسخ الوصفة — اختر منتج آخر واضغط لصق" });
  };

  const handlePasteRecipe = () => {
    if (!copiedIngredients || copiedIngredients.length === 0) return;
    // Filter out ingredients that already exist or the product itself
    const newIngs = copiedIngredients.filter(
      ci => ci.stock_item_id !== selectedProductId && !ingredients.some(i => i.stock_item_id === ci.stock_item_id)
    );
    setIngredients(prev => [...prev, ...newIngs.map(i => ({ ...i, id: undefined }))]);
    toast({ title: `تم لصق ${newIngs.length} مكون` });
  };

  // Edit mode
  const handleEdit = () => {
    setIsEditing(true);
    setRecipeStatus("editing");
  };

  // Global raw material search
  const globalSearchResults = useMemo(() => {
    if (!globalSearch.trim()) return [];
    const q = globalSearch.trim().toLowerCase();
    const matchedItems = allStockItems.filter(
      (s: any) => s.name.toLowerCase().includes(q) || (s.code || "").toLowerCase().includes(q),
    );
    return matchedItems.map((si: any) => {
      const usedIn = recipes.filter((r: any) =>
        (r.recipe_ingredients || []).some((ri: any) => ri.stock_item_id === si.id),
      );
      const usageDetails = usedIn.map((r: any) => {
        const product = posItems.find((p: any) => p.id === r.menu_item_id);
        const ri = (r.recipe_ingredients || []).find((ri: any) => ri.stock_item_id === si.id);
        return {
          productName: product?.name || "—",
          qty: Number(ri?.qty || 0),
          unit: si.recipe_unit || si.stock_unit || "كجم",
          avgCost: Number(si.avg_cost || 0),
          conversionFactor: Number(si.conversion_factor || 1),
        };
      });
      return { ...si, usedInCount: usedIn.length, usageDetails };
    });
  }, [globalSearch, allStockItems, recipes, posItems]);

  const isLocked = recipeStatus === "ready" && !isEditing;

  // === Print / Export ALL recipes for selected branch ===

  const allRecipesData = useMemo(() => {
    if (selectedBranch === "all") return [];
    // Get products that have recipes & match branch filter
    let products = filteredProducts.filter((p: any) => !!recipeMap[p.id]);
    // Filter by category if not "all"
    if (selectedPrintCategory !== "all") {
      products = products.filter((p: any) => {
        const catName = p.category || posCategories.find((c: any) => c.id === p.category_id)?.name || "";
        return catName === selectedPrintCategory || p.category_id === selectedPrintCategory;
      });
    }
    return products.map((p: any) => {
      const recipe = recipeMap[p.id];
      const ings = (recipe.recipe_ingredients || []).map((ri: any) => {
        const si = allStockItems.find((s: any) => s.id === ri.stock_item_id);
        const qty = Number(ri.qty);
        const cf = Number(si?.conversion_factor || 1);
        const avgCost = Number(si?.avg_cost || 0);
        const cost = (qty / cf) * avgCost;
        return { name: si?.name || "—", code: si?.code || "—", unit: si?.recipe_unit || si?.stock_unit || "كجم", qty, avgCost, cost };
      });
      const totalCost = ings.reduce((s: number, i: any) => s + i.cost, 0);
      return { product: p, ingredients: ings, totalCost };
    });
  }, [filteredProducts, recipeMap, allStockItems, selectedBranch, selectedPrintCategory, posCategories]);

  const handlePrintAllRecipes = (withCost: boolean) => {
    if (allRecipesData.length === 0) return;
    const dateStr = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
    const logoSrc = `${window.location.origin}/logo.png`;
    const branchName = selectedBranch === "all" ? "كل الفروع" : branches.find((b: any) => b.id === selectedBranch)?.name || "";
    const categoryName = selectedPrintCategory !== "all"
      ? (posCategories.find((c: any) => c.id === selectedPrintCategory)?.name || selectedPrintCategory)
      : "";

    let allTablesHTML = "";
    let grandTotal = 0;

    allRecipesData.forEach((rd: any) => {
      grandTotal += rd.totalCost;
      allTablesHTML += `<h3 style="margin-top:15px;font-size:13px;font-weight:bold;font-family:'AmiriBold','CairoLocal',sans-serif;">${rd.product.name} ${rd.product.code ? `(${rd.product.code})` : ""} ${withCost ? `— سعر البيع: ${Number(rd.product.price).toFixed(2)}` : ""}</h3>`;
      allTablesHTML += `<table><thead><tr><th>م</th><th>الكود</th><th>الخامة</th><th>الوحدة</th><th>الكمية</th>`;
      if (withCost) allTablesHTML += `<th>م. التكلفة</th><th>الإجمالي</th>`;
      allTablesHTML += `</tr></thead><tbody>`;
      rd.ingredients.forEach((ing: any, idx: number) => {
        const td = (v: string) => `<td style="border:1px solid #000;padding:3px 5px;font-size:9px;text-align:center;">${v}</td>`;
        allTablesHTML += `<tr>${td(String(idx + 1))}${td(ing.code)}${td(ing.name)}${td(ing.unit)}${td(String(ing.qty))}`;
        if (withCost) allTablesHTML += `${td(ing.avgCost.toFixed(2))}${td(ing.cost.toFixed(2))}`;
        allTablesHTML += `</tr>`;
      });
      if (withCost) {
        allTablesHTML += `<tr style="font-weight:bold;background:#f5f5f5;"><td colspan="6" style="border:1px solid #000;padding:3px 5px;font-size:9px;text-align:center;">إجمالي التكلفة</td><td style="border:1px solid #000;padding:3px 5px;font-size:9px;text-align:center;">${rd.totalCost.toFixed(2)}</td></tr>`;
      }
      allTablesHTML += `</tbody></table>`;
    });

    if (withCost) {
      allTablesHTML += `<div style="margin-top:15px;padding:8px;border:2px solid #000;text-align:center;font-weight:bold;font-size:13px;font-family:'AmiriBold','CairoLocal',sans-serif;">إجمالي تكلفة جميع الوصفات: ${grandTotal.toFixed(2)}</div>`;
    }

    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>جميع الوصفات</title>
<style>
@font-face { font-family:'CairoLocal'; src:url('${window.location.origin}/fonts/Cairo-Regular.ttf') format('truetype'); }
@font-face { font-family:'AmiriBold'; src:url('${window.location.origin}/fonts/Amiri-Bold.ttf') format('truetype'); }
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'CairoLocal',sans-serif; direction:rtl; padding:20px; color:#000; background:#fff; }
@media print { @page { size:auto; margin:8mm; } body { padding:0; } table { page-break-inside:auto; } tr { page-break-inside:avoid; } }
.header { text-align:center; margin-bottom:15px; border-bottom:2px solid #000; padding-bottom:10px; display:flex; align-items:center; justify-content:center; gap:10px; }
.logo { width:80px; height:80px; object-fit:contain; }
.header h1 { font-size:18px; font-weight:bold; font-family:'AmiriBold','CairoLocal',sans-serif; }
.header p { font-size:11px; }
table { width:100%; border-collapse:collapse; margin-bottom:5px; }
th { border:1px solid #000; padding:4px 5px; font-size:9px; text-align:center; font-family:'AmiriBold','CairoLocal',sans-serif; background:#f0f0f0; }
.footer { text-align:center; margin-top:20px; font-size:9px; border-top:1px solid #000; padding-top:8px; }
</style></head><body>
<div class="header"><img src="${logoSrc}" alt="Logo" class="logo" /><div><h1>جميع الوصفات${branchName ? ` — ${branchName}` : ""}${categoryName ? ` — ${categoryName}` : ""}</h1><p>Cost Management System • ${dateStr}</p></div></div>
${allTablesHTML}
<div class="footer">Powered by Mohamed Abdel Aal</div>
<script>(async function(){ try { if(document.fonts && document.fonts.ready) await document.fonts.ready; } catch(e){} window.print(); window.onafterprint = function(){ window.close(); }; })();</script>
</body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  const handleExportAllExcel = async () => {
    if (allRecipesData.length === 0) return;
    setLoadingAllExcel(true);
    try {
      const rows: Record<string, any>[] = [];
      allRecipesData.forEach((rd: any) => {
        rd.ingredients.forEach((ing: any) => {
          rows.push({ product: rd.product.name, productCode: rd.product.code || "—", name: ing.name, code: ing.code, unit: ing.unit, qty: ing.qty, avgCost: ing.avgCost.toFixed(2), total: ing.cost.toFixed(2) });
        });
        rows.push({ product: "", productCode: "", name: "إجمالي التكلفة", code: "", unit: "", qty: "", avgCost: "", total: rd.totalCost.toFixed(2), __rowType: "group-total" });
      });
      const grandTotal = allRecipesData.reduce((s: number, r: any) => s + r.totalCost, 0);
      rows.push({ product: "", productCode: "", name: "إجمالي جميع الوصفات", code: "", unit: "", qty: "", avgCost: "", total: grandTotal.toFixed(2), __rowType: "grand-total" });
      const cols: ExportColumn[] = [
        { key: "product", label: "المنتج" }, { key: "productCode", label: "كود المنتج" },
        { key: "name", label: "الخامة" }, { key: "code", label: "كود الخامة" },
        { key: "unit", label: "الوحدة" }, { key: "qty", label: "الكمية" },
        { key: "avgCost", label: "م. التكلفة" }, { key: "total", label: "الإجمالي" },
      ];
      const branchName = selectedBranch === "all" ? "كل الفروع" : branches.find((b: any) => b.id === selectedBranch)?.name || "";
      const catName = selectedPrintCategory !== "all" ? (posCategories.find((c: any) => c.id === selectedPrintCategory)?.name || selectedPrintCategory) : "";
      const titleSuffix = `${branchName}${catName ? ` — ${catName}` : ""}`;
      await exportToExcel({ title: `جميع الوصفات — ${titleSuffix}`, filename: `وصفات_${titleSuffix}`, columns: cols, data: rows });
    } catch { /* ignore */ }
    finally { setLoadingAllExcel(false); }
  };

  const handleExportAllPdf = async () => {
    if (allRecipesData.length === 0) return;
    setLoadingAllPdf(true);
    try {
      const rows: Record<string, any>[] = [];
      allRecipesData.forEach((rd: any) => {
        rd.ingredients.forEach((ing: any) => {
          rows.push({ product: rd.product.name, productCode: rd.product.code || "—", name: ing.name, code: ing.code, unit: ing.unit, qty: ing.qty, avgCost: ing.avgCost.toFixed(2), total: ing.cost.toFixed(2) });
        });
        rows.push({ product: "", productCode: "", name: "إجمالي التكلفة", code: "", unit: "", qty: "", avgCost: "", total: rd.totalCost.toFixed(2), __rowType: "group-total" });
      });
      const grandTotal = allRecipesData.reduce((s: number, r: any) => s + r.totalCost, 0);
      rows.push({ product: "", productCode: "", name: "إجمالي جميع الوصفات", code: "", unit: "", qty: "", avgCost: "", total: grandTotal.toFixed(2), __rowType: "grand-total" });
      const cols: ExportColumn[] = [
        { key: "product", label: "المنتج" }, { key: "productCode", label: "كود المنتج" },
        { key: "name", label: "الخامة" }, { key: "code", label: "كود الخامة" },
        { key: "unit", label: "الوحدة" }, { key: "qty", label: "الكمية" },
        { key: "avgCost", label: "م. التكلفة" }, { key: "total", label: "الإجمالي" },
      ];
      const branchName = selectedBranch === "all" ? "كل الفروع" : branches.find((b: any) => b.id === selectedBranch)?.name || "";
      const catName = selectedPrintCategory !== "all" ? (posCategories.find((c: any) => c.id === selectedPrintCategory)?.name || selectedPrintCategory) : "";
      const titleSuffix = `${branchName}${catName ? ` — ${catName}` : ""}`;
      await exportToPDF({ title: `جميع الوصفات — ${titleSuffix}`, filename: `وصفات_${titleSuffix}`, columns: cols, data: rows });
    } catch { /* ignore */ }
    finally { setLoadingAllPdf(false); }
  };

  return (
    <div className="space-y-4 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <ChefHat size={28} className="text-primary" />
          <h1 className="text-2xl font-bold">Recipes</h1>
          {selectedProduct && getStatusBadge(recipeStatus === "editing" ? "editing" : recipeStatus)}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Global Search */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="بحث خامة في كل الوصفات..."
              value={globalSearch}
              onChange={(e) => {
                setGlobalSearch(e.target.value);
                setShowGlobalResults(true);
              }}
              onFocus={() => globalSearch && setShowGlobalResults(true)}
              className="pr-9 w-56"
            />
            {showGlobalResults && globalSearchResults.length > 0 && (
              <div className="absolute top-full mt-1 left-0 right-0 z-50 glass-card p-2 max-h-60 overflow-auto">
                {globalSearchResults.map((item: any) => (
                  <div
                    key={item.id}
                    className="p-2 rounded-lg hover:bg-muted/50 text-sm cursor-pointer"
                    onClick={() => {
                      setSelectedMaterial(item);
                      setShowGlobalResults(false);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{item.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {item.usedInCount} وصفة
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.code} • {item.stock_unit}</p>
                  </div>
                ))}
                <button
                  onClick={() => setShowGlobalResults(false)}
                  className="w-full text-xs text-muted-foreground pt-1 hover:underline"
                >
                  إغلاق
                </button>
              </div>
            )}
          </div>

          {selectedProduct && (
            <>
              {recipeStatus === "draft" || isEditing ? (
                <Button onClick={handleSave} size="sm">
                  <Save size={14} /> حفظ الوصفة
                </Button>
              ) : null}
              {recipeStatus === "ready" && !isEditing && (
                <Button onClick={handleEdit} variant="outline" size="sm">
                  <Pencil size={14} /> تعديل
                </Button>
              )}
              {recipeId && (
                <>
                  <Button onClick={handleDeleteRecipe} variant="destructive" size="sm">
                    <Trash2 size={14} /> حذف
                  </Button>
                  <Button onClick={handleDuplicate} variant="outline" size="sm">
                    <Copy size={14} /> نسخ
                  </Button>
                </>
              )}
              {copiedIngredients && copiedIngredients.length > 0 && (recipeStatus === "draft" || isEditing) && (
                <Button onClick={handlePasteRecipe} variant="outline" size="sm" className="border-primary/50 text-primary">
                  <ClipboardPaste size={14} /> لصق الوصفة ({copiedIngredients.length})
                </Button>
              )}
              {ingredients.length > 0 && (
                <RecipePrintExport
                  productName={selectedProduct.name}
                  productCode={selectedProduct.code}
                  productPrice={Number(selectedProduct.price)}
                  ingredients={ingredients}
                  totalCost={totalIngredientsCost}
                  type="pos"
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Click outside to close global results */}
      {showGlobalResults && <div className="fixed inset-0 z-40" onClick={() => setShowGlobalResults(false)} />}

      {/* Main Content - Two Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Right Panel - Branch & Products */}
        <div className="lg:col-span-1 glass-card p-4 space-y-4 max-h-[calc(100vh-180px)] overflow-auto">
          <h2 className="font-bold text-sm">المنتجات</h2>

          {/* Branch Filter */}
          <Select value={selectedBranch} onValueChange={(v) => { setSelectedBranch(v); setSelectedPrintCategory("all"); }}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="كل الفروع" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الفروع</SelectItem>
              {branches.map((b: any) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Print/Export All Recipes - requires branch selection */}
          {selectedBranch !== "all" && (
            <>
              {/* Category filter for print */}
              <Select value={selectedPrintCategory} onValueChange={setSelectedPrintCategory}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="تصنيف الطباعة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل التصنيفات</SelectItem>
                  {posCategories
                    .filter((c: any) => !c.branch_id || c.branch_id === selectedBranch)
                    .map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>

              {allRecipesData.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1 h-7 text-xs w-full">
                        <Printer size={12} /> طباعة الكل ({allRecipesData.length})
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handlePrintAllRecipes(false)}>الكميات فقط</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handlePrintAllRecipes(true)}>بالتكلفة</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button variant="outline" size="sm" className="gap-1 h-7 text-xs flex-1" onClick={handleExportAllPdf} disabled={loadingAllPdf}>
                    {loadingAllPdf ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />} PDF
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1 h-7 text-xs flex-1" onClick={handleExportAllExcel} disabled={loadingAllExcel}>
                    {loadingAllExcel ? <Loader2 size={12} className="animate-spin" /> : <FileSpreadsheet size={12} className="text-green-600" />} Excel
                  </Button>
                </div>
              )}
            </>
          )}

          <Select value={selectedEngClass} onValueChange={setSelectedEngClass}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="تصنيف المنيو" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل التصنيفات</SelectItem>
              <SelectItem value="kitchen">Kitchen</SelectItem>
              <SelectItem value="bar">Bar</SelectItem>
            </SelectContent>
          </Select>

          {/* Product Search */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="بحث بمنتج أو مجموعة..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="pr-9 h-9 text-sm"
            />
          </div>

          {/* Product Filter Tabs */}
          <div className="flex gap-1">
            {(["all", "ready", "draft"] as ProductFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setProductFilter(f)}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-medium transition-colors",
                  productFilter === f ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/50",
                )}
              >
                {f === "all" ? "الكل" : f === "ready" ? "Ready" : "Draft"}
              </button>
            ))}
          </div>

          {/* Product List */}
          <div className="space-y-1.5">
            {filteredProducts.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">لا توجد منتجات</p>
            ) : (
              filteredProducts.map((p: any) => {
                const status = getProductRecipeStatus(p.id);
                const isSelected = selectedProductId === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => handleSelectProduct(p.id)}
                    className={cn(
                      "w-full text-right p-3 rounded-xl transition-all duration-200 border",
                      isSelected
                        ? "bg-primary/10 border-primary/30"
                        : "bg-muted/20 border-transparent hover:bg-muted/40",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{p.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">{Number(p.price).toFixed(2)} EGP</span>
                          <span className="text-xs text-muted-foreground">•</span>
                          <span className="text-xs text-muted-foreground truncate">{getProductCategory(p)}</span>
                        </div>
                      </div>
                      {status === "ready" ? (
                        <CheckCircle2 size={14} className="text-green-400 flex-shrink-0" />
                      ) : (
                        <Clock size={14} className="text-yellow-400 flex-shrink-0" />
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Left Panel - Recipe Builder */}
        <div className="lg:col-span-2 space-y-4">
          {!selectedProduct ? (
            <div className="glass-card p-12 text-center">
              <ChefHat size={48} className="mx-auto mb-4 text-muted-foreground/30" />
              <p className="text-muted-foreground">اختر منتج من القائمة لبدء بناء الوصفة</p>
            </div>
          ) : (
            <>
              {/* Product Info */}
              <div className="glass-card p-4 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-lg">{selectedProduct.name}</h3>
                  <p className="text-sm text-muted-foreground">{getProductCategory(selectedProduct)}</p>
                </div>
                <div className="text-left">
                  <p className="text-xs text-muted-foreground">سعر البيع</p>
                  <p className="font-bold text-primary text-lg">{Number(selectedProduct.price).toFixed(2)} EGP</p>
                </div>
              </div>

              {/* Add Ingredients Button */}
              {!isLocked && (
                <Button
                  onClick={() => {
                    setShowAddIngredients(true);
                    setSelectedItemIds(new Set());
                    setIngredientSearch("");
                    setFilterDept("all");
                    setFilterCat("all");
                  }}
                  size="sm"
                >
                  <Plus size={14} /> إضافة خامات
                </Button>
              )}

              {/* Ingredients Table */}
              <div className="glass-card overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">الخامة</TableHead>
                      <TableHead className="text-right">الوحدة</TableHead>
                      <TableHead className="text-right">الكمية</TableHead>
                      <TableHead className="text-right">م. التكلفة</TableHead>
                      <TableHead className="text-right">الإجمالي</TableHead>
                      {!isLocked && <TableHead className="text-right w-20">إجراءات</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ingredients.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                          لا توجد خامات — أضف مكونات الوصفة
                        </TableCell>
                      </TableRow>
                    ) : (
                      ingredients.map((ing, idx) => {
                        const qtyInStockUnit = ing.qty / (ing.conversion_factor || 1);
                        const total = qtyInStockUnit * ing.avg_cost;
                        return (
                          <TableRow key={idx}>
                            <TableCell>
                              <div>
                                <span className="font-medium text-sm">{ing.name}</span>
                                <span className="text-xs text-muted-foreground block font-mono">{ing.code}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">{ing.recipe_unit}</TableCell>
                            <TableCell>
                              {isLocked ? (
                                <span className="text-sm">{ing.qty}</span>
                              ) : (
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.001"
                                  value={ing.qty || ""}
                                  onChange={(e) => updateIngredientQty(idx, e.target.value)}
                                  className="w-24 h-8 text-sm"
                                />
                              )}
                            </TableCell>
                            <TableCell className="text-sm">{ing.avg_cost.toFixed(2)}</TableCell>
                            <TableCell className="text-sm font-semibold">{total.toFixed(2)}</TableCell>
                            {!isLocked && (
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-primary"
                                    title="استبدال الخامة"
                                    onClick={() => handleOpenReplace(idx)}
                                  >
                                    <Pencil size={14} />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive"
                                    onClick={() => handleDeleteIngredient(idx)}
                                  >
                                    <Trash2 size={14} />
                                  </Button>
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Summary Boxes */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sticky bottom-0 z-10">
                <div className="glass-card p-4 text-center">
                  <div className="flex items-center justify-center mb-2">
                    <ShoppingBasket size={18} className="text-primary" />
                  </div>
                  <p className="text-xs text-muted-foreground mb-1">تكلفة المكونات</p>
                  <p className="font-bold text-lg">{totalIngredientsCost.toFixed(2)}</p>
                </div>
                <div className="glass-card p-4 text-center">
                  <div className="flex items-center justify-center mb-2">
                    <DollarSign size={18} className="text-primary" />
                  </div>
                  <p className="text-xs text-muted-foreground mb-1">سعر البيع</p>
                  <p className="font-bold text-lg">{sellingPrice.toFixed(2)}</p>
                </div>
                <div className="glass-card p-4 text-center">
                  <div className="flex items-center justify-center mb-2">
                    <TrendingUp size={18} className="text-green-400" />
                  </div>
                  <p className="text-xs text-muted-foreground mb-1">صافي الربح</p>
                  <p className={cn("font-bold text-lg", netProfit >= 0 ? "text-green-400" : "text-red-400")}>
                    {netProfit.toFixed(2)}
                  </p>
                </div>
                <div className="glass-card p-4 text-center">
                  <div className="flex items-center justify-center mb-2">
                    <Percent size={18} className={getMarginColor(profitMargin)} />
                  </div>
                  <p className="text-xs text-muted-foreground mb-1">هامش الربح</p>
                  <p className={cn("font-bold text-lg", getMarginColor(profitMargin))}>{profitMargin.toFixed(1)}%</p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Add Ingredients Modal */}
      <Dialog open={showAddIngredients} onOpenChange={setShowAddIngredients}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>إضافة خامات</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث..."
                value={ingredientSearch}
                onChange={(e) => setIngredientSearch(e.target.value)}
                className="pr-9"
              />
            </div>
            <div className="flex gap-2">
              <Select value={filterDept} onValueChange={setFilterDept}>
                <SelectTrigger className="h-9 text-xs flex-1">
                  <SelectValue placeholder="القسم" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأقسام</SelectItem>
                  {departments.map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterCat} onValueChange={setFilterCat}>
                <SelectTrigger className="h-9 text-xs flex-1">
                  <SelectValue placeholder="المجموعة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المجموعات</SelectItem>
                  {categories.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="border rounded-xl max-h-72 overflow-auto">
              {availableIngredients.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-4">لا توجد خامات متاحة</p>
              ) : (
                availableIngredients.map((si: any) => {
                  const dept = departments.find((d: any) => d.id === si.department_id);
                  return (
                    <label
                      key={si.id}
                      className="flex items-center gap-3 p-3 hover:bg-muted/30 cursor-pointer border-b last:border-b-0"
                    >
                      <Checkbox checked={selectedItemIds.has(si.id)} onCheckedChange={() => toggleItem(si.id)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{si.name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{dept?.name || "—"}</span>
                          <span>•</span>
                          <span>{si.stock_unit}</span>
                          <span>•</span>
                          <span>م.ت: {Number(si.avg_cost).toFixed(2)}</span>
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddIngredients(false)}>
              إلغاء
            </Button>
            <Button onClick={handleAddIngredients} disabled={selectedItemIds.size === 0}>
              إضافة ({selectedItemIds.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Material Usage Detail Dialog */}
      <Dialog open={!!selectedMaterial} onOpenChange={(open) => !open && setSelectedMaterial(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>تفاصيل استخدام خامة: {selectedMaterial?.name}</DialogTitle>
          </DialogHeader>
          {selectedMaterial && (
            <div className="space-y-3">
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>الكود: {selectedMaterial.code || "—"}</span>
                <span>الوحدة: {selectedMaterial.stock_unit}</span>
                <span>م. التكلفة: {Number(selectedMaterial.avg_cost).toFixed(2)}</span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">المنتج</TableHead>
                    <TableHead className="text-right">الكمية</TableHead>
                    <TableHead className="text-right">الوحدة</TableHead>
                    <TableHead className="text-right">م. التكلفة</TableHead>
                    <TableHead className="text-right">الإجمالي</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(selectedMaterial.usageDetails || []).map((u: any, idx: number) => {
                    const cost = (u.qty / (u.conversionFactor || 1)) * u.avgCost;
                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-medium text-sm">{u.productName}</TableCell>
                        <TableCell className="text-sm">{u.qty}</TableCell>
                        <TableCell className="text-sm">{u.unit}</TableCell>
                        <TableCell className="text-sm">{u.avgCost.toFixed(2)}</TableCell>
                        <TableCell className="text-sm font-semibold">{cost.toFixed(2)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <MaterialUsagePrintExport
                materialName={selectedMaterial.name}
                materialCode={selectedMaterial.code || "—"}
                usageData={selectedMaterial.usageDetails || []}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Replace Ingredient Dialog */}
      <Dialog open={showReplaceDialog} onOpenChange={(open) => { if (!open) { setShowReplaceDialog(false); setReplaceIdx(null); } }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>استبدال الخامة: {replaceIdx !== null && ingredients[replaceIdx] ? ingredients[replaceIdx].name : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Select value={replaceFilterDept} onValueChange={setReplaceFilterDept}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="كل الأقسام" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأقسام</SelectItem>
                  {departments.map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={replaceFilterCat} onValueChange={setReplaceFilterCat}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="كل المجموعات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المجموعات</SelectItem>
                  {categories.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم أو الكود..."
                value={replaceSearch}
                onChange={(e) => setReplaceSearch(e.target.value)}
                className="pr-9 h-9 text-sm"
              />
            </div>
            <div className="border rounded-xl max-h-72 overflow-auto">
              {availableReplacements.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-4">لا توجد خامات متاحة</p>
              ) : (
                availableReplacements.map((si: any) => {
                  const dept = departments.find((d: any) => d.id === si.department_id);
                  return (
                    <button
                      key={si.id}
                      className="flex items-center gap-3 p-3 hover:bg-muted/30 cursor-pointer border-b last:border-b-0 w-full text-right"
                      onClick={() => handleReplaceIngredient(si)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{si.name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{si.code || "—"}</span>
                          <span>•</span>
                          <span>{dept?.name || "—"}</span>
                          <span>•</span>
                          <span>{si.stock_unit}</span>
                          <span>•</span>
                          <span>م.ت: {Number(si.avg_cost).toFixed(2)}</span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
