
import { LucideIcon } from "lucide-react";

export interface Variacao {
  id: string;
  nome: string;
  cor?: string;
  tamanho?: string;
  voltagem?: string;
  tipoPersonalizado?: string;
  valorPersonalizado?: string;
  sku: string;
  ean: string;
  precoCusto: string;
  imagens: File[];
  altura?: string;
  largura?: string;
  comprimento?: string;
  peso?: string;
  ncm?: string;
  cest?: string;
  codigoBarras?: string;
  unidade?: string;
  origem?: string;
  estoque?: string;
  armazem?: string;
}

export interface TipoVariacao {
  id: string;
  nome: string;
  icon: LucideIcon;
  opcoes: string[];
}

export interface FormData {
  tipo: string;
  nome: string;
  sku: string;
  categoria: string;
  marca: string;
  descricao: string;
  precoCusto: string;
  precoVenda: string;
  estoque: string;
  armazem: string;
  altura: string;
  largura: string;
  comprimento: string;
  peso: string;
  tipoUnidade: string;
  codigoBarras: string;
  ncm: string;
  cest: string;
  origem: string;
}

export interface Step {
  id: number;
  title: string;
  description: string;
}

export interface KitItem {
  id: string;
  name: string;
  sku: string;
  type: "unico" | "variacao";
  quantidade: number;
  image?: string;
}
