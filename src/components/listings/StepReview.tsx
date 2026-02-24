import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface StepReviewProps {
  title: string;
  setTitle: (v: string) => void;
  listingTypeId: string;
  listingTypes: any[];
  selectedLogisticType: string;
  categoryPath: string;
  variations: any[];
  pictures: string[];
  onBack: () => void;
  onPublish: () => void;
}

function ShippingCard({ logisticType }: { logisticType: string }) {
  const label =
    logisticType === "drop_off" ? "Correios"
      : logisticType === "xd_drop_off" ? "Mercado Envios"
        : logisticType === "self_service" ? "Flex"
          : logisticType ? logisticType.toUpperCase()
            : "Não definido";
  const tips = [
    "O custo de entrega é igual ao definido pelo Envios no Mercado Livre.",
    "Se você oferece frete grátis, o custo do frete é por sua conta.",
    "Se você não oferecer frete grátis, vai receber até R$15,90 por envio.",
  ];
  return (
    <div className={`mt-2 border-2 rounded-3xl p-5 bg-white shadow-md ${logisticType ? "border-novura-primary" : "border-gray-300"}`}>
      <div className="flex items-center justify-between">
        <div className="text-2xl font-bold text-novura-primary">{label}</div>
        {logisticType ? (
          <span className="text-xs px-2 py-0.5 rounded-full bg-novura-primary text-white">
            Selecionado
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
}

export function StepReview({
  title,
  setTitle,
  listingTypeId,
  listingTypes,
  selectedLogisticType,
  categoryPath,
  variations,
  pictures,
  onBack,
  onPublish,
}: StepReviewProps) {
  const listingTypeName =
    (listingTypes || []).find((t: any) => String(t?.id || t) === String(listingTypeId))?.name ||
    String(listingTypeId);

  return (
    <div className="space-y-6">
      <div className="text-sm text-gray-700">Revise os dados e publique</div>

      <div className="space-y-2">
        <div className="text-xs font-semibold text-novura-primary">{categoryPath}</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Título do anúncio</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Edite o título do anúncio"
            />
          </div>
          <div>
            <Label>Tipo de publicação</Label>
            <Input value={listingTypeName} readOnly />
          </div>
          <div className="md:col-span-2">
            <Label>Tipo de envio</Label>
            <ShippingCard logisticType={selectedLogisticType} />
          </div>
        </div>
      </div>

      <div>
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="variacoes">
            <AccordionTrigger>Variações</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2">
                {(variations || []).length === 0 ? (
                  <div className="text-sm text-gray-600">Sem variações</div>
                ) : (
                  (variations || []).map((v: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between border rounded-lg p-3">
                      <div>
                        <div className="font-medium text-gray-900">{v.name || `Variação ${idx + 1}`}</div>
                        <div className="text-xs text-gray-500">SKU: {v.sku || "-"}</div>
                      </div>
                      <div className="flex -space-x-2">
                        {(Array.isArray(v?.pictureFiles) ? v.pictureFiles : []).slice(0, 4).map(
                          (f: any, i: number) => (
                            <img
                              key={i}
                              src={typeof f === "string" ? f : f?.preview || f?.url || "/placeholder.svg"}
                              className="w-8 h-8 rounded object-cover border"
                            />
                          )
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="fotos">
            <AccordionTrigger>Fotos</AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-wrap gap-2">
                {(pictures || []).length === 0 ? (
                  <div className="text-sm text-gray-600">Sem fotos</div>
                ) : (
                  (pictures || []).map((src: string, i: number) => (
                    <img key={i} src={src} className="w-16 h-16 rounded object-cover border" />
                  ))
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" className="border-2 rounded-2xl" onClick={onBack}>
          Voltar
        </Button>
        <Button className="bg-novura-primary hover:bg-novura-primary/90" onClick={onPublish}>
          Publicar anúncio
        </Button>
      </div>
    </div>
  );
}
