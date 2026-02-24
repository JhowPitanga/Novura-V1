import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

interface StepShippingProps {
  shipping: any;
  setShipping: (v: any) => void;
  freeShippingMandatory: boolean;
  availableLogisticTypes: string[];
  selectedLogisticType: string;
  setSelectedLogisticType: (v: string) => void;
}

export function StepShipping({
  shipping,
  setShipping,
  freeShippingMandatory,
  availableLogisticTypes,
  selectedLogisticType,
  setSelectedLogisticType,
}: StepShippingProps) {
  const isMe2 = String((shipping as any)?.mode || "").toLowerCase() === "me2";
  const logisticLabel = (t: string) =>
    t === "drop_off" ? "Correios" : t === "xd_drop_off" ? "Mercado Envios" : String(t || "").toUpperCase();

  const tips = [
    "O custo de entrega é igual ao definido pelo Envios no Mercado Livre.",
    "Se você oferece frete grátis, o custo do frete é por sua conta.",
    "Se você não oferecer frete grátis, vai receber até R$15,90 por envio.",
  ];

  const principals = (availableLogisticTypes || []).filter((t) => t !== "self_service");
  const singlePrincipal = principals.length <= 1;

  const handleWeightChange = (value: string) => {
    const w = Number(value) || 0;
    const dims = (shipping as any)?.dimensions || {};
    setShipping({
      ...(shipping || {}),
      weight: w,
      dimensions: { ...dims, weight: w },
    });
  };

  const handleHeightChange = (value: string) => {
    const dims = (shipping as any)?.dimensions || {};
    setShipping({ ...(shipping || {}), dimensions: { ...dims, height: Number(value) || 0 } });
  };

  const handleWidthChange = (value: string) => {
    const dims = (shipping as any)?.dimensions || {};
    setShipping({ ...(shipping || {}), dimensions: { ...dims, width: Number(value) || 0 } });
  };

  const handleLengthChange = (value: string) => {
    const dims = (shipping as any)?.dimensions || {};
    setShipping({ ...(shipping || {}), dimensions: { ...dims, length: Number(value) || 0 } });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="text-sm text-gray-700">Tipos de logística disponíveis</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(availableLogisticTypes || []).map((t) => {
            if (t === "self_service") return null;
            const clickable = !singlePrincipal;
            const selected = selectedLogisticType === t;
            return (
              <div
                key={t}
                className={`border-2 rounded-3xl p-5 bg-white ${clickable ? "cursor-pointer transition-all" : "cursor-default"} ${selected ? "border-novura-primary" : clickable ? "border-gray-300 hover:border-novura-primary hover:bg-novura-light" : "border-gray-300"} shadow-md`}
                onClick={clickable ? () => setSelectedLogisticType(t) : undefined}
              >
                <div className="flex items-center justify-between">
                  <div className="text-2xl font-bold text-novura-primary">{logisticLabel(t)}</div>
                  {selected && !clickable ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-novura-primary text-white">
                      Selecionado automaticamente
                    </span>
                  ) : null}
                </div>
                <ul className="mt-3 space-y-1">
                  {tips.map((tip, i) => (
                    <li key={i} className="flex items-start text-sm text-gray-700">
                      <span className="mt-1 mr-2 inline-block w-2 h-2 rounded-full bg-novura-primary" />
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm text-gray-700">Preferências</div>
        <div className="flex items-center space-x-3">
          {isMe2 && (
            <label className="flex items-center space-x-2">
              <Checkbox
                checked={!!(shipping as any)?.free_shipping}
                disabled={freeShippingMandatory}
                onCheckedChange={(v) => {
                  if (freeShippingMandatory) return;
                  setShipping({ ...(shipping || {}), free_shipping: !!v });
                }}
              />
              <span className="text-sm">Frete grátis</span>
              {freeShippingMandatory ? (
                <span className="inline-flex items-center rounded-full bg-novura-primary text-white px-2 py-0.5 text-[10px]">
                  Obrigatório
                </span>
              ) : null}
            </label>
          )}
          <label className="flex items-center space-x-2">
            <Checkbox
              checked={!!(shipping as any)?.local_pick_up}
              onCheckedChange={(v) => setShipping({ ...(shipping || {}), local_pick_up: !!v })}
            />
            <span className="text-sm">Retirada local</span>
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="text-sm text-gray-700">Dimensões e peso</div>
          {isMe2 ? (
            <span className="inline-flex items-center rounded-full bg-novura-primary text-white px-2 py-0.5 text-[10px]">
              Obrigatório
            </span>
          ) : null}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            type="number"
            step="1"
            min="1"
            placeholder="Peso (g)"
            onChange={(e) => handleWeightChange(e.target.value)}
          />
          <Input
            type="number"
            step="1"
            min="1"
            placeholder="Altura (cm)"
            onChange={(e) => handleHeightChange(e.target.value)}
          />
          <Input
            type="number"
            step="1"
            min="1"
            placeholder="Largura (cm)"
            onChange={(e) => handleWidthChange(e.target.value)}
          />
          <Input
            type="number"
            step="1"
            min="1"
            placeholder="Comprimento (cm)"
            onChange={(e) => handleLengthChange(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
