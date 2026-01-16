import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { mockSessions } from "@/lib/mockData";
import { Smartphone, Plus, Trash2, RefreshCw, QrCode, Signal, Battery, AlertCircle } from "lucide-react";
import { useState } from "react";

export default function Sessions() {
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-heading font-bold text-foreground">Session Manager</h1>
            <p className="text-muted-foreground mt-1">Manage your connected WhatsApp instances.</p>
          </div>
          <Dialog open={isQRModalOpen} onOpenChange={setIsQRModalOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20">
                <Plus className="h-4 w-4" />
                Connect New Session
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Scan QR Code</DialogTitle>
                <DialogDescription>
                  Open WhatsApp on your phone and scan the QR code below to connect.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center justify-center p-6 bg-white rounded-lg border">
                <div className="w-64 h-64 bg-gray-100 rounded-lg flex items-center justify-center relative overflow-hidden group">
                  <QrCode className="h-32 w-32 text-gray-400 group-hover:opacity-50 transition-opacity" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="bg-white/80 p-2 rounded-md shadow-sm text-xs font-medium">
                      Click to refresh
                    </div>
                  </div>
                </div>
                <div className="mt-4 text-center space-y-2">
                   <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center">
                     <RefreshCw className="h-3 w-3 animate-spin" />
                     Waiting for scan...
                   </div>
                   <Input placeholder="Enter session name (optional)" className="text-center" />
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {mockSessions.map((session) => (
            <Card key={session.id} className={`
              transition-all duration-200 hover:shadow-md
              ${session.status === 'error' ? 'border-red-200 bg-red-50/10' : ''}
              ${session.status === 'disconnected' ? 'border-orange-200 bg-orange-50/10' : ''}
            `}>
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className={`
                      h-12 w-12 rounded-xl flex items-center justify-center shadow-sm
                      ${session.status === 'connected' ? 'bg-gradient-to-br from-green-400 to-green-600 text-white' : 
                        session.status === 'error' ? 'bg-gradient-to-br from-red-400 to-red-600 text-white' : 
                        'bg-gradient-to-br from-gray-200 to-gray-400 text-gray-600'}
                    `}>
                      <Smartphone className="h-6 w-6" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{session.phoneNumber}</CardTitle>
                      <CardDescription className="font-mono text-xs">{session.id.slice(0,12)}...</CardDescription>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive -mr-2 -mt-2">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="grid grid-cols-2 gap-4 py-4">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground block">Messages Sent</span>
                    <span className="font-semibold text-lg">{session.messagesSent.toLocaleString()}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground block">Uptime</span>
                    <span className="font-semibold text-lg">
                      {session.status === 'connected' ? '4d 12h' : '-'}
                    </span>
                  </div>
                </div>
                
                {session.status === 'error' && (
                   <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-3 rounded text-sm flex items-start gap-2 mb-2">
                      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium">Connection Error</p>
                        <p className="text-xs opacity-80">Device not reachable. Please scan QR again.</p>
                      </div>
                   </div>
                )}
              </CardContent>
              <CardFooter className="pt-3 border-t bg-muted/20 flex justify-between items-center text-xs text-muted-foreground">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1">
                    <Signal className="h-3 w-3" />
                    <span>Strong</span>
                  </div>
                  {session.battery && (
                    <div className="flex items-center gap-1">
                      <Battery className="h-3 w-3" />
                      <span>{session.battery}%</span>
                    </div>
                  )}
                </div>
                <Badge variant={
                  session.status === 'connected' ? 'outline' : 'secondary'
                } className={
                  session.status === 'connected' ? 'text-green-600 border-green-200 bg-green-50' : ''
                }>
                  {session.status}
                </Badge>
              </CardFooter>
            </Card>
          ))}
          
          {/* Add New Session Card */}
          <Card className="border-dashed border-2 flex flex-col items-center justify-center p-6 gap-4 cursor-pointer hover:border-primary hover:bg-primary/5 transition-all group" onClick={() => setIsQRModalOpen(true)}>
            <div className="h-16 w-16 rounded-full bg-secondary group-hover:bg-primary/20 flex items-center justify-center transition-colors">
              <Plus className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <div className="text-center">
              <h3 className="font-semibold text-lg">Add New Session</h3>
              <p className="text-sm text-muted-foreground">Connect another WhatsApp number</p>
            </div>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
