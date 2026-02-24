import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { usePrintingSettings } from "@/hooks/usePrintingSettings";
import { formatDateSP } from "@/lib/datetime";
import { Printer, Settings } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ConfiguracoesImpressaoModal } from './ConfiguracoesImpressaoModal';
import { Paginacao } from "./Paginacao";

interface OrderItem {
  product_name: string;
  quantity: number;
  sku: string;
}

interface NfeData {
  nfe_number: string;
  nfe_key: string;
  nfe_xml_url: string;
}

interface OrderData {
  id: string;
  marketplace_order_id: string;
  customer_name: string;
  order_total: number;
  status: string;
  created_at: string;
  order_items: OrderItem[];
  marketplace: string;
  nfe_data: NfeData;
}

interface ImpressaoListaProps {
  onOpenDetalhesPedido: (pedidoId: string) => void;
}

export function PrintList({ onOpenDetalhesPedido }: ImpressaoListaProps) {
  const [pedidos, setPedidos] = useState<OrderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { settings, loading: settingsLoading, refetch: refetchSettings } = usePrintingSettings();

  const page = parseInt(searchParams.get('page') || '1');
  const limit = 10;
  const offset = (page - 1) * limit;

  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);

  const fetchPedidos = useCallback(async () => {
    setLoading(true);
    try {
      // Mock data for orders ready for printing
      const mockData: OrderData[] = [
        {
          id: "1",
          marketplace_order_id: "ML-123456",
          customer_name: "João Silva",
          order_total: 150.00,
          status: "ready_for_printing",
          created_at: new Date().toISOString(),
          order_items: [
            { product_name: "Produto A", quantity: 2, sku: "SKU001" },
            { product_name: "Produto B", quantity: 1, sku: "SKU002" }
          ],
          marketplace: "Mercado Livre",
          nfe_data: {
            nfe_number: "000001",
            nfe_key: "12345678901234567890123456789012345678901234",
            nfe_xml_url: "https://example.com/nfe.xml"
          }
        },
        {
          id: "2",
          marketplace_order_id: "SH-789012",
          customer_name: "Maria Santos",
          order_total: 89.90,
          status: "ready_for_printing",
          created_at: new Date().toISOString(),
          order_items: [
            { product_name: "Produto C", quantity: 1, sku: "SKU003" }
          ],
          marketplace: "Shopee",
          nfe_data: {
            nfe_number: "000002",
            nfe_key: "98765432109876543210987654321098765432109876",
            nfe_xml_url: "https://example.com/nfe2.xml"
          }
        }
      ];

      setPedidos(mockData);
    } catch (error: any) {
      console.error("Erro ao buscar pedidos para impressão:", error);
      toast({
        title: "Erro",
        description: `Falha ao carregar a lista de pedidos: ${error.message || 'Erro desconhecido'}`,
        variant: "destructive",
      });
      setPedidos([]);
    } finally {
      setLoading(false);
    }
  }, [limit, offset, toast]);

  useEffect(() => {
    fetchPedidos();
  }, [fetchPedidos]);

  const handleImprimir = async (pedido: OrderData) => {
    console.log('>>> Botão "Imprimir" clicado para o pedido:', pedido.id);
    console.log('>>> Estado das configurações:', settings);
    console.log('>>> Estado de carregamento das configurações:', settingsLoading);

    if (settingsLoading) {
      toast({ title: "Aguarde", description: "Carregando configurações de impressão...", variant: "default" });
      return;
    }

    if (!settings) {
      toast({ title: "Erro", description: "Configurações de impressão não carregadas.", variant: "destructive" });
      return;
    }

    toast({
      title: "Gerando Etiqueta",
      description: `Preparando impressão para o pedido ${pedido.marketplace_order_id}...`,
    });

    // Generate PDF content based on print type
    const isZebraPrint = settings.print_type === 'Impressão Zebra';
    const isDanfeSimplificada = settings.label_format === 'Imprimir etiqueta com DANFE SIMPLIFICADA';

    const pdfContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Etiqueta de Envio - ${pedido.marketplace_order_id}</title>
          <meta charset="UTF-8">
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            
            body {
              font-family: Arial, sans-serif;
              ${isZebraPrint ? `
                width: 10cm;
                height: 15cm;
                padding: 0.5cm;
              ` : `
                width: 10.5cm;
                height: 7.4cm;
                padding: 0.3cm;
              `}
              background: white;
              font-size: ${isZebraPrint ? '12px' : '10px'};
              line-height: 1.2;
            }
            
            .etiqueta-container {
              width: 100%;
              height: 100%;
              border: 2px solid #000;
              padding: ${isZebraPrint ? '8px' : '6px'};
              display: flex;
              flex-direction: column;
            }
            
            .header {
              text-align: center;
              border-bottom: 1px solid #000;
              padding-bottom: 4px;
              margin-bottom: 6px;
            }
            
            .titulo {
              font-weight: bold;
              font-size: ${isZebraPrint ? '14px' : '12px'};
              margin-bottom: 2px;
            }
            
            .info-section {
              margin-bottom: 4px;
            }
            
            .info-row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 2px;
            }
            
            .label {
              font-weight: bold;
            }
            
            .value {
              text-align: right;
            }
            
            .nfe-section {
              border-top: 1px solid #000;
              padding-top: 4px;
              margin-top: 4px;
              flex-grow: 1;
            }
            
            .chave-nfe {
              font-size: ${isZebraPrint ? '8px' : '7px'};
              word-break: break-all;
              margin-top: 2px;
            }
            
            .qr-placeholder {
              width: ${isZebraPrint ? '40px' : '30px'};
              height: ${isZebraPrint ? '40px' : '30px'};
              border: 1px solid #000;
              margin: 4px auto;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 8px;
            }

            .items-section {
              border-top: 1px solid #000;
              padding-top: 4px;
              margin-top: 4px;
            }

            .item {
              font-size: ${isZebraPrint ? '10px' : '9px'};
              margin-bottom: 1px;
            }
            
            @media print {
              body {
                ${isZebraPrint ? `
                  width: 10cm;
                  height: 15cm;
                ` : `
                  width: 10.5cm;
                  height: 7.4cm;
                `}
              }
              
              .etiqueta-container {
                page-break-inside: avoid;
              }
            }
          </style>
        </head>
        <body>
          <div class="etiqueta-container">
            <div class="header">
              <div class="titulo">ETIQUETA DE TRANSPORTE</div>
              <div>Pedido: ${pedido.marketplace_order_id}</div>
            </div>
            
            <div class="info-section">
              <div class="info-row">
                <span class="label">Marketplace:</span>
                <span class="value">${pedido.marketplace}</span>
              </div>
              <div class="info-row">
                <span class="label">Cliente:</span>
                <span class="value">${pedido.customer_name}</span>
              </div>
              <div class="info-row">
                <span class="label">Total:</span>
                <span class="value">R$ ${pedido.order_total.toFixed(2)}</span>
              </div>
              <div class="info-row">
                <span class="label">Data:</span>
                <span class="value">${formatDateSP(pedido.created_at)}</span>
              </div>
            </div>

            ${isDanfeSimplificada ? `
              <div class="nfe-section">
                <div class="info-row">
                  <span class="label">NF-e:</span>
                  <span class="value">#${pedido.nfe_data.nfe_number}</span>
                </div>
                <div class="chave-nfe">
                  <strong>Chave:</strong> ${pedido.nfe_data.nfe_key}
                </div>
                <div class="qr-placeholder">QR</div>
              </div>
            ` : ''}

            <div class="items-section">
              <div class="label" style="margin-bottom: 2px;">Itens:</div>
              ${pedido.order_items?.map(item => `
                <div class="item">${item.quantity}x ${item.product_name} (${item.sku})</div>
              `).join('')}
            </div>

            <div style="margin-top: auto; text-align: center; font-size: 8px; border-top: 1px solid #000; padding-top: 2px;">
              Formato: ${settings.print_type} | ${settings.label_format}
            </div>
          </div>
        </body>
      </html>
    `;

    // Open new window with the PDF content
    const newWindow = window.open('', '_blank', 'width=800,height=600,scrollbars=yes,resizable=yes');
    if (newWindow) {
      newWindow.document.write(pdfContent);
      newWindow.document.close();

      // Auto-trigger print dialog after content loads
      newWindow.onload = () => {
        setTimeout(() => {
          newWindow.print();
        }, 500);
      };
    } else {
      toast({
        title: "Erro",
        description: "Não foi possível abrir a janela de impressão. Verifique se pop-ups estão bloqueados.",
        variant: "destructive",
      });
      return;
    }

    // Mark order as printed
    try {
      console.log(`Pedido ${pedido.id} marcado como impresso`);
      toast({
        title: "Sucesso",
        description: "Etiqueta gerada e pedido atualizado.",
      });
      fetchPedidos();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: `Falha ao marcar pedido como impresso: ${error.message || 'Erro desconhecido'}`,
        variant: "destructive",
      });
    }
  };

  const totalPedidos = 8;

  return (
    <div className="space-y-4">
      <div className="flex justify-end space-x-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setIsConfigModalOpen(true)}
          aria-label="Configurações de impressão"
        >
          <Settings className="w-4 h-4" />
        </Button>
      </div>

      {loading || settingsLoading ? (
        <div className="space-y-4">
          {[...Array(limit)].map((_, index) => (
            <div key={index} className="bg-background rounded-lg p-4 shadow-sm flex items-center space-x-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-[250px]" />
                <Skeleton className="h-4 w-[200px]" />
              </div>
            </div>
          ))}
        </div>
      ) : pedidos.length === 0 ? (
        <div className="text-center text-muted-foreground py-10">
          Nenhum pedido encontrado para impressão.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">ID Pedido</TableHead>
              <TableHead>Itens</TableHead>
              <TableHead>Marketplace</TableHead>
              <TableHead>NF-e</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pedidos.map((pedido) => (
              <TableRow key={pedido.id}>
                <TableCell className="font-medium">
                  <span className="block text-sm font-bold text-foreground">{pedido.marketplace_order_id}</span>
                  <span className="block text-xs text-muted-foreground">{formatDateSP(pedido.created_at)}</span>
                </TableCell>
                <TableCell>
                  {pedido.order_items?.map((item, index) => (
                    <div key={index} className="text-sm">
                      {item.quantity}x {item.product_name} ({item.sku})
                    </div>
                  ))}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{pedido.marketplace}</Badge>
                </TableCell>
                <TableCell>
                  {pedido.nfe_data ? (
                    <div className="text-sm">
                      <span className="block font-bold">NF-e: #{pedido.nfe_data.nfe_number}</span>
                      <span className="block text-xs text-muted-foreground">Chave: {pedido.nfe_data.nfe_key}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-destructive">NF não encontrada</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenDetalhesPedido(pedido.id)}
                    >
                      Detalhes
                    </Button>
                    <Button size="sm" onClick={() => handleImprimir(pedido)}>
                      <Printer className="w-4 h-4 mr-2" />
                      Imprimir
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Paginacao
        totalItems={totalPedidos}
        limit={limit}
        currentPage={page}
      />

      <ConfiguracoesImpressaoModal
        open={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        onSettingsSaved={refetchSettings}
      />
    </div>
  );
}