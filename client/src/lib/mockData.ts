
import { addDays, subDays, subHours, subMinutes } from "date-fns";

export type SessionStatus = 'connected' | 'disconnected' | 'qr_ready' | 'initializing' | 'auth_failed';

export interface WhatsAppSession {
  id: string;
  phoneNumber: string;
  status: SessionStatus;
  lastActive: string;
  battery?: number;
  quality?: number;
  messagesSent: number;
  isBlocked?: boolean;
}

export interface Pool {
  id: string;
  name: string;
  mode: 'competitivo' | 'turnos_fijos' | 'turnos_aleatorios';
  sessions: string[]; // Session IDs
  delayBase: number;
  delayVariacion: number;
  active: boolean;
}

export interface Campaign {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'error';
  progress: number;
  total: number;
  sent: number;
  failed: number;
  startTime: string;
  poolId?: string;
}

export interface Debtor {
  id: string;
  name: string;
  phone: string;
  debtAmount: number;
  dueDate: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'replied' | 'failed' | 'blocked';
  lastInteraction?: string;
  tags: string[];
  executive?: string;
  rut?: string;
  processStatus: 'disponible' | 'procesando' | 'completado' | 'fallado';
}

export const mockSessions: WhatsAppSession[] = [
  { id: '1', phoneNumber: '+56 9 1234 5678', status: 'connected', lastActive: 'Now', battery: 85, quality: 100, messagesSent: 1250 },
  { id: '2', phoneNumber: '+56 9 8765 4321', status: 'connected', lastActive: '5m ago', battery: 62, quality: 90, messagesSent: 890 },
  { id: '3', phoneNumber: '+56 9 1122 3344', status: 'qr_ready', lastActive: 'Never', messagesSent: 0 },
  { id: '4', phoneNumber: '+56 9 5566 7788', status: 'disconnected', lastActive: '2h ago', messagesSent: 450, isBlocked: true },
];

export const mockPools: Pool[] = [
  { 
    id: 'pool-1', 
    name: 'Pool Principal (Competitivo)', 
    mode: 'competitivo', 
    sessions: ['1', '2'], 
    delayBase: 8000, 
    delayVariacion: 2000,
    active: true 
  },
  { 
    id: 'pool-2', 
    name: 'Pool Backup (Turnos)', 
    mode: 'turnos_fijos', 
    sessions: ['1'], 
    delayBase: 15000, 
    delayVariacion: 5000,
    active: false 
  }
];

export const mockCampaigns: Campaign[] = [
  { id: '1', name: 'Cobranza Febrero - Lote A', status: 'active', progress: 45, total: 1200, sent: 540, failed: 12, startTime: subHours(new Date(), 2).toISOString(), poolId: 'pool-1' },
  { id: '2', name: 'Recordatorio Preventivo', status: 'completed', progress: 100, total: 500, sent: 495, failed: 5, startTime: subDays(new Date(), 1).toISOString(), poolId: 'pool-1' },
  { id: '3', name: 'Oferta Regularización', status: 'paused', progress: 12, total: 3000, sent: 360, failed: 0, startTime: subHours(new Date(), 4).toISOString(), poolId: 'pool-2' },
];

export const mockDebtors: Debtor[] = [
  { id: '1', name: 'Juan Pérez', phone: '+56 9 4935 1842', debtAmount: 150000, dueDate: subDays(new Date(), 5).toISOString(), status: 'read', tags: ['vip', 'overdue'], executive: 'Ana García', rut: '12.345.678-9', processStatus: 'completado' },
  { id: '2', name: 'Maria Gonzalez', phone: '+56 9 9124 7408', debtAmount: 45000, dueDate: addDays(new Date(), 2).toISOString(), status: 'replied', tags: ['new'], executive: 'Carlos Ruiz', rut: '9.876.543-2', processStatus: 'completado' },
  { id: '3', name: 'Carlos Ruiz', phone: '+56 9 2761 5358', debtAmount: 890000, dueDate: subDays(new Date(), 30).toISOString(), status: 'sent', tags: ['critical'], executive: 'Ana García', rut: '15.678.901-3', processStatus: 'procesando' },
  { id: '4', name: 'Ana Silva', phone: '+56 9 3344 5566', debtAmount: 12500, dueDate: subDays(new Date(), 1).toISOString(), status: 'pending', tags: [], executive: 'Pedro López', rut: '18.901.234-5', processStatus: 'disponible' },
  { id: '5', name: 'Pedro López', phone: '+56 9 7788 9900', debtAmount: 0, dueDate: subDays(new Date(), 10).toISOString(), status: 'blocked', tags: ['blocked'], executive: 'Ana García', rut: '10.123.456-7', processStatus: 'fallado' },
];

export const dailyStats = [
  { time: '09:00', messages: 120 },
  { time: '10:00', messages: 350 },
  { time: '11:00', messages: 420 },
  { time: '12:00', messages: 280 },
  { time: '13:00', messages: 150 },
  { time: '14:00', messages: 300 },
  { time: '15:00', messages: 450 },
];
