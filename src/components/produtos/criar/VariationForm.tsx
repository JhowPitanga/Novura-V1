
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Accordion } from "@/components/ui/accordion";
import { Variacao, TipoVariacao } from "./types";
import { VariationTypeSelector } from "./VariationTypeSelector";
import { VariationOptionsForm } from "./VariationOptionsForm";
import { VariationAccordionItem } from "./VariationAccordionItem";

interface VariationFormProps {
  variacoes: Variacao[];
  onVariacoesChange: (variacoes: Variacao[]) => void;
  etapaAtual: "tipos" | "opcoes" | "configuracao";
  onEtapaChange: (etapa: "tipos" | "opcoes" | "configuracao") => void;
  tiposVariacao: TipoVariacao[];
  onTiposVariacaoChange: (tipos: TipoVariacao[]) => void;
  editMode?: boolean;
}

export function VariationForm({ 
  variacoes, 
  onVariacoesChange, 
  etapaAtual, 
  onEtapaChange, 
  tiposVariacao, 
  onTiposVariacaoChange,
  editMode = false
}: VariationFormProps) {
  const handleImageUpload = (variacaoId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = (event.target.files && event.target.files[0]) || null;
    if (!file) return;

    // Validação: apenas JPG/PNG e até 2MB
    const isValidType = ["image/jpeg", "image/png"].includes(file.type);
    const isValidSize = file.size <= 2 * 1024 * 1024; // 2MB
    if (!isValidType || !isValidSize) {
      // Ignora arquivos inválidos
      return;
    }

    onVariacoesChange(variacoes.map(v => 
      v.id === variacaoId 
        ? { ...v, imagens: [file] }
        : v
    ));
  };

  const removeImage = (variacaoId: string, imageIndex: number) => {
    onVariacoesChange(variacoes.map(v => 
      v.id === variacaoId 
        ? { ...v, imagens: [] }
        : v
    ));
  };

  const updateVariacao = (variacaoId: string, field: string, value: string) => {
    // Normaliza estoque para aceitar apenas números inteiros não negativos
    const normalizedValue = field === "estoque"
      ? (value || "").replace(/\D/g, "")
      : value;

    onVariacoesChange(variacoes.map(v => 
      v.id === variacaoId ? { ...v, [field]: normalizedValue } : v
    ));
  };

  const handleVariacoesGenerate = () => {
    const tiposComOpcoes = tiposVariacao.filter(tipo => tipo.opcoes.length > 0);
    
    if (tiposComOpcoes.length === 0) return;

    const gerarCombinacoes = (arrays: string[][]): string[][] => {
      if (arrays.length === 0) return [[]];
      if (arrays.length === 1) return arrays[0].map(item => [item]);
      
      const [first, ...rest] = arrays;
      const restCombinations = gerarCombinacoes(rest);
      
      return first.flatMap(item =>
        restCombinations.map(combination => [item, ...combination])
      );
    };

    const opcoesPorTipo = tiposComOpcoes.map(tipo => tipo.opcoes);
    const combinacoes = gerarCombinacoes(opcoesPorTipo);

    const novasVariacoes: Variacao[] = combinacoes.map((combinacao, index) => {
      const nomeVariacao = combinacao.join(" - ");
      const variacao: Variacao = {
        id: `var_${Date.now()}_${index}`,
        nome: nomeVariacao,
        sku: "",
        ean: "",
        precoCusto: "",
        imagens: [],
      };

      tiposComOpcoes.forEach((tipo, tipoIndex) => {
        const valor = combinacao[tipoIndex];
        switch (tipo.id) {
          case "cor":
            variacao.cor = valor;
            break;
          case "tamanho":
            variacao.tamanho = valor;
            break;
          case "voltagem":
            variacao.voltagem = valor;
            break;
          default:
            variacao.tipoPersonalizado = tipo.nome;
            variacao.valorPersonalizado = valor;
            break;
        }
      });

      return variacao;
    });

    onVariacoesChange(novasVariacoes);
  };

  if (etapaAtual === "tipos") {
    return (
      <VariationTypeSelector
        tiposSelecionados={tiposVariacao}
        onTiposChange={onTiposVariacaoChange}
      />
    );
  }

  if (etapaAtual === "opcoes") {
    return (
      <VariationOptionsForm
        tiposVariacao={tiposVariacao}
        onTiposChange={onTiposVariacaoChange}
        onVariacoesGenerate={handleVariacoesGenerate}
      />
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold mb-2">Configurar Variações</h3>
          <p className="text-gray-600">Configure as fotos, SKU e códigos de barras para cada variação</p>
        </div>
        <Button variant="outline" onClick={() => onEtapaChange("opcoes")}>
          Editar variações
        </Button>
      </div>

      {variacoes.length > 0 && (
        <Accordion type="single" collapsible className="space-y-4">
          {variacoes.map((variacao) => (
            <VariationAccordionItem
              key={variacao.id}
              variacao={variacao}
              onImageUpload={handleImageUpload}
              onRemoveImage={removeImage}
              onUpdate={updateVariacao}
            />
          ))}
        </Accordion>
      )}
    </div>
  );
}
