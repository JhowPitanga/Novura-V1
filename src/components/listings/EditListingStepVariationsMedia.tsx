import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { ImageUpload } from "@/components/products/create/ImageUpload";
import { VideoUpload } from "@/components/products/create/VideoUpload";
import { StringSuggestInput } from "@/components/listings/StringSuggestInput";
import { Plus, Search, Trash2 } from "lucide-react";
import type { EditListingStepVariationsMediaProps } from "./editListing.types";

function SectionHeader({
  title,
  saveLabel,
  savingKey,
  saveKey,
  onSave,
}: {
  title: string;
  saveLabel: string;
  savingKey: string | null;
  saveKey: string;
  onSave: () => void;
}) {
  return (
    <div className="flex justify-between items-center">
      <Label className="text-lg font-medium">{title}</Label>
      <Button size="sm" onClick={onSave} disabled={savingKey === saveKey}>
        {savingKey === saveKey ? "Salvando..." : saveLabel}
      </Button>
    </div>
  );
}

function VideoBlock({
  videoFile,
  videoId,
  savingKey,
  onVideoChange,
  onConfirmVideo,
}: {
  videoFile: File | null;
  videoId: string;
  savingKey: string | null;
  onVideoChange: (value: File | string | null) => void;
  onConfirmVideo: () => void;
}) {
  return (
    <div className="pt-4 border-t space-y-4">
      <SectionHeader
        title="V?deo"
        saveLabel="Salvar v?deo"
        savingKey={savingKey}
        saveKey="video_id"
        onSave={onConfirmVideo}
      />
      <VideoUpload
        video={videoFile || videoId}
        onVideoChange={(val) => {
          if (val instanceof File) onVideoChange(val);
          else onVideoChange((val as string) || null);
        }}
      />
    </div>
  );
}

/**
 * Variations and media: listing images/video on top when there are no variations;
 * when variations exist, only per-variation media plus a shared video section.
 */
export function EditListingStepVariationsMedia({
  variations,
  allowVariationAttrs,
  pictures,
  videoFile,
  videoId,
  primaryVariationIndex,
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
  supportsVideo = true,
}: EditListingStepVariationsMediaProps) {
  const hasVariations = variations.length > 0;
  const showListingMedia = !hasVariations;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <Label className="text-lg font-medium">Varia??es e m?dia</Label>
        <Button size="sm" variant="outline" onClick={onAddVariation}>
          <Plus className="w-4 h-4 mr-2" />
          Adicionar varia??o
        </Button>
      </div>

      {showListingMedia && (
        <section className="space-y-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <SectionHeader
            title="Imagens do an?ncio"
            saveLabel="Salvar imagens"
            savingKey={savingKey}
            saveKey="pictures"
            onSave={onConfirmPictures}
          />
          <ImageUpload
            selectedImages={pictures}
            onImagesChange={(imgs) => onUpdatePictures(imgs as (string | File)[])}
          />
          {supportsVideo && (
            <VideoBlock
              videoFile={videoFile}
              videoId={videoId}
              savingKey={savingKey}
              onVideoChange={onVideoChange}
              onConfirmVideo={onConfirmVideo}
            />
          )}
        </section>
      )}

      <section className="space-y-4">
        <h3 className="text-base font-semibold text-gray-900">Varia??es</h3>
        {!hasVariations ? (
          <div className="p-8 border border-dashed rounded-lg text-center text-sm text-gray-500">
            Este an?ncio n?o possui varia??es. Use o bot?o acima se o produto tiver cores,
            tamanhos ou outros modelos.
          </div>
        ) : (
          <>
            <Accordion type="single" collapsible className="w-full">
              {variations.map((v, idx) => {
                const title =
                  v.attribute_combinations?.map((a: any) => a.value_name).join(" / ") ||
                  v.attributes?.map((a: any) => a.value_name).filter(Boolean).join(" / ") ||
                  `Varia??o ${idx + 1}`;
                return (
                  <AccordionItem key={String(v.id)} value={String(v.id)}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-4 w-full pr-2">
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
                              <img src={preview} alt="" className="w-full h-full object-cover" />
                            );
                          })()}
                        </div>
                        <div className="flex-1 text-left">
                          <div className="font-medium">{title}</div>
                          <div className="text-xs text-gray-500">
                            SKU: {v.sku || "N/A"}
                            {" \u00b7 "}
                            Estoque: {v.available_quantity}
                          </div>
                        </div>
                        {primaryVariationIndex === idx && (
                          <Badge className="mr-2 bg-novura-primary">Principal</Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
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
                                onUpdateVariation(idx, {
                                  available_quantity: Number(e.target.value),
                                })
                              }
                            />
                          </div>
                        </div>
                        {allowVariationAttrs.length > 0 && (
                          <div>
                            <Label className="mb-2 block">Atributos da varia??o</Label>
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
                                        const currAttrs =
                                          v.attributes || v.attribute_combinations || [];
                                        const otherAttrs = (currAttrs as any[]).filter(
                                          (a: any) => a.id !== meta.id,
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
                        )}
                        <ImageUpload
                          selectedImages={
                            Array.isArray(v?.pictureFiles) ? v.pictureFiles : []
                          }
                          onImagesChange={(files) =>
                            onUpdateVariationPictures(idx, files as (File | string)[])
                          }
                        />
                        <div className="flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-novura-primary"
                            onClick={() => onSetPrimaryVariation(idx)}
                            disabled={primaryVariationIndex === idx}
                          >
                            {primaryVariationIndex === idx
                              ? "J? ? a principal"
                              : "Definir como principal"}
                          </Button>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
            <div className="flex justify-end">
              <Button size="sm" onClick={onConfirmVariations} disabled={savingKey === "variations"}>
                {savingKey === "variations" ? "Salvando..." : "Salvar varia��es"}
              </Button>
            </div>
          </>
        )}
      </section>

      {hasVariations && supportsVideo && (
        <section className="space-y-4 pt-6 border-t">
          <VideoBlock
            videoFile={videoFile}
            videoId={videoId}
            savingKey={savingKey}
            onVideoChange={onVideoChange}
            onConfirmVideo={onConfirmVideo}
          />
        </section>
      )}
    </div>
  );
}
