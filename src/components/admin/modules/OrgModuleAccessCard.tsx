import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { AlertTriangle, ChevronDown } from "lucide-react";
import type { BaseFeatureCapabilities, OrgModuleCatalogItem } from "@/types/admin";

interface OrgModuleAccessCardProps {
  module: OrgModuleCatalogItem;
  onSave: (
    moduleKey: string,
    is_enabled: boolean,
    capabilities: BaseFeatureCapabilities,
  ) => Promise<void>;
  isSaving?: boolean;
}

const CAP_LABELS: Record<keyof BaseFeatureCapabilities, string> = {
  can_view: "Visualizar",
  can_create: "Criar",
  can_edit: "Editar",
  can_delete: "Excluir",
  max_limit: "Limite máximo",
};

/** Per-tenant module access — org switch and capabilities only */
export function OrgModuleAccessCard({ module, onSave, isSaving }: OrgModuleAccessCardProps) {
  const [enabled, setEnabled] = useState(module.is_enabled);
  const [caps, setCaps] = useState<BaseFeatureCapabilities>({
    can_view: true,
    can_create: true,
    ...module.capabilities,
  });
  const [capsOpen, setCapsOpen] = useState(false);

  useEffect(() => {
    setEnabled(module.is_enabled);
    setCaps({ can_view: true, can_create: true, ...module.capabilities });
  }, [module]);

  const capsDirty =
    JSON.stringify(caps) !== JSON.stringify({ can_view: true, can_create: true, ...module.capabilities });

  const globalOn = module.global_module_active && module.feature_globally_enabled;
  const effectiveActive =
    module.effective_active ?? (globalOn && enabled);

  const showGlobalBlocker = enabled && !effectiveActive;

  return (
    <div className="rounded-lg border bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">{module.display_name}</p>
          {!globalOn && (
            <p className="text-xs text-amber-700 mt-0.5">Módulo desligado na plataforma — ative em Liberação global</p>
          )}
        </div>
        <Badge
          variant={effectiveActive ? "default" : "secondary"}
          className={effectiveActive ? "bg-green-100 text-green-800 border-0 shrink-0" : "shrink-0"}
        >
          {effectiveActive ? "Visível no ERP" : "Oculto"}
        </Badge>
      </div>

      {showGlobalBlocker && (
        <Alert variant="destructive" className="py-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Liberado para este tenant, mas indisponível no ERP até o módulo estar ativo na plataforma.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2.5">
        <Label htmlFor={`org-${module.module_key}`} className="text-sm font-medium cursor-pointer">
          Liberar para este tenant
        </Label>
        <Switch
          id={`org-${module.module_key}`}
          checked={enabled}
          disabled={isSaving}
          onCheckedChange={async (next) => {
            setEnabled(next);
            const nextCaps = next ? { ...caps, can_view: true } : caps;
            setCaps(nextCaps);
            await onSave(module.module_key, next, nextCaps);
          }}
        />
      </div>

      <Collapsible open={capsOpen} onOpenChange={setCapsOpen}>
        <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${capsOpen ? "rotate-180" : ""}`} />
          Capacidades granulares
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 space-y-3">
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
            <Button
              size="sm"
              className="bg-novura-primary hover:bg-novura-primary/90 text-white"
              disabled={isSaving}
              onClick={() => onSave(module.module_key, enabled, caps)}
            >
              {isSaving ? "Salvando..." : "Salvar capacidades"}
            </Button>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
