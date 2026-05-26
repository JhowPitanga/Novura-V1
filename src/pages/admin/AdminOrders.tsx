import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AdminFilterBar } from "@/components/admin/shell/AdminFilterBar";
import { AdminDataTable, type Column } from "@/components/admin/shell/AdminDataTable";
import { GlobalOrderStatusCards } from "@/components/admin/orders/GlobalOrderStatusCards";
import { AdminPageError } from "@/components/admin/shell/AdminPageError";
import { useAdminOrders, useAdminOrdersSummary } from "@/hooks/admin/useAdminOrders";
import type { AdminOrder } from "@/types/admin";

export function AdminOrders() {
  const [search, setSearch]       = useState("");
  const [status, setStatus]       = useState("all");
  const [marketplace, setMp]      = useState("all");
  const [page, setPage]           = useState(1);

  const params = {
    page,
    status:      status !== "all" ? status : undefined,
    marketplace: marketplace !== "all" ? marketplace : undefined,
  };

  const { data: orders = [], isLoading, error: ordersError, refetch: refetchOrders } = useAdminOrders(params);
  const { data: summary, isLoading: summaryLoading, error: summaryError, refetch: refetchSummary } = useAdminOrdersSummary();

  const filtered = search
    ? orders.filter((o) =>
        o.marketplace_order_id.includes(search) ||
        (o.customer_name ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : orders;

  const columns: Column<AdminOrder>[] = [
    {
      key: "order_id",
      header: "Pedido",
      cell: (o) => (
        <div>
          <p className="text-sm font-medium">{o.marketplace_order_id}</p>
          <p className="text-xs text-muted-foreground">{o.marketplace}</p>
        </div>
      ),
    },
    {
      key: "tenant",
      header: "Tenant",
      cell: (o) => (
        <span className="text-xs text-muted-foreground font-mono">
          {o.organizations_id.slice(0, 8)}...
        </span>
      ),
    },
    {
      key: "customer",
      header: "Cliente",
      cell: (o) => <span className="text-sm">{o.customer_name ?? "—"}</span>,
    },
    {
      key: "status",
      header: "Status Engine",
      cell: (o) => (
        <div className="space-y-1">
          <span className="text-xs font-medium bg-gray-100 px-2 py-0.5 rounded">{o.status}</span>
          {o.status_interno && (
            <p className="text-[11px] text-muted-foreground">{o.status_interno}</p>
          )}
        </div>
      ),
    },
    {
      key: "total",
      header: "Total",
      cell: (o) => (
        <span className="text-sm">
          {o.order_total != null
            ? `R$ ${Number(o.order_total).toFixed(2).replace(".", ",")}`
            : "—"}
        </span>
      ),
    },
    {
      key: "location",
      header: "Local",
      cell: (o) => (
        <span className="text-xs text-muted-foreground">
          {[o.shipping_city_name, o.shipping_state_uf].filter(Boolean).join(", ") || "—"}
        </span>
      ),
    },
    {
      key: "updated",
      header: "Atualizado",
      cell: (o) => {
        const dt = o.updated_at || o.last_updated || o.created_at;
        return (
          <span className="text-xs text-muted-foreground">
            {dt ? new Date(dt).toLocaleDateString("pt-BR") : "—"}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Monitoramento do Status Engine</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Auditoria técnica global dos pedidos trafegando no motor
        </p>
      </div>

      {(ordersError || summaryError) && (
        <AdminPageError
          message={((ordersError || summaryError) as Error).message}
          onRetry={() => { refetchOrders(); refetchSummary(); }}
        />
      )}

      <GlobalOrderStatusCards
        summary={summary?.summary ?? {}}
        total={summary?.total ?? 0}
        isLoading={summaryLoading}
        selectedStatus={status !== "all" ? status : undefined}
        onSelect={(s) => { setStatus(s ?? "all"); setPage(1); }}
      />

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <AdminFilterBar
            search={search}
            onSearchChange={(v) => { setSearch(v); setPage(1); }}
            placeholder="Buscar por pedido ou cliente..."
            selects={[{
              key: "marketplace",
              placeholder: "Marketplace",
              value: marketplace,
              options: [
                { label: "Mercado Livre", value: "mercado_livre" },
                { label: "Shopee",        value: "shopee" },
              ],
              onChange: (v) => { setMp(v); setPage(1); },
            }]}
            isDirty={search !== "" || status !== "all" || marketplace !== "all"}
            onClear={() => { setSearch(""); setStatus("all"); setMp("all"); setPage(1); }}
          />
        </CardHeader>
        <CardContent className="p-0">
          <AdminDataTable
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            getRowId={(o) => o.id}
            page={page}
            onPageChange={setPage}
            emptyMessage="Nenhum pedido encontrado."
          />
        </CardContent>
      </Card>
    </div>
  );
}
