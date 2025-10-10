import { useAuth } from './useAuth';

export function usePermissions() {
    const { permissions, userRole, organizationId } = useAuth();

    const hasPermission = (module: string, action: string): boolean => {
        if (!permissions || !organizationId) return false;

        // Owners have all permissions
        if (userRole === 'owner') return true;

        return permissions[module]?.[action] === true;
    };

    const hasModuleAccess = (module: string): boolean => {
        if (!permissions || !organizationId) return false;

        // Owners have all permissions
        if (userRole === 'owner') return true;

        return Object.keys(permissions[module] || {}).length > 0;
    };

    const hasAnyPermission = (module: string, actions: string[]): boolean => {
        if (!permissions || !organizationId) return false;

        // Owners have all permissions
        if (userRole === 'owner') return true;

        const modulePermissions = permissions[module];
        if (!modulePermissions) return false;

        return actions.some(action => modulePermissions[action] === true);
    };

    const canManageUsers = (): boolean => {
        return hasPermission('usuarios', 'manage_permissions') || userRole === 'owner';
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
