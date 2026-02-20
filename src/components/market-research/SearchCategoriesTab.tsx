import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, ChevronDown, ChevronRight, TrendingUp, TrendingDown, Filter } from "lucide-react";

interface Categoria {
  id: string;
  nome: string;
  oportunidade: "alta" | "media" | "baixa";
  receita: number;
  vendedores: number;
  monopolio: number;
  marketShare: number;
  receitaMedia: number;
  ticketMedio: number;
  produtosFull: number;
  crescimento: number;
  subcategorias?: Categoria[];
}

// Mock data para demonstração
const categoriasMock: Categoria[] = [
  {
    id: "eletronicos",
    nome: "Eletrônicos",
    oportunidade: "alta",
    receita: 15000000,
    vendedores: 2500,
    monopolio: 15,
    marketShare: 25.5,
    receitaMedia: 6000,
    ticketMedio: 450,
    produtosFull: 1200,
    crescimento: 12.5,
    subcategorias: [
      {
        id: "smartphones",
        nome: "Smartphones",
        oportunidade: "alta",
        receita: 8500000,
        vendedores: 1200,
        monopolio: 8,
        marketShare: 35.2,
        receitaMedia: 7083,
        ticketMedio: 850,
        produtosFull: 450,
        crescimento: 18.3
      },
      {
        id: "notebooks",
        nome: "Notebooks",
        oportunidade: "media",
        receita: 4200000,
        vendedores: 800,
        monopolio: 12,
        marketShare: 22.1,
        receitaMedia: 5250,
        ticketMedio: 1200,
        produtosFull: 320,
        crescimento: 8.7
      }
    ]
  },
  {
    id: "casa-jardim",
    nome: "Casa e Jardim",
    oportunidade: "media",
    receita: 8500000,
    vendedores: 3200,
    monopolio: 25,
    marketShare: 18.3,
    receitaMedia: 2656,
    ticketMedio: 180,
    produtosFull: 2100,
    crescimento: -3.2,
    subcategorias: [
      {
        id: "moveis",
        nome: "Móveis",
        oportunidade: "baixa",
        receita: 3200000,
        vendedores: 1500,
        monopolio: 35,
        marketShare: 15.8,
        receitaMedia: 2133,
        ticketMedio: 320,
        produtosFull: 800,
        crescimento: -8.1
      }
    ]
  },
  {
    id: "moda",
    nome: "Moda e Beleza",
    oportunidade: "alta",
    receita: 12000000,
    vendedores: 4500,
    monopolio: 8,
    marketShare: 30.2,
    receitaMedia: 2667,
    ticketMedio: 95,
    produtosFull: 3200,
    crescimento: 22.1
  }
];

export function SearchCategoriesTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMarketplace, setSelectedMarketplace] = useState("todos");
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);

  const getOportunidadeColor = (oportunidade: string) => {
    switch (oportunidade) {
      case "alta": return "bg-green-100 text-green-800 border-green-200";
      case "media": return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "baixa": return "bg-red-100 text-red-800 border-red-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('pt-BR').format(value);
  };

  const renderCrescimentoIndicator = (crescimento: number) => {
    const isPositive = crescimento > 0;
    return (
      <div className={`flex items-center space-x-1 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
        {isPositive ? (
          <TrendingUp className="w-4 h-4" />
        ) : (
          <TrendingDown className="w-4 h-4" />
        )}
        <span className="font-medium">{Math.abs(crescimento).toFixed(1)}%</span>
      </div>
    );
  };

  const renderCategoriaRow = (categoria: Categoria, isSubcategoria = false) => (
    <TableRow key={categoria.id} className={`hover:bg-gray-50 ${isSubcategoria ? 'bg-gray-25' : ''}`}>
      <TableCell className={isSubcategoria ? 'pl-8' : ''}>
        <div className="flex items-center space-x-2">
          {categoria.subcategorias && categoria.subcategorias.length > 0 && !isSubcategoria && (
            <Button
              variant="ghost"
              size="sm"
              className="p-1 h-6 w-6"
              onClick={() => {
                setExpandedCategories(prev => 
                  prev.includes(categoria.id) 
                    ? prev.filter(id => id !== categoria.id)
                    : [...prev, categoria.id]
                );
              }}
            >
              {expandedCategories.includes(categoria.id) ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </Button>
          )}
          <span className={`font-medium ${isSubcategoria ? 'text-gray-700' : 'text-gray-900'}`}>
            {categoria.nome}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <Badge className={getOportunidadeColor(categoria.oportunidade)}>
          {categoria.oportunidade.charAt(0).toUpperCase() + categoria.oportunidade.slice(1)}
        </Badge>
      </TableCell>
      <TableCell className="font-medium">{formatCurrency(categoria.receita)}</TableCell>
      <TableCell>{formatNumber(categoria.vendedores)}</TableCell>
      <TableCell>
        <div className="flex items-center space-x-2">
          <span>{categoria.monopolio}%</span>
          {categoria.monopolio > 30 && (
            <Badge variant="destructive" className="text-xs">Alto</Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="font-medium">{categoria.marketShare}%</TableCell>
      <TableCell>{formatCurrency(categoria.receitaMedia)}</TableCell>
      <TableCell>{formatCurrency(categoria.ticketMedio)}</TableCell>
      <TableCell>{formatNumber(categoria.produtosFull)}</TableCell>
      <TableCell>{renderCrescimentoIndicator(categoria.crescimento)}</TableCell>
    </TableRow>
  );

  const filteredCategorias = categoriasMock.filter(categoria =>
    categoria.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Filtros e Busca */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Search className="w-5 h-5 text-purple-600" />
            <span>Buscar Categorias</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Buscar categoria</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Digite o nome da categoria..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Marketplace</label>
              <Select value={selectedMarketplace} onValueChange={setSelectedMarketplace}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o marketplace" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Marketplaces</SelectItem>
                  <SelectItem value="mercadolivre">Mercado Livre</SelectItem>
                  <SelectItem value="amazon">Amazon</SelectItem>
                  <SelectItem value="shopee">Shopee</SelectItem>
                  <SelectItem value="magalu">Magazine Luiza</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Filtros</label>
              <Button variant="outline" className="w-full justify-start">
                <Filter className="w-4 h-4 mr-2" />
                Filtros Avançados
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dropdown de Categorias em Accordion */}
      <Card>
        <CardHeader>
          <CardTitle>Categorias Disponíveis</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="w-full">
            {filteredCategorias.map((categoria) => (
              <AccordionItem key={categoria.id} value={categoria.id}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center justify-between w-full mr-4">
                    <span className="font-medium">{categoria.nome}</span>
                    <div className="flex items-center space-x-2">
                      <Badge className={getOportunidadeColor(categoria.oportunidade)}>
                        {categoria.oportunidade}
                      </Badge>
                      <span className="text-sm text-gray-500">
                        {categoria.subcategorias?.length || 0} subcategorias
                      </span>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {categoria.subcategorias && categoria.subcategorias.length > 0 ? (
                    <div className="space-y-2 pl-4">
                      {categoria.subcategorias.map((sub) => (
                        <div key={sub.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <span className="font-medium text-gray-700">{sub.nome}</span>
                          <div className="flex items-center space-x-2">
                            <Badge className={getOportunidadeColor(sub.oportunidade)}>
                              {sub.oportunidade}
                            </Badge>
                            <span className="text-sm text-gray-500">
                              {formatCurrency(sub.receita)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm pl-4">Nenhuma subcategoria disponível</p>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {/* Tabela de Análise de Categorias */}
      <Card>
        <CardHeader>
          <CardTitle>Análise Detalhada de Categorias</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-48">Categoria</TableHead>
                  <TableHead>Oportunidade</TableHead>
                  <TableHead>Receita</TableHead>
                  <TableHead>Vendedores</TableHead>
                  <TableHead>Monopólio</TableHead>
                  <TableHead>Market Share</TableHead>
                  <TableHead>Receita Média</TableHead>
                  <TableHead>Ticket Médio</TableHead>
                  <TableHead>Produtos Full</TableHead>
                  <TableHead>Crescimento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCategorias.map((categoria) => (
                  <>
                    {renderCategoriaRow(categoria)}
                    {expandedCategories.includes(categoria.id) && 
                      categoria.subcategorias?.map((sub) => renderCategoriaRow(sub, true))
                    }
                  </>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}