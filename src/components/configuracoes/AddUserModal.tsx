
import { StepIndicator } from "@/components/produtos/criar/StepIndicator";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

// Gera um token único seguro (base64url) para convite
function generateInvitationToken(bytesLength: number = 32) {
  const bytes = new Uint8Array(bytesLength);
  crypto.getRandomValues(bytes);
  // Converter para base64url
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

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
      const response = await fetch(`/functions/v1/manage-users?action=invite_user`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: userData.email,
          name: userData.nome,
          phone: userData.telefone,
          permissions: permissions,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao convidar usuário');
      }

      const result = await response.json();

      // Copiar o link para a área de transferência
      try {
        await navigator.clipboard.writeText(result.invitation_link);
      } catch { }

      // Enviar email via cliente padrão (fallback)
      const subject = encodeURIComponent('Convite de acesso - Novura');
      const body = encodeURIComponent(
        `Olá${userData.nome ? ' ' + userData.nome : ''},%0D%0A%0D%0AVocê foi convidado(a) para acessar o sistema Novura.%0D%0A` +
        `Use o link abaixo para concluir seu acesso.%0D%0A%0D%0A` +
        `${result.invitation_link}%0D%0A%0D%0A` +
        `Atenção: este convite expira em 10 minutos.%0D%0A%0D%0A` +
        `Se você não solicitou este convite, ignore este email.`
      );
      const mailtoUrl = `mailto:${encodeURIComponent(userData.email)}?subject=${subject}&body=${body}`;

      // Tentar abrir o cliente de email
      window.open(mailtoUrl, '_blank');

      toast.success('Convite gerado com sucesso! O link foi copiado e o email de convite foi preparado.');
      onUserAdded();
      onOpenChange(false);

      // Reset form
      setCurrentStep(1);
      setUserData({ email: "", nome: "", telefone: "" });
      setPermissions({});
    } catch (error: any) {
      console.error('Erro ao convidar usuário:', error);
      toast.error(error.message || 'Erro ao gerar convite do usuário');
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
              <p className="text-xs text-gray-500 mb-4">Um convite será enviado por email com um token de acesso que expira em 10 minutos.</p>

              {modules.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">Carregando módulos...</p>
                </div>
              ) : (
                <div className="space-y-6 max-h-96 overflow-y-auto">
                  {modules.map((module) => (
                    <div key={module.name} className="border rounded-lg p-4">
                      <h4 className="font-medium text-gray-900 mb-2">{module.display_name}</h4>
                      <p className="text-sm text-gray-600 mb-3">{module.description}</p>

                      <div className="grid grid-cols-1 gap-2">
                        {module.actions.map((action) => (
                          <div key={action.name} className="flex items-center space-x-3">
                            <Checkbox
                              id={`${module.name}-${action.name}`}
                              checked={permissions[module.name]?.[action.name] || false}
                              onCheckedChange={(checked) =>
                                handlePermissionChange(module.name, action.name, checked as boolean)
                              }
                            />
                            <div className="flex-1">
                              <Label
                                htmlFor={`${module.name}-${action.name}`}
                                className="text-sm font-medium text-gray-700 cursor-pointer"
                              >
                                {action.display_name}
                              </Label>
                              <p className="text-xs text-gray-500">{action.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-gray-900">
            Adicionar Usuário
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
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
      </DialogContent>
    </Dialog>
  );
}
