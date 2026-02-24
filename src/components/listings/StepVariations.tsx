import { StringSuggestInput } from "@/components/listings/StringSuggestInput";
import { ImageUpload } from "@/components/products/create/ImageUpload";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

interface StepVariationsProps {
  isShopeeMode: boolean;
  variations: any[];
  setVariations: (v: any[]) => void;
  variationsEnabled: boolean;
  setVariationsEnabled: (v: boolean) => void;
  primaryVariationIndex: number | null;
  setPrimaryVariationIndex: (v: number | null) => void;
  variationAttrs: any[];
  allowVariationAttrs: any[];
  variationRequiredIds: string[];
  attributes: any[];
  setAttributes: (v: any[]) => void;
  pictures: string[];
  shopeeBrandList: any[];
  availableQuantity: number;
  setAvailableQuantity: (v: number) => void;
}

export function StepVariations({
  isShopeeMode,
  variations,
  setVariations,
  variationsEnabled,
  setVariationsEnabled,
  primaryVariationIndex,
  setPrimaryVariationIndex,
  variationAttrs,
  allowVariationAttrs,
  variationRequiredIds,
  attributes,
  setAttributes,
  pictures,
  shopeeBrandList,
  availableQuantity,
  setAvailableQuantity,
}: StepVariationsProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-700">Variações</div>
        <Button
          variant="link"
          className="text-novura-primary p-0 h-auto"
          onClick={() => setVariationsEnabled(!variationsEnabled)}
        >
          {variationsEnabled ? "Desabilitar Variações" : "Adicionar Variações"}
        </Button>
      </div>
      {variationsEnabled && (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-700">Configure ao menos uma variação</div>
            <Button variant="link" className="text-novura-primary p-0 h-auto" onClick={() => {
              const next = [...(variations || []), { attribute_combinations: [], available_quantity: 0, pictureFiles: [], price: "" }];
              setVariations(next);
              if (primaryVariationIndex === null && next.length === 1) setPrimaryVariationIndex(0);
            }}>
              <Plus className="w-4 h-4 mr-1" /> Adicionar variação
            </Button>
          </div>
        </div>
      )}
      {variationsEnabled && (
        <Accordion type="multiple" className="mt-3">
          {(variations || []).map((v: any, idx: number) => (
            <AccordionItem key={idx} value={`var-${idx}`} className="border rounded-lg bg-white">
              <AccordionTrigger className="px-4 text-novura-primary">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    {(() => {
                      const combos = Array.isArray(v?.attribute_combinations) ? v.attribute_combinations : [];
                      const colorCombo = combos.find((c: any) => {
                        const cid = String(c?.id || "").toUpperCase();
                        const cname = String(c?.name || "");
                        return cid === "COLOR" || cid === "MAIN_COLOR" || /\bcor\b/i.test(cname);
                      });
                      const valName = String(colorCombo?.value_name || "");
                      if (valName) return <span>{valName}</span>;
                      return <span>Variação {idx + 1}</span>;
                    })()}
                    {primaryVariationIndex === idx && (
                      <span className="inline-flex items-center rounded-md bg-novura-primary text-white px-2 py-0.5 text-xs">Variação principal</span>
                    )}
                  </div>
                  <span
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer text-novura-primary hover:text-red-600 transition-colors mr-4"
                    title="Remover variação"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const buf = [...variations];
                      buf.splice(idx, 1);
                      setVariations(buf);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        const buf = [...variations];
                        buf.splice(idx, 1);
                        setVariations(buf);
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {variationAttrs.map((a: any) => {
                    const id = String(a?.id || "");
                    const name = String(a?.name || id || "Atributo");
                    const hasValues = Array.isArray(a?.values) && a.values.length > 0;
                    const currentCombo = (v?.attribute_combinations || []).find((c: any) => String(c?.id) === id);
                    if (hasValues && String(a?.value_type || "").toLowerCase() !== "string") {
                      return (
                        <Select key={id} value={String(currentCombo?.value_id || "")} onValueChange={(val) => {
                          const vname = a.values.find((vv: any) => String(vv?.id || "") === String(val))?.name || "";
                          const combos = (v?.attribute_combinations || []).filter((c: any) => String(c?.id) !== id);
                          const nextVar = { ...v, attribute_combinations: [...combos, { id, name, value_id: val, value_name: vname }] };
                          const buf = [...variations];
                          buf[idx] = nextVar;
                          setVariations(buf);
                        }}>
                          <SelectTrigger><SelectValue placeholder={name} /></SelectTrigger>
                          <SelectContent>
                            {a.values.map((vv: any) => (
                              <SelectItem key={String(vv?.id || vv?.name || Math.random())} value={String(vv?.id || "")}>{String(vv?.name || vv?.value || vv?.id || "")}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      );
                    }
                    return (
                      <div key={id}>
                        <Label>{name}</Label>
                        <StringSuggestInput
                          id={id}
                          name={name}
                          current={currentCombo}
                          suggestions={(Array.isArray(a?.values) ? a.values : []).map((vv: any) => ({ id: String(vv?.id || ""), name: String(vv?.name || vv?.value || vv?.id || "") }))}
                          disabled={false}
                          onChange={(obj) => {
                            const combos = (v?.attribute_combinations || []).filter((c: any) => String(c?.id) !== id);
                            const nextVar = { ...v, attribute_combinations: [...combos, obj] };
                            const buf = [...variations];
                            buf[idx] = nextVar;
                            setVariations(buf);
                          }}
                        />
                      </div>
                    );
                  })}
                  {allowVariationAttrs.map((a: any) => {
                    const id = String(a?.id || "");
                    const name = String(a?.name || id || "Atributo");
                    const hasValues = Array.isArray(a?.values) && a.values.length > 0;
                    const currentAttr = (v?.attributes || []).find((x: any) => String(x?.id) === id);
                    const tags = (a?.tags || {}) as any;
                    const isRequired = Array.isArray(tags) ? tags.includes("required") : !!(tags?.required);
                    const isNA = String((currentAttr as any)?.value_id || "") === "-1" && ((currentAttr as any)?.value_name ?? null) === null;
                    const canNA = !isRequired && String(id).toUpperCase() !== "SELLER_SKU";
                    if (String(id).toUpperCase() === "MAIN_COLOR") {
                      return (
                        <div key={id} className="flex items-center gap-2 md:col-span-2">
                          <Checkbox
                            checked={primaryVariationIndex === idx}
                            onCheckedChange={(checked) => {
                              setPrimaryVariationIndex(checked ? idx : null);
                            }}
                          />
                          <span className="text-sm">Definir como principal</span>
                        </div>
                      );
                    }
                    if (String(id).toUpperCase() === "GTIN") {
                      const isNAAttr = String((currentAttr as any)?.value_id || "") === "-1";
                      return (
                        <div key={id}>
                          <Label>{name}</Label>
                          {hasValues ? (
                            <Select value={String((currentAttr as any)?.value_id || "")} onValueChange={(val) => {
                              if (isNAAttr) return;
                              const vname = a.values.find((vv: any) => String(vv?.id || "") === String(val))?.name || "";
                              const attrs = (v?.attributes || []).filter((x: any) => String(x?.id) !== id);
                              const nextVar = { ...v, attributes: [...attrs, { id, name, value_id: val, value_name: vname }] };
                              const buf = [...variations]; buf[idx] = nextVar; setVariations(buf);
                            }}>
                              <SelectTrigger className={`mt-2 ${isNAAttr ? "pointer-events-none opacity-50" : ""}`}><SelectValue placeholder={name} /></SelectTrigger>
                              <SelectContent>
                                {a.values.map((vv: any) => (
                                  <SelectItem key={String(vv?.id || vv?.name || Math.random())} value={String(vv?.id || "")}>{String(vv?.name || vv?.value || vv?.id || "")}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input className="mt-2" placeholder={name} disabled={isNAAttr} value={String((currentAttr as any)?.value_name || "")} onChange={(e) => {
                              if (isNAAttr) return;
                              const attrs = (v?.attributes || []).filter((x: any) => String(x?.id) !== id);
                              const nextVar = { ...v, attributes: [...attrs, { id, name, value_name: e.target.value }] };
                              const buf = [...variations]; buf[idx] = nextVar; setVariations(buf);
                            }} />
                          )}
                          <div className="mt-1 flex items-center gap-2">
                            <Checkbox
                              className="h-[16px] w-[16px]"
                              checked={isNAAttr}
                              onCheckedChange={(checked) => {
                                const attrs = (v?.attributes || []).filter((x: any) => String(x?.id) !== id);
                                const nextAttr = checked ? { id, name, value_id: "-1", value_name: isRequired ? String((currentAttr as any)?.value_name || "") : null } : undefined;
                                const nextVar = { ...v, attributes: nextAttr ? [...attrs, nextAttr] : attrs };
                                const buf = [...variations]; buf[idx] = nextVar; setVariations(buf);
                              }}
                            />
                            <span className="text-xs text-gray-600">Não possui código de barras</span>
                          </div>
                          {(isRequired && isNAAttr) && (
                            <Input
                              className="mt-1"
                              placeholder="Motivo de GTIN vazio"
                              value={String((currentAttr as any)?.value_name || "")}
                              onChange={(e) => {
                                const attrs = (v?.attributes || []).filter((x: any) => String(x?.id) !== id);
                                const nextVar = { ...v, attributes: [...attrs, { id, name, value_id: "-1", value_name: e.target.value }] };
                                const buf = [...variations]; buf[idx] = nextVar; setVariations(buf);
                              }}
                            />
                          )}
                        </div>
                      );
                    }
                    if (String(a?.value_type || "").toLowerCase() === "number_unit") {
                      const allowed = Array.isArray(a?.allowed_units) ? a.allowed_units : [];
                      const defUnit = String((a as any)?.default_unit || "");
                      const currNum = typeof (currentAttr as any)?.value_struct?.number === "number" ? String((currentAttr as any).value_struct.number) : (String((currentAttr as any)?.value_name || "").split(" ")[0] || "");
                      const currUnit = typeof (currentAttr as any)?.value_struct?.unit === "string" ? String((currentAttr as any).value_struct.unit) : (String((currentAttr as any)?.value_name || "").split(" ")[1] || defUnit);
                      return (
                        <div key={id}>
                          <Label>{name}</Label>
                          <div className="relative mt-2">
                            <Input value={String(currNum || "")} placeholder={name} className="pr-24" disabled={isNA} onChange={(e) => {
                              const num = Number(e.target.value) || 0;
                              const unit = currUnit || defUnit || (allowed[0]?.id || allowed[0] || "");
                              const attrs = (v?.attributes || []).filter((x: any) => String(x?.id) !== id);
                              const vname = unit ? `${num} ${unit}` : String(num);
                              const nextVar = { ...v, attributes: [...attrs, { id, name, value_name: vname, value_struct: { number: num, unit } }] };
                              const buf = [...variations]; buf[idx] = nextVar; setVariations(buf);
                            }} />
                            <Select value={String(currUnit || defUnit || "")} onValueChange={(val) => {
                              const unit = String(val || defUnit || "");
                              const numStr = typeof (currentAttr as any)?.value_struct?.number === "number" ? String((currentAttr as any).value_struct.number) : (String((currentAttr as any)?.value_name || "").split(" ")[0] || "0");
                              const num = Number(numStr) || 0;
                              const attrs = (v?.attributes || []).filter((x: any) => String(x?.id) !== id);
                              const vname = unit ? `${num} ${unit}` : String(num);
                              const nextVar = { ...v, attributes: [...attrs, { id, name, value_name: vname, value_struct: { number: num, unit } }] };
                              const buf = [...variations]; buf[idx] = nextVar; setVariations(buf);
                            }}>
                              <SelectTrigger className={`absolute right-2 top-1/2 -translate-y-1/2 h-8 w-20 border-none bg-transparent shadow-none text-novura-primary hover:text-novura-primary/80 focus-visible:ring-0 ${isNA ? "pointer-events-none opacity-50" : ""}`}><SelectValue placeholder="Un" /></SelectTrigger>
                              <SelectContent>
                                {(allowed || []).map((u: any, i2: number) => {
                                  const uid = String((u as any)?.id || u || i2);
                                  const uname = String((u as any)?.name || (u as any)?.id || u || uid);
                                  return <SelectItem key={uid} value={uid}>{uname}</SelectItem>;
                                })}
                              </SelectContent>
                            </Select>
                          </div>
                          {canNA && (
                            <div className="mt-1 flex items-center gap-2">
                              <Checkbox
                                className="h-[16px] w-[16px]"
                                checked={isNA}
                                onCheckedChange={(checked) => {
                                  const attrs = (v?.attributes || []).filter((x: any) => String(x?.id) !== id);
                                  const nextAttr = checked ? { id, name, value_id: "-1", value_name: null } : undefined;
                                  const nextVar = { ...v, attributes: nextAttr ? [...attrs, nextAttr] : attrs };
                                  const buf = [...variations]; buf[idx] = nextVar; setVariations(buf);
                                }}
                              />
                              <span className="text-xs text-gray-600">Não se aplica</span>
                            </div>
                          )}
                        </div>
                      );
                    }
                    if (hasValues) {
                      return (
                        <div key={id}>
                          <Label>{name}</Label>
                          <Select value={String((currentAttr as any)?.value_id || "")} onValueChange={(val) => {
                            if (isNA) return;
                            const vname = a.values.find((vv: any) => String(vv?.id || "") === String(val))?.name || "";
                            const attrs = (v?.attributes || []).filter((x: any) => String(x?.id) !== id);
                            const nextVar = { ...v, attributes: [...attrs, { id, name, value_id: val, value_name: vname }] };
                            const buf = [...variations]; buf[idx] = nextVar; setVariations(buf);
                          }}>
                            <SelectTrigger className={`mt-2 ${isNA ? "pointer-events-none opacity-50" : ""}`}><SelectValue placeholder={name} /></SelectTrigger>
                            <SelectContent>
                              {a.values.map((vv: any) => (
                                <SelectItem key={String(vv?.id || vv?.name || Math.random())} value={String(vv?.id || "")}>{String(vv?.name || vv?.value || vv?.id || "")}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {canNA && (
                            <div className="mt-1 flex items-center gap-2">
                              <Checkbox
                                className="h-[16px] w-[16px]"
                                checked={isNA}
                                onCheckedChange={(checked) => {
                                  const attrs = (v?.attributes || []).filter((x: any) => String(x?.id) !== id);
                                  const nextAttr = checked ? { id, name, value_id: "-1", value_name: null } : undefined;
                                  const nextVar = { ...v, attributes: nextAttr ? [...attrs, nextAttr] : attrs };
                                  const buf = [...variations]; buf[idx] = nextVar; setVariations(buf);
                                }}
                              />
                              <span className="text-xs text-gray-600">Não se aplica</span>
                            </div>
                          )}
                        </div>
                      );
                    }
                    return (
                      <div key={id}>
                        <Label>{name}</Label>
                        <Input className="mt-2" placeholder={name} disabled={isNA} value={String((currentAttr as any)?.value_name || "")} onChange={(e) => {
                          const attrs = (v?.attributes || []).filter((x: any) => String(x?.id) !== id);
                          const nextVar = { ...v, attributes: [...attrs, { id, name, value_name: e.target.value }] };
                          const buf = [...variations]; buf[idx] = nextVar; setVariations(buf);
                        }} />
                        {canNA && (
                          <div className="mt-1 flex items-center gap-2">
                            <Checkbox
                              className="h-[16px] w-[16px]"
                              checked={isNA}
                              onCheckedChange={(checked) => {
                                const attrs = (v?.attributes || []).filter((x: any) => String(x?.id) !== id);
                                const nextAttr = checked ? { id, name, value_id: "-1", value_name: null } : undefined;
                                const nextVar = { ...v, attributes: nextAttr ? [...attrs, nextAttr] : attrs };
                                const buf = [...variations]; buf[idx] = nextVar; setVariations(buf);
                              }}
                            />
                            <span className="text-xs text-gray-600">Não se aplica</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div>
                    <Label>Preço</Label>
                    <div className="relative mt-2">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">R$</span>
                      <Input value={String(v?.price ?? "")} placeholder="Preço da variação" className="pl-10" onChange={(e) => {
                        const buf = [...variations];
                        buf[idx] = { ...v, price: e.target.value };
                        setVariations(buf);
                      }} />
                    </div>
                  </div>
                  <div>
                    <Label>Estoque</Label>
                    <Input value={String(v?.available_quantity ?? "")} placeholder="Estoque" onChange={(e) => {
                      const buf = [...variations];
                      buf[idx] = { ...v, available_quantity: Number(e.target.value) };
                      setVariations(buf);
                    }} />
                  </div>
                  <div className="md:col-span-2">
                    <ImageUpload
                      selectedImages={Array.isArray(v?.pictureFiles) ? v.pictureFiles : []}
                      onImagesChange={(files) => {
                        const buf = [...variations];
                        buf[idx] = { ...v, pictureFiles: files };
                        setVariations(buf);
                      }}
                    />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
