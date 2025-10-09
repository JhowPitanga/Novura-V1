
import { ProductFormData, KitItem } from "@/types/products";

export function useKitFormConversion(formData: ProductFormData, kitItems: KitItem[]) {
  const formDataPT = {
    tipo: formData.type,
    nome: formData.name,
    sku: formData.sku,
    categoria: formData.category,
    marca: formData.brand,
    descricao: formData.description,
    precoCusto: formData.costPrice,
    precoVenda: formData.sellPrice,
    estoque: formData.stock,
    armazem: formData.warehouse,
    altura: formData.height,
    largura: formData.width,
    comprimento: formData.length,
    peso: formData.weight,
    tipoUnidade: formData.unitType,
    codigoBarras: formData.barcode,
    ncm: formData.ncm,
    cest: formData.cest,
    origem: formData.origin,
  };

  const kitItemsPT = kitItems.map(item => ({
    id: item.id,
    nome: item.name,
    sku: item.sku,
    tipo: item.type === "single" ? "unico" : "variacao",
    quantidade: item.quantity,
    imagem: item.image
  }));

  const handleInputChangePT = (field: string, value: string, onInputChange: (field: string, value: string) => void) => {
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
    onInputChange(englishField, value);
  };

  const handleKitItemsChange = (items: any[], setKitItems: (items: KitItem[]) => void) => {
    // Convert back to English format
    const englishItems: KitItem[] = items.map(item => ({
      id: item.id,
      name: item.nome || item.name,
      sku: item.sku,
      type: item.tipo === "unico" ? "single" : "variation",
      quantity: item.quantidade || item.quantity,
      image: item.imagem || item.image
    }));
    setKitItems(englishItems);
  };

  return {
    formDataPT,
    kitItemsPT,
    handleInputChangePT,
    handleKitItemsChange
  };
}
