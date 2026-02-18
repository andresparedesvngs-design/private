import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Users, 
  MessageSquare, 
  Activity, 
  AlertTriangle, 
  Smartphone,
  Play,
  Pause,
  RefreshCw,
  Trash2,
  Send,
  Plus,
  QrCode,
  Signal,
  Battery,
  Loader2
} from "lucide-react";
import { useDashboardStats, useSessions, useCampaigns, useMessages } from "@/lib/api";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useState } from "react";

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useDashboardStats();
  const { data: sessions, isLoading: sessionsLoading, refetch: refetchSessions } = useSessions();
  const { data: campaigns, isLoading: campaignsLoading, refetch: refetchCampaigns } = useCampaigns();
  const { data: messages, refetch: refetchMessages } = useMessages();
  
  const activeCampaigns = campaigns?.filter(c => c.status === 'active') || [];
  const blockedSessions = sessions?.filter(s => s.status === 'disconnected' || s.status === 'auth_failed').length || 0;

  const sessionStatusLabels: Record<string, string> = {
    connected: "Conectada",
    disconnected: "Desconectada",
    auth_failed: "Autenticación fallida",
    qr_ready: "QR listo",
    initializing: "Inicializando",
    authenticated: "Autenticada",
    reconnecting: "Reconectando",
  };
  const campaignStatusLabels: Record<string, string> = {
    draft: "Borrador",
    active: "Activa",
    paused: "Pausada",
    completed: "Completada",
    error: "Con error",
  };
  const displaySessionStatus = (status: string) => sessionStatusLabels[status] ?? status;
  const displayCampaignStatus = (status: string) => campaignStatusLabels[status] ?? status;
  
  const chartData = (() => {
    if (!messages || messages.length === 0) {
      return [];
    }
    const hourCounts: Record<string, { sent: number; failed: number }> = {};
    messages.forEach(msg => {
      const timestamp = msg.sentAt ?? msg.createdAt ?? msg.updatedAt;
      if (!timestamp) {
        return;
      }

      const hour = new Date(timestamp).getHours();
      const time = `${hour.toString().padStart(2, '0')}:00`;
      if (!hourCounts[time]) {
        hourCounts[time] = { sent: 0, failed: 0 };
      }
      if (msg.status === 'failed') {
        hourCounts[time].failed++;
      } else {
        hourCounts[time].sent++;
      }
    });
    return Object.entries(hourCounts)
      .map(([time, counts]) => ({ time, ...counts }))
      .sort((a, b) => a.time.localeCompare(b.time));
  })();

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      await Promise.all([
        refetchStats(),
        refetchSessions(),
        refetchCampaigns(),
        refetchMessages(),
      ]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] }),
        queryClient.invalidateQueries({ queryKey: ['sessions'] }),
        queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
        queryClient.invalidateQueries({ queryKey: ['messages'] }),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCreateCampaign = () => {
    setLocation("/campaigns?new=1");
  };
  
  return (
    <Layout>
      <div className="flex flex-col gap-6">
        
        {/* Header Section */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-heading font-bold text-foreground">Panel</h1>
            <p className="text-muted-foreground mt-1">Resumen en tiempo real de tu infraestructura de WhatsApp.</p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="gap-2"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Actualizar datos
            </Button>
            <Button
              className="gap-2 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
              onClick={handleCreateCampaign}
            >
              <Play className="h-4 w-4" />
              Iniciar nueva campaña
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-primary shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Mensajes totales</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{(stats?.messagesSent ?? 0).toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Enviados (histórico)
              </p>
            </CardContent>
          </Card>
          
          <Card className="border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sesiones activas</CardTitle>
              <Smartphone className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.activeSessions ?? 0} <span className="text-sm font-normal text-muted-foreground">/ {stats?.totalSessions ?? 0}</span></div>
              <p className="text-xs text-muted-foreground mt-1">
                {!stats ? 'Cargando...' : stats.activeSessions === stats.totalSessions ? 'Todo en orden' : 'Algunas sesiones desconectadas'}
              </p>
            </CardContent>
          </Card>
          
          <Card className="border-l-4 border-l-green-500 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tasa de éxito</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats && stats.totalSessions > 0 
                  ? Math.round((stats.activeSessions / stats.totalSessions) * 100) 
                  : 0}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Disponibilidad de sesiones
              </p>
            </CardContent>
          </Card>
          
          <Card className="border-l-4 border-l-red-500 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sesiones bloqueadas</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{blockedSessions}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {blockedSessions > 0 ? 'Requiere atención' : 'Todo operativo'}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Chart */}
          <Card className="lg:col-span-2 shadow-sm">
            <CardHeader>
              <CardTitle>Volumen de mensajes</CardTitle>
              <CardDescription>Flujo horario de mensajes de hoy.</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              {chartData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <Activity className="h-8 w-8 mb-2 opacity-20" />
                  <p className="text-sm">No hay datos de mensajes</p>
                  <p className="text-xs">El gráfico se llenará a medida que se envíen mensajes</p>
                </div>
              ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="time" 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${value}`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="sent" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorSent)" 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="failed" 
                    stroke="hsl(var(--destructive))" 
                    strokeWidth={2}
                    fill="none" 
                  />
                </AreaChart>
              </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Active Campaigns */}
          <Card className="shadow-sm flex flex-col">
            <CardHeader>
              <CardTitle>Campañas activas</CardTitle>
              <CardDescription>Progreso en tiempo real.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-6">
              {campaigns?.slice(0, 3).map((campaign) => (
                <div key={campaign.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{campaign.name}</span>
                      <span className="text-xs text-muted-foreground capitalize">{displayCampaignStatus(campaign.status)} • {campaign.sent}/{campaign.totalDebtors}</span>
                    </div>
                    <Badge variant={campaign.status === 'active' ? 'default' : 'secondary'} className={campaign.status === 'active' ? 'bg-primary/20 text-primary border-primary/20' : ''}>
                      {displayCampaignStatus(campaign.status)}
                    </Badge>
                  </div>
                  <Progress value={campaign.progress} className="h-2" />
                </div>
              ))}
              
              {!campaigns || campaigns.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
                  <Send className="h-8 w-8 mb-2 opacity-20" />
                  <p className="text-sm">Aún no hay campañas</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Sessions */}
        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Salud de sesiones</CardTitle>
                <CardDescription>Estado de cuentas conectadas de WhatsApp.</CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="text-xs">Ver todo</Button>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              <div className="space-y-4">
                {sessions?.map((session, index) => (
                  <div key={session.id ?? `session-${index}`} className="flex items-center justify-between p-3 rounded-lg border bg-card/50 hover:bg-secondary/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`
                        h-10 w-10 rounded-full flex items-center justify-center
                        ${session.status === 'connected' ? 'bg-green-100 text-green-700' : 
                          (session.status === 'auth_failed' || session.status === 'disconnected') ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}
                      `}>
                        <Smartphone className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{session.phoneNumber || 'Pendiente...'}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          ID: {(session.id ?? "").slice(0, 8) || `session-${index}`}
                          {session.battery && <span>• {session.battery}% batería</span>}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="text-right hidden sm:block">
                        <p className="text-sm font-medium">{(session.messagesSent ?? 0).toLocaleString()} enviados</p>
                        <p className="text-xs text-muted-foreground">
                          {session.lastActive ? `Última actividad: ${new Date(session.lastActive).toLocaleTimeString()}` : 'Nunca'}
                        </p>
                      </div>
                      <Badge variant={session.status === 'connected' ? 'outline' : 'destructive'} 
                             className={session.status === 'connected' ? 'bg-green-500/10 text-green-600 border-green-500/20' : ''}>
                        {displaySessionStatus(session.status)}
                      </Badge>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                
                {!sessions || sessions.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
                    <Smartphone className="h-8 w-8 mb-2 opacity-20" />
                    <p className="text-sm">Aún no hay sesiones</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

      </div>
    </Layout>
  );
}
