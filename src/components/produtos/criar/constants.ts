
import { Step } from "./types";

export const stepsUnico: Step[] = [
  { id: 1, title: "Tipo de Produto", description: "Escolha o tipo de produto" },
  { id: 2, title: "Informações Principais", description: "Dados básicos do produto" },
  { id: 3, title: "Estoque", description: "Controle de estoque" },
  { id: 4, title: "Dimensões e Peso", description: "Medidas da embalagem" },
  { id: 5, title: "Informações Fiscais", description: "Dados fiscais obrigatórios" },
  { id: 6, title: "Vincular Anúncios", description: "Conecte aos marketplaces" },
];

export const stepsVariacoes: Step[] = [
  { id: 1, title: "Tipo de Produto", description: "Escolha o tipo de produto" },
  { id: 2, title: "Informações Básicas", description: "Dados básicos do produto" },
  { id: 3, title: "Variações", description: "Configure as variações" },
  { id: 4, title: "Dimensões e Peso", description: "Medidas por variação" },
  { id: 5, title: "Informações Fiscais", description: "Dados fiscais por variação" },
  { id: 6, title: "Vincular Anúncios", description: "Conecte por variação" },
];

export const stepsKit: Step[] = [
  { id: 1, title: "Tipo de Produto", description: "Escolha o tipo de produto" },
  { id: 2, title: "Informações do Kit", description: "Dados básicos do kit" },
  { id: 3, title: "Produtos do Kit", description: "Adicione produtos ao kit" },
  { id: 4, title: "Vincular Anúncios", description: "Conecte aos marketplaces" },
];
