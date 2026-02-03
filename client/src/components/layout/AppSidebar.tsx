import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { 
  LayoutDashboard, 
  Smartphone, 
  Send, 
  MessageSquareText, 
  Users, 
  Settings, 
  LogOut,
  ShieldAlert,
  Terminal,
  Database
} from "lucide-react";
import { Link, useLocation } from "wouter";
import logoUrl from "@assets/generated_images/minimalist_green_abstract_hexagon_logo_for_whatsapp_marketing_app.png";
import { useAuthMe, useLogout } from "@/lib/api";
import { disconnectSocket } from "@/lib/socket";

const items = [
  {
    title: "Panel",
    url: "/",
    icon: LayoutDashboard,
  },
  {
    title: "Sesiones",
    url: "/sessions",
    icon: Smartphone,
  },
  {
    title: "Campañas",
    url: "/campaigns",
    icon: Send,
  },
  {
    title: "Mensajes",
    url: "/messages",
    icon: MessageSquareText,
  },
  {
    title: "Deudores",
    url: "/debtors",
    icon: Users,
  },
  {
    title: "Contactos",
    url: "/contacts",
    icon: Database,
  },
  {
    title: "Registros",
    url: "/logs",
    icon: Terminal,
  },
];

const systemItems = [
  {
    title: "Configuración",
    url: "/settings",
    icon: Settings,
  }
];

export function AppSidebar() {
  const [location] = useLocation();
  const { data: user } = useAuthMe();
  const logout = useLogout();

  const handleLogout = async () => {
    try {
      await logout.mutateAsync();
    } catch (error) {
      console.error("No se pudo cerrar sesión:", error);
    } finally {
      disconnectSocket();
    }
  };
  const initials = (user?.username ?? "AD").slice(0, 2).toUpperCase();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-16 border-b border-sidebar-border flex items-center px-4">
        <div className="flex items-center gap-2 overflow-hidden transition-all duration-300 group-data-[collapsible=icon]:justify-center">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <img src={logoUrl} alt="Logo" className="h-6 w-6 object-contain" />
          </div>
          <div className="flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
            <span className="font-heading font-semibold text-sidebar-foreground">WhatsMassive</span>
            <span className="text-xs text-muted-foreground">v2.4.0</span>
          </div>
        </div>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Plataforma</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={location === item.url}
                    tooltip={item.title}
                    className="h-10 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
                  >
                    <Link href={item.url}>
                      <item.icon className="h-5 w-5" />
                      <span className="font-medium">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto">
          <SidebarGroupLabel>Sistema</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {systemItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild
                    isActive={location === item.url} 
                    tooltip={item.title}
                    className="h-10"
                  >
                    <Link href={item.url}>
                      <item.icon className="h-5 w-5" />
                      <span className="font-medium">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      
      <SidebarFooter className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
          <div className="h-8 w-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-bold text-sidebar-foreground">
            {initials}
          </div>
          <div className="flex flex-col gap-0.5 overflow-hidden group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-medium truncate">
              {user?.username ?? "Administrador"}
            </span>
            <span className="text-xs text-muted-foreground truncate">
              Rol: {user?.role ?? "admin"}
            </span>
          </div>
          <button
            onClick={handleLogout}
            disabled={logout.isPending}
            className="ml-auto group-data-[collapsible=icon]:hidden text-muted-foreground hover:text-foreground disabled:opacity-50"
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

