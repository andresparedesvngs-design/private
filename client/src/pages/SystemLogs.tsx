import Layout from "@/components/layout/Layout";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Terminal, Shield, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface LogEntry {
  id: number;
  type: 'info' | 'error' | 'warning' | 'success';
  message: string;
  timestamp: string;
  service: string;
}

const initialLogs: LogEntry[] = [
  { id: 1, type: 'info', service: 'WhatsAppManager', message: 'Inicializando WhatsAppManager...', timestamp: new Date().toISOString() },
  { id: 2, type: 'success', service: 'AppServer', message: 'Rutas cargadas correctamente', timestamp: new Date().toISOString() },
  { id: 3, type: 'info', service: 'CleanupService', message: 'CleanupService inicializado (fusión anti-EBUSY)', timestamp: new Date().toISOString() },
  { id: 4, type: 'warning', service: 'SessionManager', message: 'No se encontraron sesiones previas, iniciando con estructura nueva', timestamp: new Date().toISOString() },
];

export default function SystemLogs() {
  const [logs, setLogs] = useState<LogEntry[]>(initialLogs);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Simulate incoming logs
    const interval = setInterval(() => {
      const services = ['WhatsAppManager', 'CleanupService', 'CampaignWorker', 'SocketIO'];
      const types: LogEntry['type'][] = ['info', 'info', 'info', 'success', 'warning'];
      const messages = [
        'Heartbeat check passed',
        'Syncing messages for session 569...',
        'Checking for stale sessions...',
        'Campaign progress updated: 45%',
        'Received new message packet',
        'Memory usage check: OK'
      ];
      
      const newLog: LogEntry = {
        id: Date.now(),
        type: types[Math.floor(Math.random() * types.length)],
        service: services[Math.floor(Math.random() * services.length)],
        message: messages[Math.floor(Math.random() * messages.length)],
        timestamp: new Date().toISOString()
      };
      
      setLogs(prev => [...prev.slice(-100), newLog]); // Keep last 100
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getIcon = (type: LogEntry['type']) => {
    switch (type) {
      case 'error': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'success': return <CheckCircle className="h-4 w-4 text-green-500" />;
      default: return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'error': return 'text-red-400';
      case 'warning': return 'text-yellow-400';
      case 'success': return 'text-green-400';
      default: return 'text-gray-300';
    }
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6 h-[calc(100vh-140px)]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-heading font-bold text-foreground">System Logs</h1>
            <p className="text-muted-foreground mt-1">Real-time server logs and service monitoring.</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-green-600 bg-green-500/10 px-3 py-1 rounded-full border border-green-500/20 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            Live Stream
          </div>
        </div>

        <Card className="flex-1 bg-[#0a0a0a] border-gray-800 font-mono text-sm overflow-hidden flex flex-col shadow-inner">
          <div className="bg-gray-900/50 border-b border-gray-800 p-2 flex gap-2">
            <div className="h-3 w-3 rounded-full bg-red-500/50" />
            <div className="h-3 w-3 rounded-full bg-yellow-500/50" />
            <div className="h-3 w-3 rounded-full bg-green-500/50" />
            <span className="ml-2 text-xs text-gray-500">server.log - bash</span>
          </div>
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-1">
              {logs.map((log) => (
                <div key={log.id} className="flex gap-3 hover:bg-white/5 p-1 rounded transition-colors">
                  <span className="text-gray-500 shrink-0 select-none">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="text-blue-500 font-bold w-32 shrink-0 select-none">
                    [{log.service}]
                  </span>
                  <span className={`flex-1 ${getColor(log.type)} flex items-center gap-2 break-all`}>
                    {log.type !== 'info' && getIcon(log.type)}
                    {log.message}
                  </span>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>
        </Card>
      </div>
    </Layout>
  );
}
