import { useAuth } from './useAuth';

export function usePermissions() {
    const { permissions, userRole, organizationId } = useAuth();

    const hasPermission = (module: string, action: string): boolean => {
        // Módulo público: sempre permitido
        if (module === 'novura_academy') return true;

        if (!permissions || !organizationId) return false;

        // Owners have all permissions
        if (userRole === 'owner') return true;

        const mod = (permissions as any)[module];
        if (!mod) return false;

        // Suporta três formatos possíveis:
        // 1) Objeto de ações: { view: true, edit: false }
        if (typeof mod === 'object' && mod !== null && !Array.isArray(mod)) {
            return (mod as Record<string, boolean>)[action] === true;
        }
        // 2) Booleano agregador: true significa acesso total ao módulo
        if (typeof mod === 'boolean') {
            return mod === true;
        }
        // 3) Lista de ações: ['view','edit']
        if (Array.isArray(mod)) {
            return (mod as string[]).includes(action);
        }
        return false;
    };

    const hasModuleAccess = (module: string): boolean => {
        // Módulo público: sempre visível
        if (module === 'novura_academy') return true;

        if (!permissions || !organizationId) return false;

        // Owners have all permissions
        if (userRole === 'owner') return true;

        const mod = (permissions as any)[module];
        if (!mod) return false;

        // 1) Booleano agregador (qualquer valor true habilita o módulo)
        if (typeof mod === 'boolean') return mod === true;

        // 2) Objeto de ações: exibe se houver ao menos UMA ação verdadeira
        if (typeof mod === 'object' && mod !== null && !Array.isArray(mod)) {
            return Object.values(mod as Record<string, boolean>).some((v) => v === true);
        }

        // 3) Lista de ações: exibe se houver pelo menos uma ação
        if (Array.isArray(mod)) {
            return (mod as any[]).length > 0;
        }
        return false;
    };

    const hasAnyPermission = (module: string, actions: string[]): boolean => {
        // Módulo público: sempre permitido
        if (module === 'novura_academy') return true;

        if (!permissions || !organizationId) return false;

        // Owners have all permissions
        if (userRole === 'owner') return true;

        const mod = (permissions as any)[module];
        if (!mod) return false;

        // 1) Booleano agregador: tem qualquer permissão no módulo
        if (typeof mod === 'boolean') return mod === true;

        // 2) Objeto de ações
        if (typeof mod === 'object' && mod !== null && !Array.isArray(mod)) {
            return actions.some((action) => (mod as Record<string, boolean>)[action] === true);
        }

        // 3) Lista de ações
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
    };
}
