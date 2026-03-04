import React from "react";
import { SuppliersTab } from "@/components/purchases/SuppliersTab";

export const PurchaseSuppliersPage: React.FC = () => {
  return (
    <div>
      <h1 className="text-2xl font-black text-gradient mb-6">الموردين</h1>
      <SuppliersTab />
    </div>
  );
};
