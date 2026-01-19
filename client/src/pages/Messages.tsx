import Layout from "@/components/layout/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Send, MoreVertical, Phone, Paperclip, MessageSquare, Loader2 } from "lucide-react";
import { useState } from "react";
import { useMessages, useDebtors, useSessions, useSendMessage } from "@/lib/api";

export default function Messages() {
  const { data: messages, isLoading: messagesLoading } = useMessages();
  const { data: debtors } = useDebtors();
  const { data: sessions } = useSessions();
  const sendMessage = useSendMessage();
  const [selectedDebtorId, setSelectedDebtorId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");

  const connectedSessions = sessions?.filter(s => s.status === 'connected') || [];

  const debtorsWithMessages = debtors?.filter(d => 
    messages?.some(m => m.debtorId === d.id)
  ) || [];

  const selectedDebtor = debtors?.find(d => d.id === selectedDebtorId);
  const selectedMessages = messages?.filter(m => m.debtorId === selectedDebtorId) || [];

  const handleSend = async () => {
    if (!inputText.trim() || !selectedDebtor || !selectedSessionId) {
      if (!selectedSessionId && inputText.trim()) {
        alert('Selecciona una sesión de WhatsApp para enviar');
      }
      return;
    }
    
    try {
      await sendMessage.mutateAsync({
        sessionId: selectedSessionId,
        phone: selectedDebtor.phone,
        message: inputText.trim()
      });
      setInputText("");
    } catch (error: any) {
      alert('Error al enviar: ' + error.message);
    }
  };

  return (
    <Layout>
      <div className="flex h-[calc(100vh-140px)] gap-4">
        {/* Sidebar List */}
        <Card className="w-1/3 flex flex-col overflow-hidden">
          <div className="p-4 border-b space-y-4">
             <h2 className="font-semibold text-lg">Messages</h2>
             <div className="relative">
               <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
               <Input placeholder="Search messages..." className="pl-9 bg-secondary/50" />
             </div>
          </div>
          <ScrollArea className="flex-1">
            {messagesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : debtorsWithMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <MessageSquare className="h-8 w-8 mb-2 opacity-20" />
                <p className="text-sm">No messages yet</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {debtorsWithMessages.map((debtor) => {
                  const lastMsg = messages?.filter(m => m.debtorId === debtor.id).pop();
                  return (
                    <button
                      key={debtor.id}
                      onClick={() => setSelectedDebtorId(debtor.id)}
                      className={`flex items-start gap-3 p-4 text-left transition-colors border-b last:border-0 hover:bg-muted/50 ${selectedDebtorId === debtor.id ? 'bg-muted' : ''}`}
                    >
                      <Avatar>
                        <AvatarFallback>{debtor.name.slice(0,2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 overflow-hidden">
                        <div className="flex justify-between items-baseline">
                          <span className="font-medium truncate">{debtor.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {lastMsg?.sentAt ? new Date(lastMsg.sentAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '-'}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {lastMsg?.content?.slice(0, 50) || 'No messages'}...
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </Card>

        {/* Chat Area */}
        <Card className="flex-1 flex flex-col overflow-hidden">
          {selectedDebtor ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b flex justify-between items-center bg-card">
                 <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback>{selectedDebtor.name.slice(0,2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-semibold">{selectedDebtor.name}</h3>
                      <p className="text-xs text-muted-foreground">{selectedDebtor.phone}</p>
                    </div>
                 </div>
                 <div className="flex gap-2">
                   <Button variant="ghost" size="icon">
                     <Phone className="h-4 w-4" />
                   </Button>
                   <Button variant="ghost" size="icon">
                     <MoreVertical className="h-4 w-4" />
                   </Button>
                 </div>
              </div>

              {/* Chat Messages */}
              <ScrollArea className="flex-1 p-4 bg-muted/20">
                 <div className="space-y-4">
                   {selectedMessages.map((msg) => (
                     <div 
                       key={msg.id} 
                       className="flex justify-end"
                     >
                       <div className="max-w-[70%] rounded-2xl px-4 py-2 text-sm shadow-sm bg-primary text-primary-foreground rounded-tr-none">
                         <p>{msg.content}</p>
                         <span className="text-[10px] block text-right mt-1 opacity-70">
                           {msg.sentAt ? new Date(msg.sentAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Pending'}
                           {msg.status === 'failed' && ' • Failed'}
                         </span>
                       </div>
                     </div>
                   ))}
                   
                   {selectedMessages.length === 0 && (
                     <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                       <MessageSquare className="h-8 w-8 mb-2 opacity-20" />
                       <p className="text-sm">No messages in this conversation</p>
                     </div>
                   )}
                 </div>
              </ScrollArea>

              {/* Input Area */}
              <div className="p-4 bg-card border-t flex gap-2 items-center">
                 <Select value={selectedSessionId || ""} onValueChange={setSelectedSessionId}>
                   <SelectTrigger className="w-40 shrink-0">
                     <SelectValue placeholder="Sesión" />
                   </SelectTrigger>
                   <SelectContent>
                     {connectedSessions.map((session) => (
                       <SelectItem key={session.id} value={session.id}>
                         {session.phoneNumber?.slice(-8) || 'Sin número'}
                       </SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
                 <Input 
                   placeholder="Type a message..." 
                   value={inputText}
                   onChange={(e) => setInputText(e.target.value)}
                   onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                   className="flex-1 bg-secondary/50 border-0 focus-visible:ring-1"
                   disabled={sendMessage.isPending}
                 />
                 <Button 
                   onClick={handleSend} 
                   size="icon" 
                   className="shrink-0 rounded-full"
                   disabled={sendMessage.isPending || !selectedSessionId}
                 >
                   {sendMessage.isPending ? (
                     <Loader2 className="h-4 w-4 animate-spin" />
                   ) : (
                     <Send className="h-4 w-4" />
                   )}
                 </Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <MessageSquare className="h-12 w-12 mb-4 opacity-20" />
              <p>Select a conversation to view messages</p>
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}
