import React from "react";
import { Construction } from "lucide-react";

export const PlaceholderPage: React.FC<{ title: string }> = ({ title }) => (
  <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in-up">
    <div className="glass-card p-12 text-center max-w-md">
      <Construction size={48} className="mx-auto mb-4 text-primary" />
      <h2 className="text-2xl font-bold mb-2">{title}</h2>
      <p className="text-muted-foreground text-sm">
        هذه الصفحة قيد التطوير وسيتم إضافتها قريباً
      </p>
    </div>
  </div>
);
