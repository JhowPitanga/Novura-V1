import { Badge } from "@/components/ui/badge";
import type { OrgStatus } from "@/types/admin";

const LABELS: Record<OrgStatus, string> = {
  active: "Ativa",
  blocked: "Bloqueada",
};

const VARIANTS: Record<OrgStatus, "outline" | "destructive" | "secondary"> = {
  active: "outline",
  blocked: "destructive",
};

export function OrganizationStatusBadge({ status, deleted }: { status: OrgStatus | null | undefined; deleted?: boolean | null }) {
  if (deleted) {
    return <Badge variant="secondary">Arquivada</Badge>;
  }
  const s: OrgStatus = status ?? "active";
  return <Badge variant={VARIANTS[s]}>{LABELS[s]}</Badge>;
}
