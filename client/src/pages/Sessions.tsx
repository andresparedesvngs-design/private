import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useSessions, useCreateSession, useDeleteSession, useReconnectSession } from "@/lib/api";
import { Smartphone, Plus, Trash2, RefreshCw, QrCode, Signal, Battery, AlertCircle, Loader2, RotateCcw } from "lucide-react";
import { useState } from "react";

export default function Sessions() {
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [reconnectingId, setReconnectingId] = useState<string | null>(null);
  const { data: sessions, isLoading } = useSessions();
  const createSession = useCreateSession();
  const deleteSession = useDeleteSession();
  const reconnectSession = useReconnectSession();

  const handleCreateSession = async () => {
    try {
      await createSession.mutateAsync();
      setIsQRModalOpen(true);
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  };

  const handleDeleteSession = async (id: string) => {
    if (confirm('¿Estás seguro de eliminar esta sesión?')) {
      try {
        await deleteSession.mutateAsync(id);
      } catch (error) {
        console.error('Failed to delete session:', error);
      }
    }
  };

  const handleReconnect = async (id: string) => {
    try {
      setReconnectingId(id);
      await reconnectSession.mutateAsync(id);
    } catch (error) {
      console.error('Failed to reconnect session:', error);
    } finally {
      setReconnectingId(null);
    }
  };

  const pendingSession = sessions?.find(s => s.status === 'qr_ready' || s.status === 'initializing');

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
              <Button 
                className="gap-2 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
                onClick={handleCreateSession}
                disabled={createSession.isPending}
              >
                {createSession.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
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
                <div className="w-64 h-64 bg-gray-100 rounded-lg flex items-center justify-center relative overflow-hidden">
                  {pendingSession?.qrCode ? (
                    <img 
                      src={pendingSession.qrCode} 
                      alt="QR Code" 
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <span className="text-sm text-muted-foreground">Generating QR...</span>
                    </div>
                  )}
                </div>
                <div className="mt-4 text-center space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    {pendingSession?.status === 'qr_ready' ? 'Waiting for scan...' : 'Initializing session...'}
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sessions?.map((session) => (
              <Card key={session.id} className={`
                transition-all duration-200 hover:shadow-md
                ${session.status === 'auth_failed' ? 'border-red-200 bg-red-50/10' : ''}
                ${session.status === 'disconnected' ? 'border-orange-200 bg-orange-50/10' : ''}
              `}>
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className={`
                        h-12 w-12 rounded-xl flex items-center justify-center shadow-sm
                        ${session.status === 'connected' ? 'bg-gradient-to-br from-green-400 to-green-600 text-white' : 
                          session.status === 'auth_failed' ? 'bg-gradient-to-br from-red-400 to-red-600 text-white' : 
                          session.status === 'qr_ready' ? 'bg-gradient-to-br from-blue-400 to-blue-600 text-white' :
                          'bg-gradient-to-br from-gray-200 to-gray-400 text-gray-600'}
                      `}>
                        <Smartphone className="h-6 w-6" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{session.phoneNumber || 'Pending...'}</CardTitle>
                        <CardDescription className="font-mono text-xs">{session.id.slice(0,12)}...</CardDescription>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-muted-foreground hover:text-destructive -mr-2 -mt-2"
                      onClick={() => handleDeleteSession(session.id)}
                      disabled={deleteSession.isPending}
                    >
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
                      <span className="text-xs text-muted-foreground block">Status</span>
                      <span className="font-semibold text-lg capitalize">
                        {session.status === 'qr_ready' ? 'Scan QR' : session.status}
                      </span>
                    </div>
                  </div>
                  
                  {session.status === 'qr_ready' && session.qrCode && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-4">
                      <img 
                        src={session.qrCode} 
                        alt="QR Code" 
                        className="w-24 h-24 rounded"
                      />
                      <div className="text-sm">
                        <p className="font-medium text-blue-700">Scan to connect</p>
                        <p className="text-blue-600 text-xs">Use WhatsApp on your phone</p>
                      </div>
                    </div>
                  )}

                  {session.status === 'auth_failed' && (
                    <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-3 rounded text-sm flex items-start gap-2 mb-2">
                      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium">Authentication Failed</p>
                        <p className="text-xs opacity-80">Please scan QR again.</p>
                      </div>
                    </div>
                  )}

                  {(session.status === 'disconnected' || session.status === 'auth_failed') && (
                    <Button 
                      className="w-full gap-2 mt-2"
                      variant="outline"
                      onClick={() => handleReconnect(session.id)}
                      disabled={reconnectingId === session.id}
                    >
                      {reconnectingId === session.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="h-4 w-4" />
                      )}
                      Reconectar
                    </Button>
                  )}
                </CardContent>
                <CardFooter className="pt-3 border-t bg-muted/20 flex justify-between items-center text-xs text-muted-foreground">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                      <Signal className="h-3 w-3" />
                      <span>{session.status === 'connected' ? 'Strong' : '-'}</span>
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
                    session.status === 'connected' ? 'text-green-600 border-green-200 bg-green-50' : 
                    session.status === 'qr_ready' ? 'text-blue-600 border-blue-200 bg-blue-50' : ''
                  }>
                    {session.status === 'qr_ready' ? 'QR Ready' : session.status}
                  </Badge>
                </CardFooter>
              </Card>
            ))}
            
            {/* Add New Session Card */}
            <Card 
              className="border-dashed border-2 flex flex-col items-center justify-center p-6 gap-4 cursor-pointer hover:border-primary hover:bg-primary/5 transition-all group" 
              onClick={handleCreateSession}
            >
              <div className="h-16 w-16 rounded-full bg-secondary group-hover:bg-primary/20 flex items-center justify-center transition-colors">
                {createSession.isPending ? (
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                ) : (
                  <Plus className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
                )}
              </div>
              <div className="text-center">
                <h3 className="font-semibold text-lg">Add New Session</h3>
                <p className="text-sm text-muted-foreground">Connect another WhatsApp number</p>
              </div>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
}
