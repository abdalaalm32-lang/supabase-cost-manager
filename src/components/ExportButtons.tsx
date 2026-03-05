import React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { exportToExcel, exportToPDF, type ExportColumn } from "@/lib/exportUtils";
import { toast } from "sonner";

interface ExportButtonsProps {
  data: Record<string, any>[];
  columns: ExportColumn[];
  filename: string;
  title: string;
}

export const ExportButtons: React.FC<ExportButtonsProps> = ({
  data,
  columns,
  filename,
  title,
}) => {
  const handleExcel = () => {
    try {
      exportToExcel({ title, filename, columns, data });
      toast.success("تم تصدير الملف بنجاح");
    } catch (err) {
      toast.error("حدث خطأ أثناء التصدير");
    }
  };

  const handlePDF = async () => {
    try {
      await exportToPDF({ title, filename, columns, data });
      toast.success("تم تصدير الملف بنجاح");
    } catch (err) {
      toast.error("حدث خطأ أثناء التصدير");
    }
  };

  if (!data || data.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Download size={14} />
          تصدير
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleExcel} className="gap-2 cursor-pointer">
          <FileSpreadsheet size={14} className="text-green-600" />
          تصدير Excel
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handlePDF} className="gap-2 cursor-pointer">
          <FileText size={14} className="text-red-600" />
          تصدير PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
