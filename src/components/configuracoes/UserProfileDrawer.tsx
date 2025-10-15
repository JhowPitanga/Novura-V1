
import React, { useEffect, useId, useRef, useState } from "react";
import { Drawer, DrawerTrigger, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface UserProfileDrawerProps {
  children: React.ReactNode;
  isAdmin?: boolean;
}

export function UserProfileDrawer({ children, isAdmin }: UserProfileDrawerProps) {
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifSystem, setNotifSystem] = useState(true);
  const [notifSecurity, setNotifSecurity] = useState(true);
  const [pin, setPin] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [receivedCode, setReceivedCode] = useState("");
  const [pinVerified, setPinVerified] = useState(false);
  const [passwordCurrent, setPasswordCurrent] = useState("");
  const [passwordNew, setPasswordNew] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const { user } = useAuth();

  useEffect(() => {
    const loadProfile = async () => {
      if (!user?.id) return;
      setProfileEmail(user.email ?? "");

      try {
        // 1) Tenta pegar do perfil (display_name e notificações)
        const { data: profile, error: profileError } = await supabase
          .from('user_profiles')
          .select('display_name, notifications_enabled, email_notifications')
          .eq('id', user.id)
          .maybeSingle();
        if (!profileError && profile) {
          if (profile.display_name) setProfileName(profile.display_name);
          if (typeof profile.notifications_enabled === 'boolean') setNotifSystem(!!profile.notifications_enabled);
          if (typeof profile.email_notifications === 'boolean') {
            setNotifEmail(!!profile.email_notifications);
            setNotifSecurity(!!profile.email_notifications);
          }
          if (profile.display_name) return;
        }

        // 2) Fallback: pega de users.name
        const { data: userRow, error: userError } = await supabase
          .from('users')
          .select('name')
          .eq('id', user.id)
          .maybeSingle();
        if (!userError && userRow?.name) {
          setProfileName(userRow.name);
          return;
        }

        // 3) Últimos fallbacks: metadata e e-mail
        const meta: any = user.user_metadata || {};
        const nameFromMeta = meta.name ?? meta.full_name ?? meta.display_name ?? "";
        setProfileName(nameFromMeta || user.email || "");
      } catch (e) {
        const meta: any = user.user_metadata || {};
        const nameFromMeta = meta.name ?? meta.full_name ?? meta.display_name ?? "";
        setProfileName(nameFromMeta || user.email || "");
      }
    };

    loadProfile();
  }, [user?.id]);

  useEffect(() => {
    if (open) {
      const activeEl = document.activeElement as HTMLElement | null;
      if (activeEl && !contentRef.current?.contains(activeEl)) {
        activeEl.blur();
      }
      setTimeout(() => {
        const autofocusEl = contentRef.current?.querySelector<HTMLElement>("[data-autofocus]");
        const firstFocusable =
          autofocusEl ||
          contentRef.current?.querySelector<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
        if (firstFocusable) {
          firstFocusable.focus();
        } else {
          contentRef.current?.focus();
        }
      }, 0);
    }
  }, [open]);

  const handleSendCode = () => {
    if (!pin) {
      toast.error("Informe o PIN para enviar o código");
      return;
    }
    setCodeSent(true);
    toast.success("Código enviado para seu email");
  };

  const handleValidateCode = () => {
    if (!receivedCode) {
      toast.error("Informe o código recebido");
      return;
    }
    setPinVerified(true);
    toast.success("Código validado. Você pode atualizar a senha.");
  };

  const handleUpdatePassword = () => {
    if (passwordNew !== passwordConfirm) {
      toast.error("As senhas não coincidem");
      return;
    }
    toast.success("Senha atualizada com sucesso");
  };

  const handleSaveProfile = async () => {
    if (!user?.id) return;
    try {
      // 1) Atualiza/insere no perfil público (display_name)
      const { error: profileError } = await supabase
        .from('user_profiles')
        .upsert({ id: user.id, display_name: profileName }, { onConflict: 'id' });
      if (profileError) throw profileError;

      // 2) Mantém tabela users.name alinhada
      const { error: usersError } = await supabase
        .from('users')
        .update({ name: profileName })
        .eq('id', user.id);
      if (usersError) throw usersError;

      // 3) Mantém metadata alinhada (opcional, útil para fluxos legados)
      const { error: authError } = await supabase.auth.updateUser({
        data: { name: profileName, full_name: profileName, display_name: profileName },
      });
      if (authError) throw authError;

      toast.success("Perfil atualizado");
    } catch (e) {
      console.error('Erro ao salvar perfil:', e);
      toast.error("Erro ao salvar perfil");
    }
  };

  const handleSaveNotifications = async () => {
    if (!user?.id) return;
    try {
      const { error: profileError } = await supabase
        .from('user_profiles')
        .upsert({
          id: user.id,
          notifications_enabled: notifSystem,
          email_notifications: notifEmail || notifSecurity,
        }, { onConflict: 'id' });
      if (profileError) throw profileError;

      toast.success("Preferências de notificações atualizadas");
    } catch (e) {
      console.error('Erro ao salvar preferências:', e);
      toast.error("Erro ao salvar preferências");
    }
  };

  return (
    <Drawer open={open} onOpenChange={setOpen} direction="right" shouldScaleBackground={false}>
      <DrawerTrigger asChild>
        {children}
      </DrawerTrigger>
      <DrawerContent
        ref={contentRef}
        className="w-[45%] p-6 overflow-y-auto overflow-x-hidden fixed right-0 shadow-none"
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
      >
        <DrawerHeader>
          <DrawerTitle id={titleId}>Configurações de Perfil</DrawerTitle>
          <DrawerDescription id={descriptionId}>
            Gerencie as preferências da sua conta{isAdmin ? " e permissões de administrador" : ""}.
          </DrawerDescription>
        </DrawerHeader>
        <div className="p-4">
          <Tabs defaultValue="perfil" className="w-full">
            <TabsList className="grid w-full grid-cols-3 max-w-lg mb-6 h-12 bg-gray-100 rounded-md">
              <TabsTrigger value="perfil" className="text-sm font-medium data-[state=active]:bg-white data-[state=active]:text-novura-primary data-[state=active]:shadow-sm">Perfil</TabsTrigger>
              <TabsTrigger value="notificacoes" className="text-sm font-medium data-[state=active]:bg-white data-[state=active]:text-novura-primary data-[state=active]:shadow-sm">Notificações</TabsTrigger>
              <TabsTrigger value="senha" className="text-sm font-medium data-[state=active]:bg-white data-[state=active]:text-novura-primary data-[state=active]:shadow-sm">Senha</TabsTrigger>
            </TabsList>

            <TabsContent value="perfil" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome</Label>
                <Input
                  id="nome"
                  placeholder="Seu nome"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email (bloqueado)</Label>
                <Input
                  id="email"
                  placeholder="seu.email@exemplo.com"
                  value={profileEmail}
                  onChange={(e) => setProfileEmail(e.target.value)}
                  disabled
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSaveProfile}>
                  Salvar alterações
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="notificacoes" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Notificações por Email</p>
                  <p className="text-sm text-gray-600">Receber atualizações e avisos por email.</p>
                </div>
                <Switch checked={notifEmail} onCheckedChange={setNotifEmail} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Alertas do Sistema</p>
                  <p className="text-sm text-gray-600">Notificações dentro da plataforma.</p>
                </div>
                <Switch checked={notifSystem} onCheckedChange={setNotifSystem} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Alertas de Segurança</p>
                  <p className="text-sm text-gray-600">Tentativas de login, mudanças críticas.</p>
                </div>
                <Switch checked={notifSecurity} onCheckedChange={setNotifSecurity} />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSaveNotifications}>
                  Salvar preferências
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="senha" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pin">PIN de acesso</Label>
                <Input
                  id="pin"
                  placeholder="Digite seu PIN"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handleSendCode}>Enviar Código</Button>
                {codeSent && <span className="text-sm text-gray-600">Código enviado. Verifique seu email.</span>}
              </div>
              {codeSent && (
                <div className="space-y-2">
                  <Label htmlFor="codigo">Código recebido</Label>
                  <Input
                    id="codigo"
                    placeholder="Informe o código"
                    value={receivedCode}
                    onChange={(e) => setReceivedCode(e.target.value)}
                  />
                  <div className="flex justify-end">
                    <Button onClick={handleValidateCode}>Validar código</Button>
                  </div>
                </div>
              )}

              {pinVerified && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="senha-atual">Senha atual</Label>
                    <Input
                      id="senha-atual"
                      type="password"
                      value={passwordCurrent}
                      onChange={(e) => setPasswordCurrent(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nova-senha">Nova senha</Label>
                    <Input
                      id="nova-senha"
                      type="password"
                      value={passwordNew}
                      onChange={(e) => setPasswordNew(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmar-senha">Confirmar nova senha</Label>
                    <Input
                      id="confirmar-senha"
                      type="password"
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={handleUpdatePassword}>Atualizar senha</Button>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline" data-autofocus>Fechar</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
