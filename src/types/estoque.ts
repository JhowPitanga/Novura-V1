
export interface EstoqueItem {
  id: number;
  produto: string;
  sku: string;
  galpao: string;
  endereco: string;
  estoque: number;
  reservado: number;
  disponivel: number;
  minimo: number;
  maximo: number;
  status: string;
  ultimaMovimentacao: string;
  valor: number;
  marketplace: string;
}

export interface RecebimentoItem {
  id: number;
  nf: string;
  fornecedor: string;
  produtos: number;
  dataChegada: string;
  status: string;
  galpao: string;
}

export interface PickingItem {
  id: number;
  pedido: string;
  cliente: string;
  produtos: number;
  prioridade: string;
  status: string;
  operador: string;
  galpao: string;
}

export interface ExpedicaoItem {
  id: number;
  pedido: string;
  transportadora: string;
  rastreamento: string;
  status: string;
  previsao: string;
  galpao: string;
}

export interface Armazem {
  id: string;
  name: string;
}

export interface Marketplace {
  id: string;
  name: string;
}
