
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';
import { GlobalHeader } from '@/components/GlobalHeader';
import { Navigate, useLocation } from 'react-router-dom';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { AdminLoadingShell } from '@/components/admin/shell/AdminLoadingShell';
import { isAdminConsolePath } from '@/lib/adminConsole';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading, globalRole } = useAuth();
  const { pathname } = useLocation();
  const isAdmin = isAdminConsolePath(pathname);

  if (loading) {
    if (isAdmin) {
      return <AdminLoadingShell message="Carregando..." />;
    }

    // Keep sidebar fixed during auth loading; show loader only in content area
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-gray-50">
          <AppSidebar />

          <div className="flex-1 flex flex-col">
            <GlobalHeader />

            <main className="flex-1 p-6 overflow-auto flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                <p className="text-gray-600">Carregando...</p>
              </div>
            </main>
          </div>
        </div>
      </SidebarProvider>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (globalRole === 'super_admin' && !isAdmin) {
    return <Navigate to="/novura-admin" replace />;
  }

  return <>{children}</>;
}
