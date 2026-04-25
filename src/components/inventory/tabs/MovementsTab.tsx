import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  TrendingUp, TrendingDown, ShoppingCart, ArrowRightLeft,
  RotateCcw, Search, Download, ChevronLeft, ChevronRight, Package, Calendar
} from "lucide-react";
import { useInventoryMovements } from "@/hooks/useInventoryMovements";
import {
  type MovementType,
  type InventoryMovement,
  type MovementsFilters,
  resolveMovementLabel,
  resolveMovementColor,
  exportMovementsToCSV,
} from "@/services/movements.service";
import { DateRange } from "react-day-picker";
import { ptBR } from "date-fns/locale";

const PAGE_SIZE = 50;

// Color → Tailwind class map for movement type badges
const COLOR_CLASSES: Record<string, string> = {
  green: "bg-green-500 text-white border-green-600",
  blue: "bg-blue-500 text-white border-blue-600",
  slate: "bg-orange-500 text-white border-orange-600",
  amber: "bg-yellow-500 text-white border-yellow-600",
  purple: "bg-purple-500 text-white border-purple-600",
  fuchsia: "bg-red-500 text-white border-red-600",
  cyan: "bg-cyan-100 text-cyan-800 border-cyan-200",
  gray: "bg-gray-100 text-gray-700 border-gray-200",
};

function MovementBadge({ row }: { row: InventoryMovement }) {
  const label = resolveMovementLabel(row);
  const color = resolveMovementColor(row);
  const cls = COLOR_CLASSES[color] ?? COLOR_CLASSES.gray;
  return (
    <Badge className={`text-[11px] font-medium border ${cls}`}>{label}</Badge>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  count,
  total,
  colorClass,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  total: number;
  colorClass: string;
}) {
  return (
    <Card className="rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold mt-1">{total.toLocaleString("pt-BR")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{count} movimentações</p>
          </div>
          <div className={`rounded-full p-2 ${colorClass}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const ALL_MOVEMENT_TYPES: { value: MovementType; label: string }[] = [
  { value: "ENTRADA", label: "Entrada física" },
  { value: "SAIDA", label: "Saída / Venda" },
  { value: "RESERVA", label: "Reserva" },
  { value: "CANCELAMENTO_RESERVA", label: "Estorno de reserva" },
  { value: "DEVOLUCAO", label: "Devolução física" },
  { value: "TRANSFERENCIA", label: "Transferência" },
];

export function MovementsTab() {
  const [page, setPage] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [movementType, setMovementType] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(undefined);
  const [isDatePopoverOpen, setIsDatePopoverOpen] = useState(false);

  // Build filters from local state
  const filters: MovementsFilters = {
    searchTerm: searchTerm || undefined,
    movementTypes:
      movementType !== "all" ? [movementType as MovementType] : undefined,
    dateFrom: dateRange?.from ? dateRange.from.toISOString() : undefined,
    dateTo: dateRange?.to ? dateRange.to.toISOString() : undefined,
  };

  const { movements, total, summary, isLoading, isFetching } = useInventoryMovements(filters, page);
  const normalize = (v: string) =>
    String(v || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  const smartMatch = (row: InventoryMovement, term: string) => {
    const tokens = normalize(term).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return true;
    const haystack = normalize(
      [
        row.product_name,
        row.product_sku,
        row.marketplace_order_id,
        row.source_ref,
        row.storage_name,
        row.counterpart_storage_name,
      ]
        .filter(Boolean)
        .join(" ")
    );
    return tokens.every((t) => haystack.includes(t));
  };
  const displayedMovements = movements.filter((m) => smartMatch(m, searchTerm));

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleExport = useCallback(() => {
    const csv = exportMovementsToCSV(displayedMovements);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `movimentacoes-estoque-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [displayedMovements]);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <SummaryCard
          icon={TrendingUp}
          label="Entradas"
          count={summary?.countEntradas ?? 0}
          total={summary?.totalEntradas ?? 0}
          colorClass="bg-green-100 text-green-700"
        />
        <SummaryCard
          icon={TrendingDown}
          label="Saídas / Vendas"
          count={summary?.countSaidas ?? 0}
          total={summary?.totalSaidas ?? 0}
          colorClass="bg-blue-100 text-blue-700"
        />
        <SummaryCard
          icon={ShoppingCart}
          label="Reservas"
          count={summary?.countReservas ?? 0}
          total={summary?.totalReservas ?? 0}
          colorClass="bg-amber-100 text-amber-700"
        />
        <SummaryCard
          icon={ArrowRightLeft}
          label="Transferências"
          count={summary?.countTransferencias ?? 0}
          total={summary?.totalTransferencias ?? 0}
          colorClass="bg-cyan-100 text-cyan-700"
        />
        <SummaryCard
          icon={RotateCcw}
          label="Devoluções"
          count={summary?.countDevolucoes ?? 0}
          total={summary?.totalDevolucoes ?? 0}
          colorClass="bg-fuchsia-100 text-fuchsia-700"
        />
      </div>

      {/* Filters + Export */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Produto, SKU, pedido..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
                className="h-12 w-full pl-10 pr-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60"
              />
            </div>
            <Select
              value={movementType}
              onValueChange={(v) => { setMovementType(v); setPage(0); }}
            >
              <SelectTrigger className="h-12 w-[220px] rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60">
                <SelectValue placeholder="Tipo de movimentação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {ALL_MOVEMENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Popover open={isDatePopoverOpen} onOpenChange={setIsDatePopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  aria-label="Filtrar por data"
                  className={`group h-12 px-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60 ${!dateRange?.from && "text-gray-500"} ${isDatePopoverOpen ? 'gap-[1px]' : 'gap-0 group-hover:gap-[1px]'} justify-center`}
                >
                  <Calendar className="h-4 w-4" />
                  <span className={`overflow-hidden whitespace-nowrap max-w-0 opacity-0 transition-all duration-300 ease-out ${isDatePopoverOpen ? 'max-w-[140px] opacity-100' : 'group-hover:max-w-[140px] group-hover:opacity-100'}`}>
                    Filtrar por data
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start" side="bottom" sideOffset={8}>
                <CalendarComponent
                  mode="range"
                  selected={tempDateRange}
                  onSelect={(range: any) => setTempDateRange(range)}
                  locale={ptBR}
                  initialFocus
                />
                <div className="p-2 border-t flex justify-end space-x-2">
                  <Button variant="ghost" className="text-gray-500" onClick={() => { setDateRange(undefined); setTempDateRange(undefined); setIsDatePopoverOpen(false); setPage(0); }}>Remover Filtro</Button>
                  <Button onClick={() => { setDateRange(tempDateRange); setIsDatePopoverOpen(false); setPage(0); }}>Aplicar</Button>
                </div>
              </PopoverContent>
            </Popover>
            <Button
              className="group h-12 px-4 rounded-2xl bg-primary shadow-lg text-white gap-0 group-hover:gap-2"
              onClick={handleExport}
              disabled={displayedMovements.length === 0}
              aria-label="Exportar CSV"
            >
              <Download className="h-4 w-4 mr-2" />
              Exportar CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Movements table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">
            Movimentações {isFetching && <span className="text-xs text-muted-foreground ml-2">atualizando...</span>}
          </CardTitle>
          <span className="text-sm text-muted-foreground">{total.toLocaleString("pt-BR")} registros</span>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 rounded-md" />)}
            </div>
          ) : movements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Package className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">Nenhuma movimentação encontrada.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Qtd.</TableHead>
                  <TableHead>Armazém</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Observação</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Integração</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedMovements.map((row) => (
                  <MovementRow key={row.id} row={row} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {page + 1} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            Próxima
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function MovementRow({ row }: { row: InventoryMovement }) {
  const isPositive = Number(row.quantity_change) > 0;
  const qtyStr = isPositive
    ? `+${Math.abs(row.quantity_change)}`
    : `-${Math.abs(row.quantity_change)}`;

  const productImage = row.product_image_urls?.[0];
  const storageDisplay = resolveStorageDisplay(row);
  const observation = resolveObservation(row);

  return (
    <TableRow className="hover:bg-gray-50">
      <TableCell className="whitespace-nowrap">
        <div className="text-xs leading-tight">
          <p className="font-medium text-foreground">
            {new Date(row.timestamp).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })}
          </p>
          <p className="text-muted-foreground mt-0.5">
            {new Date(row.timestamp).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </p>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-gray-100 overflow-hidden shrink-0">
            {productImage ? (
              <img src={productImage} alt={row.product_name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="h-3.5 w-3.5 text-gray-400" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate max-w-[220px]">{row.product_name}</p>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">SKU: {row.product_sku || "—"}</p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <MovementBadge row={row} />
      </TableCell>
      <TableCell className={`text-right font-bold font-mono text-sm ${isPositive ? "text-green-700" : "text-red-600"}`}>
        {qtyStr}
      </TableCell>
      <TableCell className="text-sm">{storageDisplay}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{resolveActor(row)}</TableCell>
      <TableCell>
        <span
          className="block max-w-[220px] truncate text-xs text-muted-foreground"
          title={observation || ""}
        >
          {observation || "—"}
        </span>
      </TableCell>
      <TableCell>
        {row.marketplace_order_id ? (
          <span className="font-mono text-xs text-blue-700">{row.marketplace_order_id}</span>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {row.integration_marketplace || row.marketplace_name || "—"}
      </TableCell>
    </TableRow>
  );
}

function resolveStorageDisplay(row: InventoryMovement): string {
  if (row.movement_type !== "TRANSFERENCIA") {
    return row.storage_name || "—";
  }

  const isOutbound = Number(row.quantity_change || 0) < 0;
  const fromName = isOutbound ? row.storage_name : row.counterpart_storage_name;
  const toName = isOutbound ? row.counterpart_storage_name : row.storage_name;
  if (!fromName && !toName) return "—";
  if (fromName && toName) return `${fromName} > ${toName}`;
  return fromName || toName || "—";
}

function resolveActor(row: InventoryMovement): string {
  const movementType = String(row.movement_type || "");
  const isSystemMovement =
    movementType === "RESERVA" ||
    movementType === "CANCELAMENTO_RESERVA" ||
    movementType === "DEVOLUCAO";

  // "Novura" should only represent automatic/system-generated movements.
  if (isSystemMovement) return "Novura";

  // Prefer backend actor name when it's not the synthetic fallback.
  if (row.actor_name && row.actor_name !== "Novura") {
    return row.actor_name;
  }

  // Fallback for legacy rows: parse "DisplayName[TYPE]" from source_ref.
  const src = String(row.source_ref || "");
  const match = src.match(/^([^\[]+)\[/);
  if (match?.[1]?.trim()) {
    const parsed = match[1].trim();
    return parsed.split(" - ")[0].trim();
  }

  // Manual rows without explicit actor.
  if (row.entity_type === "manual" || movementType === "ENTRADA" || movementType === "SAIDA" || movementType === "TRANSFERENCIA") {
    return "Usuário";
  }

  return "Novura";
}

function resolveObservation(row: InventoryMovement): string {
  const src = String(row.source_ref || "");
  const match = src.match(/^([^\[]+)\[/);
  if (!match?.[1]?.trim()) return "";
  const parsed = match[1].trim();
  const parts = parsed.split(" - ");
  if (parts.length <= 1) return "";
  return parts.slice(1).join(" - ").trim();
}
