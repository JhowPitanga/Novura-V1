/**
 * CompanySelector — shown in the header/sidebar when the org has 2+ active companies.
 * Hidden for single-company orgs to avoid any UX change for them.
 */

import { Building2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useCompanyContext } from "@/hooks/useCompanyContext";

function formatCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function CompanySelector() {
  const { companies, activeCompanyId, setActiveCompanyId } = useCompanyContext();

  // Only render the selector when the org has multiple companies
  if (companies.length <= 1) return null;

  return (
    <div className="flex items-center gap-2">
      <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
      <Select value={activeCompanyId ?? ""} onValueChange={setActiveCompanyId}>
        <SelectTrigger className="h-8 text-sm min-w-[180px] max-w-[280px]">
          <SelectValue placeholder="Selecionar empresa" />
        </SelectTrigger>
        <SelectContent>
          {companies.map((company) => (
            <SelectItem key={company.id} value={company.id}>
              <span className="flex items-center gap-2">
                <span className="truncate">{company.razao_social}</span>
                {company.is_default && (
                  <Badge variant="secondary" className="text-xs px-1 py-0 shrink-0">Padrão</Badge>
                )}
              </span>
              <span className="text-xs text-muted-foreground block">
                {formatCnpj(company.cnpj)}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
