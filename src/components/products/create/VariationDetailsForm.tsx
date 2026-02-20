
import React, { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStorage } from "@/hooks/useStorage";
import { Variacao } from "./types";

interface VariationDetailsFormProps {
  variacao: Variacao;
  onUpdate: (variacaoId: string, field: string, value: any) => void;
  onImageUpload?: (variacaoId: string, event: React.ChangeEvent<HTMLInputElement>) => void;
  showErrors?: boolean;
  disableStock?: boolean;
}

export function VariationDetailsForm({ variacao, onUpdate, onImageUpload, showErrors = false, disableStock = false }: VariationDetailsFormProps) {
  const { storageLocations, loading: storageLoading } = useStorage();

  // Define automaticamente um armazém padrão ao carregar a lista de storage
  useEffect(() => {
    if (!storageLoading && storageLocations.length > 0 && !variacao.armazem) {
      onUpdate(variacao.id, "armazem", storageLocations[0].id);
    }
  }, [storageLoading, storageLocations, variacao.id, variacao.armazem, onUpdate]);

  // Preview da capa (primeira imagem da variação)
  const coverPreview = (() => {
    const file = variacao.imagens?.[0];
    if (!file) return undefined;
    try {
      return URL.createObjectURL(file as any);
    } catch {
      return undefined;
    }
  })();

  return (
    <div className="space-y-6">
      {/* Campos de SKU e EAN */}
      <div className="grid grid-cols-2 gap-4 items-start">
        <div>
          <Label htmlFor={`sku-${variacao.id}`}>SKU</Label>
          <Input
            id={`sku-${variacao.id}`}
            value={variacao.sku}
            onChange={(e) => onUpdate(variacao.id, "sku", e.target.value)}
            placeholder="SKU da variação"
            className={`mt-2 ${showErrors && !variacao.sku ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
          />
          {showErrors && !variacao.sku && (
            <p className="text-red-600 text-sm mt-1">Campo obrigatório</p>
          )}
        </div>
        <div>
          <Label htmlFor={`ean-${variacao.id}`}>Código de Barras (EAN)</Label>
          <Input
            id={`ean-${variacao.id}`}
            value={variacao.ean}
            onChange={(e) => onUpdate(variacao.id, "ean", e.target.value)}
            placeholder="Código de barras"
            className={`mt-2 ${showErrors && !variacao.ean ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
          />
          {showErrors && !variacao.ean && (
            <p className="text-red-600 text-sm mt-1">Campo obrigatório</p>
          )}
        </div>
      </div>

      {/* Campo de Preço de Custo */}
      <div>
        <Label htmlFor={`preco-${variacao.id}`}>Preço de Custo</Label>
        <Input
          id={`preco-${variacao.id}`}
          type="number"
          step="0.01"
          value={variacao.precoCusto}
          onChange={(e) => onUpdate(variacao.id, "precoCusto", e.target.value)}
          placeholder="0,00"
          className="mt-2"
        />
      </div>

      {/* Campos de Estoque e Armazém */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor={`estoque-${variacao.id}`}>Estoque</Label>
          <Input
            id={`estoque-${variacao.id}`}
            type="number"
            value={variacao.estoque || ""}
            onChange={(e) => onUpdate(variacao.id, "estoque", e.target.value)}
            placeholder="Quantidade em estoque"
            className={`mt-2 ${showErrors && !variacao.estoque ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
            disabled={disableStock}
            inputMode="numeric"
            pattern="[0-9]*"
            min={0}
          />
          {disableStock && (
            <p className="text-xs text-gray-500 mt-1">Edição de estoque bloqueada. Ajuste no módulo de estoque.</p>
          )}
          {showErrors && !variacao.estoque && !disableStock && (
            <p className="text-red-600 text-sm mt-1">Campo obrigatório</p>
          )}
        </div>
        <div>
          <Label htmlFor={`armazem-${variacao.id}`}>Armazém</Label>
          <Select
            // Use undefined para não marcar seleção quando não houver valor
            value={variacao.armazem ?? undefined}
            onValueChange={(value) => onUpdate(variacao.id, "armazem", value)}
          >
            <SelectTrigger
              className={`mt-2 ${showErrors && !variacao.armazem ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
            >
              <SelectValue placeholder="Selecione o armazém" />
            </SelectTrigger>
            <SelectContent>
              {storageLoading && (
                <SelectItem disabled value="__loading">Carregando armazéns...</SelectItem>
              )}
              {!storageLoading && storageLocations.length === 0 && (
                <SelectItem disabled value="__empty">Nenhum armazém cadastrado</SelectItem>
              )}
              {!storageLoading && storageLocations.map((storage) => (
                <SelectItem key={storage.id} value={storage.id}>
                  {storage.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {showErrors && !variacao.armazem && (
            <p className="text-red-600 text-sm mt-2">Campo obrigatório</p>
          )}
        </div>
      </div>
    </div>
  );
}

