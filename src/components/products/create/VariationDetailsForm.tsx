
import React, { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStorage } from "@/hooks/useStorage";
import { Variacao } from "./types";
import { BrMoneyInput } from "@/components/products/create/BrMoneyInput";

interface VariationDetailsFormProps {
  variacao: Variacao;
  onUpdate: (variacaoId: string, field: string, value: any) => void;
  onImageUpload?: (variacaoId: string, event: React.ChangeEvent<HTMLInputElement>) => void;
  showErrors?: boolean;
  disableStock?: boolean;
}

export function VariationDetailsForm({ variacao, onUpdate, onImageUpload, showErrors = false, disableStock = false }: VariationDetailsFormProps) {
  const { storageLocations, loading: storageLoading } = useStorage();
  const [eanFocused, setEanFocused] = useState(false);
  const eanDigits = (variacao.ean || "").replace(/\D/g, "");
  const invalidEan = showErrors && !eanFocused && variacao.ean ? eanDigits.length !== 13 : false;

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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
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
          <Label htmlFor={`ean-${variacao.id}`}>Código de Barras (EAN-13)</Label>
          <Input
            id={`ean-${variacao.id}`}
            value={variacao.ean}
            onChange={(e) => onUpdate(variacao.id, "ean", e.target.value.replace(/\D/g, "").slice(0, 13))}
            onFocus={() => setEanFocused(true)}
            onBlur={() => setEanFocused(false)}
            placeholder="13 dígitos"
            className={`mt-2 ${(showErrors && !variacao.ean) || invalidEan ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
            maxLength={13}
            inputMode="numeric"
          />
          {invalidEan ? (
            <p className="text-red-600 text-sm mt-1">EAN inválido: informe 13 dígitos.</p>
          ) : showErrors && !variacao.ean ? (
            <p className="text-red-600 text-sm mt-1">Campo obrigatório</p>
          ) : null}
        </div>
      </div>

      {/* Campo de Preço de Custo */}
      <div>
        <Label htmlFor={`preco-${variacao.id}`}>Preço de Custo</Label>
        <BrMoneyInput
          id={`preco-${variacao.id}`}
          value={variacao.precoCusto}
          onChange={(value) => onUpdate(variacao.id, "precoCusto", value)}
          placeholder="0,00"
          className="mt-2"
        />
      </div>

      {/* Campos de Estoque e Armazém */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

