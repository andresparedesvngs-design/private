import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { Separator } from "@/components/ui/separator";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { useLocation } from "wouter";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const pathSegments = location.split('/').filter(Boolean);
  const pageLabels: Record<string, string> = {
    sessions: "Sesiones",
    campaigns: "Campañas",
    debtors: "Deudores",
    contacts: "Contactos",
    messages: "Mensajes",
    logs: "Registros",
    settings: "Configuración",
  };
  const currentPage =
    pathSegments.length > 0
      ? pageLabels[pathSegments[0]] ??
        (pathSegments[0].charAt(0).toUpperCase() + pathSegments[0].slice(1))
      : "Panel";

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-background">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-card/50 backdrop-blur-sm px-4 sticky top-0 z-10 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/">WhatsMassive</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>{currentPage}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="ml-auto flex items-center gap-4">
             <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 px-3 py-1.5 rounded-full border border-border/50">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                Sistema en funcionamiento
             </div>
          </div>
        </header>
        <main className="flex-1 p-6 md:p-8 overflow-y-auto">
          <div className="mx-auto max-w-7xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            {children}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
