import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import type { OrgModuleCatalogItem } from "@/types/admin";

const BADGE_LABELS: Record<string, string> = { stable: "Estável", beta: "Beta", new: "Novo" };

interface GlobalModuleRowProps {
  module: OrgModuleCatalogItem;
  onToggle: (moduleKey: string, active: boolean) => Promise<void>;
  isSaving?: boolean;
}

/** Platform-wide module switch — no org overrides */
export function GlobalModuleRow({ module, onToggle, isSaving }: GlobalModuleRowProps) {
  const [active, setActive] = useState(module.global_module_active);

  useEffect(() => {
    setActive(module.global_module_active);
  }, [module.global_module_active]);

  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-900">{module.display_name}</span>
          <Badge variant="secondary" className="text-xs">
            {BADGE_LABELS[module.badge_status] ?? module.badge_status}
          </Badge>
          {!active && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              Desligado na plataforma
            </Badge>
          )}
        </div>
        {module.description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{module.description}</p>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs text-muted-foreground hidden sm:inline">
          {active ? "Ativo" : "Inativo"}
        </span>
        <Switch
          checked={active}
          disabled={isSaving}
          aria-label={`${module.display_name} ativo na plataforma`}
          onCheckedChange={async (next) => {
            setActive(next);
            await onToggle(module.module_key, next);
          }}
        />
      </div>
    </div>
  );
}
