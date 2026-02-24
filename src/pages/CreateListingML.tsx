import { AppSidebar } from "@/components/AppSidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import LoadingOverlay from "@/components/LoadingOverlay";
import { StepAttributes } from "@/components/listings/StepAttributes";
import { StepCategory } from "@/components/listings/StepCategory";
import { StepMarketplaceSelector } from "@/components/listings/StepMarketplaceSelector";
import { StepPricing } from "@/components/listings/StepPricing";
import { StepReview } from "@/components/listings/StepReview";
import { StepShipping } from "@/components/listings/StepShipping";
import { StepTechSpecs } from "@/components/listings/StepTechSpecs";
import { StepVariations } from "@/components/listings/StepVariations";
import { NavigationButtons } from "@/components/products/create/NavigationButtons";
import { StepIndicator } from "@/components/products/create/StepIndicator";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCreateListingAttributes } from "@/hooks/useCreateListingAttributes";
import { useCreateListingCategories } from "@/hooks/useCreateListingCategories";
import { useCreateListingData } from "@/hooks/useCreateListingData";
import { useCreateListingDraft } from "@/hooks/useCreateListingDraft";
import { marketplaceDisplayNameFromSlug, marketplaceSlugify, publishListing } from "@/services/create-listing.service";
import type { DraftData } from "@/types/create-listing";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";



export default function AnunciosCriarML() {
  const { organizationId } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [currentStep, setCurrentStep] = useState(1);
  const maxSteps = 8;
  const [marketplaceSelection, setMarketplaceSelection] = useState<string>("");
  const isShopeeMode = useMemo(() => String(marketplaceSelection || "").toLowerCase() === "shopee", [marketplaceSelection]);
  const [siteId, setSiteId] = useState("MLB");
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [currencyId, setCurrencyId] = useState("BRL");
  const [attributes, setAttributes] = useState<any[]>([]);
  const [pictures, setPictures] = useState<string[]>([]);
  const [video, setVideo] = useState<File | string | null>(null);
  const [variations, setVariations] = useState<any[]>([]);
  const [listingTypeId, setListingTypeId] = useState<string>("");
  const [price, setPrice] = useState<string>("");
  const [shipping, setShipping] = useState<any>({});
  const [saleTerms, setSaleTerms] = useState<any[]>([]);
  const [description, setDescription] = useState<string>("");
  const [availableQuantity, setAvailableQuantity] = useState<number>(0);
  const [maxVisitedStep, setMaxVisitedStep] = useState<number>(1);
  const [publishing, setPublishing] = useState(false);
  const [errorSteps, setErrorSteps] = useState<number[]>([]);
  const [fashionImage34, setFashionImage34] = useState<boolean>(false);
  const sessionCacheRef = useRef<{ attrsMetaByCategory: Record<string, any[]>; techInputByCategory: Record<string, any>; saleTermsMetaByCategory: Record<string, any[]>; listingTypesByCategory: Record<string, any[]>; listingPriceOptionsByKey: Record<string, any[]>; brandListByCategory: Record<string, any[]> }>({ attrsMetaByCategory: {}, techInputByCategory: {}, saleTermsMetaByCategory: {}, listingTypesByCategory: {}, listingPriceOptionsByKey: {}, brandListByCategory: {} });

  const {
    attrsMeta,
    setAttrsMeta,
    loadingAttrs,
    techSpecsInput,
    setTechSpecsInput,
    techSpecsOutput,
    setTechSpecsOutput,
    saleTermsMeta,
    setSaleTermsMeta,
    listingTypes,
    setListingTypes,
    listingPriceOptions,
    setListingPriceOptions,
    loadingListing,
    shippingModesAvailable,
    availableLogisticTypes,
    selectedLogisticType,
    setSelectedLogisticType,
    freeShippingMandatory,
    connectedApps,
    shopeeBrandList,
    conditionalRequiredIds,
    lastCategoryLoaded,
    setLastCategoryLoaded,
    prefetchForNextStep,
    triggerConditionalEval,
  } = useCreateListingData({
    organizationId,
    categoryId,
    siteId,
    isShopeeMode,
    currentStep,
    listingTypeId,
    setListingTypeId,
    attributes,
    price,
    shipping,
    setShipping,
    sessionCacheRef,
  });
  const [showAllTechAttrs, setShowAllTechAttrs] = useState(false);
  const [attrTab, setAttrTab] = useState<"required" | "tech">("required");
  const [primaryVariationIndex, setPrimaryVariationIndex] = useState<number | null>(null);
  const [preferFlex, setPreferFlex] = useState<boolean>(false);
  const [variationsEnabled, setVariationsEnabled] = useState<boolean>(false);
  const hasUnsavedData = useMemo(() => {
    const s = shipping || {};
    return !!(title || categoryId || description || price || listingTypeId || availableQuantity || (attributes || []).length || (variations || []).length || (pictures || []).length || (saleTerms || []).length || Object.keys(s).length);
  }, [title, categoryId, description, price, listingTypeId, availableQuantity, attributes, variations, pictures, saleTerms, shipping]);

  // Draft hook — nav guards + draft load/save lifecycle
  const onDraftLoaded = (draft: DraftData) => {
    if (draft.site_id) setSiteId(String(draft.site_id));
    if (draft.title) setTitle(String(draft.title));
    if (draft.category_id) { setCategoryId(String(draft.category_id)); setLastCategoryLoaded(String(draft.category_id)); }
    if (Array.isArray(draft.attributes)) setAttributes(draft.attributes);
    if (Array.isArray(draft.variations)) setVariations(draft.variations);
    if (Array.isArray(draft.pictures)) setPictures(draft.pictures as any);
    if (draft.price != null) setPrice(String(draft.price));
    if (draft.listing_type_id) setListingTypeId(String(draft.listing_type_id));
    if (draft.shipping) setShipping(draft.shipping);
    if (Array.isArray(draft.sale_terms)) setSaleTerms(draft.sale_terms);
    if (typeof draft.description === 'string') setDescription(draft.description);
    if (typeof draft.available_quantity === 'number') setAvailableQuantity(draft.available_quantity);
    if (draft.api_cache && typeof draft.api_cache === 'object') {
      const cat = String(draft.category_id || '');
      if (Array.isArray(draft.api_cache.attrsMeta)) {
        setAttrsMeta(draft.api_cache.attrsMeta);
        if (cat) sessionCacheRef.current.attrsMetaByCategory[cat] = draft.api_cache.attrsMeta;
      }
      if (draft.api_cache.techSpecsInput) {
        setTechSpecsInput(draft.api_cache.techSpecsInput);
        if (cat) sessionCacheRef.current.techInputByCategory[cat] = draft.api_cache.techSpecsInput;
      }
      if (Array.isArray(draft.api_cache.saleTermsMeta)) {
        setSaleTermsMeta(draft.api_cache.saleTermsMeta);
        if (cat) sessionCacheRef.current.saleTermsMetaByCategory[cat] = draft.api_cache.saleTermsMeta;
      }
      if (Array.isArray(draft.api_cache.listingTypes)) {
        setListingTypes(draft.api_cache.listingTypes);
        if (cat) sessionCacheRef.current.listingTypesByCategory[cat] = draft.api_cache.listingTypes;
      }
      if (Array.isArray(draft.api_cache.listingPriceOptions)) {
        const key = `${String(draft.site_id || 'MLB')}:${String(draft.category_id || '')}:${Number(draft.price || 0)}`;
        setListingPriceOptions(draft.api_cache.listingPriceOptions);
        sessionCacheRef.current.listingPriceOptionsByKey[key] = draft.api_cache.listingPriceOptions;
      }
    }
    if (typeof draft.last_step === 'number' && draft.last_step >= 1 && draft.last_step <= maxSteps) {
      setCurrentStep(draft.last_step);
      setMaxVisitedStep(draft.last_step);
    }
  };

  const { currentDraftId, setCurrentDraftId, confirmExit, setConfirmExit, allowNavRef, saveDraftAndExit } =
    useCreateListingDraft({ organizationId, draftId: searchParams.get('draft_id'), hasUnsavedData, publishing, navigate, onDraftLoaded });

  const { categorySuggestions, domainSuggestions, hasSearchedCategory, isLoadingPredict, runPredict,
    dumpOpen, setDumpOpen, dumpLoading, dumpQuery, setDumpQuery, dumpSelected,
    pendingCategoryId, pendingCategoryName, pathsByCategoryId,
    getColumnItems, handleSelectLevel, handleBreadcrumbClick, confirmPickerCategory, cancelPicker } =
    useCreateListingCategories({ organizationId, siteId, isShopeeMode, categoryId, setCategoryId, title, currentStep });

  const { filteredAttrs, variationAttrs, allowVariationAttrs, variationRequiredIds } =
    useCreateListingAttributes({ attrsMeta, conditionalRequiredIds, techSpecsInput });

  const steps = useMemo(() => {
    if (isShopeeMode) {
      return [
        { id: 1, title: "Marketplace", description: "Escolha o marketplace" },
        { id: 2, title: "Título e Categoria", description: "Defina título e categoria" },
        { id: 3, title: "Mídia e Descrição", description: "Fotos e descrição" },
        { id: 4, title: "Ficha técnica", description: "Ficha técnica" },
        { id: 5, title: "Informações de Vendas", description: "Simples ou Variantes" },
        { id: 7, title: "Envio", description: "Envio e dimensões" },
        { id: 8, title: "Revisão", description: "Revisão e publicação" },
      ];
    }
    return [
      { id: 1, title: "Marketplace", description: "Escolha o marketplace" },
      { id: 2, title: "Categoria", description: "Defina Categoria" },
      { id: 3, title: "Atributos", description: "Dados obrigatórios" },
      { id: 4, title: "Variações", description: "Variações e Mídia" },
      { id: 5, title: "Ficha Técnica", description: "Ficha técnica" },
      { id: 6, title: "Preço e Publicação", description: "Preço e publicação" },
      { id: 7, title: "Envio", description: "Envio e dimensões" },
      { id: 8, title: "Revisão", description: "Revisão e publicação" },
    ];
  }, [isShopeeMode]);

  const getStepTitle = (id: number) => {
    const it = (steps as any).find((s: any) => Number(s?.id) === Number(id));
    return String(it?.title || id);
  };

  useEffect(() => {
    const path = String(location?.pathname || "");
    if (!marketplaceSelection) {
      const m = path.match(/\/anuncios\/criar\/([^/?#]+)/i);
      const slug = m?.[1] || "";
      if (slug) {
        const display = marketplaceDisplayNameFromSlug(slug);
        if (display) setMarketplaceSelection(display);
      }
    }
  }, [location?.pathname, marketplaceSelection]);

  const canProceed = () => {
    if (currentStep === 1) return !!marketplaceSelection;
    if (currentStep === 2) return !!title && !!categoryId;
    if (currentStep === 3) {
      if (isShopeeMode) return description.length > 0;
      const reqIds = new Set<string>(filteredAttrs.required.map((a: any) => String(a.id)));
      const filled = new Set<string>((attributes || []).map((a: any) => String(a.id)).filter(Boolean));
      const missing = Array.from(reqIds).filter((id) => !filled.has(id));
      return description.length > 0 && missing.length === 0;
    }
    if (currentStep === 4) {
      if (isShopeeMode) return true;
      return (Array.isArray(variations) ? variations.length : 0) > 0;
    }
    if (currentStep === 7) {
      const isMe2 = String((shipping as any)?.mode || "").toLowerCase() === "me2";
      if (!isMe2) return true;
      const dims = (shipping as any)?.dimensions || {};
      const h = Number(dims?.height || 0);
      const l = Number(dims?.length || 0);
      const w = Number(dims?.width || 0);
      const g = Number((shipping as any)?.weight || 0);
      return h > 0 && l > 0 && w > 0 && g > 0;
    }
    if (currentStep === 6) {
      if (isShopeeMode) {
        const ok = !!price;
        const hasAtLeastOneImage = (variations || []).some((v: any) => Array.isArray(v?.pictureFiles) && v.pictureFiles.length > 0) || (pictures || []).length > 0;
        return ok && hasAtLeastOneImage;
      } else {
        const ok = !!listingTypeId && !!price;
        const opt = (listingPriceOptions || []).find((o: any) => String(o?.listing_type_id || o?.id || '') === String(listingTypeId || ''));
        const requiresPic = !!(opt as any)?.requires_picture || ['gold_pro', 'gold_special'].includes(String(listingTypeId || '').toLowerCase());
        if (requiresPic) {
          const hasAtLeastOneImage = (variations || []).some((v: any) => Array.isArray(v?.pictureFiles) && v.pictureFiles.length > 0) || (pictures || []).length > 0;
          return ok && hasAtLeastOneImage;
        }
        return ok;
      }
    }
    return true;
  };

  const nextStep = async () => {
    if (currentStep >= maxSteps) return;
    if (canProceed()) {
      await prefetchForNextStep(currentStep);
      if (currentStep === 3) triggerConditionalEval();
      const next = currentStep + 1;
      setCurrentStep(next);
      setMaxVisitedStep((prev) => Math.max(prev, next));
      return;
    }
    if (currentStep === 6) {
      if (isShopeeMode) {
        const okBasic = !!price;
        if (!okBasic) {
          toast({ title: "Preço obrigatório", description: "Informe o preço.", variant: "destructive" });
          return;
        }
        const hasAtLeastOneImage = (variations || []).some((v: any) => Array.isArray(v?.pictureFiles) && v.pictureFiles.length > 0) || (pictures || []).length > 0;
        if (!hasAtLeastOneImage) {
          toast({ title: "Foto obrigatória", description: "Adicione pelo menos uma foto nas variações ou nas fotos gerais.", variant: "destructive" });
          return;
        }
      } else {
        const okBasic = !!listingTypeId && !!price;
        if (!okBasic) {
          toast({ title: "Complete esta etapa", description: "Selecione o tipo de publicação e informe o preço.", variant: "destructive" });
          return;
        }
        const opt = (listingPriceOptions || []).find((o: any) => String(o?.listing_type_id || o?.id || '') === String(listingTypeId || ''));
        const requiresPic = !!(opt as any)?.requires_picture || ['gold_pro', 'gold_special'].includes(String(listingTypeId || '').toLowerCase());
        if (requiresPic) {
          const hasAtLeastOneImage = (variations || []).some((v: any) => Array.isArray(v?.pictureFiles) && v.pictureFiles.length > 0) || (pictures || []).length > 0;
          if (!hasAtLeastOneImage) {
            toast({ title: "Foto obrigatória no Premium", description: "Adicione pelo menos uma foto nas variações ou nas fotos gerais.", variant: "destructive" });
            return;
          }
        }
      }
    } else if (currentStep === 7) {
      const isMe2 = String((shipping as any)?.mode || '').toLowerCase() === 'me2';
      if (isMe2) {
        toast({ title: "Dimensões e peso obrigatórios", description: "Informe altura, largura, comprimento e peso do pacote.", variant: "destructive" });
        return;
      }
    } else if (currentStep === 4) {
      toast({ title: "Variação obrigatória", description: "Adicione ao menos uma variação.", variant: "destructive" });
      return;
    } else if (currentStep === 3) {
      if (isShopeeMode) {
        toast({ title: "Descrição obrigatória", description: "Preencha a descrição do produto.", variant: "destructive" });
      } else {
        toast({ title: "Preencha os obrigatórios", description: "Preencha os atributos obrigatórios e a descrição.", variant: "destructive" });
      }
      return;
    } else if (currentStep === 2) {
      toast({ title: "Título e categoria", description: "Informe o título e selecione a categoria.", variant: "destructive" });
      return;
    } else if (currentStep === 1) {
      toast({ title: "Marketplace necessário", description: "Selecione um marketplace conectado.", variant: "destructive" });
      return;
    }
  };
  const backStep = () => { if (currentStep > 1) setCurrentStep(currentStep - 1); };

  const handlePublish = async () => {
    if (!organizationId) { toast({ title: "Sessão necessária", description: "Entre na sua conta.", variant: "destructive" }); return; }
    setErrorSteps([]);
    setPublishing(true);
    try {
      const result = await publishListing({
        organizationId,
        isShopeeMode,
        siteId,
        title,
        categoryId,
        currencyId,
        attributes,
        variations,
        pictures,
        price,
        listingTypeId,
        shipping,
        saleTerms,
        description,
        availableQuantity,
        variationsEnabled,
        listingPriceOptions,
        shippingModesAvailable,
        variationAttrs,
        variationRequiredIds,
        preferFlex,
        currentDraftId,
      });
      if (!result.success) {
        setErrorSteps((prev) => Array.from(new Set([...prev, result.errorStepId!])));
        setCurrentStep(result.errorStepId!);
        toast({ title: "Corrija o campo", description: `${result.errorField} no passo ${getStepTitle(result.errorStepId!)}`, variant: "destructive" });
        return;
      }
      toast({ title: "Anúncio cadastrado com sucesso" });
      setConfirmExit(false);
      allowNavRef.current = true;
      navigate("/anuncios/ativos");
      setTimeout(() => { allowNavRef.current = false; }, 300);
    } finally {
      setPublishing(false);
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
              {publishing && (
                <LoadingOverlay messages={[
                  "Estamos publicando seu anúncio",
                  "Só um minutinho, estamos validando seu anúncio e checando erros",
                  "Em breve seu anúncio estará disponível"
                ]} />
              )}
              <Dialog open={confirmExit} onOpenChange={setConfirmExit}>
                <DialogContent className="w-full max-w-lg md:max-w-xl">
                  <DialogHeader>
                    <DialogTitle>Fechar sem salvar?</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="text-sm text-gray-700">Você perderá todos os dados se fechar agora. Deseja salvar um rascunho?</div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => { allowNavRef.current = true; setConfirmExit(false); navigate('/anuncios'); setTimeout(() => { allowNavRef.current = false; }, 300); }}>Fechar sem salvar</Button>
                      <Button
                        variant={maxVisitedStep >= 4 ? "default" : "outline"}
                        className={maxVisitedStep >= 4 ? "rounded-2xl bg-novura-primary hover:bg-novura-primary/90" : "border rounded-2xl"}
                        disabled={maxVisitedStep < 4}
                        onClick={() => saveDraftAndExit({ organizationId, isShopeeMode, siteId, title, categoryId, attributes, variations, pictures, price, listingTypeId, shipping, saleTerms, description, availableQuantity, currentStep, lastCategoryLoaded, attrsMeta, techSpecsInput, saleTermsMeta, listingTypes, listingPriceOptions, sessionCacheRef })}
                      >Salvar rascunho</Button>
                      <Button className="bg-novura-primary hover:bg-novura-primary/90 text-white" onClick={() => { setConfirmExit(false); }}>Terminar o anúncio</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Criar um anúncio</h1>
                  <p className="text-gray-600">{isShopeeMode ? "Modo Shopee" : "Modo Mercado Livre"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant={maxVisitedStep >= 4 ? "default" : "outline"}
                    className={maxVisitedStep >= 4 ? "rounded-2xl bg-novura-primary hover:bg-novura-primary/90" : "border-2 rounded-2xl"}
                    disabled={maxVisitedStep < 4}
                    onClick={() => saveDraftAndExit({ organizationId, isShopeeMode, siteId, title, categoryId, attributes, variations, pictures, price, listingTypeId, shipping, saleTerms, description, availableQuantity, currentStep, lastCategoryLoaded, attrsMeta, techSpecsInput, saleTermsMeta, listingTypes, listingPriceOptions, sessionCacheRef })}
                  >Salvar rascunho</Button>
                  <Button variant="ghost" className="text-gray-700" onClick={() => setConfirmExit(true)}>✕</Button>
                </div>
              </div>
              <StepIndicator steps={steps as any} currentStep={currentStep} clickable maxVisitedStep={maxVisitedStep} onStepClick={(id) => { if (id <= maxVisitedStep) setCurrentStep(id); }} errorSteps={errorSteps} />
              <Card className="mt-6 border border-gray-200 shadow-sm">
                <CardContent className="p-6 space-y-6">
                  {currentStep === 1 && (
                    <StepMarketplaceSelector
                      connectedApps={connectedApps}
                      marketplaceSelection={marketplaceSelection}
                      onSelect={(name) => {
                        setMarketplaceSelection(name);
                        navigate(`/anuncios/criar/${marketplaceSlugify(name)}`);
                      }}
                    />
                  )}
                  {currentStep === 2 && (
                    <StepCategory
                      title={title}
                      setTitle={setTitle}
                      categoryId={categoryId}
                      setCategoryId={setCategoryId}
                      categorySuggestions={categorySuggestions}
                      domainSuggestions={domainSuggestions}
                      hasSearchedCategory={hasSearchedCategory}
                      isLoadingPredict={isLoadingPredict}
                      runPredict={runPredict}
                      pathsByCategoryId={pathsByCategoryId}
                      dumpOpen={dumpOpen}
                      setDumpOpen={setDumpOpen}
                      dumpQuery={dumpQuery}
                      setDumpQuery={setDumpQuery}
                      dumpLoading={dumpLoading}
                      dumpSelected={dumpSelected}
                      pendingCategoryId={pendingCategoryId}
                      pendingCategoryName={pendingCategoryName}
                      getColumnItems={getColumnItems}
                      handleSelectLevel={handleSelectLevel}
                      handleBreadcrumbClick={handleBreadcrumbClick}
                      confirmPickerCategory={confirmPickerCategory}
                      cancelPicker={cancelPicker}
                    />
                  )}
                  {currentStep === 3 && (
                    <StepAttributes
                      isShopeeMode={isShopeeMode}
                      pictures={pictures}
                      setPictures={setPictures}
                      fashionImage34={fashionImage34}
                      setFashionImage34={setFashionImage34}
                      filteredAttrs={filteredAttrs}
                      attributes={attributes}
                      setAttributes={setAttributes}
                      description={description}
                      setDescription={setDescription}
                      loadingAttrs={loadingAttrs}
                      video={video}
                      setVideo={setVideo}
                    />
                  )}
                  {((isShopeeMode && currentStep === 5) || (!isShopeeMode && currentStep === 4)) && (
                    <StepVariations
                      isShopeeMode={isShopeeMode}
                      variations={variations}
                      setVariations={setVariations}
                      variationsEnabled={variationsEnabled}
                      setVariationsEnabled={setVariationsEnabled}
                      primaryVariationIndex={primaryVariationIndex}
                      setPrimaryVariationIndex={setPrimaryVariationIndex}
                      variationAttrs={variationAttrs}
                      allowVariationAttrs={allowVariationAttrs}
                      variationRequiredIds={variationRequiredIds}
                      attributes={attributes}
                      setAttributes={setAttributes}
                      pictures={pictures}
                      shopeeBrandList={shopeeBrandList}
                      availableQuantity={availableQuantity}
                      setAvailableQuantity={setAvailableQuantity}
                    />
                  )}
                  {(((isShopeeMode && currentStep === 4) || (!isShopeeMode && currentStep === 5))) && (
                    <StepTechSpecs
                      isShopeeMode={isShopeeMode}
                      filteredAttrs={filteredAttrs}
                      attributes={attributes}
                      setAttributes={setAttributes}
                      techSpecsInput={techSpecsInput}
                      techSpecsOutput={techSpecsOutput}
                      setTechSpecsOutput={setTechSpecsOutput}
                      attrTab={attrTab}
                      setAttrTab={setAttrTab}
                      showAllTechAttrs={showAllTechAttrs}
                      setShowAllTechAttrs={setShowAllTechAttrs}
                      loadingAttrs={loadingAttrs}
                      shopeeBrandList={shopeeBrandList}
                    />
                  )}
                  {currentStep === 6 && (
                    <StepPricing
                      price={price}
                      setPrice={setPrice}
                      listingTypeId={listingTypeId}
                      setListingTypeId={setListingTypeId}
                      listingTypes={listingTypes}
                      listingPriceOptions={listingPriceOptions}
                      loadingListing={loadingListing}
                      saleTermsMeta={saleTermsMeta}
                      saleTerms={saleTerms}
                      setSaleTerms={setSaleTerms}
                      currencyId={currencyId}
                    />
                  )}
                  {currentStep === 7 && (
                    <StepShipping
                      shipping={shipping}
                      setShipping={setShipping}
                      freeShippingMandatory={freeShippingMandatory}
                      availableLogisticTypes={availableLogisticTypes}
                      selectedLogisticType={selectedLogisticType}
                      setSelectedLogisticType={setSelectedLogisticType}
                    />
                  )}
                  {currentStep === 8 && (
                    <StepReview
                      title={title}
                      setTitle={setTitle}
                      listingTypeId={listingTypeId}
                      listingTypes={listingTypes}
                      selectedLogisticType={selectedLogisticType}
                      categoryPath={pathsByCategoryId[String(categoryId || '')] || String(categoryId || '')}
                      variations={variations}
                      pictures={pictures}
                      onBack={backStep}
                      onPublish={handlePublish}
                    />
                  )}
                </CardContent>
              </Card>
              <div className="mt-4">
                {currentStep !== 8 && (
                  <NavigationButtons
                    currentStep={currentStep}
                    maxSteps={maxSteps}
                    productType={"ml" as any}
                    variationEtapa={"" as any}
                    canProceedVariation={() => true}
                    loading={false}
                    onNext={currentStep === maxSteps ? handlePublish : nextStep}
                    onBack={backStep}
                    kitEtapa={"" as any}
                    onSave={currentStep === maxSteps ? () => navigate('/anuncios') : nextStep}
                    canProceedExternal={canProceed}
                    saveLabel={currentStep === 7 ? "Avançar" : (currentStep === 8 ? "Fazer depois" : undefined)}
                  />
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
