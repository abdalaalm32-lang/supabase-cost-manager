import React, { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Bell, MessageSquare, X, Clock, CheckCheck } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

const NOTIFICATION_SOUND_URL = "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2JkJONh3x0bnZ/i5GRjIF2bGVqc4CMk5GJfnNpZGhxfomRk4+FenBnaHF8h5GUj4V6cGlqc3+JkpOPhntyaWlxfYiRko+GfHJpanJ+iZKSjoZ8c2lqcn6IkZGOhnxzamtzf4qTk46Ge3FoanF9iJKTj4d8c2prcn+JkZKOhXtyaWpzf4mSkY2FfHNranOAipKSjoZ8c2prc3+JkZGNhXxzamtzf4qSkY2FfHNra3OAipKRjYV8c2trc4CKkpGNhXxzamtzgIqSkY2FfHNra3OAipGRjYV8c2trc4CKkZGNhXxzamtzgIqRkY2FfHNra3SAipGRjYV8c2tsc4CKkZGNhXxza2xzgIqRkY2FfHNrbHSAipGRjYZ8c2tsc4CKkZCMhXxza2xzgIqRkIyFfHNrbHOAipGQjIV8c2tsc4CKkJCMhXxza2x0gYqQkIyFfHNrbHSBipCQjIV8c2tsc4CKkJCMhXxza2xzgIqQkIyFfHNrbHOAio+QjIV8c2tsc4CKj4+MhXxza2xzgIqPj4yFfXRsbHOAio+PjIV9dGtsc4CKj4+MhX10bGxzgIqPj4yFfXRsbHOAio+PjIV9dGxsc4CLj4+MhX10bGxzgIuPj4yFfXRsbHOAi4+PjIV9dGxsc4CLj4+MhX10bGxzgIuPjoyFfXRsbHOAi46OjIV9dGxsc4CLjo6MhX10bGxzgIuOjoyFfXRsbHOAi46OjIV9dGxsc4CLjo6MhX10bGxzgIuOjoyFfXRsbHOAi46OjIV9dGxsc4CLjo6MhX50bGxzgIuOjoyF";

export const NotificationBell: React.FC = () => {
  const { auth } = useAuth();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const prevCountRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playSound = useCallback(() => {
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio(NOTIFICATION_SOUND_URL);
        audioRef.current.volume = 0.5;
      }
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    } catch {}
  }, []);

  // For admin: all non-replied tickets (new)
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
        // Show tickets with unread replies (including suspension inquiries)
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

  // Play sound when count increases
  React.useEffect(() => {
    const count = notifications?.length || 0;
    if (count > prevCountRef.current && prevCountRef.current >= 0) {
      playSound();
    }
    prevCountRef.current = count;
  }, [notifications?.length, playSound]);

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
          {/* Panel opens to the RIGHT in RTL layout */}
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
                  {notifications?.map(n => {
                    const isRead = auth.isOwner && !auth.isAdmin && n.is_reply_read;
                    return (
                      <div
                        key={n.id}
                        className={`p-3 cursor-pointer transition-colors ${isRead ? 'opacity-60' : 'hover:bg-muted/30'}`}
                        onClick={() => {
                          if (auth.isOwner && !auth.isAdmin && !n.is_reply_read) {
                            markReplyRead.mutate(n.id);
                          }
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
                                <div className="flex items-center gap-1">
                                  <p className="text-xs font-bold text-foreground">رد من الإدارة</p>
                                  {n.is_reply_read && <CheckCheck size={12} className="text-primary" />}
                                </div>
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
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        </>
      )}
    </div>
  );
};