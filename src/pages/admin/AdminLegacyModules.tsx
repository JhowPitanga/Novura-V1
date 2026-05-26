/**
 * AdminLegacyModules.tsx
 * Temporary: migrated system_modules management from old NovuraAdmin.tsx.
 * Will be deprecated once system_modules is fully replaced by organization_features.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

interface SystemModule {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  active: boolean;
}

export function AdminLegacyModules() {
  const [modules, setModules] = useState<SystemModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("system_modules")
        .select("id,name,display_name,description,active")
        .order("name");
      if (!error) setModules((data ?? []) as SystemModule[]);
      setLoading(false);
    }
    load();
  }, []);

  async function toggle(mod: SystemModule) {
    setSaving((prev) => new Set(prev).add(mod.id));
    const { error } = await supabase
      .from("system_modules")
      .update({ active: !mod.active })
      .eq("id", mod.id);
    if (error) {
      toast.error(`Erro ao atualizar ${mod.display_name}`);
    } else {
      setModules((prev) =>
        prev.map((m) => (m.id === mod.id ? { ...m, active: !m.active } : m)),
      );
      toast.success(`${mod.display_name} ${!mod.active ? "ativado" : "desativado"}.`);
    }
    setSaving((prev) => { const s = new Set(prev); s.delete(mod.id); return s; });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Módulos do Sistema</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Legado — controle global de módulos. Será substituído por Features & Capacidades.
        </p>
        <Badge variant="secondary" className="mt-2">Legado</Badge>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Módulos ({modules.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)
            : modules.map((mod) => (
                <div key={mod.id} className="flex items-center justify-between p-3 border rounded-lg bg-white">
                  <div>
                    <p className="text-sm font-medium">{mod.display_name}</p>
                    {mod.description && <p className="text-xs text-muted-foreground">{mod.description}</p>}
                  </div>
                  <Switch
                    checked={mod.active}
                    disabled={saving.has(mod.id)}
                    onCheckedChange={() => toggle(mod)}
                  />
                </div>
              ))}
        </CardContent>
      </Card>
    </div>
  );
}
