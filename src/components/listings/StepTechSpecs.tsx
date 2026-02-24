import { MultiValuedBadgeInput } from "@/components/listings/MultiValuedBadgeInput";
import { RequiredLabel } from "@/components/listings/RequiredLabel";
import { StringSuggestInput } from "@/components/listings/StringSuggestInput";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChevronDown } from "lucide-react";

interface StepTechSpecsProps {
  isShopeeMode: boolean;
  filteredAttrs: { required: any[]; tech: any[] };
  attributes: any[];
  setAttributes: (v: any[]) => void;
  techSpecsInput: any;
  techSpecsOutput: any;
  setTechSpecsOutput: (v: any) => void;
  attrTab: "required" | "tech";
  setAttrTab: (v: "required" | "tech") => void;
  showAllTechAttrs: boolean;
  setShowAllTechAttrs: (v: boolean) => void;
  loadingAttrs: boolean;
  shopeeBrandList: any[];
}

export function StepTechSpecs({
  isShopeeMode,
  filteredAttrs,
  attributes,
  setAttributes,
  techSpecsInput,
  techSpecsOutput,
  setTechSpecsOutput,
  attrTab,
  setAttrTab,
  showAllTechAttrs,
  setShowAllTechAttrs,
  loadingAttrs,
  shopeeBrandList,
}: StepTechSpecsProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(() => {
          const base = (isShopeeMode ? ([...filteredAttrs.required, ...filteredAttrs.tech]) : (showAllTechAttrs ? filteredAttrs.tech : filteredAttrs.tech.slice(0, 6)));
          const others = base.filter((a: any) => {
            const hasValues = Array.isArray(a?.values) && a.values.length > 0;
            const isBoolean = String(a?.value_type || "").toLowerCase() === "boolean" || (hasValues && a.values.some((v: any) => /^(yes|no|sim|não|nao)$/i.test(String((v as any)?.id || (v as any)?.name || ""))));
            return !isBoolean;
          });
          return others.map((a: any) => {
            const id = String(a?.id || "");
            const idUp = id.toUpperCase();
            const name = String(a?.name || id || "Atributo");
            const hasValues = Array.isArray(a?.values) && a.values.length > 0;
            const current = (attributes || []).find((x: any) => String(x?.id) === id);
            const tags = (a?.tags || {}) as any;
            const isRequired = Array.isArray(tags) ? tags.includes("required") : !!(tags?.required);
            const isNA = String((current as any)?.value_id || "") === "-1" && ((current as any)?.value_name ?? null) === null;
            const canNA = !isRequired;
            const isString = String(a?.value_type || "").toLowerCase() === "string";
            const isMulti = Array.isArray(tags) ? (tags.includes("multivalued") || tags.includes("repeated")) : (!!(tags?.multivalued) || !!(tags?.repeated));
            const isBoolean = String(a?.value_type || "").toLowerCase() === "boolean" || (hasValues && a.values.some((v: any) => /^(yes|no|sim|não|nao)$/i.test(String((v as any)?.id || (v as any)?.name || ""))));
            if (isBoolean) {
              const yesVal = hasValues ? ((a.values || []).find((v: any) => /^(yes|sim)$/i.test(String((v as any)?.id || (v as any)?.name || "")))) : null;
              const noVal = hasValues ? ((a.values || []).find((v: any) => /^(no|não|nao)$/i.test(String((v as any)?.id || (v as any)?.name || "")))) : null;
              const currentValue = (() => {
                const vid = String((current as any)?.value_id || "").toLowerCase();
                const vname = String((current as any)?.value_name || "").toLowerCase();
                if (vid) return /^(yes|sim)$/i.test(vid) ? "yes" : (/^(no|não|nao)$/i.test(vid) ? "no" : "");
                if (vname) return /^(yes|sim)$/i.test(vname) ? "yes" : (/^(no|não|nao)$/i.test(vname) ? "no" : "");
                return "";
              })();
              return (
                <div key={id}>
                  <RequiredLabel text={name} required={isRequired} />
                  <div className="mt-2">
                    <ToggleGroup type="single" value={currentValue} onValueChange={(val) => {
                      if (!val) return;
                      const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                      if (val === "yes") {
                        if (yesVal) setAttributes([...next, { id, name, value_id: String((yesVal as any)?.id || "yes"), value_name: String((yesVal as any)?.name || "Sim") }]);
                        else setAttributes([...next, { id, name, value_name: "Sim" }]);
                      } else if (val === "no") {
                        if (noVal) setAttributes([...next, { id, name, value_id: String((noVal as any)?.id || "no"), value_name: String((noVal as any)?.name || "Não") }]);
                        else setAttributes([...next, { id, name, value_name: "Não" }]);
                      }
                    }}>
                      <ToggleGroupItem value="yes" className="rounded-l-md border border-gray-300 data-[state=on]:bg-novura-primary data-[state=on]:text-white">Sim</ToggleGroupItem>
                      <ToggleGroupItem value="no" className="rounded-r-md border border-gray-300 data-[state=on]:bg-novura-primary data-[state=on]:text-white">Não</ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                </div>
              );
            }
            if (String(a?.value_type || "").toLowerCase() === "number_unit") {
              const allowed = Array.isArray(a?.allowed_units) ? a.allowed_units : [];
              const defUnit = String((a as any)?.default_unit || "");
              const currNum = typeof (current as any)?.value_struct?.number === "number" ? String((current as any).value_struct.number) : (String((current as any)?.value_name || "").split(" ")[0] || "");
              const currUnit = typeof (current as any)?.value_struct?.unit === "string" ? String((current as any).value_struct.unit) : (String((current as any)?.value_name || "").split(" ")[1] || defUnit);
              return (
                <div key={id}>
                  <RequiredLabel text={name} required={isRequired} />
                  <div className="relative mt-2">
                    <Input value={String(currNum || "")} placeholder={name} className="pr-24" disabled={isNA} onChange={(e) => {
                      const num = Number(e.target.value) || 0;
                      const unit = currUnit || defUnit || (allowed[0]?.id || allowed[0] || "");
                      const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                      const vname = unit ? `${num} ${unit}` : String(num);
                      setAttributes([...next, { id, name, value_name: vname, value_struct: { number: num, unit } }]);
                    }} />
                    <Select value={String(currUnit || defUnit || "")} onValueChange={(val) => {
                      const unit = String(val || defUnit || "");
                      const numStr = typeof (current as any)?.value_struct?.number === "number" ? String((current as any).value_struct.number) : (String((current as any)?.value_name || "").split(" ")[0] || "0");
                      const num = Number(numStr) || 0;
                      const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                      const vname = unit ? `${num} ${unit}` : String(num);
                      setAttributes([...next, { id, name, value_name: vname, value_struct: { number: num, unit } }]);
                    }}>
                      <SelectTrigger className={`absolute right-2 top-1/2 -translate-y-1/2 h-8 w-20 border-none bg-transparent shadow-none text-novura-primary hover:text-novura-primary/80 focus-visible:ring-0 ${isNA ? "pointer-events-none opacity-50" : ""}`}><SelectValue placeholder="Un" /></SelectTrigger>
                      <SelectContent>
                        {(allowed || []).map((u: any, idx: number) => {
                          const uid = String((u as any)?.id || u || idx);
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
                          const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                          const naAttr = checked ? { id, name, value_id: "-1", value_name: null } : undefined;
                          setAttributes(naAttr ? [...next, naAttr] : next);
                        }}
                      />
                      <span className="text-xs text-gray-600">Não se aplica</span>
                    </div>
                  )}
                </div>
              );
            }
            if (isString) {
              const baseSug = (Array.isArray(a?.values) ? a.values : []).map((v: any) => ({ id: String(v?.id || ""), name: String(v?.name || v?.value || v?.id || "") }));
              const extraBrand = (idUp === "BRAND" ? (Array.isArray(shopeeBrandList) ? shopeeBrandList : []) : []);
              const seen = new Set<string>();
              const suggestions = [...baseSug, ...extraBrand].filter((s) => {
                const key = `${String(s.id)}|${String(s.name).toLowerCase()}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
              });
              return (
                <div key={id}>
                  <RequiredLabel text={name} required={isRequired} />
                  {isMulti ? (
                    <MultiValuedBadgeInput
                      id={id}
                      name={name}
                      current={current}
                      suggestions={suggestions}
                      disabled={isNA}
                      onChange={(obj) => {
                        const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                        setAttributes([...next, obj]);
                      }}
                    />
                  ) : (
                    <StringSuggestInput
                      id={id}
                      name={name}
                      current={current}
                      suggestions={suggestions}
                      disabled={isNA}
                      onChange={(obj) => {
                        const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                        setAttributes([...next, obj]);
                      }}
                    />
                  )}
                  {canNA && (
                    <div className="mt-1 flex items-center gap-2">
                      <Checkbox
                        className="h-[16px] w-[16px]"
                        checked={isNA}
                        onCheckedChange={(checked) => {
                          const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                          const naAttr = checked ? { id, name, value_id: "-1", value_name: null } : undefined;
                          setAttributes(naAttr ? [...next, naAttr] : next);
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
                  <RequiredLabel text={name} required={isRequired} />
                  <Select value={String(current?.value_id || "")} onValueChange={(val) => {
                    if (isNA) return;
                    const vname = a.values.find((v: any) => String(v?.id || "") === String(val))?.name || "";
                    const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                    setAttributes([...next, { id, name, value_id: val, value_name: vname }]);
                  }}>
                    <SelectTrigger className={`mt-2 ${isNA ? "pointer-events-none opacity-50" : ""}`}><SelectValue placeholder={name} /></SelectTrigger>
                    <SelectContent>
                      {a.values.map((v: any) => (
                        <SelectItem key={String(v?.id || v?.name || Math.random())} value={String(v?.id || "")}>{String(v?.name || v?.value || v?.id || "")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {canNA && (
                    <div className="mt-1 flex items-center gap-2">
                      <Checkbox
                        className="h-[16px] w-[16px]"
                        checked={isNA}
                        onCheckedChange={(checked) => {
                          const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                          const naAttr = checked ? { id, name, value_id: "-1", value_name: null } : undefined;
                          setAttributes(naAttr ? [...next, naAttr] : next);
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
                <RequiredLabel text={name} required={isRequired} />
                <StringSuggestInput
                  id={id}
                  name={name}
                  current={current}
                  suggestions={[]}
                  disabled={isNA}
                  onChange={(obj) => {
                    const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                    setAttributes([...next, obj]);
                  }}
                />
                {canNA && (
                  <div className="mt-1 flex items-center gap-2">
                    <Checkbox
                      className="h-[16px] w-[16px]"
                      checked={isNA}
                      onCheckedChange={(checked) => {
                        const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                        const naAttr = checked ? { id, name, value_id: "-1", value_name: null } : undefined;
                        setAttributes(naAttr ? [...next, naAttr] : next);
                      }}
                    />
                    <span className="text-xs text-gray-600">Não se aplica</span>
                  </div>
                )}
              </div>
            );
          });
        })()}
      </div>
      {(() => {
        const booleans = (isShopeeMode ? filteredAttrs.tech : (showAllTechAttrs ? filteredAttrs.tech : filteredAttrs.tech.slice(0, 6))).filter((a: any) => {
          const hasValues = Array.isArray(a?.values) && a.values.length > 0;
          return String(a?.value_type || "").toLowerCase() === "boolean" || (hasValues && a.values.some((v: any) => /^(yes|no|sim|não|nao)$/i.test(String((v as any)?.id || (v as any)?.name || ""))));
        });
        if (!booleans.length) return null;
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {booleans.map((a: any) => {
              const id = String(a?.id || "");
              const name = String(a?.name || id || "Atributo");
              const hasValues = Array.isArray(a?.values) && a.values.length > 0;
              const current = (attributes || []).find((x: any) => String(x?.id) === id);
              const yesVal = hasValues ? ((a.values || []).find((v: any) => /^(yes|sim)$/i.test(String((v as any)?.id || (v as any)?.name || "")))) : null;
              const noVal = hasValues ? ((a.values || []).find((v: any) => /^(no|não|nao)$/i.test(String((v as any)?.id || (v as any)?.name || "")))) : null;
              const currentValue = (() => {
                const vid = String((current as any)?.value_id || "").toLowerCase();
                const vname = String((current as any)?.value_name || "").toLowerCase();
                if (vid) return /^(yes|sim)$/i.test(vid) ? "yes" : (/^(no|não|nao)$/i.test(vid) ? "no" : "");
                if (vname) return /^(yes|sim)$/i.test(vname) ? "yes" : (/^(no|não|nao)$/i.test(vname) ? "no" : "");
                return "";
              })();
              const tagsBool = (a?.tags || {}) as any;
              const isRequiredBool = Array.isArray(tagsBool) ? tagsBool.includes("required") : !!(tagsBool?.required);
              return (
                <div key={id}>
                  <RequiredLabel text={name} required={isRequiredBool} />
                  <div className="mt-2">
                    <ToggleGroup type="single" value={currentValue} onValueChange={(val) => {
                      if (!val) return;
                      const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                      if (val === "yes") {
                        if (yesVal) setAttributes([...next, { id, name, value_id: String((yesVal as any)?.id || "yes"), value_name: String((yesVal as any)?.name || "Sim") }]);
                        else setAttributes([...next, { id, name, value_name: "Sim" }]);
                      } else if (val === "no") {
                        if (noVal) setAttributes([...next, { id, name, value_id: String((noVal as any)?.id || "no"), value_name: String((noVal as any)?.name || "Não") }]);
                        else setAttributes([...next, { id, name, value_name: "Não" }]);
                      }
                    }} className="gap-0">
                      <ToggleGroupItem value="yes" className="rounded-l-md px-3 py-1 text-sm border border-gray-300 data-[state=on]:bg-novura-primary data-[state=on]:text-white">Sim</ToggleGroupItem>
                      <ToggleGroupItem value="no" className="rounded-r-md px-3 py-1 text-sm border border-gray-300 data-[state=on]:bg-novura-primary data-[state=on]:text-white">Não</ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                  {(() => {
                    const isNA2 = String((current as any)?.value_id || "") === "-1" && ((current as any)?.value_name ?? null) === null;
                    const canNA2 = !isRequiredBool;
                    if (!canNA2) return null;
                    return (
                      <div className="mt-1 flex items-center gap-2">
                        <Checkbox
                          className="h-[16px] w-[16px]"
                          checked={isNA2}
                          onCheckedChange={(checked) => {
                            const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                            const naAttr = checked ? { id, name, value_id: "-1", value_name: null } : undefined;
                            setAttributes(naAttr ? [...next, naAttr] : next);
                          }}
                        />
                        <span className="text-xs text-gray-600">Não se aplica</span>
                      </div>
                    );
                  })()}
                </div>
              );
            })}

          </div>
        );
      })()}
      {!isShopeeMode && (!showAllTechAttrs && filteredAttrs.tech.length > 6) && (
        <div className="flex justify-center">
          <Button variant="link" className="text-novura-primary p-0 h-auto" onClick={() => setShowAllTechAttrs(true)}>
            <ChevronDown className="w-4 h-4 mr-1" /> Preencher mais campos
          </Button>
        </div>
      )}
      {!isShopeeMode && ((showAllTechAttrs && filteredAttrs.tech.length > 6)) && (
        <div className="flex justify-center">
          <Button variant="link" className="text-novura-primary p-0 h-auto" onClick={() => setShowAllTechAttrs(false)}>
            Mostrar menos
          </Button>
        </div>
      )}

      {techSpecsOutput && (
        <div className="border rounded-lg p-4 bg-white">
          {Array.isArray((techSpecsOutput as any)?.sections) ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(techSpecsOutput as any).sections.map((s: any, i: number) => (
                <div key={i} className="space-y-1">
                  <div className="text-sm text-gray-700">{String(s?.title || "")}</div>
                  {Array.isArray(s?.rows) && s.rows.map((r: any, j: number) => (
                    <div key={j} className="text-sm text-gray-900">{String(r?.name || "")}: {String(r?.value || "")}</div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Array.isArray((techSpecsOutput as any)?.preview) && (techSpecsOutput as any).preview.map((r: any, j: number) => (
                <div key={j} className="text-sm text-gray-900">{String(r?.name || "")}: {String(r?.value || "")}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
