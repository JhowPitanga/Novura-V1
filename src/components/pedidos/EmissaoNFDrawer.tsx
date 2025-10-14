import { useState, useEffect, useRef, useId } from "react";
import { X, CheckCircle, AlertTriangle, Loader2, Bot } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from '@/integrations/supabase/client';
import { useToast } from "@/hooks/use-toast";

interface EmissaoNFDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pedidoId?: string | null;
  onEmissaoConcluida?: (pedidoId: string) => void;
}

type EmissaoStatus = "Processando" | "Sucesso" | "Erro";

interface HistoricoEmissao {
  id: string;
  status: EmissaoStatus;
  mensagem: string;
  timestamp: string;
}

export function EmissaoNFDrawer({ open, onOpenChange, pedidoId, onEmissaoConcluida }: EmissaoNFDrawerProps) {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [historico, setHistorico] = useState<HistoricoEmissao[]>([]);
  const [emissaoConcluida, setEmissaoConcluida] = useState(false);
  const [pedidosComProblemas, setPedidosComProblemas] = useState<HistoricoEmissao[]>([]);

  // Efeito para iniciar a emissão quando o drawer é aberto com um pedidoId
  useEffect(() => {
    if (open && pedidoId && !emissaoConcluida) {
      handleEmitirNfe(pedidoId);
    }
  }, [open, pedidoId, emissaoConcluida]);

  // Garantir foco dentro do Drawer e evitar foco escondido
  useEffect(() => {
    if (open) {
      const activeEl = document.activeElement as HTMLElement | null;
      if (activeEl && !contentRef.current?.contains(activeEl)) {
        activeEl.blur();
      }
      setTimeout(() => {
        const autofocusEl = contentRef.current?.querySelector<HTMLElement>("[data-autofocus]");
        const firstFocusable =
          autofocusEl ||
          contentRef.current?.querySelector<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
        if (firstFocusable) {
          firstFocusable.focus();
        } else {
          contentRef.current?.focus();
        }
      }, 0);
    }
  }, [open]);

  const handleEmitirNfe = async (id: string) => {
    setIsProcessing(true);
    setEmissaoConcluida(false);
    setHistorico([]);
    setPedidosComProblemas([]);

    setHistorico(prev => [...prev, {
      id: id,
      status: "Processando",
      mensagem: "Iniciando emissão...",
      timestamp: new Date().toLocaleTimeString(),
    }]);

    try {
      // Simular emissão de NF-e (substituir por integração real)
      await new Promise(resolve => setTimeout(resolve, 2000));

      setHistorico(prev => [...prev, {
        id: id,
        status: "Sucesso",
        mensagem: "NF-e emitida com sucesso",
        timestamp: new Date().toLocaleTimeString(),
      }]);
      setEmissaoConcluida(true);
      onEmissaoConcluida?.(id);
      toast({
        title: "Sucesso",
        description: `NF-e emitida para o pedido ${id}`,
        variant: "default",
      });

    } catch (error: any) {
      const mensagemErro = error.message.includes('não encontrado ou não está pronto') ? 'Pedido não encontrado ou não pronto.' :
                           error.message.includes('já foi emitida') ? 'NF-e já emitida.' :
                           error.message;

      const errorLog = {
        id: id,
        status: "Erro" as EmissaoStatus,
        mensagem: `Erro: ${mensagemErro}`,
        timestamp: new Date().toLocaleTimeString(),
      };
      setHistorico(prev => [...prev, errorLog]);
      setPedidosComProblemas(prev => [...prev, errorLog]);
      toast({
        title: "Erro",
        description: `Falha na emissão da NF-e. ${mensagemErro}`,
        variant: "destructive",
      });
      setEmissaoConcluida(true);
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusIcon = (status: EmissaoStatus) => {
    switch (status) {
      case "Sucesso":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "Erro":
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
      case "Processando":
        return <Loader2 className="w-5 h-5 text-primary animate-spin" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: EmissaoStatus) => {
    switch (status) {
      case 'Sucesso':
        return <Badge className="bg-green-500 text-white">Sucesso</Badge>;
      case 'Erro':
        return <Badge className="bg-red-500 text-white">Erro</Badge>;
      case 'Processando':
        return <Badge className="bg-blue-500 text-white">Processando</Badge>;
      default:
        return <Badge variant="outline">Aguardando</Badge>;
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent
        ref={contentRef}
        className="h-full w-2/5 right-0 fixed inset-y-0 flex flex-col bg-white rounded-l-2xl p-0"
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
      >
        <DrawerHeader className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div className="flex flex-col">
            <DrawerTitle id={titleId} className="text-xl font-bold">Emissão de Notas Fiscais</DrawerTitle>
            <DrawerDescription id={descriptionId}>Acompanhe o processo de emissão e o histórico de eventos.</DrawerDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="rounded-full" data-autofocus>
            <X className="w-5 h-5" />
          </Button>
        </DrawerHeader>

        <div className="p-6 overflow-y-auto flex-1 flex flex-col">
          <div className="flex flex-col items-center justify-center space-y-4 mb-8">
            <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center">
              {isProcessing ? (
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
              )}
            </div>
            <p className="text-lg font-semibold text-gray-900">
              {isProcessing ? "Processando emissões..." : "Emissão concluída"}
            </p>
          </div>

          <div className="space-y-4 flex-1">
            <h3 className="text-lg font-semibold text-gray-900">Histórico de Emissões</h3>
            <div className="space-y-3">
              {historico.map((log, index) => (
                <div key={index} className="flex items-start space-x-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
                  <div className="flex-none pt-1">{getStatusIcon(log.status)}</div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 text-sm">Pedido {log.id}</p>
                    <p className="text-sm text-gray-600">{log.mensagem}</p>
                    <p className="text-xs text-gray-400 mt-1">{log.timestamp}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {emissaoConcluida && pedidosComProblemas.length > 0 && (
            <div className="mt-6">
              <div className="mt-4 p-4 bg-red-50 rounded-xl border border-red-200">
                <div className="flex items-center space-x-2 mb-2">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                  <h4 className="font-semibold text-red-700">Pedidos com Problemas</h4>
                </div>
                {pedidosComProblemas.map((problema, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-start text-sm">
                      <span className="font-medium mr-1">{problema.id}:</span>
                      <p className="text-red-600">{problema.mensagem}</p>
                    </div>
                  </div>
                ))}
                <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center space-x-2">
                    <Bot className="w-5 h-5 text-blue-600" />
                    <span className="font-medium text-blue-700">Novura AI em Ação</span>
                  </div>
                  <p className="text-sm text-blue-600 mt-1">
                    Identificamos erros e nossa IA está corrigindo automaticamente os dados para reprocessamento.
                  </p>
                </div>
              </div>
            </div>
          )}

          {emissaoConcluida && (
            <div className="mt-6 p-4 bg-green-50 rounded-xl border border-green-200">
              <div className="flex items-center space-x-2 mb-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <h4 className="font-semibold text-green-700">Resumo do Processo</h4>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Total processado:</span>
                  <span className="font-semibold ml-2">{historico.filter(log => log.status === 'Sucesso' || log.status === 'Erro').length}</span>
                </div>
                <div>
                  <span className="text-gray-600">Sucessos:</span>
                  <span className="font-semibold ml-2 text-green-600">
                    {historico.filter(log => log.status === 'Sucesso').length}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Erros:</span>
                  <span className="font-semibold ml-2 text-red-600">
                    {historico.filter(log => log.status === 'Erro').length}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Taxa de sucesso:</span>
                  <span className="font-semibold ml-2">
                    {Math.round((historico.filter(log => log.status === 'Sucesso').length / historico.length) * 100)}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {emissaoConcluida && (
          <div className="p-6 border-t border-gray-100 flex-none">
            <Button
              onClick={() => onOpenChange(false)}
              className="w-full h-12 rounded-2xl bg-novura-primary"
            >
              Concluir
            </Button>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}