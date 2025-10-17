import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter, DrawerClose } from "@/components/ui/drawer";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { StepIndicator } from "@/components/produtos/criar/StepIndicator";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

interface ModuleAction {
  id: string;
  name: string;
  display_name: string;
  description: string;
}

interface SystemModule {
  id: string;
  name: string;
  display_name: string;
  description: string;
  actions: ModuleAction[];
}

interface EditPermissionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | undefined;
  initialPermissions: Record<string, Record<string, boolean>>;
  onSaved: () => void;
}

export function EditPermissionsModal({ open, onOpenChange, userId, initialPermissions, onSaved }: EditPermissionsModalProps) {
  const { organizationId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [modules, setModules] = useState<SystemModule[]>([]);
  const [permissions, setPermissions] = useState<Record<string, Record<string, boolean>>>({});
  const [currentStep, setCurrentStep] = useState(1);

  const steps = [
    { id: 1, title: "Dados", description: "Informações do membro" },
    { id: 2, title: "Permissões", description: "Acessos do sistema" }
  ];

  const [userData, setUserData] = useState({ email: "", nome: "" });
  const [initialUserData, setInitialUserData] = useState({ email: "", nome: "" });

  // Reset state on open and seed with initial permissions
  useEffect(() => {
    if (open) {
      setPermissions(initialPermissions || {});
      setCurrentStep(1);
      loadModules();
      if (userId) {
        loadUserDetails();
      }
    }
  }, [open, userId]);

  // Ensure stable list of module keys to allow mark all logic
  const moduleKeys = useMemo(() => modules.map(m => m.name), [modules]);

  const loadModules = async () => {
    try {
      const { data, error } = await supabase
        .from('system_modules')
        .select(`
          id,
          name,
          display_name,
          description,
          module_actions (
            id,
            name,
            display_name,
            description
          )
        `)
        .order('name');

      if (error) throw error;

      const formatted: SystemModule[] = (data || []).map((module: any) => ({
        id: module.id,
        name: module.name,
        display_name: module.display_name,
        description: module.description,
        actions: (module.module_actions || []).map((a: any) => ({
          id: a.id,
          name: a.name,
          display_name: a.display_name,
          description: a.description,
        }))
      }));
      setModules(formatted);
    } catch (e) {
      console.error('Erro ao carregar módulos:', e);
      toast.error('Erro ao carregar módulos do sistema');
    }
  };

  const loadUserDetails = async () => {
    if (!userId) return;
    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        toast.error('Sessão expirada. Faça login novamente.');
        return;
      }

      const { data, error } = await supabase.functions.invoke('manage-users', {
        body: {
          action: 'get_user_details',
          user_id: userId
        },
        headers: { Authorization: `Bearer ${session.data.session.access_token}` },
      });
      if (error) throw error;
      const email = (data as any)?.email || "";
      const nome = (data as any)?.name || (email ? email.split('@')[0] : "");
      setUserData({ email, nome });
      setInitialUserData({ email, nome });
    } catch (e: any) {
      console.error('Erro ao carregar dados do usuário:', e);
      let message = e?.message || 'Não foi possível carregar os dados do usuário';
      try {
        const ctx: any = e?.context || {};
        if (ctx.body) {
          const text = await new Response(ctx.body).text();
          try {
            const json = JSON.parse(text);
            message = json.error || json.message || text;
          } catch {
            message = text;
          }
        }
      } catch {}
      toast.error(message);
    }
  };

  const handlePermissionChange = (moduleName: string, actionName: string, checked: boolean) => {
    setPermissions(prev => ({
      ...prev,
      [moduleName]: {
        ...prev[moduleName],
        [actionName]: checked,
      }
    }));
  };

  const handleToggleAllModule = (moduleName: string, actionNames: string[], check: boolean) => {
    setPermissions(prev => ({
      ...prev,
      [moduleName]: actionNames.reduce((acc, action) => {
        acc[action] = check;
        return acc;
      }, {} as Record<string, boolean>),
    }));
  };

  const handleSave = async () => {
    if (!organizationId) {
      toast.error('Erro: organização não encontrada');
      return;
    }
    if (!userId) {
      toast.error('Erro: usuário não selecionado');
      return;
    }
    setLoading(true);
    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        toast.error('Sessão expirada. Faça login novamente.');
        setLoading(false);
        return;
      }

      // Atualiza identidade apenas quando o nome mudou (email é somente leitura neste modal)
      if (userData.nome !== initialUserData.nome) {
        const { error: identError } = await supabase.functions.invoke('manage-users', {
          body: {
            action: 'update_user_identity',
            user_id: userId,
            name: userData.nome,
          },
          headers: { Authorization: `Bearer ${session.data.session.access_token}` },
        });
        if (identError) throw identError;
      }

      const { error: permError } = await supabase.functions.invoke('manage-users', {
        body: {
          action: 'update_user_permissions',
          user_id: userId,
          permissions,
        },
        headers: { Authorization: `Bearer ${session.data.session.access_token}` },
      });
      if (permError) throw permError;

      toast.success('Permissões atualizadas com sucesso');
      onSaved();
      onOpenChange(false);
    } catch (error: any) {
      let message = error?.message || 'Erro ao atualizar permissões';
      try {
        const ctx: any = error?.context || {};
        if (ctx.body) {
          const text = await new Response(ctx.body).text();
          try {
            const json = JSON.parse(text);
            message = json.error || json.message || text;
          } catch {
            message = text;
          }
        }
      } catch {}
      console.error('Erro ao atualizar permissões:', error);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSendPasswordReset = async () => {
    if (!userId) return;
    try {
      const { data, error } = await supabase.functions.invoke('manage-users', {
        body: {
          action: 'send_password_reset',
          user_id: userId,
        },
        headers: { Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` },
      });
      if (error) throw error;
      toast.success('Email de redefinição de senha enviado');
    } catch (e: any) {
      console.error('Erro ao enviar redefinição de senha:', e);
      toast.error(e?.message || 'Não foi possível enviar o email de redefinição');
    }
  };

  const handleNext = () => {
    if (currentStep < 2) {
      // Validação mínima: email não vazio quando alterado
      if (!userData.email) {
        toast.error('Email é obrigatório');
        return;
      }
      setCurrentStep(prev => prev + 1);
    } else {
      handleSave();
    }
  };

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep(prev => prev - 1);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right" shouldScaleBackground={false}>
      <DrawerContent className="w-[45%] p-6 overflow-y-auto overflow-x-hidden fixed right-0 shadow-none">
        <DrawerHeader>
          <DrawerTitle className="text-2xl font-bold text-gray-900">
            Editar Permissões
          </DrawerTitle>
        </DrawerHeader>

        <div className="space-y-6 p-4">
          <StepIndicator steps={steps as any} currentStep={currentStep} />

          {currentStep === 1 && (
            <div className="space-y-4 min-h-[300px]">
              <div>
                <Label htmlFor="email" className="text-sm font-medium text-gray-700">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={userData.email}
                  className="mt-1"
                  placeholder="usuario@empresa.com"
                  disabled
                  readOnly
                />
                <p className="text-xs text-gray-500 mt-1">O e-mail é gerenciado pelo login e não pode ser alterado aqui.</p>
              </div>

              <div>
                <Label htmlFor="nome" className="text-sm font-medium text-gray-700">Nome</Label>
                <Input
                  id="nome"
                  value={userData.nome}
                  onChange={(e) => setUserData(prev => ({ ...prev, nome: e.target.value }))}
                  className="mt-1"
                  placeholder="Nome do usuário"
                />
              </div>

              <div className="pt-2">
                <Button variant="outline" onClick={handleSendPasswordReset} disabled={!userId}>
                  Enviar e-mail de redefinição de senha
                </Button>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            modules.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">Carregando módulos...</p>
              </div>
            ) : (
              <div className="space-y-6 max-h-[60vh] overflow-y-auto">
                {modules.map((module) => {
                  let visibleActions = module.actions;
                  const moduleKey = module.name;

                  const isPesquisa = moduleKey === 'pesquisa_mercado';
                  const isRecursosSeller = moduleKey === 'recursos_seller';

                if (isRecursosSeller) {
                  visibleActions = module.actions.filter(a => ['view', 'buy'].includes(a.name));
                }

                const pesquisaAllActionNames = module.actions.map(a => a.name);
                const isPesquisaChecked = isPesquisa
                  ? pesquisaAllActionNames.length > 0 && pesquisaAllActionNames.every(a => permissions[moduleKey]?.[a])
                  : false;

                const handlePesquisaToggle = (checked: boolean) => {
                  handleToggleAllModule(moduleKey, pesquisaAllActionNames, checked);
                };

                const realVisibleActionNames = isPesquisa
                  ? []
                  : visibleActions.map(a => a.name);
                const allChecked = realVisibleActionNames.length > 0 && realVisibleActionNames.every(a => permissions[moduleKey]?.[a]);

                return (
                  <div key={moduleKey} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h4 className="font-medium text-gray-900">{module.display_name}</h4>
                        <p className="text-sm text-gray-600">{module.description}</p>
                      </div>
                      {!isPesquisa && realVisibleActionNames.length > 1 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleAllModule(moduleKey, realVisibleActionNames, !allChecked)}
                        >
                          {allChecked ? 'Desmarcar todas' : 'Marcar todas'}
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-2 mt-2">
                      {isPesquisa ? (
                        <div className="flex items-center space-x-3">
                          <Checkbox
                            id={`${moduleKey}-acesso`}
                            checked={isPesquisaChecked}
                            onCheckedChange={(checked) => handlePesquisaToggle(!!checked)}
                          />
                          <div className="flex-1">
                            <Label htmlFor={`${moduleKey}-acesso`} className="text-sm font-medium text-gray-700 cursor-pointer">
                              Acesso
                            </Label>
                            <p className="text-xs text-gray-500">Concede acesso total ao módulo de Pesquisa de Mercado.</p>
                          </div>
                        </div>
                      ) : (
                        visibleActions.map((action) => (
                          <div key={action.name} className="flex items-center space-x-3">
                            <Checkbox
                              id={`${moduleKey}-${action.name}`}
                              checked={permissions[moduleKey]?.[action.name] || false}
                              onCheckedChange={(checked) =>
                                handlePermissionChange(moduleKey, action.name, !!checked)
                              }
                            />
                            <div className="flex-1">
                              <Label
                                htmlFor={`${moduleKey}-${action.name}`}
                                className="text-sm font-medium text-gray-700 cursor-pointer"
                              >
                                {action.display_name}
                              </Label>
                              <p className="text-xs text-gray-500">{action.description}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
              </div>
            )
          )}

          <div className="flex justify-between pt-6 border-t">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 1}
            >
              Voltar
            </Button>

            <Button
              onClick={handleNext}
              disabled={loading || !userId}
              className="bg-novura-primary hover:bg-novura-primary/90"
            >
              {loading ? 'Salvando...' : currentStep === 2 ? 'Salvar alterações' : 'Próximo'}
            </Button>
          </div>
        </div>

        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline" data-autofocus>
              Fechar
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}