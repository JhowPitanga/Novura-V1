import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AbcBadge } from "@/components/performance/AbcBadge";
import { ProductChannelMixCell } from "./ProductChannelMixCell";
import { LinkedAdsDrawer } from "./LinkedAdsDrawer";
import type { AbcProductRow, AbcListingRow, ProductChannelMix } from "@/services/performance.service";
import { ChevronLeft, ChevronRight, Package } from "lucide-react";

interface ProductsSubTabProps {
    products: AbcProductRow[];
    allListings: AbcListingRow[];
    channelMixes: ProductChannelMix[];
    productModelsByProduct: Record<string, string[]>;
    isLoading: boolean;
    searchTerm: string;
}

const fmtBRL = (value: number) =>
    `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function MarginCell({ margin_brl, margin_pct }: { margin_brl?: number | null; margin_pct?: number | null }) {
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

function ImageCell({ src, alt }: { src?: string; alt: string }) {
    return (
        <div className="h-12 w-12 overflow-hidden rounded-xl border bg-gray-50 flex items-center justify-center">
            {src ? (
                <img src={src} alt={alt} className="h-full w-full object-cover" />
            ) : (
                <Package className="h-5 w-5 text-gray-300" />
            )}
        </div>
    );
}

export function ProductsSubTab({
    products, allListings, channelMixes, productModelsByProduct, isLoading, searchTerm,
}: ProductsSubTabProps) {
    const [drawerProduct, setDrawerProduct] = useState<{ id: string; nome: string } | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 10;

    const mixByProduct = useMemo(() => {
        const map: Record<string, ProductChannelMix[]> = {};
        for (const m of channelMixes) {
            if (!map[m.product_id]) map[m.product_id] = [];
            map[m.product_id].push(m);
        }
        return map;
    }, [channelMixes]);

    const filtered = useMemo(() => {
        if (!searchTerm) return products;
        const term = searchTerm.toLowerCase();
        return products.filter(
            (p) =>
                p.nome.toLowerCase().includes(term) ||
                String(p.sku || "").toLowerCase().includes(term) ||
                p.id.toLowerCase().includes(term),
        );
    }, [products, searchTerm]);
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const currentPageSafe = Math.min(currentPage, totalPages);
    const paginated = useMemo(
        () => filtered.slice((currentPageSafe - 1) * pageSize, currentPageSafe * pageSize),
        [filtered, currentPageSafe],
    );

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, products.length]);

    const drawerListingIds = drawerProduct ? (productModelsByProduct[drawerProduct.id] ?? []) : [];

    return (
        <>
            <Card className="border-violet-100 shadow-sm">
                <CardHeader className="pb-3">
                    <CardTitle>Produtos por Desempenho</CardTitle>
                    <CardDescription>
                        Produtos cadastrados no sistema, agrupando os anúncios vinculados vendidos no período
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="overflow-hidden rounded-2xl border border-gray-100">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-violet-50/70">
                                    <TableHead>Produto</TableHead>
                                    <TableHead className="text-center">Curva</TableHead>
                                    <TableHead>Mix por canal</TableHead>
                                    <TableHead className="text-right">Pedidos</TableHead>
                                    <TableHead className="text-right">Unidades</TableHead>
                                    <TableHead className="text-right">Faturamento</TableHead>
                                    <TableHead className="text-right">% total</TableHead>
                                    <TableHead className="text-right">Margem</TableHead>
                                    <TableHead className="text-right">Vínculos</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <TableRow key={i}>
                                            {Array.from({ length: 9 }).map((_, j) => (
                                                <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                                            ))}
                                        </TableRow>
                                    ))
                                ) : filtered.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="text-sm text-gray-500 text-center py-8">
                                            Sem produtos cadastrados com venda para os filtros selecionados.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    paginated.map((p) => {
                                        const mixes = mixByProduct[p.id] ?? [];
                                        const vinculos = (productModelsByProduct[p.id] ?? []).length;
                                        return (
                                            <TableRow
                                                key={p.id}
                                                className="cursor-pointer hover:bg-violet-50/40"
                                                onClick={() => setDrawerProduct({ id: p.id, nome: p.nome })}
                                            >
                                                <TableCell className="min-w-[320px]">
                                                    <div className="flex items-center gap-3">
                                                        <ImageCell src={p.image_url} alt={p.nome} />
                                                        <div className="min-w-0">
                                                            <p className="line-clamp-1 text-sm font-semibold text-gray-900" title={p.nome}>
                                                                {p.nome}
                                                            </p>
                                                            <p className="mt-1 text-xs text-gray-500">
                                                                SKU: <span className="font-medium text-gray-700">{p.sku || "Sem SKU"}</span>
                                                            </p>
                                                            <p className="text-xs text-gray-400">ID: {p.id}</p>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center"><AbcBadge tag={p.tag} /></TableCell>
                                                <TableCell><ProductChannelMixCell mixes={mixes} /></TableCell>
                                                <TableCell className="text-right tabular-nums text-sm">{(p.pedidos ?? 0).toLocaleString("pt-BR")}</TableCell>
                                                <TableCell className="text-right tabular-nums text-sm">{p.unidades.toLocaleString("pt-BR")}</TableCell>
                                                <TableCell className="text-right tabular-nums text-sm font-semibold">{fmtBRL(p.valor)}</TableCell>
                                                <TableCell className="text-right tabular-nums text-sm text-gray-500">{p.pct.toFixed(1)}%</TableCell>
                                                <TableCell className="text-right">
                                                    <MarginCell margin_brl={p.margin_brl} margin_pct={p.margin_pct} />
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
                                                        {vinculos} {vinculos === 1 ? "anúncio" : "anúncios"}
                                                    </span>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
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

            <LinkedAdsDrawer
                open={!!drawerProduct}
                onClose={() => setDrawerProduct(null)}
                productName={drawerProduct?.nome ?? ""}
                linkedListingIds={drawerListingIds}
                allListings={allListings}
            />
        </>
    );
}
