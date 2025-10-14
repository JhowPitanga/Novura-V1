
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { StepIndicator } from "@/components/produtos/criar/StepIndicator";

const steps = [
  { id: 1, title: "Dados", description: "Informações básicas" },
  { id: 2, title: "Permissões", description: "Acessos do sistema" }
];

const systemModules = [
  { id: "desempenho", name: "Desempenho" },
  { id: "produtos", name: "Produtos" },
  { id: "anuncios", name: "Central de Anúncios" },
  { id: "pedidos", name: "Pedidos" },
  { id: "estoque", name: "Estoque" },
  { id: "notas_fiscais", name: "Notas Fiscais" },
  { id: "aplicativos", name: "Aplicativos" },
  { id: "recursos_seller", name: "Recursos Seller" },
  { id: "gerenciar_usuarios", name: "Gerenciar Usuários" }
];

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
  const [userData, setUserData] = useState({
    email: "",
    nome: "",
    telefone: ""
  });
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});

  const handleSave = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Gerar token e expiração de 10 minutos
      const token = generateInvitationToken(32);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      const commonFields = {
        email: userData.email,
        nome: userData.nome,
        telefone: userData.telefone || null,
        permissions: permissions,
        invited_by_user_id: user.id,
        status: 'pendente'
      };

      // 1) Tentar com invitation_token + expires_at
      const { error: e1 } = await supabase
        .from('user_invitations')
        .insert([{ 
          ...commonFields,
          invitation_token: token,
          expires_at: expiresAt
        }]);

      if (e1) {
        const isMissingInvitationToken = (
          typeof e1.message === 'string' && e1.message.includes("Could not find the 'invitation_token' column")
        ) || e1.code === 'PGRST204';

        if (isMissingInvitationToken) {
          // 2) Tentar com token + expires_at
          const { error: e2 } = await supabase
            .from('user_invitations')
            .insert([{ 
              ...(commonFields as any),
              token: token,
              expires_at: expiresAt
            } as any]);

          if (e2) {
            const isMissingExpiresAt = (
              typeof e2.message === 'string' && e2.message.includes("Could not find the 'expires_at' column")
            ) || e2.code === 'PGRST204';

            if (isMissingExpiresAt) {
              // 3) Tentar com token apenas
              const { error: e3 } = await supabase
                .from('user_invitations')
                .insert([{ 
                  ...(commonFields as any),
                  token: token
                } as any]);

              if (e3) throw e3;

              toast.info('Aviso: coluna expires_at não existe na base atual. O convite foi criado sem prazo armazenado.');
            } else {
              throw e2;
            }
          }
        } else {
          throw e1;
        }
      }

      const invitationLink = `${window.location.origin}/convite-permissoes?token=${token}`;

      // Copiar o link para a área de transferência
      try {
        await navigator.clipboard.writeText(invitationLink);
      } catch {}

      // Enviar email via cliente padrão (fallback)
      const subject = encodeURIComponent('Convite de acesso - Novura');
      const body = encodeURIComponent(
        `Olá${userData.nome ? ' ' + userData.nome : ''},%0D%0A%0D%0AVocê foi convidado(a) para acessar o sistema Novura.%0D%0A` +
        `Use o link abaixo para concluir seu acesso e definir suas permissões.%0D%0A%0D%0A` +
        `${invitationLink}%0D%0A%0D%0A` +
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
    } catch (error) {
      console.error('Erro ao convidar usuário:', error);
      toast.error('Erro ao gerar convite do usuário');
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

  const handlePermissionChange = (moduleId: string, checked: boolean) => {
    setPermissions(prev => ({ ...prev, [moduleId]: checked }));
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
              <div className="grid grid-cols-1 gap-3">
                {systemModules.map((module) => (
                  <div key={module.id} className="flex items-center space-x-3">
                    <Checkbox
                      id={module.id}
                      checked={permissions[module.id] || false}
                      onCheckedChange={(checked) => 
                        handlePermissionChange(module.id, checked as boolean)
                      }
                    />
                    <Label 
                      htmlFor={module.id} 
                      className="text-sm font-medium text-gray-700 cursor-pointer"
                    >
                      {module.name}
                    </Label>
                  </div>
                ))}
              </div>
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
