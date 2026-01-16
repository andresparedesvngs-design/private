import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/Dashboard";
import Sessions from "@/pages/Sessions";
import Campaigns from "@/pages/Campaigns";
import Debtors from "@/pages/Debtors";
import Messages from "@/pages/Messages";
import SystemLogs from "@/pages/SystemLogs";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/sessions" component={Sessions} />
      <Route path="/campaigns" component={Campaigns} />
      <Route path="/debtors" component={Debtors} />
      <Route path="/messages" component={Messages} />
      <Route path="/logs" component={SystemLogs} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
