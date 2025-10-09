import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductFormData, ProductVariation, VariationType, VariationStep } from "@/types/products";

// Import form components
import { ProductForm } from "@/components/produtos/criar/ProductForm";
import { VariationForm } from "@/components/products/create/VariationForm";
import { VariationDimensionsForm } from "@/components/products/create/VariationDimensionsForm";
import { VariationTaxForm } from "@/components/products/create/VariationTaxForm";

export function EditVariationWrapper() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
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
      toast({
        title: "Erro",
        description: "ID do produto não encontrado",
        variant: "destructive",
      });
      navigate("/produtos");
      return;
    }

    try {
      setLoading(true);
      // Fetch main product
      const { data: mainProduct, error: mainError } = await supabase
        .from('products')
        .select(`
          *,
          categories (
            id,
            name
          )
        `)
        .eq('id', id)
        .single();

      if (mainError) {
        console.error('Error fetching main product:', mainError);
        toast({
          title: "Erro",
          description: "Produto não encontrado",
          variant: "destructive",
        });
        navigate("/produtos");
        return;
      }

      // Fetch variations (products with same group ID)
      const { data: variations, error: variationsError } = await supabase
        .from('product_group_members')
        .select(`
          product_id,
          products (
            *,
            products_stock (
              current,
              in_transit,
              reserved,
              storage (
                id,
                name
              )
            )
          )
        `)
        .eq('product_group_id', mainProduct.id);

      if (variationsError) {
        console.error('Error fetching variations:', variationsError);
      }

      // Transform data to English format
      const transformedFormData: ProductFormData = {
        type: "variation",
        name: mainProduct.name,
        sku: "", // Not applicable for variation groups
        category: mainProduct.categories?.name || "",
        brand: "",
        description: mainProduct.description || "",
        costPrice: mainProduct.cost_price?.toString() || "",
        sellPrice: mainProduct.sell_price?.toString() || "",
        stock: "",
        warehouse: "",
        height: mainProduct.package_height?.toString() || "",
        width: mainProduct.package_width?.toString() || "",
        length: mainProduct.package_length?.toString() || "",
        weight: mainProduct.weight?.toString() || "",
        unitType: mainProduct.weight_type || "",
        barcode: mainProduct.barcode?.toString() || "",
        ncm: mainProduct.ncm?.toString() || "",
        cest: mainProduct.cest?.toString() || "",
        origin: mainProduct.tax_origin_code?.toString() || "",
      };

      // Transform variations to English format
      const transformedVariations: ProductVariation[] = variations?.map((v: any) => ({
        id: v.products.id,
        name: v.products.name,
        sku: v.products.sku,
        ean: v.products.barcode?.toString() || "",
        costPrice: v.products.cost_price?.toString() || "",
        images: [], // Initialize as empty File array - existing images would need to be converted
        color: v.products.color || "",
        size: v.products.size || "",
        voltage: "",
        customType: "",
        customValue: "",
        height: "",
        width: "",
        length: "",
        weight: "",
        ncm: "",
        cest: "",
        barcode: "",
        unit: "",
        origin: "",
      })) || [];

      setFormData(transformedFormData);
      setVariacoes(transformedVariations);
    } catch (err) {
      console.error('Error:', err);
      toast({
        title: "Erro",
        description: "Erro ao carregar produto",
        variant: "destructive",
      });
      navigate("/produtos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVariationProduct();
  }, [id]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleVoltar = () => {
    navigate("/produtos");
  };

  const handleSalvar = async () => {
    try {
      // Update main product
      const { error: mainError } = await supabase
        .from('products')
        .update({
          name: formData.name,
          description: formData.description,
          cost_price: parseFloat(formData.costPrice) || 0,
          sell_price: formData.sellPrice ? parseFloat(formData.sellPrice) : null,
          package_height: parseInt(formData.height) || 0,
          package_width: parseInt(formData.width) || 0,
          package_length: parseInt(formData.length) || 0,
          weight: formData.weight ? parseFloat(formData.weight) : null,
          weight_type: formData.unitType || null,
          barcode: parseInt(formData.barcode) || 0,
          ncm: parseInt(formData.ncm) || 0,
          cest: formData.cest ? parseInt(formData.cest) : null,
          tax_origin_code: parseInt(formData.origin) || 0,
        })
        .eq('id', id);

      if (mainError) {
        console.error('Error updating main product:', mainError);
        toast({
          title: "Erro",
          description: "Erro ao salvar produto principal",
          variant: "destructive",
        });
        return;
      }

      // Update variations
      for (const variacao of variacoes) {
        const { error: varError } = await supabase
          .from('products')
          .update({
            name: variacao.name,
            sku: variacao.sku,
            cost_price: parseFloat(variacao.costPrice) || 0,
            barcode: parseInt(variacao.ean) || 0,
            ncm: parseInt(variacao.ncm) || 0,
            tax_origin_code: parseInt(variacao.origin) || 0,
            color: variacao.color || null,
            size: variacao.size || null,
            image_urls: [] // TODO: Handle File[] to string[] conversion for image uploads
          })
          .eq('id', variacao.id);

        if (varError) {
          console.error('Error updating variation:', varError);
        }
      }

      toast({
        title: "Sucesso",
        description: "Produto com variações atualizado com sucesso",
      });
    } catch (err) {
      console.error('Error:', err);
      toast({
        title: "Erro",
        description: "Erro ao salvar produto",
        variant: "destructive",
      });
    }
  };

  const handleInputChangePT = (field: string, value: string) => {
    // Convert Portuguese field names to English
    const fieldMap: Record<string, string> = {
      nome: 'name',
      sku: 'sku',
      categoria: 'category',
      marca: 'brand',
      descricao: 'description',
      precoCusto: 'costPrice',
      precoVenda: 'sellPrice',
      estoque: 'stock',
      armazem: 'warehouse',
      altura: 'height',
      largura: 'width',
      comprimento: 'length',
      peso: 'weight',
      tipoUnidade: 'unitType',
      codigoBarras: 'barcode',
      ncm: 'ncm',
      cest: 'cest',
      origem: 'origin',
    };
    const englishField = fieldMap[field] || field;
    handleInputChange(englishField, value);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="flex items-center space-x-3">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-40" />
          </div>
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Editar Produto com Variações</h1>
          <p className="text-gray-600">{formData.name}</p>
        </div>
        <div className="flex items-center space-x-3">
          <Button variant="outline" onClick={handleVoltar}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
          <Button onClick={handleSalvar} className="bg-novura-primary hover:bg-novura-primary/90">
            <Save className="w-4 h-4 mr-2" />
            Salvar Alterações
          </Button>
        </div>
      </div>

      {/* Accordion Form */}
      <Card>
        <CardContent className="p-6">
          <Accordion type="single" collapsible defaultValue="informacoes-basicas" className="w-full">
            {/* Step 1 - Basic Information */}
            <AccordionItem value="informacoes-basicas">
              <AccordionTrigger>
                <div className="flex items-center space-x-2">
                  <span className="flex items-center justify-center w-8 h-8 bg-novura-primary text-white rounded-full text-sm font-medium">1</span>
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

            {/* Step 2 - Variation Configuration */}
            <AccordionItem value="variacoes">
              <AccordionTrigger>
                <div className="flex items-center space-x-2">
                  <span className="flex items-center justify-center w-8 h-8 bg-novura-primary text-white rounded-full text-sm font-medium">2</span>
                  <span className="font-medium">Configuração de Variações</span>
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
                  disableStock
                />
              </AccordionContent>
            </AccordionItem>

            {/* Step 3 - Dimensions */}
            <AccordionItem value="dimensoes">
              <AccordionTrigger>
                <div className="flex items-center space-x-2">
                  <span className="flex items-center justify-center w-8 h-8 bg-novura-primary text-white rounded-full text-sm font-medium">3</span>
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

            {/* Step 4 - Tax Information */}
            <AccordionItem value="fiscais">
              <AccordionTrigger>
                <div className="flex items-center space-x-2">
                  <span className="flex items-center justify-center w-8 h-8 bg-novura-primary text-white rounded-full text-sm font-medium">4</span>
                  <span className="font-medium">Informações Fiscais das Variações</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-4">
                <VariationTaxForm 
                  variations={variacoes} 
                  onVariationsChange={setVariacoes} 
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
