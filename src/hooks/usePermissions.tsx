import { useAuth } from './useAuth';
import { useMemo } from 'react';
import {
  isModuleSwitchAllowing,
  isOrgModuleDisabled,
  isOrgModuleEnabled,
  parseModuleActiveMap,
} from '@/lib/moduleAccess';

type PermissionValue = boolean | Record<string, boolean> | string[];

/**
 * Core permission resolver — handles all permission formats
 * (boolean, object with action keys, string array).
 */
function resolvePermission(
    mod: PermissionValue | undefined,
    action: string | null
): boolean {
    if (!mod) return false;

    if (typeof mod === 'boolean') {
        return action ? mod : mod;
    }

    if (Array.isArray(mod)) {
        return action ? mod.includes(action) : mod.length > 0;
    }

    if (typeof mod === 'object' && mod !== null) {
        if (action) return (mod as Record<string, boolean>)[action] === true;
        if (Object.prototype.hasOwnProperty.call(mod, 'view')) {
            return (mod as Record<string, boolean>).view === true;
        }
        return Object.values(mod).some((v) => v === true);
    }

    return false;
}

export function usePermissions() {
    const { permissions, userRole, organizationId, moduleSwitches, globalRole } = useAuth();

    const activeMap = useMemo(
      () => parseModuleActiveMap(moduleSwitches),
      [moduleSwitches],
    );

  const isSuperAdmin = globalRole === 'super_admin';

  const hasPermission = (module: string, action: string): boolean => {
    if (module === 'novura_admin') return isSuperAdmin;

    if (isOrgModuleDisabled(module, activeMap)) {
      return isSuperAdmin;
    }

    // Org/platform switch ON → baseline access (matches admin "liberado para org")
    if (isOrgModuleEnabled(module, activeMap)) {
      if (action === 'view') return true;
      if (userRole === 'owner' || userRole === 'admin') return true;
    }

    const mod = (permissions as any)?.[module] as PermissionValue | undefined;

    if (!permissions || !organizationId) return false;
    if (userRole === 'owner') return true;

    return resolvePermission(mod, action);
  };

  const hasModuleAccess = (module: string): boolean => {
    if (module === 'novura_admin') return isSuperAdmin;

    if (isOrgModuleDisabled(module, activeMap)) {
      return isSuperAdmin;
    }

    if (isOrgModuleEnabled(module, activeMap)) {
      return true;
    }

    const mod = (permissions as any)?.[module] as PermissionValue | undefined;

    if (!permissions || !organizationId) return false;
    if (userRole === 'owner' || userRole === 'admin') {
      return isModuleSwitchAllowing(module, activeMap);
    }

    if (resolvePermission(mod, 'view')) return true;
    return resolvePermission(mod, null);
  };

  const hasAnyPermission = (module: string, actions: string[]): boolean => {
    if (module === 'novura_admin') return isSuperAdmin;

    if (isOrgModuleDisabled(module, activeMap)) {
      return isSuperAdmin;
    }

    if (isOrgModuleEnabled(module, activeMap)) {
      if (actions.includes('view')) return true;
      if (userRole === 'owner' || userRole === 'admin') return true;
    }

    const mod = (permissions as any)?.[module] as PermissionValue | undefined;

    if (!permissions || !organizationId) return false;
    if (userRole === 'owner') return true;

    return actions.some((action) => resolvePermission(mod, action));
  };

    const canManageUsers = (): boolean => {
        return hasPermission('usuarios', 'manage_permissions') || userRole === 'owner' || userRole === 'admin';
    };

    const canInviteUsers = (): boolean => {
        return hasPermission('usuarios', 'invite') || userRole === 'owner' || userRole === 'admin';
    };

    const canViewProducts = (): boolean => {
        return hasAnyPermission('produtos', ['view', 'create', 'edit', 'delete']);
    };

    const canManageProducts = (): boolean => {
        return hasPermission('produtos', 'edit') || userRole === 'owner';
    };

    const canViewOrders = (): boolean => {
        return hasAnyPermission('pedidos', ['view', 'create', 'edit', 'cancel']);
    };

    const canManageOrders = (): boolean => {
        return hasPermission('pedidos', 'edit') || userRole === 'owner';
    };

    const canViewStock = (): boolean => {
        return hasAnyPermission('estoque', ['view', 'adjust', 'transfer', 'manage_storage']);
    };

    const canManageStock = (): boolean => {
        return hasPermission('estoque', 'adjust') || userRole === 'owner';
    };

    const canViewPromotions = (): boolean => {
        return hasAnyPermission('anuncios', ['view', 'promote_view', 'promote_create', 'promote_edit', 'promote_delete']) || userRole === 'owner';
    };

    const canCreatePromotion = (): boolean => {
        return hasPermission('anuncios', 'promote_create') || userRole === 'owner';
    };

    const canEditPromotion = (): boolean => {
        return hasPermission('anuncios', 'promote_edit') || userRole === 'owner';
    };

    const canDeletePromotion = (): boolean => {
        return hasPermission('anuncios', 'promote_delete') || userRole === 'owner';
    };

    return {
        permissions,
        userRole,
        organizationId,
        hasPermission,
        hasModuleAccess,
        hasAnyPermission,
        canManageUsers,
        canInviteUsers,
        canViewProducts,
        canManageProducts,
        canViewOrders,
        canManageOrders,
        canViewStock,
        canManageStock,
        canViewPromotions,
        canCreatePromotion,
        canEditPromotion,
        canDeletePromotion,
    globalRole,
    isSuperAdmin,
    moduleSwitchState: (module: string) => getModuleSwitchState(module, activeMap),
  };
}
