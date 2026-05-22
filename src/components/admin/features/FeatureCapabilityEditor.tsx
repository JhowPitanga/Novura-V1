import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { OrgFeature, BaseFeatureCapabilities } from "@/types/admin";

interface FeatureCapabilityEditorProps {
  feature: OrgFeature;
  onSave: (featureKey: string, is_enabled: boolean, capabilities: BaseFeatureCapabilities) => Promise<void>;
  isSaving?: boolean;
}

const BADGE_LABELS: Record<string, string> = { stable: "Estável", beta: "Beta", new: "Novo" };
const BADGE_VARIANTS: Record<string, "outline" | "secondary" | "default"> = {
  stable: "outline", beta: "secondary", new: "default",
};

const CAP_LABELS: Record<keyof BaseFeatureCapabilities, string> = {
  can_view: "Visualizar",
  can_create: "Criar",
  can_edit: "Editar",
  can_delete: "Excluir",
  max_limit: "Limite máximo",
};

export function FeatureCapabilityEditor({ feature, onSave, isSaving }: FeatureCapabilityEditorProps) {
  const [enabled, setEnabled] = useState(feature.is_enabled);
  const [caps, setCaps] = useState<BaseFeatureCapabilities>({
    can_view: true,
    can_create: true,
    ...feature.capabilities,
  });

  const isDirty =
    enabled !== feature.is_enabled ||
    JSON.stringify(caps) !== JSON.stringify({ can_view: true, can_create: true, ...feature.capabilities });

  function setBoolCap(key: keyof BaseFeatureCapabilities, value: boolean) {
    setCaps((prev) => ({ ...prev, [key]: value }));
  }

  function setNumCap(value: string) {
    const n = parseInt(value);
    setCaps((prev) => ({ ...prev, max_limit: isNaN(n) ? undefined : n }));
  }

  const preview = [
    caps.can_view ? "pode visualizar" : null,
    caps.can_create ? "pode criar" : "não pode criar",
    caps.can_edit !== undefined ? (caps.can_edit ? "pode editar" : "não pode editar") : null,
  ].filter(Boolean).join(", ");

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-white">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{feature.name}</span>
          <Badge variant={BADGE_VARIANTS[feature.badge_status]}>
            {BADGE_LABELS[feature.badge_status] ?? feature.badge_status}
          </Badge>
          {!feature.is_globally_enabled && (
            <Badge variant="destructive">Global desativado</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`switch-${feature.feature_key}`} className="text-xs text-muted-foreground">Ativo</Label>
          <Switch
            id={`switch-${feature.feature_key}`}
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-2 gap-3">
        {(["can_view", "can_create", "can_edit", "can_delete"] as const).map((key) => (
          <div key={key} className="flex items-center justify-between gap-2">
            <Label className="text-sm">{CAP_LABELS[key]}</Label>
            <Switch
              checked={caps[key] ?? false}
              onCheckedChange={(v) => setBoolCap(key, v)}
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
          onChange={(e) => setNumCap(e.target.value)}
          disabled={!enabled}
        />
      </div>

      <p className="text-xs text-muted-foreground italic">
        Efetivo para {feature.name}: {preview}
      </p>

      <Button
        size="sm"
        className="bg-novura-primary hover:bg-novura-primary/90 text-white"
        disabled={!isDirty || isSaving}
        onClick={() => onSave(feature.feature_key, enabled, caps)}
      >
        {isSaving ? "Salvando..." : "Salvar"}
      </Button>
    </div>
  );
}
