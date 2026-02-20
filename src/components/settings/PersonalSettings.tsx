import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function PersonalSettings() {
  const { user } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifSystem, setNotifSystem] = useState(true);
  const [notifSecurity, setNotifSecurity] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [savingNotif, setSavingNotif] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!user?.id) return;
      setEmail(user.email ?? "");

      try {
        const { data: profile, error } = await supabase
          .from('user_profiles')
          .select('display_name, notifications_enabled, email_notifications')
          .eq('id', user.id)
          .maybeSingle();

        if (!error && profile) {
          if (profile.display_name) setName(profile.display_name);
          if (typeof profile.notifications_enabled === 'boolean') setNotifSystem(!!profile.notifications_enabled);
          if (typeof profile.email_notifications === 'boolean') {
            setNotifEmail(!!profile.email_notifications);
            setNotifSecurity(!!profile.email_notifications);
          }
        }

        if (!name) {
          const { data: usr } = await supabase
            .from('users')
            .select('name')
            .eq('id', user.id)
            .maybeSingle();
          if (usr?.name) setName(usr.name);
          else {
            const meta: any = user.user_metadata || {};
            const nm = meta.name ?? meta.full_name ?? meta.display_name ?? "";
            setName(nm || user.email || "");
          }
        }
      } catch {
        const meta: any = user.user_metadata || {};
        const nm = meta.name ?? meta.full_name ?? meta.display_name ?? "";
        setName(nm || user?.email || "");
      }
    };
    load();
  }, [user?.id]);

  const saveName = async () => {
    if (!user?.id) return;
    setSavingName(true);
    try {
      const { error: pErr } = await supabase
        .from('user_profiles')
        .upsert({ id: user.id, display_name: name }, { onConflict: 'id' });
      if (pErr) throw pErr;

      const { error: uErr } = await supabase
        .from('users')
        .update({ name })
        .eq('id', user.id);
      if (uErr) {
        // Não bloqueia sucesso geral se a tabela users não permitir
        console.warn('Falha ao atualizar users.name (ignorado):', uErr);
      }

      const { error: aErr } = await supabase.auth.updateUser({
        data: { name, full_name: name, display_name: name }
      });
      if (aErr) throw aErr;

      toast.success('Nome atualizado');
    } catch (e) {
      console.error('Erro ao salvar nome:', e);
      toast.error('Erro ao salvar nome');
    } finally {
      setSavingName(false);
    }
  };

  const saveNotifications = async () => {
    if (!user?.id) return;
    setSavingNotif(true);
    try {
      const { error } = await supabase
        .from('user_profiles')
        .upsert({
          id: user.id,
          notifications_enabled: notifSystem,
          email_notifications: notifEmail || notifSecurity,
        }, { onConflict: 'id' });
      if (error) throw error;
      toast.success('Preferências de notificações atualizadas');
    } catch (e) {
      console.error('Erro ao salvar preferências:', e);
      toast.error('Erro ao salvar preferências');
    } finally {
      setSavingNotif(false);
    }
  };

  return (
    <div className="space-y-8">
      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Perfil</h2>
          <p className="text-gray-600 text-sm">Atualize seu nome de exibição.</p>
        </div>
        <div className="space-y-2 max-w-md">
          <Label htmlFor="nm">Nome</Label>
          <Input id="nm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
        </div>
        <div className="space-y-2 max-w-md">
          <Label htmlFor="em">Email</Label>
          <Input id="em" value={email} disabled />
        </div>
        <div className="flex justify-end">
          <Button onClick={saveName} disabled={savingName}>Salvar nome</Button>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Notificações</h2>
          <p className="text-gray-600 text-sm">Preferências de notificações do sistema.</p>
        </div>

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
          <Button onClick={saveNotifications} disabled={savingNotif}>Salvar preferências</Button>
        </div>
      </Card>
    </div>
  );
}