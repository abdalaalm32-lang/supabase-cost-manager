import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SuppliersTab } from "@/components/purchases/SuppliersTab";
import { PurchaseInvoicesTab } from "@/components/purchases/PurchaseInvoicesTab";
import { Truck, FileText } from "lucide-react";

export const PurchasesPage: React.FC = () => {
  return (
    <div>
      <h1 className="text-2xl font-black text-gradient mb-6">المشتريات</h1>
      <Tabs defaultValue="invoices" dir="rtl">
        <TabsList>
          <TabsTrigger value="invoices" className="gap-2"><FileText size={16} /> الفواتير</TabsTrigger>
          <TabsTrigger value="suppliers" className="gap-2"><Truck size={16} /> الموردين</TabsTrigger>
        </TabsList>
        <TabsContent value="invoices"><PurchaseInvoicesTab /></TabsContent>
        <TabsContent value="suppliers"><SuppliersTab /></TabsContent>
      </Tabs>
    </div>
  );
};
