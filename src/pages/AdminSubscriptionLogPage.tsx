import React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Building2, ChevronDown, ChevronUp, History } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export const AdminSubscriptionLogPage: React.FC = () => {
  const { auth } = useAuth();
  const [expandedCompany, setExpandedCompany] = React.useState<string | null>(null);

  const { data: companies, isLoading: loadingCompanies } = useQuery({
    queryKey: ["admin-log-companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name, code, active, subscription_type, subscription_end")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: auth.isAdmin,
  });

  const { data: logs, isLoading: loadingLogs } = useQuery({
    queryKey: ["admin-sub-logs", expandedCompany],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_subscription_log")
        .select("*")
        .eq("company_id", expandedCompany!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!expandedCompany,
  });

  const getActionColor = (action: string) => {
    if (action === "تجديد") return "bg-primary/10 text-primary";
    if (action === "تعطيل") return "bg-destructive/10 text-destructive";
    if (action === "تفعيل") return "bg-emerald-500/10 text-emerald-600";
    if (action === "إنشاء") return "bg-blue-500/10 text-blue-600";
    if (action.includes("دقائق")) return "bg-amber-500/10 text-amber-600";
    return "bg-muted text-muted-foreground";
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h2 className="text-2xl font-black text-foreground flex items-center gap-2">
          <History className="h-6 w-6 text-primary" />
          سجلات الشركات
        </h2>
        <p className="text-sm text-muted-foreground">سجل كامل لجميع عمليات الاشتراك والتفعيل والتعطيل لكل شركة</p>
      </div>

      {loadingCompanies ? (
        <p className="text-center text-muted-foreground py-10">جاري التحميل...</p>
      ) : !companies || companies.length === 0 ? (
        <p className="text-center text-muted-foreground py-10">لا توجد شركات</p>
      ) : (
        <div className="space-y-3">
          {companies.map((company: any) => (
            <Card key={company.id} className="glass-card">
              <CardContent className="p-0">
                <Collapsible
                  open={expandedCompany === company.id}
                  onOpenChange={(open) => setExpandedCompany(open ? company.id : null)}
                >
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
                          <Building2 className="h-5 w-5 text-primary-foreground" />
                        </div>
                        <div className="text-start">
                          <p className="font-bold text-foreground">{company.name}</p>
                          <p className="text-xs text-muted-foreground">{company.code}</p>
                        </div>
                        <Badge variant={company.active ? "default" : "destructive"} className="text-xs">
                          {company.active ? "نشط" : "معطل"}
                        </Badge>
                        {company.subscription_type !== "unlimited" && company.subscription_end && (
                          <Badge
                            variant={new Date(company.subscription_end) < new Date() ? "destructive" : "secondary"}
                            className="text-xs"
                          >
                            ينتهي {format(new Date(company.subscription_end), "yyyy-MM-dd HH:mm")}
                          </Badge>
                        )}
                      </div>
                      {expandedCompany === company.id ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t border-border/30 p-4">
                      <ScrollArea className="max-h-[400px]">
                        {loadingLogs ? (
                          <p className="text-center text-muted-foreground py-6">جاري التحميل...</p>
                        ) : !logs || logs.length === 0 ? (
                          <p className="text-center text-muted-foreground py-6">لا توجد سجلات لهذه الشركة</p>
                        ) : (
                          <div className="space-y-2">
                            {logs.map((log: any) => (
                              <div
                                key={log.id}
                                className="flex items-start gap-3 p-3 rounded-lg border border-border/40 bg-muted/10 hover:bg-muted/20 transition-colors"
                              >
                                <div className={cn("px-2 py-1 rounded-md text-xs font-bold whitespace-nowrap", getActionColor(log.action))}>
                                  {log.action}
                                </div>
                                <div className="flex-1 min-w-0 space-y-1">
                                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                    <span className="font-mono">{format(new Date(log.created_at), "yyyy-MM-dd HH:mm:ss")}</span>
                                    {log.duration_months && <span>• {log.duration_months} شهر</span>}
                                    {log.duration_days && <span>• {log.duration_days} يوم</span>}
                                  </div>
                                  {(log.previous_end || log.new_end) && (
                                    <div className="flex items-center gap-2 text-xs">
                                      {log.previous_end && (
                                        <span className="text-muted-foreground">
                                          من: {format(new Date(log.previous_end), "yyyy-MM-dd HH:mm")}
                                        </span>
                                      )}
                                      {log.new_end && (
                                        <span className="text-foreground font-medium">
                                          → إلى: {format(new Date(log.new_end), "yyyy-MM-dd HH:mm")}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {log.notes && (
                                    <p className="text-xs text-muted-foreground">{log.notes}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </ScrollArea>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
