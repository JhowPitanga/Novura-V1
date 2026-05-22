import { Outlet } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AdminGlobalHeader } from "@/components/admin/shell/AdminGlobalHeader";
import { AdminSidebar } from "@/components/admin/shell/AdminSidebar";

/** Shell for /novura-admin — never renders tenant ERP modules in the sidebar. */
export function AdminLayout() {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <AdminSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <AdminGlobalHeader />
          <main className="flex-1 overflow-auto bg-gray-50 p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
