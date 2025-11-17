
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ProductFormData, KitItem } from "@/types/products";

export function useKitData() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [kitEtapa, setKitEtapa] = useState<"info" | "produtos">("info");
  const [kitItems, setKitItems] = useState<KitItem[]>([]);
  
  const [formData, setFormData] = useState<ProductFormData>({
    type: "kit",
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

  const fetchKitProduct = async () => {
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
      // Fetch kit product
      const { data: kitProduct, error: kitError } = await supabase
        .from('products')
        .select(`
          *,
          categories (
            id,
            name
          ),
          products_stock (
            current,
            in_transit,
            reserved,
            storage (
              id,
              name
            )
          )
        `)
        .eq('id', id)
        .single();

      if (kitError) {
        console.error('Error fetching kit product:', kitError);
        toast({
          title: "Erro",
          description: "Produto não encontrado",
          variant: "destructive",
        });
        navigate("/produtos");
        return;
      }

      const { data: kitData, error: kitDataError } = await supabase
        .from('product_kits')
        .select(`
          id,
          product_kit_items (
            id,
            quantity,
            product_id,
            products (
              *
            )
          )
        `)
        .eq('product_id', kitProduct.id)
        .single();

      let kitMembers: any[] = [];
      if (!kitDataError && kitData) {
        kitMembers = kitData.product_kit_items || [];
      } else {
        const { data: fallbackItems } = await supabase
          .from('product_kit_items')
          .select(`
            id,
            quantity,
            product_id,
            products (
              *
            )
          `)
          .eq('kit_id', kitProduct.id);
        kitMembers = fallbackItems || [];
      }

      // Transform data to English format
      const transformedFormData: ProductFormData = {
        type: "kit",
        name: kitProduct.name,
        sku: kitProduct.sku,
        category: kitProduct.categories?.name || "",
        brand: "",
        description: kitProduct.description || "",
        costPrice: kitProduct.cost_price?.toString() || "",
        sellPrice: kitProduct.sell_price?.toString() || "",
        stock: kitProduct.products_stock?.current?.toString() || "",
        warehouse: kitProduct.products_stock?.[0]?.storage?.name || "Principal",
        height: kitProduct.package_height?.toString() || "",
        width: kitProduct.package_width?.toString() || "",
        length: kitProduct.package_length?.toString() || "",
        weight: kitProduct.weight?.toString() || "",
        unitType: kitProduct.weight_type || "",
        barcode: kitProduct.barcode?.toString() || "",
        ncm: kitProduct.ncm?.toString() || "",
        cest: kitProduct.cest?.toString() || "",
        origin: kitProduct.tax_origin_code?.toString() || "",
      };

      // Transform kit items
      const transformedKitItems: KitItem[] = kitMembers?.map((member: any) => ({
        id: member.products.id,
        name: member.products.name,
        sku: member.products.sku,
        quantity: member.quantity || 1,
        type: member.products.type === 'VARIACAO_ITEM' ? 'variation' : 'single'
      })) || [];

      setFormData(transformedFormData);
      setKitItems(transformedKitItems);
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
    fetchKitProduct();
  }, [id]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    try {
      // Update kit product
      const { error: kitError } = await supabase
        .from('products')
        .update({
          name: formData.name,
          sku: formData.sku,
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
          image_urls: [] // TODO: Handle image uploads
        })
        .eq('id', id);

      if (kitError) {
        console.error('Error updating kit product:', kitError);
        toast({
          title: "Erro",
          description: "Erro ao salvar produto",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Sucesso",
        description: "Kit atualizado com sucesso",
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

  return {
    loading,
    formData,
    handleInputChange,
    handleSave,
    selectedImages,
    setSelectedImages,
    kitEtapa,
    setKitEtapa,
    kitItems,
    setKitItems,
    navigate
  };
}
