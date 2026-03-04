import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MessageSquare, Search, Reply, Mail, MailOpen, Clock, Building2
} from "lucide-react";

export const AdminMessagesPage: React.FC = () => {
  const { auth } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [replyText, setReplyText] = useState("");
  const [isReplyOpen, setIsReplyOpen] = useState(false);

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["admin-support-tickets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: auth.isAdmin,
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTicket || !replyText.trim()) throw new Error("الرد مطلوب");
      const { error } = await supabase
        .from("support_tickets")
        .update({
          admin_reply: replyText,
          admin_reply_at: new Date().toISOString(),
          status: "replied",
          is_reply_read: false,
        })
        .eq("id", selectedTicket.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم إرسال الرد بنجاح");
      setIsReplyOpen(false);
      setReplyText("");
      setSelectedTicket(null);
      queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const markAsRead = useMutation({
    mutationFn: async (ticketId: string) => {
      const { error } = await supabase
        .from("support_tickets")
        .update({ status: "read" })
        .eq("id", ticketId)
        .eq("status", "new");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
    },
  });

  const filtered = tickets?.filter(t => {
    const matchFilter = filter === "all" || t.status === filter;
    const matchSearch = !searchQuery ||
      t.company_name?.includes(searchQuery) ||
      t.company_code?.includes(searchQuery) ||
      t.sender_name?.includes(searchQuery);
    return matchFilter && matchSearch;
  }) || [];

  const newCount = tickets?.filter(t => t.status === "new").length || 0;
  const readCount = tickets?.filter(t => t.status === "read").length || 0;
  const repliedCount = tickets?.filter(t => t.status === "replied").length || 0;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "new": return <Badge className="bg-blue-500/20 text-blue-600 border-blue-500/30">جديد</Badge>;
      case "read": return <Badge className="bg-yellow-500/20 text-yellow-600 border-yellow-500/30">مقروء</Badge>;
      case "replied": return <Badge className="bg-green-500/20 text-green-600 border-green-500/30">تم الرد</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const openTicket = (ticket: any) => {
    setSelectedTicket(ticket);
    setReplyText(ticket.admin_reply || "");
    setIsReplyOpen(true);
    if (ticket.status === "new") {
      markAsRead.mutate(ticket.id);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h2 className="text-2xl font-black text-foreground">رسائل العملاء</h2>
        <p className="text-sm text-muted-foreground">إدارة طلبات ورسائل مديري الشركات</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="glass-card">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Mail className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">رسائل جديدة</p>
              <p className="text-2xl font-black text-foreground">{newCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="w-12 h-12 rounded-xl bg-yellow-500/20 flex items-center justify-center">
              <MailOpen className="h-6 w-6 text-yellow-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">مقروءة بدون رد</p>
              <p className="text-2xl font-black text-foreground">{readCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
              <Reply className="h-6 w-6 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">تم الرد</p>
              <p className="text-2xl font-black text-foreground">{repliedCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث بالاسم أو كود الشركة..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pr-9" />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="new">جديد</SelectItem>
            <SelectItem value="read">مقروء</SelectItem>
            <SelectItem value="replied">تم الرد</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Messages List */}
      <div className="space-y-3">
        {isLoading ? (
          <p className="text-center text-muted-foreground py-10">جاري التحميل...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <MessageSquare className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">لا توجد رسائل</p>
          </div>
        ) : (
          filtered.map(ticket => (
            <Card
              key={ticket.id}
              className={`glass-card cursor-pointer hover:border-primary/30 transition-all ${ticket.status === "new" ? "border-blue-500/30 bg-blue-500/5" : ""}`}
              onClick={() => openTicket(ticket)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center flex-shrink-0 mt-1">
                      <Building2 className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-bold text-foreground">{ticket.sender_name}</p>
                        {getStatusBadge(ticket.status)}
                      </div>
                      <p className="text-xs text-muted-foreground mb-1">
                        {ticket.company_name} • {ticket.company_code}
                      </p>
                      <p className="text-sm font-medium text-foreground mb-1">{ticket.subject}</p>
                      <p className="text-sm text-muted-foreground line-clamp-2">{ticket.message}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                    <Clock className="h-3 w-3" />
                    {new Date(ticket.created_at).toLocaleDateString("ar-EG")}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Reply Dialog */}
      <Dialog open={isReplyOpen} onOpenChange={setIsReplyOpen}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>تفاصيل الرسالة</DialogTitle>
          </DialogHeader>
          {selectedTicket && (
            <ScrollArea className="max-h-[65vh]">
              <div className="space-y-4 pr-3">
                {/* Sender info */}
                <div className="p-3 rounded-xl bg-muted/30 border border-border/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-foreground">{selectedTicket.sender_name}</p>
                    {getStatusBadge(selectedTicket.status)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {selectedTicket.company_name} • {selectedTicket.company_code}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(selectedTicket.created_at).toLocaleString("ar-EG")}
                  </p>
                </div>

                {/* Subject & Message */}
                <div className="space-y-2">
                  <p className="text-sm font-bold text-foreground">{selectedTicket.subject}</p>
                  <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
                    <p className="text-sm text-foreground whitespace-pre-wrap">{selectedTicket.message}</p>
                  </div>
                </div>

                {/* Previous reply */}
                {selectedTicket.admin_reply && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">الرد السابق:</p>
                    <div className="p-3 rounded-xl bg-green-500/5 border border-green-500/10">
                      <p className="text-sm text-foreground whitespace-pre-wrap">{selectedTicket.admin_reply}</p>
                    </div>
                  </div>
                )}

                {/* Reply input */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">الرد:</p>
                  <Textarea
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder="اكتب ردك هنا..."
                    rows={4}
                  />
                </div>

                <Button
                  className="w-full gradient-primary text-primary-foreground font-bold gap-2"
                  onClick={() => replyMutation.mutate()}
                  disabled={replyMutation.isPending || !replyText.trim()}
                >
                  <Reply className="h-4 w-4" />
                  {replyMutation.isPending ? "جاري الإرسال..." : "إرسال الرد"}
                </Button>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
