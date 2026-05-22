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
  const { hasModuleAccess, hasAnyPermission, isSuperAdmin } = usePermissions();

  const allowed = actions && actions.length > 0
    ? hasAnyPermission(module, actions)
    : hasModuleAccess(module);

  if (module === "novura_admin") {
    if (isSuperAdmin) return <>{children}</>;
    return <Navigate to={redirectTo} replace />;
  }
  if (!allowed) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
