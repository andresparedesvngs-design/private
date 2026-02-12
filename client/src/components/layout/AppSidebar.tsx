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
  Database,
  Server
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuthMe, useLogout } from "@/lib/api";
import { disconnectSocket } from "@/lib/socket";

type SidebarItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  roles: Array<"admin" | "supervisor" | "executive">;
};

export function AppSidebar() {
  const [location] = useLocation();
  const { data: user } = useAuthMe();
  const logout = useLogout();
  const role = (user?.role ?? "admin") as "admin" | "supervisor" | "executive";
  const isExecutive = role === "executive";

  const items: SidebarItem[] = [
    {
      title: "Panel",
      url: "/",
      icon: LayoutDashboard,
      roles: ["admin", "supervisor", "executive"],
    },
    {
      title: "Sesiones",
      url: "/sessions",
      icon: Smartphone,
      roles: ["admin", "supervisor"],
    },
    {
      title: isExecutive ? "Mis campañas" : "Campañas",
      url: "/campaigns",
      icon: Send,
      roles: ["admin", "supervisor", "executive"],
    },
    {
      title: "Mensajes",
      url: "/messages",
      icon: MessageSquareText,
      roles: ["admin", "supervisor", "executive"],
    },
    {
      title: isExecutive ? "Mis deudores" : "Deudores",
      url: "/debtors",
      icon: Users,
      roles: ["admin", "supervisor", "executive"],
    },
    {
      title: "Contactos",
      url: "/contacts",
      icon: Database,
      roles: ["admin", "supervisor", "executive"],
    },
    {
      title: "Registros",
      url: "/logs",
      icon: Terminal,
      roles: ["admin", "supervisor"],
    },
  ];

  const systemItems: SidebarItem[] = [
    {
      title: "Configuración",
      url: "/settings",
      icon: Settings,
      roles: ["admin", "supervisor", "executive"],
    },
    {
      title: "Proxy Servers",
      url: "/proxy-servers",
      icon: Server,
      roles: ["admin"],
    },
    {
      title: "Usuarios/Permisos",
      url: "/users",
      icon: ShieldAlert,
      roles: ["admin"],
    },
  ];

  const handleLogout = async () => {
    try {
      await logout.mutateAsync();
    } catch (error) {
      console.error("No se pudo cerrar sesión:", error);
    } finally {
      disconnectSocket();
    }
  };
  const displayName = user?.displayName || user?.username || "AD";
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-16 border-b border-sidebar-border flex items-center px-4">
        <div className="flex items-center gap-2 overflow-hidden transition-all duration-300 group-data-[collapsible=icon]:justify-center">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <img src="/favicon.png" alt="Logo" className="h-6 w-6 object-contain" />
          </div>
          <div className="flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
            <span className="font-heading font-semibold text-sidebar-foreground text-base">WhatsMassive</span>
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Sender</span>
          </div>
        </div>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Plataforma</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.filter((item) => item.roles.includes(role)).map((item) => (
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
              {systemItems.filter((item) => item.roles.includes(role)).map((item) => (
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

