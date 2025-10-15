import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";

type RestrictedRouteProps = {
  module: string;
  actions?: string[];
  children: ReactNode;
  redirectTo?: string;
};

export function RestrictedRoute({ module, actions, children, redirectTo = "/" }: RestrictedRouteProps) {
  const { hasModuleAccess, hasAnyPermission, userRole } = usePermissions();

  const allowed = actions && actions.length > 0
    ? hasAnyPermission(module, actions)
    : hasModuleAccess(module);

  if (userRole !== 'owner' && !allowed) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}