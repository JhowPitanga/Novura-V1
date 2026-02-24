import { RequiredLabel } from "@/components/listings/RequiredLabel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface StepPricingProps {
  price: string;
  setPrice: (v: string) => void;
  listingTypeId: string;
  setListingTypeId: (v: string) => void;
  listingTypes: any[];
  listingPriceOptions: any[];
  loadingListing: boolean;
  saleTermsMeta: any[];
  saleTerms: any[];
  setSaleTerms: (v: any[]) => void;
  currencyId: string;
}

export function StepPricing({
  price,
  setPrice,
  listingTypeId,
  setListingTypeId,
  listingTypes,
  listingPriceOptions,
  loadingListing,
  saleTermsMeta,
  saleTerms,
  setSaleTerms,
  currencyId,
}: StepPricingProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4">
        <div>
          <RequiredLabel text="Preço" required />
          <div className="relative mt-2">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">R$</span>
            <Input id="ml-price" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Preço" className="pl-10" />
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <div className="text-sm text-gray-700">Tipo de publicação</div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(([...((Array.isArray(listingTypes) ? listingTypes : []))] as any[]).sort((a: any, b: any) => {
          const aid = String(a?.id || a);
          const bid = String(b?.id || b);
          const arank = aid === "gold_special" ? 0 : 1;
          const brank = bid === "gold_special" ? 0 : 1;
          return arank - brank;
        })).map((t: any) => {
          const id = String(t?.id || t);
          const name = String(t?.name || t?.listing_type_name || id);
          const opt = (listingPriceOptions || []).find((p: any) => String(p?.listing_type_id || "") === id);
          const priceNum = (() => { const s = String(price || "").replace(/\./g, "").replace(/,/, "."); const n = Number(s); return isNaN(n) ? 0 : n; })();
          const currency = String(opt?.currency_id || currencyId || "BRL");
          const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency });
          const pct = typeof opt?.sale_fee_details?.percentage_fee === "number" ? opt.sale_fee_details.percentage_fee : (typeof opt?.sale_fee_details?.meli_percentage_fee === "number" ? opt.sale_fee_details.meli_percentage_fee : undefined);
          const commissionAmt = typeof pct === "number" && priceNum > 0 ? (priceNum * pct) / 100 : (typeof opt?.sale_fee_amount === "number" ? opt.sale_fee_amount : (typeof opt?.sale_fee_details?.gross_amount === "number" ? opt.sale_fee_details.gross_amount : 0));
          const exposure = String(opt?.listing_exposure || "").toLowerCase();
          const exposureLabel = exposure === "highest" ? "Exposição máxima" : (exposure === "high" ? "Exposição alta" : (exposure === "mid" ? "Exposição média" : (exposure === "low" ? "Exposição baixa" : "Exposição")));
          const requiresPic = !!opt?.requires_picture;
          const selected = String(listingTypeId || "") === id;
          return (
            <div key={id} className={`border-2 rounded-3xl p-5 bg-white cursor-pointer transition-all ${selected ? "border-novura-primary" : "border-gray-300 hover:border-novura-primary hover:bg-novura-light"} shadow-md`} onClick={() => setListingTypeId(id)}>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold text-novura-primary">{name}</div>
                {selected ? <span className="text-xs px-2 py-0.5 rounded-full bg-novura-primary text-white">Selecionado</span> : null}
              </div>
              <div className="mt-2 text-sm text-gray-700">
                <ul className="space-y-1">
                  {(id === "gold_special" ? [
                    "Indicado para Compra à Vista",
                    "Estoque com Alta Rotatividade",
                    "Maximização da Margem Bruta",
                    "Produtos Baratos",
                  ] : [
                    "Produtos Alto Ticket",
                    "Oferecer 12x Sem Juros",
                    "Itens Sazonais/Tendências",
                    "Maior Taxa de Conversão",
                  ]).map((tip: string, i: number) => (
                    <li key={i} className="flex items-start">
                      <span className="mt-1 mr-2 inline-block w-2 h-2 rounded-full bg-novura-primary"></span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-4">
                <div className="text-sm font-semibold text-novura-primary">Tarifa de venda</div>
                <div className="mt-1 text-sm text-gray-900">Comissão cobrada {typeof pct === "number" && pct > 0 ? `${pct.toFixed(2)}%` : "-"}</div>
                <div className="text-sm text-gray-900">Valor a ser pago {fmt.format(Number(commissionAmt || 0))}</div>
              </div>
              {!selected && (
                <div className="mt-4">
                  <Button variant="link" className="text-novura-primary p-0 h-auto" onClick={() => setListingTypeId(id)}>Selecionar {name}</Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {(() => {
        const wType = (saleTermsMeta || []).find((x: any) => String(x?.id || "").toUpperCase() === "WARRANTY_TYPE");
        const wTime = (saleTermsMeta || []).find((x: any) => String(x?.id || "").toUpperCase() === "WARRANTY_TIME");
        const currentType = (saleTerms || []).find((x: any) => String(x?.id || "") === "WARRANTY_TYPE");
        const currentTime = (saleTerms || []).find((x: any) => String(x?.id || "") === "WARRANTY_TIME");
        const currentTimeNumber = typeof (currentTime as any)?.value_struct?.number === "number" ? String((currentTime as any).value_struct.number) : (String((currentTime as any)?.value_name || "").split(" ")[0] || "");
        const currentTimeUnit = typeof (currentTime as any)?.value_struct?.unit === "string" ? String((currentTime as any).value_struct.unit) : (String((currentTime as any)?.value_name || "").split(" ")[1] || String((wTime as any)?.default_unit || ""));
        if (!wType && !wTime) return null;
        return (
          <div className="space-y-2">
            <div className="text-sm text-gray-700">Tipo de garantia</div>
            <div className="space-y-2">
              {(Array.isArray(wType?.values) ? wType.values : []).map((v: any) => {
                const vid = String(v?.id || "");
                const vname = String(v?.name || v?.value || v?.id || vid);
                const checked = String(currentType?.value_id || "") === vid;
                return (
                  <div key={vid} className="p-3 border border-gray-200 rounded-lg">
                    <label className="flex items-center gap-2">
                      <Checkbox checked={checked} onCheckedChange={(isC) => {
                        const nextBase = (saleTerms || []).filter((s: any) => String(s?.id || "") !== "WARRANTY_TYPE" && String(s?.id || "") !== "WARRANTY_TIME");
                        if (isC) {
                          const obj = { id: "WARRANTY_TYPE", value_id: vid, value_name: vname } as any;
                          setSaleTerms([...nextBase, obj]);
                        } else {
                          setSaleTerms(nextBase);
                        }
                      }} />
                      <span className="text-sm">{vname}</span>
                    </label>
                    {checked && wTime ? (
                      <div className="mt-3">
                        <div className="flex border border-gray-300 rounded-md overflow-hidden bg-white w-[340px]">
                          <Input className="flex-1 border-0 rounded-none focus-visible:ring-0" value={String(currentTimeNumber || "")} placeholder="Tempo" onChange={(e) => {
                            const num = e.target.value;
                            const unit = currentTimeUnit || String((wTime as any)?.default_unit || "");
                            const n = Number(num) || 0;
                            const name = unit ? `${n} ${unit}` : String(n);
                            const base = (saleTerms || []).filter((s: any) => String(s?.id || "") !== "WARRANTY_TIME");
                            setSaleTerms([...base, { id: "WARRANTY_TIME", value_name: name, value_struct: { number: n, unit } }]);
                          }} />
                          <Select value={String(currentTimeUnit || (wTime as any)?.default_unit || "")} onValueChange={(val) => {
                            const unit = String(val || (wTime as any)?.default_unit || "");
                            const prev = (saleTerms || []).find((s: any) => String(s?.id || "") === "WARRANTY_TIME");
                            const numStr = typeof (prev as any)?.value_struct?.number === "number" ? String((prev as any).value_struct.number) : (String((prev as any)?.value_name || "").split(" ")[0] || "");
                            const n = Number(numStr) || 0;
                            const name = unit ? `${n} ${unit}` : String(n);
                            const base = (saleTerms || []).filter((s: any) => String(s?.id || "") !== "WARRANTY_TIME");
                            setSaleTerms([...base, { id: "WARRANTY_TIME", value_name: name, value_struct: { number: n, unit } }]);
                          }}>
                            <SelectTrigger className="border-0 rounded-none text-novura-primary px-2 w-[120px]"><SelectValue placeholder="Unidade" /></SelectTrigger>
                            <SelectContent>
                              {(Array.isArray(wTime?.allowed_units) ? wTime.allowed_units : []).map((u: any) => (
                                <SelectItem key={String(u?.id || u?.name || Math.random())} value={String(u?.id || "")}>{String(u?.name || u?.id || "")}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
