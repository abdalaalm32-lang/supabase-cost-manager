import React, { useState, useMemo, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Plus, Save, Pencil, Trash2, Search, ChefHat,
  ShoppingBasket, CheckCircle2, Clock, Edit3
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { RecipePrintExport, MaterialUsagePrintExport } from "@/components/RecipePrintExport";
import { Badge } from "@/components/ui/badge";

interface LocalIngredient {
  id?: string;
  stock_item_id: string;
  name: string;
  code: string;
  recipe_unit: string;
  stock_unit: string;
  conversion_factor: number;
  qty: number; // in recipe_unit
  avg_cost: number; // per stock_unit (e.g. per kg)
}

type RecipeStatus = "ready" | "draft" | "editing";

export const ProductionRecipesPage: React.FC = () => {
  const { auth } = useAuth();
  const companyId = auth.profile?.company_id;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);

  const [ingredients, setIngredients] = useState<LocalIngredient[]>([]);
  const [recipeStatus, setRecipeStatus] = useState<RecipeStatus>("draft");
  const [isEditing, setIsEditing] = useState(false);
  const [recipeId, setRecipeId] = useState<string | null>(null);

  // Produced quantity state
  const [producedQtyStr, setProducedQtyStr] = useState<string>("");
  const producedQty = Number(producedQtyStr) || 0;

  const [showAddIngredients, setShowAddIngredients] = useState(false);
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [filterDept, setFilterDept] = useState("all");
  const [filterCat, setFilterCat] = useState("all");
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  // Global ingredient search
  const [globalSearch, setGlobalSearch] = useState("");
  const [showGlobalResults, setShowGlobalResults] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<any>(null);

  // Propagation dialog state
  const [showPropagateDialog, setShowPropagateDialog] = useState(false);
  const [pendingSaveIngredients, setPendingSaveIngredients] = useState<LocalIngredient[]>([]);
  const [otherBranchRecipes, setOtherBranchRecipes] = useState<any[]>([]);

  // Queries
  const { data: branches = [] } = useQuery({
    queryKey: ["branches-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").eq("active", true).order("name");
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

  // Fetch stock_item_locations to know which items are linked to which branches
  const { data: stockItemLocations = [] } = useQuery({
    queryKey: ["stock-item-locations", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_item_locations").select("*");
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

  const { data: departments = [] } = useQuery({
    queryKey: ["departments-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: recipes = [] } = useQuery({
    queryKey: ["production-recipes", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("production_recipes").select("*, production_recipe_ingredients(*)");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Find the "المصنعات" category
  const manufacturingCategory = useMemo(() => {
    return categories.find((c: any) => c.name === "المصنعات" || c.name?.includes("مصنع"));
  }, [categories]);

  // Build a map: stock_item_id -> Set of branch_ids it's linked to
  const itemBranchMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const loc of stockItemLocations) {
      if (loc.branch_id) {
        if (!map.has(loc.stock_item_id)) map.set(loc.stock_item_id, new Set());
        map.get(loc.stock_item_id)!.add(loc.branch_id);
      }
    }
    return map;
  }, [stockItemLocations]);

  // Products are stock items under "المصنعات" category, filtered by branch location
  const productItems = useMemo(() => {
    if (!manufacturingCategory) return [];
    let items = allStockItems.filter((si: any) => si.category_id === manufacturingCategory.id);
    // If a branch is selected, only show items linked to that branch
    if (selectedBranchId) {
      items = items.filter((si: any) => {
        const linkedBranches = itemBranchMap.get(si.id);
        return linkedBranches && linkedBranches.has(selectedBranchId);
      });
    }
    return items;
  }, [allStockItems, manufacturingCategory, selectedBranchId, itemBranchMap]);

  // Filter recipes by selected branch
  const branchRecipes = useMemo(() => {
    if (!selectedBranchId) return recipes;
    return recipes.filter((r: any) => r.branch_id === selectedBranchId);
  }, [recipes, selectedBranchId]);

  const recipeMap = useMemo(() => {
    const map: Record<string, any> = {};
    branchRecipes.forEach((r: any) => { map[r.stock_item_id] = r; });
    return map;
  }, [branchRecipes]);

  const categoryMap = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach((c: any) => { map[c.id] = c.name; });
    return map;
  }, [categories]);

  const filteredProducts = useMemo(() => {
    let items = productItems;
    if (productSearch.trim()) {
      const q = productSearch.trim().toLowerCase();
      items = items.filter((p: any) => {
        const catName = (p.category_id ? categoryMap[p.category_id] : "") || "";
        return p.name.toLowerCase().includes(q) || (p.code || "").toLowerCase().includes(q) || catName.toLowerCase().includes(q);
      });
    }
    return items;
  }, [productItems, productSearch, categoryMap]);

  const selectedProduct = useMemo(() => {
    if (!selectedProductId) return null;
    return productItems.find((p: any) => p.id === selectedProductId) || null;
  }, [selectedProductId, productItems]);

  const getStatusBadge = (status: RecipeStatus) => {
    switch (status) {
      case "ready": return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/15 text-green-400"><CheckCircle2 size={10} /> Ready</span>;
      case "editing": return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-400"><Edit3 size={10} /> Editing</span>;
      default: return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/15 text-yellow-400"><Clock size={10} /> Draft</span>;
    }
  };

  const loadRecipe = useCallback(async (productId: string) => {
    const recipe = recipeMap[productId];
    if (recipe) {
      setRecipeId(recipe.id);
      setRecipeStatus("ready");
      setIsEditing(false);
      const ings: LocalIngredient[] = (recipe.production_recipe_ingredients || []).map((ri: any) => {
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
    setProducedQtyStr("");
  }, [recipeMap, allStockItems]);

  const handleSelectProduct = (productId: string) => {
    setSelectedProductId(productId);
    loadRecipe(productId);
  };

  const existingStockIds = useMemo(() => new Set(ingredients.map(i => i.stock_item_id)), [ingredients]);

  const availableIngredients = useMemo(() => {
    let items = allStockItems.filter((s: any) => !existingStockIds.has(s.id) && s.id !== selectedProductId);
    if (filterDept !== "all") items = items.filter((s: any) => s.department_id === filterDept);
    if (filterCat !== "all") items = items.filter((s: any) => s.category_id === filterCat);
    if (ingredientSearch.trim()) {
      const q = ingredientSearch.trim().toLowerCase();
      items = items.filter((s: any) => s.name.toLowerCase().includes(q) || (s.code || "").toLowerCase().includes(q));
    }
    return items;
  }, [allStockItems, existingStockIds, filterDept, filterCat, ingredientSearch, selectedProductId]);

  const toggleItem = (id: string) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAddIngredients = () => {
    const newIngs: LocalIngredient[] = Array.from(selectedItemIds).map(siId => {
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
    setIngredients(prev => [...prev, ...newIngs]);
    setShowAddIngredients(false);
    setSelectedItemIds(new Set());
    setIngredientSearch("");
  };

  const handleDeleteIngredient = (idx: number) => {
    setIngredients(prev => prev.filter((_, i) => i !== idx));
  };

  const updateIngredientQty = (idx: number, val: string) => {
    setIngredients(prev => prev.map((ing, i) => i === idx ? { ...ing, qty: Number(val) || 0 } : ing));
  };

  // Calculate cost: qty is in recipe_unit. Convert to stock_unit using conversion_factor.
  const getIngredientCost = (ing: LocalIngredient) => {
    const factor = ing.conversion_factor || 1;
    const qtyInStockUnit = ing.qty / factor;
    return qtyInStockUnit * ing.avg_cost;
  };

  const totalIngredientsCost = useMemo(() => {
    return ingredients.reduce((sum, ing) => sum + getIngredientCost(ing), 0);
  }, [ingredients]);

  // Unit cost per produced quantity
  const unitCost = useMemo(() => {
    if (producedQty > 0) return totalIngredientsCost / producedQty;
    return 0;
  }, [totalIngredientsCost, producedQty]);

  // Global ingredient search across all production recipes
  const globalSearchResults = useMemo(() => {
    if (!globalSearch.trim()) return [];
    const q = globalSearch.trim().toLowerCase();
    const matchedItems = allStockItems.filter(
      (s: any) => s.name.toLowerCase().includes(q) || (s.code || "").toLowerCase().includes(q),
    );
    return matchedItems.map((si: any) => {
      const usedIn = recipes.filter((r: any) =>
        (r.production_recipe_ingredients || []).some((ri: any) => ri.stock_item_id === si.id),
      );
      const usageDetails = usedIn.map((r: any) => {
        const product = allStockItems.find((p: any) => p.id === r.stock_item_id) || productItems.find((p: any) => p.id === r.stock_item_id);
        const ri = (r.production_recipe_ingredients || []).find((ri: any) => ri.stock_item_id === si.id);
        return {
          productName: product?.name || "—",
          qty: Number(ri?.qty || 0),
          unit: si.recipe_unit || si.stock_unit || "كجم",
          avgCost: Number(si.avg_cost || 0),
          conversionFactor: Number(si.conversion_factor || 1),
        };
      });
      return { ...si, usedInCount: usedIn.length, usageDetails };
    }).filter((item: any) => item.usedInCount > 0);
  }, [globalSearch, allStockItems, recipes, productItems]);

  const saveRecipeCore = async (ingredientsToSave: LocalIngredient[]) => {
    if (!selectedProductId || !companyId) return;
    if (recipeId) {
      await supabase.from("production_recipe_ingredients").delete().eq("recipe_id", recipeId);
      if (ingredientsToSave.length > 0) {
        const rows = ingredientsToSave.map(ing => ({
          recipe_id: recipeId,
          stock_item_id: ing.stock_item_id,
          qty: ing.qty,
        }));
        const { error } = await supabase.from("production_recipe_ingredients").insert(rows);
        if (error) throw error;
      }
      await supabase.from("production_recipes").update({ last_updated: new Date().toISOString() }).eq("id", recipeId);
    } else {
      const { data: newRecipe, error } = await supabase.from("production_recipes").insert({
        company_id: companyId,
        stock_item_id: selectedProductId,
        branch_id: selectedBranchId || null,
      }).select().single();
      if (error) throw error;
      if (ingredientsToSave.length > 0) {
        const rows = ingredientsToSave.map(ing => ({
          recipe_id: newRecipe.id,
          stock_item_id: ing.stock_item_id,
          qty: ing.qty,
        }));
        await supabase.from("production_recipe_ingredients").insert(rows);
      }
      setRecipeId(newRecipe.id);
    }
  };

  const propagateToOtherBranches = async (ingsToPropagate: LocalIngredient[]) => {
    if (!selectedProductId || !companyId) return;
    // Get linked branches for this stock item
    const linkedBranches = itemBranchMap.get(selectedProductId) || new Set();
    
    // Find other branch recipes for the same stock_item_id
    const otherRecipes = recipes.filter((r: any) =>
      r.stock_item_id === selectedProductId && r.id !== recipeId && r.branch_id !== selectedBranchId
    );
    for (const otherRecipe of otherRecipes) {
      // Only propagate to linked branches
      if (!linkedBranches.has(otherRecipe.branch_id)) continue;
      await supabase.from("production_recipe_ingredients").delete().eq("recipe_id", otherRecipe.id);
      if (ingsToPropagate.length > 0) {
        const rows = ingsToPropagate.map(ing => ({
          recipe_id: otherRecipe.id,
          stock_item_id: ing.stock_item_id,
          qty: ing.qty,
        }));
        await supabase.from("production_recipe_ingredients").insert(rows);
      }
      await supabase.from("production_recipes").update({ last_updated: new Date().toISOString() }).eq("id", otherRecipe.id);
    }
    // Create recipes for linked branches that don't have one yet
    const existingBranchIds = new Set(otherRecipes.map((r: any) => r.branch_id));
    if (selectedBranchId) existingBranchIds.add(selectedBranchId);
    const missingBranches = branches.filter((b: any) => 
      linkedBranches.has(b.id) && !existingBranchIds.has(b.id)
    );
    for (const branch of missingBranches) {
      const { data: newR, error } = await supabase.from("production_recipes").insert({
        company_id: companyId,
        stock_item_id: selectedProductId,
        branch_id: branch.id,
      }).select().single();
      if (error) continue;
      if (ingsToPropagate.length > 0) {
        const rows = ingsToPropagate.map(ing => ({
          recipe_id: newR.id,
          stock_item_id: ing.stock_item_id,
          qty: ing.qty,
        }));
        await supabase.from("production_recipe_ingredients").insert(rows);
      }
    }
  };

  const handleSave = async () => {
    if (!selectedProductId || !companyId) return;
    try {
      await saveRecipeCore(ingredients);
      setRecipeStatus("ready");
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ["production-recipes"] });

      // Check if there are other linked branches to propagate to
      if (selectedBranchId) {
        const linkedBranches = itemBranchMap.get(selectedProductId) || new Set();
        // Get other linked branches (excluding current)
        const otherLinkedBranchIds = Array.from(linkedBranches).filter(bid => bid !== selectedBranchId);
        
        if (otherLinkedBranchIds.length > 0) {
          const otherBranchesWithRecipe = recipes.filter((r: any) =>
            r.stock_item_id === selectedProductId && r.branch_id !== selectedBranchId && linkedBranches.has(r.branch_id)
          );
          const branchesWithoutRecipe = branches.filter((b: any) => {
            if (b.id === selectedBranchId) return false;
            if (!linkedBranches.has(b.id)) return false;
            return !otherBranchesWithRecipe.some((r: any) => r.branch_id === b.id);
          });
          const allOther = [...otherBranchesWithRecipe.map((r: any) => {
            const br = branches.find((b: any) => b.id === r.branch_id);
            return { id: r.id, branchName: br?.name || "فرع غير معروف", exists: true };
          }), ...branchesWithoutRecipe.map((b: any) => ({
            id: null, branchName: b.name, exists: false,
          }))];
          if (allOther.length > 0) {
            setPendingSaveIngredients([...ingredients]);
            setOtherBranchRecipes(allOther);
            setShowPropagateDialog(true);
            return;
          }
        }
      }

      toast({ title: "تم حفظ تركيبة الإنتاج بنجاح" });
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    }
  };

  const handlePropagateConfirm = async () => {
    try {
      await propagateToOtherBranches(pendingSaveIngredients);
      queryClient.invalidateQueries({ queryKey: ["production-recipes"] });
      toast({ title: "تم حفظ التركيبة وتطبيقها على جميع الفروع بنجاح" });
    } catch (err: any) {
      toast({ title: "خطأ في النشر", description: err.message, variant: "destructive" });
    } finally {
      setShowPropagateDialog(false);
      setPendingSaveIngredients([]);
      setOtherBranchRecipes([]);
    }
  };

  const handlePropagateCancel = () => {
    setShowPropagateDialog(false);
    setPendingSaveIngredients([]);
    setOtherBranchRecipes([]);
    toast({ title: "تم حفظ تركيبة الإنتاج بنجاح" });
  };

  const handleDeleteRecipe = async () => {
    if (!recipeId) return;
    await supabase.from("production_recipe_ingredients").delete().eq("recipe_id", recipeId);
    await supabase.from("production_recipes").delete().eq("id", recipeId);
    setRecipeId(null);
    setIngredients([]);
    setRecipeStatus("draft");
    setIsEditing(true);
    setProducedQtyStr("");
    queryClient.invalidateQueries({ queryKey: ["production-recipes"] });
    toast({ title: "تم حذف التركيبة" });
  };

  const handleEdit = () => {
    setIsEditing(true);
    setRecipeStatus("editing");
  };

  const isLocked = recipeStatus === "ready" && !isEditing;

  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <ChefHat size={28} className="text-primary" />
          <h1 className="text-2xl font-bold">ريسيبي تركيبة الإنتاج</h1>
          {selectedProduct && getStatusBadge(recipeStatus === "editing" ? "editing" : recipeStatus)}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Branch Selector - no "all branches" option */}
          <Select value={selectedBranchId || ""} onValueChange={(v) => {
            setSelectedBranchId(v || null);
            setSelectedProductId(null);
            setIngredients([]);
            setRecipeId(null);
            setRecipeStatus("draft");
            setIsEditing(false);
            setProducedQtyStr("");
          }}>
            <SelectTrigger className="w-48 h-9 text-sm"><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
            <SelectContent>
              {branches.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Global Ingredient Search */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="بحث خامة في المنتجات المصنعة..."
              value={globalSearch}
              onChange={(e) => {
                setGlobalSearch(e.target.value);
                setShowGlobalResults(true);
              }}
              onFocus={() => globalSearch && setShowGlobalResults(true)}
              className="pr-9 w-64"
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
                        {item.usedInCount} تركيبة
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
                <Button onClick={handleSave} size="sm"><Save size={14} /> حفظ التركيبة</Button>
              ) : null}
              {recipeStatus === "ready" && !isEditing && (
                <Button onClick={handleEdit} variant="outline" size="sm"><Pencil size={14} /> تعديل</Button>
              )}
              {recipeId && (
                <Button onClick={handleDeleteRecipe} variant="destructive" size="sm"><Trash2 size={14} /> حذف</Button>
              )}
              {ingredients.length > 0 && (
                <RecipePrintExport
                  productName={selectedProduct.name}
                  productCode={selectedProduct.code}
                  ingredients={ingredients}
                  totalCost={totalIngredientsCost}
                  type="production"
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Click outside to close global results */}
      {showGlobalResults && <div className="fixed inset-0 z-40" onClick={() => setShowGlobalResults(false)} />}

      {!selectedBranchId && (
        <div className="glass-card p-6 text-center">
          <p className="text-muted-foreground">يرجى تحديد الفرع أولاً لعرض المنتجات المصنعة المرتبطة به.</p>
        </div>
      )}

      {selectedBranchId && !manufacturingCategory && (
        <div className="glass-card p-6 text-center">
          <p className="text-muted-foreground">لا توجد مجموعة "المصنعات" في مواد المخزون. يرجى إنشاء مجموعة باسم "المصنعات" أولاً.</p>
        </div>
      )}

      {selectedBranchId && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Right Panel - Products */}
          <div className="lg:col-span-1 glass-card p-4 space-y-4 max-h-[calc(100vh-180px)] overflow-auto">
            <h2 className="font-bold text-sm">المنتجات المصنعة</h2>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="بحث بمنتج أو مجموعة..." value={productSearch} onChange={e => setProductSearch(e.target.value)} className="pr-9 h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              {filteredProducts.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">لا توجد منتجات مصنعة مرتبطة بهذا الفرع</p>
              ) : filteredProducts.map((p: any) => {
                const hasRecipe = !!recipeMap[p.id];
                const isSelected = selectedProductId === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => handleSelectProduct(p.id)}
                    className={cn(
                      "w-full text-right p-3 rounded-xl transition-all duration-200 border",
                      isSelected
                        ? "bg-primary/10 border-primary/30"
                        : "bg-muted/20 border-transparent hover:bg-muted/40"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{p.name}</p>
                        <span className="text-xs text-muted-foreground font-mono">{p.code}</span>
                      </div>
                      {hasRecipe ? (
                        <CheckCircle2 size={14} className="text-green-400 flex-shrink-0" />
                      ) : (
                        <Clock size={14} className="text-yellow-400 flex-shrink-0" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Left Panel - Recipe Builder */}
          <div className="lg:col-span-2 space-y-4">
            {!selectedProduct ? (
              <div className="glass-card p-12 text-center">
                <ChefHat size={48} className="mx-auto mb-4 text-muted-foreground/30" />
                <p className="text-muted-foreground">اختر منتج مصنع من القائمة لبدء بناء التركيبة</p>
              </div>
            ) : (
              <>
                <div className="glass-card p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="font-bold text-lg">{selectedProduct.name}</h3>
                      <p className="text-sm text-muted-foreground font-mono">{selectedProduct.code}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">الكمية المنتجة:</label>
                      <Input
                        type="number"
                        min="0"
                        step="0.001"
                        value={producedQtyStr}
                        onChange={e => setProducedQtyStr(e.target.value)}
                        className="w-28 h-9 text-sm"
                        placeholder="0"
                      />
                      <span className="text-sm text-muted-foreground">{selectedProduct.stock_unit || "كجم"}</span>
                    </div>
                  </div>
                </div>

                {!isLocked && (
                  <Button
                    onClick={() => { setShowAddIngredients(true); setSelectedItemIds(new Set()); setIngredientSearch(""); setFilterDept("all"); setFilterCat("all"); }}
                    size="sm"
                  >
                    <Plus size={14} /> إضافة خامات
                  </Button>
                )}

                <div className="glass-card overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">الخامة</TableHead>
                        <TableHead className="text-right">وحدة الوصفة</TableHead>
                        <TableHead className="text-right">الكمية</TableHead>
                        <TableHead className="text-right">م. التكلفة/{"\u200b"}وحدة وصفة</TableHead>
                        <TableHead className="text-right">الإجمالي</TableHead>
                        {!isLocked && <TableHead className="text-right w-12">حذف</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ingredients.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                            لا توجد خامات — أضف مكونات التركيبة
                          </TableCell>
                        </TableRow>
                      ) : ingredients.map((ing, idx) => {
                        const total = getIngredientCost(ing);
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
                                  onChange={e => updateIngredientQty(idx, e.target.value)}
                                  className="w-24 h-8 text-sm"
                                />
                              )}
                            </TableCell>
                            <TableCell className="text-sm">{(ing.avg_cost / (ing.conversion_factor || 1)).toFixed(4)} / {ing.recipe_unit}</TableCell>
                            <TableCell className="text-sm font-semibold">{total.toFixed(4)}</TableCell>
                            {!isLocked && (
                              <TableCell>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteIngredient(idx)}>
                                  <Trash2 size={14} />
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                <div className="glass-card p-4">
                  <div className="flex items-center justify-center gap-8">
                    <div className="text-center">
                      <div className="flex items-center justify-center mb-2">
                        <ShoppingBasket size={18} className="text-primary" />
                      </div>
                      <p className="text-xs text-muted-foreground mb-1">إجمالي تكلفة التركيبة</p>
                      <p className="font-bold text-lg">{totalIngredientsCost.toFixed(2)} EGP</p>
                    </div>
                    {producedQty > 0 && (
                      <div className="text-center border-r pr-8">
                        <p className="text-xs text-muted-foreground mb-1">تكلفة الوحدة</p>
                        <p className="font-bold text-lg">{unitCost.toFixed(2)} EGP</p>
                        <p className="text-xs text-muted-foreground">لكل {selectedProduct.stock_unit || "كجم"}</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Add Ingredients Modal */}
      <Dialog open={showAddIngredients} onOpenChange={setShowAddIngredients}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader><DialogTitle>إضافة خامات</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="بحث..." value={ingredientSearch} onChange={e => setIngredientSearch(e.target.value)} className="pr-9" />
            </div>
            <div className="flex gap-2">
              <Select value={filterDept} onValueChange={setFilterDept}>
                <SelectTrigger className="h-9 text-xs flex-1"><SelectValue placeholder="القسم" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأقسام</SelectItem>
                  {departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterCat} onValueChange={setFilterCat}>
                <SelectTrigger className="h-9 text-xs flex-1"><SelectValue placeholder="المجموعة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المجموعات</SelectItem>
                  {categories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="border rounded-xl max-h-72 overflow-auto">
              {availableIngredients.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-4">لا توجد خامات متاحة</p>
              ) : availableIngredients.map((si: any) => {
                const dept = departments.find((d: any) => d.id === si.department_id);
                return (
                  <label key={si.id} className="flex items-center gap-3 p-3 hover:bg-muted/30 cursor-pointer border-b last:border-b-0">
                    <Checkbox checked={selectedItemIds.has(si.id)} onCheckedChange={() => toggleItem(si.id)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{si.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{dept?.name || "—"}</span>
                        <span>•</span>
                        <span>{si.recipe_unit || si.stock_unit}</span>
                        <span>•</span>
                        <span>م.ت: {Number(si.avg_cost).toFixed(2)}</span>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddIngredients(false)}>إلغاء</Button>
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
                    <TableHead className="text-right">المنتج المصنع</TableHead>
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

      {/* Propagation Dialog */}
      <AlertDialog open={showPropagateDialog} onOpenChange={setShowPropagateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تطبيق التركيبة على الفروع الأخرى؟</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>هل تريد تطبيق نفس التركيبة على الفروع التالية؟</p>
              <ul className="list-disc pr-6 space-y-1">
                {otherBranchRecipes.map((br, idx) => (
                  <li key={idx} className="text-sm">
                    {br.branchName} {br.exists ? "(سيتم التحديث)" : "(سيتم الإنشاء)"}
                  </li>
                ))}
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handlePropagateCancel}>لا، هذا الفرع فقط</AlertDialogCancel>
            <AlertDialogAction onClick={handlePropagateConfirm}>نعم، طبّق على الكل</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
