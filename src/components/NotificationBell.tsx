import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Bell, MessageSquare, X, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

export const NotificationBell: React.FC = () => {
  const { auth } = useAuth();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);

  // For admin: unread (new) tickets
  // For owner: tickets with unread replies
  const { data: notifications } = useQuery({
    queryKey: ["notifications", auth.isAdmin, auth.isOwner],
    queryFn: async () => {
      if (auth.isAdmin) {
        const { data, error } = await supabase
          .from("support_tickets")
          .select("*")
          .eq("status", "new")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data || [];
      }
      if (auth.isOwner) {
        const { data, error } = await supabase
          .from("support_tickets")
          .select("*")
          .eq("status", "replied")
          .eq("is_reply_read", false)
          .order("admin_reply_at", { ascending: false });
        if (error) throw error;
        return data || [];
      }
      return [];
    },
    enabled: !!(auth.isAdmin || auth.isOwner),
    refetchInterval: 30000,
  });

  const markReplyRead = useMutation({
    mutationFn: async (ticketId: string) => {
      const { error } = await supabase
        .from("support_tickets")
        .update({ is_reply_read: true })
        .eq("id", ticketId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  // Subscribe to realtime
  React.useEffect(() => {
    if (!auth.isAdmin && !auth.isOwner) return;
    const channel = supabase
      .channel("support-tickets-notifications")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, () => {
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
        if (auth.isAdmin) {
          queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [auth.isAdmin, auth.isOwner]);

  const count = notifications?.length || 0;
  if (!auth.isAdmin && !auth.isOwner) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl hover:bg-sidebar-accent text-sidebar-foreground transition-colors"
      >
        <Bell size={18} />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center animate-pulse">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 top-full mt-2 w-80 z-50 bg-popover border border-border rounded-xl shadow-xl overflow-hidden" dir="rtl">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <p className="font-bold text-sm text-foreground">الإشعارات</p>
              <button onClick={() => setIsOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X size={14} />
              </button>
            </div>
            <ScrollArea className="max-h-[350px]">
              {count === 0 ? (
                <div className="p-6 text-center">
                  <Bell className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">لا توجد إشعارات جديدة</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {notifications?.map(n => (
                    <div
                      key={n.id}
                      className="p-3 hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => {
                        if (auth.isOwner && !auth.isAdmin) {
                          markReplyRead.mutate(n.id);
                        }
                        setIsOpen(false);
                      }}
                    >
                      <div className="flex items-start gap-2">
                        <MessageSquare className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          {auth.isAdmin ? (
                            <>
                              <p className="text-xs font-bold text-foreground">{n.sender_name}</p>
                              <p className="text-xs text-muted-foreground">{n.company_name}</p>
                              <p className="text-xs text-foreground mt-1 line-clamp-2">{n.subject}</p>
                            </>
                          ) : (
                            <>
                              <p className="text-xs font-bold text-foreground">رد من الإدارة</p>
                              <p className="text-xs text-foreground mt-1 line-clamp-2">{n.admin_reply}</p>
                            </>
                          )}
                          <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                            <Clock size={10} />
                            {new Date(auth.isAdmin ? n.created_at : n.admin_reply_at).toLocaleDateString("ar-EG")}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </>
      )}
    </div>
  );
};
