import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { ImageUpload } from "@/components/products/create/ImageUpload";
import { VideoUpload } from "@/components/products/create/VideoUpload";
import { StringSuggestInput } from "@/components/listings/StringSuggestInput";
import { Plus, Search, Trash2 } from "lucide-react";
import type { EditListingStepVariationsMediaProps, VariationLite } from "./editListing.types";

/**
 * Variations, photos and video step for EditListingML. Renders variation list,
 * image upload, video upload and summary accordions. All state and actions via props.
 */
export function EditListingStepVariationsMedia({
  variations,
  allowVariationAttrs,
  pictures,
  videoFile,
  videoId,
  primaryVariationIndex,
  price,
  savingKey,
  getVariationPreviewUrl,
  onAddVariation,
  onRemoveVariation,
  onUpdateVariation,
  onSetPrimaryVariation,
  onUpdateVariationPictures,
  onUpdatePictures,
  onConfirmVariations,
  onConfirmPictures,
  onVideoChange,
  onConfirmVideo,
}: EditListingStepVariationsMediaProps) {
  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <Label className="text-lg font-medium">Variações e Mídia</Label>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onAddVariation}
          >
            <Plus className="w-4 h-4 mr-2" /> Adicionar Variação
          </Button>
        </div>
      </div>

      {variations.length === 0 ? (
        <div className="p-8 border border-dashed rounded-lg text-center">
          <div className="text-gray-500 mb-4">Este produto não possui variações configuradas.</div>
          <div className="text-sm text-gray-400 mb-6">
            Adicione variações se o produto tiver cores, tamanhos ou outros modelos diferentes.
          </div>
          <div className="space-y-4 text-left">
            <div className="flex justify-between items-center">
              <Label className="text-lg font-medium">Imagens do Produto (Geral)</Label>
              <Button size="sm" onClick={onConfirmPictures} disabled={savingKey === "pictures"}>
                {savingKey === "pictures" ? "Salvando..." : "Salvar Imagens"}
              </Button>
            </div>
            <ImageUpload
              selectedImages={pictures}
              onImagesChange={(imgs) => onUpdatePictures(imgs as (string | File)[])}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Accordion type="single" collapsible className="w-full">
            {variations.map((v, idx) => {
              const title = v.attribute_combinations?.map((a: any) => a.value_name).join(" / ") ||
                v.attributes?.map((a: any) => a.value_name).filter(Boolean).join(" / ") ||
                `Variação ${idx + 1}`;
              return (
                <AccordionItem key={v.id} value={String(v.id)}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-4 w-full">
                      <div className="w-10 h-10 bg-gray-100 rounded overflow-hidden flex-shrink-0">
                        {(() => {
                          const preview = getVariationPreviewUrl(v);
                          if (!preview) {
                            return (
                              <div className="w-full h-full flex items-center justify-center text-gray-300">
                                <Search className="w-4 h-4" />
                              </div>
                            );
                          }
                          return (
                            <img
                              src={preview}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          );
                        })()}
                      </div>
                      <div className="flex-1 text-left">
                        <div className="font-medium">{title}</div>
                        <div className="text-xs text-gray-500">
                          SKU: {v.sku || "N/A"} • Estoque: {v.available_quantity}
                        </div>
                      </div>
                      {primaryVariationIndex === idx && (
                        <Badge className="mr-4 bg-novura-primary">Principal</Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50 mr-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveVariation(idx);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="p-4 border-t bg-gray-50/50">
                    <div className="grid gap-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>SKU</Label>
                          <Input
                            value={v.sku || ""}
                            onChange={(e) => onUpdateVariation(idx, { sku: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Estoque</Label>
                          <Input
                            type="number"
                            value={v.available_quantity}
                            onChange={(e) =>
                              onUpdateVariation(idx, { available_quantity: Number(e.target.value) })
                            }
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="mb-2 block">Atributos da Variação</Label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {allowVariationAttrs.map((meta) => {
                            const existing =
                              v.attribute_combinations?.find((a: any) => a.id === meta.id) ||
                              v.attributes?.find((a: any) => a.id === meta.id);
                            const suggestions = (meta.values || []).map((val: any) => ({
                              id: val.id,
                              name: val.name,
                            }));
                            return (
                              <div key={meta.id}>
                                <Label className="text-xs text-gray-500">{meta.name}</Label>
                                <StringSuggestInput
                                  id={meta.id}
                                  name={meta.name}
                                  current={existing || { value_name: "" }}
                                  suggestions={suggestions}
                                  onChange={(obj) => {
                                    const currAttrs = v.attributes || v.attribute_combinations || [];
                                    const otherAttrs = (currAttrs as any[]).filter(
                                      (a: any) => a.id !== meta.id
                                    );
                                    onUpdateVariation(idx, {
                                      attributes: [...otherAttrs, obj],
                                      attribute_combinations: [...otherAttrs, obj],
                                    });
                                  }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="mt-4">
                        <ImageUpload
                          selectedImages={Array.isArray(v?.pictureFiles) ? v.pictureFiles : []}
                          onImagesChange={(files) => onUpdateVariationPictures(idx, files as (File | string)[])}
                        />
                      </div>
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-novura-primary"
                          onClick={() => onSetPrimaryVariation(idx)}
                          disabled={primaryVariationIndex === idx}
                        >
                          {primaryVariationIndex === idx ? "Já é a principal" : "Definir como principal"}
                        </Button>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={onConfirmVariations} disabled={savingKey === "variations"}>
          {savingKey === "variations" ? "Salvando..." : "Salvar Variações"}
        </Button>
      </div>

      <div className="space-y-4 pt-6 border-t">
        <div className="flex justify-between items-center">
          <Label className="text-lg font-medium">Vídeo</Label>
          <Button size="sm" onClick={onConfirmVideo} disabled={savingKey === "video_id"}>
            {savingKey === "video_id" ? "Salvando..." : "Salvar Vídeo"}
          </Button>
        </div>
        <VideoUpload
          video={videoFile || videoId}
          onVideoChange={(val) => {
            if (val instanceof File) {
              onVideoChange(val);
            } else {
              onVideoChange(val as string || null);
            }
          }}
        />
      </div>

      <div className="pt-6 border-t">
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="variacoes">
            <AccordionTrigger>Variações</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2">
                {variations.length === 0 ? (
                  <div className="text-sm text-gray-600">Sem variações</div>
                ) : (
                  variations.map((v: VariationLite, idx: number) => (
                    <div key={idx} className="flex items-center justify-between border rounded-lg p-3">
                      <div>
                        <div className="font-medium text-gray-900">
                          {v.attribute_combinations?.map((a: any) => a.value_name).join(" / ") ||
                            v.attributes?.map((a: any) => a.value_name).filter(Boolean).join(" / ") ||
                            `Variação ${idx + 1}`}
                        </div>
                        <div className="text-xs text-gray-500">SKU: {v.sku || "-"}</div>
                      </div>
                      <div className="flex -space-x-2">
                        {(Array.isArray(v?.pictureFiles) ? v.pictureFiles : [])
                          .slice(0, 4)
                          .map((f: any, i: number) => (
                            <img
                              key={i}
                              src={
                                typeof f === "string"
                                  ? f
                                  : (f?.preview || (f as any)?.url || "/placeholder.svg")
                              }
                              className="w-8 h-8 rounded object-cover border"
                              alt=""
                            />
                          ))}
                      </div>
                    </div>
                  ))
                )}
                <div className="mt-3">
                  <Button
                    size="sm"
                    onClick={onConfirmVariations}
                    disabled={savingKey === "variations"}
                  >
                    {savingKey === "variations" ? "Salvando..." : "Salvar Variações"}
                  </Button>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="fotos">
            <AccordionTrigger>Fotos</AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-wrap gap-2">
                {pictures.length === 0 ? (
                  <div className="text-sm text-gray-600">Sem fotos</div>
                ) : (
                  pictures.map((src: any, i: number) => (
                    <img
                      key={i}
                      src={typeof src === "string" ? src : (src?.url || src?.secure_url || "")}
                      className="w-16 h-16 rounded object-cover border"
                      alt=""
                    />
                  ))
                )}
              </div>
              <div className="mt-3">
                <Button
                  size="sm"
                  onClick={onConfirmPictures}
                  disabled={savingKey === "pictures"}
                >
                  {savingKey === "pictures" ? "Salvando..." : "Salvar Imagens"}
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}
