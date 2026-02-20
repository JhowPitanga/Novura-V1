import { useAuth } from './useAuth';
import { useMemo } from 'react';

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

    const activeMap = useMemo(() => {
        const raw = moduleSwitches || {};
        const global = (raw && typeof raw === 'object') ? (raw as any).global || {} : {};
        const map: Record<string, boolean> = {};
        for (const key of Object.keys(global || {})) {
            const v = (global as any)[key];
            map[key] = Boolean(v?.active);
        }
        return map;
    }, [moduleSwitches]);

    const hasPermission = (module: string, action: string): boolean => {
        if (module === 'novura_admin') return globalRole === 'nv_superadmin';

        const mod = (permissions as any)?.[module] as PermissionValue | undefined;

        // Module switch is disabled — only superadmin or view-only access
        if (activeMap && module in activeMap && activeMap[module] === false) {
            if (globalRole === 'nv_superadmin') return true;
            if (!permissions || !organizationId) return false;
            return action === 'view' && resolvePermission(mod, 'view');
        }

        if (!permissions || !organizationId) return false;
        if (userRole === 'owner') return true;

        return resolvePermission(mod, action);
    };

    const hasModuleAccess = (module: string): boolean => {
        if (module === 'novura_admin') return globalRole === 'nv_superadmin';

        const mod = (permissions as any)?.[module] as PermissionValue | undefined;

        if (activeMap && module in activeMap && activeMap[module] === false) {
            if (globalRole === 'nv_superadmin') return true;
            if (!permissions || !organizationId) return false;
            return resolvePermission(mod, 'view');
        }

        if (!permissions || !organizationId) return false;
        if (userRole === 'owner') return true;

        return resolvePermission(mod, null);
    };

    const hasAnyPermission = (module: string, actions: string[]): boolean => {
        if (module === 'novura_admin') return globalRole === 'nv_superadmin';

        const mod = (permissions as any)?.[module] as PermissionValue | undefined;

        if (activeMap && module in activeMap && activeMap[module] === false) {
            if (globalRole === 'nv_superadmin') return true;
            if (!permissions || !organizationId) return false;
            return actions.includes('view') && resolvePermission(mod, 'view');
        }

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
        globalRole,
    };
}
