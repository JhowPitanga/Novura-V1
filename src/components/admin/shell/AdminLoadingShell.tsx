import { Loader2 } from "lucide-react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin/shell/AdminSidebar";
import { AdminGlobalHeader } from "@/components/admin/shell/AdminGlobalHeader";
import { isAdminConsolePath } from "@/lib/adminConsole";

type AdminLoadingShellProps = {
  message?: string;
};

export function AdminLoadingShell({ message = "Carregando..." }: AdminLoadingShellProps) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gray-50 overflow-hidden">
        <AdminSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <AdminGlobalHeader />
          <main className="flex-1 p-6 overflow-auto flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-novura-primary" />
              <p className="text-gray-600">{message}</p>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

