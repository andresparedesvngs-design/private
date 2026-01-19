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
  Battery
} from "lucide-react";
import { useDashboardStats, useSessions, useCampaigns } from "@/lib/api";
import { dailyStats } from "@/lib/mockData";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function Dashboard() {
  const { data: stats } = useDashboardStats();
  const { data: sessions } = useSessions();
  const { data: campaigns } = useCampaigns();
  
  const activeCampaigns = campaigns?.filter(c => c.status === 'active') || [];
  const blockedSessions = sessions?.filter(s => s.status === 'disconnected' || s.status === 'auth_failed').length || 0;
  
  return (
    <Layout>
      <div className="flex flex-col gap-6">
        
        {/* Header Section */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-heading font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground mt-1">Real-time overview of your WhatsApp infrastructure.</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh Data
            </Button>
            <Button className="gap-2 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20">
              <Play className="h-4 w-4" />
              Start New Campaign
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-primary shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Messages</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.messagesSent.toLocaleString() || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                All-time sent
              </p>
            </CardContent>
          </Card>
          
          <Card className="border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
              <Smartphone className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.activeSessions || 0} <span className="text-sm font-normal text-muted-foreground">/ {stats?.totalSessions || 0}</span></div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats?.activeSessions === stats?.totalSessions ? 'All systems healthy' : 'Some sessions offline'}
              </p>
            </CardContent>
          </Card>
          
          <Card className="border-l-4 border-l-green-500 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats?.totalSessions && stats?.totalSessions > 0 
                  ? Math.round((stats.activeSessions / stats.totalSessions) * 100) 
                  : 0}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Session uptime
              </p>
            </CardContent>
          </Card>
          
          <Card className="border-l-4 border-l-red-500 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Blocked Sessions</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{blockedSessions}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {blockedSessions > 0 ? 'Action required' : 'All operational'}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Chart */}
          <Card className="lg:col-span-2 shadow-sm">
            <CardHeader>
              <CardTitle>Message Volume</CardTitle>
              <CardDescription>Hourly message throughput for today.</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyStats}>
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
            </CardContent>
          </Card>

          {/* Active Campaigns */}
          <Card className="shadow-sm flex flex-col">
            <CardHeader>
              <CardTitle>Active Campaigns</CardTitle>
              <CardDescription>Real-time progress.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-6">
              {campaigns?.slice(0, 3).map((campaign) => (
                <div key={campaign.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{campaign.name}</span>
                      <span className="text-xs text-muted-foreground capitalize">{campaign.status} • {campaign.sent}/{campaign.totalDebtors}</span>
                    </div>
                    <Badge variant={campaign.status === 'active' ? 'default' : 'secondary'} className={campaign.status === 'active' ? 'bg-primary/20 text-primary border-primary/20' : ''}>
                      {campaign.status}
                    </Badge>
                  </div>
                  <Progress value={campaign.progress} className="h-2" />
                </div>
              ))}
              
              {!campaigns || campaigns.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
                  <Send className="h-8 w-8 mb-2 opacity-20" />
                  <p className="text-sm">No campaigns yet</p>
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
                <CardTitle>Session Health</CardTitle>
                <CardDescription>Status of connected WhatsApp accounts.</CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="text-xs">View All</Button>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              <div className="space-y-4">
                {sessions?.map((session) => (
                  <div key={session.id} className="flex items-center justify-between p-3 rounded-lg border bg-card/50 hover:bg-secondary/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`
                        h-10 w-10 rounded-full flex items-center justify-center
                        ${session.status === 'connected' ? 'bg-green-100 text-green-700' : 
                          (session.status === 'auth_failed' || session.status === 'disconnected') ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}
                      `}>
                        <Smartphone className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{session.phoneNumber || 'Pending...'}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          ID: {session.id.slice(0, 8)}
                          {session.battery && <span>• {session.battery}% Battery</span>}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="text-right hidden sm:block">
                        <p className="text-sm font-medium">{session.messagesSent.toLocaleString()} sent</p>
                        <p className="text-xs text-muted-foreground">
                          {session.lastActive ? `Last active: ${new Date(session.lastActive).toLocaleTimeString()}` : 'Never'}
                        </p>
                      </div>
                      <Badge variant={session.status === 'connected' ? 'outline' : 'destructive'} 
                             className={session.status === 'connected' ? 'bg-green-500/10 text-green-600 border-green-500/20' : ''}>
                        {session.status}
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
                    <p className="text-sm">No sessions yet</p>
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
