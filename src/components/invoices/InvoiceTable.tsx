import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { normalizeTipo, padLeftNum, resolveNotaStatusLabel, resolveNotaValor } from "@/utils/nfeUtils";
import { getStatusBadge, getTipoBadge } from "./InvoiceStatusBadges";
import { InvoiceFilters } from "./InvoiceFilters";
import { InvoiceActions } from "./InvoiceActions";

interface InvoiceTableProps {
  notas: any[];
  loading: boolean;
  error: string | null;
  tipoFilter?: string;
  searchPlaceholder?: string;
  showAddButton?: boolean;
  showCancelAction?: boolean;
}

export function InvoiceTable({
  notas,
  loading,
  error,
  tipoFilter,
  searchPlaceholder,
  showAddButton = false,
  showCancelAction = true,
}: InvoiceTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("todos");

  const filtered = (Array.isArray(notas) ? notas : [])
    .filter((n) => {
      if (!tipoFilter) return true;
      const t = String(n?.tipo || "").toLowerCase();
      return tipoFilter === "saida"
        ? (t === "saída" || t === "saida")
        : t === tipoFilter;
    })
    .filter((n) => {
      const numero = String(n?.nfe_number || "");
      const chave = String(n?.nfe_key || "");
      const marketplace = String(n?.marketplace || "");
      const tipoLabel = normalizeTipo(String(n?.tipo || ""));
      const term = searchTerm.trim().toLowerCase();
      return `${numero} ${chave} ${marketplace} ${tipoLabel}`.toLowerCase().includes(term);
    })
    .filter((n) => {
      if (selectedStatus === "todos") return true;
      const statusLabel = resolveNotaStatusLabel(n);
      return statusLabel.toLowerCase() === selectedStatus;
    });

  return (
    <div className="space-y-6">
      <InvoiceFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        selectedStatus={selectedStatus}
        onStatusChange={setSelectedStatus}
        placeholder={searchPlaceholder}
        showAddButton={showAddButton}
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-gray-100">
                <TableHead>Série/Número</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Marketplace</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Autorizada em</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <div className="py-6 text-center text-gray-600">Carregando notas fiscais...</div>
                  </TableCell>
                </TableRow>
              )}
              {!loading && error && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <div className="py-6 text-center text-red-600">{error}</div>
                  </TableCell>
                </TableRow>
              )}
              {!loading && !error && filtered.map((nota: any) => {
                const serie = String(nota?.serie || "");
                const numero = String(nota?.nfe_number || "");
                const tipo = String(nota?.tipo || "");
                const marketplace = String(nota?.marketplace || "");
                const authorizedAt = nota?.authorized_at
                  ? new Date(String(nota.authorized_at)).toLocaleString("pt-BR")
                  : "-";
                const statusLabel = resolveNotaStatusLabel(nota);
                const valor = resolveNotaValor(nota);
                const serieFmt = padLeftNum(serie, 3);
                const numeroFmt = padLeftNum(numero, 9);
                const tipoLabel = normalizeTipo(tipo);

                return (
                  <TableRow key={nota.id} className="hover:bg-gray-50/50">
                    <TableCell>
                      <div>
                        <p className="font-medium text-gray-900">{serieFmt}</p>
                        <p className="text-xs text-gray-600">{numeroFmt}</p>
                      </div>
                    </TableCell>
                    <TableCell>{getTipoBadge(tipoLabel)}</TableCell>
                    <TableCell>
                      <span className="text-gray-900">{marketplace || "-"}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">
                        {valor != null
                          ? `R$ ${Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-gray-600">{authorizedAt}</span>
                    </TableCell>
                    <TableCell>{getStatusBadge(statusLabel || "")}</TableCell>
                    <TableCell>
                      <InvoiceActions nota={nota} showCancel={showCancelAction} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
