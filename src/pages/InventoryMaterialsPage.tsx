import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, FolderOpen, Package } from "lucide-react";
import { DepartmentsTab } from "@/components/inventory/DepartmentsTab";
import { CategoriesTab } from "@/components/inventory/CategoriesTab";
import { StockItemsTab } from "@/components/inventory/StockItemsTab";

export const InventoryMaterialsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState("departments");

  return (
    <div className="space-y-6 animate-fade-in-up">
      <h1 className="text-2xl font-bold">مواد المخزون</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
        <TabsList className="grid w-full grid-cols-3 max-w-lg">
          <TabsTrigger value="departments" className="gap-2">
            <Building2 size={16} /> تكويد الأقسام
          </TabsTrigger>
          <TabsTrigger value="categories" className="gap-2">
            <FolderOpen size={16} /> تكويد المجموعات
          </TabsTrigger>
          <TabsTrigger value="items" className="gap-2">
            <Package size={16} /> تكويد الأصناف
          </TabsTrigger>
        </TabsList>

        <TabsContent value="departments">
          <DepartmentsTab />
        </TabsContent>
        <TabsContent value="categories">
          <CategoriesTab />
        </TabsContent>
        <TabsContent value="items">
          <StockItemsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};
