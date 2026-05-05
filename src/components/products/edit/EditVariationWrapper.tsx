// T06 — Full rewrite: fixes B2 (image_urls cleared), B3 (dimensions zeroed),
// B4 (products_stock not updated on save), and adds ProductImageUploader.
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { ProductFormData, ProductVariation, VariationType, VariationStep } from "@/types/products";

import { ProductForm } from "@/components/products/create/ProductForm";
import { VariationForm } from "@/components/products/create/VariationForm";
import { VariationDimensionsForm } from "@/components/products/create/VariationDimensionsForm";
import { VariationTaxForm } from "@/components/products/create/VariationTaxForm";
import { ProductImageUploader } from "@/components/products/ProductImageUploader";
import { ProductAdLinker } from "@/components/products/ProductAdLinker";

export function EditVariationWrapper() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { organizationId } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [variationEtapa, setVariationEtapa] = useState<VariationStep>("configuration");
  const [tiposVariacao, setTiposVariacao] = useState<VariationType[]>([]);
  const [variacoes, setVariacoes] = useState<ProductVariation[]>([]);

  const [formData, setFormData] = useState<ProductFormData>({
    type: "variation",
    name: "",
    sku: "",
    category: "",
    brand: "",
    description: "",
    costPrice: "",
    sellPrice: "",
    stock: "",
    warehouse: "",
    height: "",
    width: "",
    length: "",
    weight: "",
    unitType: "",
    barcode: "",
    ncm: "",
    cest: "",
    origin: "",
  });

  const fetchVariationProduct = async () => {
    if (!id) {
      toast({ title: "Erro", description: "ID do produto não encontrado", variant: "destructive" });
      navigate("/produtos");
      return;
    }

    try {
      setLoading(true);

      const { data: mainProduct, error: mainError } = await supabase
        .from('products')
        .select(`*, categories (id, name)`)
        .eq('id', id)
        .single();

      if (mainError || !mainProduct) {
        toast({ title: "Erro", description: "Produto não encontrado", variant: "destructive" });
        navigate("/produtos");
        return;
      }

      const { data: variations, error: variationsError } = await supabase
        .from('products')
        .select(`
          *,
          products_stock (
            id,
            current,
            reserved,
            in_transit,
            storage (id, name)
          )
        `)
        .eq('type', 'VARIACAO_ITEM')
        .eq('parent_id', mainProduct.id)
        .order('name', { ascending: true });

      if (variationsError) {
        console.error('Error fetching variations:', variationsError);
      }

      setFormData({
        type: "variation",
        name: mainProduct.name || "",
        sku: "",
        category: mainProduct.category_id || "",
        brand: "",
        description: mainProduct.description || "",
        costPrice: mainProduct.cost_price?.toString() || "",
        sellPrice: mainProduct.sell_price?.toString() || "",
        stock: "",
        warehouse: "",
        // B3 FIX: map all dimension and fiscal fields from DB
        height: mainProduct.package_height?.toString() || "",
        width: mainProduct.package_width?.toString() || "",
        length: mainProduct.package_length?.toString() || "",
        weight: mainProduct.weight?.toString() || "",
        unitType: mainProduct.weight_type || "",
        barcode: mainProduct.barcode?.toString() || "",
        ncm: mainProduct.ncm?.toString() || "",
        cest: mainProduct.cest?.toString() || "",
        origin: mainProduct.tax_origin_code?.toString() || "",
      });

      // B3 FIX: map ALL fields for each variation (not just name/sku/ean/costPrice)
      const transformedVariations: ProductVariation[] = (variations ?? []).map((v: any) => {
        // Extract stock info from first products_stock row
        const stockRow = Array.isArray(v.products_stock)
          ? v.products_stock[0]
          : v.products_stock;

        return {
          id: v.id,
          name: v.name || "",
          sku: v.sku || "",
          ean: v.barcode?.toString() || "",
          costPrice: v.cost_price?.toString() || "",
          images: [],     // images come from product_images table via ProductImageUploader
          color: v.color || "",
          size: v.size || "",
          voltage: (v.custom_attributes?.voltage) || "",
          customType: "",
          customValue: "",
          // B3 FIX: all physical + fiscal fields
          height: v.package_height?.toString() || "",
          width: v.package_width?.toString() || "",
          length: v.package_length?.toString() || "",
          weight: v.weight?.toString() || "",
          unit: v.weight_type || "",
          ncm: v.ncm?.toString() || "",
          cest: v.cest?.toString() || "",
          barcode: v.barcode?.toString() || "",
          origin: v.tax_origin_code?.toString() || "",
          // B4 FIX: expose stock info for editing
          stock: stockRow?.current?.toString() || "0",
          storage: stockRow?.storage?.id || "",
        };
      });

      setVariacoes(transformedVariations);
    } catch (err) {
      console.error('Error loading variation product:', err);
      toast({ title: "Erro", description: "Erro ao carregar produto", variant: "destructive" });
      navigate("/produtos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVariationProduct();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleInputChangePT = (field: string, value: string) => {
    const fieldMap: Record<string, string> = {
      nome: 'name', sku: 'sku', categoria: 'category', marca: 'brand',
      descricao: 'description', precoCusto: 'costPrice', precoVenda: 'sellPrice',
      estoque: 'stock', armazem: 'warehouse', altura: 'height', largura: 'width',
      comprimento: 'length', peso: 'weight', tipoUnidade: 'unitType',
      codigoBarras: 'barcode', ncm: 'ncm', cest: 'cest', origem: 'origin',
    };
    handleInputChange(fieldMap[field] || field, value);
  };

  const handleSalvar = async () => {
    if (!id) return;
    setSaving(true);
    try {
      // Update parent product
      const { error: mainError } = await supabase
        .from('products')
        .update({
          parent_id: null,
          name: formData.name,
          description: formData.description || null,
          cost_price: parseFloat(formData.costPrice) || 0,
          sell_price: formData.sellPrice ? parseFloat(formData.sellPrice) : null,
          category_id: formData.category || null,
          // B3 FIX: always send all fields with proper null-safety
          package_height: formData.height ? parseInt(formData.height) : null,
          package_width: formData.width ? parseInt(formData.width) : null,
          package_length: formData.length ? parseInt(formData.length) : null,
          weight: formData.weight ? parseFloat(formData.weight) : null,
          weight_type: formData.unitType || null,
          barcode: formData.barcode ? parseInt(formData.barcode) : null,
          ncm: formData.ncm ? parseInt(formData.ncm) : null,
          cest: formData.cest ? parseInt(formData.cest) : null,
          tax_origin_code: formData.origin ? parseInt(formData.origin) : null,
        })
        .eq('id', id);

      if (mainError) throw mainError;

      // Update each variation
      for (const variacao of variacoes) {
        // B2 FIX: do NOT touch image_urls — managed by product_images table
        const { error: varError } = await supabase
          .from('products')
          .update({
            name: variacao.name,
            sku: variacao.sku || null,
            cost_price: parseFloat(variacao.costPrice) || 0,
            barcode: variacao.ean ? parseInt(variacao.ean) : null,
            ncm: variacao.ncm ? parseInt(variacao.ncm) : null,
            cest: variacao.cest ? parseInt(variacao.cest) : null,
            tax_origin_code: variacao.origin ? parseInt(variacao.origin) : null,
            package_height: variacao.height ? parseInt(variacao.height) : null,
            package_width: variacao.width ? parseInt(variacao.width) : null,
            package_length: variacao.length ? parseInt(variacao.length) : null,
            weight: variacao.weight ? parseFloat(variacao.weight) : null,
            weight_type: variacao.unit || null,
            color: variacao.color || null,
            size: variacao.size || null,
            // B2 FIX: image_urls intentionally omitted — managed by product_images
          })
          .eq('id', variacao.id);

        if (varError) {
          console.error('Error updating variation:', variacao.id, varError);
        }

        // B4 FIX: upsert products_stock for each variation
        const storageId = variacao.storage;
        if (storageId) {
          const qty = parseInt(variacao.stock || "0") || 0;
          const { data: existingStock } = await supabase
            .from('products_stock')
            .select('id')
            .eq('product_id', variacao.id)
            .eq('storage_id', storageId)
            .maybeSingle();

          if (existingStock?.id) {
            await supabase
              .from('products_stock')
              .update({ current: qty })
              .eq('id', existingStock.id);
          } else {
            await supabase
              .from('products_stock')
              .insert({ product_id: variacao.id, storage_id: storageId, current: qty, reserved: 0, in_transit: 0 });
          }
        }
      }

      toast({ title: "Sucesso", description: "Produto com variações salvo com sucesso" });
    } catch (err) {
      console.error('Save error:', err);
      toast({ title: "Erro", description: "Erro ao salvar produto", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div><Skeleton className="h-8 w-64 mb-2" /><Skeleton className="h-4 w-32" /></div>
          <div className="flex items-center space-x-3">
            <Skeleton className="h-10 w-24" /><Skeleton className="h-10 w-40" />
          </div>
        </div>
        <Card><CardContent className="p-6">
          <div className="space-y-4">
            {[...Array(6)].map((_, i) => (<Skeleton key={i} className="h-12 w-full" />))}
          </div>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sticky header toolbar */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 -mx-4 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Editar Produto com Variações</h1>
          <p className="text-sm text-gray-500">{formData.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate("/produtos")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
          <Button
            onClick={handleSalvar}
            disabled={saving}
            className="bg-violet-700 hover:bg-violet-800 text-white"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Salvando...
              </span>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Salvar Alterações
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="space-y-4">
        {/* Images section for parent product */}
        {id && organizationId && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Imagens do Produto</CardTitle>
            </CardHeader>
            <CardContent>
              <ProductImageUploader
                productId={id}
                organizationId={organizationId}
              />
            </CardContent>
          </Card>
        )}

        {/* Accordion form */}
        <Card>
          <CardContent className="p-6">
            <Accordion type="multiple" defaultValue={["informacoes-basicas"]} className="w-full">

              {/* Basic info */}
              <AccordionItem value="informacoes-basicas">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-7 h-7 bg-violet-700 text-white rounded-full text-sm font-medium">1</span>
                    <span className="font-medium">Informações Básicas</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-4">
                  <ProductForm
                    formData={formData}
                    onInputChange={handleInputChangePT}
                    includeSku={false}
                  />
                </AccordionContent>
              </AccordionItem>

              {/* Variation configuration */}
              <AccordionItem value="variacoes">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-7 h-7 bg-violet-700 text-white rounded-full text-sm font-medium">2</span>
                    <span className="font-medium">Variações</span>
                    <span className="ml-2 text-sm text-gray-500">({variacoes.length})</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-4">
                  <VariationForm
                    variations={variacoes}
                    onVariationsChange={setVariacoes}
                    currentStep={variationEtapa}
                    onStepChange={setVariationEtapa}
                    variationTypes={tiposVariacao}
                    onVariationTypesChange={setTiposVariacao}
                    // B4 FIX: stock editing re-enabled in edit flow
                    disableStock={false}
                  />
                </AccordionContent>
              </AccordionItem>

              {/* Dimensions per variation */}
              <AccordionItem value="dimensoes">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-7 h-7 bg-violet-700 text-white rounded-full text-sm font-medium">3</span>
                    <span className="font-medium">Dimensões das Variações</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-4">
                  <VariationDimensionsForm
                    variations={variacoes}
                    onVariationsChange={setVariacoes}
                  />
                </AccordionContent>
              </AccordionItem>

              {/* Fiscal info per variation */}
              <AccordionItem value="fiscais">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-7 h-7 bg-violet-700 text-white rounded-full text-sm font-medium">4</span>
                    <span className="font-medium">Informações Fiscais</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-4">
                  <VariationTaxForm
                    variations={variacoes}
                    onVariationsChange={setVariacoes}
                  />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="vinculos">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-7 h-7 bg-violet-700 text-white rounded-full text-sm font-medium">5</span>
                    <span className="font-medium">Mapeamento de Anúncios</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-4">
                  <ProductAdLinker productId={id || null} />
                </AccordionContent>
              </AccordionItem>

            </Accordion>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
