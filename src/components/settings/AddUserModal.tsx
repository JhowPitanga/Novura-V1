
import { StepIndicator } from "@/components/produtos/criar/StepIndicator";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter, DrawerClose } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const steps = [
  { id: 1, title: "Dados", description: "Informações básicas" },
  { id: 2, title: "Permissões", description: "Acessos do sistema" }
];

interface SystemModule {
  id: string;
  name: string;
  display_name: string;
  description: string;
  actions: ModuleAction[];
}

interface ModuleAction {
  id: string;
  name: string;
  display_name: string;
  description: string;
}

interface AddUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUserAdded: () => void;
}

// (token generator removido - convite agora via Supabase Auth)

// handleNext e handleBack movidos para dentro do componente AddUserModal

export function AddUserModal({ open, onOpenChange, onUserAdded }: AddUserModalProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [modules, setModules] = useState<SystemModule[]>([]);
  const { organizationId } = useAuth();
  const [userData, setUserData] = useState({
    email: "",
    nome: "",
    telefone: ""
  });
  const [permissions, setPermissions] = useState<Record<string, Record<string, boolean>>>({});

  useEffect(() => {
    if (open) {
      loadModules();
    }
  }, [open]);

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

      const formattedModules: SystemModule[] = data.map(module => ({
        id: module.id,
        name: module.name,
        display_name: module.display_name,
        description: module.description,
        actions: module.module_actions.map((action: any) => ({
          id: action.id,
          name: action.name,
          display_name: action.display_name,
          description: action.description,
        }))
      }));

      setModules(formattedModules);
    } catch (error) {
      console.error('Erro ao carregar módulos:', error);
      toast.error('Erro ao carregar módulos do sistema');
    }
  };


  const handleSave = async () => {
    if (!organizationId) {
      toast.error('Erro: organização não encontrada');
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

      const { data, error } = await supabase.functions.invoke('manage-users', {
        body: {
          action: 'invite_user',
          email: userData.email,
          name: userData.nome,
          phone: userData.telefone,
          permissions: permissions,
        },
        headers: { Authorization: `Bearer ${session.data.session.access_token}` },
      });
      if (error) throw error;
      // Convite enviado via Supabase Auth
      toast.success('Convite enviado por email com sucesso.');
      onUserAdded();
      onOpenChange(false);

      // Reset form
      setCurrentStep(1);
      setUserData({ email: "", nome: "", telefone: "" });
      setPermissions({});
    } catch (error: any) {
      let message = error?.message || 'Erro ao enviar convite do usuário';
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
      console.error('Erro ao convidar usuário:', error);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (currentStep === 1 && !userData.email) {
      toast.error("Email é obrigatório");
      return;
    }
    if (currentStep < 2) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleSave();
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handlePermissionChange = (moduleName: string, actionName: string, checked: boolean) => {
    setPermissions(prev => ({
      ...prev,
      [moduleName]: {
        ...prev[moduleName],
        [actionName]: checked
      }
    }));
  };

  const handleToggleAllModule = (moduleName: string, actionNames: string[], check: boolean) => {
    setPermissions(prev => ({
      ...prev,
      [moduleName]: actionNames.reduce((acc, action) => {
        acc[action] = check;
        return acc;
      }, {} as Record<string, boolean>)
    }));
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                Email *
              </Label>
              <Input
                id="email"
                type="email"
                value={userData.email}
                onChange={(e) => setUserData(prev => ({ ...prev, email: e.target.value }))}
                className="mt-1"
                placeholder="usuario@empresa.com"
                required
              />
            </div>

            <div>
              <Label htmlFor="nome" className="text-sm font-medium text-gray-700">
                Nome
              </Label>
              <Input
                id="nome"
                value={userData.nome}
                onChange={(e) => setUserData(prev => ({ ...prev, nome: e.target.value }))}
                className="mt-1"
                placeholder="Nome do usuário"
              />
            </div>

            <div>
              <Label htmlFor="telefone" className="text-sm font-medium text-gray-700">
                Telefone
              </Label>
              <Input
                id="telefone"
                value={userData.telefone}
                onChange={(e) => setUserData(prev => ({ ...prev, telefone: e.target.value }))}
                className="mt-1"
                placeholder="(11) 99999-9999"
              />
            </div>

            
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Selecione as permissões do usuário
              </h3>
              <p className="text-xs text-gray-500 mb-4">Um convite será enviado por email usando o sistema de autenticação.</p>

              

              {modules.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">Carregando módulos...</p>
                </div>
              ) : (
                <div className="space-y-6 max-h-96 overflow-y-auto">
                  {modules.map((module) => {
                    // Regras especiais por módulo
                    let visibleActions = module.actions;
                    const moduleKey = module.name;

                    // Pesquisa de mercado: checkbox único "Acesso" agregando todas as ações
                    const isPesquisa = moduleKey === 'pesquisa_mercado';
                    // Recursos seller: apenas Visualizar e Comprar
                    const isRecursosSeller = moduleKey === 'recursos_seller';

                    if (isRecursosSeller) {
                      visibleActions = module.actions.filter(a => ['view', 'buy'].includes(a.name));
                    }

                    // Para pesquisa de mercado, criamos uma ação virtual de acesso
                    const pesquisaAllActionNames = module.actions.map(a => a.name);
                    const isPesquisaChecked = isPesquisa
                      ? pesquisaAllActionNames.length > 0 && pesquisaAllActionNames.every(a => permissions[moduleKey]?.[a])
                      : false;

                    const handlePesquisaToggle = (checked: boolean) => {
                      handleToggleAllModule(moduleKey, pesquisaAllActionNames, checked);
                    };

                    // Para os demais módulos, botão Marcar todas
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
                                    handlePermissionChange(moduleKey, action.name, checked as boolean)
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
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right" shouldScaleBackground={false}>
      <DrawerContent className="w-[45%] p-6 overflow-y-auto overflow-x-hidden fixed right-0 shadow-none">
        <DrawerHeader>
          <DrawerTitle className="text-2xl font-bold text-gray-900">
            Adicionar Usuário
          </DrawerTitle>
        </DrawerHeader>

        <div className="space-y-6 p-4">
          <StepIndicator steps={steps} currentStep={currentStep} />

          <div className="min-h-[300px]">
            {renderCurrentStep()}
          </div>

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
              disabled={loading}
              className="bg-novura-primary hover:bg-novura-primary/90"
            >
              {loading ? "Salvando..." : currentStep === 2 ? "Enviar Convite" : "Próximo"}
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
