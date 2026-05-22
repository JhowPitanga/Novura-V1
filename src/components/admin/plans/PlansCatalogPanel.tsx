import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, DollarSign, Layers } from "lucide-react";
import type { SystemPlan } from "@/types/admin";

interface PlansCatalogPanelProps {
  plans: SystemPlan[];
  isLoading?: boolean;
  compact?: boolean;
}

/** Read-only plan templates — quotas apply when assigning a plan to a tenant */
export function PlansCatalogPanel({ plans, isLoading, compact }: PlansCatalogPanelProps) {
  if (isLoading) {
    return (
      <div className={compact ? "grid grid-cols-1 md:grid-cols-3 gap-3" : "grid grid-cols-1 md:grid-cols-3 gap-4"}>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className={compact ? "h-28 rounded-lg" : "h-36 rounded-lg"} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <Layers className="h-4 w-4 shrink-0 mt-0.5" />
        <p>
          Templates de plano definem cotas (usuários, limites). Ao alterar o plano de um tenant, os módulos
          padrão do plano são aplicados via sincronização — overrides por organização continuam válidos.
        </p>
      </div>
      <div className={compact ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" : "grid grid-cols-1 md:grid-cols-3 gap-4"}>
        {plans.map((plan) => (
          <Card key={plan.id} className="border shadow-sm">
            <CardHeader className={compact ? "pb-1 pt-4 px-4" : "pb-2"}>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className={compact ? "text-sm font-semibold" : "text-base font-semibold"}>
                  {plan.name}
                </CardTitle>
                <Badge variant="outline" className="text-xs shrink-0">
                  {plan.sku.replace("plan_", "")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className={compact ? "px-4 pb-4 pt-0 space-y-1.5" : "space-y-2"}>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <DollarSign className="h-4 w-4 shrink-0" />
                {plan.price_cents === 0
                  ? "Gratuito"
                  : `R$ ${(plan.price_cents / 100).toFixed(2).replace(".", ",")}/mês`}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4 shrink-0" />
                Até {plan.max_users} usuários
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
