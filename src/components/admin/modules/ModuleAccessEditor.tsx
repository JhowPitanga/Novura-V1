import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import type { BaseFeatureCapabilities, OrgModuleCatalogItem } from "@/types/admin";

interface ModuleAccessEditorProps {
  module: OrgModuleCatalogItem;
  onSaveOrg: (
    moduleKey: string,
    is_enabled: boolean,
    capabilities: BaseFeatureCapabilities,
  ) => Promise<void>;
  onToggleGlobal?: (moduleKey: string, active: boolean) => Promise<void>;
  isSaving?: boolean;
}

const BADGE_LABELS: Record<string, string> = { stable: "Estável", beta: "Beta", new: "Novo" };

const CAP_LABELS: Record<keyof BaseFeatureCapabilities, string> = {
  can_view: "Visualizar",
  can_create: "Criar",
  can_edit: "Editar",
  can_delete: "Excluir",
  max_limit: "Limite máximo",
};

export function ModuleAccessEditor({
  module,
  onSaveOrg,
  onToggleGlobal,
  isSaving,
}: ModuleAccessEditorProps) {
  const [globalActive, setGlobalActive] = useState(module.global_module_active);
  const [enabled, setEnabled] = useState(module.is_enabled);
  const [caps, setCaps] = useState<BaseFeatureCapabilities>({
    can_view: true,
    can_create: true,
    ...module.capabilities,
  });

  useEffect(() => {
    setGlobalActive(module.global_module_active);
    setEnabled(module.is_enabled);
    setCaps({ can_view: true, can_create: true, ...module.capabilities });
  }, [module]);

  const capsDirty =
    JSON.stringify(caps) !== JSON.stringify({ can_view: true, can_create: true, ...module.capabilities });

  const effectiveActive =
    module.effective_active ??
    (globalActive && module.feature_globally_enabled && enabled);

  const showGlobalBlocker = enabled && !effectiveActive && !globalActive;

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-white">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{module.display_name}</span>
            <Badge variant="outline" className="text-xs font-mono">{module.module_key}</Badge>
            <Badge variant="secondary">{BADGE_LABELS[module.badge_status] ?? module.badge_status}</Badge>
            {!module.has_feature_catalog && (
              <Badge variant="outline" className="text-xs">Sem catálogo feature</Badge>
            )}
            <Badge
              variant={effectiveActive ? "default" : "destructive"}
              className={effectiveActive ? "bg-green-100 text-green-800 border-0" : ""}
            >
              {effectiveActive ? "Visível no ERP" : "Oculto no ERP"}
            </Badge>
          </div>
          {module.description && (
            <p className="text-xs text-muted-foreground mt-1">{module.description}</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2">
        <div>
          <Label className="text-sm font-medium">Módulo ativo no sistema (global)</Label>
          <p className="text-xs text-muted-foreground">Desliga o módulo para todas as organizações</p>
        </div>
        <Switch
          checked={globalActive}
          disabled={!onToggleGlobal || isSaving}
          onCheckedChange={async (next) => {
            setGlobalActive(next);
            if (onToggleGlobal) await onToggleGlobal(module.module_key, next);
          }}
        />
      </div>

      {showGlobalBlocker && (
        <Alert variant="destructive" className="py-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Liberado na organização, mas o módulo global está desligado. Usuários não verão este módulo até ativar
            &quot;Módulo ativo no sistema (global)&quot;.
          </AlertDescription>
        </Alert>
      )}

      <Separator />

      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">Liberado para esta organização</Label>
          <p className="text-xs text-muted-foreground">Override por tenant + capacidades granulares</p>
        </div>
        <Switch
          checked={enabled}
          disabled={isSaving}
          onCheckedChange={async (next) => {
            setEnabled(next);
            const nextCaps = next
              ? { ...caps, can_view: true }
              : caps;
            setCaps(nextCaps);
            await onSaveOrg(module.module_key, next, nextCaps);
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {(["can_view", "can_create", "can_edit", "can_delete"] as const).map((key) => (
          <div key={key} className="flex items-center justify-between gap-2">
            <Label className="text-sm">{CAP_LABELS[key]}</Label>
            <Switch
              checked={caps[key] ?? false}
              onCheckedChange={(v) => setCaps((p) => ({ ...p, [key]: v }))}
              disabled={!enabled}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Label className="text-sm min-w-[100px]">{CAP_LABELS.max_limit}</Label>
        <Input
          type="number"
          min={0}
          className="w-24 h-8 text-sm"
          placeholder="∞"
          value={caps.max_limit ?? ""}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            setCaps((p) => ({ ...p, max_limit: Number.isNaN(n) ? undefined : n }));
          }}
          disabled={!enabled}
        />
      </div>

      {capsDirty && (
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            className="bg-novura-primary hover:bg-novura-primary/90 text-white"
            disabled={isSaving}
            onClick={() => onSaveOrg(module.module_key, enabled, caps)}
          >
            {isSaving ? "Salvando..." : "Salvar capacidades"}
          </Button>
        </div>
      )}
    </div>
  );
}
