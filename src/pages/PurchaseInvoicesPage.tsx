import React from "react";
import { PurchaseInvoicesTab } from "@/components/purchases/PurchaseInvoicesTab";

export const PurchaseInvoicesPage: React.FC = () => {
  return (
    <div>
      <h1 className="text-2xl font-black text-gradient mb-6">فواتير المشتريات</h1>
      <PurchaseInvoicesTab />
    </div>
  );
};
