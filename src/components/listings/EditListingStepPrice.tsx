import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EditListingStepPriceProps } from "./editListing.types";

export function EditListingStepPrice({
  price,
  priceEditable,
  savingKey,
  loadingListing,
  listingTypes,
  listingTypeId,
  listingPriceOptions,
  itemRow,
  onPriceChange,
  onConfirmPrice,
  onListingTypeChange,
  onConfirmListingType,
}: EditListingStepPriceProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Label className="text-lg font-medium">Preço</Label>
        <div className="flex gap-2 items-center">
          <span className="text-gray-500">R$</span>
          <Input
            type="number"
            value={price}
            onChange={(e) => onPriceChange(e.target.value)}
            className="max-w-[200px]"
            disabled={!priceEditable}
          />
        </div>
        {!priceEditable && (
          <p className="text-xs text-muted-foreground">
            O preço não pode ser modificado para este anúncio neste momento.
          </p>
        )}
        <div>
          <Button onClick={onConfirmPrice} disabled={savingKey === "price"}>
            {savingKey === "price" ? "Salvando..." : "Salvar Preço"}
          </Button>
        </div>
      </div>
      <div className="space-y-4 pt-6 border-t">
        <div className="flex items-center justify-between">
          <Label className="text-lg font-medium">Tipo de publicação</Label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(listingTypes || []).map((t: any) => {
            const id = String((t as any)?.id || t);
            const name = String((t as any)?.name || id);
            const opt = (listingPriceOptions || []).find(
              (o: any) => String(o?.listing_type_id || o?.id || "") === id,
            );
            const selected = String(listingTypeId || "") === id;
            const curType = String((itemRow as any)?.listing_type_id || "");
            const isAlt = id !== curType;
            const lp = (itemRow as any)?.listing_prices;
            const viewEntry = Array.isArray(lp?.prices)
              ? (lp.prices.find(
                  (p: any) => String(p?.listing_type_id || p?.id || "") === id,
                ) || lp.prices[0])
              : lp;
            const viewDetails = (viewEntry?.sale_fee_details ||
              viewEntry?.sale_fee?.details ||
              {}) as any;
            const viewCurrency = String(viewEntry?.currency_id || "BRL");
            const viewPct =
              typeof viewDetails?.percentage_fee === "number"
                ? viewDetails.percentage_fee
                : typeof viewDetails?.meli_percentage_fee === "number"
                  ? viewDetails.meli_percentage_fee
                  : undefined;
            const viewFixed =
              typeof viewDetails?.fixed_fee === "number"
                ? viewDetails.fixed_fee
                : 0;
            const viewGross =
              typeof viewDetails?.gross_amount === "number"
                ? viewDetails.gross_amount
                : 0;
            const optDetails =
              (opt as any)?.sale_fee_details || (opt as any)?.sale_fee?.details || {};
            const optCurrency = String(
              (opt as any)?.currency_id || viewCurrency || "BRL",
            );
            const optPct =
              typeof (optDetails as any)?.percentage_fee === "number"
                ? (optDetails as any).percentage_fee
                : typeof (optDetails as any)?.meli_percentage_fee === "number"
                  ? (optDetails as any).meli_percentage_fee
                  : undefined;
            const optFixed =
              typeof (optDetails as any)?.fixed_fee === "number"
                ? (optDetails as any).fixed_fee
                : 0;
            const optGross =
              typeof (optDetails as any)?.gross_amount === "number"
                ? (optDetails as any).gross_amount
                : 0;
            const showData = selected || (!isAlt && id === curType);
            const currency = showData
              ? selected
                ? optCurrency
                : viewCurrency
              : "BRL";
            const fmt = new Intl.NumberFormat("pt-BR", {
              style: "currency",
              currency,
            });
            const pct = showData ? (selected ? optPct : viewPct) : undefined;
            const fixedFee = showData ? (selected ? optFixed : viewFixed) : 0;
            const grossAmount = showData ? (selected ? optGross : viewGross) : 0;
            return (
              <div
                key={id}
                className={`border-2 rounded-3xl p-5 bg-white cursor-pointer transition-all ${
                  selected
                    ? "border-novura-primary"
                    : "border-gray-300 hover:border-novura-primary hover:bg-novura-light"
                } shadow-md`}
                onClick={() => onListingTypeChange(id)}
              >
                <div className="flex items-center justify-between">
                  <div className="text-2xl font-bold text-novura-primary">
                    {name}
                  </div>
                  {selected ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-novura-primary text-white">
                      Selecionado
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 text-sm text-gray-700">
                  <ul className="space-y-1">
                    {(id === "gold_special"
                      ? [
                          "Indicado para Compra à Vista",
                          "Estoque com Alta Rotatividade",
                          "Maximização da Margem Bruta",
                          "Produtos Baratos",
                        ]
                      : [
                          "Produtos Alto Ticket",
                          "Oferecer 12x Sem Juros",
                          "Itens Sazonais/Tendências",
                          "Maior Taxa de Conversão",
                        ]
                    ).map((tip: string, i: number) => (
                      <li key={i} className="flex items-start">
                        <span className="mt-1 mr-2 inline-block w-2 h-2 rounded-full bg-novura-primary"></span>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-4">
                  <div className="text-sm font-semibold text-novura-primary">
                    Tarifa de venda
                  </div>
                  <div className="mt-1 text-sm text-gray-900">
                    Comissão cobrada{" "}
                    {typeof pct === "number" && (pct as number) > 0
                      ? `${(pct as number).toFixed(2)}%`
                      : "-"}
                  </div>
                  <div className="text-sm text-gray-900">
                    Valor fixo {fmt.format(Number(fixedFee || 0))}
                  </div>
                  <div className="text-sm text-gray-900">
                    Valor a ser pago {fmt.format(Number(grossAmount || 0))}
                  </div>
                </div>
                {!selected && (
                  <div className="mt-4">
                    <Button
                      variant="link"
                      className="text-novura-primary p-0 h-auto"
                      onClick={(e) => {
                        e.stopPropagation();
                        onListingTypeChange(id);
                      }}
                    >
                      Selecionar {name}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div>
          <Button
            onClick={onConfirmListingType}
            disabled={savingKey === "listing_type" || loadingListing}
          >
            {savingKey === "listing_type" ? "Salvando..." : "Salvar Tipo"}
          </Button>
        </div>
      </div>
    </div>
  );
}

