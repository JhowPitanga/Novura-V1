import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { OrganizationStatusBadge } from "@/components/admin/organizations/OrganizationStatusBadge";
import type { AdminOrganization } from "@/types/admin";

interface OrgTenantPickerProps {
  organizations: AdminOrganization[];
  selectedId: string | null;
  onSelect: (orgId: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  isLoading?: boolean;
}

export function OrgTenantPicker({
  organizations,
  selectedId,
  onSelect,
  search,
  onSearchChange,
  isLoading,
}: OrgTenantPickerProps) {
  const filtered = search
    ? organizations.filter((org) => org.name.toLowerCase().includes(search.toLowerCase()))
    : organizations;

  return (
    <Card className="border-0 shadow-sm w-full xl:w-72 flex-shrink-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Organizações</CardTitle>
        <Input
          placeholder="Buscar por nome..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-8 text-sm"
        />
      </CardHeader>
      <CardContent className="p-2 max-h-[560px] overflow-auto space-y-1">
        {isLoading &&
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-md" />)}
        {!isLoading && filtered.length === 0 && (
          <p className="text-sm text-muted-foreground px-2 py-4 text-center">Nenhuma organização encontrada.</p>
        )}
        {!isLoading &&
          filtered.map((org) => {
            const plan = org.organization_status?.plan_sku;
            const isSelected = org.id === selectedId;
            return (
              <button
                key={org.id}
                type="button"
                onClick={() => onSelect(org.id)}
                className={cn(
                  "w-full text-left rounded-md px-3 py-2.5 transition-colors border",
                  isSelected
                    ? "border-novura-primary bg-novura-primary/5 ring-1 ring-novura-primary/30"
                    : "border-transparent hover:bg-muted/60",
                )}
              >
                <p className="text-sm font-medium text-gray-900 truncate">{org.name}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <OrganizationStatusBadge
                    status={org.organization_status?.status}
                    deleted={!!org.organization_status?.deleted_at}
                  />
                  {plan && (
                    <span className="text-xs text-muted-foreground capitalize">{plan.replace("plan_", "")}</span>
                  )}
                </div>
              </button>
            );
          })}
      </CardContent>
    </Card>
  );
}
