import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { exportToExcel, exportToPDF, type ExportColumn } from "@/lib/exportUtils";
import { toast } from "sonner";

interface ExportButtonsProps {
  data: Record<string, any>[];
  columns: ExportColumn[];
  filename: string;
  title: string;
  headerGroups?: { label: string; colSpan: number }[];
}

export const ExportButtons: React.FC<ExportButtonsProps> = ({
  data,
  columns,
  filename,
  title,
  headerGroups,
}) => {
  const [loadingExcel, setLoadingExcel] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);

  const handleExcel = async () => {
    setLoadingExcel(true);
    try {
      await exportToExcel({ title, filename, columns, data, headerGroups });
      toast.success("تم تصدير Excel بنجاح");
    } catch (err) {
      console.error(err);
      toast.error("حدث خطأ أثناء التصدير");
    } finally {
      setLoadingExcel(false);
    }
  };

  const handlePdf = async () => {
    setLoadingPdf(true);
    try {
      await exportToPDF({ title, filename, columns, data, headerGroups });
      toast.success("تم تصدير PDF بنجاح");
    } catch (err) {
      console.error(err);
      toast.error("حدث خطأ أثناء التصدير");
    } finally {
      setLoadingPdf(false);
    }
  };

  if (!data || data.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePdf} disabled={loadingPdf}>
        {loadingPdf ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
        PDF
      </Button>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExcel} disabled={loadingExcel}>
        {loadingExcel ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} className="text-green-600" />}
        Excel
      </Button>
    </div>
  );
};
