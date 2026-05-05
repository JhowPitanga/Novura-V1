
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProductVariation } from "@/types/products";
import { validateEanChecksum } from "@/utils/eanChecksum";

interface VariationTaxFormProps {
  variations: ProductVariation[];
  onVariationsChange: (variations: ProductVariation[]) => void;
  showErrors?: boolean;
}

export function VariationTaxForm({ variations, onVariationsChange, showErrors = false }: VariationTaxFormProps) {
  const [activeEanId, setActiveEanId] = useState<string | null>(null);
  const [blurredEans, setBlurredEans] = useState<Record<string, boolean>>({});

  const isInvalidEan = (value?: string) => {
    if (!value) return false;
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 13) return true;
    return !validateEanChecksum(digits);
  };

  const isInvalidNcm = (value?: string) => {
    if (!value) return false;
    return value.replace(/\D/g, "").length !== 8;
  };

  const isInvalidCest = (value?: string) => {
    if (!value) return false;
    const digits = value.replace(/\D/g, "");
    return digits.length !== 7;
  };

  const updateVariationField = (variationId: string, field: keyof ProductVariation, value: string) => {
    onVariationsChange(
      variations.map((variation) =>
        variation.id === variationId ? { ...variation, [field]: value } : variation
      )
    );
  };

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold">Informações Fiscais por Variação</h3>
      {variations.map((variation) => {
        const invalidEan = isInvalidEan(variation.ean || variation.barcode);
        const showInvalidEan = invalidEan && activeEanId !== variation.id && (showErrors || blurredEans[variation.id]);
        const invalidNcm = isInvalidNcm(variation.ncm);
        const invalidCest = isInvalidCest(variation.cest);
        return (
          <div key={variation.id} className="border rounded-lg p-4 space-y-4">
            <p className="font-medium">{variation.name}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor={`variation-ean-${variation.id}`}>Código de Barras (EAN-13)</Label>
                <Input
                  id={`variation-ean-${variation.id}`}
                  value={variation.ean || variation.barcode || ""}
                  onChange={(e) => updateVariationField(variation.id, "ean", e.target.value.replace(/\D/g, "").slice(0, 13))}
                  onFocus={() => setActiveEanId(variation.id)}
                  onBlur={() => {
                    setActiveEanId(null);
                    setBlurredEans((prev) => ({ ...prev, [variation.id]: true }));
                  }}
                  placeholder="13 dígitos"
                  className={`mt-2 ${showInvalidEan || (showErrors && !(variation.ean || variation.barcode)) ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                  maxLength={13}
                  inputMode="numeric"
                />
                {showInvalidEan ? (
                  <p className="text-red-600 text-xs mt-1">EAN inválido: informe 13 dígitos com dígito verificador correto.</p>
                ) : null}
              </div>

              <div>
                <Label htmlFor={`variation-cest-${variation.id}`}>CEST</Label>
                <Input
                  id={`variation-cest-${variation.id}`}
                  value={variation.cest || ""}
                  onChange={(e) => updateVariationField(variation.id, "cest", e.target.value.replace(/\D/g, "").slice(0, 13))}
                  placeholder="0000000"
                  className={`mt-2 ${invalidCest ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                  maxLength={13}
                  inputMode="numeric"
                />
                {invalidCest ? (
                  <p className="text-red-600 text-xs mt-1">CEST deve ter 7 dígitos.</p>
                ) : null}
              </div>

              <div>
                <Label htmlFor={`variation-ncm-${variation.id}`}>NCM</Label>
                <Input
                  id={`variation-ncm-${variation.id}`}
                  value={variation.ncm || ""}
                  onChange={(e) => updateVariationField(variation.id, "ncm", e.target.value.replace(/\D/g, "").slice(0, 8))}
                  placeholder="00000000"
                  maxLength={8}
                  inputMode="numeric"
                  className={`mt-2 ${invalidNcm || (showErrors && !variation.ncm) ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                />
                {invalidNcm ? (
                  <p className="text-red-600 text-xs mt-1">NCM deve ter exatamente 8 dígitos.</p>
                ) : null}
              </div>

              <div>
                <Label htmlFor={`variation-origin-${variation.id}`}>Origem</Label>
                <Select
                  value={variation.origin || ""}
                  onValueChange={(value) => updateVariationField(variation.id, "origin", value)}
                >
                  <SelectTrigger className={`mt-2 ${showErrors && !variation.origin ? "border-red-500 focus-visible:ring-red-500" : ""}`}>
                    <SelectValue placeholder="Selecione a origem" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0 - Nacional</SelectItem>
                    <SelectItem value="1">1 - Estrangeira - Importação direta</SelectItem>
                    <SelectItem value="2">2 - Estrangeira - Adquirida no mercado interno</SelectItem>
                    <SelectItem value="3">3 - Nacional - Conteúdo de importação superior a 40%</SelectItem>
                    <SelectItem value="4">4 - Nacional - Produção conforme processos produtivos básicos</SelectItem>
                    <SelectItem value="5">5 - Nacional - Conteúdo de importação até 40%</SelectItem>
                    <SelectItem value="6">6 - Estrangeira - Importação direta sem similar nacional</SelectItem>
                    <SelectItem value="7">7 - Estrangeira - Adquirida no mercado interno sem similar nacional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
