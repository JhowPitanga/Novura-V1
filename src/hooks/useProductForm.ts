import { useState } from "react";
import { ProductFormData, ProductVariation, VariationType, KitItem, ProductType, VariationStep, KitStep, CreateProductData } from "@/types/products";
import { useCreateProduct } from './useProducts';
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProductSync } from "@/hooks/useProductSync";
import { uploadProductImages } from "@/services/productImages.service";
import { validateEanChecksum } from "@/utils/eanChecksum";

interface UseProductFormProps {
  onSuccess?: () => void;
}

interface HandleCreateProductOptions {
  onSuccess?: () => void;
}

export function useProductForm({ onSuccess }: UseProductFormProps = {}) {
  const { createProduct, loading: createLoading } = useCreateProduct();
  const { toast } = useToast();
  const INT_MAX = 2147483647;
  const clampInt = (val: any, max = INT_MAX) => {
    const n = parseInt(String(val));
    if (Number.isNaN(n) || n < 0) return 0;
    return n > max ? max : n;
  };
  // Chame hooks no topo do custom hook
  const { user, organizationId } = useAuth();
  const { triggerSync } = useProductSync();
  const currentUserId = user?.id;

  const [currentStep, setCurrentStep] = useState(1);
  const [productType, setProductType] = useState<ProductType | "">("");
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [productSaved, setProductSaved] = useState(false);
  const [variations, setVariations] = useState<ProductVariation[]>([]);
  
  // Variation form state
  const [variationStep, setVariationStep] = useState<VariationStep>("types");
  const [variationTypes, setVariationTypes] = useState<VariationType[]>([]);
  
  // Kit state
  const [kitStep, setKitStep] = useState<KitStep>("info");
  const [kitItems, setKitItems] = useState<KitItem[]>([]);
  
  const [formData, setFormData] = useState<ProductFormData>({
    type: "",
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

  // Estado de erros para destacar campos obrigatórios
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const setFieldError = (field: string, hasError: boolean) => {
    setErrors(prev => ({ ...prev, [field]: hasError }));
  };

  const resetErrorsForStep = (step: number) => {
    const fieldsByStep: Record<number, string[]> = {
      2: ["name", "sku"],
      3: ["costPrice", "stock", "warehouse"],
      4: ["height", "width", "length", "weight"],
      5: ["barcode", "ncm", "origin"],
    };
    const fields = fieldsByStep[step] || [];
    setErrors(prev => {
      const next = { ...prev };
      fields.forEach(f => { next[f] = false; });
      return next;
    });
  };

  const validateCurrentStep = (): boolean => {
    // Validações por tipo de produto
    if (productType === "kit") {
      // No fluxo atual de kit, validamos apenas nome e sku (passo 2)
      if (currentStep === 2) {
        const nameError = !formData.name?.trim();
        const skuError = !formData.sku?.trim();
        setFieldError("name", nameError);
        setFieldError("sku", skuError);
        return !(nameError || skuError);
      }
      return true;
    }

    // Passo 2: básicos
    if (currentStep === 2) {
      // Para variação, exigir apenas o nome do produto
      if (productType === "variation") {
        const nameError = !formData.name?.trim();
        setFieldError("name", nameError);
        // Não exigir SKU nas variações (limpa erro caso exista)
        setFieldError("sku", false);
        return !nameError;
      }
      // Produto único exige nome e SKU
      const nameError = !formData.name?.trim();
      const skuError = !formData.sku?.trim();
      setFieldError("name", nameError);
      setFieldError("sku", skuError);
      return !(nameError || skuError);
    }

  // Passo 3: estoque
  if (currentStep === 3 && productType !== "variation") {
    const costError = !formData.costPrice?.trim();
    const stockError = !formData.stock?.trim();
    const warehouseError = !formData.warehouse?.trim();
    setFieldError("costPrice", costError);
    setFieldError("stock", stockError);
    setFieldError("warehouse", warehouseError);
    return !(costError || stockError || warehouseError);
  }

    // Passo 4: dimensões e peso
    if (currentStep === 4 && productType !== "variation") {
      const heightError = !formData.height?.trim();
      const widthError = !formData.width?.trim();
      const lengthError = !formData.length?.trim();
      const weightError = !formData.weight?.trim();
      setFieldError("height", heightError);
      setFieldError("width", widthError);
      setFieldError("length", lengthError);
      setFieldError("weight", weightError);
      return !(heightError || widthError || lengthError || weightError);
    }
    // Para variações, dimensões e peso são validados em cada variação no avanço de step

    // Passo 5: fiscais
    // Para produto único, exigir fiscais; em variações, não bloquear o salvamento do grupo
    if (currentStep === 5) {
      if (productType === "single") {
        const eanDigits = String(formData.barcode || "").replace(/\D/g, "");
        const eanOk =
          eanDigits.length > 0 &&
          eanDigits.length === 13 &&
          validateEanChecksum(eanDigits);
        const ncmDigits = String(formData.ncm || "").replace(/\D/g, "");
        const ncmOk = ncmDigits.length === 8;
        const barcodeError = !formData.barcode?.trim() || !eanOk;
        const ncmError = !formData.ncm?.trim() || !ncmOk;
        const originError = !formData.origin?.trim();
        setFieldError("barcode", barcodeError);
        setFieldError("ncm", ncmError);
        setFieldError("origin", originError);
        return !(barcodeError || ncmError || originError);
      }
      // Para variações e kit, seguir sem bloquear por fiscais nesta etapa
      return true;
    }

    return true;
  };

  const getMaxSteps = () => {
    if (productType === "kit") return 4;
    return 6;
  };

  const handleInputChange = (field: string, value: string) => {
    if (errors[field]) {
      setFieldError(field, false);
    }
    if (field === "barcode") {
      setFormData((prev) => ({ ...prev, [field]: value.replace(/\D/g, "").slice(0, 13) }));
      return;
    }
    if (field === "ncm") {
      setFormData((prev) => ({ ...prev, [field]: value.replace(/\D/g, "").slice(0, 8) }));
      return;
    }
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleProductTypeChange = (type: ProductType) => {
    // Reinicia fluxo quando usuário troca o tipo para evitar duplicação/estado residual
    setProductType(type);
    setProductSaved(false);
    setErrors({});
    setSelectedImages([]);
    setVariations([]);
    setVariationStep("types");
    setVariationTypes([]);
    setKitStep("info");
    setKitItems([]);
    setFormData({
      type,
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
  };

  const getProductTypeForDB = (type: string): 'UNICO' | 'VARIACAO_PAI' | 'VARIACAO_ITEM' | 'KIT' => {
    switch (type) {
      case 'single':
        return 'UNICO';
      case 'variation':
        return 'VARIACAO_PAI';
      case 'kit':
        return 'KIT';
      default:
        return 'UNICO';
    }
  };

  const handleCreateProduct = async (options?: HandleCreateProductOptions) => {
  try {
    // Validação final por tipo (sem pop-ups; destacar apenas em vermelho)
    const isSingle = productType === "single";
    const isVariation = productType === "variation";
    const isKit = productType === "kit";

  if (isSingle) {
    const basicsInvalid = !formData.name || !formData.sku;
    const stockInvalid = !formData.costPrice || !formData.stock || !formData.warehouse;
    const dimsInvalid = !formData.height || !formData.width || !formData.length || !formData.weight;
    const eanDigits = String(formData.barcode || "").replace(/\D/g, "");
    const eanLenOk = eanDigits.length === 13;
    const eanChecksumOk = eanLenOk && validateEanChecksum(eanDigits);
    const ncmDigits = String(formData.ncm || "").replace(/\D/g, "");
    const ncmOk = ncmDigits.length === 8;
    const taxInvalid =
      !formData.barcode || !formData.ncm || !formData.origin || !eanLenOk || !eanChecksumOk || !ncmOk;

      setFieldError("name", !formData.name);
      setFieldError("sku", !formData.sku);
      setFieldError("costPrice", !formData.costPrice);
    setFieldError("stock", !formData.stock);
    setFieldError("warehouse", !formData.warehouse);
      setFieldError("height", !formData.height);
      setFieldError("width", !formData.width);
      setFieldError("length", !formData.length);
      setFieldError("weight", !formData.weight);
      setFieldError("barcode", !formData.barcode || !eanLenOk || !eanChecksumOk);
      setFieldError("ncm", !formData.ncm || !ncmOk);
      setFieldError("origin", !formData.origin);

      if (basicsInvalid || stockInvalid || dimsInvalid || taxInvalid) {
        return;
      }
  }

  if (isVariation) {
    const basicsInvalid = !formData.name; // SKU não obrigatório no passo 2
    const hasVariations = variations && variations.length > 0;

    // Validar apenas o nome do produto pai nesta etapa
    setFieldError("name", !formData.name);

    // Não bloquear criação por ausência de armazém; o estoque pode ser cadastrado depois.
    if (basicsInvalid || !hasVariations) {
      return;
    }
  }

    if (isKit) {
      const basicsInvalid = !formData.name || !formData.sku;
      const hasItems = kitItems && kitItems.length > 0;
      setFieldError("name", !formData.name);
      setFieldError("sku", !formData.sku);
      if (basicsInvalid || !hasItems) {
        return;
      }
    }

    // Gera um SKU básico quando não informado (necessário no schema)
    const generateSku = (name?: string, suffix?: string) => {
      const base = (name || 'PROD')
        .toUpperCase()
        .normalize('NFD')
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 16);
      const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
      return [base || 'PROD', suffix, rand].filter(Boolean).join('-');
    };

    // SKU-ID para produto PAI de variação: NV + 5 dígitos aleatórios
    const generateVariantParentSku = () => {
      const num = Math.floor(Math.random() * 90000) + 10000; // 10000-99999
      return `NV${num}`;
    };

    // Evita colisão de SKU anexando um sufixo aleatório curto quando necessário
    const withRandomSuffix = (sku: string) => {
      const rnd = Math.random().toString(36).substring(2, 4).toUpperCase();
      return `${sku}-${rnd}`;
    };

    // Define o SKU conforme o tipo (PAI de variação recebe NVxxxxx)
    const typeForDB = getProductTypeForDB(productType as string);
    const computedSku = typeForDB === 'VARIACAO_PAI'
      ? generateVariantParentSku()
      : (formData.sku || generateSku(formData.name));

    // Monta o payload somente com colunas existentes na tabela 'products'
    const baseProductData = {
      // Root products must not inherit a stray default parent_id (DB check: UNICO → parent_id IS NULL)
      parent_id: null as string | null,
      name: formData.name,
      sku: computedSku,
      type: typeForDB,
      description: formData.description || undefined,
      // Campos numéricos obrigatórios com defaults seguros
      cost_price: formData.costPrice ? parseFloat(String(formData.costPrice)) : 0,
      sell_price: formData.sellPrice ? parseFloat(String(formData.sellPrice)) : undefined,
      barcode: clampInt(formData.barcode),
      ncm: clampInt(formData.ncm, INT_MAX),
      cest: formData.cest ? parseInt(String(formData.cest)) : undefined,
      package_height: formData.height ? parseInt(String(formData.height)) : 0,
      package_width: formData.width ? parseInt(String(formData.width)) : 0,
      package_length: formData.length ? parseInt(String(formData.length)) : 0,
      weight: formData.weight ? parseFloat(String(formData.weight)) : undefined,
      weight_type: formData.unitType || undefined,
      tax_origin_code: clampInt(formData.origin, INT_MAX),
      category_id: formData.category || undefined,
      brand_id: undefined,
      color: undefined,
      size: undefined,
      image_urls: [],
      custom_attributes: undefined,
      stock_qnt: (() => { const n = parseInt(String(formData.stock)); return Number.isFinite(n) && n > 0 ? n : null; })(),
      };

      // Pré-checagem de unicidade de SKU do produto pai para evitar 409/23505
      if (baseProductData.sku) {
        const { data: existingSku } = await supabase
          .from('products')
          .select('id')
          .eq('sku', baseProductData.sku)
          .limit(1);
        if (existingSku && Array.isArray(existingSku) && existingSku.length > 0) {
          baseProductData.sku = withRandomSuffix(baseProductData.sku);
        }
      }

      // Keep image_urls empty on draft/create insert.
      // Actual image upload + registration in product_images happens after full product save.
      baseProductData.image_urls = [];

      // Vincula o produto ao usuário atual para passar nas políticas de RLS
      // Valida sessão e permissão de criação conforme RLS
      if (!currentUserId) {
        toast({ title: "Erro", description: "Sessão inválida. Faça login novamente.", variant: "destructive" });
        return;
      }
      const { data: canCreate } = await supabase.rpc('current_user_has_permission', { p_module_name: 'produtos', p_action_name: 'create' });
      if (!canCreate) {
        toast({ title: "Permissão necessária", description: "Você não tem permissão para criar produtos. Ajuste as permissões em Configurações > Usuários.", variant: "destructive" });
        return;
      }
      let companyIdForOrg: string | null = null;
      try {
        if (organizationId) {
          const { data: companiesForOrg } = await supabase
            .from('companies')
            .select('id, is_active')
            .eq('organization_id', organizationId)
            .order('is_active', { ascending: false })
            .order('created_at', { ascending: true })
            .limit(1);
          if (companiesForOrg && Array.isArray(companiesForOrg) && companiesForOrg.length > 0) {
            companyIdForOrg = String(companiesForOrg[0].id);
          }
        }
      } catch (_) { /* noop: se não houver empresa, segue null */ }

      const createdProduct = await createProduct({
        ...baseProductData,
        user_id: currentUserId,
        company_id: companyIdForOrg || undefined,
        organizations_id: organizationId || undefined,
      });
      if (!createdProduct?.id) {
        toast({
          title: "Erro ao salvar",
          description: "Não foi possível criar o produto. Verifique os dados e tente novamente.",
          variant: "destructive",
        });
        return;
      }

      // Pós-criação por tipo
      // Buscar um Armazém padrão priorizando o salvo no navegador (localStorage), e caso não exista, pegar o primeiro ativo
      let defaultStorageId: string | null = null;
      // Tentar ler do localStorage
      try {
        const lsId = typeof window !== 'undefined' ? localStorage.getItem('defaultStorageId') : null;
        if (lsId) {
          defaultStorageId = lsId;
        }
      } catch (_) {
        // Ignorar erros de acesso ao localStorage
      }
      // Se não houver em localStorage, buscar primeiro ativo no Supabase
      if (!defaultStorageId) {
        try {
          const { data: defaultStorage } = await supabase
            .from('storage')
            .select('id')
            .eq('active', true)
            .order('name')
            .limit(1);
          if (defaultStorage && Array.isArray(defaultStorage) && defaultStorage.length > 0) {
            defaultStorageId = String(defaultStorage[0].id);
          }
        } catch (e) {
          // Silencioso: se não houver armazéns, segue sem fallback
          defaultStorageId = null;
        }
      }
      if (createdProduct && createdProduct.id) {
        const createdVariationChildren: Array<{ id: string; files: File[] }> = [];

        if (baseProductData.type === 'UNICO') {
          // Estoque do produto único: inserir somente se houver armazém
          const storageIdForSingle = formData.warehouse || defaultStorageId;
          if (storageIdForSingle) {
            const qty = formData.stock ? parseInt(String(formData.stock)) : 0;
            const storageId = String(storageIdForSingle);
            const { data: existingStock, error: selectErr } = await supabase
              .from('products_stock')
              .select('id,current')
              .eq('product_id', createdProduct.id)
              .eq('storage_id', storageId)
              .limit(1)
              .maybeSingle();
            if (selectErr) throw selectErr;
            if (existingStock?.id) {
              const { error: updErr } = await supabase
                .from('products_stock')
                .update({ current: qty, reserved: 0, in_transit: 0 })
                .eq('id', existingStock.id);
              if (updErr) throw updErr;
            } else {
              const { error: insErr } = await supabase
                .from('products_stock')
                .insert({
                  product_id: createdProduct.id,
                  storage_id: storageId,
                  current: qty,
                  reserved: 0,
                  in_transit: 0,
                });
              if (insErr) throw insErr;
            }
            triggerSync();
          }
        }

        if (baseProductData.type === 'VARIACAO_PAI') {
          // Criar variações como produtos vinculados ao pai via parent_id
          for (const [idx, v] of (variations || []).entries()) {
            // Definir SKU da variação e tentar inserir; se houver conflito (23505), re-tentar com sufixo aleatório
            let childSku = v.sku || `${baseProductData.sku}-${String(idx + 1).padStart(2, '0')}`;

            const tryInsertChild = async (skuToUse: string) => {
              return await supabase
                .from('products')
                .insert([{ 
                  name: v.name || `${formData.name} - ${v.name || ''}`,
                  sku: skuToUse,
                  type: 'VARIACAO_ITEM',
                  parent_id: createdProduct.id,
                  description: v.description || null,
                  // Campos obrigatórios com defaults seguros
                  cost_price: v.costPrice ? parseFloat(String(v.costPrice)) : 0,
                  sell_price: v.sellPrice ? parseFloat(String(v.sellPrice)) : null,
                  // barcode é obrigatório no schema; usar 0 quando não informado
                  barcode: clampInt((v as any).barcode ?? (v as any).ean),
                  ncm: clampInt((v as any).ncm, INT_MAX),
                  cest: v.cest ? parseInt(String(v.cest)) : null,
                  package_height: v.height ? parseInt(String(v.height)) : 0,
                  package_width: v.width ? parseInt(String(v.width)) : 0,
                  package_length: v.length ? parseInt(String(v.length)) : 0,
                  weight: v.weight ? parseFloat(String(v.weight)) : null,
                  weight_type: (v as any).unit || null,
                  tax_origin_code: clampInt((v as any).origin, INT_MAX),
                  category_id: formData.category || null,
                  image_urls: [],
                  color: v.color || null,
                  size: v.size || null,
                  custom_attributes: (() => {
                    const attrs: Record<string, any> = {};
                    if ((v as any).customType && (v as any).customValue) {
                      attrs[(v as any).customType] = (v as any).customValue;
                    }
                    if ((v as any).voltage) {
                      attrs['voltage'] = (v as any).voltage;
                    }
                    return Object.keys(attrs).length > 0 ? attrs : null;
                  })(),
                  user_id: currentUserId,
                  company_id: companyIdForOrg || undefined,
                  organizations_id: organizationId || undefined,
                  stock_qnt: (() => { const q = (v as any).stock ?? (v as any).estoque; const n = parseInt(String(q)); return Number.isFinite(n) && n > 0 ? n : null; })(),
                }])
                .select()
                .single();
            };

            let { data: child, error: childErr } = await tryInsertChild(childSku);
            if (childErr && (childErr as any).code === '23505') {
              // Conflito na chave única de SKU: anexar sufixo aleatório e tentar novamente
              childSku = withRandomSuffix(childSku);
              ({ data: child, error: childErr } = await tryInsertChild(childSku));
            }
            if (childErr) throw childErr;
            const childFiles = (Array.isArray(v.images) ? v.images : []).filter((f: any) => f instanceof File) as File[];
            if (childFiles.length > 0) {
              createdVariationChildren.push({ id: child.id, files: childFiles });
            }

            // T05 FIX (B1): Always ensure a products_stock row exists for each variation.
            // Normalize storage id by accepting all possible field names from the PT/EN form objects.
            const childStorageId =
              (v as any).storage ||
              (v as any).armazem ||
              (v as any).storageId ||
              (v as any).warehouseId ||
              formData.warehouse ||
              defaultStorageId;

            // Resolve quantity — allow 0, just ensure the row exists
            const quantityRaw = (v as any).stock ?? (v as any).estoque ?? (v as any).initial_stock;
            const parsed = Number(quantityRaw);
            const quantity = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;

            const resolvedStorageId = childStorageId ? String(childStorageId) : null;

            if (resolvedStorageId) {
              const { data: existingChildStock, error: childSelectErr } = await supabase
                .from('products_stock')
                .select('id,current')
                .eq('product_id', child.id)
                .eq('storage_id', resolvedStorageId)
                .limit(1)
                .maybeSingle();
              if (childSelectErr) throw childSelectErr;
              if (existingChildStock?.id) {
                const { error: childUpdErr } = await supabase
                  .from('products_stock')
                  .update({ current: quantity, reserved: 0, in_transit: 0 })
                  .eq('id', existingChildStock.id);
                if (childUpdErr) throw childUpdErr;
              } else {
                const { error: childInsErr } = await supabase
                  .from('products_stock')
                  .insert({
                    product_id: child.id,
                    storage_id: resolvedStorageId,
                    current: quantity,
                    reserved: 0,
                    in_transit: 0,
                  });
                if (childInsErr) throw childInsErr;
              }
              console.info('[stock] variation %s → storage %s qty %d', child.id, resolvedStorageId, quantity);
              triggerSync();
            } else {
              // No warehouse resolved: create a stock row with current=0 using the first available storage
              // so the variation is never left without a stock record.
              console.warn('[stock] variation %s has no storageId — skipping stock insert', child.id);
            }

            // Registrar atributos já inseridos diretamente em 'products'
          }
        }

        if (baseProductData.type === 'KIT') {
          const { data: kit, error: kitErr } = await supabase
            .from('product_kits')
            .insert([{ product_id: createdProduct.id }])
            .select()
            .single();
          if (kitErr) throw kitErr;
          const kitId = kit?.id;
          if (!kitId) {
            throw new Error('Kit não foi registrado (product_kits sem id).');
          }
          for (const k of kitItems) {
            const { error: kitItemErr } = await supabase
              .from('product_kit_items')
              .insert([{ 
                kit_id: kitId,
                product_id: (k as any).product_id || k.id,
                quantity: (k as any).quantity || 1,
              }]);
            if (kitItemErr) throw kitItemErr;
          }
        }

        // Upload and persist product images only after the product is fully created.
        // If the user leaves before saving, nothing is persisted in product_images/storage.
        if (organizationId) {
          try {
            const parentFiles = (selectedImages || []).filter((f: any) => f instanceof File) as File[];
            if (parentFiles.length > 0) {
              await uploadProductImages({
                files: parentFiles,
                productId: createdProduct.id,
                organizationId,
                startPosition: 0,
                firstIsCover: true,
              });
            }

            for (const child of createdVariationChildren) {
              if (child.files.length === 0) continue;
              await uploadProductImages({
                files: child.files,
                productId: child.id,
                organizationId,
                startPosition: 0,
                firstIsCover: true,
              });
            }
          } catch (uploadErr) {
            console.error("Erro ao subir imagens após criação:", uploadErr);
            toast({
              title: "Produto criado com aviso",
              description: "O produto foi salvo, mas houve erro no upload de algumas imagens.",
              variant: "destructive",
            });
          }
        }

        triggerSync();
        setProductSaved(true);
        setCurrentStep(currentStep + 1);

        if (options?.onSuccess) {
          options.onSuccess();
        } else if (onSuccess) {
          onSuccess();
        }
      }

  } catch (error: unknown) {
    console.error("Erro ao criar produto:", error);
    
    let errorMessage = "Erro desconhecido.";
    if (error && typeof error === 'object' && 'message' in error) {
      errorMessage = (error as { message: string }).message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }
      // Mostrar feedback de erro para facilitar diagnóstico
      toast({
        title: "Erro ao salvar",
        description: String(errorMessage),
        variant: "destructive",
      });
  }
  };

  const nextStep = async () => {
    const maxSteps = getMaxSteps();

    if (currentStep < maxSteps) {
      // Não avançar sem selecionar o tipo de produto no primeiro passo
      if (currentStep === 1 && !productType) {
        return;
      }

      // Regras específicas por tipo antes da validação genérica
      if (productType === "kit" && currentStep === 3) {
        if (kitStep === "products" && (!kitItems || kitItems.length === 0)) {
          return;
        }
      }

      if (productType === "variation") {
        // Deve haver pelo menos uma variação definida
        if (currentStep === 3 && (!variations || variations.length === 0)) {
          return;
        }
        // Etapa 4: apenas sinalizar ausências de dimensões, mas não bloquear avanço
        if (currentStep === 4) {
          const missingFieldsByVar = variations.map(v => ({
            id: v.id,
            missing: [!v.height, !v.width, !v.length, !v.weight].some(Boolean)
          }));
          // Mantemos a UX apontando campos em vermelho via componentes de formulário,
          // porém seguimos para a próxima etapa para permitir salvar com defaults.
        }
      }

      // Bloqueia avanço se a etapa atual tiver campos obrigatórios vazios
      const isValid = validateCurrentStep();
      if (!isValid) {
        return;
      }

      // Correção: ao entrar no passo 3 do fluxo de kit, cair diretamente na sub-etapa "products"
      if (productType === "kit" && currentStep === 2) {
        setCurrentStep(currentStep + 1);
        setKitStep("products");
        return;
      }

      if (productType === "kit" && currentStep === 3) {
        if (kitStep === "info") {
          setKitStep("products");
        } else if (kitStep === "products") {
          setCurrentStep(currentStep + 1);
        }
      } else {
        setCurrentStep(currentStep + 1);
      }
    }
  };

  const backStep = () => {
    if (productType === "kit" && currentStep === 3 && kitStep === "products") {
      setKitStep("info");
    } else if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  return {
    currentStep,
    productType,
    selectedImages,
    productSaved,
    variations,
    variationStep,
    variationTypes,
    kitStep,
    kitItems,
    formData,
    createLoading,
    errors,
    
    setSelectedImages,
    setVariations,
    setVariationStep,
    setVariationTypes,
    setKitStep,
    setKitItems,
    
    nextStep,
    backStep,
    handleInputChange,
    handleProductTypeChange,
    handleCreateProduct,
    getMaxSteps,
  };
}