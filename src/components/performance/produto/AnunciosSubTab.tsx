import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AbcBadge } from "@/components/performance/AbcBadge";
import { ChevronLeft, ChevronRight, Package } from "lucide-react";
import type { SoldListing } from "@/services/performance.service";

interface AnunciosSubTabProps {
    listings: SoldListing[];
    isLoading: boolean;
    searchTerm: string;
}

const fmtBRL = (value: number) =>
    `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function MarginCell({ margin_brl, margin_pct }: { margin_brl: number | null; margin_pct: number | null }) {
    if (margin_brl == null || margin_pct == null) {
        return <span className="text-xs text-gray-400">—</span>;
    }
    const isPositive = margin_brl >= 0;
    return (
        <div className="flex flex-col items-end gap-0.5">
            <span className={`text-sm font-semibold tabular-nums ${isPositive ? "text-emerald-600" : "text-rose-600"}`}>
                {fmtBRL(margin_brl)}
            </span>
            <span className={`text-xs ${isPositive ? "text-emerald-500" : "text-rose-500"}`}>
                {margin_pct.toFixed(1)}%
            </span>
        </div>
    );
}

function mktColor(marketplace: string): string {
    if (marketplace.includes("Shopee") || marketplace === "shopee") return "bg-orange-100 text-orange-700";
    if (marketplace.includes("Mercado") || marketplace === "mercadolivre") return "bg-yellow-100 text-yellow-800";
    return "bg-violet-100 text-violet-700";
}

export function AnunciosSubTab({ listings, isLoading, searchTerm }: AnunciosSubTabProps) {
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 10;

    const filtered = useMemo(() => {
        if (!searchTerm) return listings;
        const term = searchTerm.toLowerCase();
        return listings.filter(
            (a) =>
                a.titulo.toLowerCase().includes(term) ||
                a.id.toLowerCase().includes(term) ||
                a.sku.toLowerCase().includes(term) ||
                a.marketplace.toLowerCase().includes(term),
        );
    }, [listings, searchTerm]);
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const currentPageSafe = Math.min(currentPage, totalPages);
    const paginated = useMemo(
        () => filtered.slice((currentPageSafe - 1) * pageSize, currentPageSafe * pageSize),
        [filtered, currentPageSafe],
    );

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, listings.length]);

    return (
        <Card className="border-violet-100 shadow-sm">
            <CardHeader className="pb-3">
                <CardTitle>Anúncios por Desempenho</CardTitle>
                <CardDescription>
                    Anúncios vendidos por SKU, ID do anúncio e canal de venda no período
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="overflow-hidden rounded-2xl border border-gray-100">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-violet-50/70">
                                <TableHead>Anúncio</TableHead>
                                <TableHead>Canal</TableHead>
                                <TableHead className="text-center">Curva</TableHead>
                                <TableHead className="text-right">Pedidos</TableHead>
                                <TableHead className="text-right">Unidades</TableHead>
                                <TableHead className="text-right">Faturamento</TableHead>
                                <TableHead className="text-right">% total</TableHead>
                                <TableHead className="text-right">Margem</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                Array.from({ length: 6 }).map((_, i) => (
                                    <TableRow key={i}>
                                        {Array.from({ length: 8 }).map((_, j) => (
                                            <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                                        ))}
                                    </TableRow>
                                ))
                            ) : filtered.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-sm text-gray-500 text-center py-8">
                                        Nenhum anúncio com venda para os filtros selecionados.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                paginated.map((a) => (
                                    <TableRow key={a.id} className="hover:bg-violet-50/40">
                                        <TableCell className="min-w-[360px]">
                                            <div className="flex items-center gap-3">
                                                {a.image_url ? (
                                                    <img
                                                        src={a.image_url}
                                                        alt={a.titulo}
                                                        className="h-12 w-12 rounded-xl object-cover bg-gray-50 border"
                                                    />
                                                ) : (
                                                    <div className="h-12 w-12 rounded-xl bg-gray-50 border flex items-center justify-center">
                                                        <Package className="h-5 w-5 text-gray-300" />
                                                    </div>
                                                )}
                                                <div className="min-w-0">
                                                    <p className="line-clamp-1 text-sm font-semibold text-gray-900" title={a.titulo}>
                                                        {a.titulo}
                                                    </p>
                                                    <p className="mt-1 text-xs text-gray-500">
                                                        SKU: <span className="font-medium text-gray-700">{a.sku || "Sem SKU"}</span>
                                                    </p>
                                                    <p className="text-xs text-gray-400">ID do anúncio: {a.id}</p>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge className={`${mktColor(a.marketplace)} border-0 text-xs`} variant="outline">
                                                {a.marketplace}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-center"><AbcBadge tag={a.tag} /></TableCell>
                                        <TableCell className="text-right tabular-nums text-sm">{a.pedidos.toLocaleString("pt-BR")}</TableCell>
                                        <TableCell className="text-right tabular-nums text-sm">{a.unidades.toLocaleString("pt-BR")}</TableCell>
                                        <TableCell className="text-right tabular-nums text-sm font-semibold">{fmtBRL(a.valor)}</TableCell>
                                        <TableCell className="text-right tabular-nums text-sm text-gray-500">{a.pct.toFixed(1)}%</TableCell>
                                        <TableCell className="text-right">
                                            <MarginCell margin_brl={a.margin_brl ?? null} margin_pct={a.margin_pct} />
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
                {!isLoading && filtered.length > 0 && (
                    <div className="mt-3 flex items-center justify-end gap-2">
                        <Button
                            variant="outline"
                            className={`h-9 w-9 p-0 rounded-2xl ${currentPageSafe > 1 ? "text-primary" : "text-gray-300"}`}
                            disabled={currentPageSafe === 1}
                            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                            aria-label="Página anterior"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <div className="w-[56px] text-center text-sm font-medium">
                            {currentPageSafe}/{totalPages}
                        </div>
                        <Button
                            variant="outline"
                            className={`h-9 w-9 p-0 rounded-2xl ${currentPageSafe < totalPages ? "text-primary" : "text-gray-300"}`}
                            disabled={currentPageSafe === totalPages}
                            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                            aria-label="Próxima página"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
