import Layout from "@/components/layout/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Send, MoreVertical, Phone, Paperclip, MessageSquare } from "lucide-react";
import { useState } from "react";

const mockConversations = [
  { id: 1, name: "Juan Pérez", phone: "56949351842", lastMsg: "Gracias, ya realicé el pago.", time: "10:30 AM", unread: 2 },
  { id: 2, name: "Maria Gonzalez", phone: "56991247408", lastMsg: "¿Tienen facilidades de pago?", time: "09:15 AM", unread: 0 },
  { id: 3, name: "Carlos Ruiz", phone: "56927615358", lastMsg: "No me interesa.", time: "Yesterday", unread: 0 },
];

const mockMessages = [
  { id: 1, type: "out", text: "Estimado Juan, recordamos su deuda de $150.000.", time: "10:00 AM" },
  { id: 2, type: "in", text: "Hola, ¿puedo pagar por transferencia?", time: "10:05 AM" },
  { id: 3, type: "out", text: "Sí, claro. Aquí están los datos...", time: "10:10 AM" },
  { id: 4, type: "in", text: "Gracias, ya realicé el pago.", time: "10:30 AM" },
];

export default function Messages() {
  const [selectedId, setSelectedId] = useState<number | null>(1);
  const [inputText, setInputText] = useState("");
  const [messages, setMessages] = useState(mockMessages);

  const handleSend = () => {
    if (!inputText.trim()) return;
    setMessages([...messages, { id: Date.now(), type: "out", text: inputText, time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) }]);
    setInputText("");
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
             <div className="flex flex-col">
               {mockConversations.map((conv) => (
                 <button
                   key={conv.id}
                   onClick={() => setSelectedId(conv.id)}
                   className={`flex items-start gap-3 p-4 text-left transition-colors border-b last:border-0 hover:bg-muted/50 ${selectedId === conv.id ? 'bg-muted' : ''}`}
                 >
                   <Avatar>
                     <AvatarFallback>{conv.name.slice(0,2)}</AvatarFallback>
                   </Avatar>
                   <div className="flex-1 overflow-hidden">
                     <div className="flex justify-between items-baseline">
                       <span className="font-medium truncate">{conv.name}</span>
                       <span className="text-xs text-muted-foreground">{conv.time}</span>
                     </div>
                     <p className="text-sm text-muted-foreground truncate">{conv.lastMsg}</p>
                   </div>
                   {conv.unread > 0 && (
                     <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                       {conv.unread}
                     </span>
                   )}
                 </button>
               ))}
             </div>
          </ScrollArea>
        </Card>

        {/* Chat Area */}
        <Card className="flex-1 flex flex-col overflow-hidden">
          {selectedId ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b flex justify-between items-center bg-card">
                 <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback>JP</AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-semibold">Juan Pérez</h3>
                      <p className="text-xs text-muted-foreground">+56 9 4935 1842</p>
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
                   {messages.map((msg) => (
                     <div 
                       key={msg.id} 
                       className={`flex ${msg.type === 'out' ? 'justify-end' : 'justify-start'}`}
                     >
                       <div className={`
                         max-w-[70%] rounded-2xl px-4 py-2 text-sm shadow-sm
                         ${msg.type === 'out' 
                           ? 'bg-primary text-primary-foreground rounded-tr-none' 
                           : 'bg-card border rounded-tl-none'}
                       `}>
                         <p>{msg.text}</p>
                         <span className={`text-[10px] block text-right mt-1 opacity-70`}>
                           {msg.time}
                         </span>
                       </div>
                     </div>
                   ))}
                 </div>
              </ScrollArea>

              {/* Input Area */}
              <div className="p-4 bg-card border-t flex gap-2 items-center">
                 <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground">
                   <Paperclip className="h-5 w-5" />
                 </Button>
                 <Input 
                   placeholder="Type a message..." 
                   value={inputText}
                   onChange={(e) => setInputText(e.target.value)}
                   onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                   className="flex-1 bg-secondary/50 border-0 focus-visible:ring-1"
                 />
                 <Button onClick={handleSend} size="icon" className="shrink-0 rounded-full">
                   <Send className="h-4 w-4" />
                 </Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <MessageSquare className="h-12 w-12 mb-4 opacity-20" />
              <p>Select a conversation to start messaging</p>
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}
