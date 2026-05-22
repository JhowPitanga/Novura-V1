/**

 * Sidebar for the internal admin console only.

 * Does not list tenant ERP modules (produtos, pedidos, SAC, etc.).

 */

import { LayoutDashboard, Building2, Flag, Settings, Shield, Workflow } from "lucide-react";

import { NavLink, useLocation } from "react-router-dom";

import {

  Sidebar,

  SidebarContent,

  SidebarGroup,

  SidebarGroupContent,

  SidebarGroupLabel,

  SidebarMenu,

  SidebarMenuButton,

  SidebarMenuItem,

} from "@/components/ui/sidebar";



const ADMIN_NAV_ITEMS = [

  { title: "Visão Geral", path: "/novura-admin", icon: LayoutDashboard, end: true },

  { title: "Organizações", path: "/novura-admin/organizacoes", icon: Building2 },

  { title: "Feature Flags & Planos", path: "/novura-admin/flags-planos", icon: Flag },

  { title: "Status Engine", path: "/novura-admin/status-engine", icon: Workflow },

] as const;



export function AdminSidebar() {

  const { pathname } = useLocation();



  const isActive = (path: string, end?: boolean) => {

    if (end) return pathname === path;

    return pathname === path || pathname.startsWith(`${path}/`);

  };



  return (

    <Sidebar className="border-r-0 bg-white" collapsible="icon" variant="inset">

      <SidebarContent className="bg-white flex flex-col h-full pt-[50px]">

        <SidebarGroup className="mt-4 px-4">

          <SidebarGroupLabel className="px-1 text-gray-500 text-sm flex items-center gap-1.5">

            <Shield className="h-3.5 w-3.5 text-novura-primary" />

            Novura Admin

          </SidebarGroupLabel>

          <SidebarGroupContent>

            <SidebarMenu className="space-y-1">

              {ADMIN_NAV_ITEMS.map((item) => (

                <SidebarMenuItem key={item.path}>

                  <SidebarMenuButton

                    tooltip={item.title}

                    asChild

                    isActive={isActive(item.path, item.end)}

                  >

                    <NavLink

                      to={item.path}

                      end={item.end}

                      className={`flex items-center w-full space-x-4 px-4 py-4 rounded-xl transition-all text-base ${

                        isActive(item.path, item.end)

                          ? "bg-novura-primary text-white"

                          : "text-gray-700 hover:bg-gray-100"

                      }`}

                    >

                      <item.icon className="w-5 h-5 flex-shrink-0" />

                      <span className="font-medium text-sm">{item.title}</span>

                    </NavLink>

                  </SidebarMenuButton>

                </SidebarMenuItem>

              ))}

            </SidebarMenu>

          </SidebarGroupContent>

        </SidebarGroup>



        <div className="mt-auto px-4 pb-4 hidden group-data-[collapsible=icon]:hidden">

          <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-xs text-muted-foreground">

            <Settings className="h-4 w-4 text-novura-primary shrink-0" />

            <span>Console interno — sem módulos operacionais do ERP.</span>

          </div>

        </div>

      </SidebarContent>

    </Sidebar>

  );

}


