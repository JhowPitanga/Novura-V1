
import { ProductVariation } from "@/types/products";
import { VariationTaxForm as OriginalVariationTaxForm } from "@/components/produtos/criar/VariationTaxForm";

interface VariationTaxFormProps {
  variations: ProductVariation[];
  onVariationsChange: (variations: ProductVariation[]) => void;
  showErrors?: boolean;
}

export function VariationTaxForm({ variations, onVariationsChange, showErrors = false }: VariationTaxFormProps) {
  // Convert between English and Portuguese types for compatibility
  const convertVariationsToPT = (variations: ProductVariation[]) => {
    return variations.map(variation => ({
      id: variation.id,
      nome: variation.name,
      cor: variation.color,
      tamanho: variation.size,
      voltagem: variation.voltage,
      tipoPersonalizado: variation.customType,
      valorPersonalizado: variation.customValue,
      sku: variation.sku,
      ean: variation.ean,
      precoCusto: variation.costPrice,
      imagens: variation.images,
      altura: variation.height,
      largura: variation.width,
      comprimento: variation.length,
      peso: variation.weight,
      ncm: variation.ncm,
      cest: variation.cest,
      codigoBarras: variation.barcode,
      unidade: variation.unit,
      origem: variation.origin,
    }));
  };

  const convertVariationsFromPT = (variations: any[]) => {
    return variations.map(variation => ({
      id: variation.id,
      name: variation.nome,
      color: variation.cor,
      size: variation.tamanho,
      voltage: variation.voltagem,
      customType: variation.tipoPersonalizado,
      customValue: variation.valorPersonalizado,
      sku: variation.sku,
      ean: variation.ean,
      costPrice: variation.precoCusto,
      images: variation.imagens,
      height: variation.altura,
      width: variation.largura,
      length: variation.comprimento,
      weight: variation.peso,
      ncm: variation.ncm,
      cest: variation.cest,
      barcode: variation.codigoBarras,
      unit: variation.unidade,
      origin: variation.origem,
    }));
  };

  return (
    <OriginalVariationTaxForm
      variacoes={convertVariationsToPT(variations)}
      onVariacoesChange={(variations) => onVariationsChange(convertVariationsFromPT(variations))}
      showErrors={showErrors}
    />
  );
}
