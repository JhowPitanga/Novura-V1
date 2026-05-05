import { useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { StateSale } from "@/services/performance.service";

// [row, col, uf] — geographic tile layout of Brazilian states
const BRAZIL_TILES: [number, number, string][] = [
    [0, 3, "RR"], [0, 7, "AP"],
    [1, 1, "AM"], [1, 5, "PA"], [1, 7, "MA"],
    [2, 0, "AC"], [2, 1, "RO"], [2, 4, "TO"], [2, 7, "PI"], [2, 8, "CE"], [2, 9, "RN"],
    [3, 3, "MT"], [3, 5, "GO"], [3, 6, "DF"], [3, 7, "MG"], [3, 8, "PB"], [3, 9, "PE"],
    [4, 4, "MS"],               [4, 7, "BA"], [4, 8, "AL"], [4, 9, "SE"],
    [5, 5, "SP"],               [5, 8, "ES"], [5, 9, "RJ"],
    [6, 5, "PR"],
    [7, 4, "SC"],
    [8, 4, "RS"],
];

const COLS = 10;
const ROWS = 9;
const TILE = 44; // px per tile
const GAP = 4;

interface BrazilSalesMapProps {
    data: StateSale[];
}

function pctToColor(pct: number, maxPct: number): string {
    if (maxPct === 0) return "#EDE9FE";
    const intensity = Math.min(pct / maxPct, 1);
    // violet-100 → violet-700: interpolate
    const r = Math.round(237 - intensity * (237 - 109));
    const g = Math.round(233 - intensity * (233 - 40));
    const b = Math.round(254 - intensity * (254 - 217));
    return `rgb(${r},${g},${b})`;
}

export function BrazilSalesMap({ data }: BrazilSalesMapProps) {
    const [hovered, setHovered] = useState<string | null>(null);
    const byUf = Object.fromEntries(data.map((d) => [d.uf, d]));
    const maxPct = Math.max(...data.map((d) => d.pct_total), 0);

    const width = COLS * (TILE + GAP) - GAP;
    const height = ROWS * (TILE + GAP) - GAP;

    return (
        <TooltipProvider delayDuration={100}>
            <svg
                viewBox={`0 0 ${width} ${height}`}
                width="100%"
                style={{ maxWidth: width }}
                className="mx-auto"
                aria-label="Mapa de vendas por estado"
            >
                {BRAZIL_TILES.map(([row, col, uf]) => {
                    const x = col * (TILE + GAP);
                    const y = row * (TILE + GAP);
                    const sale = byUf[uf];
                    const fill = sale ? pctToColor(sale.pct_total, maxPct) : "#F3F0FF";
                    const isActive = hovered === uf;

                    return (
                        <Tooltip key={uf}>
                            <TooltipTrigger asChild>
                                <g
                                    onMouseEnter={() => setHovered(uf)}
                                    onMouseLeave={() => setHovered(null)}
                                    style={{ cursor: sale ? "pointer" : "default" }}
                                >
                                    <rect
                                        x={x}
                                        y={y}
                                        width={TILE}
                                        height={TILE}
                                        rx={6}
                                        fill={fill}
                                        stroke={isActive ? "#7C3AED" : sale ? "#C4B5FD" : "#E9D5FF"}
                                        strokeWidth={isActive ? 2 : 1}
                                    />
                                    <text
                                        x={x + TILE / 2}
                                        y={y + TILE / 2 - 3}
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        fontSize={11}
                                        fontWeight="600"
                                        fill={sale ? (sale.pct_total / maxPct > 0.6 ? "#fff" : "#4C1D95") : "#A78BFA"}
                                    >
                                        {uf}
                                    </text>
                                    {sale && (
                                        <text
                                            x={x + TILE / 2}
                                            y={y + TILE / 2 + 10}
                                            textAnchor="middle"
                                            dominantBaseline="middle"
                                            fontSize={8.5}
                                            fill={sale.pct_total / maxPct > 0.6 ? "#DDD6FE" : "#7C3AED"}
                                        >
                                            {sale.pct_total.toFixed(0)}%
                                        </text>
                                    )}
                                </g>
                            </TooltipTrigger>
                            {sale && (
                                <TooltipContent side="top" className="text-xs space-y-0.5 min-w-[140px]">
                                    <p className="font-semibold text-sm">{sale.state_name} ({uf})</p>
                                    <p>Vendas: <span className="font-medium">R$ {sale.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span></p>
                                    <p>Pedidos: <span className="font-medium">{sale.pedidos}</span></p>
                                    <p>Ticket médio: <span className="font-medium">R$ {sale.ticket_medio.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span></p>
                                    <p>% do total: <span className="font-medium">{sale.pct_total.toFixed(1)}%</span></p>
                                </TooltipContent>
                            )}
                        </Tooltip>
                    );
                })}
            </svg>
        </TooltipProvider>
    );
}
