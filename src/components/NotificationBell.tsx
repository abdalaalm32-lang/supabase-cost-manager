import React, { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Bell, MessageSquare, X, Clock, CheckCheck } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

// Notification chime generated via Web Audio API for crisp, audible alerts

export const NotificationBell: React.FC = () => {
  const { auth } = useAuth();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  // Start at -1 so initial load doesn't fire the sound; first real fetch sets baseline
  const prevCountRef = useRef<number>(-1);

  const playSound = useCallback(() => {
    try {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
      if (!Ctx) return;
      const ctx = new Ctx();
      const playNote = (freq: number, startAt: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + startAt);
        gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + startAt + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startAt + duration);
        osc.start(ctx.currentTime + startAt);
        osc.stop(ctx.currentTime + startAt + duration + 0.05);
      };
      // Pleasant 3-note ascending chime: E5 -> G5 -> C6
      playNote(659.25, 0, 0.18);
      playNote(783.99, 0.16, 0.18);
      playNote(1046.5, 0.32, 0.35);
      // Repeat once after a short gap for emphasis
      playNote(659.25, 0.85, 0.18);
      playNote(783.99, 1.01, 0.18);
      playNote(1046.5, 1.17, 0.35);
      setTimeout(() => { try { ctx.close(); } catch {} }, 1800);
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

  // Play sound + toast when count increases (skip the very first fetch)
  React.useEffect(() => {
    const count = notifications?.length || 0;
    if (prevCountRef.current >= 0 && count > prevCountRef.current) {
      playSound();
      toast.info("🔔 إشعار جديد", {
        description: auth.isAdmin ? "وصلتك رسالة دعم جديدة" : "وصلك رد جديد من الإدارة",
        duration: 5000,
      });
    }
    prevCountRef.current = count;
  }, [notifications?.length, playSound, auth.isAdmin]);

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

  const playSuccessSound = useCallback(() => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const playNote = (freq: number, start: number, dur: number) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.18, audioCtx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + start + dur);
        osc.start(audioCtx.currentTime + start);
        osc.stop(audioCtx.currentTime + start + dur);
      };
      playNote(523, 0, 0.15);
      playNote(659, 0.12, 0.15);
      playNote(784, 0.24, 0.3);
    } catch {}
  }, []);

  // Subscribe to realtime - support tickets
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

  // Subscribe to realtime - subscription renewals (for owner)
  React.useEffect(() => {
    if (!auth.isOwner || auth.isAdmin) return;
    const companyId = auth.profile?.company_id;
    if (!companyId) return;

    const channel = supabase
      .channel("subscription-renewal-notify")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "company_subscription_log",
        filter: `company_id=eq.${companyId}`,
      }, (payload: any) => {
        const rec = payload.new;
        if (rec.action === "تجديد") {
          playSuccessSound();
          const fromDate = rec.previous_end
            ? new Date(rec.previous_end).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
            : "الآن";
          const toDate = rec.new_end
            ? new Date(rec.new_end).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
            : "";

          toast.success(
            <div className="flex items-start gap-3" dir="rtl">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-emerald-500 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" style={{ strokeDasharray: 24, strokeDashoffset: 24, animation: "draw 0.6s ease-out 0.2s forwards" }} />
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-bold text-emerald-600 text-sm mb-1">✅ تم تجديد الاشتراك بنجاح</p>
                <p className="text-xs text-muted-foreground">من: {fromDate}</p>
                <p className="text-xs text-muted-foreground">إلى: {toDate}</p>
              </div>
            </div>,
            {
              duration: 8000,
              style: {
                background: "hsl(var(--background))",
                border: "2px solid hsl(142, 71%, 45%)",
                borderRadius: "16px",
                boxShadow: "0 0 20px rgba(34,197,94,0.2)",
              },
            }
          );
          // Refresh company data to update overlay
          queryClient.invalidateQueries({ queryKey: ["company-info"] });
          queryClient.invalidateQueries({ queryKey: ["company-subscription"] });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [auth.isOwner, auth.isAdmin, auth.profile?.company_id, playSuccessSound, queryClient]);

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
          {/* Panel anchored to LEFT of bell so it stays inside the viewport (bell sits at the right edge) */}
          <div className="absolute left-0 top-full mt-2 w-[340px] max-w-[92vw] z-50 bg-popover border border-border rounded-xl shadow-2xl overflow-hidden" dir="rtl" style={{ backgroundColor: "hsl(var(--popover))" }}>
            <div className="p-3 border-b border-border flex items-center justify-between">
              <p className="font-bold text-sm text-foreground">الإشعارات</p>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
                aria-label="إغلاق الإشعارات"
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X size={16} />
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