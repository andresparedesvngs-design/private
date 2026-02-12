import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAuthMe,
  useSessions,
  useSessionsHealth,
  useCreateSession,
  useDeleteSession,
  useReconnectSession,
  useResetSessionAuth,
  useEnableSessionQr,
  useVerifySessionsNow,
  useProxyServers,
  useUpdateSession,
  useStopSession,
  type SessionHealthSnapshot,
} from "@/lib/api";
import { Smartphone, Plus, Trash2, RefreshCw, QrCode, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";

const NO_PROXY_VALUE = "__NO_PROXY__";
const QR_WAIT_TIMEOUT_MS = 45000;
const QR_POLL_INTERVAL_MS = 1500;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const isBusyError = (error: unknown) => {
  const apiError = error as any;
  return apiError?.response?.data?.error === "busy";
};

export default function Sessions() {
  const { data: user } = useAuthMe();
  const canManageSessions = user?.role === "admin" || user?.role === "supervisor";
  const canDeleteSessions = user?.role === "admin";
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [hasSeenPendingSession, setHasSeenPendingSession] = useState(false);
  const [reconnectingId, setReconnectingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [waitingQrId, setWaitingQrId] = useState<string | null>(null);
  const [qrModalMode, setQrModalMode] = useState<"create" | "reconnect">("create");
  const [healthSnapshot, setHealthSnapshot] = useState<SessionHealthSnapshot[] | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [selectedProxyId, setSelectedProxyId] = useState<string>(NO_PROXY_VALUE);
  const [detailsSessionId, setDetailsSessionId] = useState<string | null>(null);
  const [detailsTargetProxyId, setDetailsTargetProxyId] = useState<string>(NO_PROXY_VALUE);
  const [detailsProxyLocked, setDetailsProxyLocked] = useState(true);
  const { data: sessions, isLoading } = useSessions(canManageSessions);
  const { data: proxies } = useProxyServers(canManageSessions);
  const sessionsHealth = useSessionsHealth(false);
  const createSession = useCreateSession();
  const deleteSession = useDeleteSession();
  const reconnectSession = useReconnectSession();
  const resetSessionAuth = useResetSessionAuth();
  const enableSessionQr = useEnableSessionQr();
  const verifySessionsNow = useVerifySessionsNow();
  const updateSession = useUpdateSession();
  const stopSession = useStopSession();
  const proxyList = useMemo(() => proxies ?? [], [proxies]);
  const proxyById = useMemo(
    () => new Map(proxyList.map((proxy) => [proxy.id, proxy])),
    [proxyList]
  );

  const openQrModalForSession = (sessionId: string, mode: "create" | "reconnect") => {
    setQrModalMode(mode);
    setPendingSessionId(sessionId);
    setHasSeenPendingSession(false);
    setIsQRModalOpen(true);
  };

  const fetchSessionSnapshot = async (sessionId: string): Promise<Session | null> => {
    const response = await fetch(`/api/sessions/${sessionId}`, {
      credentials: "include",
    });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const message = payload?.message || payload?.error || "No se pudo consultar sesión";
      const error = new Error(message);
      (error as any).response = { data: payload };
      throw error;
    }
    return (await response.json()) as Session;
  };

  const waitForQrReady = async (sessionId: string, timeoutMs = QR_WAIT_TIMEOUT_MS) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const snapshot = await fetchSessionSnapshot(sessionId);
      if (!snapshot) {
        throw new Error("Session not found");
      }
      if (snapshot.status === "qr_ready" && snapshot.qrCode) {
        return true;
      }
      if (snapshot.status === "connected") {
        return true;
      }
      if (snapshot.status === "auth_failed") {
        throw new Error("La sesión quedó en auth_failed durante la espera de QR");
      }
      await sleep(QR_POLL_INTERVAL_MS);
    }
    return false;
  };

  const handleCreateSession = async () => {
    const wantsProxy = selectedProxyId !== NO_PROXY_VALUE && Boolean(selectedProxyId);
    const selectedProxy = wantsProxy ? proxyById.get(selectedProxyId) : undefined;
    if (wantsProxy) {
      if (!selectedProxy) {
        toast({
          title: "Selecciona un proxy válido",
          description: "El proxy seleccionado no existe.",
          variant: "destructive",
        });
        return;
      }
      if (!selectedProxy.enabled) {
        toast({
          title: "Proxy deshabilitado",
          description: "El proxy seleccionado está deshabilitado.",
          variant: "destructive",
        });
        return;
      }
      if (selectedProxy.status === "offline") {
        toast({
          title: "Proxy offline",
          description: "Selecciona un proxy online o degraded.",
          variant: "destructive",
        });
        return;
      }
    }
    try {
      const created = await createSession.mutateAsync({
        proxyServerId: wantsProxy ? selectedProxyId : null,
        proxyLocked: wantsProxy,
      });
      void enableSessionQr.mutateAsync({ id: created.id });
      setQrModalMode("create");
      setPendingSessionId(created.id);
      setHasSeenPendingSession(false);
      setIsQRModalOpen(true);
      setIsCreateOpen(false);
    } catch (error) {
      toast({
        title: "No se pudo crear la sesión",
        description: getErrorMessage(error, "Error creando sesión."),
        variant: "destructive",
      });
    }
  };

  const handleDeleteSession = async (id: string) => {
    if (confirm('¿Estás seguro de eliminar esta sesión?')) {
      try {
        await deleteSession.mutateAsync(id);
        if (detailsSessionId === id) {
          setDetailsSessionId(null);
        }
        toast({
          title: "Sesión eliminada",
        });
      } catch (error) {
        console.error("Failed to delete session:", error);
        toast({
          title: "No se pudo eliminar",
          description: getErrorMessage(error, "Error al eliminar sesión."),
          variant: "destructive",
        });
      }
    }
  };

  const handleReconnect = async (session: Session, options?: { openQr?: boolean }) => {
    const { openQr = false } = options ?? {};
    try {
      setReconnectingId(session.id);
      if (openQr) {
        openQrModalForSession(session.id, "reconnect");
      }

      await reconnectSession.mutateAsync(session.id);

      if (openQr) {
        await enableSessionQr.mutateAsync({ id: session.id });
        setWaitingQrId(session.id);
        const qrReady = await waitForQrReady(session.id);
        if (!qrReady) {
          toast({
            title: "QR no disponible",
            description: "No apareció QR dentro del tiempo esperado.",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error("Failed to reconnect session:", error);
      const description = isBusyError(error)
        ? "La sesión está en progreso. Espera y vuelve a intentar."
        : getErrorMessage(error, "Error al reconectar sesión.");
      toast({
        title: "No se pudo reconectar",
        description,
        variant: "destructive",
      });
    } finally {
      setReconnectingId(null);
      setWaitingQrId(null);
    }
  };

  const handleVerifySessions = async () => {
    try {
      setIsVerifying(true);
      const result = await verifySessionsNow.mutateAsync();
      try {
        const healthResult = await sessionsHealth.refetch();
        setHealthSnapshot(healthResult.data ?? null);
      } catch {
        setHealthSnapshot(null);
      }
      toast({
        title: "Validación completada",
        description: `Verificadas ${result.verified}/${result.checked} (fallidas ${result.failed})`,
      });
    } catch (error: any) {
      toast({
        title: "No se pudo validar",
        description: getErrorMessage(error, "Error al validar sesiones."),
        variant: "destructive",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResetAuth = async (session: Session) => {
    try {
      setResettingId(session.id);
      openQrModalForSession(session.id, "reconnect");
      await resetSessionAuth.mutateAsync(session.id);
      await enableSessionQr.mutateAsync({ id: session.id });
      setWaitingQrId(session.id);
      const qrReady = await waitForQrReady(session.id);
      if (!qrReady) {
        toast({
          title: "QR no disponible",
          description: "No apareció QR dentro del tiempo esperado.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Failed to reset auth:", error);
      const description = isBusyError(error)
        ? "La sesión está ocupada con otra operación."
        : getErrorMessage(error, "Error al reiniciar auth.");
      toast({
        title: "No se pudo reiniciar auth",
        description,
        variant: "destructive",
      });
    } finally {
      setResettingId(null);
      setWaitingQrId(null);
    }
  };

  const handleStopSession = async (session: Session) => {
    try {
      setStoppingId(session.id);
      await stopSession.mutateAsync(session.id);
    } catch (error: any) {
      toast({
        title: "No se pudo detener",
        description: getErrorMessage(error, "Error al detener sesión."),
        variant: "destructive",
      });
    } finally {
      setStoppingId(null);
    }
  };

  const handleToggleProxyLock = async (session: Session, locked: boolean) => {
    const previous = detailsProxyLocked;
    setDetailsProxyLocked(locked);
    try {
      await updateSession.mutateAsync({
        id: session.id,
        data: { proxyLocked: locked },
      });
    } catch (error: any) {
      setDetailsProxyLocked(previous);
      toast({
        title: "No se pudo actualizar",
        description: getErrorMessage(error, "Error actualizando bloqueo."),
        variant: "destructive",
      });
    }
  };

  const handleChangeProxy = async (session: Session) => {
    const targetIsNoProxy =
      !detailsTargetProxyId || detailsTargetProxyId === NO_PROXY_VALUE;
    try {
      await updateSession.mutateAsync({
        id: session.id,
        data: {
          proxyServerId: targetIsNoProxy ? null : detailsTargetProxyId,
          proxyLocked: proxyLocked ? undefined : false,
        },
      });
      setDetailsSessionId(session.id);
    } catch (error: any) {
      toast({
        title: "No se pudo cambiar",
        description: getErrorMessage(error, "Error al cambiar proxy."),
        variant: "destructive",
      });
    }
  };

  const handleOpenQr = (session: Session) => {
    if (session.status === "auth_failed") {
      if (!canDeleteSessions) {
        toast({
          title: "Se requiere admin",
          description: "La sesión está en auth_failed; solo admin puede ejecutar reset-auth.",
          variant: "destructive",
        });
        return;
      }
      void handleResetAuth(session);
      return;
    }

    if (session.status === "disconnected") {
      void handleReconnect(session, { openQr: true });
      return;
    }

    openQrModalForSession(session.id, "reconnect");
    void enableSessionQr
      .mutateAsync({ id: session.id })
      .catch((error) => {
        toast({
          title: "No se pudo abrir QR",
          description: isBusyError(error)
            ? "La sesión está ocupada con otra operación."
            : getErrorMessage(error, "Error abriendo QR."),
          variant: "destructive",
        });
      });
  };

  const pendingStatuses = useMemo(
    () => new Set(["initializing", "qr_ready", "authenticated", "reconnecting"]),
    []
  );

  const sessionList = useMemo(() => {
    if (!sessions) return sessions;
    if (!healthSnapshot?.length) return sessions;
    const byId = new Map(healthSnapshot.map((entry) => [entry.sessionId, entry]));
    return sessions.map((session) => {
      const runtime = byId.get(session.id);
      if (!runtime) return session;
      return {
        ...session,
        status: runtime.status ?? session.status,
        phoneNumber: runtime.phoneNumber ?? session.phoneNumber,
        messagesSent: runtime.messagesSent ?? session.messagesSent,
      };
    });
  }, [sessions, healthSnapshot]);

  const detailsSession = useMemo(() => {
    if (!detailsSessionId || !sessionList?.length) return undefined;
    return sessionList.find((session) => session.id === detailsSessionId);
  }, [detailsSessionId, sessionList]);

  useEffect(() => {
    if (!detailsSession) return;
    setDetailsTargetProxyId(detailsSession.proxyServerId ?? NO_PROXY_VALUE);
    setDetailsProxyLocked(detailsSession.proxyLocked ?? true);
  }, [detailsSession?.proxyServerId, detailsSession]);

  const pendingSession = useMemo(() => {
    if (!sessionList?.length) return undefined;
    if (pendingSessionId) {
      const byId = sessionList.find((s) => s.id === pendingSessionId);
      if (byId) return byId;
    }
    return sessionList.find((s) => pendingStatuses.has(s.status));
  }, [sessionList, pendingSessionId, pendingStatuses]);

  useEffect(() => {
    if (!pendingSessionId || !sessionList?.length) {
      return;
    }
    const current = sessionList.find((s) => s.id === pendingSessionId);
    if (current) {
      if (!hasSeenPendingSession) {
        setHasSeenPendingSession(true);
      }
      const shouldClose =
        qrModalMode === "create"
          ? ["connected", "auth_failed", "disconnected"].includes(current.status)
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
  }, [hasSeenPendingSession, pendingSessionId, qrModalMode, sessionList]);

  if (!canManageSessions) {
    return (
      <Layout>
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No autorizado.
          </CardContent>
        </Card>
      </Layout>
    );
  }
  const sessionStatusLabels: Record<string, string> = {
    connected: "Conectada",
    disconnected: "Desconectada",
    auth_failed: "Autenticación fallida",
    qr_ready: "QR listo",
    initializing: "Inicializando",
    authenticated: "Autenticada",
    reconnecting: "Reconectando",
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
    return "Inicializando sesion...";
  })();

  const selectedProxy = selectedProxyId && selectedProxyId !== NO_PROXY_VALUE
    ? proxyById.get(selectedProxyId)
    : undefined;
  const wantsProxyForCreate = selectedProxyId !== NO_PROXY_VALUE && Boolean(selectedProxyId);
  const canCreateSession =
    !wantsProxyForCreate ||
    (Boolean(selectedProxy) && Boolean(selectedProxy?.enabled) && selectedProxy?.status !== "offline");
  const detailsProxy = detailsSession?.proxyServerId
    ? proxyById.get(detailsSession.proxyServerId)
    : undefined;
  const detailsProxyStatus = detailsProxy?.status ?? "offline";
  const detailsProxyIp = detailsProxy?.lastPublicIp ?? null;
  const detailsProxyLatency = detailsProxy?.latencyMs ?? null;
  const detailsProxyEndpoint = detailsProxy
    ? `${detailsProxy.scheme}://${detailsProxy.host}:${detailsProxy.port}`
    : null;
  const sessionStopped =
    detailsSession?.status === "disconnected" ||
    detailsSession?.status === "auth_failed";
  const currentProxyBad = ["degraded", "offline"].includes(detailsProxyStatus);
  const proxyLocked = detailsSession ? detailsProxyLocked : true;
  const canAttemptProxyChange =
    Boolean(detailsSession) && Boolean(canDeleteSessions) && sessionStopped;
  const targetProxy = detailsTargetProxyId
    ? proxyById.get(detailsTargetProxyId)
    : undefined;
  const targetIsNoProxySelection =
    !detailsTargetProxyId || detailsTargetProxyId === NO_PROXY_VALUE;
  const requiresCurrentProxyBad = !targetIsNoProxySelection;
  const targetProxyInvalid =
    !targetIsNoProxySelection &&
    (!targetProxy || !targetProxy.enabled || targetProxy.status === "offline");
  const detailsSessionBusy = detailsSession
    ? reconnectingId === detailsSession.id ||
      resettingId === detailsSession.id ||
      stoppingId === detailsSession.id ||
      waitingQrId === detailsSession.id
    : false;
  const formatDateTime = (value?: Date | string | null) =>
    value ? new Date(value).toLocaleString() : "-";

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-heading font-bold text-foreground">Gestor de sesiones</h1>
            <p className="text-muted-foreground mt-1">Administra tus instancias conectadas de WhatsApp.</p>
          </div>
          {canManageSessions && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="gap-2"
                onClick={handleVerifySessions}
                disabled={isVerifying || verifySessionsNow.isPending || sessionsHealth.isFetching}
              >
                {isVerifying || verifySessionsNow.isPending || sessionsHealth.isFetching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Validar sesiones
              </Button>
              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <Button
                    className="gap-2 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
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
                <DialogContent className="w-full max-w-[min(92vw,720px)] overflow-x-hidden box-border">
                  <DialogHeader>
                    <DialogTitle>Nueva sesión</DialogTitle>
                    <DialogDescription>
                      Puedes crear la sesión con proxy o sin proxy (directo).
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Proxy Server</Label>
                      <Select
                        value={selectedProxyId}
                        onValueChange={setSelectedProxyId}
                      >
                        <SelectTrigger className="w-full min-w-0">
                          <SelectValue placeholder="Selecciona un proxy" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_PROXY_VALUE}>
                            Sin proxy (directo)
                          </SelectItem>
                          {proxyList.map((proxy) => (
                            <SelectItem
                              key={proxy.id}
                              value={proxy.id}
                              disabled={!proxy.enabled || proxy.status === "offline"}
                            >
                              <span className="block break-words whitespace-normal [overflow-wrap:anywhere]">
                                {proxy.name} — {proxy.scheme}://{proxy.host}:{proxy.port} — {proxy.status}
                                {proxy.lastPublicIp ? ` — ${proxy.lastPublicIp}` : ""}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!proxyList.length && (
                        <p className="text-xs text-muted-foreground">
                          No hay proxies disponibles. Puedes crear la sesión sin proxy.
                        </p>
                      )}
                    </div>
                    {selectedProxy && (
                      <div className="rounded-md border p-3 text-xs text-muted-foreground space-y-1 break-words whitespace-normal [overflow-wrap:anywhere]">
                        <div>
                          Endpoint: {selectedProxy.scheme}://{selectedProxy.host}:{selectedProxy.port}
                        </div>
                        <div>
                          Estado: {selectedProxy.status} {selectedProxy.lastPublicIp ? `· ${selectedProxy.lastPublicIp}` : ""}
                        </div>
                        {selectedProxy.status === "degraded" && (
                          <div className="text-amber-600">
                            Proxy degradado: posible latencia alta.
                          </div>
                        )}
                        {selectedProxy.status === "offline" && (
                          <div className="text-red-600">
                            Proxy offline: selecciona otro.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2">
                      <Switch checked={Boolean(selectedProxy)} disabled />
                      <Label className="text-sm text-muted-foreground">
                        {selectedProxy ? "Proxy bloqueado" : "Sin proxy"}
                      </Label>
                    </div>
                    <Button
                      onClick={handleCreateSession}
                      disabled={createSession.isPending || !canCreateSession}
                    >
                      {createSession.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      Crear y generar QR
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}
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
        <DialogContent className="w-full max-w-[min(92vw,720px)] overflow-x-hidden box-border">
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
              {!sessionList?.length ? (
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
                  {(sessionList ?? []).map((session) => {
                    const canShowQr =
                      session.status === "qr_ready" ||
                      ["disconnected", "auth_failed"].includes(session.status);
                    const isSessionRunningTask =
                      reconnectingId === session.id ||
                      resettingId === session.id ||
                      stoppingId === session.id ||
                      waitingQrId === session.id;
                    const isProgressStatus =
                      session.status === "initializing" ||
                      session.status === "reconnecting";
                    const canResetAuth =
                      canDeleteSessions &&
                      ["disconnected", "auth_failed", "authenticated", "qr_ready"].includes(
                        session.status
                      );
                    const lastActive = session.lastActive
                      ? new Date(session.lastActive).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "-";
                    const proxy = session.proxyServerId
                      ? proxyById.get(session.proxyServerId)
                      : undefined;
                    const proxyStatus = proxy?.status ?? "offline";
                    const proxyLabel = proxy ? proxy.name : "Sin proxy";
                    const proxyIp = proxy?.lastPublicIp ?? null;
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
                            <div className="text-xs text-muted-foreground">
                              Proxy: {proxyLabel} · {proxyStatus}
                              {proxyIp ? ` · ${proxyIp}` : ""}
                            </div>
                            {session.purpose === "notify" && (
                              <Badge variant="outline" className="mt-1 text-xs">
                                Notificaciones
                              </Badge>
                            )}
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
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDetailsSessionId(session.id)}
                            disabled={isSessionRunningTask}
                          >
                            Detalle
                          </Button>
                          {canShowQr && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              onClick={() => handleOpenQr(session)}
                              disabled={isSessionRunningTask || isProgressStatus}
                            >
                              {isSessionRunningTask ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <QrCode className="h-4 w-4" />
                              )}
                              QR
                            </Button>
                          )}
                          {canResetAuth && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-2"
                                onClick={() => handleResetAuth(session)}
                                disabled={isSessionRunningTask || isProgressStatus}
                              >
                                {isSessionRunningTask ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : null}
                                Reiniciar auth
                              </Button>
                            )}
                          {canDeleteSessions && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => handleDeleteSession(session.id)}
                              disabled={
                                deleteSession.isPending ||
                                isSessionRunningTask ||
                                isProgressStatus
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
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

      <Dialog
        open={Boolean(detailsSessionId)}
        onOpenChange={(open) => {
          if (!open) {
            setDetailsSessionId(null);
            setDetailsTargetProxyId(NO_PROXY_VALUE);
            setDetailsProxyLocked(true);
          }
        }}
      >
        <DialogContent className="w-full max-w-[min(92vw,720px)] overflow-x-hidden box-border">
          <DialogHeader>
            <DialogTitle>Detalle de sesión</DialogTitle>
            <DialogDescription>
              Información del proxy asignado y reglas de cambio.
            </DialogDescription>
          </DialogHeader>
          {!detailsSession ? (
            <div className="text-sm text-muted-foreground">
              Selecciona una sesión para ver detalles.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border p-3 space-y-1 break-words whitespace-normal [overflow-wrap:anywhere]">
                <div className="text-sm font-medium">Sesión</div>
                <div className="text-xs text-muted-foreground">
                  {detailsSession.phoneNumber || "Pendiente"} · {detailsSession.status}
                </div>
                <div className="text-xs font-mono break-words whitespace-normal [overflow-wrap:anywhere]">
                  {detailsSession.id}
                </div>
                {detailsSession.purpose === "notify" && (
                  <Badge variant="outline" className="mt-2 text-xs">
                    Notificaciones
                  </Badge>
                )}
              </div>

              <div className="rounded-md border p-3 space-y-2">
                <div className="text-sm font-medium">Métricas</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>Mensajes enviados: {detailsSession.messagesSent ?? 0}</div>
                  <div>Disconnects: {detailsSession.disconnectCount ?? 0}</div>
                  <div>Auth failures: {detailsSession.authFailureCount ?? 0}</div>
                  <div>Reset auth: {detailsSession.resetAuthCount ?? 0}</div>
                  <div>Reconnects: {detailsSession.reconnectCount ?? 0}</div>
                  <div>Último disconnect: {formatDateTime(detailsSession.lastDisconnectAt)}</div>
                </div>
              </div>

              <div className="rounded-md border p-3 space-y-1 break-words whitespace-normal [overflow-wrap:anywhere]">
                <div className="text-sm font-medium">Proxy asignado</div>
                <div className="text-xs text-muted-foreground">
                  {detailsProxy ? detailsProxy.name : "Sin proxy"}
                </div>
                <div className="text-xs font-mono break-words whitespace-normal [overflow-wrap:anywhere]">
                  {detailsProxyEndpoint ?? "-"}
                </div>
                <div className="text-xs">
                  Estado: {detailsProxyStatus}
                  {detailsProxyIp ? ` · ${detailsProxyIp}` : ""}
                  {detailsProxyLatency ? ` · ${detailsProxyLatency}ms` : ""}
                </div>
                {detailsProxyStatus === "degraded" && (
                  <div className="text-xs text-amber-600">Proxy degradado</div>
                )}
                {detailsProxyStatus === "offline" && (
                  <div className="text-xs text-red-600">Proxy offline</div>
                )}
              </div>

              {canDeleteSessions && (
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <div className="text-sm font-medium">Bloqueo de proxy</div>
                    <div className="text-xs text-muted-foreground">
                      Evita cambios accidentales.
                    </div>
                  </div>
                  <Switch
                    checked={proxyLocked}
                    onCheckedChange={(checked) =>
                      handleToggleProxyLock(detailsSession, checked)
                    }
                    disabled={detailsSessionBusy}
                  />
                </div>
              )}

              <div className="rounded-md border p-3 space-y-3">
                <div className="text-sm font-medium">Cambiar proxy</div>
                <div className="space-y-2">
                  <Label>Proxy destino</Label>
                  <Select
                    value={detailsTargetProxyId}
                    onValueChange={setDetailsTargetProxyId}
                    disabled={detailsSessionBusy}
                  >
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue placeholder="Selecciona proxy" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_PROXY_VALUE}>Sin proxy (directo)</SelectItem>
                      {proxyList.map((proxy) => (
                        <SelectItem
                          key={proxy.id}
                          value={proxy.id}
                          disabled={!proxy.enabled || proxy.status === "offline"}
                        >
                          <span className="block break-words whitespace-normal [overflow-wrap:anywhere]">
                            {proxy.name} — {proxy.scheme}://{proxy.host}:{proxy.port} — {proxy.status}
                            {proxy.lastPublicIp ? ` — ${proxy.lastPublicIp}` : ""}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {targetIsNoProxySelection && (
                    <div className="text-xs text-muted-foreground">
                      La sesión quedará sin proxy asignado.
                    </div>
                  )}
                  {targetProxyInvalid && detailsTargetProxyId && (
                    <div className="text-xs text-amber-600">
                      Proxy destino no disponible.
                    </div>
                  )}
                </div>

                {!sessionStopped && (
                  <div className="text-xs text-muted-foreground">
                    Detén la sesión para permitir cambios.
                  </div>
                )}
                {requiresCurrentProxyBad && !currentProxyBad && (
                  <div className="text-xs text-muted-foreground">
                    El proxy actual debe estar degraded u offline.
                  </div>
                )}
                {proxyLocked && (
                  <div className="text-xs text-muted-foreground">
                    El proxy está bloqueado. Desbloquéalo para cambiar.
                  </div>
                )}

                <div className="flex items-center justify-between gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleStopSession(detailsSession)}
                    disabled={sessionStopped || detailsSessionBusy}
                  >
                    {detailsSessionBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    Stop & Change
                  </Button>
                  <Button
                    onClick={() => handleChangeProxy(detailsSession)}
                    disabled={
                      detailsSessionBusy ||
                      !canAttemptProxyChange ||
                      proxyLocked ||
                      (requiresCurrentProxyBad && !currentProxyBad) ||
                      targetProxyInvalid ||
                      updateSession.isPending
                    }
                  >
                    {updateSession.isPending || detailsSessionBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    Cambiar proxy
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

