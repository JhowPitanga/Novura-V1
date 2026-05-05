import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Plus, Search, ExternalLink, X, Copy, Loader2, ChevronDown } from "lucide-react";
import { ProductImageUploader } from "@/components/products/ProductImageUploader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryTreeSelect } from "@/components/products/CategoryTreeSelect";
import { ProductCoverImage } from "@/components/products/ProductCoverImage";
import { ProductAdLinker } from "@/components/products/ProductAdLinker";

const marketplaces = [
  { value: "mercado-livre", label: "Mercado Livre" },
  { value: "amazon", label: "Amazon" },
  { value: "shopee", label: "Shopee" },
  { value: "magazine-luiza", label: "Magazine Luiza" },
  { value: "americanas", label: "Americanas" }
];

const marketplaceDisplayByValue: Record<string, string> = {
  "mercado-livre": "Mercado Livre",
  "amazon": "Amazon",
  "shopee": "Shopee",
  "magazine-luiza": "Magazine Luiza",
  "americanas": "Americanas",
};

// Mapeamentos entre valores do Select (UI) e o nome no banco (marketplace_integrations/marketplace_items)
const dbMarketplaceNameByValue: Record<string, string> = {
  "mercado-livre": "mercado_livre",
  "amazon": "amazon",
  "shopee": "shopee",
  "magazine-luiza": "magazine_luiza",
  "americanas": "americanas",
};

const labelByDbName: Record<string, string> = {
  "mercado_livre": "Mercado Livre",
  "amazon": "Amazon",
  "shopee": "Shopee",
  "magazine_luiza": "Magazine Luiza",
  "americanas": "Americanas",
};

const valueByDbName: Record<string, string> = {
  "mercado_livre": "mercado-livre",
  "amazon": "amazon",
  "shopee": "shopee",
  "magazine_luiza": "magazine-luiza",
  "americanas": "americanas",
};

export function EditarProduto() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { organizationId } = useAuth();
  const [produto, setProduto] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [openMapeamento, setOpenMapeamento] = useState(false);
  const [selectedMarketplace, setSelectedMarketplace] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [existingLinks, setExistingLinks] = useState<any[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  // Chave de vinculação por item+variação para evitar colisões ao desabilitar botões
  const [linkingItemId, setLinkingItemId] = useState<string | null>(null);
  const [unlinkingKey, setUnlinkingKey] = useState<string | null>(null);
  const [activeDbMarketplaceNames, setActiveDbMarketplaceNames] = useState<string[]>([]);
  const [isDuplicating, setIsDuplicating] = useState(false);

  const fetchProduct = async () => {
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
      const { data, error } = await supabase
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

      if (error) {
        console.error('Error fetching product:', error);
        toast({
          title: "Erro",
          description: "Produto não encontrado",
          variant: "destructive",
        });
        navigate("/produtos");
        return;
      }

      // Transform the data to match the expected structure
      const transformedProduct = {
        id: data.id,
        tipo: data.type as string | undefined,
        companyId: data.company_id,
        nome: data.name,
        sku: data.sku,
        descricao: data.description || "",
        categoriaId: data.categories?.id || null,
        categoria: data.categories?.name || "",
        marca: data.custom_attributes?.brand || "",
        custom_attributes: data.custom_attributes || {},
        custoBuyPrice: data.cost_price,
        estoque: data.products_stock?.current || 0,
        armazem: data.products_stock?.[0]?.storage?.name || "Principal",
        peso: data.weight || 0,
        dimensoes: {
          altura: data.package_height,
          largura: data.package_width,
          comprimento: data.package_length
        },
        codigoBarras: data.barcode?.toString() || "",
        ncm: data.ncm?.toString() || "",
        cest: data.cest?.toString() || "",
        unidade: "UN", // Default value
        origem: data.tax_origin_code?.toString() || "0",
        imagens: data.image_urls || []
      };

      setProduto(transformedProduct);
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
    fetchProduct();
  }, [id]);

  const loadExistingLinks = async () => {
    try {
      if (!produto?.id || !organizationId) return;
      const { data, error } = await (supabase as any)
        .from('marketplace_item_product_links')
        .select('marketplace_name, marketplace_item_id, variation_id, permanent, updated_at')
        .eq('product_id', produto.id)
        .eq('organizations_id', organizationId);
      if (error) throw error;
      setExistingLinks(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('Falha ao carregar vínculos existentes:', e);
      setExistingLinks([]);
    }
  };

  useEffect(() => {
    loadExistingLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, produto?.id]);

  // Busca integrações de marketplaces ativas para a organização
  const fetchActiveIntegrations = async () => {
    try {
      if (!organizationId) return;
      const { data, error } = await (supabase as any)
        .from('marketplace_integrations')
        .select('marketplace_name')
        .eq('organizations_id', organizationId);
      if (error) throw error;
      const names = Array.isArray(data) ? Array.from(new Set(data.map((r: any) => r.marketplace_name))) : [];
      setActiveDbMarketplaceNames(names);
      // Ajusta seleção padrão se necessário
      if (names.length > 0) {
        const defaultValue = valueByDbName[names[0]] || names[0];
        setSelectedMarketplace((prev) => prev || defaultValue);
      }
    } catch (e) {
      console.warn('Falha ao buscar integrações ativas:', e);
      setActiveDbMarketplaceNames([]);
    }
  };

  // Utilitário: extrair thumbnail da variação ou do item
  const getThumbFromPictures = (variation: any, pictures: any): string => {
    try {
      const picIds = Array.isArray(variation?.picture_ids) ? variation.picture_ids : [];
      const firstPicId = picIds.length > 0 ? picIds[0] : null;
      const picsArr = Array.isArray(pictures) ? pictures : [];
      if (firstPicId) {
        const match = picsArr.find((p: any) => p?.id === firstPicId);
        if (match?.url) return match.url;
        if (match?.secure_url) return match.secure_url;
      }
      // Outros campos comuns em variações
      if (typeof variation?.thumbnail === 'string') return variation.thumbnail;
      if (typeof variation?.image === 'string') return variation.image;
      if (Array.isArray(variation?.images) && typeof variation.images[0] === 'string') return variation.images[0];
      // Fallback: primeira foto do item
      const first = picsArr[0];
      if (first?.url) return first.url;
      if (first?.secure_url) return first.secure_url;
      return '';
    } catch {
      return '';
    }
  };

  // Utilitário: montar título com atributos da variação quando disponível
  const buildVariationTitle = (itemTitle: string, variation: any): string => {
    const combos = Array.isArray(variation?.attribute_combinations) ? variation.attribute_combinations : [];
    const attrs = Array.isArray(variation?.attributes) ? variation.attributes : [];
    const parts: string[] = [];
    if (combos.length > 0) {
      parts.push(
        combos
          .map((c: any) => [c?.name, c?.value_name].filter(Boolean).join(':'))
          .join(' - ')
      );
    } else if (attrs.length > 0) {
      parts.push(
        attrs
          .map((a: any) => [a?.name, a?.value_name || a?.value].filter(Boolean).join(':'))
          .join(' - ')
      );
    } else if (variation?.name) {
      parts.push(String(variation.name));
    }
    const suffix = parts.filter(Boolean).join(' | ');
    return suffix ? `${itemTitle || ''} — ${suffix}`.trim() : (itemTitle || 'Anúncio');
  };

  // Deriva o SKU a partir do item ou da variação
  const deriveSku = (item: any, variation: any): string => {
    try {
      // Prioriza SKU específico da variação
      if (variation?.sku) return String(variation.sku);
      if (variation?.seller_sku) return String(variation.seller_sku);
      // Fallback para SKU do item
      if (item?.sku) return String(item.sku);
      // Procura em attribute_combinations
      const combos = Array.isArray(variation?.attribute_combinations) ? variation.attribute_combinations : [];
      const comboSku = combos.find((a: any) => a?.id === 'SELLER_SKU' || String(a?.name || '').toUpperCase() === 'SKU');
      if (comboSku?.value_name) return String(comboSku.value_name);
      if (comboSku?.value_id) return String(comboSku.value_id);
      if (comboSku?.value) return String(comboSku.value);
      // Procura em attributes
      const attrs = Array.isArray(variation?.attributes) ? variation.attributes : [];
      const attrSku = attrs.find((a: any) => a?.id === 'SELLER_SKU' || String(a?.name || '').toUpperCase() === 'SKU');
      if (attrSku?.value_name) return String(attrSku.value_name);
      if (attrSku?.value_id) return String(attrSku.value_id);
      if (attrSku?.value) return String(attrSku.value);
      return '';
    } catch {
      return '';
    }
  };

  // Rótulo curto da variação (apenas valores), ex: "Azul / M"
  const buildVariationLabel = (variation: any): string => {
    try {
      const combos = Array.isArray(variation?.attribute_combinations) ? variation.attribute_combinations : [];
      return combos
        .filter((a: any) => a?.id !== 'SELLER_SKU' && String(a?.name || '').toUpperCase() !== 'SKU')
        .map((a: any) => a?.value_name || a?.value_id || '')
        .filter(Boolean)
        .join(' / ');
    } catch {
      return '';
    }
  };

  // Busca itens de marketplace e achata para variações
  const fetchMarketplaceItems = async () => {
    try {
      if (!organizationId) return;
      setItemsLoading(true);
      let q: any = (supabase as any)
        .from('marketplace_items')
        .select('marketplace_item_id, title, sku, marketplace_name, pictures, company_id, variations')
        .eq('organizations_id', organizationId);
      const dbMk = dbMarketplaceNameByValue[selectedMarketplace] || selectedMarketplace || null;
      if (dbMk) q = q.eq('marketplace_name', dbMk);
      const term = searchTerm.trim();
      if (term) {
        const like = `%${term}%`;
        q = q.or(`title.ilike.${like},marketplace_item_id.ilike.${like},sku.ilike.${like}`);
      }
      const { data, error } = await q.limit(50);
      if (error) throw error;
      const raw = Array.isArray(data) ? data : [];
      // Achatar para variações
      const flattened: any[] = [];
      raw.forEach((it: any) => {
        const vars = Array.isArray(it?.variations) ? it.variations : [];
        if (vars.length > 0) {
          vars.forEach((v: any) => {
            const vid = v?.id != null ? String(v.id) : (v?.variation_id != null ? String(v.variation_id) : (v?.sku != null ? String(v.sku) : ''));
            const thumb = getThumbFromPictures(v, it?.pictures);
            const sku = deriveSku(it, v);
            const vlabel = buildVariationLabel(v);
            flattened.push({
              marketplace_item_id: it.marketplace_item_id,
              marketplace_name: it.marketplace_name,
              company_id: it.company_id,
              variation_id: vid,
              title: buildVariationTitle(it.title, v),
              sku,
              variation_label: vlabel,
              thumbnail_url: thumb,
            });
          });
        } else {
          // Sem variações: apresentamos uma linha única com variação vazia
          const thumb = getThumbFromPictures({}, it?.pictures);
          const sku = deriveSku(it, {});
          flattened.push({
            marketplace_item_id: it.marketplace_item_id,
            marketplace_name: it.marketplace_name,
            company_id: it.company_id,
            variation_id: '',
            title: it.title || `Anúncio ${it.marketplace_item_id}`,
            sku,
            variation_label: '',
            thumbnail_url: thumb,
          });
        }
      });
      setItems(flattened);
    } catch (e) {
      console.warn('Falha ao buscar itens do marketplace:', e);
      setItems([]);
    } finally {
      setItemsLoading(false);
    }
  };

  useEffect(() => {
    if (openMapeamento && organizationId) {
      fetchActiveIntegrations();
      fetchMarketplaceItems();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openMapeamento, selectedMarketplace, searchTerm, organizationId]);

  const handleLinkItem = async (item: any) => {
    if (!produto?.id || !organizationId) {
      toast({
        title: 'Contexto inválido',
        description: 'Organização não resolvida para vincular.',
        variant: 'destructive',
      });
      return;
    }
    try {
      const key = `${item.marketplace_item_id}::${item.variation_id || ''}`;
      setLinkingItemId(key);
      const payload = {
        organizations_id: organizationId,
        company_id: item.company_id,
        marketplace_name: item.marketplace_name,
        marketplace_item_id: item.marketplace_item_id,
        variation_id: item.variation_id || '',
        product_id: produto.id,
        permanent: true,
        updated_at: new Date().toISOString(),
      };
      const { error } = await (supabase as any)
        .from('marketplace_item_product_links')
        .upsert([payload], { onConflict: 'organizations_id,marketplace_name,marketplace_item_id,variation_id' });
      if (error) throw error;
      toast({ title: 'Vínculo criado', description: 'Variação vinculada ao produto.' });
      await loadExistingLinks();
      setOpenMapeamento(false);
    } catch (err: any) {
      toast({ title: 'Erro ao vincular', description: err?.message || 'Tente novamente.', variant: 'destructive' });
    } finally {
      setLinkingItemId(null);
    }
  };

  const handleVoltar = () => {
    navigate("/produtos");
  };

  const handleUnlink = async (link: any) => {
    if (!produto?.id || !organizationId) return;
    const key = `${link.marketplace_item_id}::${link.variation_id || ''}`;
    try {
      setUnlinkingKey(key);
      const { error } = await (supabase as any)
        .from('marketplace_item_product_links')
        .delete()
        .eq('organizations_id', organizationId)
        .eq('product_id', produto.id)
        .eq('marketplace_name', link.marketplace_name)
        .eq('marketplace_item_id', link.marketplace_item_id)
        .eq('variation_id', link.variation_id || '');
      if (error) throw error;
      toast({ title: 'Vínculo removido', description: 'Anúncio desvinculado do produto.' });
      await loadExistingLinks();
    } catch (err: any) {
      toast({ title: 'Erro ao desvincular', description: err?.message || 'Tente novamente.', variant: 'destructive' });
    } finally {
      setUnlinkingKey(null);
    }
  };

  const handleSalvar = async () => {
    if (!produto || !id) return;

    try {
      const rootTypes = ['UNICO', 'VARIACAO_PAI', 'KIT'];
      const isRootProduct = produto.tipo && rootTypes.includes(String(produto.tipo));

      const { error } = await supabase
        .from('products')
        .update({
          ...(isRootProduct ? { parent_id: null as string | null } : {}),
          name: produto.nome,
          sku: produto.sku,
          description: produto.descricao,
          category_id: produto.categoriaId || null,
          custom_attributes: {
            ...(produto?.custom_attributes || {}),
            brand: produto.marca || null,
          },
          cost_price: produto.custoBuyPrice,
          package_height: produto.dimensoes.altura,
          package_width: produto.dimensoes.largura,
          package_length: produto.dimensoes.comprimento,
          weight: produto.peso,
          barcode: parseInt(produto.codigoBarras) || 0,
          ncm: parseInt(produto.ncm) || 0,
          cest: produto.cest ? parseInt(produto.cest) : null,
          tax_origin_code: parseInt(produto.origem) || 0,
          image_urls: produto.imagens
        })
        .eq('id', id);

      if (error) {
        console.error('Error updating product:', error);
        toast({
          title: "Erro",
          description: "Erro ao salvar produto",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Sucesso",
        description: "Produto atualizado com sucesso",
      });
      
      navigate("/produtos");
    } catch (err) {
      console.error('Error:', err);
      toast({
        title: "Erro",
        description: "Erro ao salvar produto",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
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

  if (!produto) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Produto não encontrado</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sticky toolbar */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 -mx-4 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ProductCoverImage
            imageUrl={Array.isArray(produto.imagens) ? produto.imagens[0] : undefined}
            alt={produto.nome}
            sizeClassName="h-12 w-12"
          />
          <div>
            <h1 className="text-xl font-bold text-gray-900">{produto.nome || "Editar Produto"}</h1>
            <p className="text-sm text-gray-500">SKU: {produto.sku || "-"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleVoltar}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isDuplicating}
            onClick={async () => {
              if (!id) return;
              try {
                setIsDuplicating(true);
                const { data, error } = await supabase.rpc('duplicate_product', {
                  p_product_id: id,
                  p_with_images: false,
                });
                if (error) throw error;
                toast({ title: 'Produto duplicado', description: 'Redirecionando para edição da cópia...' });
                navigate(`/produtos/editar/${data}`);
              } catch (err: any) {
                toast({ title: 'Erro', description: err?.message || 'Erro ao duplicar produto', variant: 'destructive' });
              } finally {
                setIsDuplicating(false);
              }
            }}
          >
            {isDuplicating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Redirecionando...
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 mr-2" />
                Duplicar
              </>
            )}
          </Button>
          <Button onClick={handleSalvar} size="sm" className="bg-violet-700 hover:bg-violet-800 text-white">
            <Save className="w-4 h-4 mr-2" />
            Salvar Alterações
          </Button>
        </div>
      </div>

      {/* Accordion Form */}
      <Card>
        <CardContent className="p-6">
          <Accordion type="single" collapsible defaultValue="informacoes-basicas" className="w-full">
            {/* Passo 1 - Informações Básicas */}
            <AccordionItem value="informacoes-basicas" className="mb-4 rounded-xl border border-violet-100 px-4">
              <AccordionTrigger className="rounded-lg py-3 hover:no-underline [&[data-state=open]>div>span:first-child]:bg-violet-700">
                <div className="flex items-center space-x-2">
                  <span className="flex items-center justify-center w-8 h-8 bg-violet-600 text-white rounded-full text-sm font-medium">1</span>
                  <span className="font-medium">Informações Básicas</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="nome">Nome do Produto *</Label>
                    <Input
                      id="nome"
                      value={produto.nome}
                      onChange={(e) => setProduto({...produto, nome: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sku">SKU *</Label>
                    <Input
                      id="sku"
                      value={produto.sku}
                      onChange={(e) => setProduto({...produto, sku: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="categoria">Categoria *</Label>
                    <CategoryTreeSelect
                      value={produto.categoriaId}
                      onChange={(categoryId, category) => setProduto({
                        ...produto,
                        categoriaId: categoryId,
                        categoria: category?.name || "",
                      })}
                      placeholder="Selecione uma categoria"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="marca">Marca</Label>
                    <Input
                      id="marca"
                      value={produto.marca}
                      onChange={(e) => setProduto({...produto, marca: e.target.value})}
                    />
                  </div>
                  <div className="col-span-full space-y-2">
                    <Label htmlFor="descricao">Descrição</Label>
                    <Textarea
                      id="descricao"
                      value={produto.descricao}
                      onChange={(e) => setProduto({...produto, descricao: e.target.value})}
                      rows={3}
                    />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="fotos" className="mb-4 rounded-xl border border-violet-100 px-4">
              <AccordionTrigger className="rounded-lg py-3 hover:no-underline [&[data-state=open]>div>span:first-child]:bg-violet-700">
                <div className="flex items-center space-x-2">
                  <span className="flex items-center justify-center w-8 h-8 bg-violet-700 text-white rounded-full text-sm font-medium">2</span>
                  <span className="font-medium">Fotos do Produto</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-4">
                {id && organizationId ? (
                  <ProductImageUploader
                    productId={id}
                    organizationId={organizationId}
                  />
                ) : (
                  <p className="text-sm text-gray-400">Salve o produto antes de adicionar imagens.</p>
                )}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="preco-custo" className="mb-4 rounded-xl border border-violet-100 px-4">
              <AccordionTrigger className="rounded-lg py-3 hover:no-underline [&[data-state=open]>div>span:first-child]:bg-violet-700">
                <div className="flex items-center space-x-2">
                  <span className="flex items-center justify-center w-8 h-8 bg-violet-600 text-white rounded-full text-sm font-medium">3</span>
                  <span className="font-medium">Preço de Custo e Estoque</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="custoBuyPrice">Custo de Compra *</Label>
                    <Input
                      id="custoBuyPrice"
                      type="number"
                      step="0.01"
                      value={produto.custoBuyPrice}
                      onChange={(e) => setProduto({...produto, custoBuyPrice: parseFloat(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="estoque">Estoque Atual</Label>
                    <Input
                      id="estoque"
                      type="number"
                      value={produto.estoque}
                      disabled
                    />
                    <a
                      href={`/estoque?tab=controle&openStockDrawer=1&productId=${id}`}
                      className="inline-flex items-center gap-1 text-sm font-medium text-violet-700 hover:text-violet-800"
                    >
                      Altere no módulo de estoque
                      <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
                    </a>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="armazem">Armazém</Label>
                    <Input
                      id="armazem"
                      value={produto.armazem}
                      disabled
                    />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="dimensoes" className="mb-4 rounded-xl border border-violet-100 px-4">
              <AccordionTrigger className="rounded-lg py-3 hover:no-underline [&[data-state=open]>div>span:first-child]:bg-violet-700">
                <div className="flex items-center space-x-2">
                  <span className="flex items-center justify-center w-8 h-8 bg-violet-600 text-white rounded-full text-sm font-medium">4</span>
                  <span className="font-medium">Dimensões e Peso do Pacote</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="altura">Altura (cm) *</Label>
                    <Input
                      id="altura"
                      type="number"
                      step="0.1"
                      value={produto.dimensoes.altura}
                      onChange={(e) => setProduto({
                        ...produto,
                        dimensoes: {...produto.dimensoes, altura: parseFloat(e.target.value)}
                      })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="largura">Largura (cm) *</Label>
                    <Input
                      id="largura"
                      type="number"
                      step="0.1"
                      value={produto.dimensoes.largura}
                      onChange={(e) => setProduto({
                        ...produto,
                        dimensoes: {...produto.dimensoes, largura: parseFloat(e.target.value)}
                      })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="comprimento">Comprimento (cm) *</Label>
                    <Input
                      id="comprimento"
                      type="number"
                      step="0.1"
                      value={produto.dimensoes.comprimento}
                      onChange={(e) => setProduto({
                        ...produto,
                        dimensoes: {...produto.dimensoes, comprimento: parseFloat(e.target.value)}
                      })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="peso">Peso (gramas) *</Label>
                    <Input
                      id="peso"
                      type="number"
                      value={produto.peso}
                      onChange={(e) => setProduto({...produto, peso: parseInt(e.target.value)})}
                    />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="fiscais" className="mb-4 rounded-xl border border-violet-100 px-4">
              <AccordionTrigger className="rounded-lg py-3 hover:no-underline [&[data-state=open]>div>span:first-child]:bg-violet-700">
                <div className="flex items-center space-x-2">
                  <span className="flex items-center justify-center w-8 h-8 bg-violet-600 text-white rounded-full text-sm font-medium">5</span>
                  <span className="font-medium">Informações Fiscais</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="codigoBarras">Código de Barras *</Label>
                    <Input
                      id="codigoBarras"
                      value={produto.codigoBarras}
                      onChange={(e) => setProduto({...produto, codigoBarras: e.target.value.replace(/\D/g, "").slice(0, 13)})}
                      inputMode="numeric"
                      maxLength={13}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ncm">NCM *</Label>
                    <Input
                      id="ncm"
                      value={produto.ncm}
                      onChange={(e) => setProduto({...produto, ncm: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cest">CEST</Label>
                    <Input
                      id="cest"
                      value={produto.cest}
                      onChange={(e) => setProduto({...produto, cest: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unidade">Unidade de Medida</Label>
                    <Select value={produto.unidade} onValueChange={(value) => setProduto({...produto, unidade: value})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a unidade" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UN">UN - Unidade</SelectItem>
                        <SelectItem value="KG">KG - Quilograma</SelectItem>
                        <SelectItem value="MT">MT - Metro</SelectItem>
                        <SelectItem value="LT">LT - Litro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="origem">Origem</Label>
                    <Select value={produto.origem} onValueChange={(value) => setProduto({...produto, origem: value})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a origem" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">0 - Nacional</SelectItem>
                        <SelectItem value="1">1 - Estrangeira - Importação direta</SelectItem>
                        <SelectItem value="2">2 - Estrangeira - Adquirida no mercado interno</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="mapeamento" className="rounded-xl border border-violet-100 px-4">
              <AccordionTrigger className="rounded-lg py-3 hover:no-underline [&[data-state=open]>div>span:first-child]:bg-violet-700">
                <div className="flex items-center space-x-2">
                  <span className="flex items-center justify-center w-8 h-8 bg-violet-600 text-white rounded-full text-sm font-medium">6</span>
                  <span className="font-medium">Mapeamento de Anúncios</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-4">
                <ProductAdLinker productId={produto?.id || null} />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
