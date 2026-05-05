import { Download, ExternalLink, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getStatusBadge, getTipoBadge } from "@/components/invoices/InvoiceStatusBadges";
import { useToast } from "@/hooks/use-toast";
import { downloadInvoiceXml, openInvoicePdf } from "@/services/invoiceFiles.service";
import type { InvoiceRow } from "@/services/invoices.service";
import { cn } from "@/lib/utils";
import { normalizeTipo, padLeftNum, resolveNotaStatusLabel, resolveNotaValor } from "@/utils/nfeUtils";

interface InvoiceDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: InvoiceRow | null;
}

function InfoItem({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("rounded-2xl bg-gray-50 p-4", className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-gray-900">{value || "-"}</p>
    </div>
  );
}

export function InvoiceDetailDrawer({ open, onOpenChange, invoice }: InvoiceDetailDrawerProps) {
  const { toast } = useToast();

  const handleOpenPdf = () => {
    if (!invoice || openInvoicePdf(invoice)) return;
    toast({ title: "DANFE indisponível", description: "A nota ainda não possui PDF salvo ou URL válida.", variant: "destructive" });
  };

  const handleDownloadXml = async () => {
    if (!invoice) return;
    const ok = await downloadInvoiceXml(invoice);
    if (!ok) {
      toast({ title: "XML indisponível", description: "A nota ainda não possui XML salvo ou URL válida.", variant: "destructive" });
    }
  };

  const serieFmt = padLeftNum(invoice?.serie || "", 3);
  const numeroFmt = padLeftNum(invoice?.nfe_number || "", 9);
  const valor = invoice ? resolveNotaValor(invoice) : undefined;
  const authorizedAt = invoice?.authorized_at ? new Date(invoice.authorized_at).toLocaleString("pt-BR") : "-";
  const createdAt = invoice?.created_at ? new Date(invoice.created_at).toLocaleString("pt-BR") : "-";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full max-h-[100dvh] w-full flex-col gap-0 p-0 sm:max-w-[680px]"
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-10 pt-14">
          <SheetHeader className="mb-4 text-left">
            <SheetTitle>Visualização de nota fiscal</SheetTitle>
            <SheetDescription>
              Consulte os dados principais e faça download dos arquivos da nota.
            </SheetDescription>
          </SheetHeader>

          {!invoice ? (
            <div className="rounded-2xl bg-gray-50 p-6 text-sm text-gray-600">Selecione uma nota para visualizar os detalhes.</div>
          ) : (
            <Card className="border-none shadow-none">
              <CardHeader className="px-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  {getStatusBadge(resolveNotaStatusLabel(invoice))}
                  {getTipoBadge(normalizeTipo(invoice.tipo || ""))}
                </div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <FileText className="h-6 w-6 text-novura-primary" />
                  NF-e {serieFmt}/{numeroFmt}
                </CardTitle>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={handleOpenPdf}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Abrir DANFE
                  </Button>
                  <Button onClick={handleDownloadXml}>
                    <Download className="mr-2 h-4 w-4" />
                    Baixar XML
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 px-0 sm:grid-cols-2">
                <InfoItem label="Canal de venda" value={invoice.marketplace || "-"} />
                <InfoItem label="Pedido marketplace" value={invoice.marketplace_order_id || "-"} />
                <InfoItem label="Valor" value={valor != null ? Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "-"} />
                <InfoItem label="Autorizada em" value={authorizedAt} />
                <InfoItem label="Criada em" value={createdAt} />
                <InfoItem label="Ambiente" value={invoice.emission_environment || "-"} />
                <InfoItem label="Chave de acesso" value={invoice.nfe_key || "-"} className="sm:col-span-2" />
                <InfoItem label="Erro" value={invoice.error_message || "-"} className="sm:col-span-2" />
              </CardContent>
            </Card>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
