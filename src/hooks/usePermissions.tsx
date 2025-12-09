import { useAuth } from './useAuth';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function usePermissions() {
    const { permissions, userRole, organizationId, user } = useAuth();
    const [activeMap, setActiveMap] = useState<Record<string, boolean> | null>(null);
    const [globalRole, setGlobalRole] = useState<string | null>(null);

    useEffect(() => {
        const loadActive = async () => {
            try {
                if (!user?.id || !organizationId) { setActiveMap(null); return; }
                const { data } = await supabase
                    .from('organization_members')
                    .select('module_switches')
                    .eq('user_id', user.id as string)
                    .eq('organization_id', organizationId as string)
                    .maybeSingle();
                const raw = (data as any)?.module_switches || {};
                const global = (raw && typeof raw === 'object') ? (raw.global || {}) : {};
                const map: Record<string, boolean> = {};
                for (const key of Object.keys(global || {})) {
                    const v = (global as any)[key];
                    map[key] = Boolean(v?.active);
                }
                setActiveMap(map);
            } catch (_) {
                setActiveMap(null);
            }
        };
        loadActive();
    }, [organizationId, user?.id]);

    useEffect(() => {
        const loadRole = async () => {
            try {
                const { data } = await supabase
                    .from('users')
                    .select('global_role')
                    .eq('id', user?.id as string)
                    .maybeSingle();
                setGlobalRole((data as any)?.global_role ?? null);
            } catch {
                setGlobalRole(null);
            }
        };
        loadRole();
    }, [user?.id]);

    useEffect(() => {
        if (!user?.id) return;
        const channel = supabase
            .channel(`org-members-switch-${user.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'organization_members', filter: `user_id=eq.${user.id}` }, (payload: any) => {
                try {
                    const row = (payload?.new || payload?.old || {}) as any;
                    const raw = row?.module_switches || {};
                    const global = (raw && typeof raw === 'object') ? (raw.global || {}) : {};
                    const map: Record<string, boolean> = {};
                    for (const key of Object.keys(global || {})) {
                        const v = (global as any)[key];
                        map[key] = Boolean(v?.active);
                    }
                    setActiveMap(map);
                } catch (_) {}
            })
            .subscribe();

        return () => {
            try { supabase.removeChannel(channel); } catch {}
        };
    }, [user?.id]);

    const hasPermission = (module: string, action: string): boolean => {
        if (module === 'novura_admin') {
            return globalRole === 'nv_superadmin';
        }

        if (activeMap && module in activeMap && activeMap[module] === false) {
            if (globalRole === 'nv_superadmin') return true;
            if (!permissions || !organizationId) return false;
            const mod = (permissions as any)[module];
            if (!mod) return false;
            if (typeof mod === 'object' && mod !== null && !Array.isArray(mod)) {
                if (action === 'view') return (mod as Record<string, boolean>)['view'] === true;
                return false;
            }
            if (typeof mod === 'boolean') {
                return action === 'view' && mod === true;
            }
            if (Array.isArray(mod)) {
                return action === 'view' && (mod as string[]).includes('view');
            }
            return false;
        }

        if (!permissions || !organizationId) return false;

        if (userRole === 'owner') return true;

        const mod = (permissions as any)[module];
        if (!mod) return false;

        if (typeof mod === 'object' && mod !== null && !Array.isArray(mod)) {
            return (mod as Record<string, boolean>)[action] === true;
        }
        if (typeof mod === 'boolean') {
            return mod === true;
        }
        if (Array.isArray(mod)) {
            return (mod as string[]).includes(action);
        }
        return false;
    };

    const hasModuleAccess = (module: string): boolean => {
        if (module === 'novura_admin') {
            return globalRole === 'nv_superadmin';
        }

        if (activeMap && module in activeMap && activeMap[module] === false) {
            if (globalRole === 'nv_superadmin') return true;
            if (!permissions || !organizationId) return false;
            const mod = (permissions as any)[module];
            if (!mod) return false;
            if (typeof mod === 'object' && mod !== null && !Array.isArray(mod)) {
                const obj = mod as Record<string, boolean>;
                if (Object.prototype.hasOwnProperty.call(obj, 'view')) {
                    return obj.view === true;
                }
                return false;
            }
            if (typeof mod === 'boolean') return mod === true;
            if (Array.isArray(mod)) {
                return (mod as string[]).includes('view');
            }
            return false;
        }

        if (!permissions || !organizationId) return false;

        if (userRole === 'owner') return true;

        const mod = (permissions as any)[module];
        if (!mod) return false;

        if (typeof mod === 'boolean') return mod === true;

        if (typeof mod === 'object' && mod !== null && !Array.isArray(mod)) {
            const obj = mod as Record<string, boolean>;
            if (Object.prototype.hasOwnProperty.call(obj, 'view')) {
                return obj.view === true;
            }
            return Object.values(obj).some((v) => v === true);
        }

        if (Array.isArray(mod)) {
            return (mod as any[]).length > 0;
        }
        return false;
    };

    const hasAnyPermission = (module: string, actions: string[]): boolean => {
        if (module === 'novura_admin') {
            return globalRole === 'nv_superadmin';
        }

        if (activeMap && module in activeMap && activeMap[module] === false) {
            if (globalRole === 'nv_superadmin') return true;
            if (!permissions || !organizationId) return false;
            const mod = (permissions as any)[module];
            if (!mod) return false;
            if (typeof mod === 'object' && mod !== null && !Array.isArray(mod)) {
                const obj = mod as Record<string, boolean>;
                if (actions.includes('view')) {
                    return obj.view === true;
                }
                return false;
            }
            if (typeof mod === 'boolean') return actions.includes('view') && mod === true;
            if (Array.isArray(mod)) {
                const list = mod as string[];
                return actions.includes('view') && list.includes('view');
            }
            return false;
        }

        if (!permissions || !organizationId) return false;

        if (userRole === 'owner') return true;

        const mod = (permissions as any)[module];
        if (!mod) return false;

        if (typeof mod === 'boolean') return mod === true;

        if (typeof mod === 'object' && mod !== null && !Array.isArray(mod)) {
            return actions.some((action) => (mod as Record<string, boolean>)[action] === true);
        }

        if (Array.isArray(mod)) {
            const list = mod as string[];
            return actions.some((a) => list.includes(a));
        }
        return false;
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
