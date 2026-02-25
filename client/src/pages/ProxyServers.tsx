import { useMemo, useState } from "react";
import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Plus,
  RefreshCw,
  Power,
  Pencil,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  useAuthMe,
  useSessions,
  useProxyServers,
  useCreateProxyServer,
  useUpdateProxyServer,
  useDisableProxyServer,
  useCheckProxyServer,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";

export default function ProxyServers() {
  const { data: me } = useAuthMe();
  const isAdmin = me?.role === "admin";
  const { toast } = useToast();
  const { data: proxies, isLoading } = useProxyServers(isAdmin);
  const { data: sessions, isLoading: isSessionsLoading } = useSessions(isAdmin);
  const createProxy = useCreateProxyServer();
  const updateProxy = useUpdateProxyServer();
  const disableProxy = useDisableProxyServer();
  const checkProxy = useCheckProxyServer();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createHost, setCreateHost] = useState("");
  const [createPort, setCreatePort] = useState("1080");
  const [createEnabled, setCreateEnabled] = useState(true);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editHost, setEditHost] = useState("");
  const [editPort, setEditPort] = useState("1080");
  const [editEnabled, setEditEnabled] = useState(true);

  const [showConnectedProxies, setShowConnectedProxies] = useState(true);
  const [showDisconnectedProxies, setShowDisconnectedProxies] = useState(true);

  const list = useMemo(() => proxies ?? [], [proxies]);
  const sessionList = useMemo(() => sessions ?? [], [sessions]);

  const proxySessionStats = useMemo(() => {
    const stats = new Map<string, { total: number; connected: number }>();

    for (const session of sessionList) {
      if (!session.proxyServerId) continue;
      const current = stats.get(session.proxyServerId) ?? { total: 0, connected: 0 };
      current.total += 1;
      if (session.status === "connected") {
        current.connected += 1;
      }
      stats.set(session.proxyServerId, current);
    }

    return stats;
  }, [sessionList]);

  const connectedProxies = useMemo(
    () => list.filter((proxy) => ["online", "degraded"].includes(proxy.status)),
    [list]
  );

  const disconnectedProxies = useMemo(
    () => list.filter((proxy) => proxy.status === "offline"),
    [list]
  );

  const openEdit = (proxy: any) => {
    setEditingId(proxy.id);
    setEditName(proxy.name ?? "");
    setEditHost(proxy.host ?? "");
    setEditPort(String(proxy.port ?? ""));
    setEditEnabled(Boolean(proxy.enabled));
  };

  const handleCreate = async () => {
    if (!createName.trim() || !createHost.trim() || !createPort.trim()) {
      toast({
        title: "Datos incompletos",
        description: "Nombre, host y puerto son requeridos.",
        variant: "destructive",
      });
      return;
    }
    const port = Number(createPort);
    if (!Number.isFinite(port) || port <= 0 || port > 65535) {
      toast({
        title: "Puerto invalido",
        description: "El puerto debe estar entre 1 y 65535.",
        variant: "destructive",
      });
      return;
    }
    try {
      await createProxy.mutateAsync({
        name: createName.trim(),
        host: createHost.trim(),
        port,
        enabled: createEnabled,
      });
      setCreateName("");
      setCreateHost("");
      setCreatePort("1080");
      setCreateEnabled(true);
      setIsCreateOpen(false);
    } catch (error: any) {
      toast({
        title: "No se pudo crear",
        description: getErrorMessage(error, "Error creando proxy."),
        variant: "destructive",
      });
    }
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const port = Number(editPort);
    if (!editName.trim() || !editHost.trim() || !editPort.trim()) {
      toast({
        title: "Datos incompletos",
        description: "Nombre, host y puerto son requeridos.",
        variant: "destructive",
      });
      return;
    }
    if (!Number.isFinite(port) || port <= 0 || port > 65535) {
      toast({
        title: "Puerto invalido",
        description: "El puerto debe estar entre 1 y 65535.",
        variant: "destructive",
      });
      return;
    }

    try {
      await updateProxy.mutateAsync({
        id: editingId,
        data: {
          name: editName.trim(),
          host: editHost.trim(),
          port,
          enabled: editEnabled,
        },
      });
      setEditingId(null);
    } catch (error: any) {
      toast({
        title: "No se pudo actualizar",
        description: getErrorMessage(error, "Error actualizando proxy."),
        variant: "destructive",
      });
    }
  };

  const handleDisable = async (id: string) => {
    if (!confirm("Deseas deshabilitar este proxy?")) return;
    try {
      await disableProxy.mutateAsync(id);
    } catch (error: any) {
      toast({
        title: "No se pudo deshabilitar",
        description: getErrorMessage(error, "Error deshabilitando proxy."),
        variant: "destructive",
      });
    }
  };

  const handleEnable = async (id: string) => {
    try {
      await updateProxy.mutateAsync({ id, data: { enabled: true } });
    } catch (error: any) {
      toast({
        title: "No se pudo habilitar",
        description: getErrorMessage(error, "Error habilitando proxy."),
        variant: "destructive",
      });
    }
  };

  const handleCheck = async (id: string) => {
    try {
      await checkProxy.mutateAsync(id);
    } catch (error: any) {
      toast({
        title: "No se pudo validar",
        description: getErrorMessage(error, "Error al validar proxy."),
        variant: "destructive",
      });
    }
  };

  const renderStatus = (status: string) => {
    if (status === "online") {
      return <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-200">Online</Badge>;
    }
    if (status === "degraded") {
      return <Badge className="bg-amber-500/10 text-amber-700 border-amber-200">Degraded</Badge>;
    }
    return <Badge variant="outline" className="text-muted-foreground">Offline</Badge>;
  };

  const renderProxyRows = (proxiesToRender: typeof list) => {
    if (!proxiesToRender.length) {
      return (
        <TableRow>
          <TableCell colSpan={8} className="text-center text-muted-foreground">
            No hay proxies en esta seccion.
          </TableCell>
        </TableRow>
      );
    }

    return proxiesToRender.map((proxy) => {
      const stats = proxySessionStats.get(proxy.id) ?? { total: 0, connected: 0 };
      const disconnected = Math.max(stats.total - stats.connected, 0);

      return (
        <TableRow key={proxy.id}>
          <TableCell className="font-medium">{proxy.name}</TableCell>
          <TableCell className="font-mono text-xs">
            {proxy.scheme}://{proxy.host}:{proxy.port}
          </TableCell>
          <TableCell className="space-y-1">
            {renderStatus(proxy.status)}
            {!proxy.enabled && (
              <div className="text-xs text-muted-foreground">Deshabilitado</div>
            )}
          </TableCell>
          <TableCell className="text-xs">
            {isSessionsLoading ? (
              <span className="text-muted-foreground">Calculando...</span>
            ) : (
              <div className="space-y-1">
                <div>
                  Conectadas: <span className="font-medium">{stats.connected}</span>
                </div>
                <div className="text-muted-foreground">
                  Desconectadas: {disconnected} · Total: {stats.total}
                </div>
              </div>
            )}
          </TableCell>
          <TableCell className="font-mono text-xs">{proxy.lastPublicIp ?? "-"}</TableCell>
          <TableCell className="text-xs">{proxy.latencyMs ? `${proxy.latencyMs} ms` : "-"}</TableCell>
          <TableCell className="text-xs text-muted-foreground">
            {proxy.lastCheckAt ? new Date(proxy.lastCheckAt).toLocaleString() : "-"}
          </TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => handleCheck(proxy.id)}
                disabled={checkProxy.isPending}
              >
                <RefreshCw className="h-3 w-3" />
                Check
              </Button>
              <Button variant="outline" size="sm" className="gap-1" onClick={() => openEdit(proxy)}>
                <Pencil className="h-3 w-3" />
                Editar
              </Button>
              {proxy.enabled ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => handleDisable(proxy.id)}
                >
                  <Power className="h-3 w-3" />
                  Deshabilitar
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => handleEnable(proxy.id)}
                >
                  <Power className="h-3 w-3" />
                  Habilitar
                </Button>
              )}
            </div>
          </TableCell>
        </TableRow>
      );
    });
  };

  const renderProxyTable = (proxiesToRender: typeof list) => {
    return (
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead>Nombre</TableHead>
            <TableHead>Endpoint</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Sesiones</TableHead>
            <TableHead>IP publica</TableHead>
            <TableHead>Latencia</TableHead>
            <TableHead>Ultimo check</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>{renderProxyRows(proxiesToRender)}</TableBody>
      </Table>
    );
  };

  if (!isAdmin) {
    return (
      <Layout>
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">No autorizado.</CardContent>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-heading font-bold text-foreground">Proxy Servers</h1>
            <p className="text-muted-foreground mt-1">Administra proxies SOCKS5 y su estado.</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Nuevo proxy
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Crear proxy</DialogTitle>
                <DialogDescription>Define el endpoint SOCKS5 fijo.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input value={createName} onChange={(e) => setCreateName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Host</Label>
                  <Input
                    value={createHost}
                    onChange={(e) => setCreateHost(e.target.value)}
                    placeholder="172.16.55.83"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Puerto</Label>
                  <Input value={createPort} onChange={(e) => setCreatePort(e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={createEnabled} onCheckedChange={setCreateEnabled} />
                  <Label>Habilitado</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCreate} disabled={createProxy.isPending}>
                  {createProxy.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Crear
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Proxies</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : !list.length ? (
              <div className="text-center text-muted-foreground py-6">No hay proxies registrados.</div>
            ) : (
              <>
                <div className="rounded-lg border border-emerald-200">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-emerald-100 bg-emerald-50/60">
                    <Button
                      variant="ghost"
                      className="h-auto p-0 font-medium hover:bg-transparent"
                      onClick={() => setShowConnectedProxies((value) => !value)}
                    >
                      {showConnectedProxies ? (
                        <ChevronDown className="h-4 w-4 mr-2" />
                      ) : (
                        <ChevronRight className="h-4 w-4 mr-2" />
                      )}
                      Conectados ({connectedProxies.length})
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground"
                      onClick={() => setShowConnectedProxies((value) => !value)}
                    >
                      {showConnectedProxies ? "Ocultar" : "Mostrar"}
                    </Button>
                  </div>
                  {showConnectedProxies && renderProxyTable(connectedProxies)}
                </div>

                <div className="rounded-lg border border-slate-200">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50/70">
                    <Button
                      variant="ghost"
                      className="h-auto p-0 font-medium hover:bg-transparent"
                      onClick={() => setShowDisconnectedProxies((value) => !value)}
                    >
                      {showDisconnectedProxies ? (
                        <ChevronDown className="h-4 w-4 mr-2" />
                      ) : (
                        <ChevronRight className="h-4 w-4 mr-2" />
                      )}
                      Desconectados ({disconnectedProxies.length})
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground"
                      onClick={() => setShowDisconnectedProxies((value) => !value)}
                    >
                      {showDisconnectedProxies ? "Ocultar" : "Mostrar"}
                    </Button>
                  </div>
                  {showDisconnectedProxies && renderProxyTable(disconnectedProxies)}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(editingId)} onOpenChange={(open) => !open && setEditingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar proxy</DialogTitle>
            <DialogDescription>Actualiza el endpoint o su estado.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Host</Label>
              <Input value={editHost} onChange={(e) => setEditHost(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Puerto</Label>
              <Input value={editPort} onChange={(e) => setEditPort(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={editEnabled} onCheckedChange={setEditEnabled} />
              <Label>Habilitado</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingId(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateProxy.isPending}>
              {updateProxy.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
