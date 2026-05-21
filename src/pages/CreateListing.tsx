import { AppSidebar } from "@/components/AppSidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import LoadingOverlay from "@/components/LoadingOverlay";
import { CreateListingShell } from "@/components/listings/create/CreateListingShell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCreateListingFlow } from "@/hooks/useCreateListingFlow";
import { resolveAdapter } from "@/adapters/listings/resolveAdapter";
import { marketplaceDisplayNameFromSlug } from "@/services/create-listing.service";
import { supabase } from "@/integrations/supabase/client";
import type { MarketplaceAdapter } from "@/adapters/listings/types";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

export default function CreateListing() {
  const { organizationId } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { marketplace: marketplaceParam } = useParams<{ marketplace?: string }>();
  const [searchParams] = useSearchParams();

  const [adapter, setAdapter] = useState<MarketplaceAdapter | null>(null);
  const [marketplaceSelection, setMarketplaceSelection] = useState<string>("");
  const [confirmExit, setConfirmExit] = useState(false);
  const allowNavRef = useRef(false);

  const flow = useCreateListingFlow(adapter, organizationId);
  const isShopeeMode = useMemo(
    () => String(marketplaceSelection || "").toLowerCase() === "shopee",
    [marketplaceSelection],
  );

  useEffect(() => {
    const slug = marketplaceParam || "";
    if (!slug) return;
    const display = marketplaceDisplayNameFromSlug(slug);
    if (display && !marketplaceSelection) {
      const resolved = resolveAdapter(display);
      if (resolved) {
        setAdapter(resolved);
        setMarketplaceSelection(display);
        flow.goToStep(2);
      }
    }
  }, [marketplaceParam]);

  useEffect(() => {
    const draftId = searchParams.get("draft_id");
    if (!draftId || !organizationId) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("marketplace_drafts")
        .select("*")
        .eq("id", draftId)
        .eq("organizations_id", organizationId)
        .single();
      if (!data) return;
      const mktName = String(data.marketplace_name || "");
      const resolved = resolveAdapter(mktName);
      if (resolved) {
        setAdapter(resolved);
        setMarketplaceSelection(mktName);
      }
      flow.setCurrentDraftId(draftId);
      if (data.site_id) flow.setSiteId(String(data.site_id));
      if (data.title) flow.setTitle(String(data.title));
      if (data.category_id) flow.setCategoryId(String(data.category_id));
      if (Array.isArray(data.attributes)) flow.setAttributes(data.attributes);
      if (Array.isArray(data.variations)) flow.setVariations(data.variations);
      if (Array.isArray(data.pictures)) flow.setPictures(data.pictures);
      if (data.price != null) flow.setPrice(String(data.price));
      if (data.listing_type_id) flow.setListingTypeId(String(data.listing_type_id));
      if (data.shipping) flow.setShipping(data.shipping);
      if (Array.isArray(data.sale_terms)) flow.setSaleTerms(data.sale_terms);
      if (typeof data.description === "string") flow.setDescription(data.description);
      if (typeof data.available_quantity === "number") flow.setAvailableQuantity(data.available_quantity);
      if (typeof data.last_step === "number") flow.goToStep(data.last_step);
    })();
  }, [organizationId]);

  const hasUnsavedData = useMemo(
    () => !!(flow.title || flow.categoryId || flow.description || flow.price || flow.pictures.length),
    [flow.title, flow.categoryId, flow.description, flow.price, flow.pictures.length],
  );

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedData && !flow.publishing) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedData, flow.publishing]);

  const handleMarketplaceSelect = (name: string, newAdapter: MarketplaceAdapter) => {
    setAdapter(newAdapter);
    setMarketplaceSelection(name);
    flow.goToStep(2);
    const slug = name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    window.history.replaceState(null, "", `/anuncios/criar/${slug}`);
  };

  const handlePublish = async () => {
    if (!adapter || !organizationId) return;
    flow.setPublishing(true);
    flow.setErrorSteps([]);

    const draft = flow.buildDraft();
    const result = await adapter.publish(organizationId, draft);

    if (!result.success) {
      const step = result.errorStepId ?? flow.currentStep;
      flow.setErrorSteps([step]);
      flow.goToStep(step);
      toast({
        title: `Erro no passo ${step}`,
        description: result.errorMessage || "Verifique os campos e tente novamente.",
        variant: "destructive",
      });
    } else {
      toast({ title: "Anúncio publicado!", description: "Seu anúncio foi enviado com sucesso." });
      navigate("/anuncios/ativos");
    }
    flow.setPublishing(false);
  };

  const saveDraftAndExit = async () => {
    if (!organizationId || !marketplaceSelection) {
      allowNavRef.current = true;
      navigate("/anuncios");
      return;
    }
    try {
      const draftPayload: Record<string, unknown> = {
        organizations_id: organizationId,
        marketplace_name: marketplaceSelection,
        site_id: flow.siteId,
        title: flow.title,
        category_id: flow.categoryId,
        attributes: flow.attributes,
        variations: flow.variations,
        pictures: flow.pictures.filter((p) => typeof p === "string"),
        price: Number(flow.price) || 0,
        listing_type_id: flow.listingTypeId,
        shipping: flow.shipping,
        sale_terms: flow.saleTerms,
        description: flow.description,
        available_quantity: flow.availableQuantity,
        last_step: flow.currentStep,
        status: "draft",
      };
      if (flow.currentDraftId) {
        await (supabase as any)
          .from("marketplace_drafts")
          .update(draftPayload)
          .eq("id", flow.currentDraftId)
          .eq("organizations_id", organizationId);
      } else {
        await (supabase as any).from("marketplace_drafts").insert(draftPayload);
      }
      toast({ title: "Rascunho salvo", description: "Continue quando quiser." });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Falha ao salvar", description: msg, variant: "destructive" });
    }
    setConfirmExit(false);
    allowNavRef.current = true;
    navigate("/anuncios");
    setTimeout(() => {
      allowNavRef.current = false;
    }, 300);
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gray-50">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <GlobalHeader />
          <main className="flex-1 overflow-auto">
            <div className="relative p-6 max-w-6xl mx-auto">
              {flow.publishing && (
                <LoadingOverlay
                  messages={[
                    "Estamos publicando seu anúncio",
                    "Só um minutinho, estamos validando seu anúncio e checando erros",
                    "Em breve seu anúncio estará disponível",
                  ]}
                />
              )}

              <Dialog open={confirmExit} onOpenChange={setConfirmExit}>
                <DialogContent className="w-full max-w-lg md:max-w-xl">
                  <DialogHeader>
                    <DialogTitle>Fechar sem salvar?</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="text-sm text-gray-700">
                      Você perderá todos os dados se fechar agora. Deseja salvar um rascunho?
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          allowNavRef.current = true;
                          setConfirmExit(false);
                          navigate("/anuncios");
                          setTimeout(() => {
                            allowNavRef.current = false;
                          }, 300);
                        }}
                      >
                        Fechar sem salvar
                      </Button>
                      <Button
                        variant={flow.maxVisitedStep >= 4 ? "default" : "outline"}
                        className={
                          flow.maxVisitedStep >= 4
                            ? "rounded-2xl bg-novura-primary hover:bg-novura-primary/90"
                            : "border rounded-2xl"
                        }
                        disabled={flow.maxVisitedStep < 4}
                        onClick={saveDraftAndExit}
                      >
                        Salvar rascunho
                      </Button>
                      <Button
                        className="bg-novura-primary hover:bg-novura-primary/90 text-white"
                        onClick={() => setConfirmExit(false)}
                      >
                        Terminar o anúncio
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Criar um anúncio</h1>
                  <p className="text-gray-600">
                    {isShopeeMode ? "Modo Shopee" : "Modo Mercado Livre"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant={flow.maxVisitedStep >= 4 ? "default" : "outline"}
                    className={
                      flow.maxVisitedStep >= 4
                        ? "rounded-2xl bg-novura-primary hover:bg-novura-primary/90"
                        : "border-2 rounded-2xl"
                    }
                    disabled={flow.maxVisitedStep < 4}
                    onClick={saveDraftAndExit}
                  >
                    Salvar rascunho
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-gray-700"
                    onClick={() => (hasUnsavedData ? setConfirmExit(true) : navigate("/anuncios"))}
                  >
                    ✕
                  </Button>
                </div>
              </div>

              <CreateListingShell
                adapter={adapter}
                flow={flow}
                organizationId={organizationId || ""}
                marketplaceSelection={marketplaceSelection}
                onMarketplaceSelect={handleMarketplaceSelect}
                onPublish={handlePublish}
              />
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
