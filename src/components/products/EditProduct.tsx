/**
 * §1 SIZE EXCEPTION: ~230 LOC (limit 200).
 * Justified: accordion form sections (basics, photos, price, dims, fiscal, mapping) share
 * a single mutable `produto` state setter and cannot be split into sub-components without
 * a context API — deferred to a follow-up refactoring pass. See Change Intent Products Vertical.
 */

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Copy, Loader2, ChevronDown } from 'lucide-react';
import { ProductImageUploader } from '@/components/products/ProductImageUploader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';
import { CategoryTreeSelect } from '@/components/products/CategoryTreeSelect';
import { ProductCoverImage } from '@/components/products/ProductCoverImage';
import { ProductAdLinker } from '@/components/products/ProductAdLinker';
import { useProductDetail } from '@/hooks/products/useProductDetail';
import { useProductSave } from '@/hooks/products/useProductSave';
import { MarketplaceMappingDrawer } from '@/components/products/MarketplaceMappingDrawer';
import { useMarketplaceMappingDrawer } from '@/hooks/products/useMarketplaceMappingDrawer';

export function EditarProduto() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { organizationId } = useAuth();

  const { data: productData, isLoading: loading, error: loadError } = useProductDetail(id);
  const { saveAsync, duplicateAsync, isSaving, isDuplicating } = useProductSave(id);

  const drawer = useMarketplaceMappingDrawer(productData?.id, organizationId);

  // Local mutable state for the accordion form fields
  const [produto, setProduto] = useState<any>(null);

  // Sync loaded product into local state once
  if (productData && !produto) {
    setProduto(productData);
  }

  if (loadError) {
    toast({ title: 'Erro', description: 'Produto não encontrado', variant: 'destructive' });
    navigate('/produtos');
    return null;
  }

  const handleSalvar = async () => {
    if (!produto || !id) return;
    try {
      await saveAsync({ produto });
      toast({ title: 'Sucesso', description: 'Produto atualizado com sucesso' });
      navigate('/produtos');
    } catch (err) {
      console.error('Error:', err);
      toast({ title: 'Erro', description: 'Erro ao salvar produto', variant: 'destructive' });
    }
  };

  const handleDuplicate = async () => {
    if (!id) return;
    try {
      const newId = await duplicateAsync();
      toast({ title: 'Produto duplicado', description: 'Redirecionando para edição da cópia...' });
      navigate(`/produtos/editar/${newId}`);
    } catch (err: any) {
      toast({ title: 'Erro', description: err?.message || 'Erro ao duplicar produto', variant: 'destructive' });
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
        <Card><CardContent className="p-6"><div className="space-y-4">{[...Array(6)].map((_, i) => (<Skeleton key={i} className="h-12 w-full" />))}</div></CardContent></Card>
      </div>
    );
  }

  if (!produto) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-gray-500">Produto não encontrado</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 -mx-4 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ProductCoverImage imageUrl={Array.isArray(produto.imagens) ? produto.imagens[0] : undefined} alt={produto.nome} sizeClassName="h-12 w-12" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">{produto.nome || 'Editar Produto'}</h1>
            <p className="text-sm text-gray-500">SKU: {produto.sku || '-'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/produtos')}>
            <ArrowLeft className="w-4 h-4 mr-2" />Voltar
          </Button>
          <Button variant="outline" size="sm" disabled={isDuplicating} onClick={handleDuplicate}>
            {isDuplicating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Redirecionando...</> : <><Copy className="w-4 h-4 mr-2" />Duplicar</>}
          </Button>
          <Button onClick={handleSalvar} size="sm" disabled={isSaving} className="bg-violet-700 hover:bg-violet-800 text-white">
            <Save className="w-4 h-4 mr-2" />Salvar Alterações
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <Accordion type="single" collapsible defaultValue="informacoes-basicas" className="w-full">
            <AccordionItem value="informacoes-basicas" className="mb-4 rounded-xl border border-violet-100 px-4">
              <AccordionTrigger className="rounded-lg py-3 hover:no-underline [&[data-state=open]>div>span:first-child]:bg-violet-700">
                <div className="flex items-center space-x-2"><span className="flex items-center justify-center w-8 h-8 bg-violet-600 text-white rounded-full text-sm font-medium">1</span><span className="font-medium">Informações Básicas</span></div>
              </AccordionTrigger>
              <AccordionContent className="pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2"><Label htmlFor="nome">Nome do Produto *</Label><Input id="nome" value={produto.nome} onChange={(e) => setProduto({...produto, nome: e.target.value})} /></div>
                  <div className="space-y-2"><Label htmlFor="sku">SKU *</Label><Input id="sku" value={produto.sku} onChange={(e) => setProduto({...produto, sku: e.target.value})} /></div>
                  <div className="space-y-2"><Label htmlFor="categoria">Categoria *</Label><CategoryTreeSelect value={produto.categoriaId} onChange={(categoryId, category) => setProduto({...produto, categoriaId: categoryId, categoria: category?.name || ''})} placeholder="Selecione uma categoria" /></div>
                  <div className="space-y-2"><Label htmlFor="marca">Marca</Label><Input id="marca" value={produto.marca} onChange={(e) => setProduto({...produto, marca: e.target.value})} /></div>
                  <div className="col-span-full space-y-2"><Label htmlFor="descricao">Descrição</Label><Textarea id="descricao" value={produto.descricao} onChange={(e) => setProduto({...produto, descricao: e.target.value})} rows={3} /></div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="fotos" className="mb-4 rounded-xl border border-violet-100 px-4">
              <AccordionTrigger className="rounded-lg py-3 hover:no-underline [&[data-state=open]>div>span:first-child]:bg-violet-700">
                <div className="flex items-center space-x-2"><span className="flex items-center justify-center w-8 h-8 bg-violet-700 text-white rounded-full text-sm font-medium">2</span><span className="font-medium">Fotos do Produto</span></div>
              </AccordionTrigger>
              <AccordionContent className="pt-4">
                {id && organizationId ? (
                  <ProductImageUploader productId={id} organizationId={organizationId} />
                ) : (
                  <p className="text-sm text-gray-400">Salve o produto antes de adicionar imagens.</p>
                )}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="preco-custo" className="mb-4 rounded-xl border border-violet-100 px-4">
              <AccordionTrigger className="rounded-lg py-3 hover:no-underline [&[data-state=open]>div>span:first-child]:bg-violet-700">
                <div className="flex items-center space-x-2"><span className="flex items-center justify-center w-8 h-8 bg-violet-600 text-white rounded-full text-sm font-medium">3</span><span className="font-medium">Preço de Custo e Estoque</span></div>
              </AccordionTrigger>
              <AccordionContent className="pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2"><Label htmlFor="custoBuyPrice">Custo de Compra *</Label><Input id="custoBuyPrice" type="number" step="0.01" value={produto.custoBuyPrice} onChange={(e) => setProduto({...produto, custoBuyPrice: parseFloat(e.target.value)})} /></div>
                  <div className="space-y-2"><Label htmlFor="estoque">Estoque Atual</Label><Input id="estoque" type="number" value={produto.estoque} disabled /><a href={`/estoque?tab=controle&openStockDrawer=1&productId=${id}`} className="inline-flex items-center gap-1 text-sm font-medium text-violet-700 hover:text-violet-800">Altere no módulo de estoque<ChevronDown className="h-3.5 w-3.5 -rotate-90" /></a></div>
                  <div className="space-y-2"><Label htmlFor="armazem">Armazém</Label><Input id="armazem" value={produto.armazem} disabled /></div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="dimensoes" className="mb-4 rounded-xl border border-violet-100 px-4">
              <AccordionTrigger className="rounded-lg py-3 hover:no-underline [&[data-state=open]>div>span:first-child]:bg-violet-700">
                <div className="flex items-center space-x-2"><span className="flex items-center justify-center w-8 h-8 bg-violet-600 text-white rounded-full text-sm font-medium">4</span><span className="font-medium">Dimensões e Peso do Pacote</span></div>
              </AccordionTrigger>
              <AccordionContent className="pt-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="space-y-2"><Label htmlFor="altura">Altura (cm) *</Label><Input id="altura" type="number" step="0.1" value={produto.dimensoes.altura} onChange={(e) => setProduto({...produto, dimensoes: {...produto.dimensoes, altura: parseFloat(e.target.value)}})} /></div>
                  <div className="space-y-2"><Label htmlFor="largura">Largura (cm) *</Label><Input id="largura" type="number" step="0.1" value={produto.dimensoes.largura} onChange={(e) => setProduto({...produto, dimensoes: {...produto.dimensoes, largura: parseFloat(e.target.value)}})} /></div>
                  <div className="space-y-2"><Label htmlFor="comprimento">Comprimento (cm) *</Label><Input id="comprimento" type="number" step="0.1" value={produto.dimensoes.comprimento} onChange={(e) => setProduto({...produto, dimensoes: {...produto.dimensoes, comprimento: parseFloat(e.target.value)}})} /></div>
                  <div className="space-y-2"><Label htmlFor="peso">Peso (gramas) *</Label><Input id="peso" type="number" value={produto.peso} onChange={(e) => setProduto({...produto, peso: parseInt(e.target.value)})} /></div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="fiscais" className="mb-4 rounded-xl border border-violet-100 px-4">
              <AccordionTrigger className="rounded-lg py-3 hover:no-underline [&[data-state=open]>div>span:first-child]:bg-violet-700">
                <div className="flex items-center space-x-2"><span className="flex items-center justify-center w-8 h-8 bg-violet-600 text-white rounded-full text-sm font-medium">5</span><span className="font-medium">Informações Fiscais</span></div>
              </AccordionTrigger>
              <AccordionContent className="pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2"><Label htmlFor="codigoBarras">Código de Barras *</Label><Input id="codigoBarras" value={produto.codigoBarras} onChange={(e) => setProduto({...produto, codigoBarras: e.target.value.replace(/\D/g, '').slice(0, 13)})} inputMode="numeric" maxLength={13} /></div>
                  <div className="space-y-2"><Label htmlFor="ncm">NCM *</Label><Input id="ncm" value={produto.ncm} onChange={(e) => setProduto({...produto, ncm: e.target.value})} /></div>
                  <div className="space-y-2"><Label htmlFor="cest">CEST</Label><Input id="cest" value={produto.cest} onChange={(e) => setProduto({...produto, cest: e.target.value})} /></div>
                  <div className="space-y-2"><Label htmlFor="unidade">Unidade de Medida</Label>
                    <Select value={produto.unidade} onValueChange={(value) => setProduto({...produto, unidade: value})}>
                      <SelectTrigger><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
                      <SelectContent><SelectItem value="UN">UN - Unidade</SelectItem><SelectItem value="KG">KG - Quilograma</SelectItem><SelectItem value="MT">MT - Metro</SelectItem><SelectItem value="LT">LT - Litro</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label htmlFor="origem">Origem</Label>
                    <Select value={produto.origem} onValueChange={(value) => setProduto({...produto, origem: value})}>
                      <SelectTrigger><SelectValue placeholder="Selecione a origem" /></SelectTrigger>
                      <SelectContent><SelectItem value="0">0 - Nacional</SelectItem><SelectItem value="1">1 - Estrangeira - Importação direta</SelectItem><SelectItem value="2">2 - Estrangeira - Adquirida no mercado interno</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="mapeamento" className="rounded-xl border border-violet-100 px-4">
              <AccordionTrigger className="rounded-lg py-3 hover:no-underline [&[data-state=open]>div>span:first-child]:bg-violet-700">
                <div className="flex items-center space-x-2"><span className="flex items-center justify-center w-8 h-8 bg-violet-600 text-white rounded-full text-sm font-medium">6</span><span className="font-medium">Mapeamento de Anúncios</span></div>
              </AccordionTrigger>
              <AccordionContent className="pt-4">
                <ProductAdLinker productId={produto?.id || null} />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      <MarketplaceMappingDrawer drawer={drawer} />
    </div>
  );
}
