import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSocket } from "@/lib/socket";
import AuthGate from "@/components/auth/AuthGate";
import Dashboard from "@/pages/Dashboard";
import Sessions from "@/pages/Sessions";
import Campaigns from "@/pages/Campaigns";
import Debtors from "@/pages/Debtors";
import Contacts from "@/pages/Contacts";
import Messages from "@/pages/Messages";
import SystemLogs from "@/pages/SystemLogs";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/sessions" component={Sessions} />
      <Route path="/campaigns" component={Campaigns} />
      <Route path="/debtors" component={Debtors} />
      <Route path="/contacts" component={Contacts} />
      <Route path="/messages" component={Messages} />
      <Route path="/logs" component={SystemLogs} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthedApp() {
  useSocket();
  return <Router />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AuthGate>
          <AuthedApp />
        </AuthGate>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
