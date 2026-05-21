import { useEffect, useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import LoadingOverlay from "@/components/LoadingOverlay";
import { EditListingShell } from "@/components/listings/edit/EditListingShell";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useEditListingFlow } from "@/hooks/useEditListingFlow";
import { useListingTypeState } from "@/hooks/useListingTypeState";
import { useShippingPreferences } from "@/hooks/useShippingPreferences";
import { useEditListingAttributesMeta } from "@/hooks/useEditListingAttributesMeta";
import { useCreateListingAttributes } from "@/hooks/useCreateListingAttributes";
import { useCreateListingCategories } from "@/hooks/useCreateListingCategories";
import { serializeImages } from "@/adapters/listings/shared/imageUpload";
import { useNavigate, useParams } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditListing() {
  const { organizationId } = useAuth();
  const { itemId } = useParams<{ itemId: string }>();
  const { toast } = useToast();
  const navigate = useNavigate();

  const flow = useEditListingFlow(organizationId, itemId, (msg) =>
    toast({ title: "Falha ao carregar", description: msg, variant: "destructive" }),
  );

  const [priceEditable, setPriceEditable] = useState(true);
  const [categoryId, setCategoryId] = useState("");

  const itemRowRaw = flow.itemRow?.raw;
  const isML = flow.adapter?.channel === "mercado-livre";

  const listingTypeState = useListingTypeState({
    itemRow: isML ? itemRowRaw : null,
    currentStep: flow.currentStep,
    price: flow.price,
    organizationId,
  });

  const listingTypes = isML ? listingTypeState.listingTypes : [];
  const listingTypeId = isML ? listingTypeState.listingTypeId : flow.listingTypeId;
  const setListingTypeId = isML ? listingTypeState.setListingTypeId : flow.setListingTypeId;
  const listingPriceOptions = isML ? listingTypeState.listingPriceOptions : [];
  const loadingListing = isML ? listingTypeState.loadingListing : false;

  useEffect(() => {
    if (isML && listingTypeState.listingTypeId && listingTypeState.listingTypeId !== flow.listingTypeId) {
      flow.setListingTypeId(listingTypeState.listingTypeId);
    }
  }, [isML, listingTypeState.listingTypeId, flow.listingTypeId]);

  const {
    availableLogisticTypes,
    selectedLogisticType,
    setSelectedLogisticType,
    preferFlex,
    setPreferFlex,
    canUseFlex,
  } = useShippingPreferences({
    organizationId,
    itemRow: itemRowRaw,
    currentStep: flow.currentStep,
  });

  const { attrsMeta, loadingAttrs } = useEditListingAttributesMeta({
    adapter: flow.adapter,
    organizationId,
    categoryId,
    currentStep: flow.currentStep,
  });

  const { allowVariationAttrs } = useCreateListingAttributes({
    attrsMeta,
    conditionalRequiredIds: [],
    techSpecsInput: null,
  });

  const { pathsByCategoryId } = useCreateListingCategories({
    adapter: flow.adapter ?? undefined,
    organizationId,
    siteId: "MLB",
    title: flow.title,
    categoryId,
    setCategoryId,
    currentStep: flow.currentStep,
  });

  useEffect(() => {
    const cat = String(itemRowRaw?.category_id || flow.itemRow?.categoryId || "");
    if (cat) setCategoryId(cat);
  }, [itemRowRaw?.category_id, flow.itemRow?.categoryId]);

  const categoryPath =
    pathsByCategoryId[String(categoryId || itemRowRaw?.category_id || "")] ||
    String(categoryId || itemRowRaw?.category_id || "");

  const withSaving = async (key: string, fn: () => Promise<void>) => {
    flow.setSaving(key);
    try {
      await fn();
      toast({ title: "Salvo com sucesso!" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Erro ao salvar", description: msg, variant: "destructive" });
    } finally {
      flow.setSaving(null);
    }
  };

  const onSavePrice = () =>
    withSaving("price", async () => {
      try {
        await flow.save({ price: flow.price });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/price\.not_modifiable|price is not modifiable/i.test(msg)) {
          setPriceEditable(false);
        }
        throw e;
      }
    });

  const onSaveListingType = () =>
    withSaving("listing_type", () => flow.save({ listing_type_id: flow.listingTypeId }));

  const onSaveShipping = () =>
    withSaving("shipping", async () => {
      const payload = {
        ...flow.shipping,
        ...(isML
          ? {
              logistic_type: selectedLogisticType,
              cap_flex: preferFlex,
            }
          : {}),
      };
      await flow.save({ shipping: payload });
    });

  const onSaveTitle = () => withSaving("title", () => flow.save({ title: flow.title }));

  const onSaveDescription = () =>
    withSaving("description", () => flow.save({ description: flow.description }));

  const onSaveVariations = () =>
    withSaving("variations", () => flow.save({ variations: flow.variations }));

  const onSavePictures = async () => {
    await withSaving("pictures", async () => {
      const urls = await serializeImages(flow.pictures, organizationId, itemId);
      flow.setPictures(urls);
      await flow.save({ pictures: urls });
    });
  };

  const onSaveVideo = () =>
    withSaving("video", () => flow.save({ videoId: flow.videoId } as Parameters<typeof flow.save>[0]));

  const onSaveAttributes = () =>
    withSaving("attributes", () => flow.save({ attributes: flow.attributes }));

  const onToggleStatus = async (active: boolean) => {
    flow.setSaving("status");
    try {
      await flow.changeStatus(active ? "active" : "paused");
      toast({ title: "Status atualizado" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      flow.setSaving(null);
    }
  };

  if (flow.loading) {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-gray-50">
          <AppSidebar />
          <div className="flex-1 flex flex-col">
            <GlobalHeader />
            <main className="flex-1 overflow-auto p-6 max-w-6xl mx-auto space-y-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-64 w-full" />
            </main>
          </div>
        </div>
      </SidebarProvider>
    );
  }

  if (!flow.adapter) {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-gray-50">
          <AppSidebar />
          <div className="flex-1 flex flex-col">
            <GlobalHeader />
            <main className="flex-1 p-6 text-center text-gray-500">
              Marketplace não suportado para edição.
            </main>
          </div>
        </div>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gray-50">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <GlobalHeader />
          <main className="flex-1 overflow-auto">
            <div className="relative p-6 max-w-6xl mx-auto">
              {flow.saving && (
                <LoadingOverlay messages={[`Salvando ${flow.saving}...`]} />
              )}

              <EditListingShell
                adapter={flow.adapter}
                flow={flow}
                itemId={itemId || ""}
                categoryPath={categoryPath}
                listingTypes={listingTypes}
                listingPriceOptions={listingPriceOptions}
                loadingListing={loadingListing}
                priceEditable={priceEditable}
                attrsMeta={attrsMeta}
                loadingAttrs={loadingAttrs}
                allowVariationAttrs={allowVariationAttrs}
                availableLogisticTypes={availableLogisticTypes}
                selectedLogisticType={selectedLogisticType}
                setSelectedLogisticType={setSelectedLogisticType}
                preferFlex={preferFlex}
                setPreferFlex={setPreferFlex}
                canUseFlex={canUseFlex}
                onSavePrice={onSavePrice}
                onSaveListingType={onSaveListingType}
                onSaveShipping={onSaveShipping}
                onSaveTitle={onSaveTitle}
                onSaveDescription={onSaveDescription}
                onSaveVariations={onSaveVariations}
                onSavePictures={onSavePictures}
                onSaveVideo={onSaveVideo}
                onSaveAttributes={onSaveAttributes}
                onToggleStatus={onToggleStatus}
                onClose={() => navigate("/anuncios/ativos")}
              />
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
