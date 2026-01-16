import {
  Users,
  MessageSquare,
  Activity,
  AlertTriangle,
  Smartphone,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";

export interface Session {
  id: string;
  phoneNumber: string;
  status: "connected" | "disconnected" | "qr_ready" | "error";
  messagesSent: number;
  lastActive: string;
  isBlocked: boolean;
  battery?: number;
}

export interface Campaign {
  id: string;
  name: string;
  status: "active" | "paused" | "completed" | "draft";
  progress: number;
  total: number;
  sent: number;
  failed: number;
  startTime: string;
}

export const mockSessions: Session[] = [
  {
    id: "ebf86f29-85b8",
    phoneNumber: "56949351842",
    status: "disconnected",
    messagesSent: 20,
    lastActive: "2026-01-15T14:56:25.743Z",
    isBlocked: true,
  },
  {
    id: "176dbb63-9390",
    phoneNumber: "56991247408",
    status: "connected",
    messagesSent: 1450,
    lastActive: "2026-01-16T09:41:53.759Z",
    isBlocked: false,
    battery: 85,
  },
  {
    id: "4653b7ff-6c6f",
    phoneNumber: "56927615358",
    status: "error",
    messagesSent: 33,
    lastActive: "2026-01-15T16:42:06.683Z",
    isBlocked: true,
  },
  {
    id: "5c9e8272-768f",
    phoneNumber: "56927455353",
    status: "connected",
    messagesSent: 892,
    lastActive: "2026-01-16T10:15:16.685Z",
    isBlocked: false,
    battery: 42,
  },
  {
    id: "a1e8c1d6-7c6f",
    phoneNumber: "56927621892",
    status: "connected",
    messagesSent: 215,
    lastActive: "2026-01-16T10:22:28.017Z",
    isBlocked: false,
    battery: 98,
  },
];

export const mockCampaigns: Campaign[] = [
  {
    id: "cmp_001",
    name: "Cobranza Enero - Lote 1",
    status: "active",
    progress: 45,
    total: 1000,
    sent: 450,
    failed: 12,
    startTime: "2026-01-16T09:00:00.000Z",
  },
  {
    id: "cmp_002",
    name: "Recordatorio Vencimiento",
    status: "paused",
    progress: 12,
    total: 500,
    sent: 60,
    failed: 0,
    startTime: "2026-01-15T15:30:00.000Z",
  },
  {
    id: "cmp_003",
    name: "Oferta Reactivación",
    status: "completed",
    progress: 100,
    total: 2500,
    sent: 2480,
    failed: 20,
    startTime: "2026-01-14T10:00:00.000Z",
  },
];

export const stats = {
  totalMessages: 12450,
  activeSessions: 3,
  blockedSessions: 2,
  successRate: 98.2,
  todayVolume: 1240,
};

export const chartData = [
  { time: "08:00", sent: 120, failed: 2 },
  { time: "09:00", sent: 240, failed: 5 },
  { time: "10:00", sent: 450, failed: 8 },
  { time: "11:00", sent: 380, failed: 4 },
  { time: "12:00", sent: 210, failed: 1 },
  { time: "13:00", sent: 150, failed: 0 },
  { time: "14:00", sent: 280, failed: 3 },
];
