
import { EstoqueItem, RecebimentoItem, PickingItem, ExpedicaoItem, Armazem, Marketplace } from "@/types/estoque";

export const armazens: Armazem[] = [
  { id: "todos", name: "Todos os Galpões" },
{ id: "galpao1", name: "Armazém Principal SP" },
{ id: "galpao2", name: "Armazém Secundário RJ" },
{ id: "galpao3", name: "Armazém Norte MG" },
  { id: "fulfillment", name: "Centro Fulfillment" },
];

export const marketplaces: Marketplace[] = [
  { id: "todos", name: "Todos Marketplaces" },
  { id: "mercadolivre", name: "Mercado Livre" },
  { id: "amazon", name: "Amazon" },
  { id: "shopee", name: "Shopee" },
  { id: "magalu", name: "Magazine Luiza" },
];

export const estoqueData: EstoqueItem[] = [
{ id: 1, produto: "iPhone 15 Pro", sku: "IPH15P-001", galpao: "Armazém Principal SP", endereco: "A01-B02-C03", estoque: 25, reservado: 5, disponivel: 20, minimo: 10, maximo: 50, status: "Normal", ultimaMovimentacao: "2024-01-15", valor: 199997.50, marketplace: "Mercado Livre" },
  { id: 2, produto: "MacBook Air M2", sku: "MBA-M2-002", galpao: "Centro Fulfillment", endereco: "B05-A01-D02", estoque: 8, reservado: 3, disponivel: 5, minimo: 15, maximo: 30, status: "Baixo", ultimaMovimentacao: "2024-01-14", valor: 79999.20, marketplace: "Amazon" },
{ id: 3, produto: "AirPods Pro", sku: "APP-003", galpao: "Armazém Secundário RJ", endereco: "C02-B03-A01", estoque: 45, reservado: 10, disponivel: 35, minimo: 20, maximo: 100, status: "Normal", ultimaMovimentacao: "2024-01-13", valor: 103495.50, marketplace: "Shopee" },
{ id: 4, produto: "iPad Air", sku: "IPA-004", galpao: "Armazém Principal SP", endereco: "A03-C01-B02", estoque: 2, reservado: 1, disponivel: 1, minimo: 5, maximo: 25, status: "Crítico", ultimaMovimentacao: "2024-01-12", valor: 9999.98, marketplace: "Magazine Luiza" },
];

export const recebimentoData: RecebimentoItem[] = [
{ id: 1, nf: "12345", fornecedor: "Apple Inc", produtos: 15, dataChegada: "2024-01-20", status: "Pendente", galpao: "Armazém Principal SP" },
  { id: 2, nf: "12346", fornecedor: "Samsung", produtos: 8, dataChegada: "2024-01-19", status: "Conferindo", galpao: "Centro Fulfillment" },
{ id: 3, nf: "12347", fornecedor: "Xiaomi", produtos: 25, dataChegada: "2024-01-18", status: "Concluído", galpao: "Armazém Secundário RJ" },
];

export const pickingData: PickingItem[] = [
{ id: 1, pedido: "PED-001", cliente: "João Silva", produtos: 3, prioridade: "Alta", status: "Em Separação", operador: "Maria Santos", galpao: "Armazém Principal SP" },
  { id: 2, pedido: "PED-002", cliente: "Ana Costa", produtos: 1, prioridade: "Normal", status: "Aguardando", operador: "-", galpao: "Centro Fulfillment" },
{ id: 3, pedido: "PED-003", cliente: "Pedro Lima", produtos: 5, prioridade: "Urgente", status: "Separado", operador: "Carlos Oliveira", galpao: "Armazém Principal SP" },
];

export const expedicaoData: ExpedicaoItem[] = [
{ id: 1, pedido: "PED-001", transportadora: "Correios", rastreamento: "BR123456789", status: "Embalado", previsao: "2024-01-22", galpao: "Armazém Principal SP" },
{ id: 2, pedido: "PED-003", transportadora: "Jadlog", rastreamento: "JD987654321", status: "Expedido", previsao: "2024-01-21", galpao: "Armazém Principal SP" },
  { id: 3, pedido: "PED-004", transportadora: "Total Express", rastreamento: "TE456789123", status: "Em Trânsito", previsao: "2024-01-20", galpao: "Centro Fulfillment" },
];
