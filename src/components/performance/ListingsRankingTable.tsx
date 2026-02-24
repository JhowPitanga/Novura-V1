import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ListingRankingItem } from "@/hooks/useListingsRanking";

interface ListingsRankingTableProps {
    listings: ListingRankingItem[];
    isLoading: boolean;
}

export function ListingsRankingTable({ listings, isLoading }: ListingsRankingTableProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Anúncios Vendidos no Período</CardTitle>
                <CardDescription>Mais vendidos no período filtrado (por data de pagamento)</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>SKU</TableHead>
                            <TableHead>Marketplace</TableHead>
                            <TableHead>Pedidos</TableHead>
                            <TableHead>Unidades Vendidas</TableHead>
                            <TableHead>Valor Total</TableHead>
                            <TableHead>Margem</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-sm text-gray-600">
                                    Carregando ranking de anúncios...
                                </TableCell>
                            </TableRow>
                        ) : listings.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-sm text-gray-600">
                                    Sem vendas no período selecionado.
                                </TableCell>
                            </TableRow>
                        ) : listings.map((ad) => (
                            <TableRow key={ad.marketplace_item_id}>
                                <TableCell className="font-medium">{ad.marketplace_item_id}</TableCell>
                                <TableCell>
                                    <Badge variant="outline">{ad.marketplace}</Badge>
                                </TableCell>
                                <TableCell>{ad.pedidos}</TableCell>
                                <TableCell>{ad.unidades}</TableCell>
                                <TableCell>
                                    R$ {ad.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </TableCell>
                                <TableCell>
                                    <Badge variant={ad.margem >= 0 ? "default" : "secondary"}>
                                        {(ad.margem * 100).toFixed(1)}%
                                    </Badge>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
