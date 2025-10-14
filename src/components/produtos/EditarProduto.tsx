import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Plus, Search, Filter, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

const marketplaces = [
  { value: "mercado-livre", label: "Mercado Livre" },
  { value: "amazon", label: "Amazon" },
  { value: "shopee", label: "Shopee" },
  { value: "magazine-luiza", label: "Magazine Luiza" },
  { value: "americanas", label: "Americanas" }
];

export function EditarProduto() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [produto, setProduto] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [openMapeamento, setOpenMapeamento] = useState(false);
  const [selectedMarketplace, setSelectedMarketplace] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

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
        nome: data.name,
        sku: data.sku,
        descricao: data.description || "",
        categoria: data.categories?.name || "",
        marca: "", // Not available in current schema
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
        imagens: data.image_urls || [],
        vinculos: [] // Mock data for now - marketplace integrations not implemented
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

  const handleVoltar = () => {
    navigate("/produtos");
  };

  const handleSalvar = async () => {
    if (!produto || !id) return;

    try {
      const { error } = await supabase
        .from('products')
        .update({
          name: produto.nome,
          sku: produto.sku,
          description: produto.descricao,
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Editar Produto</h1>
          <p className="text-gray-600">SKU: {produto.sku}</p>
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
            {/* Passo 1 - Informações Básicas */}
            <AccordionItem value="informacoes-basicas">
              <AccordionTrigger>
                <div className="flex items-center space-x-2">
                  <span className="flex items-center justify-center w-8 h-8 bg-novura-primary text-white rounded-full text-sm font-medium">1</span>
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
                    <Input
                      id="categoria"
                      value={produto.categoria}
                      onChange={(e) => setProduto({...produto, categoria: e.target.value})}
                      disabled
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

            <AccordionItem value="fotos">
              <AccordionTrigger>
                <div className="flex items-center space-x-2">
                  <span className="flex items-center justify-center w-8 h-8 bg-novura-primary text-white rounded-full text-sm font-medium">2</span>
                  <span className="font-medium">Fotos do Produto</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-4">
                <div className="space-y-4">
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                    <input
                      type="file"
                      multiple
                      accept="image/jpeg,image/png"
                      className="hidden"
                      id="image-upload"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        const allowed = ["image/jpeg", "image/png"]; // JPG, JPEG, PNG
                        const validFiles = files.filter(f => allowed.includes(f.type) && f.size <= 2 * 1024 * 1024);
                        validFiles.forEach(file => {
                          const reader = new FileReader();
                          reader.onload = (e) => {
                            const newImage = e.target?.result as string;
                            setProduto(prev => ({
                              ...prev,
                              imagens: [...prev.imagens, newImage]
                            }));
                          };
                          reader.readAsDataURL(file);
                        });
                      }}
                    />
                    <label htmlFor="image-upload" className="cursor-pointer">
                      <Plus className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                      <p className="text-gray-500">Clique para adicionar fotos ou arraste e solte aqui</p>
                      <p className="text-sm text-gray-400 mt-2">PNG, JPG/JPEG até 2MB cada</p>
                    </label>
                  </div>
                  
                  {produto.imagens.length > 0 && (
                    <div className="flex flex-wrap gap-4">
                      {produto.imagens.map((img, index) => (
                        <div key={index} className="relative">
                          <img
                            src={img}
                            alt={`Produto ${index + 1}`}
                            className="w-24 h-24 object-cover rounded-lg border"
                          />
                          <button 
                            onClick={() => {
                              setProduto(prev => ({
                                ...prev,
                                imagens: prev.imagens.filter((_, i) => i !== index)
                              }));
                            }}
                            className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="preco-custo">
              <AccordionTrigger>
                <div className="flex items-center space-x-2">
                  <span className="flex items-center justify-center w-8 h-8 bg-novura-primary text-white rounded-full text-sm font-medium">3</span>
                  <span className="font-medium">Preço de Custo</span>
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

            <AccordionItem value="dimensoes">
              <AccordionTrigger>
                <div className="flex items-center space-x-2">
                  <span className="flex items-center justify-center w-8 h-8 bg-novura-primary text-white rounded-full text-sm font-medium">4</span>
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

            <AccordionItem value="fiscais">
              <AccordionTrigger>
                <div className="flex items-center space-x-2">
                  <span className="flex items-center justify-center w-8 h-8 bg-novura-primary text-white rounded-full text-sm font-medium">5</span>
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
                      onChange={(e) => setProduto({...produto, codigoBarras: e.target.value})}
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

            <AccordionItem value="mapeamento">
              <AccordionTrigger>
                <div className="flex items-center space-x-2">
                  <span className="flex items-center justify-center w-8 h-8 bg-novura-primary text-white rounded-full text-sm font-medium">6</span>
                  <span className="font-medium">Mapeamento de Anúncios</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-4">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-medium">Anúncios Vinculados</h3>
                    <Drawer open={openMapeamento} onOpenChange={setOpenMapeamento}>
                      <DrawerTrigger asChild>
                        <Button className="bg-novura-primary hover:bg-novura-primary/90">
                          <Plus className="w-4 h-4 mr-2" />
                          Adicionar Vínculo
                        </Button>
                      </DrawerTrigger>
                      <DrawerContent>
                        <DrawerHeader>
                          <DrawerTitle>Adicionar Novo Vínculo</DrawerTitle>
                          <DrawerDescription>
                            Busque e vincule anúncios dos marketplaces
                          </DrawerDescription>
                        </DrawerHeader>
                        <div className="p-6 space-y-4">
                          <div className="flex space-x-4">
                            <div className="flex-1">
                              <Select value={selectedMarketplace} onValueChange={setSelectedMarketplace}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecione o marketplace" />
                                </SelectTrigger>
                                <SelectContent>
                                  {marketplaces.map((marketplace) => (
                                    <SelectItem key={marketplace.value} value={marketplace.value}>
                                      {marketplace.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <Button variant="outline">
                              <Filter className="w-4 h-4 mr-2" />
                              Filtros
                            </Button>
                          </div>
                          
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <Input
                              placeholder="Buscar por SKU, ID do produto ou descrição..."
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                              className="pl-10"
                            />
                          </div>

                          <div className="space-y-2 max-h-96 overflow-y-auto">
                            <Card>
                              <CardContent className="p-4">
                                <div className="flex justify-between items-center">
                                  <div>
                                    <p className="font-medium">Nenhum anúncio encontrado</p>
                                    <p className="text-sm text-gray-500">Funcionalidade em desenvolvimento</p>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        </div>
                      </DrawerContent>
                    </Drawer>
                  </div>

                  <Card>
                    <CardContent className="p-4 text-center text-gray-500">
                      <p>Nenhum anúncio vinculado</p>
                      <p className="text-sm">Use o botão acima para adicionar vínculos com marketplaces</p>
                    </CardContent>
                  </Card>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
