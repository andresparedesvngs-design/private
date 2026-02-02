import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useCampaigns,
  usePools,
  useSessions,
  useDebtors,
  useMessages,
  useGsmLines,
  useGsmPools,
  useCreateCampaign,
  useStartCampaign,
  usePauseCampaign,
  useCreatePool,
  useDeleteCampaign,
  useDeletePool,
  useUpdatePool,
  useCreateGsmLine,
  useDeleteGsmLine,
  useCreateGsmPool,
  useDeleteGsmPool,
  useRetryFailedCampaign,
  useCampaignPauseSettings,
} from "@/lib/api";
import { 
  Plus, 
  Play, 
  Pause, 
  StopCircle, 
  Calendar, 
  Clock, 
  Users, 
  Settings,
  Zap,
  RefreshCw,
  Search,
  Filter,
  BarChart,
  Loader2,
  Download,
  Trash2,
  Pencil,
  Eye
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import * as XLSX from "xlsx";
import { getSocket } from "@/lib/socket";

export default function Campaigns() {
  const [location, setLocation] = useLocation();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreatePoolOpen, setIsCreatePoolOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [activeTab, setActiveTab] = useState("campaigns");

  const [campaignName, setCampaignName] = useState("");
  const [selectedPoolId, setSelectedPoolId] = useState("");
  const [campaignChannel, setCampaignChannel] = useState<"whatsapp" | "sms" | "whatsapp_fallback_sms">("whatsapp");
  const [selectedSmsPoolId, setSelectedSmsPoolId] = useState("");
  const [messageTemplate, setMessageTemplate] = useState("");
  const [messageVariantsCount, setMessageVariantsCount] = useState(0);
  const [messageVariantTemplates, setMessageVariantTemplates] = useState<string[]>([]);
  const [messageRotationStrategy, setMessageRotationStrategy] = useState<"none" | "random" | "round_robin">("none");
  const [debtorRangeStart, setDebtorRangeStart] = useState("");
  const [debtorRangeEnd, setDebtorRangeEnd] = useState("");
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [detailsCampaign, setDetailsCampaign] = useState<any>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [cooldowns, setCooldowns] = useState<Record<string, { endAt: number; reason?: string }>>({});
  const [cooldownNow, setCooldownNow] = useState(Date.now());

  useEffect(() => {
    if (!location.includes("?new=1")) return;
    setIsCreateOpen(true);
    setLocation("/campaigns");
  }, [location, setLocation]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCooldownNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const socket = getSocket();
    const handleCooldown = (payload: any) => {
      if (!payload?.campaignId || !payload?.cooldownMs) return;
      setCooldowns((prev) => ({
        ...prev,
        [payload.campaignId]: {
          endAt: Date.now() + Number(payload.cooldownMs),
          reason: payload.reason,
        },
      }));
    };

    socket.on("campaign:cooldown", handleCooldown);

    return () => {
      socket.off("campaign:cooldown", handleCooldown);
    };
  }, []);

  const [poolName, setPoolName] = useState("");
  const [poolStrategy, setPoolStrategy] = useState<"competitive" | "fixed_turns" | "random_turns">("competitive");
  const [poolDelayBase, setPoolDelayBase] = useState([10000]);
  const [poolDelayVariation, setPoolDelayVariation] = useState([5000]);
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);

  const [isCreateGsmLineOpen, setIsCreateGsmLineOpen] = useState(false);
  const [gsmLineName, setGsmLineName] = useState("");
  const [gsmLineUrlTemplate, setGsmLineUrlTemplate] = useState("");
  const [gsmLineActive, setGsmLineActive] = useState(true);
  const [isCreateInfobipLineOpen, setIsCreateInfobipLineOpen] = useState(false);
  const [infobipLineName, setInfobipLineName] = useState("Infobip");
  const [infobipBaseUrl, setInfobipBaseUrl] = useState("");
  const [infobipEndpoint, setInfobipEndpoint] = useState("sms/2/text/advanced");
  const [infobipSender, setInfobipSender] = useState("");
  const [infobipAuthType, setInfobipAuthType] = useState<"apikey" | "basic" | "ibsso" | "oauth">("apikey");
  const [infobipApiKey, setInfobipApiKey] = useState("");
  const [infobipUsername, setInfobipUsername] = useState("");
  const [infobipPassword, setInfobipPassword] = useState("");
  const [infobipToken, setInfobipToken] = useState("");
  const [infobipLineActive, setInfobipLineActive] = useState(true);

  const [isCreateGsmPoolOpen, setIsCreateGsmPoolOpen] = useState(false);
  const [gsmPoolName, setGsmPoolName] = useState("");
  const [gsmPoolStrategy, setGsmPoolStrategy] = useState<"fixed_turns" | "random_turns">("fixed_turns");
  const [gsmPoolDelayBase, setGsmPoolDelayBase] = useState([3000]);
  const [gsmPoolDelayVariation, setGsmPoolDelayVariation] = useState([1000]);
  const [selectedGsmLineIds, setSelectedGsmLineIds] = useState<string[]>([]);

  const { data: campaigns, isLoading: campaignsLoading } = useCampaigns();
  const { data: pools, isLoading: poolsLoading } = usePools();
  const { data: sessions } = useSessions();
  const { data: gsmLines } = useGsmLines();
  const { data: gsmPools } = useGsmPools();
  const { data: pauseSettings } = useCampaignPauseSettings();
  const { data: debtors } = useDebtors();
  const { data: campaignMessages, isLoading: campaignMessagesLoading } = useMessages(
    detailsCampaign?.id,
    Boolean(detailsCampaign?.id)
  );
  const createCampaign = useCreateCampaign();
  const startCampaign = useStartCampaign();
  const pauseCampaign = usePauseCampaign();
  const createPool = useCreatePool();
  const deleteCampaign = useDeleteCampaign();
  const deletePool = useDeletePool();
  const updatePool = useUpdatePool();
  const createGsmLine = useCreateGsmLine();
  const deleteGsmLine = useDeleteGsmLine();
  const createGsmPool = useCreateGsmPool();
  const deleteGsmPool = useDeleteGsmPool();
  const retryFailedCampaign = useRetryFailedCampaign();

  const [editingPool, setEditingPool] = useState<any>(null);
  const [isEditPoolOpen, setIsEditPoolOpen] = useState(false);

  const availableDebtors = debtors?.filter(d => d.status === 'disponible') || [];
  const totalAvailableDebtors = availableDebtors.length;
  const poolNameById = new Map((pools ?? []).map((pool) => [pool.id, pool.name]));
  const gsmPoolNameById = new Map((gsmPools ?? []).map((pool) => [pool.id, pool.name]));
  const debtorById = new Map((debtors ?? []).map((debtor) => [debtor.id, debtor]));

  const campaignDebtors = detailsCampaign
    ? (debtors ?? []).filter((debtor) => debtor.campaignId === detailsCampaign.id)
    : [];

  const messageStatusLabels: Record<string, string> = {
    sent: "Enviado",
    failed: "Fallido",
    received: "Recibido",
    pending: "Pendiente",
  };

  const renderMessageStatus = (status: string | undefined) => {
    const normalized = status ?? "pending";
    const label = messageStatusLabels[normalized] ?? normalized;
    const tone =
      normalized === "sent"
        ? "text-green-600 border-green-200 bg-green-50"
        : normalized === "failed"
        ? "text-red-600 border-red-200 bg-red-50"
        : normalized === "received"
        ? "text-blue-600 border-blue-200 bg-blue-50"
        : "text-muted-foreground border-muted-foreground/30";
    return (
      <Badge variant="outline" className={tone}>
        {label}
      </Badge>
    );
  };

  const parsePositiveInt = (value: string) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }
    return parsed;
  };

  const normalizeToken = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9_]/g, "");

  const buildPreviewContext = () => {
    const sample = debtors?.[0];
    const ctx: Record<string, string> = {
      nombre: sample?.name ?? "Juan Perez",
      name: sample?.name ?? "Juan Perez",
      deuda: String(sample?.debt ?? 150000),
      debt: String(sample?.debt ?? 150000),
      phone: sample?.phone ?? "+56912345678",
      nombre_ejecutivo:
        (sample?.metadata as Record<string, any> | undefined)?.nombre_ejecutivo ?? "Maria Gonzalez",
      fono_ejecutivo:
        (sample?.metadata as Record<string, any> | undefined)?.fono_ejecutivo ?? "+56998765432",
    };

    if (sample?.metadata && typeof sample.metadata === "object") {
      for (const [key, value] of Object.entries(sample.metadata)) {
        if (!key) continue;
        ctx[key] = String(value ?? "");
      }
    }

    return ctx;
  };

  const renderPreview = (template: string, context: Record<string, string>) => {
    const normalizedContext: Record<string, string> = {};
    for (const [key, value] of Object.entries(context)) {
      const normalized = normalizeToken(key);
      if (!normalized) continue;
      normalizedContext[normalized] = value;
    }

    const missing = new Set<string>();
    const text = template.replace(/\{([^}]+)\}/g, (match, rawKey) => {
      const normalized = normalizeToken(String(rawKey));
      if (!normalized) return match;
      const value = normalizedContext[normalized];
      if (value === undefined || value === "") {
        missing.add(String(rawKey).trim());
        return match;
      }
      return value;
    });

    return { text, missing: Array.from(missing) };
  };

  const parsedRangeStart = parsePositiveInt(debtorRangeStart);
  const parsedRangeEnd = parsePositiveInt(debtorRangeEnd);
  const rangeActive = parsedRangeStart !== null || parsedRangeEnd !== null;
  const rangeInvalid =
    parsedRangeStart !== null &&
    parsedRangeEnd !== null &&
    parsedRangeEnd < parsedRangeStart;

  let selectedDebtorsCount = totalAvailableDebtors;
  if (rangeActive) {
    if (rangeInvalid || totalAvailableDebtors === 0) {
      selectedDebtorsCount = 0;
    } else {
      const effectiveStart = parsedRangeStart ?? 1;
      const effectiveEnd = parsedRangeEnd ?? totalAvailableDebtors;
      if (effectiveStart > totalAvailableDebtors) {
        selectedDebtorsCount = 0;
      } else {
        const boundedStart = Math.max(effectiveStart, 1);
        const boundedEnd = Math.min(effectiveEnd, totalAvailableDebtors);
        selectedDebtorsCount = Math.max(0, boundedEnd - boundedStart + 1);
      }
    }
  }

  const campaignMessageList = (campaignMessages ?? []).slice().sort((a, b) => {
    const aDate = a.sentAt ?? a.createdAt ?? 0;
    const bDate = b.sentAt ?? b.createdAt ?? 0;
    return new Date(bDate).getTime() - new Date(aDate).getTime();
  });

  const campaignMessageCounts = campaignMessageList.reduce(
    (acc, msg) => {
      const key = msg.status || "pending";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const campaignDebtorCounts = campaignDebtors.reduce(
    (acc, debtor) => {
      acc[debtor.status] = (acc[debtor.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const formatRange = (start?: number | null, end?: number | null) => {
    if (!start && !end) return "Todos";
    const startValue = start ?? 1;
    const endValue = end ?? "∞";
    return `${startValue} - ${endValue}`;
  };

  const formatDuration = (ms: number) => {
    if (!Number.isFinite(ms) || ms <= 0) return "0m";
    const totalSeconds = Math.max(Math.ceil(ms / 1000), 0);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const selectedPool = pools?.find((pool) => pool.id === selectedPoolId);
  const selectedSmsPool = gsmPools?.find((pool) => pool.id === selectedSmsPoolId);
  const connectedSessionCount = selectedPool
    ? (sessions ?? []).filter(
        (session) =>
          selectedPool.sessionIds?.includes(session.id) &&
          session.status === "connected"
      ).length
    : 0;

  const estimateCampaignTime = () => {
    if (!selectedDebtorsCount || selectedDebtorsCount <= 0) return null;

    const isSmsOnly = campaignChannel === "sms";
    const isWhatsapp = campaignChannel !== "sms";
    const delaySource = isSmsOnly ? selectedSmsPool : selectedPool;
    if (!delaySource) return null;

    const base = delaySource.delayBase ?? 0;
    const variation = delaySource.delayVariation ?? 0;
    const minDelay = Math.max(base - variation, 0);
    const maxDelay = base + variation;
    const avgDelay = base + variation / 2;

    let multiplier = 1;
    if (isWhatsapp && selectedPool) {
      const sessionsCount = connectedSessionCount || selectedPool.sessionIds?.length || 1;
      const target = 3;
      const maxMult = 3;
      const raw = sessionsCount / target;
      multiplier = Math.min(Math.max(raw, 1), maxMult);
    }

    const minDelayMs = minDelay * multiplier;
    const maxDelayMs = maxDelay * multiplier;
    const avgDelayMs = avgDelay * multiplier;

    let pauseCount = 0;
    let pauseMinMs = 0;
    let pauseMaxMs = 0;
    let pauseAvgMs = 0;

    const pausesEnabled = pauseSettings?.enabled ?? false;
    const applyPause = isSmsOnly
      ? pauseSettings?.applyToSms ?? true
      : pauseSettings?.applyToWhatsapp ?? true;

    if (pausesEnabled && applyPause) {
      const minMessages = pauseSettings?.minMessages ?? 30;
      if (selectedDebtorsCount >= minMessages) {
        const strategy = pauseSettings?.strategy ?? "auto";
        const targetPauses = pauseSettings?.targetPauses ?? 3;
        const everyMessages = pauseSettings?.everyMessages ?? 30;
        const every =
          strategy === "fixed"
            ? Math.max(everyMessages, 1)
            : Math.ceil(selectedDebtorsCount / Math.max(targetPauses + 1, 1));

        pauseCount = Math.floor((selectedDebtorsCount - 1) / every);

        const durations = pauseSettings?.durationsMinutes ?? [5, 10, 20, 30];
        const sorted = [...durations].sort((a, b) => a - b);
        const durationsMode = pauseSettings?.durationsMode ?? "list";
        if (durationsMode === "range" && sorted.length >= 2) {
          const min = sorted[0];
          const max = sorted[sorted.length - 1];
          pauseMinMs = min * 60 * 1000;
          pauseMaxMs = max * 60 * 1000;
          pauseAvgMs = ((min + max) / 2) * 60 * 1000;
        } else if (sorted.length > 0) {
          pauseMinMs = sorted[0] * 60 * 1000;
          pauseMaxMs = sorted[sorted.length - 1] * 60 * 1000;
          pauseAvgMs =
            (sorted.reduce((acc, val) => acc + val, 0) / sorted.length) * 60 * 1000;
        }
      }
    }

    const totalMin = selectedDebtorsCount * minDelayMs + pauseCount * pauseMinMs;
    const totalAvg = selectedDebtorsCount * avgDelayMs + pauseCount * pauseAvgMs;
    const totalMax = selectedDebtorsCount * maxDelayMs + pauseCount * pauseMaxMs;

    return {
      totalMin,
      totalAvg,
      totalMax,
      pauseCount,
      multiplier,
    };
  };

  const estimatedTime = estimateCampaignTime();

  const sanitizeFilename = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase() || "campana";

  const handleOpenDetails = (campaign: any) => {
    setDetailsCampaign(campaign);
    setIsDetailsOpen(true);
  };

  const handleExportCampaignDetails = () => {
    if (!detailsCampaign) return;

    const summaryRows = [
      {
        Campana: detailsCampaign.name,
        Estado: displayCampaignStatus(detailsCampaign.status),
        Canal: displayCampaignChannel(detailsCampaign.channel, detailsCampaign.fallbackSms),
        Pool: detailsCampaign.poolId ? poolNameById.get(detailsCampaign.poolId) ?? detailsCampaign.poolId : "",
        Pool_SMS: detailsCampaign.smsPoolId
          ? gsmPoolNameById.get(detailsCampaign.smsPoolId) ?? detailsCampaign.smsPoolId
          : "",
        Rango: formatRange(detailsCampaign.debtorRangeStart, detailsCampaign.debtorRangeEnd),
        Total_Deudores: detailsCampaign.totalDebtors ?? 0,
        Enviados: detailsCampaign.sent ?? 0,
        Fallidos: detailsCampaign.failed ?? 0,
        Progreso: `${detailsCampaign.progress ?? 0}%`,
        Creada: detailsCampaign.createdAt ? new Date(detailsCampaign.createdAt).toLocaleString() : "",
        Iniciada: detailsCampaign.startedAt ? new Date(detailsCampaign.startedAt).toLocaleString() : "",
        Completada: detailsCampaign.completedAt ? new Date(detailsCampaign.completedAt).toLocaleString() : "",
      },
    ];

    const debtorRows = campaignDebtors.map((debtor) => ({
      Nombre: debtor.name,
      Telefono: debtor.phone,
      Deuda: debtor.debt,
      Estado: debtor.status,
      Ultimo_contacto: debtor.lastContact ? new Date(debtor.lastContact).toLocaleString() : "",
    }));

    const messageRows = campaignMessageList.map((message) => {
      const debtor = message.debtorId ? debtorById.get(message.debtorId) : undefined;
      return {
        Fecha: message.sentAt
          ? new Date(message.sentAt).toLocaleString()
          : message.createdAt
          ? new Date(message.createdAt).toLocaleString()
          : "",
        Deudor: debtor?.name ?? "",
        Telefono: message.phone ?? debtor?.phone ?? "",
        Estado: messageStatusLabels[message.status ?? "pending"] ?? message.status ?? "",
        Canal: message.channel ?? "",
        Mensaje: message.content ?? "",
        Error: message.error ?? "",
        Respuesta_Proveedor: message.providerResponse ?? "",
      };
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), "Resumen");

    if (debtorRows.length > 0) {
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(debtorRows), "Deudores");
    }

    if (messageRows.length > 0) {
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(messageRows), "Mensajes");
    }

    const safeName = sanitizeFilename(detailsCampaign.name);
    const dateTag = new Date().toISOString().split("T")[0];
    XLSX.writeFile(workbook, `campana_${safeName}_${dateTag}.xlsx`);
  };
  const campaignStatusLabels: Record<string, string> = {
    draft: "Borrador",
    active: "Activa",
    paused: "Pausada",
    completed: "Completada",
    error: "Con error",
  };
  const campaignChannelLabels: Record<string, string> = {
    whatsapp: "WhatsApp",
    sms: "SMS",
    whatsapp_fallback_sms: "WhatsApp + fallback SMS",
  };
  const poolStrategyLabels: Record<string, string> = {
    competitive: "Competitivo",
    fixed_turns: "Turnos fijos",
    random_turns: "Turnos aleatorios",
    competitivo: "Competitivo",
    turnos_fijos: "Turnos fijos",
    turnos_aleatorios: "Turnos aleatorios",
  };
  const displayCampaignStatus = (status: string) => campaignStatusLabels[status] ?? status;
  const displayCampaignChannel = (channel?: string, fallbackSms?: boolean) => {
    const base = channel ?? "whatsapp";
    const resolved = base === "whatsapp" && fallbackSms ? "whatsapp_fallback_sms" : base;
    return campaignChannelLabels[resolved] ?? resolved;
  };

  const formatCooldown = (ms: number) => {
    const totalSeconds = Math.max(Math.ceil(ms / 1000), 0);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const cooldownLabelByReason: Record<string, string> = {
    outside_window: "Fuera de horario",
    session_unavailable: "Sesión caída",
    session_unavailable_no_remaining: "Sesiones caídas",
    no_connected_sessions: "Sin sesiones",
    session_retry_reset: "Reintentando",
    scheduled_pause: "Pausa programada",
  };
  const displayPoolStrategy = (strategy: string) => poolStrategyLabels[strategy] ?? strategy;
  const requiresWhatsappPool = campaignChannel !== "sms";
  const requiresSmsPool =
    campaignChannel === "sms" || campaignChannel === "whatsapp_fallback_sms";

  const handleVariantCountChange = (rawValue: string) => {
    const parsed = parseInt(rawValue, 10);
    const nextCount = Number.isFinite(parsed) ? Math.max(0, Math.min(20, parsed)) : 0;
    setMessageVariantsCount(nextCount);
    setMessageVariantTemplates((prev) => {
      const next = prev.slice(0, nextCount);
      while (next.length < nextCount) {
        next.push("");
      }
      return next;
    });
  };

  const handleVariantTemplateChange = (index: number, value: string) => {
    setMessageVariantTemplates((prev) => {
      const next = [...prev];
      while (next.length <= index) {
        next.push("");
      }
      next[index] = value;
      return next;
    });
  };

  const handleCreateCampaign = async () => {
    const requiresWhatsappPool = campaignChannel !== "sms";
    const requiresSmsPool =
      campaignChannel === "sms" || campaignChannel === "whatsapp_fallback_sms";

    if (!campaignName || !messageTemplate) {
      alert("Por favor complete el nombre y la plantilla de mensaje");
      return;
    }

    if (rangeInvalid) {
      alert('El rango es inválido. "Hasta" debe ser mayor o igual a "Desde".');
      return;
    }

    if (requiresWhatsappPool && !selectedPoolId) {
      alert("Debes seleccionar un pool de WhatsApp");
      return;
    }

    if (requiresSmsPool && !selectedSmsPoolId) {
      alert("Debes seleccionar un pool SMS");
      return;
    }

    const cleanedVariants = messageVariantTemplates
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .filter((value) => value !== messageTemplate);

    const messageVariants = Array.from(new Set(cleanedVariants));

    const rotationStrategy =
      messageVariants.length > 0 && messageRotationStrategy === "none"
        ? "random"
        : messageRotationStrategy;

    const fallbackSms = campaignChannel === "whatsapp_fallback_sms";
    const poolId = requiresWhatsappPool ? selectedPoolId : null;
    const smsPoolId = requiresSmsPool ? selectedSmsPoolId : null;
    
    try {
      const payload = {
        name: campaignName,
        poolId,
        channel: campaignChannel,
        smsPoolId,
        fallbackSms,
        message: messageTemplate,
        messageVariants,
        messageRotationStrategy: rotationStrategy,
        status: 'draft',
        totalDebtors: selectedDebtorsCount,
        sent: 0,
        failed: 0,
        progress: 0,
        ...(parsedRangeStart !== null ? { debtorRangeStart: parsedRangeStart } : {}),
        ...(parsedRangeEnd !== null ? { debtorRangeEnd: parsedRangeEnd } : {})
      };

      await createCampaign.mutateAsync(payload);
      
      setIsCreateOpen(false);
      setCampaignName("");
      setSelectedPoolId("");
      setCampaignChannel("whatsapp");
      setSelectedSmsPoolId("");
      setMessageTemplate("");
      setMessageVariantsCount(0);
      setMessageVariantTemplates([]);
      setMessageRotationStrategy("none");
      setDebtorRangeStart("");
      setDebtorRangeEnd("");
      setStep(1);
    } catch (error) {
      console.error('Failed to create campaign:', error);
    }
  };

  const handleStartCampaign = async (id: string) => {
    try {
      await startCampaign.mutateAsync(id);
    } catch (error) {
      console.error('Failed to start campaign:', error);
    }
  };

  const handlePauseCampaign = async (id: string) => {
    try {
      await pauseCampaign.mutateAsync(id);
    } catch (error) {
      console.error('Failed to pause campaign:', error);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    if (confirm('¿Estás seguro de eliminar esta campaña?')) {
      try {
        await deleteCampaign.mutateAsync(id);
      } catch (error) {
        console.error('Failed to delete campaign:', error);
      }
    }
  };

  const handleRetryFailedCampaign = async () => {
    if (!detailsCampaign) return;
    const failedCount = campaignDebtorCounts.fallado ?? 0;
    if (failedCount === 0) {
      alert("No hay deudores fallidos para reintentar.");
      return;
    }
    if (!confirm(`¿Reintentar ${failedCount} deudor(es) fallidos?`)) {
      return;
    }
    try {
      const result = await retryFailedCampaign.mutateAsync(detailsCampaign.id);
      alert(`Se reactivaron ${result.count} deudor(es) fallidos como disponibles.`);
    } catch (error) {
      console.error("Failed to retry failed debtors:", error);
      alert("No se pudo reintentar los fallidos.");
    }
  };

  const handleCreatePool = async () => {
    if (!poolName) {
      alert('Por favor ingrese un nombre para el pool');
      return;
    }
    
    try {
      await createPool.mutateAsync({
        name: poolName,
        strategy: poolStrategy,
        sessionIds: selectedSessionIds,
        delayBase: poolDelayBase[0],
        delayVariation: poolDelayVariation[0],
        active: true
      });
      
      setIsCreatePoolOpen(false);
      setPoolName("");
      setPoolStrategy("competitive");
      setPoolDelayBase([5000]);
      setPoolDelayVariation([1000]);
      setSelectedSessionIds([]);
    } catch (error) {
      console.error('Failed to create pool:', error);
    }
  };

  const toggleSessionInPool = (sessionId: string) => {
    setSelectedSessionIds(prev => 
      prev.includes(sessionId) 
        ? prev.filter(id => id !== sessionId)
        : [...prev, sessionId]
    );
  };

  const handleDeletePool = async (id: string) => {
    if (confirm('¿Estás seguro de eliminar este pool?')) {
      try {
        await deletePool.mutateAsync(id);
      } catch (error) {
        console.error('Failed to delete pool:', error);
      }
    }
  };

  const handleEditPool = (pool: any) => {
    setEditingPool(pool);
    setPoolName(pool.name);
    setPoolStrategy(pool.strategy);
    setPoolDelayBase([pool.delayBase]);
    setPoolDelayVariation([pool.delayVariation]);
    setSelectedSessionIds(pool.sessionIds || []);
    setIsEditPoolOpen(true);
  };

  const handleUpdatePool = async () => {
    if (!editingPool || !poolName) return;
    
    try {
      await updatePool.mutateAsync({
        id: editingPool.id,
        data: {
          name: poolName,
          strategy: poolStrategy,
          sessionIds: selectedSessionIds,
          delayBase: poolDelayBase[0],
          delayVariation: poolDelayVariation[0]
        }
      });
      
      setIsEditPoolOpen(false);
      setEditingPool(null);
      setPoolName("");
      setPoolStrategy("competitive");
      setPoolDelayBase([5000]);
      setPoolDelayVariation([1000]);
      setSelectedSessionIds([]);
    } catch (error) {
      console.error('Failed to update pool:', error);
    }
  };

  const toggleGsmLineInPool = (lineId: string) => {
    setSelectedGsmLineIds((prev) =>
      prev.includes(lineId) ? prev.filter((id) => id !== lineId) : [...prev, lineId]
    );
  };

  const handleCreateGsmLine = async () => {
    if (!gsmLineName || !gsmLineUrlTemplate) {
      alert("Por favor ingresa nombre y URL template para la linea GSM");
      return;
    }

    try {
      await createGsmLine.mutateAsync({
        name: gsmLineName,
        urlTemplate: gsmLineUrlTemplate,
        active: gsmLineActive,
        status: gsmLineActive ? "active" : "inactive",
      });

      setIsCreateGsmLineOpen(false);
      setGsmLineName("");
      setGsmLineUrlTemplate("");
      setGsmLineActive(true);
    } catch (error) {
      console.error("Failed to create GSM line:", error);
    }
  };

  const buildInfobipTemplate = (maskToken = false) => {
    const rawBase = infobipBaseUrl.trim();
    const base = rawBase.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    if (!base) {
      return "";
    }

    const endpoint = (infobipEndpoint || "sms/2/text/advanced").trim().replace(/^\/+/, "");
    const params = new URLSearchParams();

    if (infobipSender.trim()) {
      params.set("from", infobipSender.trim());
    }

    if (infobipAuthType === "basic") {
      if (infobipUsername.trim()) {
        params.set("username", infobipUsername.trim());
      }
      if (infobipPassword.trim()) {
        params.set("password", maskToken ? "***" : infobipPassword.trim());
      }
    } else {
      const tokenSource = infobipAuthType === "apikey" ? infobipApiKey : infobipToken;
      if (tokenSource.trim()) {
        params.set("token", maskToken ? "***" : tokenSource.trim());
      }
    }

    const query = params.toString();
    return `infobip+${infobipAuthType}://${base}/${endpoint}${query ? `?${query}` : ""}`;
  };

  const handleCreateInfobipLine = async () => {
    if (!infobipLineName.trim()) {
      alert("Por favor ingresa un nombre para la linea Infobip");
      return;
    }

    if (!infobipBaseUrl.trim()) {
      alert("Por favor ingresa la URL base de Infobip");
      return;
    }

    if (!infobipSender.trim()) {
      alert("Por favor ingresa el sender (from) aprobado en Infobip");
      return;
    }

    if (infobipAuthType === "basic") {
      if (!infobipUsername.trim() || !infobipPassword.trim()) {
        alert("Completa usuario y password para Basic");
        return;
      }
    } else if (infobipAuthType === "apikey") {
      if (!infobipApiKey.trim()) {
        alert("Pega tu API key de Infobip");
        return;
      }
    } else if (!infobipToken.trim()) {
      alert("Pega el token de Infobip");
      return;
    }

    const template = buildInfobipTemplate(false);
    if (!template) {
      alert("No se pudo generar el template de Infobip");
      return;
    }

    try {
      await createGsmLine.mutateAsync({
        name: infobipLineName.trim(),
        urlTemplate: template,
        active: infobipLineActive,
        status: infobipLineActive ? "active" : "inactive",
      });

      setIsCreateInfobipLineOpen(false);
      setInfobipLineName("Infobip");
      setInfobipBaseUrl("");
      setInfobipEndpoint("sms/2/text/advanced");
      setInfobipSender("");
      setInfobipAuthType("apikey");
      setInfobipApiKey("");
      setInfobipUsername("");
      setInfobipPassword("");
      setInfobipToken("");
      setInfobipLineActive(true);
    } catch (error) {
      console.error("Failed to create Infobip line:", error);
    }
  };

  const handleDeleteGsmLine = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar esta linea GSM?")) {
      return;
    }
    try {
      await deleteGsmLine.mutateAsync(id);
    } catch (error) {
      console.error("Failed to delete GSM line:", error);
    }
  };

  const handleCreateGsmPool = async () => {
    if (!gsmPoolName) {
      alert("Por favor ingrese un nombre para el pool SMS");
      return;
    }
    if (selectedGsmLineIds.length === 0) {
      alert("Debes asignar al menos una línea GSM al pool SMS");
      return;
    }

    try {
      await createGsmPool.mutateAsync({
        name: gsmPoolName,
        strategy: gsmPoolStrategy,
        lineIds: selectedGsmLineIds,
        delayBase: gsmPoolDelayBase[0],
        delayVariation: gsmPoolDelayVariation[0],
        active: true,
      });

      setIsCreateGsmPoolOpen(false);
      setGsmPoolName("");
      setGsmPoolStrategy("fixed_turns");
      setGsmPoolDelayBase([3000]);
      setGsmPoolDelayVariation([1000]);
      setSelectedGsmLineIds([]);
    } catch (error) {
      console.error("Failed to create GSM pool:", error);
    }
  };

  const handleDeleteGsmPool = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar este pool SMS?")) {
      return;
    }
    try {
      await deleteGsmPool.mutateAsync(id);
    } catch (error) {
      console.error("Failed to delete GSM pool:", error);
    }
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-heading font-bold text-foreground">Orquestación de campañas</h1>
            <p className="text-muted-foreground mt-1">Administra campañas masivas y pools de ruteo.</p>
          </div>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-[400px]">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="campaigns">Campañas activas</TabsTrigger>
              <TabsTrigger value="pools">Pools de ruteo</TabsTrigger>
            </TabsList>
          </Tabs>

          <Dialog open={isCreateOpen} onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (!open) {
              setStep(1);
              setCampaignChannel("whatsapp");
              setSelectedSmsPoolId("");
              setDebtorRangeStart("");
              setDebtorRangeEnd("");
            }
          }}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20" data-testid="button-new-campaign">
                <Plus className="h-4 w-4" />
                Nueva campaña
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle>Crear nueva campaña</DialogTitle>
                <DialogDescription>
                  Configura el público objetivo, el mensaje y la estrategia de ruteo.
                </DialogDescription>
              </DialogHeader>
              
              <div className="py-4 flex-1 min-h-0 overflow-y-auto pr-1">
                {step === 1 && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="space-y-2">
                      <Label>Nombre de campaña</Label>
                      <Input 
                        placeholder="Ej: Cobranza de febrero - Lote A" 
                        value={campaignName}
                        onChange={(e) => setCampaignName(e.target.value)}
                        data-testid="input-campaign-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Público objetivo</Label>
                      <div className="p-3 bg-muted rounded-lg text-sm">
                        <span className="font-medium">{selectedDebtorsCount}</span>{" "}
                        deudores disponibles para envío
                        {rangeActive && (
                          <span className="text-xs text-muted-foreground">
                            {" "}
                            (de {totalAvailableDebtors})
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Desde</Label>
                          <Input
                            type="number"
                            min={1}
                            placeholder="1"
                            value={debtorRangeStart}
                            onChange={(e) => setDebtorRangeStart(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Hasta</Label>
                          <Input
                            type="number"
                            min={1}
                            placeholder={totalAvailableDebtors ? String(totalAvailableDebtors) : "0"}
                            value={debtorRangeEnd}
                            onChange={(e) => setDebtorRangeEnd(e.target.value)}
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Rango opcional. Orden: deudores más recientes primero.
                      </p>
                      {rangeInvalid && (
                        <p className="text-xs text-destructive">
                          El rango es inválido. "Hasta" debe ser mayor o igual a "Desde".
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Canal</Label>
                      <Select
                        value={campaignChannel}
                        onValueChange={(value) =>
                          setCampaignChannel(value as "whatsapp" | "sms" | "whatsapp_fallback_sms")
                        }
                      >
                        <SelectTrigger data-testid="select-campaign-channel">
                          <SelectValue placeholder="Selecciona un canal" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="whatsapp">WhatsApp</SelectItem>
                          <SelectItem value="sms">SMS (GSM)</SelectItem>
                          <SelectItem value="whatsapp_fallback_sms">
                            WhatsApp con fallback SMS
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Elige si envías por WhatsApp, por SMS, o WhatsApp con respaldo SMS.
                      </p>
                    </div>

                    {requiresWhatsappPool && (
                      <div className="space-y-2">
                        <Label>Pool de WhatsApp</Label>
                        <Select value={selectedPoolId} onValueChange={setSelectedPoolId}>
                          <SelectTrigger data-testid="select-pool">
                            <SelectValue placeholder="Selecciona un pool de WhatsApp" />
                          </SelectTrigger>
                          <SelectContent>
                            {pools?.map((pool) => (
                              <SelectItem key={pool.id} value={pool.id}>
                                {pool.name} ({displayPoolStrategy(pool.strategy)})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {!pools?.length && (
                          <p className="text-xs text-muted-foreground">
                            No hay pools de WhatsApp disponibles. Crea uno primero.
                          </p>
                        )}
                      </div>
                    )}

                    {requiresSmsPool && (
                      <div className="space-y-2">
                        <Label>Pool SMS (GSM)</Label>
                        <Select value={selectedSmsPoolId} onValueChange={setSelectedSmsPoolId}>
                          <SelectTrigger data-testid="select-sms-pool">
                            <SelectValue placeholder="Selecciona un pool SMS" />
                          </SelectTrigger>
                          <SelectContent>
                            {gsmPools?.map((pool) => (
                              <SelectItem key={pool.id} value={pool.id}>
                                {pool.name} ({displayPoolStrategy(pool.strategy)})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {!gsmPools?.length && (
                          <p className="text-xs text-muted-foreground">
                            No hay pools SMS disponibles. Crea uno primero.
                          </p>
                        )}
                      </div>
                    )}

                    {estimatedTime && !rangeInvalid && (
                      <div className="rounded-lg border border-border/70 bg-muted/30 p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">Tiempo estimado</span>
                          <span className="text-xs text-muted-foreground">
                            {campaignChannel === "whatsapp_fallback_sms"
                              ? "Basado en WhatsApp"
                              : campaignChannel === "sms"
                                ? "Basado en SMS"
                                : "Basado en WhatsApp"}
                          </span>
                        </div>
                        <div className="mt-1">
                          Promedio:{" "}
                          <span className="font-semibold">
                            {formatDuration(estimatedTime.totalAvg)}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Rango: {formatDuration(estimatedTime.totalMin)} –{" "}
                          {formatDuration(estimatedTime.totalMax)}
                        </div>
                        {estimatedTime.pauseCount > 0 && (
                          <div className="text-xs text-muted-foreground">
                            Incluye {estimatedTime.pauseCount} pausa(s) aleatoria(s).
                          </div>
                        )}
                        {estimatedTime.multiplier > 1 && (
                          <div className="text-xs text-muted-foreground">
                            Delay ajustado por sesiones (x{estimatedTime.multiplier.toFixed(2)}).
                          </div>
                        )}
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          Estimación aproximada, puede variar por respuesta del proveedor o pausas.
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                    <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
                      <DialogContent className="sm:max-w-[720px] max-h-[85vh] overflow-hidden flex flex-col">
                        <DialogHeader>
                          <DialogTitle>Vista previa del mensaje</DialogTitle>
                          <DialogDescription>
                            Se usan datos de ejemplo (primer deudor disponible) para reemplazar variables.
                          </DialogDescription>
                        </DialogHeader>

                        {(() => {
                          const context = buildPreviewContext();
                          const basePreview = renderPreview(messageTemplate, context);
                          const variants = messageVariantTemplates
                            .map((variant) => variant.trim())
                            .filter((variant) => variant.length > 0);

                          const unknownTokens = new Set<string>(basePreview.missing);
                          const variantPreviews = variants.map((variant) => {
                            const preview = renderPreview(variant, context);
                            preview.missing.forEach((token) => unknownTokens.add(token));
                            return preview;
                          });

                          const availableVariables = Object.keys(context)
                            .map((key) => normalizeToken(key))
                            .filter((key, index, list) => key && list.indexOf(key) === index)
                            .sort();

                          return (
                            <div className="flex-1 overflow-y-auto pr-1 space-y-4">
                              <div className="rounded-lg border bg-muted/20 p-4">
                                <p className="text-xs text-muted-foreground mb-2">Mensaje principal</p>
                                <p className="whitespace-pre-wrap text-sm">{basePreview.text}</p>
                              </div>

                              {variantPreviews.length > 0 && (
                                <div className="space-y-2">
                                  <p className="text-xs text-muted-foreground">Variantes</p>
                                  <div className="space-y-2">
                                    {variantPreviews.map((preview, index) => (
                                      <div key={index} className="rounded-lg border bg-muted/10 p-3">
                                        <p className="text-xs text-muted-foreground mb-1">Variante {index + 1}</p>
                                        <p className="whitespace-pre-wrap text-sm">{preview.text}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div className="space-y-2">
                                <p className="text-xs text-muted-foreground">Variables detectadas</p>
                                <div className="flex flex-wrap gap-2">
                                  {availableVariables.map((key) => (
                                    <Badge key={key} variant="outline">{`{${key}}`}</Badge>
                                  ))}
                                </div>
                              </div>

                              {unknownTokens.size > 0 && (
                                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
                                  <p className="text-xs font-semibold mb-1">Variables sin datos</p>
                                  <p className="text-xs">
                                    {Array.from(unknownTokens).join(", ")}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </DialogContent>
                    </Dialog>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label>Plantilla de mensaje</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => setIsPreviewOpen(true)}
                          disabled={!messageTemplate.trim()}
                        >
                          <Eye className="h-4 w-4" />
                          Vista previa
                        </Button>
                      </div>
                      <Textarea 
                        placeholder="Hola {name}, te recordamos que tu deuda de ${debt} está pendiente..." 
                        className="h-32 resize-none font-mono text-sm"
                        value={messageTemplate}
                        onChange={(e) => setMessageTemplate(e.target.value)}
                        data-testid="textarea-message-template"
                      />
                      <div className="flex flex-wrap gap-2 text-xs">
                        <Badge 
                          variant="secondary" 
                          className="cursor-pointer hover:bg-secondary/80"
                          onClick={() => setMessageTemplate(prev => prev + '{name}')}
                        >
                          {`{name}`}
                        </Badge>
                        <Badge 
                          variant="secondary" 
                          className="cursor-pointer hover:bg-secondary/80"
                          onClick={() => setMessageTemplate(prev => prev + '{nombre}')}
                        >
                          {`{nombre}`}
                        </Badge>
                        <Badge 
                          variant="secondary" 
                          className="cursor-pointer hover:bg-secondary/80"
                          onClick={() => setMessageTemplate(prev => prev + '{debt}')}
                        >
                          {`{debt}`}
                        </Badge>
                        <Badge 
                          variant="secondary" 
                          className="cursor-pointer hover:bg-secondary/80"
                          onClick={() => setMessageTemplate(prev => prev + '{deuda}')}
                        >
                          {`{deuda}`}
                        </Badge>
                        <Badge 
                          variant="secondary" 
                          className="cursor-pointer hover:bg-secondary/80"
                          onClick={() => setMessageTemplate(prev => prev + '{phone}')}
                        >
                          {`{phone}`}
                        </Badge>
                        <Badge 
                          variant="secondary" 
                          className="cursor-pointer hover:bg-secondary/80"
                          onClick={() => setMessageTemplate(prev => prev + '{nombre_ejecutivo}')}
                        >
                          {`{nombre_ejecutivo}`}
                        </Badge>
                        <Badge 
                          variant="secondary" 
                          className="cursor-pointer hover:bg-secondary/80"
                          onClick={() => setMessageTemplate(prev => prev + '{fono_ejecutivo}')}
                        >
                          {`{fono_ejecutivo}`}
                        </Badge>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Rotación de mensajes</Label>
                      <Select
                        value={messageRotationStrategy}
                        onValueChange={(value) =>
                          setMessageRotationStrategy(value as "none" | "random" | "round_robin")
                        }
                      >
                        <SelectTrigger data-testid="select-message-rotation-strategy">
                          <SelectValue placeholder="Selecciona una estrategia" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin rotacion</SelectItem>
                          <SelectItem value="random">Aleatoria</SelectItem>
                          <SelectItem value="round_robin">Por turnos</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Si agregas variantes, se rotan según esta estrategia.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="variant-count">Cantidad de variantes</Label>
                      <Input
                        id="variant-count"
                        type="number"
                        min={0}
                        max={20}
                        value={messageVariantsCount}
                        onChange={(e) => handleVariantCountChange(e.target.value)}
                        data-testid="input-message-variants-count"
                      />
                      <p className="text-xs text-muted-foreground">
                        Selecciona cuantas variantes quieres y se mostrará una plantilla por cada una.
                      </p>
                    </div>

                    {Array.from({ length: messageVariantsCount }).map((_, index) => (
                      <div key={index} className="space-y-2">
                        <Label>{`Variante ${index + 1}`}</Label>
                        <Textarea
                          placeholder={`Plantilla variante ${index + 1} (usa {name}, {debt}, {phone})`}
                          className="h-24 resize-y text-sm"
                          value={messageVariantTemplates[index] ?? ""}
                          onChange={(e) => handleVariantTemplateChange(index, e.target.value)}
                          data-testid={`textarea-message-variant-${index + 1}`}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <DialogFooter className="flex justify-between sm:justify-between">
                {step > 1 ? (
                  <Button variant="ghost" onClick={() => setStep(step - 1)}>Atrás</Button>
                ) : (
                  <div></div>
                )}
                {step < 2 ? (
                  <Button
                    onClick={() => setStep(step + 1)}
                    disabled={
                      !campaignName ||
                      (requiresWhatsappPool && !selectedPoolId) ||
                      (requiresSmsPool && !selectedSmsPoolId)
                    }
                  >
                    Siguiente: mensaje
                  </Button>
                ) : (
                  <Button 
                    onClick={handleCreateCampaign} 
                    className="bg-primary text-white"
                    disabled={createCampaign.isPending || !messageTemplate}
                    data-testid="button-launch-campaign"
                  >
                    {createCampaign.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    Lanzar campaña
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {activeTab === "campaigns" ? (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="flex gap-4 items-center bg-card p-4 rounded-lg border shadow-sm">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar campañas..." className="pl-9 bg-background" />
              </div>
              <div className="h-8 w-[1px] bg-border mx-2" />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="h-9 border-dashed">
                  <Filter className="mr-2 h-4 w-4" />
                  Estado
                </Button>
                <Button variant="outline" size="sm" className="h-9 border-dashed">
                  <Calendar className="mr-2 h-4 w-4" />
                  Rango de fechas
                </Button>
              </div>
            </div>

            {campaignsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : !campaigns?.length ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mb-4 opacity-50" />
                <p>No se encontraron campañas</p>
                <p className="text-sm">Crea una nueva campaña para comenzar</p>
              </div>
            ) : campaigns?.map((campaign) => {
              const cooldown = cooldowns[campaign.id];
              const remainingMs = cooldown ? cooldown.endAt - cooldownNow : 0;
              const showCooldown = remainingMs > 0 && campaign.status === "active";
              const cooldownLabel =
                cooldown?.reason && cooldownLabelByReason[cooldown.reason]
                  ? cooldownLabelByReason[cooldown.reason]
                  : "En espera";

              return (
              <Card key={campaign.id} className="group overflow-hidden transition-all hover:shadow-md hover:border-primary/50" data-testid={`card-campaign-${campaign.id}`}>
                <div className="absolute top-0 left-0 w-1 h-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row gap-6 md:items-center justify-between">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-lg">{campaign.name}</h3>
                        <Badge variant={
                          campaign.status === 'active' ? 'default' : 
                          campaign.status === 'completed' ? 'secondary' : 'outline'
                        } className={
                          campaign.status === 'active' ? 'bg-primary text-primary-foreground hover:bg-primary/90' : ''
                        }>
                          {displayCampaignStatus(campaign.status)}
                        </Badge>
                        {showCooldown && (
                          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                            {cooldownLabel} {formatCooldown(remainingMs)}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          Iniciada {campaign.startedAt ? new Date(campaign.startedAt).toLocaleDateString() : 'No iniciada'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {campaign.totalDebtors.toLocaleString()} destinatarios
                        </span>
                         <span className="flex items-center gap-1">
                           <Zap className="h-3.5 w-3.5" />
                           Canal: {displayCampaignChannel(campaign.channel, campaign.fallbackSms)}
                         </span>
                         {campaign.poolId && (
                           <span className="flex items-center gap-1">
                             <Zap className="h-3.5 w-3.5" />
                             WA: {pools?.find((p) => p.id === campaign.poolId)?.name || "Sin pool WA"}
                           </span>
                         )}
                         {campaign.smsPoolId && (
                           <span className="flex items-center gap-1">
                             <Zap className="h-3.5 w-3.5" />
                             SMS: {gsmPools?.find((p) => p.id === campaign.smsPoolId)?.name || "Sin pool SMS"}
                           </span>
                         )}
                       </div>
                     </div>

                    <div className="flex-1 max-w-md space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Progreso</span>
                        <span className="font-medium">{campaign.progress}%</span>
                      </div>
                      <Progress value={campaign.progress} className="h-2" />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span className="text-green-600">{campaign.sent.toLocaleString()} enviados</span>
                        <span className="text-red-500">{campaign.failed} fallidos</span>
                      </div>
                      {showCooldown && (
                        <div className="text-xs text-amber-600">
                          {cooldownLabel === "Fuera de horario"
                            ? `Fuera de horario permitido. Reanudando en ${formatCooldown(remainingMs)}.`
                            : `Pausado por seguridad. Reanudando en ${formatCooldown(remainingMs)}.`}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {campaign.status === 'active' ? (
                        <Button 
                          variant="outline" 
                          size="icon" 
                          title="Pausar"
                          onClick={() => handlePauseCampaign(campaign.id)}
                          disabled={pauseCampaign.isPending}
                          data-testid={`button-pause-${campaign.id}`}
                        >
                          <Pause className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button 
                          variant="outline" 
                          size="icon" 
                          title="Iniciar"
                          onClick={() => handleStartCampaign(campaign.id)}
                          disabled={startCampaign.isPending || campaign.status === 'completed'}
                          data-testid={`button-start-${campaign.id}`}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                      )}
                      <Button 
                        variant="outline" 
                        size="icon" 
                        title="Eliminar"
                        onClick={() => handleDeleteCampaign(campaign.id)}
                        data-testid={`button-delete-${campaign.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Detalles"
                        onClick={() => handleOpenDetails(campaign)}
                      >
                        <BarChart className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )})}

            <Dialog
              open={isDetailsOpen}
              onOpenChange={(open) => {
                setIsDetailsOpen(open);
                if (!open) {
                  setDetailsCampaign(null);
                }
              }}
            >
              <DialogContent className="sm:max-w-[900px] max-h-[85vh] overflow-hidden flex flex-col">
                <DialogHeader>
                  <DialogTitle>Detalles de campaña</DialogTitle>
                  <DialogDescription>
                    {detailsCampaign?.name ?? "Selecciona una campaña para ver el detalle"}
                  </DialogDescription>
                </DialogHeader>

                {!detailsCampaign ? (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                    <BarChart className="h-10 w-10 mb-3 opacity-50" />
                    <p>No hay campaña seleccionada.</p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto pr-1 space-y-6">
                    <div className="grid gap-4 md:grid-cols-3">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Deudores</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-semibold">
                            {campaignDebtors.length || detailsCampaign.totalDebtors || 0}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Disponibles: {campaignDebtorCounts.disponible ?? 0} · Procesando:{" "}
                            {campaignDebtorCounts.procesando ?? 0} · Completados:{" "}
                            {campaignDebtorCounts.completado ?? 0} · Fallados:{" "}
                            {campaignDebtorCounts.fallado ?? 0}
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Mensajes</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-semibold">{campaignMessageList.length}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Enviados: {campaignMessageCounts.sent ?? 0} · Recibidos:{" "}
                            {campaignMessageCounts.received ?? 0} · Fallidos:{" "}
                            {campaignMessageCounts.failed ?? 0} · Pendientes:{" "}
                            {campaignMessageCounts.pending ?? 0}
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Progreso</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div className="text-2xl font-semibold">
                            {detailsCampaign.progress ?? 0}%
                          </div>
                          <Progress value={detailsCampaign.progress ?? 0} className="h-2" />
                          <div className="text-xs text-muted-foreground">
                            Enviados: {detailsCampaign.sent ?? 0} · Fallidos:{" "}
                            {detailsCampaign.failed ?? 0}
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Configuración</CardTitle>
                      </CardHeader>
                      <CardContent className="grid gap-4 md:grid-cols-2 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Canal</p>
                          <p>{displayCampaignChannel(detailsCampaign.channel, detailsCampaign.fallbackSms)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Estado</p>
                          <p>{displayCampaignStatus(detailsCampaign.status)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Pool WhatsApp</p>
                          <p>{detailsCampaign.poolId ? poolNameById.get(detailsCampaign.poolId) ?? detailsCampaign.poolId : "Sin pool"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Pool SMS</p>
                          <p>{detailsCampaign.smsPoolId ? gsmPoolNameById.get(detailsCampaign.smsPoolId) ?? detailsCampaign.smsPoolId : "Sin pool"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Rango de deudores</p>
                          <p>{formatRange(detailsCampaign.debtorRangeStart, detailsCampaign.debtorRangeEnd)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Creada</p>
                          <p>{detailsCampaign.createdAt ? new Date(detailsCampaign.createdAt).toLocaleString() : "-"}</p>
                        </div>
                      </CardContent>
                    </Card>

                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold">Mensajes</h3>
                        <p className="text-xs text-muted-foreground">
                          Historial de envíos y respuestas de la campaña.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          className="gap-2"
                          onClick={handleRetryFailedCampaign}
                          disabled={
                            retryFailedCampaign.isPending ||
                            (campaignDebtorCounts.fallado ?? 0) === 0
                          }
                        >
                          <RefreshCw className="h-4 w-4" />
                          Reintentar fallidos
                        </Button>
                        <Button
                          variant="outline"
                          className="gap-2"
                          onClick={handleExportCampaignDetails}
                          disabled={!detailsCampaign}
                        >
                          <Download className="h-4 w-4" />
                          Exportar Excel
                        </Button>
                      </div>
                    </div>

                    {campaignMessagesLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      </div>
                    ) : campaignMessageList.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                        No hay mensajes para esta campaña todavía.
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40">
                            <TableHead>Fecha</TableHead>
                            <TableHead>Deudor</TableHead>
                            <TableHead>Teléfono</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead>Canal</TableHead>
                            <TableHead>Mensaje</TableHead>
                            <TableHead>Error</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {campaignMessageList.map((message) => {
                            const debtor = message.debtorId ? debtorById.get(message.debtorId) : undefined;
                            const timestamp = message.sentAt ?? message.createdAt;
                            return (
                              <TableRow key={message.id}>
                                <TableCell className="text-xs text-muted-foreground">
                                  {timestamp ? new Date(timestamp).toLocaleString() : "-"}
                                </TableCell>
                                <TableCell className="font-medium">{debtor?.name ?? "-"}</TableCell>
                                <TableCell className="font-mono text-xs">
                                  {message.phone ?? debtor?.phone ?? "-"}
                                </TableCell>
                                <TableCell>{renderMessageStatus(message.status)}</TableCell>
                                <TableCell className="text-xs">{message.channel ?? "whatsapp"}</TableCell>
                                <TableCell className="max-w-[240px] truncate text-xs" title={message.content ?? ""}>
                                  {message.content ?? "-"}
                                </TableCell>
                                <TableCell className="max-w-[200px] truncate text-xs text-red-600" title={message.error ?? ""}>
                                  {message.error ?? "-"}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                )}

                <DialogFooter>
                  <Button variant="ghost" onClick={() => setIsDetailsOpen(false)}>
                    Cerrar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 animate-in fade-in duration-300">
             <div className="md:col-span-2 flex justify-end gap-2 flex-wrap">
                <Dialog open={isCreatePoolOpen} onOpenChange={setIsCreatePoolOpen}>
                  <DialogTrigger asChild>
                    <Button className="gap-2" data-testid="button-create-pool">
                      <Plus className="h-4 w-4" />
                      Crear pool
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                      <DialogTitle>Crear pool de ruteo</DialogTitle>
                      <DialogDescription>
                        Configura cómo se distribuyen los mensajes entre sesiones.
                      </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Nombre del pool</Label>
                        <Input 
                          placeholder="Ej: Pool de alta prioridad"
                          value={poolName}
                          onChange={(e) => setPoolName(e.target.value)}
                          data-testid="input-pool-name"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Estrategia de distribución</Label>
                        <Select value={poolStrategy} onValueChange={(v: any) => setPoolStrategy(v)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="competitive">Competitivo (el más rápido gana)</SelectItem>
                            <SelectItem value="fixed_turns">Turnos fijos (round-robin)</SelectItem>
                            <SelectItem value="random_turns">Turnos aleatorios</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <Label>Retardo base</Label>
                          <span className="text-muted-foreground">{poolDelayBase[0]}ms</span>
                        </div>
                        <Slider 
                          value={poolDelayBase} 
                          onValueChange={setPoolDelayBase}
                          max={30000} 
                          step={500} 
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <Label>Variación</Label>
                          <span className="text-muted-foreground">+/-{poolDelayVariation[0]}ms</span>
                        </div>
                        <Slider 
                          value={poolDelayVariation} 
                          onValueChange={setPoolDelayVariation}
                          max={10000} 
                          step={100} 
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Asignar sesiones</Label>
                        <div className="flex flex-wrap gap-2 p-3 bg-muted rounded-lg">
                          {sessions?.filter(s => s.status === 'connected').map(session => (
                            <Badge 
                              key={session.id}
                              variant={selectedSessionIds.includes(session.id) ? "default" : "outline"}
                              className="cursor-pointer"
                              onClick={() => toggleSessionInPool(session.id)}
                            >
                              {session.phoneNumber || session.id.slice(0, 8)}
                            </Badge>
                          ))}
                          {!sessions?.filter(s => s.status === 'connected').length && (
                            <p className="text-xs text-muted-foreground">No hay sesiones conectadas</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <DialogFooter>
                      <Button variant="ghost" onClick={() => setIsCreatePoolOpen(false)}>Cancelar</Button>
                      <Button 
                        onClick={handleCreatePool}
                        disabled={createPool.isPending || !poolName}
                        data-testid="button-save-pool"
                      >
                        {createPool.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                        Crear pool
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog
                  open={isCreateGsmLineOpen}
                  onOpenChange={(open) => {
                    setIsCreateGsmLineOpen(open);
                    if (!open) {
                      setGsmLineName("");
                      setGsmLineUrlTemplate("");
                      setGsmLineActive(true);
                    }
                  }}
                >
                  <DialogTrigger asChild>
                    <Button variant="outline" className="gap-2" data-testid="button-create-gsm-line">
                      <Plus className="h-4 w-4" />
                      Crear línea GSM
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[560px]">
                    <DialogHeader>
                      <DialogTitle>Crear línea GSM</DialogTitle>
                      <DialogDescription>
                        Define la URL de tu gateway SMS. Si el endpoint es /send-sms o raíz (/),
                        puedes pegar la URL directa.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Nombre</Label>
                        <Input
                          placeholder="Ej: GOIP oficina"
                          value={gsmLineName}
                          onChange={(e) => setGsmLineName(e.target.value)}
                          data-testid="input-gsm-line-name"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>URL template</Label>
                        <Textarea
                          className="h-28 resize-y font-mono text-xs"
                          placeholder="http://192.168.1.85:8082/"
                          value={gsmLineUrlTemplate}
                          onChange={(e) => setGsmLineUrlTemplate(e.target.value)}
                          data-testid="textarea-gsm-line-template"
                        />
                        <p className="text-xs text-muted-foreground">
                          Usa {"{phone}"} y {"{message}"} (encoded). También puedes usar {"{phone_raw}"} y {"{message_raw}"}.
                          Si la URL no tiene tokens y contiene send-sms (o ?method=post), enviamos POST JSON {"{ phone, message }"}.
                          Si la URL es raíz (/), enviamos POST JSON {"{ to, message }"}.
                          Si tu gateway requiere Bearer token, configura SMS_GATE_LOCAL_TOKEN en el servidor.
                          Si NO requiere token, agrega ?auth=none a la URL.
                          Si el token va en el body, usa ?auth=body&tokenKey=token (o el nombre que corresponda).
                          Infobip: usa infobip://api.infobip.com/sms/2/text/advanced?from=MiMarca&auth=apikey
                          (o infobip+basic://...). Configura INFOBIP_* en el servidor.
                        </p>
                      </div>

                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <Label className="text-sm">Activa</Label>
                          <p className="text-xs text-muted-foreground">
                            Si está inactiva, no se usará en campañas.
                          </p>
                        </div>
                        <Switch checked={gsmLineActive} onCheckedChange={setGsmLineActive} />
                      </div>
                    </div>

                    <DialogFooter>
                      <Button variant="ghost" onClick={() => setIsCreateGsmLineOpen(false)}>
                        Cancelar
                      </Button>
                      <Button onClick={handleCreateGsmLine} disabled={createGsmLine.isPending}>
                        {createGsmLine.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : null}
                        Crear línea
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog
                  open={isCreateInfobipLineOpen}
                  onOpenChange={(open) => {
                    setIsCreateInfobipLineOpen(open);
                    if (!open) {
                      setInfobipLineName("Infobip");
                      setInfobipBaseUrl("");
                      setInfobipEndpoint("sms/2/text/advanced");
                      setInfobipSender("");
                      setInfobipAuthType("apikey");
                      setInfobipApiKey("");
                      setInfobipUsername("");
                      setInfobipPassword("");
                      setInfobipToken("");
                      setInfobipLineActive(true);
                    }
                  }}
                >
                  <DialogTrigger asChild>
                    <Button variant="outline" className="gap-2" data-testid="button-create-infobip-line">
                      <Zap className="h-4 w-4" />
                      Configurar Infobip
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[620px]">
                    <DialogHeader>
                      <DialogTitle>Configurar Infobip</DialogTitle>
                      <DialogDescription>
                        Crea una línea SMS lista para Infobip. El token se guardará en la URL de la línea.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Nombre</Label>
                        <Input
                          placeholder="Ej: Infobip principal"
                          value={infobipLineName}
                          onChange={(e) => setInfobipLineName(e.target.value)}
                        />
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>URL base</Label>
                          <Input
                            placeholder="ndz6pe.api.infobip.com"
                            value={infobipBaseUrl}
                            onChange={(e) => setInfobipBaseUrl(e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground">
                            Solo el dominio, sin https://
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label>Endpoint</Label>
                          <Input
                            placeholder="sms/2/text/advanced"
                            value={infobipEndpoint}
                            onChange={(e) => setInfobipEndpoint(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Sender (from)</Label>
                        <Input
                          placeholder="MiMarca"
                          value={infobipSender}
                          onChange={(e) => setInfobipSender(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Debe estar aprobado en tu cuenta Infobip.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label>Autenticación</Label>
                        <Select
                          value={infobipAuthType}
                          onValueChange={(value) =>
                            setInfobipAuthType(value as "apikey" | "basic" | "ibsso" | "oauth")
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="apikey">API Key (App)</SelectItem>
                            <SelectItem value="basic">Basic</SelectItem>
                            <SelectItem value="ibsso">IBSSO</SelectItem>
                            <SelectItem value="oauth">OAuth 2.0</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {infobipAuthType === "basic" ? (
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Username</Label>
                            <Input
                              value={infobipUsername}
                              onChange={(e) => setInfobipUsername(e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Password</Label>
                            <Input
                              type="password"
                              value={infobipPassword}
                              onChange={(e) => setInfobipPassword(e.target.value)}
                            />
                          </div>
                        </div>
                      ) : infobipAuthType === "apikey" ? (
                        <div className="space-y-2">
                          <Label>API key</Label>
                          <Input
                            type="password"
                            value={infobipApiKey}
                            onChange={(e) => setInfobipApiKey(e.target.value)}
                          />
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Label>Token</Label>
                          <Input
                            type="password"
                            value={infobipToken}
                            onChange={(e) => setInfobipToken(e.target.value)}
                          />
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label>Vista previa (enmascarada)</Label>
                        <div className="rounded-md bg-muted p-2">
                          <p className="text-[11px] font-mono break-all text-muted-foreground">
                            {buildInfobipTemplate(true) || "Completa los campos para ver el template"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <Label className="text-sm">Activa</Label>
                          <p className="text-xs text-muted-foreground">
                            Si está inactiva, no se usará en campañas.
                          </p>
                        </div>
                        <Switch checked={infobipLineActive} onCheckedChange={setInfobipLineActive} />
                      </div>
                    </div>

                    <DialogFooter>
                      <Button variant="ghost" onClick={() => setIsCreateInfobipLineOpen(false)}>
                        Cancelar
                      </Button>
                      <Button onClick={handleCreateInfobipLine} disabled={createGsmLine.isPending}>
                        {createGsmLine.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : null}
                        Crear línea Infobip
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog
                  open={isCreateGsmPoolOpen}
                  onOpenChange={(open) => {
                    setIsCreateGsmPoolOpen(open);
                    if (!open) {
                      setGsmPoolName("");
                      setGsmPoolStrategy("fixed_turns");
                      setGsmPoolDelayBase([3000]);
                      setGsmPoolDelayVariation([1000]);
                      setSelectedGsmLineIds([]);
                    }
                  }}
                >
                  <DialogTrigger asChild>
                    <Button variant="outline" className="gap-2" data-testid="button-create-gsm-pool">
                      <Plus className="h-4 w-4" />
                      Crear pool SMS
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[520px]">
                    <DialogHeader>
                      <DialogTitle>Crear pool SMS</DialogTitle>
                      <DialogDescription>
                        Configura cómo se distribuyen los SMS entre tus líneas GSM.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Nombre del pool</Label>
                        <Input
                          placeholder="Ej: SMS principal"
                          value={gsmPoolName}
                          onChange={(e) => setGsmPoolName(e.target.value)}
                          data-testid="input-gsm-pool-name"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Estrategia de distribución</Label>
                        <Select value={gsmPoolStrategy} onValueChange={(value) => setGsmPoolStrategy(value as "fixed_turns" | "random_turns")}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="fixed_turns">Turnos fijos (round-robin)</SelectItem>
                            <SelectItem value="random_turns">Turnos aleatorios</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <Label>Retardo base</Label>
                          <span className="text-muted-foreground">{gsmPoolDelayBase[0]}ms</span>
                        </div>
                        <Slider
                          value={gsmPoolDelayBase}
                          onValueChange={setGsmPoolDelayBase}
                          max={30000}
                          step={500}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <Label>Variación</Label>
                          <span className="text-muted-foreground">+/-{gsmPoolDelayVariation[0]}ms</span>
                        </div>
                        <Slider
                          value={gsmPoolDelayVariation}
                          onValueChange={setGsmPoolDelayVariation}
                          max={10000}
                          step={100}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Asignar líneas GSM</Label>
                        <div className="flex flex-wrap gap-2 rounded-lg bg-muted p-3">
                          {gsmLines?.filter((line) => line.active).map((line) => (
                            <Badge
                              key={line.id}
                              variant={selectedGsmLineIds.includes(line.id) ? "default" : "outline"}
                              className="cursor-pointer"
                              onClick={() => toggleGsmLineInPool(line.id)}
                            >
                              {line.name}
                            </Badge>
                          ))}
                          {!gsmLines?.filter((line) => line.active).length && (
                            <p className="text-xs text-muted-foreground">No hay líneas GSM activas</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <DialogFooter>
                      <Button variant="ghost" onClick={() => setIsCreateGsmPoolOpen(false)}>
                        Cancelar
                      </Button>
                      <Button onClick={handleCreateGsmPool} disabled={createGsmPool.isPending || !gsmPoolName}>
                        {createGsmPool.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : null}
                        Crear pool SMS
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog open={isEditPoolOpen} onOpenChange={(open) => {
                  setIsEditPoolOpen(open);
                  if (!open) {
                    setEditingPool(null);
                    setPoolName("");
                    setPoolStrategy("competitive");
                    setPoolDelayBase([5000]);
                    setPoolDelayVariation([1000]);
                    setSelectedSessionIds([]);
                  }
                }}>
                  <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                      <DialogTitle>Editar Pool</DialogTitle>
                      <DialogDescription>
                        Modifica la configuración del pool de enrutamiento.
                      </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Nombre del pool</Label>
                        <Input 
                          placeholder="Ej: Pool de alta prioridad"
                          value={poolName}
                          onChange={(e) => setPoolName(e.target.value)}
                          data-testid="input-edit-pool-name"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Estrategia de distribución</Label>
                        <Select value={poolStrategy} onValueChange={(v: any) => setPoolStrategy(v)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="competitive">Competitivo (el más rápido gana)</SelectItem>
                            <SelectItem value="fixed_turns">Turnos fijos (round-robin)</SelectItem>
                            <SelectItem value="random_turns">Turnos aleatorios</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <Label>Retardo base</Label>
                          <span className="text-muted-foreground">{poolDelayBase[0]}ms</span>
                        </div>
                        <Slider 
                          value={poolDelayBase} 
                          onValueChange={setPoolDelayBase}
                          max={30000} 
                          step={500} 
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <Label>Variación</Label>
                          <span className="text-muted-foreground">+/-{poolDelayVariation[0]}ms</span>
                        </div>
                        <Slider 
                          value={poolDelayVariation} 
                          onValueChange={setPoolDelayVariation}
                          max={10000} 
                          step={100} 
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Asignar sesiones</Label>
                        <div className="flex flex-wrap gap-2 p-3 bg-muted rounded-lg">
                          {sessions?.filter(s => s.status === 'connected').map(session => (
                            <Badge 
                              key={session.id}
                              variant={selectedSessionIds.includes(session.id) ? "default" : "outline"}
                              className="cursor-pointer"
                              onClick={() => toggleSessionInPool(session.id)}
                            >
                              {session.phoneNumber || session.id.slice(0, 8)}
                            </Badge>
                          ))}
                          {!sessions?.filter(s => s.status === 'connected').length && (
                            <p className="text-xs text-muted-foreground">No hay sesiones conectadas</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <DialogFooter>
                      <Button variant="ghost" onClick={() => setIsEditPoolOpen(false)}>Cancelar</Button>
                      <Button 
                        onClick={handleUpdatePool}
                        disabled={updatePool.isPending || !poolName}
                        data-testid="button-update-pool"
                      >
                        {updatePool.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                        Guardar cambios
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
             </div>
             
             {poolsLoading && (
               <div className="md:col-span-2 flex items-center justify-center py-12">
                 <Loader2 className="h-8 w-8 animate-spin text-primary" />
               </div>
             )}
             {!poolsLoading && !pools?.length && (
               <div className="md:col-span-2 flex flex-col items-center justify-center py-12 text-muted-foreground">
                 <Settings className="h-12 w-12 mb-4 opacity-50" />
                 <p>No hay pools configurados</p>
                 <p className="text-sm">Crea un pool para comenzar a rutear mensajes</p>
               </div>
             )}
             {!poolsLoading && pools?.map((pool) => (
                <Card key={pool.id} className="border-l-4 border-l-primary" data-testid={`card-pool-${pool.id}`}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle>{pool.name}</CardTitle>
                        <CardDescription className="mt-1 flex items-center gap-2">
                          <Badge variant="secondary">{displayPoolStrategy(pool.strategy)}</Badge>
                          <span className="text-xs">{pool.sessionIds?.length || 0} sesiones asignadas</span>
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleEditPool(pool)}
                          data-testid={`button-edit-pool-${pool.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleDeletePool(pool.id)}
                          data-testid={`button-delete-pool-${pool.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                     <div className="space-y-2">
                       <div className="flex justify-between text-sm">
                         <Label>Retardo base</Label>
                         <span className="text-muted-foreground">{pool.delayBase}ms</span>
                       </div>
                       <Slider value={[pool.delayBase]} max={30000} step={100} disabled />
                     </div>
                     
                     <div className="space-y-2">
                       <div className="flex justify-between text-sm">
                         <Label>Variación</Label>
                         <span className="text-muted-foreground">+/-{pool.delayVariation}ms</span>
                       </div>
                       <Slider value={[pool.delayVariation]} max={5000} step={100} disabled />
                     </div>

                     <div className="pt-2">
                       <Label className="text-sm mb-2 block">Sesiones asignadas</Label>
                       <div className="flex flex-wrap gap-2">
                         {pool.sessionIds?.map(sid => {
                           const session = sessions?.find(s => s.id === sid);
                           return (
                             <Badge key={sid} variant="outline" className="bg-background">
                               {session?.phoneNumber || sid.slice(0,8)}
                             </Badge>
                           );
                         })}
                         {!pool.sessionIds?.length && (
                           <span className="text-xs text-muted-foreground">Sin sesiones asignadas</span>
                         )}
                       </div>
                     </div>
                  </CardContent>
                </Card>
              ))}

             <div className="md:col-span-2 pt-4">
               <div className="flex items-center justify-between">
                 <div>
                   <h2 className="text-lg font-semibold">SMS (GSM)</h2>
                   <p className="text-sm text-muted-foreground">
                     Administra tus líneas GSM y pools de SMS para rotación y fallback.
                   </p>
                 </div>
               </div>
             </div>

             <div className="md:col-span-2">
               <h3 className="text-sm font-medium text-muted-foreground mb-2">Líneas GSM</h3>
             </div>
             {!gsmLines?.length ? (
               <div className="md:col-span-2 flex flex-col items-center justify-center py-8 text-muted-foreground">
                 <Settings className="h-10 w-10 mb-3 opacity-50" />
                 <p>No hay líneas GSM configuradas</p>
                 <p className="text-sm">Crea una línea GSM para enviar SMS</p>
               </div>
             ) : (
               gsmLines.map((line) => (
                 <Card key={line.id} className="border-l-4 border-l-emerald-500" data-testid={`card-gsm-line-${line.id}`}>
                   <CardHeader>
                     <div className="flex items-start justify-between gap-3">
                       <div>
                         <CardTitle className="text-base">{line.name}</CardTitle>
                         <CardDescription className="mt-1 flex items-center gap-2">
                           <Badge variant={line.active ? "default" : "outline"}>
                             {line.active ? "Activa" : "Inactiva"}
                           </Badge>
                           <span className="text-xs text-muted-foreground">
                             Estado: {line.status}
                           </span>
                         </CardDescription>
                       </div>
                       <Button
                         variant="ghost"
                         size="icon"
                         onClick={() => handleDeleteGsmLine(line.id)}
                         data-testid={`button-delete-gsm-line-${line.id}`}
                       >
                         <Trash2 className="h-4 w-4 text-destructive" />
                       </Button>
                     </div>
                   </CardHeader>
                   <CardContent className="space-y-2">
                     <div className="rounded-md bg-muted p-2">
                       <p className="text-[11px] font-mono break-all text-muted-foreground">
                         {line.urlTemplate}
                       </p>
                     </div>
                     <p className="text-xs text-muted-foreground">
                       Último uso: {line.lastUsedAt ? new Date(line.lastUsedAt).toLocaleString() : "Nunca"}
                     </p>
                   </CardContent>
                 </Card>
               ))
             )}

             <div className="md:col-span-2 pt-2">
               <h3 className="text-sm font-medium text-muted-foreground mb-2">Pools SMS</h3>
             </div>
             {!gsmPools?.length ? (
               <div className="md:col-span-2 flex flex-col items-center justify-center py-8 text-muted-foreground">
                 <Settings className="h-10 w-10 mb-3 opacity-50" />
                 <p>No hay pools SMS configurados</p>
                 <p className="text-sm">Crea un pool SMS para rotar tus líneas GSM</p>
               </div>
             ) : (
               gsmPools.map((pool) => (
                 <Card key={pool.id} className="border-l-4 border-l-emerald-600" data-testid={`card-gsm-pool-${pool.id}`}>
                   <CardHeader>
                     <div className="flex items-start justify-between gap-3">
                       <div>
                         <CardTitle className="text-base">{pool.name}</CardTitle>
                         <CardDescription className="mt-1 flex items-center gap-2">
                           <Badge variant="secondary">{displayPoolStrategy(pool.strategy)}</Badge>
                           <span className="text-xs text-muted-foreground">
                             {pool.lineIds?.length || 0} líneas asignadas
                           </span>
                         </CardDescription>
                       </div>
                       <Button
                         variant="ghost"
                         size="icon"
                         onClick={() => handleDeleteGsmPool(pool.id)}
                         data-testid={`button-delete-gsm-pool-${pool.id}`}
                       >
                         <Trash2 className="h-4 w-4 text-destructive" />
                       </Button>
                     </div>
                   </CardHeader>
                   <CardContent className="space-y-4">
                     <div className="space-y-2">
                       <div className="flex justify-between text-sm">
                         <Label>Retardo base</Label>
                         <span className="text-muted-foreground">{pool.delayBase}ms</span>
                       </div>
                       <Slider value={[pool.delayBase]} max={30000} step={100} disabled />
                     </div>

                     <div className="space-y-2">
                       <div className="flex justify-between text-sm">
                         <Label>Variación</Label>
                         <span className="text-muted-foreground">+/-{pool.delayVariation}ms</span>
                       </div>
                       <Slider value={[pool.delayVariation]} max={10000} step={100} disabled />
                     </div>

                     <div className="pt-2">
                       <Label className="mb-2 block text-sm">Líneas asignadas</Label>
                       <div className="flex flex-wrap gap-2">
                         {pool.lineIds?.map((lineId) => {
                           const line = gsmLines?.find((l) => l.id === lineId);
                           return (
                             <Badge key={lineId} variant="outline" className="bg-background">
                               {line?.name || lineId.slice(0, 8)}
                             </Badge>
                           );
                         })}
                         {!pool.lineIds?.length && (
                           <span className="text-xs text-muted-foreground">Sin líneas asignadas</span>
                         )}
                       </div>
                     </div>
                   </CardContent>
                 </Card>
               ))
             )}
           </div>
        )}
      </div>
    </Layout>
  );
}



