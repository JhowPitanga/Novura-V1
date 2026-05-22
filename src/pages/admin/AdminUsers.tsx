import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminDataTable, type Column } from "@/components/admin/shell/AdminDataTable";
import { AdminFilterBar } from "@/components/admin/shell/AdminFilterBar";
import { OrganizationStatusBadge } from "@/components/admin/organizations/OrganizationStatusBadge";
import { AdminPageError } from "@/components/admin/shell/AdminPageError";
import { useAdminUsers } from "@/hooks/admin/useAdminUsers";
import type { AdminUser } from "@/types/admin";

const ROLE_LABELS: Record<string, string> = {
  owner: "Proprietário",
  admin: "Admin",
  member: "Membro",
};

export function AdminUsers() {
  const [search, setSearch] = useState("");
  const [role, setRole]     = useState("all");
  const [page, setPage]     = useState(1);

  const params = {
    page,
    search: search || undefined,
    role: role !== "all" ? role : undefined,
  };

  const { data: users = [], isLoading, error, refetch } = useAdminUsers(params);

  const columns: Column<AdminUser>[] = [
    {
      key: "email",
      header: "Email / ID",
      cell: (u) => (
        <div>
          <p className="text-sm font-medium">{u.email ?? "—"}</p>
          <p className="text-xs text-muted-foreground font-mono">{u.user_id.slice(0, 8)}…</p>
        </div>
      ),
    },
    {
      key: "org",
      header: "Organização",
      cell: (u) => (
        <div>
          <p className="text-sm">{u.organization_name ?? "—"}</p>
          <OrganizationStatusBadge
            status={u.organization_status}
            deleted={u.organization_deleted}
          />
        </div>
      ),
    },
    {
      key: "role",
      header: "Papel",
      cell: (u) => (
        <Badge variant="outline" className="text-xs">
          {ROLE_LABELS[u.role] ?? u.role}
        </Badge>
      ),
    },
    {
      key: "since",
      header: "Desde",
      cell: (u) => (
        <span className="text-xs text-muted-foreground">
          {new Date(u.created_at).toLocaleDateString("pt-BR")}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Usuários</h1>
        <p className="text-sm text-muted-foreground mt-1">Todos os membros de todas as organizações</p>
      </div>

      {error && <AdminPageError message={(error as Error).message} onRetry={() => refetch()} />}

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <AdminFilterBar
            search={search}
            onSearchChange={(v) => { setSearch(v); setPage(1); }}
            placeholder="Buscar por email..."
            selects={[{
              key: "role",
              placeholder: "Todos os papéis",
              value: role,
              options: [
                { label: "Proprietário", value: "owner" },
                { label: "Admin",        value: "admin" },
                { label: "Membro",       value: "member" },
              ],
              onChange: (v) => { setRole(v); setPage(1); },
            }]}
            isDirty={search !== "" || role !== "all"}
            onClear={() => { setSearch(""); setRole("all"); setPage(1); }}
          />
        </CardHeader>
        <CardContent className="p-0">
          <AdminDataTable
            columns={columns}
            data={users}
            isLoading={isLoading}
            getRowId={(u) => u.id}
            page={page}
            onPageChange={setPage}
            emptyMessage="Nenhum usuário encontrado."
          />
        </CardContent>
      </Card>
    </div>
  );
}
