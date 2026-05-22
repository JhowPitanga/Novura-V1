import { useQuery } from "@tanstack/react-query";
import { listSystemPlans } from "@/services/admin-control.service";
import { AdminPageError } from "@/components/admin/shell/AdminPageError";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, DollarSign } from "lucide-react";

export function AdminPlans() {
  const { data: plans = [], isLoading, error, refetch } = useQuery({
    queryKey: ["admin", "plans"],
    queryFn: listSystemPlans,
    staleTime: 10 * 60 * 1000,
    retry: 2,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Planos</h1>
        <p className="text-sm text-muted-foreground mt-1">Templates de plano — fundação de cotas e limites</p>
        <Badge variant="secondary" className="mt-2">Fundação (sem gateway de pagamento no MVP)</Badge>
      </div>

      {error && <AdminPageError message={(error as Error).message} onRetry={() => refetch()} />}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-lg" />)
          : plans.map((plan) => (
              <Card key={plan.id} className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold">{plan.name}</CardTitle>
                    <Badge variant="outline" className="font-mono text-xs">{plan.sku}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <DollarSign className="h-4 w-4" />
                    {plan.price_cents === 0
                      ? "Gratuito"
                      : `R$ ${(plan.price_cents / 100).toFixed(2).replace(".", ",")}/mês`}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    Até {plan.max_users} usuários
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>
    </div>
  );
}
