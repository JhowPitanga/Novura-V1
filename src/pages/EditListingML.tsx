import { useEffect, useMemo, useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StepIndicator } from "@/components/products/create/StepIndicator";
import { useAuth } from "@/hooks/useAuth";
import { useEditListingInitialData } from "@/hooks/useEditListingInitialData";
import { useListingTypeState } from "@/hooks/useListingTypeState";
import { useShippingPreferences } from "@/hooks/useShippingPreferences";
import { useAttributesMetaOnStep } from "@/hooks/useAttributesMetaOnStep";
import { useCreateListingAttributes } from "@/hooks/useCreateListingAttributes";
import { useCreateListingCategories } from "@/hooks/useCreateListingCategories";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { X } from "lucide-react";
import { CategoryPickerDialog } from "@/components/listings/CategoryPickerDialog";
import { EditListingStepPrice } from "@/components/listings/EditListingStepPrice";
import { EditListingStepShippingWrapper } from "@/components/listings/EditListingStepShippingWrapper";
import { EditListingStepTitleDescription } from "@/components/listings/EditListingStepTitleDescription";
import { EditListingStepVariationsMedia } from "@/components/listings/EditListingStepVariationsMedia";
import { EditListingStepAttributes } from "@/components/listings/EditListingStepAttributes";
import type { VariationLite } from "@/components/listings/editListing.types";
import { parsePriceToNumber } from "@/utils/listingUtils";

export default function AnunciosEditarML() {
  const { organizationId } = useAuth();
  const { itemId } = useParams();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [currentStep, setCurrentStep] = useState(1);
  const [saving, setSaving] = useState<string | null>(null);

  // Category Selection States
  const [categoryId, setCategoryId] = useState<string>("");

  const {
    loading,
    itemRow,
    setItemRow,
    soldQty,
    title,
    setTitle,
    description,
    setDescription,
    price,
    setPrice,
    attributes,
    setAttributes,
    variations,
    setVariations,
    pictures,
    setPictures,
    shipping,
    setShipping,
    status,
    setStatus,
    videoId,
    setVideoId,
  } = useEditListingInitialData({
    organizationId,
    itemId,
    onError: (message) => toast({ title: "Falha ao carregar", description: message, variant: "destructive" }),
  });

  const [saleTerms, setSaleTerms] = useState<any[]>([]);
  const [saleTermsMeta, setSaleTermsMeta] = useState<any[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [showAllTechAttrs, setShowAllTechAttrs] = useState(false);
  const [primaryVariationIndex, setPrimaryVariationIndex] = useState<number | null>(null);

  const {
    listingTypes,
    listingTypeId,
    setListingTypeId,
    listingPriceOptions,
    loadingListing,
  } = useListingTypeState({
    itemRow,
    currentStep,
    price,
    organizationId,
  });

  const {
    availableLogisticTypes,
    selectedLogisticType,
    setSelectedLogisticType,
    preferFlex,
    setPreferFlex,
    canUseFlex,
  } = useShippingPreferences({ organizationId, itemRow, currentStep });

  const { attrsMeta, setAttrsMeta, loadingAttrs } = useAttributesMetaOnStep({ itemRow, currentStep });

  const [priceEditable, setPriceEditable] = useState(true);
  const { filteredAttrs, allowVariationAttrs } = useCreateListingAttributes({
    attrsMeta,
    conditionalRequiredIds: [],
    techSpecsInput: null,
  });

  const {
    categorySuggestions,
    domainSuggestions,
    hasSearchedCategory,
    runPredict,
    dumpOpen,
    setDumpOpen,
    dumpLoading,
    dumpQuery,
    setDumpQuery,
    dumpSelected,
    pendingCategoryId,
    pendingCategoryName,
    pathsByCategoryId,
    getColumnItems,
    handleSelectLevel,
    handleBreadcrumbClick,
    confirmPickerCategory,
    cancelPicker,
  } = useCreateListingCategories({
    organizationId,
    siteId: "MLB",
    isShopeeMode: false,
    categoryId,
    setCategoryId,
    title,
    currentStep,
  });

  const steps = [
    { id: 1, title: "Preço e condições", description: "Preço e tipo de publicação" },
    { id: 2, title: "Envio", description: "Logística e dimensões" },
    { id: 3, title: "Título e Descrição", description: "Conteúdo do anúncio" },
    { id: 4, title: "Variações, fotos e Vídeo", description: "Variações e mídia" },
    { id: 5, title: "Ficha técnica", description: "Atributos e características" },
  ];

  const canEditTitle = useMemo(() => (soldQty || 0) === 0, [soldQty]);

  // Effect 2: Sync categoryId from itemRow when item loads/updates
  useEffect(() => {
    const cat = String(itemRow?.category_id || "");
    if (cat) setCategoryId(cat);
  }, [itemRow?.category_id]);

  const confirmCategory = async (newCatId: string) => {
    await runWithSaving("category", async () => {
      await callUpdate({ category_id: newCatId });
      toast({ title: "Categoria atualizada" });
      setItemRow((prev: any) => ({ ...prev, category_id: newCatId }));
      setAttributes([]);
      setAttrsMeta([]);
    });
  };

  // Helpers
  const uploadFileToStorage = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
    const filePath = `${organizationId}/${fileName}`;
    
    const { error: uploadError } = await (supabase as any)
      .storage
      .from('marketplace_items')
      .upload(filePath, file);
      
    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = (supabase as any)
      .storage
      .from('marketplace_items')
      .getPublicUrl(filePath);
      
    return publicUrl;
  };

  const getVariationPreviewUrl = (v: VariationLite): string => {
    if (v.image) return v.image || "";
    const files = Array.isArray(v.pictureFiles) ? v.pictureFiles : [];
    const first = files[0];
    if (typeof first === "string") return first;
    if (first instanceof File) {
      try {
        return URL.createObjectURL(first);
      } catch {
        return "";
      }
    }
    return "";
  };

  const callUpdate = async (updates: any) => {
    if (!organizationId || !itemId) return;
    const resp = await (supabase as any).functions.invoke("mercado-livre-update-item-fields", {
      body: { organizationId, itemId: String(itemId), updates }
    });
    const json = resp?.data || {};
    if ((resp as any)?.error || json?.error) throw new Error((resp as any)?.error?.message || json?.error || "Falha na atualização");
  };

  /** Standardized save flow: set saving key, run fn, toast on error, clear saving. */
  const runWithSaving = async (key: string, fn: () => Promise<void>) => {
    setSaving(key);
    try {
      await fn();
    } catch (e) {
      toast({ title: "Erro", description: String((e as any)?.message || e), variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const confirmListingType = async () => {
    try {
      setSaving("listing_type");
      await callUpdate({ listing_type_id: listingTypeId });
      try {
        const { data: refreshed } = await (supabase as any)
          .from("marketplace_items_unified")
          .select("*")
          .eq("organizations_id", organizationId)
          .eq("marketplace_name", "Mercado Livre")
          .eq("marketplace_item_id", String(itemId))
          .limit(1)
          .single();
        const nextType = String((refreshed as any)?.listing_type_id || "");
        if (nextType && nextType === String(itemRow?.listing_type_id || "")) {
          toast({ title: "Alteração não aplicada", description: "O Mercado Livre não permitiu alterar o tipo de publicação para este anúncio.", variant: "destructive" });
        } else {
          toast({ title: "Tipo de publicação atualizado" });
          setItemRow(refreshed);
          setListingTypeId(nextType || listingTypeId);
        }
      } catch {}
    } catch (e) {
      toast({ title: "Erro", description: String((e as any)?.message || e), variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const upsertAttr = (id: string, name: string, value_id?: string, value_name?: string | null, value_struct?: any) => {
    setAttributes((list) => {
      const base = (list || []).filter((x: any) => String(x?.id || "") !== String(id));
      const obj: any = { id, name };
      if (value_struct) obj.value_struct = value_struct;
      if (value_id != null) obj.value_id = value_id;
      if (value_name != null) obj.value_name = value_name;
      return [ ...base, obj ];
    });
  };

  // Confirm Actions (standardized via runWithSaving where possible)
  const confirmTitle = async () => {
    if (!canEditTitle) {
      toast({ title: "Título bloqueado", description: "Título não pode ser alterado após vendas", variant: "destructive" });
      return;
    }
    await runWithSaving("title", async () => {
      await callUpdate({ title });
      toast({ title: "Título atualizado" });
    });
  };

  const confirmPrice = async () => {
    try {
      setSaving("price");
      const p = parsePriceToNumber(price);
      await callUpdate({ price: p });
      toast({ title: "Preço atualizado" });
    } catch (e) {
      const msg = String((e as any)?.message || e);
      if (/item\.price\.not_modifiable|price is not modifiable/i.test(msg)) {
        setPriceEditable(false);
        toast({ title: "Preço não editável", description: "O Mercado Livre não permite alterar o preço deste anúncio no estado atual.", variant: "destructive" });
      } else {
        toast({ title: "Erro", description: msg, variant: "destructive" });
      }
    } finally {
      setSaving(null);
    }
  };

  const confirmVariations = async () => {
    await runWithSaving("variations", async () => {
      const variationsPayload = await Promise.all(
        variations.map(async (v) => {
          const payload: any = {
            id: v.id,
            price: v.price,
            available_quantity: Math.max(0, Number(v.available_quantity) || 0),
          };
          if (v.pictureFiles && v.pictureFiles.length > 0) {
            const uploadedUrls: string[] = [];
            for (const file of v.pictureFiles) {
              if (file instanceof File) {
                uploadedUrls.push(await uploadFileToStorage(file));
              } else if (typeof file === "string") {
                uploadedUrls.push(file);
              }
            }
            if (uploadedUrls.length > 0) payload.pictures = uploadedUrls.map((u) => ({ source: u }));
          }
          return payload;
        }),
      );
      await callUpdate({ variations: variationsPayload });
      toast({ title: "Variações atualizadas" });
    });
  };

  const confirmPictures = async () => {
    await runWithSaving("pictures", async () => {
      const finalUrls: string[] = [];
      for (const item of pictures) {
        if (item instanceof File) {
          finalUrls.push(await uploadFileToStorage(item));
        } else if (typeof item === "string") {
          finalUrls.push(item);
        } else if (typeof item === "object" && (item as any).url) {
          finalUrls.push((item as any).url);
        }
      }
      await callUpdate({ pictures: finalUrls.map((u) => ({ source: u })) });
      setPictures(finalUrls);
      toast({ title: "Imagens atualizadas" });
    });
  };

  const confirmVideo = async () => {
    await runWithSaving("video_id", async () => {
      let finalVideoId = videoId;
      if (videoFile) {
        finalVideoId = await uploadFileToStorage(videoFile);
      }
      await callUpdate({ video_id: finalVideoId });
      toast({ title: "Vídeo atualizado" });
    });
  };

  const confirmAttributes = async () => {
    await runWithSaving("attributes", async () => {
      await callUpdate({ attributes });
      toast({ title: "Ficha técnica atualizada" });
    });
  };

  const confirmDescription = async () => {
    await runWithSaving("description", async () => {
      await callUpdate({ description: { plain_text: description } });
      toast({ title: "Descrição atualizada" });
    });
  };

  const confirmShipping = async () => {
    const mode = String(shipping?.mode || "").toLowerCase();
    const isMe2 = mode === "me2" || mode === "not_specified";
    if (isMe2) {
      const h = Number(shipping?.dimensions?.height);
      const w = Number(shipping?.dimensions?.width);
      const l = Number(shipping?.dimensions?.length);
      const g = Number(shipping?.dimensions?.weight);
      if (!shipping?.dimensions || !(h > 0 && w > 0 && l > 0 && g > 0)) {
        toast({
          title: "Dimensões inválidas",
          description: "Para Mercado Envios, informe altura, largura, comprimento e peso (inteiros).",
          variant: "destructive",
        });
        return;
      }
    }
    await runWithSaving("shipping", async () => {
      await callUpdate({ shipping });
      toast({ title: "Envio atualizado" });
    });
  };

  const toggleStatus = async (next: "active" | "paused" | "closed") => {
    if (!organizationId || !itemId) return;
    try {
      setSaving("status");
      const { data, error } = await (supabase as any).functions.invoke("mercado-livre-update-item-status", { body: { organizationId, itemId: String(itemId), targetStatus: next } });
      if (error || data?.error) throw new Error(error?.message || data?.error || "Falha ao atualizar status");
      setStatus(next);
      toast({ title: "Status atualizado" });
    } catch (e) {
      toast({ title: "Erro", description: String((e as any)?.message || e), variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <EditListingStepPrice
            price={price}
            priceEditable={priceEditable}
            savingKey={saving}
            loadingListing={loadingListing}
            listingTypes={listingTypes}
            listingTypeId={listingTypeId}
            listingPriceOptions={listingPriceOptions}
            itemRow={itemRow}
            onPriceChange={setPrice}
            onConfirmPrice={confirmPrice}
            onListingTypeChange={setListingTypeId}
            onConfirmListingType={confirmListingType}
          />
        );
      case 2:
        return (
          <EditListingStepShippingWrapper
            shipping={shipping}
            availableLogisticTypes={availableLogisticTypes}
            selectedLogisticType={selectedLogisticType}
            canUseFlex={canUseFlex}
            preferFlex={preferFlex}
            mandatoryFreeShipping={!!(itemRow as any)?.mandatory_free_shipping}
            savingKey={saving}
            onShippingChange={setShipping}
            onSelectLogisticType={setSelectedLogisticType}
            onToggleFlex={setPreferFlex}
            onConfirmShipping={confirmShipping}
          />
        );
      case 3:
        return (
          <EditListingStepTitleDescription
            title={title}
            description={description}
            canEditTitle={canEditTitle}
            savingKey={saving}
            onTitleChange={setTitle}
            onDescriptionChange={setDescription}
            onConfirmTitle={confirmTitle}
            onConfirmDescription={confirmDescription}
          />
        );
      case 4:
        return (
          <EditListingStepVariationsMedia
            variations={variations}
            allowVariationAttrs={allowVariationAttrs}
            pictures={pictures}
            videoFile={videoFile}
            videoId={videoId}
            primaryVariationIndex={primaryVariationIndex}
            price={price}
            savingKey={saving}
            getVariationPreviewUrl={getVariationPreviewUrl}
            onAddVariation={() => {
              const newVar: VariationLite = {
                id: `NEW_${Date.now()}`,
                available_quantity: 1,
                price: Number(price) || 0,
                attributes: allowVariationAttrs.map((a) => ({ id: a.id, name: a.name, value_name: "" })),
              };
              setVariations([...variations, newVar]);
            }}
            onRemoveVariation={(index) => setVariations(variations.filter((_, i) => i !== index))}
            onUpdateVariation={(index, partial) =>
              setVariations((prev) => {
                const next = [...prev];
                next[index] = { ...next[index], ...partial };
                return next;
              })
            }
            onSetPrimaryVariation={setPrimaryVariationIndex}
            onUpdateVariationPictures={(index, files) =>
              setVariations((prev) => {
                const next = [...prev];
                next[index] = { ...next[index], pictureFiles: files };
                return next;
              })
            }
            onUpdatePictures={setPictures}
            onConfirmVariations={confirmVariations}
            onConfirmPictures={confirmPictures}
            onVideoChange={(val) => {
              if (val instanceof File) {
                setVideoFile(val);
              } else {
                setVideoFile(null);
                setVideoId((val as string) || "");
              }
            }}
            onConfirmVideo={confirmVideo}
          />
        );
      case 5:
        return (
          <EditListingStepAttributes
            filteredAttrs={filteredAttrs}
            attributes={attributes}
            showAllTechAttrs={showAllTechAttrs}
            loadingAttrs={loadingAttrs}
            savingKey={saving}
            onToggleShowAllTechAttrs={() => setShowAllTechAttrs(!showAllTechAttrs)}
            onChangeAttribute={(obj) => upsertAttr(obj.id, obj.name, obj.value_id, obj.value_name)}
            onConfirmAttributes={confirmAttributes}
          />
        );
      default:
        return null;
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gray-50">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <GlobalHeader />
          <main className="flex-1 overflow-auto">
            <div className="relative p-6 max-w-6xl mx-auto">
              
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100">
                    {(() => {
                      const it = pictures?.[0] as any;
                      let src = "";
                      try {
                        if (it instanceof File) src = URL.createObjectURL(it);
                        else if (typeof it === "string") src = it;
                        else if (it && typeof it === "object") src = String(it?.url || it?.secure_url || "");
                      } catch {}
                      return src ? (<img src={src} className="w-full h-full object-cover" alt="Capa" />) : null;
                    })()}
                  </div>
                  <div>
                    {itemRow?.permalink ? (
                      <a href={String(itemRow.permalink)} target="_blank" rel="noopener noreferrer" className="text-2xl font-bold text-novura-primary hover:underline">{title}</a>
                    ) : (
                      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
                    )}
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-sm text-gray-600">EM: {String(itemId || "")}</span>
                      <span className="text-sm text-novura-primary">{pathsByCategoryId[String(itemRow?.category_id || '')] || String(itemRow?.category_id || '')}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <span>Status</span>
                    <Switch checked={String(status || '') === 'active'} onCheckedChange={(c) => toggleStatus(c ? 'active' : 'paused')} />
                  </label>
                  <Button variant="ghost" className="text-gray-700" onClick={() => navigate("/anuncios/ativos")}>
                    <X className="h-6 w-6" />
                  </Button>
                </div>
              </div>

              <StepIndicator 
                 steps={steps} 
                 currentStep={currentStep} 
                 clickable 
                 maxVisitedStep={5} 
                 onStepClick={(id) => setCurrentStep(id)} 
                 errorSteps={[]}
              />

              <Card className="mt-6 border border-gray-200 shadow-sm">
                <CardContent className="p-6 space-y-6">
                   {loading ? (
                     <div className="flex justify-center items-center h-40">
                       <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                     </div>
                   ) : (
                     renderStepContent()
                   )}

                   
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </div>

      <CategoryPickerDialog
        open={dumpOpen}
        onOpenChange={setDumpOpen}
        dumpQuery={dumpQuery}
        onQueryChange={setDumpQuery}
        dumpLoading={dumpLoading}
        dumpSelected={dumpSelected}
        pendingCategoryId={pendingCategoryId}
        pendingCategoryName={pendingCategoryName}
        getColumnItems={getColumnItems}
        handleSelectLevel={handleSelectLevel}
        handleBreadcrumbClick={handleBreadcrumbClick}
        onConfirm={async () => {
          const catId = pendingCategoryId;
          await confirmPickerCategory();
          if (catId) {
            await confirmCategory(catId);
          }
        }}
        onCancel={cancelPicker}
      />

    </SidebarProvider>
  );
}
