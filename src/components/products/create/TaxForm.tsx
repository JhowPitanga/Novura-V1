
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProductFormData } from "@/types/products";

interface TaxFormProps {
  formData: ProductFormData;
  onInputChange: (field: string, value: string) => void;
  errors?: Record<string, boolean>;
}

export function TaxForm({ formData, onInputChange, errors = {} }: TaxFormProps) {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-xl font-semibold mb-6">Informações Fiscais</h3>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="barcode">Código de Barras (EAN)</Label>
              <Input
                id="barcode"
                value={formData.barcode}
                onChange={(e) => onInputChange("barcode", e.target.value)}
                placeholder="Código de barras do produto"
                className={`mt-2 ${errors.barcode ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
              />
              {errors.barcode && (
                <p className="text-red-600 text-sm mt-1">Campo obrigatório</p>
              )}
            </div>
            <div>
              <Label htmlFor="ncm">
                NCM <span className="text-red-500">*</span>
              </Label>
              <Input
                id="ncm"
                value={formData.ncm}
                onChange={(e) => onInputChange("ncm", e.target.value)}
                placeholder="00000000"
                className={`mt-2 ${errors.ncm ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                required
              />
              {errors.ncm && (
                <p className="text-red-600 text-sm mt-1">Campo obrigatório</p>
              )}
            </div>
            <div>
              <Label htmlFor="cest">CEST</Label>
              <Input
                id="cest"
                value={formData.cest}
                onChange={(e) => onInputChange("cest", e.target.value)}
                placeholder="0000000"
                className="mt-2"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="unitType">Unidade de Medida</Label>
              <Select
                value={formData.unitType}
                onValueChange={(value) => onInputChange("unitType", value)}
              >
                <SelectTrigger className={`mt-2 ${errors.unitType ? 'border-red-500 focus-visible:ring-red-500' : ''}`}>
                  <SelectValue placeholder="Selecione a unidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UN">Unidade (UN)</SelectItem>
                  <SelectItem value="KG">Quilograma (KG)</SelectItem>
                  <SelectItem value="PAR">Par (PAR)</SelectItem>
                  <SelectItem value="KIT">Kit (KIT)</SelectItem>
                </SelectContent>
              </Select>
              {errors.unitType && (
                <p className="text-red-600 text-sm mt-1">Campo obrigatório</p>
              )}
            </div>
            <div>
              <Label htmlFor="origin">Origem</Label>
              <Select
                value={formData.origin}
                onValueChange={(value) => onInputChange("origin", value)}
              >
                <SelectTrigger className={`mt-2 ${errors.origin ? 'border-red-500 focus-visible:ring-red-500' : ''}`}>
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
              {errors.origin && (
                <p className="text-red-600 text-sm mt-1">Campo obrigatório</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
