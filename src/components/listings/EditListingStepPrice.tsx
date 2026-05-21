import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRLPrice } from "@/utils/editListingHelpers";
import type { EditListingStepPriceProps } from "./editListing.types";

export function EditListingStepPrice({
  price,
  priceEditable,
  savingKey,
  loadingListing,
  showListingTypes,
  marketplaceLabel,
  listingTypes,
  listingTypeId,
  listingPriceOptions,
  itemRow,
  onPriceChange,
  onConfirmPrice,
  onListingTypeChange,
  onConfirmListingType,
}: EditListingStepPriceProps) {
  const displayPrice = formatBRLPrice(price);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-novura-primary">
          {marketplaceLabel}
        </span>
      </div>

      <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <Label className="text-lg font-medium">Preço de venda</Label>
        <p className="text-sm text-gray-600">
          Valor universal exibido no anúncio (preço base do produto).
        </p>
        <div className="text-3xl font-bold text-novura-primary">{displayPrice}</div>
        <div className="flex gap-2 items-center max-w-xs">
          <span className="text-gray-500 shrink-0">R$</span>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={price}
            onChange={(e) => onPriceChange(e.target.value)}
            disabled={!priceEditable}
            placeholder="0,00"
          />
        </div>
        {!priceEditable && (
          <p className="text-xs text-muted-foreground">
            O preço não pode ser modificado para este anúncio neste momento.
          </p>
        )}
        <div>
          <Button onClick={onConfirmPrice} disabled={savingKey === "price"}>
            {savingKey === "price" ? "Salvando..." : "Salvar preço"}
          </Button>
        </div>
      </div>

      {showListingTypes && (
        <div className="space-y-4 pt-6 border-t">
          <Label className="text-lg font-medium">Tipo de publicação</Label>
          <p className="text-sm text-gray-500">Disponível apenas no Mercado Livre.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(listingTypes || []).map((t: any) => {
              const id = String((t as any)?.id || t);
              const name = String((t as any)?.name || id);
              const opt = (listingPriceOptions || []).find(
                (o: any) => String(o?.listing_type_id || o?.id || "") === id,
              );
              const selected = String(listingTypeId || "") === id;
              const optDetails =
                (opt as any)?.sale_fee_details || (opt as any)?.sale_fee?.details || {};
              const optPct =
                typeof (optDetails as any)?.percentage_fee === "number"
                  ? (optDetails as any).percentage_fee
                  : typeof (optDetails as any)?.meli_percentage_fee === "number"
                    ? (optDetails as any).meli_percentage_fee
                    : undefined;
              const optGross =
                typeof (optDetails as any)?.gross_amount === "number"
                  ? (optDetails as any).gross_amount
                  : 0;
              const fmt = new Intl.NumberFormat("pt-BR", {
                style: "currency",
                currency: "BRL",
              });
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
                    <div className="text-2xl font-bold text-novura-primary">{name}</div>
                    {selected ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-novura-primary text-white">
                        Selecionado
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-4">
                    <div className="text-sm font-semibold text-novura-primary">Tarifa de venda</div>
                    <div className="mt-1 text-sm text-gray-900">
                      Comissão{" "}
                      {typeof optPct === "number" && optPct > 0 ? `${optPct.toFixed(2)}%` : "-"}
                    </div>
                    <div className="text-sm text-gray-900">
                      Valor a ser pago {fmt.format(Number(optGross || 0))}
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
              {savingKey === "listing_type" ? "Salvando..." : "Salvar tipo de publicação"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
