import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface EditListingShippingDimensionsProps {
  shipping: any;
  setShipping: (v: any | ((prev: any) => any)) => void;
  weightUnit?: 'g' | 'kg';
  weightLabel?: string;
}

export function EditListingShippingDimensions({
  shipping,
  setShipping,
  weightUnit = 'g',
  weightLabel,
}: EditListingShippingDimensionsProps) {
  const dims = (shipping as any)?.dimensions || {};
  const dimStr = (v: unknown) => (v === '' || v == null ? '' : String(v));

  const weightVal =
    (shipping as any)?.weight ?? dims?.weight ?? '';

  const updateDim = (field: 'height' | 'width' | 'length', value: string) => {
    setShipping((prev: any) => ({
      ...prev,
      dimensions: { ...(prev?.dimensions || {}), [field]: value },
    }));
  };

  const updateWeight = (value: string) => {
    setShipping((prev: any) => ({
      ...prev,
      weight: value,
      dimensions: { ...(prev?.dimensions || {}), weight: value },
    }));
  };

  const wLabel = weightLabel || (weightUnit === 'kg' ? 'Peso (kg)' : 'Peso (g)');

  return (
    <div className="space-y-4 rounded-2xl border border-gray-200 bg-gray-50/50 p-4">
      <div className="text-sm font-medium text-gray-900">Dimensões e peso do pacote</div>
      <p className="text-xs text-gray-500">
        Informe as medidas usadas no envio deste anúncio.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label className="text-xs text-gray-600">{wLabel}</Label>
          <Input
            type="number"
            step="any"
            min="0"
            className="mt-1"
            placeholder={weightUnit === 'kg' ? '0.5' : '500'}
            value={dimStr(weightVal)}
            onChange={(e) => updateWeight(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs text-gray-600">Altura (cm)</Label>
          <Input
            type="number"
            step="any"
            min="0"
            className="mt-1"
            placeholder="cm"
            value={dimStr(dims?.height)}
            onChange={(e) => updateDim('height', e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs text-gray-600">Largura (cm)</Label>
          <Input
            type="number"
            step="any"
            min="0"
            className="mt-1"
            placeholder="cm"
            value={dimStr(dims?.width)}
            onChange={(e) => updateDim('width', e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs text-gray-600">Comprimento (cm)</Label>
          <Input
            type="number"
            step="any"
            min="0"
            className="mt-1"
            placeholder="cm"
            value={dimStr(dims?.length)}
            onChange={(e) => updateDim('length', e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
