import Layout from "@/components/layout/Layout";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Info, Loader2 } from "lucide-react";
import { useSystemLogs } from "@/lib/api";

type LogLevel = 'info' | 'error' | 'warning';

export default function SystemLogs() {
  const { data: logs, isLoading } = useSystemLogs(100);

  const getIcon = (level: LogLevel) => {
    switch (level) {
      case 'error': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default: return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getColor = (level: LogLevel) => {
    switch (level) {
      case 'error': return 'text-red-400';
      case 'warning': return 'text-yellow-400';
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
            {isLoading ? (
              <div className="flex items-center justify-center h-full py-12">
                <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
              </div>
            ) : !logs || logs.length === 0 ? (
              <div className="flex items-center justify-center h-full py-12 text-gray-500">
                No logs available
              </div>
            ) : (
              <div className="space-y-1">
                {logs.map((log) => (
                  <div key={log.id} className="flex gap-3 hover:bg-white/5 p-1 rounded transition-colors">
                    <span className="text-gray-500 shrink-0 select-none">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </span>
                    <span className="text-blue-500 font-bold w-32 shrink-0 select-none">
                      [{log.source}]
                    </span>
                    <span className={`flex-1 ${getColor(log.level as LogLevel)} flex items-center gap-2 break-all`}>
                      {log.level !== 'info' && getIcon(log.level as LogLevel)}
                      {log.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </Card>
      </div>
    </Layout>
  );
}
