import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronRight, Medal, Package } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { AbcProductRow, SoldListing } from "@/services/performance.service";
import { computeAbc } from "@/utils/abc";
import { AbcBadge } from "./AbcBadge";

interface Top10ProductsRankingProps {
    products: AbcProductRow[];
    listings: SoldListing[];
    isLoadingProducts: boolean;
    isLoadingListings: boolean;
}

type Criterion = "valor" | "unidades";
type ActiveTab = "produtos" | "anuncios";

type ProductRankRow = {
    id: string;
    nome: string;
    sku: string;
    image_url: string;
    pedidos: number;
    unidades: number;
    valor: number;
    tag: "A" | "B" | "C";
};

const fmtBRL = (v: number) =>
    `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const MEDAL_COLORS = ["text-yellow-400", "text-gray-400", "text-amber-700"];

function RankingMedal({ index }: { index: number }) {
    if (index < 3) return <Medal className={`h-4 w-4 mx-auto ${MEDAL_COLORS[index]}`} />;
    return <span className="text-xs font-semibold text-gray-400">{index + 1}</span>;
}

function ImageCell({ src, alt }: { src?: string; alt: string }) {
    return (
        <div className="w-11 h-11 rounded-xl border bg-gray-50 overflow-hidden flex items-center justify-center">
            {src ? (
                <img src={src} alt={alt} className="w-full h-full object-cover" />
            ) : (
                <Package className="h-5 w-5 text-gray-300" />
            )}
        </div>
    );
}

function LoadingRows() {
    return (
        <>
            {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-5" /></TableCell>
                    <TableCell><Skeleton className="h-11 w-11 rounded-xl" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-64" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-5" /></TableCell>
                </TableRow>
            ))}
        </>
    );
}

function recomputeAbcTag<T extends { id: string; valor: number; unidades: number }>(
    rows: T[],
    criterion: Criterion,
): Array<T & { tag: "A" | "B" | "C" }> {
    const abc = computeAbc(
        rows.map((r) => ({ id: r.id, label: r.id, valor: r.valor, unidades: r.unidades })),
        criterion,
    );
    const byId = Object.fromEntries(abc.map((a) => [a.id, a.tag as "A" | "B" | "C"]));
    return rows.map((r) => ({ ...r, tag: byId[r.id] ?? "C" }));
}

function buildProductRowsFromListings(listings: SoldListing[]): ProductRankRow[] {
    const agg: Record<string, ProductRankRow> = {};
    listings.forEach((listing) => {
        const key = (listing.sku || listing.titulo || listing.id).trim();
        if (!agg[key]) {
            agg[key] = {
                id: key || listing.id,
                nome: listing.titulo,
                sku: listing.sku || "",
                image_url: listing.image_url || "",
                pedidos: 0,
                unidades: 0,
                valor: 0,
                tag: listing.tag,
            };
        }
        agg[key].pedidos += listing.pedidos;
        agg[key].unidades += listing.unidades;
        agg[key].valor += listing.valor;
        if (!agg[key].image_url && listing.image_url) agg[key].image_url = listing.image_url;
    });
    return Object.values(agg);
}

function SegmentedButton({
    active,
    children,
    onClick,
}: {
    active: boolean;
    children: React.ReactNode;
    onClick: () => void;
}) {
    return (
        <button
            className={`px-3 py-1.5 text-xs rounded-lg transition-all duration-200 ${
                active
                    ? "bg-violet-600 text-white shadow-sm"
                    : "text-gray-600 hover:bg-violet-50 hover:text-violet-700"
            }`}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

export function Top10ProductsRanking({
    products,
    listings,
    isLoadingProducts,
    isLoadingListings,
}: Top10ProductsRankingProps) {
    const navigate = useNavigate();
    const [criterion, setCriterion] = useState<Criterion>("valor");
    const [activeTab, setActiveTab] = useState<ActiveTab>("produtos");

    const preparedProducts = useMemo(() => {
        const fromProducts = products
            .filter((product) => !String(product.id || "").startsWith("item:"))
            .map((product) => ({
            id: product.id,
            nome: product.nome,
            sku: product.sku || "",
            image_url: product.image_url || "",
            pedidos: product.pedidos ?? 0,
            unidades: product.unidades,
            valor: product.valor,
            tag: product.tag,
        }));

        const fallbackFromListings = buildProductRowsFromListings(listings);
        // Produtos: somente itens cadastrados e vinculados no sistema.
        // Se não houver vínculo suficiente, usamos fallback apenas para evitar vazio.
        const base = fromProducts.length > 0 ? fromProducts : fallbackFromListings;
        const sorted = [...base].sort((a, b) =>
            criterion === "valor" ? b.valor - a.valor : b.unidades - a.unidades,
        );
        return recomputeAbcTag(sorted, criterion).slice(0, 10);
    }, [products, listings, criterion]);

    const preparedListings = useMemo(() => {
        const sorted = [...listings].sort((a, b) =>
            criterion === "valor" ? b.valor - a.valor : b.unidades - a.unidades,
        );
        // Mantém os valores originais de pedidos/unidades/valor; apenas reordena.
        return sorted.slice(0, 10) as ListingRankRow[];
    }, [listings, criterion]);

    const criterionLabel = criterion === "valor" ? "faturamento" : "unidades";

    return (
        <Card>
            <CardHeader className="pb-3 gap-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <CardTitle>Top 10 de Vendas</CardTitle>
                        <CardDescription>Ranking por {criterionLabel} no per?odo selecionado</CardDescription>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <div className="text-xs text-violet-600 font-medium">
                            Ordene a Curva ABC entre vendas e unidades &gt;
                        </div>

                        <div className="inline-flex rounded-xl border border-violet-100 bg-white p-1 shadow-sm">
                            <SegmentedButton active={criterion === "valor"} onClick={() => setCriterion("valor")}>
                                R$
                            </SegmentedButton>
                            <SegmentedButton active={criterion === "unidades"} onClick={() => setCriterion("unidades")}>
                                Unidades
                            </SegmentedButton>
                        </div>

                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-violet-600 hover:text-violet-700 hover:bg-violet-50 gap-1 text-xs"
                            onClick={() => navigate("/desempenho/produtos")}
                        >
                            Ver todos
                            <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="px-6 pb-5">
                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ActiveTab)} className="w-full">
                    <TabsList className="mb-4 h-10 rounded-xl border border-gray-100 bg-white p-1 shadow-sm">
                        <TabsTrigger
                            value="produtos"
                            className="rounded-lg px-4 data-[state=active]:bg-violet-600 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all duration-200"
                        >
                            Produtos
                        </TabsTrigger>
                        <TabsTrigger
                            value="anuncios"
                            className="rounded-lg px-4 data-[state=active]:bg-violet-600 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all duration-200"
                        >
                            An?ncios
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="produtos" className="mt-0 transition-opacity duration-200">
                        <div className="rounded-2xl border overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-violet-50/70">
                                        <TableHead className="w-16 text-center">Rank</TableHead>
                                        <TableHead className="w-16">Foto</TableHead>
                                        <TableHead>Dados do produto</TableHead>
                                        <TableHead className="text-right">Pedidos</TableHead>
                                        <TableHead className="text-right">Unidades</TableHead>
                                        <TableHead className="text-right">Faturamento</TableHead>
                                        <TableHead className="text-center">Curva</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoadingProducts ? (
                                        <LoadingRows />
                                    ) : preparedProducts.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-sm text-gray-400 py-8 text-center">
                                                Sem dados de produtos para o per?odo selecionado.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        preparedProducts.map((product, idx) => (
                                            <TableRow key={product.id} className="hover:bg-violet-50/40">
                                                <TableCell className="text-center"><RankingMedal index={idx} /></TableCell>
                                                <TableCell><ImageCell src={product.image_url} alt={product.nome} /></TableCell>
                                                <TableCell>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-semibold text-gray-800 truncate" title={product.nome}>
                                                            {product.nome}
                                                        </p>
                                                        <p className="text-xs text-gray-400 truncate">
                                                            SKU: {product.sku || "Sem SKU"} ? ID: {product.id}
                                                        </p>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">{(product.pedidos ?? 0).toLocaleString("pt-BR")}</TableCell>
                                                <TableCell className="text-right">{product.unidades.toLocaleString("pt-BR")}</TableCell>
                                                <TableCell className="text-right font-semibold">{fmtBRL(product.valor)}</TableCell>
                                                <TableCell className="text-center"><AbcBadge tag={product.tag} /></TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </TabsContent>

                    <TabsContent value="anuncios" className="mt-0 transition-opacity duration-200">
                        <div className="rounded-2xl border overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-violet-50/70">
                                        <TableHead className="w-16 text-center">Rank</TableHead>
                                        <TableHead className="w-16">Foto</TableHead>
                                        <TableHead>Dados do an?ncio</TableHead>
                                        <TableHead className="text-right">Pedidos</TableHead>
                                        <TableHead className="text-right">Unidades</TableHead>
                                        <TableHead className="text-right">Faturamento</TableHead>
                                        <TableHead className="text-center">Curva</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoadingListings ? (
                                        <LoadingRows />
                                    ) : preparedListings.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-sm text-gray-400 py-8 text-center">
                                                Sem dados de an?ncios para o per?odo selecionado.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        preparedListings.map((listing, idx) => (
                                            <TableRow key={listing.id} className="hover:bg-violet-50/40">
                                                <TableCell className="text-center"><RankingMedal index={idx} /></TableCell>
                                                <TableCell><ImageCell src={listing.image_url} alt={listing.titulo} /></TableCell>
                                                <TableCell>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-semibold text-gray-800 truncate" title={listing.titulo}>
                                                            {listing.titulo}
                                                        </p>
                                                        <p className="text-xs text-gray-400 truncate">
                                                            SKU: {listing.sku || "Sem SKU"} ? ID: {listing.id} ? {listing.marketplace}
                                                        </p>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">{listing.pedidos.toLocaleString("pt-BR")}</TableCell>
                                                <TableCell className="text-right">{listing.unidades.toLocaleString("pt-BR")}</TableCell>
                                                <TableCell className="text-right font-semibold">{fmtBRL(listing.valor)}</TableCell>
                                                <TableCell className="text-center"><AbcBadge tag={listing.tag} /></TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}
