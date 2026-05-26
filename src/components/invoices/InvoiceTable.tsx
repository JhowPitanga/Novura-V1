import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { normalizeText, normalizeTipo, padLeftNum, resolveNotaStatusKey, resolveNotaStatusLabel, resolveNotaValor } from "@/utils/nfeUtils";
import { getStatusBadge, getTipoBadge } from "./InvoiceStatusBadges";
import { InvoiceFilters } from "./InvoiceFilters";
import { InvoiceActions } from "./InvoiceActions";
import { InvoiceDetailDrawer } from "./InvoiceDetailDrawer";
import type { InvoiceRow } from "@/services/invoices.service";

interface InvoiceTableProps {
  notas: InvoiceRow[];
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
  const [selectedMarketplace, setSelectedMarketplace] = useState("todos");
  const [selectedTipo, setSelectedTipo] = useState("todos");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRow | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const marketplaceOptions = useMemo(
    () => Array.from(new Set((Array.isArray(notas) ? notas : []).map((n) => n.marketplace).filter(Boolean))).sort() as string[],
    [notas]
  );

  const filtered = (Array.isArray(notas) ? notas : [])
    .filter((n) => {
      if (!tipoFilter) return true;
      const t = normalizeText(String(n?.tipo || ""));
      return tipoFilter === "saida"
        ? (t === "saida")
        : t === tipoFilter;
    })
    .filter((n) => {
      if (selectedTipo === "todos") return true;
      return normalizeText(normalizeTipo(String(n?.tipo || ""))) === normalizeText(selectedTipo);
    })
    .filter((n) => {
      if (selectedMarketplace === "todos") return true;
      return normalizeText(String(n?.marketplace || "")) === normalizeText(selectedMarketplace);
    })
    .filter((n) => {
      const numero = String(n?.nfe_number || "");
      const chave = String(n?.nfe_key || "");
      const marketplace = String(n?.marketplace || "");
      const tipoLabel = normalizeTipo(String(n?.tipo || ""));
      const statusLabel = resolveNotaStatusLabel(n);
      const pedido = String(n?.marketplace_order_id || "");
      const term = searchTerm.trim().toLowerCase();
      return normalizeText(`${numero} ${chave} ${marketplace} ${tipoLabel} ${statusLabel} ${pedido}`).includes(normalizeText(term));
    })
    .filter((n) => {
      if (selectedStatus === "todos") return true;
      return resolveNotaStatusKey(n) === selectedStatus;
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedStatus, selectedMarketplace, selectedTipo, tipoFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const pageOffset = (currentPage - 1) * pageSize;
  const paginatedRows = filtered.slice(pageOffset, pageOffset + pageSize);
  const rangeStart = filtered.length === 0 ? 0 : pageOffset + 1;
  const rangeEnd = filtered.length === 0 ? 0 : Math.min(pageOffset + pageSize, filtered.length);

  return (
    <div className="space-y-6">
      <InvoiceFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        selectedStatus={selectedStatus}
        onStatusChange={setSelectedStatus}
        selectedMarketplace={selectedMarketplace}
        onMarketplaceChange={setSelectedMarketplace}
        selectedTipo={selectedTipo}
        onTipoChange={setSelectedTipo}
        marketplaceOptions={marketplaceOptions}
        placeholder={searchPlaceholder}
        showAddButton={showAddButton}
        showTipoFilter={!tipoFilter}
      />
      <InvoiceDetailDrawer
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        invoice={selectedInvoice}
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
              {!loading && !error && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <div className="py-10 text-center text-gray-500">
                      Nenhuma nota fiscal encontrada para os filtros selecionados.
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {!loading && !error && paginatedRows.map((nota) => {
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
                      <InvoiceActions
                        nota={nota}
                        showCancel={showCancelAction}
                        onView={(invoice) => {
                          setSelectedInvoice(invoice);
                          setIsDrawerOpen(true);
                        }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {!loading && !error && filtered.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border-0 bg-white px-4 py-3 shadow-lg ring-1 ring-gray-200/60 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-600">
            Mostrando <span className="font-medium text-gray-900">{rangeStart}</span>
            {" – "}
            <span className="font-medium text-gray-900">{rangeEnd}</span>
            {" de "}
            <span className="font-medium text-gray-900">{filtered.length}</span>
            {" nota(s)"}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-[160px]">
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-10 rounded-2xl border-0 bg-white shadow ring-1 ring-gray-200/60">
                  <SelectValue placeholder="Por página" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 por página</SelectItem>
                  <SelectItem value="20">20 por página</SelectItem>
                  <SelectItem value="50">50 por página</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-9 w-9 rounded-2xl p-0"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                aria-label="Página anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[72px] text-center text-sm font-medium text-gray-900">
                {currentPage} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                className="h-9 w-9 rounded-2xl p-0"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                aria-label="Próxima página"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
