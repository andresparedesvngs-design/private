import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useSessions, useCreateSession, useDeleteSession, useReconnectSession, useResetSessionAuth, useEnableSessionQr } from "@/lib/api";
import { Smartphone, Plus, Trash2, RefreshCw, QrCode, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@shared/schema";

export default function Sessions() {
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [hasSeenPendingSession, setHasSeenPendingSession] = useState(false);
  const [reconnectingId, setReconnectingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [qrModalMode, setQrModalMode] = useState<"create" | "reconnect">("create");
  const { data: sessions, isLoading } = useSessions();
  const createSession = useCreateSession();
  const deleteSession = useDeleteSession();
  const reconnectSession = useReconnectSession();
  const resetSessionAuth = useResetSessionAuth();
  const enableSessionQr = useEnableSessionQr();

  const handleCreateSession = async () => {
    try {
      const created = await createSession.mutateAsync();
      void enableSessionQr.mutateAsync({ id: created.id });
      setQrModalMode("create");
      setPendingSessionId(created.id);
      setHasSeenPendingSession(false);
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

  const handleResetAuth = async (session: Session) => {
    try {
      setResettingId(session.id);
      setQrModalMode("reconnect");
      setPendingSessionId(session.id);
      setHasSeenPendingSession(false);
      setIsQRModalOpen(true);
      void enableSessionQr.mutateAsync({ id: session.id });
      await resetSessionAuth.mutateAsync(session.id);
    } catch (error) {
      console.error("Failed to reset auth:", error);
    } finally {
      setResettingId(null);
    }
  };

  const handleOpenQr = (session: Session) => {
    setQrModalMode("reconnect");
    setPendingSessionId(session.id);
    setHasSeenPendingSession(false);
    setIsQRModalOpen(true);
    void enableSessionQr.mutateAsync({ id: session.id });

    if (["disconnected", "auth_failed", "duplicate"].includes(session.status)) {
      void handleReconnect(session.id);
    }
  };

  const pendingStatuses = useMemo(
    () => new Set(["initializing", "qr_ready", "authenticated", "reconnecting"]),
    []
  );

  const pendingSession = useMemo(() => {
    if (!sessions?.length) return undefined;
    if (pendingSessionId) {
      const byId = sessions.find((s) => s.id === pendingSessionId);
      if (byId) return byId;
    }
    return sessions.find((s) => pendingStatuses.has(s.status));
  }, [sessions, pendingSessionId, pendingStatuses]);

  useEffect(() => {
    if (!pendingSessionId || !sessions?.length) {
      return;
    }
    const current = sessions.find((s) => s.id === pendingSessionId);
    if (current) {
      if (!hasSeenPendingSession) {
        setHasSeenPendingSession(true);
      }
      const shouldClose =
        qrModalMode === "create"
          ? ["connected", "auth_failed", "disconnected", "duplicate"].includes(current.status)
          : current.status === "connected";
      if (shouldClose) {
        setPendingSessionId(null);
        setHasSeenPendingSession(false);
        setIsQRModalOpen(false);
        setQrModalMode("create");
      }
      return;
    }
    if (hasSeenPendingSession) {
      setPendingSessionId(null);
      setHasSeenPendingSession(false);
      setIsQRModalOpen(false);
      setQrModalMode("create");
    }
  }, [hasSeenPendingSession, pendingSessionId, qrModalMode, sessions]);
  const sessionStatusLabels: Record<string, string> = {
    connected: "Conectada",
    disconnected: "Desconectada",
    auth_failed: "Autenticación fallida",
    qr_ready: "QR listo",
    initializing: "Inicializando",
    authenticated: "Autenticada",
    reconnecting: "Reconectando",
    duplicate: "Numero duplicado",
  };
  const displayStatus = (status: string) => sessionStatusLabels[status] ?? status;

  const modalStatusText = (() => {
    if (!pendingSession) return "Esperando estado de la sesion...";
    if (pendingSession.status === "qr_ready") return "Esperando escaneo...";
    if (pendingSession.status === "authenticated") return "Autenticada, sincronizando...";
    if (pendingSession.status === "connected") return "Conectada. Cerrando...";
    if (pendingSession.status === "reconnecting") return "Reconectando...";
    if (pendingSession.status === "auth_failed") return "Autenticación fallida. Intenta nuevamente.";
    if (pendingSession.status === "disconnected") return "Sesión desconectada. Generando QR...";
    if (pendingSession.status === "duplicate") return "Sesión duplicada. Generando QR...";
    return "Inicializando sesion...";
  })();

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-heading font-bold text-foreground">Gestor de sesiones</h1>
            <p className="text-muted-foreground mt-1">Administra tus instancias conectadas de WhatsApp.</p>
          </div>
          <Dialog
            open={isQRModalOpen}
            onOpenChange={(open) => {
              setIsQRModalOpen(open);
              if (!open) {
                setPendingSessionId(null);
                setHasSeenPendingSession(false);
                setQrModalMode("create");
              }
            }}
          >
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
                Conectar nueva sesión
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {qrModalMode === "reconnect" ? "Reconectar sesión" : "Escanear código QR"}
                </DialogTitle>
                <DialogDescription>
                  Abre WhatsApp en tu teléfono y escanea el código QR para conectar.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center justify-center p-6 bg-white rounded-lg border">
                <div className="w-64 h-64 bg-gray-100 rounded-lg flex items-center justify-center relative overflow-hidden">
                  {pendingSession?.status === "qr_ready" && pendingSession.qrCode ? (
                    <img 
                      src={pendingSession.qrCode} 
                      alt="QR Code" 
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <span className="text-sm text-muted-foreground">Conectando...</span>
                    </div>
                  )}
                </div>
                <div className="mt-4 text-center space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    {modalStatusText}
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
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Sesiones disponibles</CardTitle>
              <CardDescription>Listado compacto para administrar conexiones y QR.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {!sessions?.length ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Smartphone className="h-8 w-8 mb-2 opacity-30" />
                  <p className="text-sm">No hay sesiones registradas</p>
                </div>
              ) : (
                <div className="divide-y">
                  <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs text-muted-foreground">
                    <div className="col-span-4">Sesión</div>
                    <div className="col-span-2">Estado</div>
                    <div className="col-span-2">Enviados</div>
                    <div className="col-span-2">Última actividad</div>
                    <div className="col-span-2 text-right">Acciones</div>
                  </div>
                  {sessions.map((session) => {
                    const canShowQr =
                      session.status === "qr_ready" ||
                      ["disconnected", "auth_failed", "duplicate"].includes(session.status);
                    const lastActive = session.lastActive
                      ? new Date(session.lastActive).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "-";
                    return (
                      <div
                        key={session.id}
                        className="grid grid-cols-12 items-center gap-4 px-4 py-3 text-sm"
                      >
                        <div className="col-span-4 flex items-center gap-3 min-w-0">
                          <div
                            className={[
                              "h-9 w-9 rounded-lg flex items-center justify-center shadow-sm",
                              session.status === "connected"
                                ? "bg-gradient-to-br from-green-400 to-green-600 text-white"
                                : session.status === "auth_failed"
                                  ? "bg-gradient-to-br from-red-400 to-red-600 text-white"
                                  : session.status === "qr_ready"
                                    ? "bg-gradient-to-br from-blue-400 to-blue-600 text-white"
                                    : "bg-gradient-to-br from-gray-200 to-gray-400 text-gray-600",
                            ].join(" ")}
                          >
                            <Smartphone className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium truncate">
                              {session.phoneNumber || "Pendiente..."}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono">
                              {session.id.slice(0, 12)}...
                            </div>
                          </div>
                        </div>
                        <div className="col-span-2">
                          <Badge
                            variant={session.status === "connected" ? "outline" : "secondary"}
                            className={
                              session.status === "connected"
                                ? "text-green-600 border-green-200 bg-green-50"
                                : session.status === "qr_ready"
                                  ? "text-blue-600 border-blue-200 bg-blue-50"
                                  : ""
                            }
                          >
                            {displayStatus(session.status)}
                          </Badge>
                        </div>
                        <div className="col-span-2 font-semibold">
                          {session.messagesSent.toLocaleString()}
                        </div>
                        <div className="col-span-2 text-xs text-muted-foreground">{lastActive}</div>
                        <div className="col-span-2 flex items-center justify-end gap-2">
                          {canShowQr && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              onClick={() => handleOpenQr(session)}
                              disabled={reconnectingId === session.id}
                            >
                              {reconnectingId === session.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <QrCode className="h-4 w-4" />
                              )}
                              QR
                            </Button>
                          )}
                          {["disconnected", "auth_failed", "duplicate", "initializing", "authenticated", "qr_ready"].includes(session.status) && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              onClick={() => handleResetAuth(session)}
                              disabled={resettingId === session.id}
                            >
                              {resettingId === session.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : null}
                              Reinciar auth
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeleteSession(session.id)}
                            disabled={deleteSession.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}

