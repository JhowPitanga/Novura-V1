import { MultiValuedBadgeInput } from "@/components/listings/MultiValuedBadgeInput";
import { RequiredLabel } from "@/components/listings/RequiredLabel";
import { StringSuggestInput } from "@/components/listings/StringSuggestInput";
import { ImageUpload } from "@/components/products/create/ImageUpload";
import { VideoUpload } from "@/components/products/create/VideoUpload";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface StepAttributesProps {
  isShopeeMode: boolean;
  pictures: string[];
  setPictures: (v: string[]) => void;
  fashionImage34: boolean;
  setFashionImage34: (v: boolean) => void;
  filteredAttrs: { required: any[]; tech: any[] };
  attributes: any[];
  setAttributes: (v: any[]) => void;
  description: string;
  setDescription: (v: string) => void;
  loadingAttrs: boolean;
  video: File | string | null;
  setVideo: (v: File | string | null) => void;
}

export function StepAttributes({
  isShopeeMode,
  pictures,
  setPictures,
  fashionImage34,
  setFashionImage34,
  filteredAttrs,
  attributes,
  setAttributes,
  description,
  setDescription,
  loadingAttrs,
  video,
  setVideo,
}: StepAttributesProps) {
  return (
    <div className="space-y-6">
      <div className="border-2 border-novura-primary/30 rounded-xl p-4 bg-purple-50/40">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-700">Imagens do Produto</div>
            <div className="text-xs text-gray-600 mt-0.5">* Imagem 1:1</div>
          </div>
          <div className="text-xs text-gray-600">
            {isShopeeMode ? `${Math.min((pictures || []).length, 9)}/${9}` : `${Math.min((pictures || []).length, 8)}/${8}`}
          </div>
        </div>
        <div className="mt-3">
          <ImageUpload
            selectedImages={(pictures as any)}
            onImagesChange={(imgs) => setPictures(imgs as any)}
            maxImages={isShopeeMode ? 9 : 8}
            allowedMimeTypes={["image/jpeg", "image/png"]}
            label=""
            showCoverBadge
            addLabel={`Adicionar Imagem (${isShopeeMode ? `${Math.min((pictures || []).length, 9)}/${9}` : `${Math.min((pictures || []).length, 8)}/${8}`})`}
            variant="purple"
          />
        </div>
        <div className="mt-3 p-3 rounded-lg bg-white border border-gray-200">
          <label className="flex items-center gap-2">
            <Checkbox checked={fashionImage34} onCheckedChange={(val) => setFashionImage34(!!val)} />
            <span className="text-sm text-gray-700">Imagem 3:4</span>
          </label>
          <div className="text-xs text-gray-600 mt-1">
            Impressione os compradores adicionando imagens 3:4 para produtos de moda. <a href="#" className="text-novura-primary">Veja mais</a>
          </div>
        </div>
      </div>
      {!isShopeeMode && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredAttrs.required.map((a: any) => {
            const id = String(a?.id || "");
            const name = String(a?.name || id || "Atributo");
            const hasValues = Array.isArray(a?.values) && a.values.length > 0;
            const current = (attributes || []).find((x: any) => String(x?.id) === id);
            const tags = (a?.tags || {}) as any;
            const isRequired = Array.isArray(tags) ? tags.includes("required") : !!(tags?.required);
            const isNA = String((current as any)?.value_id || "") === "-1" && ((current as any)?.value_name ?? null) === null;
            const canNA = !isRequired && String(id).toUpperCase() !== "SELLER_SKU";
            const isString = String(a?.value_type || "").toLowerCase() === "string";
            const isMulti = Array.isArray(tags) ? (tags.includes("multivalued") || tags.includes("repeated")) : (!!(tags?.multivalued) || !!(tags?.repeated));
            if (String(a?.value_type || "").toLowerCase() === "number_unit") {
              const allowed = Array.isArray(a?.allowed_units) ? a.allowed_units : [];
              const defUnit = String((a as any)?.default_unit || "");
              const currNum = typeof (current as any)?.value_struct?.number === "number" ? String((current as any).value_struct.number) : (String((current as any)?.value_name || "").split(" ")[0] || "");
              const currUnit = typeof (current as any)?.value_struct?.unit === "string" ? String((current as any).value_struct.unit) : (String((current as any)?.value_name || "").split(" ")[1] || defUnit);
              return (
                <div key={id}>
                  <RequiredLabel text={name} required={isRequired} />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    <Input value={String(currNum || "")} placeholder={name} onChange={(e) => {
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
                      <SelectTrigger><SelectValue placeholder="Unidade" /></SelectTrigger>
                      <SelectContent>
                        {(allowed || []).map((u: any, idx: number) => {
                          const uid = String((u as any)?.id || u || idx);
                          const uname = String((u as any)?.name || (u as any)?.id || u || uid);
                          return <SelectItem key={uid} value={uid}>{uname}</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            }
            if (isString) {
              const suggestions = (Array.isArray(a?.values) ? a.values : []).map((v: any) => ({ id: String(v?.id || ""), name: String(v?.name || v?.value || v?.id || "") }));
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
                    const vname = a.values.find((v: any) => String(v?.id || "") === String(val))?.name || "";
                    const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                    setAttributes([...next, { id, name, value_id: val, value_name: vname }]);
                  }}>
                    <SelectTrigger className="mt-2"><SelectValue placeholder={name} /></SelectTrigger>
                    <SelectContent>
                      {a.values.map((v: any) => (
                        <SelectItem key={String(v?.id || v?.name || Math.random())} value={String(v?.id || "")}>{String(v?.name || v?.value || v?.id || "")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
          })}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:col-span-1">
          <div className="border-2 border-novura-primary/30 rounded-xl p-4 bg-purple-50/40">
            <div className="text-sm font-semibold text-gray-700 mb-3">Vídeo do Produto</div>
            <VideoUpload
              video={video}
              onVideoChange={setVideo}
              maxSizeMB={30}
              maxResolution={{ width: 1280, height: 1280 }}
              minDurationSec={10}
              maxDurationSec={60}
              accept="video/mp4"
              variant="purple"
            />
          </div>
        </div>
        <div className="md:col-span-1">
          <div className="border rounded-xl p-4 bg-white">
            <ul className="text-sm text-gray-700 space-y-2">
              <li className="flex items-start"><span className="mt-1 mr-2 inline-block w-2 h-2 rounded-full bg-novura-primary"></span> Tamanho: máximo de 30MB, a resolução não pode exceder 1280x1280px</li>
              <li className="flex items-start"><span className="mt-1 mr-2 inline-block w-2 h-2 rounded-full bg-novura-primary"></span> Duração: 10s–60s</li>
              <li className="flex items-start"><span className="mt-1 mr-2 inline-block w-2 h-2 rounded-full bg-novura-primary"></span> Formato: MP4</li>
              <li className="flex items-start"><span className="mt-1 mr-2 inline-block w-2 h-2 rounded-full bg-novura-primary"></span> Nota: o produto pode ser publicado enquanto o vídeo está sendo processado. O vídeo será exibido na lista automaticamente após ser processado com sucesso.</li>
            </ul>
          </div>
        </div>
      </div>
      <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição em texto plano" className="min-h-[160px]" />
    </div>
  );
}
