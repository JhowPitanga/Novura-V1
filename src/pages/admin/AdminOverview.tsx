import { Building2, ShieldAlert, ShoppingCart, Users } from "lucide-react";
import { AdminMetricCard } from "@/components/admin/shell/AdminMetricCard";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminPageError } from "@/components/admin/shell/AdminPageError";
import { useAdminOverviewMetrics } from "@/hooks/admin/useAdminOverview";

export function AdminOverview() {
  const { data, isLoading, error, refetch } = useAdminOverviewMetrics();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Visão Geral</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Métricas de infraestrutura e tráfego da plataforma
        </p>
      </div>

      {error && <AdminPageError message={(error as Error).message} onRetry={() => refetch()} />}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <AdminMetricCard
          label="Tenants ativos"
          value={data?.tenants_active ?? 0}
          icon={Building2}
        />
        <AdminMetricCard
          label="Bloqueadas"
          value={data?.tenants_blocked ?? 0}
          icon={ShieldAlert}
          variant={(data?.tenants_blocked ?? 0) > 0 ? "danger" : "default"}
        />
        <AdminMetricCard
          label="Pedidos no motor"
          value={data?.orders_total ?? 0}
          icon={ShoppingCart}
        />
        <AdminMetricCard
          label="Usuários cadastrados"
          value={data?.platform_users ?? 0}
          icon={Users}
        />
      </div>

      {(data?.tenants_blocked ?? 0) > 0 && (
        <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4">
          <p className="text-sm font-medium text-destructive">
            {data?.tenants_blocked} {data?.tenants_blocked === 1 ? "tenant requer" : "tenants requerem"} atenção
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Acesse a aba Organizações para gerenciar.
          </p>
        </div>
      )}
    </div>
  );
}
