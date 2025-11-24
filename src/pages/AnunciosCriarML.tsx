import { useEffect, useMemo, useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { StepIndicator } from "@/components/produtos/criar/StepIndicator";
import { NavigationButtons } from "@/components/produtos/criar/NavigationButtons";
import { CleanNavigation } from "@/components/CleanNavigation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

export default function AnunciosCriarML() {
  const { organizationId } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const maxSteps = 8;
  const [connectedApps, setConnectedApps] = useState<string[]>([]);
  const [marketplaceSelection, setMarketplaceSelection] = useState<string>("");
  const [siteId, setSiteId] = useState("MLB");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchByBarcode, setSearchByBarcode] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [currencyId, setCurrencyId] = useState("BRL");
  const [condition, setCondition] = useState("new");
  const [attributes, setAttributes] = useState<any[]>([]);
  const [pictures, setPictures] = useState<string[]>([]);
  const [variations, setVariations] = useState<any[]>([]);
  const [listingTypeId, setListingTypeId] = useState<string>("");
  const [price, setPrice] = useState<string>("");
  const [shipping, setShipping] = useState<any>({});
  const [saleTerms, setSaleTerms] = useState<any[]>([]);
  const [description, setDescription] = useState<string>("");
  const [attrsMeta, setAttrsMeta] = useState<any[]>([]);
  const [loadingAttrs, setLoadingAttrs] = useState(false);
  const [listingTypes, setListingTypes] = useState<any[]>([]);
  const [listingPriceOptions, setListingPriceOptions] = useState<any[]>([]);
  const [loadingListing, setLoadingListing] = useState(false);
  const [shippingModesAvailable, setShippingModesAvailable] = useState<string[]>([]);
  const steps = useMemo(() => ([
    { id: 1, title: "Marketplace", description: "Selecione onde publicar" },
    { id: 2, title: "Catálogo/Preditor", description: "Identifique produto e categoria" },
    { id: 3, title: "Categoria e Atributos", description: "Defina ficha técnica" },
    { id: 4, title: "Variações", description: "Configure combinações" },
    { id: 5, title: "Preço e Publicação", description: "Preço e tipo de anúncio" },
    { id: 6, title: "Envio", description: "Dimensões e logística" },
    { id: 7, title: "Descrição", description: "Texto do anúncio" },
    { id: 8, title: "Revisão", description: "Verifique e publique" },
  ]), []);

  useEffect(() => {
    const loadApps = async () => {
      if (!organizationId) return;
      const { data, error } = await (supabase as any)
        .from("marketplace_integrations")
        .select("marketplace_name")
        .eq("organizations_id", organizationId);
      if (error) return;
      const names = (data || []).map((r: any) => String(r?.marketplace_name || ""));
      const clean = Array.from(new Set(names.map((n) => n === "mercado_livre" ? "Mercado Livre" : n).filter(Boolean)));
      setConnectedApps(clean);
      if (!marketplaceSelection && clean.includes("Mercado Livre")) setMarketplaceSelection("Mercado Livre");
    };
    loadApps();
  }, [organizationId]);

  useEffect(() => {
    const fetchAttrs = async () => {
      if (!organizationId || !categoryId) return;
      setLoadingAttrs(true);
      try {
        const { data, error } = await (supabase as any).functions.invoke("mercado-livre-categories-attributes", {
          body: { organizationId, categoryId }
        });
        if (!error) setAttrsMeta(Array.isArray(data?.attributes) ? data.attributes : []);
      } finally {
        setLoadingAttrs(false);
      }
    };
    fetchAttrs();
  }, [organizationId, categoryId]);

  useEffect(() => {
    const fetchListingTypes = async () => {
      if (!organizationId || !categoryId) return;
      try {
        const { data, error } = await (supabase as any).functions.invoke("mercado-livre-available-listing-types", {
          body: { organizationId, categoryId }
        });
        if (!error) setListingTypes(Array.isArray(data?.types) ? data.types : []);
      } catch {}
    };
    fetchListingTypes();
  }, [organizationId, categoryId]);

  useEffect(() => {
    const fetchListingPrices = async () => {
      const p = Number(price);
      if (!organizationId || !categoryId || !siteId || !p) return;
      setLoadingListing(true);
      try {
        const { data, error } = await (supabase as any).functions.invoke("mercado-livre-listing-prices", {
          body: { organizationId, siteId, price: p, categoryId }
        });
        if (!error) setListingPriceOptions(Array.isArray(data?.prices) ? data.prices : []);
      } finally {
        setLoadingListing(false);
      }
    };
    fetchListingPrices();
  }, [organizationId, siteId, categoryId, price]);

  useEffect(() => {
    const fetchShippingModes = async () => {
      if (!organizationId || !siteId) return;
      if (currentStep < 6) return;
      try {
        const { data, error } = await (supabase as any).functions.invoke("mercado-livre-shipping-methods", {
          body: { organizationId, siteId }
        });
        if (error) return;
        const methods = Array.isArray(data?.methods) ? data.methods : [];
        const modesSet = new Set<string>();
        methods.forEach((m: any) => {
          const arr = Array.isArray(m?.shipping_modes) ? m.shipping_modes : [];
          arr.forEach((x: any) => modesSet.add(String(x)));
        });
        const modes = Array.from(modesSet);
        setShippingModesAvailable(modes);
        if (!shipping?.mode) {
          const preferred = modes.includes("me2") ? "me2" : (modes.includes("me1") ? "me1" : (modes[0] || ""));
          if (preferred) setShipping({ ...(shipping || {}), mode: preferred });
        }
      } catch {}
    };
    fetchShippingModes();
  }, [organizationId, siteId, currentStep]);

  const canProceed = () => {
    if (currentStep === 1) return !!marketplaceSelection;
    if (currentStep === 2) return true;
    if (currentStep === 3) return !!title && !!categoryId;
    if (currentStep === 5) return !!listingTypeId && (!!price || variations.some((v) => !!v?.price));
    if (currentStep === 7) return description.length > 0;
    return true;
  };

  const nextStep = () => { if (currentStep < maxSteps && canProceed()) setCurrentStep(currentStep + 1); };
  const backStep = () => { if (currentStep > 1) setCurrentStep(currentStep - 1); };

  const handlePublish = async () => {
    if (!organizationId) { toast({ title: "Sessão necessária", description: "Entre na sua conta.", variant: "destructive" }); return; }
    const payload: any = {
      site_id: siteId,
      title,
      category_id: categoryId,
      currency_id: currencyId,
      attributes: [ { id: "ITEM_CONDITION", value_name: condition } , ...attributes ],
      pictures: pictures.map((url) => ({ source: url })),
    };
    if (variations.length > 0) payload.variations = variations;
    if (price) payload.price = Number(price);
    if (listingTypeId) payload.listing_type_id = listingTypeId;
    if (shipping && Object.keys(shipping).length > 0) {
      const dimsObj = (shipping as any)?.dimensions || null;
      const w = dimsObj?.width || 0;
      const h = dimsObj?.height || 0;
      const l = dimsObj?.length || 0;
      const weight = (shipping as any)?.weight || 0;
      const dimsStr = l && h && w && weight ? `${l}x${h}x${w},${weight}` : undefined;
      const ship: any = {};
      if ((shipping as any)?.mode) ship.mode = (shipping as any).mode;
      if (typeof (shipping as any)?.local_pick_up !== "undefined") ship.local_pick_up = !!(shipping as any).local_pick_up;
      if (typeof (shipping as any)?.free_shipping !== "undefined") ship.free_shipping = !!(shipping as any).free_shipping;
      if (dimsStr) ship.dimensions = dimsStr;
      payload.shipping = ship;
    }
    if (saleTerms.length > 0) payload.sale_terms = saleTerms;
    const { data, error } = await (supabase as any).functions.invoke("mercado-livre-publish-item", {
      body: { organizationId, payload, description: { plain_text: description } }
    });
    if (error) { toast({ title: "Falha ao publicar", description: error.message || String(error), variant: "destructive" }); return; }
    toast({ title: "Anúncio publicado", description: `ID: ${data?.item_id || ""}` });
    navigate("/anuncios");
  };

  const runSearch = async () => {
    if (!organizationId) return;
    if (!searchTerm.trim()) return;
    setSearching(true);
    try {
      const { data, error } = await (supabase as any).functions.invoke("mercado-livre-products-search", {
        body: { organizationId, siteId, query: searchTerm.trim(), mode: searchByBarcode ? "barcode" : "title" }
      });
      if (error) {
        toast({ title: "Falha na busca", description: error.message || String(error), variant: "destructive" });
        return;
      }
      if (data && data.error) {
        toast({ title: "Busca não concluída", description: String(data.error), variant: "destructive" });
      }
      const items = Array.isArray(data?.results) ? data.results : [];
      setSearchResults(items);
    } finally {
      setSearching(false);
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gray-50">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <GlobalHeader />
          <main className="flex-1 overflow-auto">
            <div className="p-6 max-w-6xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Criar Anúncio</h1>
                  <p className="text-gray-600">Modo Mercado Livre</p>
                </div>
              </div>
              <StepIndicator steps={steps as any} currentStep={currentStep} />
              <Card className="mt-6 border border-gray-200 shadow-sm">
                <CardContent className="p-6 space-y-6">
                  {currentStep === 1 && (
                    <div className="space-y-4">
                      <div className="text-sm text-gray-700">Selecione um marketplace conectado</div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {connectedApps.map((name) => {
                          const selected = marketplaceSelection === name;
                          return (
                            <button
                              key={name}
                              className={`border rounded-lg px-4 py-3 text-left ${selected ? "border-novura-primary bg-purple-50" : "border-gray-200 bg-white"}`}
                              onClick={() => setMarketplaceSelection(name)}
                            >
                              <div className="font-medium text-gray-900">{name}</div>
                              <div className="text-xs text-gray-600">Conectado</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {currentStep === 2 && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center space-x-2">
                          <Checkbox checked={searchByBarcode} onCheckedChange={(v) => setSearchByBarcode(!!v)} />
                          <span className="text-sm text-gray-700">Buscar por Código de Barras</span>
                        </label>
                        <Select value={siteId} onValueChange={setSiteId}>
                          <SelectTrigger className="w-32"><SelectValue placeholder="Site" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="MLB">MLB</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="relative">
                        <Input
                          placeholder={searchByBarcode ? "Digite o código de barras" : "Digite o título/palavras‑chave"}
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
                          className="pl-10"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="absolute right-1 top-1/2 -translate-y-1/2"
                          onClick={runSearch}
                          disabled={searching}
                        >
                          Buscar
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {searchResults.length === 0 ? (
                          <div className="text-sm text-gray-600">Sem resultados</div>
                        ) : (
                          <div className="grid grid-cols-1 gap-2">
                            {searchResults.map((r: any) => {
                              const name = r?.name || r?.title || "Produto";
                              const cat = r?.category_id || r?.category?.id || "";
                              return (
                                <button
                                  key={String(r?.id || name)}
                                  className="border border-gray-200 rounded-lg px-4 py-3 text-left hover:border-novura-primary hover:bg-purple-50"
                                  onClick={() => { setCategoryId(String(cat || "")); setTitle(String(name || "")); }}
                                >
                                  <div className="font-medium text-gray-900">{name}</div>
                                  <div className="text-xs text-gray-600">Categoria: {cat || "—"}</div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {currentStep === 3 && (
                    <div className="space-y-4">
                      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" />
                      <Select value={condition} onValueChange={setCondition}>
                        <SelectTrigger><SelectValue placeholder="Condição" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">Novo</SelectItem>
                          <SelectItem value="used">Usado</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input placeholder="URLs de imagens (separadas por vírgula)" onChange={(e) => setPictures(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {attrsMeta.map((a: any) => {
                          const id = String(a?.id || "");
                          const name = String(a?.name || id || "Atributo");
                          const hasValues = Array.isArray(a?.values) && a.values.length > 0;
                          const current = (attributes || []).find((x: any) => String(x?.id) === id);
                          if (hasValues) {
                            return (
                              <Select key={id} value={String(current?.value_id || "")} onValueChange={(val) => {
                                const vname = a.values.find((v: any) => String(v?.id || "") === String(val))?.name || "";
                                const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                                setAttributes([ ...next, { id, name, value_id: val, value_name: vname } ]);
                              }}>
                                <SelectTrigger><SelectValue placeholder={name} /></SelectTrigger>
                                <SelectContent>
                                  {a.values.map((v: any) => (
                                    <SelectItem key={String(v?.id || v?.name || Math.random())} value={String(v?.id || "")}>{String(v?.name || v?.value || v?.id || "")}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            );
                          }
                          return (
                            <Input key={id} placeholder={name} value={String(current?.value_name || "")} onChange={(e) => {
                              const next = (attributes || []).filter((x: any) => String(x?.id) !== id);
                              setAttributes([ ...next, { id, name, value_name: e.target.value } ]);
                            }} />
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {currentStep === 4 && (
                    <div className="space-y-4">
                      <div className="text-sm text-gray-700">Configure variações (opcional)</div>
                      <Button variant="outline" onClick={() => setVariations([...(variations || []), { attribute_combinations: [], price: null, available_quantity: 0 }] )}>Adicionar variação</Button>
                    </div>
                  )}
                  {currentStep === 5 && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Preço" />
                        <Select value={listingTypeId} onValueChange={setListingTypeId}>
                          <SelectTrigger><SelectValue placeholder="Tipo de publicação" /></SelectTrigger>
                          <SelectContent>
                            {(listingTypes || []).map((t: any) => {
                              const id = String(t?.id || t);
                              const name = String(t?.name || t?.listing_type_name || id);
                              return <SelectItem key={id} value={id}>{name}</SelectItem>;
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(() => {
                          const sel = (listingPriceOptions || []).find((p: any) => String(p?.listing_type_id || "") === String(listingTypeId || ""));
                          if (!sel) return null;
                          const currency = String(sel?.currency_id || currencyId || "BRL");
                          const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency });
                          const commission = typeof sel?.sale_fee_amount === "number" ? sel.sale_fee_amount : (typeof sel?.selling_fee_amount === "number" ? sel.selling_fee_amount : (typeof sel?.sale_fee_details?.gross_amount === "number" ? sel.sale_fee_details.gross_amount : 0));
                          const listingFee = typeof sel?.listing_fee_amount === "number" ? sel.listing_fee_amount : (typeof sel?.listing_fee_details?.gross_amount === "number" ? sel.listing_fee_details.gross_amount : 0);
                          const total = Number(commission || 0) + Number(listingFee || 0);
                          return (
                            <div className="border rounded-lg p-4 bg-white">
                              <div className="text-sm text-gray-700">Custos estimados</div>
                              <div className="mt-2 text-sm text-gray-900">Comissão: {fmt.format(commission || 0)}</div>
                              <div className="mt-1 text-sm text-gray-900">Taxa de publicação: {fmt.format(listingFee || 0)}</div>
                              <div className="mt-2 font-semibold">Total: {fmt.format(total || 0)}</div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                  {currentStep === 6 && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Select value={String((shipping as any)?.mode || "")} onValueChange={(val) => setShipping({ ...(shipping || {}), mode: val })}>
                          <SelectTrigger><SelectValue placeholder="Modo de envio" /></SelectTrigger>
                          <SelectContent>
                            {(shippingModesAvailable || []).map((m) => (
                              <SelectItem key={m} value={m}>{m.toUpperCase()}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex items-center space-x-3">
                          <label className="flex items-center space-x-2">
                            <Checkbox checked={!!(shipping as any)?.free_shipping} onCheckedChange={(v) => setShipping({ ...(shipping || {}), free_shipping: !!v })} />
                            <span className="text-sm">Frete grátis</span>
                          </label>
                          <label className="flex items-center space-x-2">
                            <Checkbox checked={!!(shipping as any)?.local_pick_up} onCheckedChange={(v) => setShipping({ ...(shipping || {}), local_pick_up: !!v })} />
                            <span className="text-sm">Retirada local</span>
                          </label>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input placeholder="Peso (g)" onChange={(e) => setShipping({ ...(shipping || {}), weight: Number(e.target.value) })} />
                        <Input placeholder="Dimensões LxAxP (cm)" onChange={(e) => {
                          const parts = e.target.value.split("x").map((p) => Number(p.trim()));
                          setShipping({ ...(shipping || {}), dimensions: { length: parts[2] || 0, height: parts[1] || 0, width: parts[0] || 0 } });
                        }} />
                      </div>
                    </div>
                  )}
                  {currentStep === 7 && (
                    <div className="space-y-4">
                      <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição em texto plano" className="min-h-[160px]" />
                    </div>
                  )}
                  {currentStep === 8 && (
                    <div className="space-y-4">
                      <div className="text-sm text-gray-700">Revise os dados e publique</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input value={title} readOnly />
                        <Input value={categoryId} readOnly />
                        <Input value={listingTypeId} readOnly />
                        <Input value={price} readOnly />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
              <div className="mt-4">
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
                  onSave={() => {}}
                />
              </div>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}