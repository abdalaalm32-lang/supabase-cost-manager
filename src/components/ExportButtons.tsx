import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { exportToExcel, type ExportColumn } from "@/lib/exportUtils";
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
  const [loading, setLoading] = useState(false);

  const handleExcel = async () => {
    setLoading(true);
    try {
      await exportToExcel({ title, filename, columns, data, headerGroups });
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
    <Button variant="outline" size="sm" className="gap-2" onClick={handleExcel} disabled={loading}>
      {loading ? (
        <>
          <Loader2 size={14} className="animate-spin" />
          جاري التصدير...
        </>
      ) : (
        <>
          <FileSpreadsheet size={14} className="text-green-600" />
          تصدير Excel
        </>
      )}
    </Button>
  );
};
