import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import type { ProductPerformanceItem, ListingPerformanceItem } from "@/services/performance.service";

interface ProductPerformanceTableProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
    produtosData: ProductPerformanceItem[];
    anunciosData: ListingPerformanceItem[];
    productModelsByProduct: Record<string, string[]>;
    isLoading: boolean;
    selectedMarketplace: string;
    onMarketplaceChange: (value: string) => void;
}

export function ProductPerformanceTable({
    activeTab, onTabChange,
    produtosData, anunciosData, productModelsByProduct,
    isLoading, selectedMarketplace, onMarketplaceChange,
}: ProductPerformanceTableProps) {
    const marketplacesFromAnuncios = Array.from(new Set(anunciosData.map((a) => String(a.marketplace || 'Outros'))));
    const filteredAnuncios = selectedMarketplace === 'todos'
        ? anunciosData
        : anunciosData.filter((a) => a.marketplace === selectedMarketplace);

    return (
        <div className="space-y-6">
            <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
                {(["produtos", "anuncios"] as const).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => onTabChange(tab)}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                            activeTab === tab ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
                        }`}
                    >
                        {tab === "produtos" ? "Produtos" : "Anúncios"}
                    </button>
                ))}
            </div>

            {activeTab === "produtos" && (
                <Card>
                    <CardHeader>
                        <CardTitle>Produtos por Desempenho</CardTitle>
                        <CardDescription>Lista de produtos vendidos no período</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Produto</TableHead>
                                    <TableHead>Pedidos</TableHead>
                                    <TableHead>Unidades Vendidas</TableHead>
                                    <TableHead>Valor Total</TableHead>
                                    <TableHead>Vínculos</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-sm text-gray-600">Carregando produtos...</TableCell>
                                    </TableRow>
                                ) : produtosData.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-sm text-gray-600">Sem vendas no período selecionado.</TableCell>
                                    </TableRow>
                                ) : produtosData.map((produto) => (
                                    <TableRow key={produto.id}>
                                        <TableCell className="font-medium">{produto.nome}</TableCell>
                                        <TableCell>{produto.pedidos}</TableCell>
                                        <TableCell>{produto.unidades}</TableCell>
                                        <TableCell>
                                            R$ {produto.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </TableCell>
                                        <TableCell>
                                            <Drawer shouldScaleBackground={false} direction="right">
                                                <DrawerTrigger asChild>
                                                    <Button variant="outline" size="sm">
                                                        {produto.vinculos} vínculos
                                                    </Button>
                                                </DrawerTrigger>
                                                <DrawerContent className="w-[35%] p-6 overflow-y-auto overflow-x-hidden fixed right-0 shadow-none rounded-l-3xl ring-1 ring-gray-200/60 bg-white z-[10001]">
                                                    <DrawerHeader>
                                                        <DrawerTitle>Anúncios Vinculados</DrawerTitle>
                                                        <DrawerDescription>
                                                            Lista de anúncios para {produto.nome}
                                                        </DrawerDescription>
                                                    </DrawerHeader>
                                                    <div className="p-6 space-y-4">
                                                        {anunciosData
                                                            .filter((a) => (productModelsByProduct[produto.id] || []).includes(a.id))
                                                            .map((anuncio) => (
                                                                <div key={anuncio.id} className="flex justify-between items-center p-4 border rounded-lg">
                                                                    <div>
                                                                        <h4 className="font-medium">{anuncio.titulo}</h4>
                                                                        <Badge variant="outline">{anuncio.marketplace}</Badge>
                                                                    </div>
                                                                    <div className="text-right">
                                                                        <p className="font-semibold">{anuncio.vendas} vendas</p>
                                                                        <p className="text-sm text-gray-600">
                                                                            R$ {anuncio.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                    </div>
                                                </DrawerContent>
                                            </Drawer>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {activeTab === "anuncios" && (
                <Card>
                    <CardHeader>
                        <CardTitle>Anúncios por Desempenho</CardTitle>
                        <CardDescription>Lista de anúncios vendidos no período</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex space-x-4 mb-4">
                            <Select value={selectedMarketplace} onValueChange={onMarketplaceChange}>
                                <SelectTrigger className="w-[220px]">
                                    <SelectValue placeholder="Marketplace" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="todos">Todos</SelectItem>
                                    {marketplacesFromAnuncios.map((mk) => (
                                        <SelectItem key={mk} value={mk}>{mk}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Imagem</TableHead>
                                    <TableHead>Anúncio</TableHead>
                                    <TableHead>Marketplace</TableHead>
                                    <TableHead>Vendas</TableHead>
                                    <TableHead>Valor Unitário</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-sm text-gray-600">Carregando anúncios...</TableCell>
                                    </TableRow>
                                ) : filteredAnuncios.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-sm text-gray-600">Sem vendas no período selecionado.</TableCell>
                                    </TableRow>
                                ) : filteredAnuncios.map((anuncio) => (
                                    <TableRow key={anuncio.id}>
                                        <TableCell>
                                            {anuncio.image_url
                                                ? <img src={anuncio.image_url} alt={anuncio.titulo} className="w-12 h-12 rounded-md object-cover" />
                                                : <div className="w-12 h-12 rounded-md bg-gray-200" />
                                            }
                                        </TableCell>
                                        <TableCell className="font-medium">{anuncio.titulo}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{anuncio.marketplace}</Badge>
                                        </TableCell>
                                        <TableCell>{anuncio.vendas}</TableCell>
                                        <TableCell>
                                            R$ {anuncio.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
