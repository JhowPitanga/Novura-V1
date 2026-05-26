import { Download, Eye, RefreshCw, MoreHorizontal, Ban } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";
import { resolveNotaStatusKey } from "@/utils/nfeUtils";
import { downloadInvoiceXml } from "@/services/invoiceFiles.service";
import type { InvoiceRow } from "@/services/invoices.service";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

async function getAuthContext() {
  const { data: { session } } = await (supabase as any).auth.getSession();
  const token: string | undefined = session?.access_token;
  if (!token) return null;
  let organizationId: string | null = null;
  try {
    const { data: orgId } = await (supabase as any).rpc('get_current_user_organization_id');
    organizationId = (Array.isArray(orgId) ? orgId?.[0] : orgId) || null;
  } catch {}
  if (!organizationId) return null;
  return { token, organizationId, session };
}

async function resolveCompanyId(nota: InvoiceRow, organizationId: string): Promise<string> {
  let companyId = String(nota?.company_id || "");
  if (!companyId) {
    try {
      const { data: companiesForOrg } = await (supabase as any)
        .from('companies')
        .select('id')
        .eq('organization_id', organizationId)
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(1);
      companyId = Array.isArray(companiesForOrg) && companiesForOrg.length > 0 ? String(companiesForOrg[0].id) : "";
    } catch {}
  }
  return companyId;
}

async function resolveOrderId(nota: InvoiceRow, organizationId: string): Promise<string> {
  let orderId = String(nota?.order_id || "");
  if (!orderId) {
    const mpOrderId = String(nota?.marketplace_order_id || "").trim();
    if (mpOrderId) {
      try {
        const { data: row } = await (supabase as any)
          .from('orders')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('marketplace_order_id', mpOrderId)
          .limit(1)
          .maybeSingle();
        if ((row as any)?.id) orderId = String((row as any).id);
      } catch {}
    }
  }
  return orderId;
}

interface InvoiceActionsProps {
  nota: InvoiceRow;
  showCancel?: boolean;
  onView?: (nota: InvoiceRow) => void;
}

export function InvoiceActions({ nota, showCancel = true, onView }: InvoiceActionsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAutorizado = resolveNotaStatusKey(nota) === "authorized";
  const [isSyncing, setIsSyncing] = useState(false);
  const [cancelDrawerOpen, setCancelDrawerOpen] = useState(false);
  const [cancelJustificativa, setCancelJustificativa] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  const invalidateInvoices = () => {
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
  };

  const handleViewInvoice = () => {
    onView?.(nota);
  };

  const openCancelDrawer = () => {
    setCancelJustificativa("");
    setCancelDrawerOpen(true);
  };

  const submitCancelNfe = async () => {
    const j = cancelJustificativa.trim();
    if (j.length < 15 || j.length > 255) {
      toast({ title: "Justificativa inválida", description: "Informe entre 15 e 255 caracteres.", variant: "destructive" });
      return;
    }
    setIsCancelling(true);
    try {
      const ctx = await getAuthContext();
      if (!ctx) throw new Error("Sessão expirada ou organização não encontrada.");
      const companyId = await resolveCompanyId(nota, ctx.organizationId);
      if (!companyId) throw new Error("Empresa da nota não encontrada.");
      const orderId = await resolveOrderId(nota, ctx.organizationId);
      if (!orderId) throw new Error("Pedido vinculado à nota não encontrado.");
      const envSel = String(nota?.emission_environment || "").toLowerCase() || "homologacao";
      const headers: Record<string, string> = { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${ctx.token}` };
      const { data, error } = await (supabase as any).functions.invoke('focus-nfe-cancel', {
        body: { organizationId: ctx.organizationId, companyId, orderId, environment: envSel, justificativa: j },
        headers,
      } as any);

      if (error || !data?.ok) throw new Error(error?.message || data?.error || "Falha ao cancelar a NF-e.");

      invalidateInvoices();
      setCancelDrawerOpen(false);
      setCancelJustificativa("");
      toast({ title: "NF-e cancelada", description: "A nota foi cancelada e a listagem será atualizada." });
    } catch {
      toast({ title: "Erro ao cancelar NF-e", description: "Não foi possível concluir o cancelamento agora.", variant: "destructive" });
    } finally {
      setIsCancelling(false);
    }
  };

  const handleSyncNfe = async () => {
    setIsSyncing(true);
    try {
      const ctx = await getAuthContext();
      if (!ctx) throw new Error("Sessão expirada ou organização não encontrada.");
      const companyId = await resolveCompanyId(nota, ctx.organizationId);
      if (!companyId) throw new Error("Empresa da nota não encontrada.");
      const orderId = await resolveOrderId(nota, ctx.organizationId);
      if (!orderId) throw new Error("Pedido vinculado à nota não encontrado.");
      const envSel = String(nota?.emission_environment || "").toLowerCase() || "homologacao";
      const headers: Record<string, string> = { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${ctx.token}` };
      const { data, error } = await (supabase as any).functions.invoke('focus-nfe-sync', {
        body: { organizationId: ctx.organizationId, companyId, orderIds: [orderId], environment: envSel },
        headers,
      } as any);

      if (error || data?.error) throw new Error(error?.message || data?.error || "Falha ao sincronizar a NF-e.");

      invalidateInvoices();
      toast({ title: "Sincronização solicitada", description: "Dados sincronizados" });
    } catch {
      toast({ title: "Erro ao sincronizar NF-e", description: "Não foi possível sincronizar a nota neste momento.", variant: "destructive" });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDownloadXml = async () => {
    const ok = await downloadInvoiceXml(nota);
    if (!ok) {
      toast({ title: "XML indisponível", description: "Não encontramos XML salvo ou URL válida para download.", variant: "destructive" });
    }
  };

  return (
    <>
      <Sheet
        open={cancelDrawerOpen}
        onOpenChange={(open) => {
          setCancelDrawerOpen(open);
          if (!open) setCancelJustificativa("");
        }}
      >
        <SheetContent
          side="right"
          className="flex h-full max-h-[100dvh] w-full flex-col gap-0 p-0 sm:max-w-md"
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <SheetHeader className="shrink-0 space-y-2 px-6 pt-14 text-left">
              <SheetTitle>Cancelar NF-e</SheetTitle>
              <SheetDescription>
                Informe a justificativa do cancelamento (entre 15 e 255 caracteres), conforme exigido pela legislação.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
              <div className="space-y-2">
                <Label htmlFor={`cancel-just-${nota.id}`}>Justificativa</Label>
                <Textarea
                  id={`cancel-just-${nota.id}`}
                  value={cancelJustificativa}
                  onChange={(e) => setCancelJustificativa(e.target.value)}
                  placeholder="Descreva o motivo do cancelamento..."
                  className="min-h-[160px] resize-y"
                  disabled={isCancelling}
                />
                <p className="text-xs text-muted-foreground">
                  {cancelJustificativa.trim().length} / 255 caracteres (mínimo 15)
                </p>
              </div>
            </div>
          </div>
          <SheetFooter className="shrink-0 gap-2 border-t bg-background px-6 py-4 sm:flex-row sm:justify-end sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCancelDrawerOpen(false)}
              disabled={isCancelling}
            >
              Voltar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => submitCancelNfe()}
              disabled={isCancelling}
            >
              {isCancelling ? "Cancelando..." : "Confirmar cancelamento"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label={isSyncing ? "Sincronizando nota" : "Ações da nota"}>
            {isSyncing ? (
              <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-purple-600 border-t-transparent" />
            ) : (
              <MoreHorizontal className="w-4 h-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {showCancel && (
            <DropdownMenuItem
              disabled={isSyncing}
              onClick={(e) => { e.stopPropagation(); handleSyncNfe(); }}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              {isSyncing ? "Sincronizando..." : "Sincronizar"}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleViewInvoice(); }}>
            <Eye className="w-4 h-4 mr-2" />
            Visualizar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDownloadXml(); }}>
            <Download className="w-4 h-4 mr-2" />
            Download XML
          </DropdownMenuItem>
          {showCancel && isAutorizado && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-600 focus:bg-red-50 focus:text-red-600"
                onClick={(e) => {
                  e.stopPropagation();
                  openCancelDrawer();
                }}
              >
                <Ban className="w-4 h-4 mr-2" />
                Cancelar NF-e
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
