import { useMemo, useState } from "react";
import { Calendar, Download } from "lucide-react";
import { DateRange } from "react-day-picker";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { downloadInvoiceXmlBatch } from "@/services/invoiceFiles.service";
import type { InvoiceRow } from "@/services/invoices.service";
import { normalizeText, normalizeTipo, resolveNotaStatusKey, resolveNotaStatusLabel } from "@/utils/nfeUtils";

interface InvoiceExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoices: InvoiceRow[];
}

export function InvoiceExportDialog({ open, onOpenChange, invoices }: InvoiceExportDialogProps) {
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [isDatePopoverOpen, setIsDatePopoverOpen] = useState(false);
  const [marketplace, setMarketplace] = useState("todos");
  const [tipo, setTipo] = useState("todos");
  const [status, setStatus] = useState("todos");
  const [isExporting, setIsExporting] = useState(false);

  const marketplaceOptions = useMemo(
    () => Array.from(new Set(invoices.map((invoice) => invoice.marketplace).filter(Boolean))).sort() as string[],
    [invoices]
  );

  const statusOptions = useMemo(() => {
    const statusMap = new Map<string, string>();
    for (const invoice of invoices) {
      const key = resolveNotaStatusKey(invoice);
      if (!statusMap.has(key)) {
        statusMap.set(key, resolveNotaStatusLabel(invoice));
      }
    }

    return [
      { value: "todos", label: "Todos os status" },
      ...Array.from(statusMap.entries()).map(([value, label]) => ({ value, label })),
    ];
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    const from = dateRange?.from ? new Date(dateRange.from).setHours(0, 0, 0, 0) : null;
    const to = dateRange?.to ? new Date(dateRange.to).setHours(23, 59, 59, 999) : null;

    return invoices.filter((invoice) => {
      const invoiceTime = new Date(invoice.authorized_at ?? invoice.created_at).getTime();
      const invoiceMarketplace = normalizeText(String(invoice.marketplace || ""));
      const invoiceTipo = normalizeText(normalizeTipo(String(invoice.tipo || "")));

      if (from && invoiceTime < from) return false;
      if (to && invoiceTime > to) return false;
      if (marketplace !== "todos" && invoiceMarketplace !== normalizeText(marketplace)) return false;
      if (tipo !== "todos" && invoiceTipo !== normalizeText(tipo)) return false;
      if (status !== "todos" && resolveNotaStatusKey(invoice) !== status) return false;
      return true;
    });
  }, [dateRange?.from, dateRange?.to, invoices, marketplace, status, tipo]);

  const handleExport = async () => {
    if (!filteredInvoices.length) {
      toast({ title: "Nenhuma nota encontrada", description: "Revise os filtros de exportação e tente novamente.", variant: "destructive" });
      return;
    }

    setIsExporting(true);
    try {
      const result = await downloadInvoiceXmlBatch(filteredInvoices);
      toast({
        title: "Exportação concluída",
        description: `${result.success} XML(s) baixado(s).${result.failed ? ` ${result.failed} não estavam disponíveis.` : ""}`,
        variant: result.success ? "default" : "destructive",
      });
      if (result.success) onOpenChange(false);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Exportar XML de notas fiscais</DialogTitle>
          <DialogDescription>
            Selecione período, canal de venda, tipo e status para baixar os XMLs disponíveis.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label>Período</Label>
            <Popover open={isDatePopoverOpen} onOpenChange={setIsDatePopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={`h-12 w-full justify-start rounded-xl border-0 bg-white text-left shadow ring-1 ring-gray-200/60 ${!dateRange?.from ? "text-gray-500" : ""}`}
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  {dateRange?.from
                    ? `${dateRange.from.toLocaleDateString("pt-BR")}${dateRange.to ? ` - ${dateRange.to.toLocaleDateString("pt-BR")}` : ""}`
                    : "Selecionar período"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="range"
                  selected={dateRange}
                  onSelect={setDateRange}
                  locale={ptBR}
                  initialFocus
                />
                <div className="flex justify-end border-t p-2">
                  <Button variant="ghost" size="sm" onClick={() => setDateRange(undefined)}>
                    Limpar período
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Canal de venda</Label>
              <Select value={marketplace} onValueChange={setMarketplace}>
                <SelectTrigger>
                  <SelectValue placeholder="Canal de venda" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os canais</SelectItem>
                  {marketplaceOptions.map((option) => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tipo de nota</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger>
                  <SelectValue placeholder="Tipo de nota" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  <SelectItem value="Saída">Saída</SelectItem>
                  <SelectItem value="Entrada">Entrada</SelectItem>
                  <SelectItem value="Compra">Compra</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                  {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-2xl bg-gray-50 p-3 text-sm text-gray-600">
            {filteredInvoices.length} nota(s) encontrada(s) para exportação.
            {filteredInvoices.length > 0 && (
              <span className="block text-xs text-gray-500">
                Status incluídos: {Array.from(new Set(filteredInvoices.map(resolveNotaStatusLabel))).join(", ")}.
              </span>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isExporting}>
            Cancelar
          </Button>
          <Button onClick={handleExport} disabled={isExporting || filteredInvoices.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? "Exportando..." : "Exportar XML"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
