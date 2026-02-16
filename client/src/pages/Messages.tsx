import Layout from "@/components/layout/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Search,
  Send,
  MoreVertical,
  Phone,
  MessageSquare,
  Loader2,
  Archive,
  ArchiveRestore,
  CheckCheck,
  Mail,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useArchiveConversation,
  useAuthMe,
  useContacts,
  useDebtors,
  useDeleteConversation,
  useMarkConversationRead,
  useMessages,
  useSendMessage,
  useSessions,
} from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import type { Contact, Debtor, Message } from "@shared/schema";

export default function Messages() {
  const MANUAL_SEND_SESSION_STORAGE_KEY = "messages:preferred-session-id";
  const { data: user } = useAuthMe();
  const canManualSend = user?.role === "admin" || user?.role === "supervisor";
  const { data: messages, isLoading: messagesLoading } = useMessages();
  const { data: debtors } = useDebtors();
  const { data: contacts } = useContacts();
  const { data: sessions } = useSessions(canManualSend);
  const sendMessage = useSendMessage();
  const markConversationRead = useMarkConversationRead();
  const archiveConversation = useArchiveConversation();
  const deleteConversation = useDeleteConversation();
  const [selectedConversationKey, setSelectedConversationKey] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [readFilter, setReadFilter] = useState<"all" | "unread" | "read">("all");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showContactInfo, setShowContactInfo] = useState(false);
  const [groupFilter, setGroupFilter] = useState<"all" | "groups" | "individual">("all");
  const [knownFilter, setKnownFilter] = useState<"all" | "known" | "unknown">("all");
  const [failedFilter, setFailedFilter] = useState<"all" | "failed">("all");
  const [directionFilter, setDirectionFilter] = useState<"all" | "received" | "sent">("all");
  const [channelFilter, setChannelFilter] = useState<"all" | "whatsapp" | "sms">("all");
  const [sessionFilter, setSessionFilter] = useState<string>("all");
  const lastViewedMessageTimes = useRef(new Map<string, number>());

  const connectedSessions = sessions?.filter(s => s.status === 'connected') || [];
  const connectedSessionIdSet = useMemo(
    () => new Set(connectedSessions.map((session) => session.id)),
    [connectedSessions]
  );

  useEffect(() => {
    if (!canManualSend) return;
    if (selectedSessionId) return;

    try {
      const stored =
        typeof window !== "undefined"
          ? window.localStorage.getItem(MANUAL_SEND_SESSION_STORAGE_KEY)
          : null;
      if (stored && connectedSessionIdSet.has(stored)) {
        setSelectedSessionId(stored);
        return;
      }
    } catch {
      // ignore storage failures
    }

    if (connectedSessions.length === 1) {
      setSelectedSessionId(connectedSessions[0].id);
    }
  }, [
    canManualSend,
    connectedSessionIdSet,
    connectedSessions,
    selectedSessionId,
  ]);

  const formatSendError = (error: any): string | null => {
    const data = error?.response?.data;
    const code = data?.error;
    if (code === "blocked") {
      return "Sesión bloqueada por política de salud. Detén el envío y revisa la sesión.";
    }
    if (code === "cooldown") {
      const until = data?.cooldownUntil ? new Date(data.cooldownUntil) : null;
      return until && !Number.isNaN(until.getTime())
        ? `Sesión en cooldown hasta ${until.toLocaleString()}.`
        : "Sesión en cooldown temporal. Intenta más tarde.";
    }
    if (code === "rate_limited") {
      const retryAfterMs = Number(data?.retryAfterMs ?? 0);
      const seconds = retryAfterMs > 0 ? Math.ceil(retryAfterMs / 1000) : null;
      const scope = data?.limitScope ? String(data.limitScope) : null;
      const suffix = seconds ? ` Reintenta en ~${seconds}s.` : "";
      const scopeLabel =
        scope === "minute" ? "por minuto" : scope === "hour" ? "por hora" : scope === "day" ? "por día" : null;
      return `Rate limit ${scopeLabel ?? ""}.`.trim() + suffix;
    }
    return null;
  };

  const normalizePhoneDigits = (value?: string | null) =>
    (value ?? "").replace(/\D/g, "");

  const normalizeConversationKey = (value?: string | null) => {
    const raw = (value ?? "").trim();
    if (!raw) return "";
    const lower = raw.toLowerCase();
    if (/@(lid|g\.us|broadcast)$/i.test(lower)) {
      return lower;
    }
    const digits = normalizePhoneDigits(raw);
    return digits || lower;
  };

  const debtorByPhone = useMemo(() => {
    const byFull = new Map<string, Debtor>();
    const bySuffix8 = new Map<string, Debtor>();
    const bySuffix9 = new Map<string, Debtor>();

    for (const debtor of debtors ?? []) {
      const digits = normalizePhoneDigits(debtor.phone);
      if (!digits) continue;
      byFull.set(digits, debtor);
      if (digits.length >= 8) {
        const suffix8 = digits.slice(-8);
        if (!bySuffix8.has(suffix8)) {
          bySuffix8.set(suffix8, debtor);
        }
      }
      if (digits.length >= 9) {
        const suffix9 = digits.slice(-9);
        if (!bySuffix9.has(suffix9)) {
          bySuffix9.set(suffix9, debtor);
        }
      }
    }

    return { byFull, bySuffix8, bySuffix9 };
  }, [debtors]);

  const debtorById = useMemo(() => {
    const map = new Map<string, Debtor>();
    for (const debtor of debtors ?? []) {
      map.set(debtor.id, debtor);
    }
    return map;
  }, [debtors]);

  const contactByPhone = useMemo(() => {
    const byFull = new Map<string, Contact>();
    const bySuffix8 = new Map<string, Contact>();
    const bySuffix9 = new Map<string, Contact>();

    for (const contact of contacts ?? []) {
      const digits = normalizePhoneDigits(contact.phone);
      if (!digits) continue;
      byFull.set(digits, contact);
      if (digits.length >= 8) {
        const suffix8 = digits.slice(-8);
        if (!bySuffix8.has(suffix8)) {
          bySuffix8.set(suffix8, contact);
        }
      }
      if (digits.length >= 9) {
        const suffix9 = digits.slice(-9);
        if (!bySuffix9.has(suffix9)) {
          bySuffix9.set(suffix9, contact);
        }
      }
    }

    return { byFull, bySuffix8, bySuffix9 };
  }, [contacts]);

  const findDebtorByPhone = (rawPhone: string) => {
    const digits = normalizePhoneDigits(rawPhone);
    if (!digits) return undefined;
    const direct = debtorByPhone.byFull.get(digits);
    if (direct) return direct;
    const suffix9 = digits.length >= 9 ? digits.slice(-9) : "";
    if (suffix9) {
      const match9 = debtorByPhone.bySuffix9.get(suffix9);
      if (match9) return match9;
    }
    const suffix8 = digits.length >= 8 ? digits.slice(-8) : "";
    if (suffix8) {
      return debtorByPhone.bySuffix8.get(suffix8);
    }
    return undefined;
  };

  const findContactByPhone = (rawPhone: string) => {
    const digits = normalizePhoneDigits(rawPhone);
    if (!digits) return undefined;
    const direct = contactByPhone.byFull.get(digits);
    if (direct) return direct;
    const suffix9 = digits.length >= 9 ? digits.slice(-9) : "";
    if (suffix9) {
      const match9 = contactByPhone.bySuffix9.get(suffix9);
      if (match9) return match9;
    }
    const suffix8 = digits.length >= 8 ? digits.slice(-8) : "";
    if (suffix8) {
      return contactByPhone.bySuffix8.get(suffix8);
    }
    return undefined;
  };

  const getMessageTime = (message: Message) => {
    const value = message.sentAt ?? message.createdAt ?? message.updatedAt;
    return value ? new Date(value).getTime() : 0;
  };

  type Conversation = {
    key: string;
    phone: string;
    debtor?: Debtor;
    contact?: Contact;
    messages: Message[];
    lastMessage?: Message;
    lastMessageTime: number;
    unreadCount: number;
    archived: boolean;
    isGroup: boolean;
    hasFailed: boolean;
    hasIncoming: boolean;
    hasOutgoing: boolean;
    hasWhatsApp: boolean;
    hasSms: boolean;
    lastMessageChannel?: string;
    lastMessageSessionId?: string | null;
    lastMessageIncoming?: boolean;
  };

  const conversations = useMemo(() => {
    const byPhone = new Map<string, Conversation>();

    for (const message of messages ?? []) {
      const rawPhone = message.phone ?? "";
      const isGroupConversation = /@g\.us$/i.test(rawPhone);
      const normalizedMessagePhone = normalizePhoneDigits(message.phoneNormalized ?? null);
      const fallbackConversationKey = normalizeConversationKey(rawPhone);
      const hasNonPhoneId = /@(lid|g\.us|broadcast)$/i.test(rawPhone);
      const phoneDigits =
        normalizedMessagePhone || (hasNonPhoneId ? "" : normalizePhoneDigits(rawPhone));
      const debtorFromMessage = message.debtorId
        ? debtorById.get(message.debtorId)
        : undefined;
      const debtor = debtorFromMessage ?? (phoneDigits ? findDebtorByPhone(phoneDigits) : undefined);
      const normalizedDebtorPhone = debtor ? normalizePhoneDigits(debtor.phone) : "";
      const phoneKey =
        !isGroupConversation && normalizedDebtorPhone
          ? normalizedDebtorPhone
          : !isGroupConversation && normalizedMessagePhone
          ? normalizedMessagePhone
          : fallbackConversationKey;
      if (!phoneKey) continue;

      const contact = phoneDigits ? findContactByPhone(phoneDigits) : undefined;
      const existing = byPhone.get(phoneKey);
      const channel = (message.channel ?? "whatsapp").toLowerCase();
      const isIncoming = message.status === "received";
      const isFailed = message.status === "failed";
      const isGroup = isGroupConversation || /@g\.us$/i.test(phoneKey);

      const conversation: Conversation =
        existing ?? {
          key: phoneKey,
          phone: debtor?.phone ?? contact?.phone ?? (phoneDigits || message.phone || phoneKey),
          debtor,
          contact,
          messages: [],
          lastMessage: undefined,
          lastMessageTime: 0,
          unreadCount: 0,
          archived: false,
          isGroup,
          hasFailed: false,
          hasIncoming: false,
          hasOutgoing: false,
          hasWhatsApp: false,
          hasSms: false,
          lastMessageChannel: undefined,
          lastMessageSessionId: undefined,
          lastMessageIncoming: undefined,
        };

      conversation.messages.push(message);
      if (isGroup) {
        conversation.isGroup = true;
      }
      if (isFailed) {
        conversation.hasFailed = true;
      }
      if (isIncoming) {
        conversation.hasIncoming = true;
      } else {
        conversation.hasOutgoing = true;
      }
      if (channel === "sms") {
        conversation.hasSms = true;
      } else {
        conversation.hasWhatsApp = true;
      }

      if (message.status === "received" && !message.readAt) {
        conversation.unreadCount += 1;
      }

      if (message.archived) {
        conversation.archived = true;
      }

      if (!conversation.debtor && debtor) {
        conversation.debtor = debtor;
        conversation.phone = debtor.phone;
      }
      if (!conversation.contact && contact) {
        conversation.contact = contact;
        if (!conversation.debtor && contact.phone) {
          conversation.phone = contact.phone;
        }
      }

      const currentTime = getMessageTime(message);
      if (!conversation.lastMessage || currentTime >= conversation.lastMessageTime) {
        conversation.lastMessage = message;
        conversation.lastMessageTime = currentTime;
        conversation.lastMessageChannel = channel;
        conversation.lastMessageSessionId = message.sessionId ?? null;
        conversation.lastMessageIncoming = isIncoming;
      }

      byPhone.set(phoneKey, conversation);
    }

    const list = Array.from(byPhone.values());
    list.sort((a, b) => b.lastMessageTime - a.lastMessageTime);
    return list;
  }, [messages, debtorByPhone, contactByPhone]);

  const archivedCount = conversations.filter((c) => c.archived).length;
  const activeCount = conversations.length - archivedCount;
  const unreadConversationCount = conversations.filter((c) => c.unreadCount > 0 && !c.archived).length;

  const filteredConversations = useMemo(() => {
    return conversations.filter((conversation) => {
      if (showArchived) {
        if (!conversation.archived) return false;
      } else if (conversation.archived) {
        return false;
      }

      const isUnread = conversation.unreadCount > 0;
      if (readFilter === "unread" && !isUnread) return false;
      if (readFilter === "read" && isUnread) return false;
      if (groupFilter === "groups" && !conversation.isGroup) return false;
      if (groupFilter === "individual" && conversation.isGroup) return false;
      if (knownFilter === "known" && !conversation.debtor) return false;
      if (knownFilter === "unknown" && conversation.debtor) return false;
      if (failedFilter === "failed" && !conversation.hasFailed) return false;
      if (directionFilter === "received" && !conversation.lastMessageIncoming) return false;
      if (directionFilter === "sent" && conversation.lastMessageIncoming) return false;
      if (channelFilter !== "all") {
        const lastChannel = conversation.lastMessageChannel ?? "whatsapp";
        if (lastChannel !== channelFilter) return false;
      }
      if (sessionFilter !== "all") {
        if ((conversation.lastMessageSessionId ?? "") !== sessionFilter) return false;
      }
      return true;
    });
  }, [
    channelFilter,
    conversations,
    directionFilter,
    failedFilter,
    groupFilter,
    knownFilter,
    readFilter,
    sessionFilter,
    showArchived,
  ]);

  const selectedConversation =
    conversations.find((c) => c.key === selectedConversationKey) ?? null;

  const selectedDebtor = selectedConversation?.debtor;
  const selectedContact = selectedConversation?.contact;

  const selectedMessages = useMemo(() => {
    if (!selectedConversation) return [];
    const sorted = [...selectedConversation.messages];
    sorted.sort((a, b) => getMessageTime(a) - getMessageTime(b));
    return sorted;
  }, [selectedConversation]);

  const selectedDisplayName =
    selectedDebtor?.name ?? selectedContact?.name ?? selectedConversation?.phone ?? "";
  const selectedPhone =
    selectedDebtor?.phone ??
    selectedContact?.phone ??
    selectedConversation?.phone ??
    selectedConversation?.key ??
    "";
  const selectedAvatarText = (selectedDisplayName || selectedPhone).slice(0, 2).toUpperCase();
  const selectedExecutiveName =
    selectedDebtor?.metadata?.nombre_ejecutivo ??
    selectedDebtor?.metadata?.nombreejecutivo ??
    selectedContact?.executiveName ??
    "";
  const selectedExecutivePhone =
    selectedDebtor?.metadata?.fono_ejecutivo ??
    selectedDebtor?.metadata?.fonoejecutivo ??
    selectedContact?.executivePhone ??
    "";
  const selectedExecutiveRut =
    selectedDebtor?.metadata?.rut_ejecutivo ??
    selectedDebtor?.metadata?.rutejecutivo ??
    selectedContact?.executiveRut ??
    "";
  const selectedRut =
    selectedDebtor?.rut ??
    selectedDebtor?.metadata?.rut ??
    selectedContact?.rut ??
    "";

  const formatMessageTimestamp = (message: Message) => {
    const value = message.sentAt ?? message.createdAt ?? message.updatedAt;
    const date = value ? new Date(value) : new Date();
    return date.toLocaleString("es-CL", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatMessageMeta = (message: Message) => {
    const parts: string[] = [];
    const status = (message.status ?? "sent").toLowerCase();
    const isIncoming = status === "received";

    if (message.editedAt) {
      parts.push("Editado");
    }

    if (status === "failed") {
      parts.push("Fallido");
      return parts.join(" • ");
    }

    if (!isIncoming) {
      if (message.readAt) {
        parts.push("Leído");
      } else if (message.deliveredAt) {
        parts.push("Entregado");
      } else if (status === "sent") {
        parts.push("Enviado");
      } else if (status === "pending") {
        parts.push("Pendiente");
      }
    }

    return parts.join(" • ");
  };

  const formatStatusLabel = (status?: string) => {
    const normalized = (status ?? "sent").toLowerCase();
    if (normalized === "sent") return "ENVIADO";
    if (normalized === "failed") return "FALLIDO";
    if (normalized === "received") return "RECIBIDO";
    if (normalized === "pending") return "PENDIENTE";
    if (normalized === "delivered") return "ENTREGADO";
    return normalized.toUpperCase();
  };

  const formatChannelLabel = (channel?: string) =>
    (channel ?? "whatsapp").toUpperCase();

  const buildContactInfoText = () => {
    const lines = [
      `Nombre deudor: ${selectedDisplayName || "-"}`,
      `RUT deudor: ${selectedRut || "-"}`,
      `Teléfono deudor: ${selectedPhone || "-"}`,
      "",
      `Nombre ejecutivo: ${selectedExecutiveName || "-"}`,
      `Teléfono ejecutivo: ${selectedExecutivePhone || "-"}`,
      `RUT ejecutivo: ${selectedExecutiveRut || "-"}`,
    ];
    return lines.join("\n");
  };

  const buildChatCopyText = () => {
    if (!selectedMessages.length) {
      return "Sin mensajes para compartir.";
    }
    const lastCampaignIndex = (() => {
      for (let i = selectedMessages.length - 1; i >= 0; i -= 1) {
        const message = selectedMessages[i];
        if (message?.campaignId && message?.status !== "received") {
          return i;
        }
      }
      return 0;
    })();

    const segment =
      selectedMessages.slice(lastCampaignIndex).length === 1 &&
      selectedMessages.length > 1
        ? selectedMessages
        : selectedMessages.slice(lastCampaignIndex);

    return segment
      .map((message) => {
        const direction = message.status === "received" ? "Cliente" : "Sistema";
        const timestamp = formatMessageTimestamp(message);
        const channel = formatChannelLabel(message.channel);
        const statusLabel = formatStatusLabel(message.status);
        return `[${timestamp}] ${channel} · ${statusLabel} · ${direction}: ${message.content ?? ""}`;
      })
      .join("\n");
  };

  const handleCopyInfo = async () => {
    try {
      await navigator.clipboard.writeText(buildContactInfoText());
      alert("Información copiada");
    } catch (error) {
      alert("No se pudo copiar la información");
    }
  };

  const handleCopyChat = async () => {
    try {
      await navigator.clipboard.writeText(buildChatCopyText());
      alert("Chat copiado");
    } catch (error) {
      alert("No se pudo copiar el chat");
    }
  };

  const getSelectedConversationPhone = () => {
    if (!selectedConversation) return null;
    return selectedPhone || selectedConversation.key;
  };

  const markConversationAsRead = (conversation: Conversation) => {
    const phone =
      conversation.debtor?.phone ?? conversation.phone ?? conversation.key;
    if (!phone) return;
    markConversationRead.mutate({ phone, read: true });
  };

  const handleSelectConversation = (conversation: Conversation) => {
    setSelectedConversationKey(conversation.key);

    if (canManualSend) {
      const preferredSessionId = conversation.lastMessageSessionId ?? null;
      if (preferredSessionId && connectedSessionIdSet.has(preferredSessionId)) {
        setSelectedSessionId(preferredSessionId);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            MANUAL_SEND_SESSION_STORAGE_KEY,
            preferredSessionId
          );
        }
      }
    }

    lastViewedMessageTimes.current.set(
      conversation.key,
      conversation.lastMessageTime,
    );
    if (conversation.unreadCount > 0) {
      markConversationAsRead(conversation);
    }
  };

  useEffect(() => {
    if (!selectedConversation) return;
    if (selectedConversation.unreadCount === 0) return;
    const lastViewed =
      lastViewedMessageTimes.current.get(selectedConversation.key) ?? 0;
    if (selectedConversation.lastMessageTime <= lastViewed) {
      return;
    }
    markConversationAsRead(selectedConversation);
    lastViewedMessageTimes.current.set(
      selectedConversation.key,
      selectedConversation.lastMessageTime,
    );
  }, [
    selectedConversation?.key,
    selectedConversation?.unreadCount,
    selectedConversation?.lastMessageTime,
  ]);

  useEffect(() => {
    if (!canManualSend) return;

    if (!connectedSessions.length) {
      setSelectedSessionId(null);
      return;
    }

    if (selectedSessionId && connectedSessionIdSet.has(selectedSessionId)) {
      return;
    }

    let preferredSessionId: string | null = null;
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(MANUAL_SEND_SESSION_STORAGE_KEY);
      if (stored && connectedSessionIdSet.has(stored)) {
        preferredSessionId = stored;
      }
    }

    if (!preferredSessionId) {
      preferredSessionId = connectedSessions[0]?.id ?? null;
    }

    setSelectedSessionId(preferredSessionId);
  }, [
    canManualSend,
    connectedSessionIdSet,
    connectedSessions,
    selectedSessionId,
    MANUAL_SEND_SESSION_STORAGE_KEY,
  ]);

  const handleToggleArchive = async () => {
    if (!selectedConversation) return;
    const phone = getSelectedConversationPhone();
    if (!phone) {
      alert("No se encontró un número válido");
      return;
    }

    const nextArchived = !selectedConversation.archived;
    try {
      await archiveConversation.mutateAsync({ phone, archived: nextArchived });
      if (nextArchived && !showArchived) {
        setSelectedConversationKey(null);
      }
    } catch (error: any) {
      alert("No se pudo actualizar el archivo: " + getErrorMessage(error));
    }
  };

  const handleToggleReadState = async () => {
    if (!selectedConversation) return;
    const phone = getSelectedConversationPhone();
    if (!phone) {
      alert("No se encontró un número válido");
      return;
    }

    const shouldMarkRead = selectedConversation.unreadCount > 0;
    try {
      await markConversationRead.mutateAsync({ phone, read: shouldMarkRead });
    } catch (error: any) {
      alert("No se pudo actualizar el estado: " + getErrorMessage(error));
    }
  };

  const handleDeleteConversation = async () => {
    if (!selectedConversation) return;
    const phone = getSelectedConversationPhone();
    if (!phone) {
      alert("No se encontró un número válido");
      return;
    }

    if (!confirm(`¿Eliminar la conversación con ${selectedDisplayName || phone}?`)) {
      return;
    }

    try {
      await deleteConversation.mutateAsync({ phone });
      setSelectedConversationKey(null);
    } catch (error: any) {
      alert("No se pudo eliminar la conversación: " + getErrorMessage(error));
    }
  };

  const handleSend = async () => {
    const messageText = inputText.trim();
    if (!messageText) return;

    if (!selectedConversation) {
      alert("Selecciona una conversación");
      return;
    }

    if (!selectedSessionId) {
      alert("Selecciona una sesión de WhatsApp para enviar");
      return;
    }

    const targetPhone =
      selectedDebtor?.phone ?? selectedConversation.phone ?? selectedConversation.key;

    if (!targetPhone) {
      alert("No se encontró un número válido para enviar");
      return;
    }

    try {
      await sendMessage.mutateAsync({
        sessionId: selectedSessionId,
        phone: targetPhone,
        message: messageText,
      });
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          MANUAL_SEND_SESSION_STORAGE_KEY,
          selectedSessionId
        );
      }
      setInputText("");
    } catch (error: any) {
      const policy = formatSendError(error);
      alert("Error al enviar: " + (policy ?? getErrorMessage(error)));
    }
  };

  return (
    <Layout>
      <div className="flex h-[calc(100vh-140px)] gap-4">
        {/* Sidebar List */}
        <Card className="w-1/3 flex flex-col overflow-hidden">
          <div className="p-4 border-b space-y-4">
             <h2 className="font-semibold text-lg">Mensajes</h2>
             <div className="relative">
               <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
               <Input placeholder="Buscar mensajes..." className="pl-9 bg-secondary/50" />
             </div>
             <div className="flex flex-wrap gap-2">
               <Button
                 size="sm"
                 variant={!showArchived ? "default" : "outline"}
                 onClick={() => setShowArchived(false)}
               >
                 Activos ({activeCount})
               </Button>
               <Button
                 size="sm"
                 variant={showArchived ? "default" : "outline"}
                 onClick={() => setShowArchived(true)}
               >
                 Archivados ({archivedCount})
               </Button>
             </div>
             <div className="flex flex-wrap gap-2">
               <Button
                 size="sm"
                 variant={readFilter === "all" ? "default" : "outline"}
                 onClick={() => setReadFilter("all")}
               >
                 Todos
               </Button>
               <Button
                 size="sm"
                 variant={readFilter === "unread" ? "default" : "outline"}
                 onClick={() => setReadFilter("unread")}
               >
                 No leídos ({unreadConversationCount})
               </Button>
               <Button
                 size="sm"
                 variant={readFilter === "read" ? "default" : "outline"}
                 onClick={() => setReadFilter("read")}
               >
                 Leídos
               </Button>
               <Button
                 size="sm"
                 variant="outline"
                 onClick={() => setShowAdvancedFilters((value) => !value)}
               >
                 {showAdvancedFilters ? "Ocultar filtros" : "Más filtros"}
               </Button>
             </div>
             {showAdvancedFilters && (
               <div className="flex flex-wrap gap-2">
                 <Select value={groupFilter} onValueChange={(value) => setGroupFilter(value as typeof groupFilter)}>
                   <SelectTrigger className="h-8 w-28 text-xs">
                     <SelectValue placeholder="Grupo" />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="all">Todos</SelectItem>
                     <SelectItem value="groups">Grupos</SelectItem>
                     <SelectItem value="individual">Personas</SelectItem>
                   </SelectContent>
                 </Select>
                 <Select value={knownFilter} onValueChange={(value) => setKnownFilter(value as typeof knownFilter)}>
                   <SelectTrigger className="h-8 w-32 text-xs">
                     <SelectValue placeholder="Contacto" />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="all">Todos</SelectItem>
                     <SelectItem value="known">Conocidos</SelectItem>
                     <SelectItem value="unknown">Desconocidos</SelectItem>
                   </SelectContent>
                 </Select>
                 <Select value={failedFilter} onValueChange={(value) => setFailedFilter(value as typeof failedFilter)}>
                   <SelectTrigger className="h-8 w-28 text-xs">
                     <SelectValue placeholder="Fallidos" />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="all">Todos</SelectItem>
                     <SelectItem value="failed">Fallidos</SelectItem>
                   </SelectContent>
                 </Select>
                 <Select value={directionFilter} onValueChange={(value) => setDirectionFilter(value as typeof directionFilter)}>
                   <SelectTrigger className="h-8 w-36 text-xs">
                     <SelectValue placeholder="Dirección" />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="all">Todos</SelectItem>
                     <SelectItem value="received">Solo recibidos</SelectItem>
                     <SelectItem value="sent">Solo enviados</SelectItem>
                   </SelectContent>
                 </Select>
                 <Select value={channelFilter} onValueChange={(value) => setChannelFilter(value as typeof channelFilter)}>
                   <SelectTrigger className="h-8 w-28 text-xs">
                     <SelectValue placeholder="Canal" />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="all">Todos</SelectItem>
                     <SelectItem value="whatsapp">WhatsApp</SelectItem>
                     <SelectItem value="sms">SMS</SelectItem>
                   </SelectContent>
                 </Select>
                 <Select value={sessionFilter} onValueChange={setSessionFilter}>
                   <SelectTrigger className="h-8 w-28 text-xs">
                     <SelectValue placeholder="Sesión" />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="all">Todas</SelectItem>
                     {sessions?.map((session) => (
                       <SelectItem key={session.id} value={session.id}>
                         {session.phoneNumber?.slice(-6) || session.id.slice(0, 6)}
                       </SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
               </div>
             )}
          </div>
          <ScrollArea className="flex-1">
            {messagesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <MessageSquare className="h-8 w-8 mb-2 opacity-20" />
                <p className="text-sm">Aún no hay mensajes</p>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <MessageSquare className="h-8 w-8 mb-2 opacity-20" />
                <p className="text-sm">No hay conversaciones con ese filtro</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {filteredConversations.map((conversation) => {
                  const lastMsg = conversation.lastMessage;
                  const displayName =
                    conversation.debtor?.name ?? conversation.contact?.name ?? conversation.phone;
                  const displayPhone = conversation.phone || conversation.key;
                  const avatarText = (displayName || conversation.key).slice(0, 2).toUpperCase();
                  const lastTime = lastMsg ? conversation.lastMessageTime : 0;
                  const showPhoneLine = Boolean(displayPhone && displayPhone !== displayName);
                  return (
                    <button
                      key={conversation.key}
                      onClick={() => handleSelectConversation(conversation)}
                      className={`flex items-start gap-3 p-4 text-left transition-colors border-b last:border-0 hover:bg-muted/50 ${
                        selectedConversationKey === conversation.key ? "bg-muted" : ""
                      }`}
                    >
                      <Avatar>
                        <AvatarFallback>{avatarText}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 overflow-hidden">
                        <div className="flex justify-between items-baseline">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="font-medium truncate">{displayName}</span>
                            {conversation.archived && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded border text-muted-foreground">
                                Archivado
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {lastTime
                                ? new Date(lastTime).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "-"}
                            </span>
                            {conversation.unreadCount > 0 && (
                              <span className="inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-semibold px-1">
                                {conversation.unreadCount}
                              </span>
                            )}
                          </div>
                        </div>
                        {showPhoneLine && (
                          <p className="text-[11px] text-muted-foreground truncate">{displayPhone}</p>
                        )}
                        <p
                          className={`text-sm truncate ${
                            conversation.unreadCount > 0
                              ? "text-foreground font-medium"
                              : "text-muted-foreground"
                          }`}
                        >
                          {lastMsg?.content?.slice(0, 50) || "Sin mensajes"}...
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
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b flex justify-between items-center bg-card">
                 <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback>{selectedAvatarText}</AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-semibold">{selectedDisplayName || selectedPhone}</h3>
                      <p className="text-xs text-muted-foreground">{selectedPhone}</p>
                    </div>
                 </div>
                 <div className="flex gap-2">
                   <Button variant="ghost" size="icon">
                     <Phone className="h-4 w-4" />
                   </Button>
                   <DropdownMenu>
                     <DropdownMenuTrigger asChild>
                       <Button variant="ghost" size="icon">
                         <MoreVertical className="h-4 w-4" />
                       </Button>
                     </DropdownMenuTrigger>
                     <DropdownMenuContent align="end">
                       <Dialog open={showContactInfo} onOpenChange={setShowContactInfo}>
                         <DialogTrigger asChild>
                           <DropdownMenuItem onSelect={(event) => event.preventDefault()}>
                             Información del deudor
                           </DropdownMenuItem>
                         </DialogTrigger>
                         <DialogContent className="sm:max-w-lg">
                           <DialogHeader>
                             <DialogTitle>Información del deudor</DialogTitle>
                             <DialogDescription>
                               Datos del deudor y su ejecutivo para compartir rápidamente.
                             </DialogDescription>
                           </DialogHeader>
                           <div className="space-y-4 text-sm">
                             <div className="grid gap-2 rounded-lg border p-4">
                               <div className="font-semibold">Deudor</div>
                               <div>Nombre: {selectedDisplayName || "-"}</div>
                               <div>RUT: {selectedRut || "-"}</div>
                               <div>Teléfono: {selectedPhone || "-"}</div>
                             </div>
                             <div className="grid gap-2 rounded-lg border p-4">
                               <div className="font-semibold">Ejecutivo</div>
                               <div>Nombre: {selectedExecutiveName || "-"}</div>
                               <div>Teléfono: {selectedExecutivePhone || "-"}</div>
                               <div>RUT: {selectedExecutiveRut || "-"}</div>
                             </div>
                             <Button className="w-full gap-2" onClick={handleCopyInfo}>
                               Copiar info para compartir
                             </Button>
                             <Button variant="outline" className="w-full gap-2" onClick={handleCopyChat}>
                               Copiar chat para compartir
                             </Button>
                           </div>
                         </DialogContent>
                       </Dialog>
                       <DropdownMenuItem onClick={handleToggleArchive}>
                         {selectedConversation.archived ? (
                           <>
                             <ArchiveRestore className="mr-2 h-4 w-4" />
                             Desarchivar
                           </>
                         ) : (
                           <>
                             <Archive className="mr-2 h-4 w-4" />
                             Archivar
                           </>
                         )}
                       </DropdownMenuItem>
                       <DropdownMenuItem onClick={handleToggleReadState}>
                         {selectedConversation.unreadCount > 0 ? (
                           <>
                             <CheckCheck className="mr-2 h-4 w-4" />
                             Marcar como leído
                           </>
                         ) : (
                           <>
                             <Mail className="mr-2 h-4 w-4" />
                             Marcar como no leído
                           </>
                         )}
                       </DropdownMenuItem>
                       <DropdownMenuSeparator />
                       <DropdownMenuItem
                         onClick={handleDeleteConversation}
                         className="text-destructive focus:text-destructive"
                       >
                         <Trash2 className="mr-2 h-4 w-4" />
                         Eliminar conversación
                       </DropdownMenuItem>
                     </DropdownMenuContent>
                   </DropdownMenu>
                 </div>
              </div>

              {/* Chat Messages */}
              <ScrollArea className="flex-1 p-4 bg-muted/20">
                 <div className="space-y-4">
                   {selectedMessages.map((msg) => {
                     const isIncoming = msg.status === "received";
                     const metaText = formatMessageMeta(msg);
                     return (
                       <div
                         key={msg.id}
                         className={`flex ${isIncoming ? "justify-start" : "justify-end"}`}
                       >
                         <div
                           className={[
                             "max-w-[70%] rounded-2xl px-4 py-2 text-sm shadow-sm",
                             isIncoming
                               ? "bg-card text-foreground border border-border rounded-tl-none"
                               : "bg-primary text-primary-foreground rounded-tr-none",
                           ].join(" ")}
                         >
                           <p>{msg.content}</p>
                           <span
                             className={`text-[10px] block mt-1 opacity-70 ${
                               isIncoming ? "text-left" : "text-right"
                             }`}
                           >
                             {msg.sentAt
                               ? new Date(msg.sentAt).toLocaleTimeString([], {
                                   hour: "2-digit",
                                   minute: "2-digit",
                                 })
                               : "Pendiente"}
                             {metaText && ` • ${metaText}`}
                           </span>
                         </div>
                       </div>
                     );
                   })}
                   
                   {selectedMessages.length === 0 && (
                     <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                       <MessageSquare className="h-8 w-8 mb-2 opacity-20" />
                       <p className="text-sm">No hay mensajes en esta conversación</p>
                     </div>
                   )}
                 </div>
              </ScrollArea>

              {/* Input Area */}
              {canManualSend ? (
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
                     placeholder="Escribe un mensaje..." 
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
              ) : (
                <div className="p-4 bg-card border-t text-xs text-muted-foreground">
                  Solo supervisores y administradores pueden enviar mensajes manuales.
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <MessageSquare className="h-12 w-12 mb-4 opacity-20" />
              <p>Selecciona una conversación para ver los mensajes</p>
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}

