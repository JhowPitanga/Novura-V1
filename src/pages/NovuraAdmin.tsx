import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { CleanNavigation } from "@/components/CleanNavigation";
import { Routes, Route } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

type SystemModule = {
  id: string;
  name: string;
  display_name: string;
  description?: string | null;
  active?: boolean | null;
};

const navigationItems = [
  { title: "Módulos", path: "", description: "Gerencie módulos do sistema" },
  { title: "Usuários", path: "/usuarios", description: "Gerencie usuários" },
];

export default function NovuraAdmin() {
  const { userRole, permissions, user, organizationId } = useAuth();
  const [modules, setModules] = useState<SystemModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingIds, setSavingIds] = useState<string[]>([]);
  const [members, setMembers] = useState<{ id: string; user_id: string; role: string; permissions: any; users?: { id: string; email?: string; name?: string | null } }[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [configModule, setConfigModule] = useState<SystemModule | null>(null);
  const [allowedUserIds, setAllowedUserIds] = useState<string[]>([]);
  const [savingConfig, setSavingConfig] = useState(false);

  useEffect(() => {
    const loadModules = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("system_modules")
        .select("id,name,display_name,description,active")
        .order("name");
      if (!error) {
        const formatted = (data || []).map((m: any) => ({
          id: String(m.id),
          name: String(m.name),
          display_name: String(m.display_name || m.name),
          description: m.description ?? null,
          active: typeof m.active === "boolean" ? m.active : true,
        }));
        setModules(formatted);
      }
      setLoading(false);
    };
    loadModules();
  }, []);

  useEffect(() => {
    const loadMembers = async () => {
      if (!organizationId) return;
      setMembersLoading(true);
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
      const { data, error } = await supabase.functions.invoke('manage-users', {
          body: { action: 'list_all_users' },
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (error) {
          setMembers([]);
        } else {
          setMembers(((data as any)?.users || []).map((u: any) => ({
            id: String(u.id),
            user_id: String(u.user_id),
            role: String(u.role),
            permissions: u.permissions || {},
            users: { id: String(u.users?.id || u.user_id), email: u.users?.email, name: u.users?.name }
          })));
        }
      } finally {
        setMembersLoading(false);
      }
    };
    loadMembers();
  }, [organizationId]);

  const [globalRole, setGlobalRole] = useState<string | null>(null);
  useEffect(() => {
    const loadRole = async () => {
      if (!user?.id) { setGlobalRole(null); return; }
      const { data } = await supabase
        .from('users')
        .select('global_role')
        .eq('id', user.id)
        .maybeSingle();
      setGlobalRole((data as any)?.global_role ?? null);
    };
    loadRole();
  }, [user?.id]);

  const canView = Boolean(globalRole === "nv_superadmin");

  const handleToggle = async (mod: SystemModule, checked: boolean) => {
    if (!canView) return;
    setSavingIds(prev => [...prev, mod.id]);
    setModules(prev => prev.map(m => (m.id === mod.id ? { ...m, active: checked } : m)));
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    const { error } = await supabase.functions.invoke('manage-users', {
      body: { action: 'toggle_module', module_id: mod.id, module_name: mod.name, active: checked, organization_id: organizationId },
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    setSavingIds(prev => prev.filter(id => id !== mod.id));
    if (error) {
      setModules(prev => prev.map(m => (m.id === mod.id ? { ...m, active: !checked } : m)));
    }
  };

  const openConfig = (mod: SystemModule) => {
    setConfigModule(mod);
    const allowed = members
      .filter(m => Boolean(m.permissions?.[mod.name]?.view === true))
      .map(m => m.user_id);
    setAllowedUserIds(allowed);
  };

  const saveConfig = async () => {
    if (!configModule || !organizationId) return;
    setSavingConfig(true);
    try {
      const targets = members;
      const updates = targets.map(async (mem) => {
        const current = mem.permissions || {};
        const modPerm = typeof current[configModule.name] === "object" && current[configModule.name] !== null ? { ...current[configModule.name] } : {};
        const enable = allowedUserIds.includes(mem.user_id);
        modPerm.view = enable;
        const next = { ...current, [configModule.name]: modPerm };
        const { error } = await supabase.rpc("set_user_permissions", {
          p_user_id: mem.user_id,
          p_organization_id: organizationId,
          p_permissions: next,
        });
        if (error) throw error;
        return { user_id: mem.user_id, permissions: next };
      });
      const results = await Promise.all(updates);
      setMembers(prev => prev.map(m => {
        const r = results.find(x => x.user_id === m.user_id);
        return r ? { ...m, permissions: r.permissions } : m;
      }));
      setConfigModule(null);
    } catch (_) {
    } finally {
      setSavingConfig(false);
    }
  };

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="min-h-screen flex w-full bg-gray-50">
        <AppSidebar />

        <div className="flex-1 flex flex-col">
          <GlobalHeader />

          <CleanNavigation items={navigationItems} basePath="/novura-admin" />

          <main className="flex-1 p-6 overflow-auto">
            <Routes>
              <Route
                path="/"
                element={
                  <Card>
                    <CardHeader>
                      <CardTitle>Gerenciamento de Módulos</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {(!canView) && (
                        <div className="mb-4 text-sm">Acesso restrito.</div>
                      )}
                      {loading ? (
                        <div className="text-sm">Carregando...</div>
                      ) : (
                        <div className="space-y-3">
                          {modules.map((m) => (
                            <div key={m.id} className="flex items-center justify-between border rounded-md p-3">
                              <div className="min-w-0">
                                <div className="text-sm font-medium">{m.display_name}</div>
                                {m.description ? (
                                  <div className="text-xs text-muted-foreground truncate">{m.description}</div>
                                ) : null}
                              </div>
                              <div className="flex items-center gap-3">
                                <Switch
                                  checked={Boolean(m.active)}
                                  onCheckedChange={(v) => handleToggle(m, Boolean(v))}
                                  disabled={savingIds.includes(m.id) || !canView}
                                />
                                <Button variant="outline" size="sm" disabled={!canView} onClick={() => openConfig(m)}>
                                  Configurar
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                }
              />
              <Route
                path="/usuarios"
                element={
                  <Card>
                    <CardHeader>
                      <CardTitle>Usuários</CardTitle>
                    </CardHeader>
                    <CardContent>
                      Em breve.
                    </CardContent>
                  </Card>
                }
              />
            </Routes>
          </main>
        </div>
      </div>
      <Dialog open={Boolean(configModule)} onOpenChange={(o) => { if (!o) setConfigModule(null); }}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Configurar acesso</DialogTitle>
            <DialogDescription>Selecione usuários que podem visualizar o módulo quando desativado globalmente.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm">Módulo: <span className="font-medium">{configModule?.display_name}</span></div>
            <div className="max-h-[50vh] overflow-y-auto border rounded-md p-3">
              {membersLoading ? (
                <div className="text-sm">Carregando membros...</div>
              ) : (
                <div className="space-y-2">
                  {members.map((m) => (
                    <label key={m.user_id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={allowedUserIds.includes(m.user_id)}
                          onCheckedChange={(v) => {
                            const id = m.user_id;
                            setAllowedUserIds(prev => {
                              const want = Boolean(v);
                              if (want && !prev.includes(id)) return [...prev, id];
                              if (!want) return prev.filter(x => x !== id);
                              return prev;
                            });
                          }}
                        />
                      <Label className="text-sm">{m.users?.name || m.users?.email || m.user_id}</Label>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfigModule(null)} disabled={savingConfig}>Cancelar</Button>
              <Button onClick={saveConfig} disabled={savingConfig || !canView}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
