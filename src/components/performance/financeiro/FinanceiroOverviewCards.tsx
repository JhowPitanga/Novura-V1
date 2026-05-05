import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownRight, ArrowUpRight, CircleDollarSign, Coins, HandCoins, Package, Store, Truck } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FinancialOverview } from "@/services/performance.service";

interface FinanceiroOverviewCardsProps {
    overview: FinancialOverview | undefined;
    isLoading: boolean;
    growth?: {
        total_spent?: number | null;
        marketplace_fee?: number | null;
        shipping_cost?: number | null;
        product_cost?: number | null;
        net_revenue?: number | null;
    };
}

const currency = (value: number) =>
    `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function GrowthBadge({ value }: { value?: number | null }) {
    if (value == null || !Number.isFinite(value)) return null;
    const isUp = value > 0;
    const Icon = isUp ? ArrowUpRight : ArrowDownRight;
    return (
        <span className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
            isUp ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
        }`}>
            <Icon className="h-3 w-3" />
            {isUp ? "+" : ""}{value.toFixed(1)}%
        </span>
    );
}

export function FinanceiroOverviewCards({ overview, isLoading, growth = {} }: FinanceiroOverviewCardsProps) {
    const data = overview ?? {
        total_revenue: 0,
        net_revenue: 0,
        tax_amount: 0,
        marketplace_fee: 0,
        shipping_cost: 0,
        product_cost: 0,
        total_spent: 0,
        pct_revenue: 0,
        orders_count: 0,
        by_marketplace: [],
    };

    const cards = [
        {
            title: "Gasto Total",
            value: currency(data.total_spent),
            description: `${data.pct_revenue.toFixed(1)}% do faturamento`,
            Icon: Coins,
            color: "text-violet-700",
            bg: "bg-violet-50",
            growth: growth.total_spent,
        },
        {
            title: "Comissão de Canal",
            value: currency(data.marketplace_fee),
            description: data.total_revenue > 0
                ? `${((data.marketplace_fee / data.total_revenue) * 100).toFixed(1)}% sobre as vendas`
                : "Sem vendas no período",
            Icon: HandCoins,
            color: "text-orange-700",
            bg: "bg-orange-50",
            growth: growth.marketplace_fee,
        },
        {
            title: "Custo de Frete",
            value: currency(data.shipping_cost),
            description: data.total_revenue > 0
                ? `${((data.shipping_cost / data.total_revenue) * 100).toFixed(1)}% sobre as vendas`
                : "Sem vendas no período",
            Icon: Truck,
            color: "text-blue-700",
            bg: "bg-blue-50",
            growth: growth.shipping_cost,
        },
        {
            title: "Custo de Produtos",
            value: currency(data.product_cost || 0),
            description: data.total_revenue > 0
                ? `${(((data.product_cost || 0) / data.total_revenue) * 100).toFixed(1)}% sobre as vendas`
                : "Sem vendas no período",
            Icon: Package,
            color: "text-pink-700",
            bg: "bg-pink-50",
            growth: growth.product_cost,
        },
        {
            title: "Receita Líquida",
            value: currency(data.net_revenue),
            description: `${data.orders_count} pedidos no período`,
            Icon: CircleDollarSign,
            color: "text-emerald-700",
            bg: "bg-emerald-50",
            growth: growth.net_revenue,
        },
    ];

    const compositionData = [
        { key: "tax", name: "Imposto", value: data.tax_amount, color: "#7C3AED" },
        { key: "commission", name: "Comissão", value: data.marketplace_fee, color: "#F97316" },
        { key: "shipping", name: "Frete", value: data.shipping_cost, color: "#2563EB" },
        { key: "products", name: "Produtos", value: data.product_cost || 0, color: "#EC4899" },
    ];

    const totalSpent = data.total_spent || 0;
    const pct = (value: number) => totalSpent > 0 ? ((value / totalSpent) * 100).toFixed(1) : "0.0";
    const sortedChannels = useMemo(
        () => [...(data.by_marketplace || [])].sort((a, b) => b.revenue - a.revenue),
        [data.by_marketplace],
    );

    return (
        <div className="space-y-6">
            <Card className="border-violet-100 shadow-sm">
                <CardHeader>
                    <CardTitle>Resumo Financeiro</CardTitle>
                    <CardDescription>Visão dos custos e retorno no período selecionado.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                        {cards.map(({ title, value, description, Icon, color, growth: growthValue }) => (
                            <div key={title} className="rounded-2xl border bg-white p-4 shadow-sm">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-medium text-gray-600">{title}</p>
                                    <Icon className={`h-5 w-5 ${color}`} />
                                </div>
                                {isLoading ? (
                                    <Skeleton className="h-8 w-32 mt-4" />
                                ) : (
                                    <p className="text-2xl font-bold text-gray-900 mt-4">{value}</p>
                                )}
                                {!isLoading && <GrowthBadge value={growthValue} />}
                                <p className="text-xs text-gray-500 mt-1">{description}</p>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <Card className="border-violet-100 shadow-sm">
                <CardHeader>
                    <CardTitle>Composição do Gasto</CardTitle>
                    <CardDescription>Distribuição entre imposto, comissão e frete.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <Skeleton className="h-[320px] w-full" />
                    ) : totalSpent === 0 ? (
                        <p className="text-sm text-gray-500 py-10 text-center">Sem gastos financeiros no período selecionado.</p>
                    ) : (
                        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                            <div className="h-[280px] rounded-2xl border p-4">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={compositionData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                        <YAxis tickFormatter={(value) => `R$ ${Number(value).toLocaleString("pt-BR")}`} tick={{ fontSize: 12 }} />
                                        <Tooltip formatter={(value: number) => currency(Number(value))} />
                                        <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                                            {compositionData.map((entry) => (
                                                <Cell key={entry.key} fill={entry.color} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="space-y-3">
                                {compositionData.map((item) => (
                                    <div key={item.key} className="rounded-xl border bg-white p-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-semibold text-gray-700">{item.name}</span>
                                            <span className="text-sm font-bold" style={{ color: item.color }}>{currency(item.value)}</span>
                                        </div>
                                        <div className="mt-2 h-2 rounded-full bg-gray-100">
                                            <div
                                                className="h-full rounded-full"
                                                style={{ width: `${pct(item.value)}%`, backgroundColor: item.color }}
                                            />
                                        </div>
                                        <p className="mt-1 text-xs text-gray-500">{pct(item.value)}% do gasto total</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card className="border-violet-100 shadow-sm">
                <CardHeader>
                    <CardTitle>Financeiro canais de venda</CardTitle>
                    <CardDescription>Resumo financeiro por canal no período selecionado.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <Skeleton className="h-[220px] w-full" />
                    ) : (sortedChannels.length || 0) === 0 ? (
                        <p className="text-sm text-gray-500 py-10 text-center">Sem dados por canal no período selecionado.</p>
                    ) : (
                        <div className="overflow-hidden rounded-2xl border border-gray-100">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-violet-50/70">
                                        <TableHead>Canal</TableHead>
                                        <TableHead className="text-right">Vendas brutas</TableHead>
                                        <TableHead className="text-right">Taxas de comissão</TableHead>
                                        <TableHead className="text-right">Frete pelo vendedor</TableHead>
                                        <TableHead className="text-right">Imposto</TableHead>
                                        <TableHead className="text-right">Gasto com produto</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sortedChannels.map((row) => (
                                        <TableRow key={row.marketplace} className="hover:bg-violet-50/30">
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <div className="h-7 w-7 rounded-lg bg-violet-100 flex items-center justify-center">
                                                        <Store className="h-4 w-4 text-violet-700" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-semibold text-gray-900">{row.marketplace}</p>
                                                        <p className="text-xs text-gray-500">Imposto: {row.tax_rate_pct.toFixed(2)}%</p>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums font-medium">{currency(row.revenue)}</TableCell>
                                            <TableCell className="text-right tabular-nums">{currency(row.marketplace_fee)}</TableCell>
                                            <TableCell className="text-right tabular-nums">{currency(row.shipping_cost)}</TableCell>
                                            <TableCell className="text-right tabular-nums">{currency(row.tax_amount)}</TableCell>
                                            <TableCell className="text-right tabular-nums">{currency(row.product_cost || 0)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
