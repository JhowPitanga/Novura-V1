
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Phone, Plus, Settings2, Shield, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AddUserModal } from "./AddUserModal";
import { UserProfileDrawer } from "./UserProfileDrawer";

interface OrganizationMember {
  id: string;
  role: string;
  permissions: Record<string, Record<string, boolean>>;
  created_at: string;
  updated_at: string;
  user_id: string;
  users: {
    id: string;
    email: string;
    name: string | null;
    last_login: string | null;
  };
}

interface ConfiguracoesUsuariosProps {
  onClose?: () => void;
}

export function ConfiguracoesUsuarios({ onClose }: ConfiguracoesUsuariosProps = {}) {
  const [users, setUsers] = useState<OrganizationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const { user, organizationId } = useAuth();
  const { canManageUsers, canInviteUsers } = usePermissions();
  const [currentUserData, setCurrentUserData] = useState({
    id: '',
    nome: '',
    email: '',
    telefone: '',
    status: 'ativo',
    permissions: { admin: true }
  });

  useEffect(() => {
    if (!organizationId) {
      toast.error('Você precisa estar em uma organização para gerenciar usuários');
      return;
    }

    if (!canManageUsers() && !canInviteUsers()) {
      toast.error('Você não tem permissão para acessar esta página');
      return;
    }

    loadUsers();
    loadCurrentUser();
  }, [user, organizationId, canManageUsers, canInviteUsers]);

  const loadCurrentUser = async () => {
    if (user) {
      setCurrentUserData({
        id: user.id,
        nome: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuário',
        email: user.email || '',
        telefone: user.user_metadata?.phone || '',
        status: 'ativo',
        permissions: { admin: true }
      });
    }
  };

  const loadUsers = async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`/functions/v1/manage-users?action=list_users`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load users');
      }

      const result = await response.json();
      setUsers(result.users || []);
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
      toast.error('Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = () => {
    if (!canInviteUsers()) {
      toast.error('Você não tem permissão para convidar usuários');
      return;
    }
    setShowAddUserModal(true);
  };

  const handleDeleteUser = async (userId: string) => {
    if (!canManageUsers()) {
      toast.error('Você não tem permissão para remover usuários');
      return;
    }

    try {
      const response = await fetch(`/functions/v1/manage-users?action=remove_user`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user_id: userId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to remove user');
      }

      toast.success('Usuário removido com sucesso');
      loadUsers();
    } catch (error: any) {
      console.error('Erro ao remover usuário:', error);
      toast.error(error.message || 'Erro ao remover usuário');
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      pendente: "bg-yellow-100 text-yellow-800",
      ativo: "bg-green-100 text-green-800",
      inativo: "bg-red-100 text-red-800"
    };

    return (
      <Badge className={variants[status as keyof typeof variants]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const countPermissions = (permissions: any) => {
    if (!permissions || typeof permissions !== 'object') return 0;
    return Object.values(permissions).filter(Boolean).length;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Usuários da Organização</h2>
            <p className="text-gray-600 mt-1">Gerencie usuários e permissões da organização</p>
          </div>
          {canInviteUsers() && (
            <Button
              onClick={handleAddUser}
              className="bg-novura-primary hover:bg-novura-primary/90"
              size="lg"
            >
              <Plus className="w-5 h-5 mr-2" />
              Convidar Usuário
            </Button>
          )}
        </div>
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-6">
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Usuários</h2>
          <p className="text-gray-600 mt-1">Gerencie usuários e permissões do sistema</p>
        </div>
        <Button
          onClick={handleAddUser}
          className="bg-novura-primary hover:bg-novura-primary/90"
          size="lg"
        >
          <Plus className="w-5 h-5 mr-2" />
          Adicionar Usuário
        </Button>
      </div>

      {/* Usuário Atual */}
      <Card className="p-6 border-2 border-novura-primary/20 bg-gradient-to-r from-novura-primary/5 to-transparent">
        <div className="flex justify-between items-start">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-gray-900">
                {currentUserData.nome}
              </h3>
              {getStatusBadge(currentUserData.status)}
              <Badge className="bg-novura-primary text-white">
                Usuário Atual
              </Badge>
              <Badge variant="outline">
                {userRole === 'owner' ? 'Proprietário' : userRole === 'admin' ? 'Administrador' : 'Membro'}
              </Badge>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-gray-600">
                <Mail className="w-4 h-4" />
                <span className="text-sm">{currentUserData.email}</span>
              </div>

              {currentUserData.telefone && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Phone className="w-4 h-4" />
                  <span className="text-sm">{currentUserData.telefone}</span>
                </div>
              )}

              <div className="flex items-center gap-2 text-gray-600">
                <Shield className="w-4 h-4" />
                <span className="text-sm">
                  {Object.keys(permissions || {}).length} módulos com acesso
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <UserProfileDrawer isAdmin={userRole === 'owner' || userRole === 'admin'}>
              <Button
                size="sm"
                className="bg-novura-primary hover:bg-novura-primary/90"
              >
                <Settings2 className="w-4 h-4 mr-2" />
                Configurar Perfil
              </Button>
            </UserProfileDrawer>
          </div>
        </div>
      </Card>

      {/* Lista de Usuários */}
      {users.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="max-w-sm mx-auto">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Nenhum usuário na organização
            </h3>
            <p className="text-gray-600 mb-4">
              Convide usuários para fazer parte da organização
            </p>
            {canInviteUsers() && (
              <Button
                onClick={handleAddUser}
                className="bg-novura-primary hover:bg-novura-primary/90"
              >
                <Plus className="w-4 h-4 mr-2" />
                Convidar Primeiro Usuário
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <div className="grid gap-4">
          {users.map((user) => (
            <Card key={user.id} className="p-6 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {user.users?.name || user.users?.email?.split('@')[0] || 'Usuário'}
                    </h3>
                    <Badge variant="outline">
                      {user.role === 'owner' ? 'Proprietário' : user.role === 'admin' ? 'Administrador' : 'Membro'}
                    </Badge>
                    {user.users?.last_login && (
                      <span className="text-xs text-gray-500">
                        Último acesso: {new Date(user.users.last_login).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Mail className="w-4 h-4" />
                      <span className="text-sm">{user.users?.email}</span>
                    </div>

                    <div className="flex items-center gap-2 text-gray-600">
                      <Shield className="w-4 h-4" />
                      <span className="text-sm">
                        {Object.keys(user.permissions || {}).length} módulos com acesso
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <p className="text-sm text-gray-500 mr-4">
                    Membro desde {new Date(user.created_at).toLocaleDateString('pt-BR')}
                  </p>

                  {canManageUsers() && user.user_id !== currentUserData.id && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover usuário</AlertDialogTitle>
                          <AlertDialogDescription>
                            Tem certeza que deseja remover {user.users?.name || user.users?.email} da organização?
                            Esta ação não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeleteUser(user.user_id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Remover
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <AddUserModal
        open={showAddUserModal}
        onOpenChange={setShowAddUserModal}
        onUserAdded={loadUsers}
      />
    </div>
  );
}
