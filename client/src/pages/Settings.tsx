import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useAuthMe,
  useCampaignWindowSettings,
  useUpdateCampaignWindowSettings,
  useCampaignPauseSettings,
  useUpdateCampaignPauseSettings,
  useWhatsAppPollingSettings,
  useUpdateWhatsAppPollingSettings,
  useUpdateMyProfile,
} from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";

function formatInterval(ms: number) {
  if (!ms || ms <= 0) return "N/A";
  const seconds = Math.round(ms / 1000);
  return `${seconds}s`;
}

export default function Settings() {
  const { data: user } = useAuthMe();
  const isExecutive = user?.role === "executive";
  const { data, isLoading, isError } = useWhatsAppPollingSettings(!isExecutive);
  const update = useUpdateWhatsAppPollingSettings();
  const { data: windowSettings, isLoading: windowLoading } = useCampaignWindowSettings(!isExecutive);
  const updateWindow = useUpdateCampaignWindowSettings();
  const { data: pauseSettings, isLoading: pauseLoading } = useCampaignPauseSettings(!isExecutive);
  const updatePauses = useUpdateCampaignPauseSettings();
  const updateProfile = useUpdateMyProfile();
  const { toast } = useToast();
  const [windowEnabled, setWindowEnabled] = useState(true);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("20:00");
  const [pauseEnabled, setPauseEnabled] = useState(false);
  const [pauseStrategy, setPauseStrategy] = useState<"auto" | "fixed">("auto");
  const [pauseTargetPauses, setPauseTargetPauses] = useState("3");
  const [pauseEveryMessages, setPauseEveryMessages] = useState("30");
  const [pauseMinMessages, setPauseMinMessages] = useState("30");
  const [pauseDurations, setPauseDurations] = useState("5,10,20,30");
  const [pauseDurationsMode, setPauseDurationsMode] = useState<"list" | "range">("list");
  const [pauseApplyWhatsapp, setPauseApplyWhatsapp] = useState(true);
  const [pauseApplySms, setPauseApplySms] = useState(true);
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  const [execPhone, setExecPhone] = useState("");
  const [batchWindowSec, setBatchWindowSec] = useState("120");
  const [batchMaxItems, setBatchMaxItems] = useState("5");

  const handleToggle = async (checked: boolean) => {
    try {
      await update.mutateAsync({ enabled: checked });
      toast({
        title: checked ? "Polling activado" : "Polling desactivado",
        description: checked
          ? "Se activó la recepción por polling de emergencia."
          : "Se desactivó el polling de emergencia.",
      });
    } catch (error: any) {
      toast({
        title: "No se pudo actualizar",
        description: getErrorMessage(error, "Error al guardar la configuración."),
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (!windowSettings) return;
    setWindowEnabled(windowSettings.enabled);
    setStartTime(windowSettings.startTime ?? "08:00");
    setEndTime(windowSettings.endTime ?? "20:00");
  }, [windowSettings]);

  useEffect(() => {
    if (!pauseSettings) return;
    setPauseEnabled(pauseSettings.enabled);
    setPauseStrategy(pauseSettings.strategy ?? "auto");
    setPauseTargetPauses(String(pauseSettings.targetPauses ?? 3));
    setPauseEveryMessages(String(pauseSettings.everyMessages ?? 30));
    setPauseMinMessages(String(pauseSettings.minMessages ?? 30));
    setPauseDurations((pauseSettings.durationsMinutes ?? [5, 10, 20, 30]).join(","));
    setPauseDurationsMode(pauseSettings.durationsMode ?? "list");
    setPauseApplyWhatsapp(pauseSettings.applyToWhatsapp ?? true);
    setPauseApplySms(pauseSettings.applyToSms ?? true);
  }, [pauseSettings]);

  useEffect(() => {
    if (!user) return;
    setNotifyEnabled(user.notifyEnabled ?? true);
    setExecPhone(user.executivePhone ?? "");
    setBatchWindowSec(String(user.notifyBatchWindowSec ?? 120));
    setBatchMaxItems(String(user.notifyBatchMaxItems ?? 5));
  }, [user]);

  const handleSaveWindow = async () => {
    try {
      await updateWindow.mutateAsync({
        enabled: windowEnabled,
        startTime,
        endTime,
      });
      toast({
        title: "Horario actualizado",
        description: "Se guardó la regla horaria para campañas.",
      });
    } catch (error: any) {
      toast({
        title: "No se pudo guardar",
        description: getErrorMessage(error, "Error al guardar el horario."),
        variant: "destructive",
      });
    }
  };

  const parsePositiveInt = (value: string, fallback: number) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return parsed;
  };

  const parseDurations = (value: string, mode: "list" | "range") => {
    if (mode === "range") {
      const numbers = value.match(/\d+/g)?.map((entry) => Math.floor(Number(entry))) ?? [];
      const cleaned = numbers.filter((entry) => Number.isFinite(entry) && entry > 0);
      if (cleaned.length >= 2) {
        const min = Math.min(cleaned[0], cleaned[1]);
        const max = Math.max(cleaned[0], cleaned[1]);
        return [min, max];
      }
      return [5, 30];
    }

    const items = value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => Math.floor(Number(entry)))
      .filter((entry) => Number.isFinite(entry) && entry > 0);
    return items.length ? Array.from(new Set(items)) : [5, 10, 20, 30];
  };

  const handleSavePauses = async () => {
    try {
      const payload = {
        enabled: pauseEnabled,
        strategy: pauseStrategy,
        targetPauses: parsePositiveInt(pauseTargetPauses, 3),
        everyMessages: parsePositiveInt(pauseEveryMessages, 30),
        minMessages: parsePositiveInt(pauseMinMessages, 30),
        durationsMinutes: parseDurations(pauseDurations, pauseDurationsMode),
        durationsMode: pauseDurationsMode,
        applyToWhatsapp: pauseApplyWhatsapp,
        applyToSms: pauseApplySms,
      };
      await updatePauses.mutateAsync(payload);
      toast({
        title: "Pausas actualizadas",
        description: "Se guardó la configuración de pausas aleatorias.",
      });
    } catch (error: any) {
      toast({
        title: "No se pudo guardar",
        description: getErrorMessage(error, "Error al guardar las pausas."),
        variant: "destructive",
      });
    }
  };

  const handleSaveNotifications = async () => {
    try {
      const payload = {
        executivePhone: execPhone ? execPhone.trim() : null,
        notifyEnabled,
        notifyBatchWindowSec: parsePositiveInt(batchWindowSec, 120),
        notifyBatchMaxItems: parsePositiveInt(batchMaxItems, 5),
      };
      await updateProfile.mutateAsync(payload);
      toast({
        title: "Notificaciones actualizadas",
        description: "Se guardaron tus preferencias de WhatsApp.",
      });
    } catch (error: any) {
      toast({
        title: "No se pudo guardar",
        description: getErrorMessage(error, "Error al guardar las notificaciones."),
        variant: "destructive",
      });
    }
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground">
            {isExecutive ? "Notificaciones" : "Configuración del sistema"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isExecutive
              ? "Gestiona tu WhatsApp para recibir respuestas agrupadas."
              : "Ajustes avanzados del servidor y herramientas de emergencia."}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Notificaciones WhatsApp</CardTitle>
            <CardDescription>
              Resúmenes automáticos con nombre, RUT y snippet del mensaje recibido.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-4 rounded-lg border border-border/60 p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="notify-switch" className="text-base">Notificaciones activas</Label>
                    <Badge variant={notifyEnabled ? "default" : "outline"}>
                      {notifyEnabled ? "Activo" : "Desactivado"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Recibe un resumen por WhatsApp cuando lleguen respuestas.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {updateProfile.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  <Switch
                    id="notify-switch"
                    checked={notifyEnabled}
                    onCheckedChange={setNotifyEnabled}
                    disabled={updateProfile.isPending}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Teléfono WhatsApp</Label>
                  <Input
                    value={execPhone}
                    onChange={(event) => setExecPhone(event.target.value)}
                    placeholder="+56912345678"
                    disabled={updateProfile.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Ventana (seg)</Label>
                  <Input
                    value={batchWindowSec}
                    onChange={(event) => setBatchWindowSec(event.target.value)}
                    disabled={updateProfile.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Máx. ítems</Label>
                  <Input
                    value={batchMaxItems}
                    onChange={(event) => setBatchMaxItems(event.target.value)}
                    disabled={updateProfile.isPending}
                  />
                </div>
              </div>

              <div className="flex items-end">
                <Button
                  className="w-full"
                  onClick={handleSaveNotifications}
                  disabled={updateProfile.isPending}
                >
                  Guardar notificaciones
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {!isExecutive && (
          <>
        <Card>
          <CardHeader>
            <CardTitle>WhatsApp</CardTitle>
            <CardDescription>
              Usa el polling solo cuando los mensajes entrantes no llegan por eventos normales.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-4 rounded-lg border border-border/60 p-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="polling-switch" className="text-base">Polling de emergencia</Label>
                  <Badge variant={data?.enabled ? "default" : "outline"}>
                    {data?.enabled ? "Activo" : "Desactivado"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Fuerza lectura de mensajes entrantes cuando WhatsApp Web no dispara eventos.
                </p>
                {isError ? (
                  <p className="text-sm text-destructive">No se pudo cargar el estado actual.</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Intervalo: {formatInterval(data?.intervalMs ?? 0)} ·
                    Sesiones conectadas: {data?.connectedSessions ?? 0} ·
                    Polling activo: {data?.activePollingSessions ?? 0} ·
                    Fuente: {data?.source ?? "env"}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Nota: si reinicias el servidor, se vuelve a leer la configuración de .env.
                </p>
              </div>
              <div className="flex items-center gap-3">
                {update.isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                <Switch
                  id="polling-switch"
                  checked={data?.enabled ?? false}
                  onCheckedChange={handleToggle}
                  disabled={isLoading || update.isPending}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Campañas</CardTitle>
            <CardDescription>
              Limita el envío de mensajes a una ventana horaria específica.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-4 rounded-lg border border-border/60 p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="campaign-window-switch" className="text-base">
                      Regla horaria de campañas
                    </Label>
                    <Badge variant={windowEnabled ? "default" : "outline"}>
                      {windowEnabled ? "Activa" : "Desactivada"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Solo se enviarán mensajes entre la hora de inicio y término.
                  </p>
                  {windowSettings?.source && (
                    <p className="text-xs text-muted-foreground">
                      Fuente: {windowSettings.source}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {updateWindow.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  <Switch
                    id="campaign-window-switch"
                    checked={windowEnabled}
                    onCheckedChange={setWindowEnabled}
                    disabled={windowLoading || updateWindow.isPending}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Hora inicio</Label>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                    disabled={windowLoading || updateWindow.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Hora fin</Label>
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                    disabled={windowLoading || updateWindow.isPending}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    className="w-full"
                    onClick={handleSaveWindow}
                    disabled={windowLoading || updateWindow.isPending}
                  >
                    Guardar horario
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pausas aleatorias</CardTitle>
            <CardDescription>
              Divide campañas grandes en rondas con pausas automáticas para reducir riesgos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-4 rounded-lg border border-border/60 p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="campaign-pauses-switch" className="text-base">
                      Pausas en campañas
                    </Label>
                    <Badge variant={pauseEnabled ? "default" : "outline"}>
                      {pauseEnabled ? "Activas" : "Desactivadas"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Aplica pausas aleatorias entre envíos para campañas de mayor volumen.
                  </p>
                  {pauseSettings?.source && (
                    <p className="text-xs text-muted-foreground">
                      Fuente: {pauseSettings.source}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {updatePauses.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  <Switch
                    id="campaign-pauses-switch"
                    checked={pauseEnabled}
                    onCheckedChange={setPauseEnabled}
                    disabled={pauseLoading || updatePauses.isPending}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Estrategia</Label>
                  <Select
                    value={pauseStrategy}
                    onValueChange={(value) => setPauseStrategy(value as "auto" | "fixed")}
                    disabled={pauseLoading || updatePauses.isPending}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona estrategia" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Automática por tamaño</SelectItem>
                      <SelectItem value="fixed">Cada N mensajes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Pausas objetivo</Label>
                  <Input
                    value={pauseTargetPauses}
                    onChange={(event) => setPauseTargetPauses(event.target.value)}
                    disabled={pauseLoading || updatePauses.isPending || pauseStrategy !== "auto"}
                  />
                  <p className="text-xs text-muted-foreground">
                    Divide la campaña en rondas similares.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Cada N mensajes</Label>
                  <Input
                    value={pauseEveryMessages}
                    onChange={(event) => setPauseEveryMessages(event.target.value)}
                    disabled={pauseLoading || updatePauses.isPending || pauseStrategy !== "fixed"}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Mínimo mensajes</Label>
                  <Input
                    value={pauseMinMessages}
                    onChange={(event) => setPauseMinMessages(event.target.value)}
                    disabled={pauseLoading || updatePauses.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Duraciones</Label>
                  <Select
                    value={pauseDurationsMode}
                    onValueChange={(value) => setPauseDurationsMode(value as "list" | "range")}
                    disabled={pauseLoading || updatePauses.isPending}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Modo de duración" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="list">Lista (5,10,20,30)</SelectItem>
                      <SelectItem value="range">Rango aleatorio (5-30)</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    className="mt-2"
                    value={pauseDurations}
                    onChange={(event) => setPauseDurations(event.target.value)}
                    disabled={pauseLoading || updatePauses.isPending}
                    placeholder={pauseDurationsMode === "range" ? "5-30" : "5,10,20,30"}
                  />
                  <p className="text-xs text-muted-foreground">
                    {pauseDurationsMode === "range"
                      ? "Ejemplo: 5-30 (se elige un valor al azar entre esos minutos)."
                      : "Ejemplo: 5,10,20,30 (se elige una opción al azar)."}
                  </p>
                </div>
                <div className="flex items-end">
                  <Button
                    className="w-full"
                    onClick={handleSavePauses}
                    disabled={pauseLoading || updatePauses.isPending}
                  >
                    Guardar pausas
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    id="pause-whatsapp-switch"
                    checked={pauseApplyWhatsapp}
                    onCheckedChange={setPauseApplyWhatsapp}
                    disabled={pauseLoading || updatePauses.isPending}
                  />
                  <Label htmlFor="pause-whatsapp-switch">Aplicar a WhatsApp</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="pause-sms-switch"
                    checked={pauseApplySms}
                    onCheckedChange={setPauseApplySms}
                    disabled={pauseLoading || updatePauses.isPending}
                  />
                  <Label htmlFor="pause-sms-switch">Aplicar a SMS</Label>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
          </>
        )}
      </div>
    </Layout>
  );
}
