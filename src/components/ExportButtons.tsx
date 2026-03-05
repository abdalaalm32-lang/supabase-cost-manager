import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
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
  const [loading, setLoading] = useState(false);

  const handleExcel = async () => {
    setLoading(true);
    try {
      await exportToExcel({ title, filename, columns, data });
      toast.success("تم تصدير الملف بنجاح");
    } catch (err) {
      console.error(err);
      toast.error("حدث خطأ أثناء التصدير");
    } finally {
      setLoading(false);
    }
  };

  const handlePDF = async () => {
    setLoading(true);
    try {
      await exportToPDF({ title, filename, columns, data });
      toast.success("تم تصدير الملف بنجاح");
    } catch (err) {
      console.error(err);
      toast.error("حدث خطأ أثناء التصدير");
    } finally {
      setLoading(false);
    }
  };

  if (!data || data.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" disabled={loading}>
          {loading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              جاري التصدير...
            </>
          ) : (
            <>
              <Download size={14} />
              تصدير
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleExcel} className="gap-2 cursor-pointer" disabled={loading}>
          <FileSpreadsheet size={14} className="text-green-600" />
          تصدير Excel
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handlePDF} className="gap-2 cursor-pointer" disabled={loading}>
          <FileText size={14} className="text-red-600" />
          تصدير PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
