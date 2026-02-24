import { ExternalLink, Edit, TrendingUp, BarChart, ShoppingCart, Heart, Copy, MoreHorizontal, Package, Zap, Trash2, Pencil, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { useNavigate } from "react-router-dom";
import type { ListingItem } from "@/types/listings";
import {
    getQualityStrokeColor,
    getQualityLabel,
    getImprovementSuggestions,
    extractPerformanceHints,
    formatVariationData,
    type VariationItem,
} from "@/utils/listingUtils";

const fmt = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

interface ListingCardProps {
    ad: ListingItem;
    itemRow: any;
    isShopee: boolean;
    isSelected: boolean;
    isExpanded: boolean;
    confirmPauseFor: string | null;
    onToggleSelect: () => void;
    onToggleExpansion: () => void;
    onToggleStatus: (ad: ListingItem, makeActive: boolean) => void;
    onOpenStockEdit: (itemRow: any, variations: VariationItem[]) => void;
    onDuplicate: (ad: ListingItem) => void;
    onDeleteRequest: (id: string) => void;
    onSetConfirmPause: (id: string | null) => void;
}

function QualityGauge({ quality, qualityLevel }: { quality: number; qualityLevel: any }) {
    const val = Math.max(0, Math.min(100, Number(quality) || 0));
    const r = 30;
    const length = Math.PI * r;
    const dash = length * (val / 100);
    const remain = length - dash;
    const color = getQualityStrokeColor(qualityLevel);
    const label = getQualityLabel(qualityLevel);

    return (
        <div className="flex flex-col items-center">
            <svg width="84" height="56" viewBox="0 0 84 56">
                <path d="M12,46 A30,30 0 0,1 72,46" fill="none" stroke="#E5E7EB" strokeWidth="8" strokeLinecap="round" />
                <path
                    d="M12,46 A30,30 0 0,1 72,46"
                    fill="none"
                    stroke={color}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${dash} ${remain}`}
                />
                <text x="42" y="35" textAnchor="middle" dominantBaseline="middle" fontSize="14" fill={color} fontWeight="700">
                    {val}
                </text>
            </svg>
            {qualityLevel != null && label ? (
                <div className="mt-1 px-2 py-0.5 text-[10px] leading-4 border-2 rounded-full" style={{ borderColor: color, color }}>
                    {label}
                </div>
            ) : null}
        </div>
    );
}

function VariationRows({ variations }: { variations: VariationItem[] }) {
    return (
        <div className="space-y-1">
            {variations.map((variation) => (
                <div key={String(variation.id)} className="bg-white rounded-lg p-2 border border-gray-200">
                    <div className="grid grid-cols-12 gap-4 items-center text-xs">
                        <div className="col-start-2 col-span-1 flex items-right justify-center">
                            <img src={variation.image} alt={`Variação ${variation.sku}`} className="w-12 h-12 rounded-md object-cover bg-gray-100" />
                        </div>
                        <div className="col-start-3 col-span-2">
                            <div className="text-gray-500 mb-1">SKU</div>
                            <div className="font-medium text-gray-900">{variation.sku}</div>
                            <div className="text-gray-500 mt-2 mb-1">Tipos</div>
                            <div className="space-y-1">
                                {variation.types.map((type, typeIndex) => (
                                    <div key={typeIndex} className="text-gray-900">{type.value}</div>
                                ))}
                            </div>
                        </div>
                        <div className="col-start-5 col-span-2">
                            <div className="text-gray-500 mb-1">Preço</div>
                            {(() => {
                                const cp = variation.current_price;
                                const op = variation.original_price;
                                if (typeof cp === 'number' && typeof op === 'number' && cp < op) {
                                    return (
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-gray-900 font-medium">{fmt(cp)}</span>
                                            <span className="text-gray-500 line-through">{fmt(op)}</span>
                                        </div>
                                    );
                                }
                                if (typeof cp === 'number') return <div className="text-gray-900 font-medium">{fmt(cp)}</div>;
                                if (typeof variation.price === 'number') return <div className="text-gray-900 font-medium">{fmt(variation.price)}</div>;
                                return <div className="text-gray-900">—</div>;
                            })()}
                        </div>
                        <div className="col-start-9 col-span-2">
                            <div className="text-gray-500 mb-1">Estoque</div>
                            <div className={`font-medium ${variation.seller_stock_total < 10 ? 'text-red-600' : 'text-gray-900'}`}>
                                {variation.seller_stock_total}
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

export function ListingCard({
    ad,
    itemRow,
    isShopee,
    isSelected,
    isExpanded,
    confirmPauseFor,
    onToggleSelect,
    onToggleExpansion,
    onToggleStatus,
    onOpenStockEdit,
    onDuplicate,
    onDeleteRequest,
    onSetConfirmPause,
}: ListingCardProps) {
    const navigate = useNavigate();
    const variations = formatVariationData(itemRow?.variations || [], itemRow);
    const hasVariations = variations.length > 0;

    const variationRange = (() => {
        if (!hasVariations) return null;
        const prices = variations
            .map(v => typeof v.current_price === 'number' ? v.current_price : (typeof v.price === 'number' ? v.price : undefined))
            .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
        if (!prices.length) return null;
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        return min === max ? fmt(min) : `${fmt(min)} - ${fmt(max)}`;
    })();

    const isActive = ad.status.toLowerCase() === 'active' || (isShopee && ad.status.toLowerCase() === 'normal');
    const suggestions = getImprovementSuggestions(ad.performanceData);

    return (
        <div className="relative bg-white border border-gray-200 rounded-lg">
            <div className="grid grid-cols-12 gap-y-3 gap-x-2 items-center p-3">

                {/* Col 1: tooltip + checkbox + expand */}
                <div className="col-span-1 flex flex-col items-start space-y-2 -ml-2">
                    {suggestions.length > 0 && (
                        <TooltipProvider delayDuration={0}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className="relative inline-flex items-center justify-center cursor-pointer hover:scale-105 transition-transform mx-1">
                                        <span className="absolute inline-flex h-4 w-4 rounded-full bg-purple-600 opacity-75 animate-ping"></span>
                                        <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-600 ring-2 ring-transparent hover:ring-purple-500"></span>
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="bg-purple-600 text-white border border-purple-600 w-[300px] min-h-[64px] whitespace-normal leading-snug text-center px-3 py-2">
                                    <div className="font-semibold">Recomendação Novura:</div>
                                    <div className="mt-1">{suggestions.join(' • ')}</div>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                    <Checkbox
                        size="sm"
                        indicatorStyle="square"
                        checked={isSelected}
                        onCheckedChange={onToggleSelect}
                        onClick={(e) => e.stopPropagation()}
                    />
                    {hasVariations && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onToggleExpansion}
                            className="h-6 w-6 p-0 self-start text-novura-primary rounded-full hover:bg-purple-50"
                        >
                            <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </Button>
                    )}
                </div>

                {/* Col 2-4: Product info */}
                <div className="flex items-start space-x-3 col-span-3 -ml-20">
                    <img src={ad.image} alt={ad.title} className="w-16 h-16 rounded-lg object-cover bg-gray-100" />
                    <div className="flex flex-col h-full justify-between min-w-0">
                        <div className="max-w-full">
                            {ad.permalink ? (
                                <a href={ad.permalink} target="_blank" rel="noopener noreferrer" className="font-semibold text-sm text-gray-900 break-words whitespace-normal hover:text-novura-primary">
                                    {ad.title}
                                </a>
                            ) : (
                                <div className="font-semibold text-sm text-gray-900 break-words whitespace-normal">{ad.title}</div>
                            )}
                        </div>
                        <div className="mt-2 text-xs text-gray-500">
                            <div className="flex items-center space-x-1">
                                <span className="text-gray-500">SKU:</span>
                                <span className="font-medium">{ad.sku || '—'}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                                <span className="text-gray-500">ID:</span>
                                <span className="font-medium">{ad.marketplaceId}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Col 5-6: Price */}
                <div className="flex flex-col items-start space-y-1 justify-center col-span-2">
                    {variationRange ? (
                        <div className="text-lg font-bold text-gray-900">{variationRange}</div>
                    ) : isShopee && ad.promoPrice && ad.originalPrice ? (
                        <>
                            <div className="text-lg font-bold text-novura-primary">{fmt(ad.promoPrice)}</div>
                            <div className="text-xs text-gray-500 line-through">{fmt(ad.originalPrice)}</div>
                        </>
                    ) : isShopee && ad.promoPrice ? (
                        <div className="text-lg font-bold text-novura-primary">{fmt(ad.promoPrice)}</div>
                    ) : (
                        <div className="text-lg font-bold text-gray-900">{fmt(ad.price)}</div>
                    )}
                </div>

                {/* Col 7-8: Shipping/data */}
                <div className="flex flex-col items-start space-y-2 justify-center col-span-2">
                    {ad.publicationType ? (
                        <TooltipProvider delayDuration={0}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Badge variant="outline" className="text-xs px-2 border-[#7C3AED] text-[#7C3AED] cursor-help">
                                        {ad.publicationType}
                                    </Badge>
                                </TooltipTrigger>
                                <TooltipContent className="rounded-lg bg-[#7C3AED] text-white border border-[#6D28D9] shadow-md w-64 min-h-24 p-3">
                                    {ad.publicationFeeDetails ? (
                                        <div className="text-xs leading-5 space-y-1">
                                            <div className="font-semibold">{ad.publicationType}</div>
                                            <div>
                                                Tarifa de venda {ad.publicationFeeDetails.percentage != null ? `${String(ad.publicationFeeDetails.percentage).replace('.', ',')}%` : '—'}
                                                {typeof ad.publicationFeeDetails.fixedFee === 'number' && ad.publicationFeeDetails.fixedFee > 0
                                                    ? ` + ${fmt(ad.publicationFeeDetails.fixedFee)}`
                                                    : ''}
                                            </div>
                                            <div className="font-medium">
                                                A pagar {ad.publicationFeeDetails.grossAmount != null ? fmt(ad.publicationFeeDetails.grossAmount) : fmt(0)}
                                            </div>
                                        </div>
                                    ) : ad.publicationCosts ? (
                                        <div className="text-xs leading-5 space-y-1">
                                            <div className="font-semibold">Custos</div>
                                            <div>Comissão: {fmt(ad.publicationCosts.commission || 0)}</div>
                                            <div>Frete: {fmt(ad.publicationCosts.shippingCost || 0)}</div>
                                            {ad.publicationCosts.tax ? <div>Taxas: {fmt(ad.publicationCosts.tax)}</div> : null}
                                            <div className="font-medium">Total: {fmt(ad.publicationCosts.total || 0)}</div>
                                        </div>
                                    ) : (
                                        <div className="text-xs">Sem dados de custos</div>
                                    )}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    ) : (
                        <Badge className={`${ad.marketplace === 'Mercado Livre' ? 'bg-yellow-500' : 'bg-gray-500'} text-white text-xs px-2`}>
                            {ad.marketplace}
                        </Badge>
                    )}
                    {ad.shippingTags && ad.shippingTags.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                            {ad.shippingTags.map((tag, index) => {
                                const t = String(tag || '').toLowerCase();
                                const label = t === 'full' ? 'Full' : t === 'flex' ? 'Flex' : t === 'envios' ? 'Envios' : t === 'correios' ? 'Correios' : t === 'no_shipping' ? 'Sem envio' : tag as string;
                                return (
                                    <Badge key={index} className="font-medium text-[9px] px-1 py-[1px] rounded-sm bg-[#7C3AED] text-white">
                                        {t === 'full' ? <Zap className="w-2 h-2 mr-0.5" /> : null}
                                        {label}
                                    </Badge>
                                );
                            })}
                        </div>
                    ) : (
                        <span className="text-sm text-gray-500">N/A</span>
                    )}
                    {(ad.status.toLowerCase() === 'paused' || ad.status.toLowerCase() === 'inactive') && (
                        <span className="text-xs font-semibold mt-1" style={{ color: '#ff5917' }}>
                            {ad.pauseReason || 'Pausado pelo seller'}
                        </span>
                    )}
                </div>

                {/* Col 9-10: Metrics */}
                <div className="col-span-2">
                    <div className="grid grid-cols-2 gap-4 items-center">
                        <div className="flex items-center space-x-2">
                            <BarChart className="w-4 h-4 text-novura-primary" />
                            <div className="text-sm">
                                <div className="font-bold text-gray-900">{ad.visits}</div>
                                <div className="text-xs text-gray-500">Visitas</div>
                            </div>
                        </div>
                        <div className="flex items-center space-x-2">
                            <ShoppingCart className="w-4 h-4 text-novura-primary" />
                            <div className="text-sm">
                                <div className="font-bold text-gray-900">{ad.sales}</div>
                                <div className="text-xs text-gray-500">Vendas</div>
                            </div>
                        </div>
                        <div className="flex items-center space-x-2 group">
                            <Package className="w-4 h-4 text-novura-primary" />
                            <div className="text-sm">
                                <div className="font-bold text-gray-900 flex items-center">
                                    <span>{ad.stock}</span>
                                    {isShopee && (
                                        <button
                                            className="ml-2 p-1 rounded hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={() => onOpenStockEdit(itemRow, variations)}
                                        >
                                            <Pencil className="w-4 h-4 text-novura-primary" />
                                        </button>
                                    )}
                                </div>
                                <div className="text-xs text-gray-500">Estoque</div>
                            </div>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Heart className="w-4 h-4 text-[#7C3AED]" />
                            <div className="text-sm">
                                <div className="font-bold text-gray-900">{Number(ad.likes || 0)}</div>
                                <div className="text-xs text-gray-500">Curtidas</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Col 11-12: Controls */}
                <div className="col-span-2">
                    <div className="flex items-center justify-center space-x-6">
                        <QualityGauge quality={ad.quality} qualityLevel={ad.qualityLevel} />

                        <div className="flex flex-col items-center">
                            <span className="text-xs text-gray-600 mb-1">{isActive ? 'Ativo' : 'Inativo'}</span>
                            <Popover
                                open={confirmPauseFor === ad.id}
                                onOpenChange={(open) => { if (!open) onSetConfirmPause(null); }}
                            >
                                <PopoverTrigger asChild>
                                    <Switch
                                        checked={isActive}
                                        onCheckedChange={(checked) => {
                                            if (isActive && !checked) onSetConfirmPause(ad.id);
                                            else onToggleStatus(ad, checked);
                                        }}
                                        className="data-[state=checked]:bg-[#7C3AED] data-[state=unchecked]:bg-gray-200"
                                    />
                                </PopoverTrigger>
                                <PopoverContent align="center" sideOffset={8} className="w-64 bg-white border shadow-md p-3 rounded-xl">
                                    <div className="text-sm font-medium text-gray-900">Pausar anúncio?</div>
                                    <div className="text-xs text-gray-600 mt-1">Isso pode impactar vendas. Confirme para pausar no Mercado Livre.</div>
                                    <div className="flex justify-end gap-2 mt-3">
                                        <Button size="sm" variant="outline" className="rounded-full" onClick={() => onSetConfirmPause(null)}>Cancelar</Button>
                                        <Button size="sm" className="bg-novura-primary hover:bg-novura-primary/90 rounded-full" onClick={async () => { onSetConfirmPause(null); await onToggleStatus(ad, false); }}>Confirmar</Button>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-novura-primary hover:text-novura-primary">
                                    <MoreHorizontal className="w-5 h-5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); if (ad.permalink) window.open(ad.permalink, '_blank'); }}>
                                    <ExternalLink className="w-4 h-4 mr-2" /> Ver no Marketplace
                                </DropdownMenuItem>
                                <Drawer>
                                    <DrawerTrigger asChild>
                                        <DropdownMenuItem onSelect={e => e.preventDefault()}>
                                            <TrendingUp className="w-4 h-4 mr-2" /> Desempenho
                                        </DropdownMenuItem>
                                    </DrawerTrigger>
                                    <DrawerContent>
                                        <DrawerHeader>
                                            <DrawerTitle>Desempenho do anúncio</DrawerTitle>
                                            <DrawerDescription>Insights e recomendações para melhorar qualidade e conversão.</DrawerDescription>
                                        </DrawerHeader>
                                        <div className="px-6 pb-6 space-y-4">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="flex items-center space-x-2">
                                                    <BarChart className="w-4 h-4 text-novura-primary" />
                                                    <div className="text-sm">
                                                        <div className="font-bold text-gray-900">{ad.visits}</div>
                                                        <div className="text-xs text-gray-500">Visitas</div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center space-x-2">
                                                    <ShoppingCart className="w-4 h-4 text-novura-primary" />
                                                    <div className="text-sm">
                                                        <div className="font-bold text-gray-900">{ad.sales}</div>
                                                        <div className="text-xs text-gray-500">Vendas</div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-xs font-medium text-gray-600 mb-2">Recomendações</div>
                                                {(() => {
                                                    const hints = extractPerformanceHints(ad.performanceData, ad);
                                                    if (!hints.length) return <div className="text-sm text-gray-500">Sem dados de desempenho disponíveis no momento.</div>;
                                                    return (
                                                        <ul className="list-disc list-inside text-sm text-gray-800 space-y-1">
                                                            {hints.map((h, idx) => <li key={idx}>{h}</li>)}
                                                        </ul>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    </DrawerContent>
                                </Drawer>
                                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onDuplicate(ad); }}>
                                    <Copy className="w-4 h-4 mr-2" /> Duplicar
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); navigate(`/anuncios/edicao/${ad.marketplaceId}`); }}>
                                    <Edit className="w-4 h-4 mr-2" /> Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onDeleteRequest(ad.id); }}>
                                    <Trash2 className="w-4 h-4 mr-2 text-red-600" /> Excluir
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </div>

            {hasVariations && (
                <div className="border-t border-gray-100 bg-gray-50">
                    <Collapsible open={isExpanded}>
                        <CollapsibleContent className="px-0.5 pb-3">
                            <VariationRows variations={variations} />
                        </CollapsibleContent>
                    </Collapsible>
                </div>
            )}
        </div>
    );
}
