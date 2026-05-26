import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon, Search } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import type { ConnectedMarketplace } from "@/services/performance.service";
import { MarketplaceFilterSelect } from "@/components/performance/MarketplaceFilterSelect";

const QUICK_LABELS = {
    hoje: "Hoje",
    "7dias": "Últimos 7 dias",
    "15dias": "Últimos 15 dias",
    "30dias": "Últimos 30 dias",
    "90dias": "Últimos 90 dias",
    mesAtual: "Mês atual",
} as const;

interface ProductPerformanceFilterBarProps {
    appliedDateRange: DateRange | undefined;
    tempDateRange: DateRange | undefined;
    activeQuick: "hoje" | "7dias" | "15dias" | "30dias" | "90dias" | "mesAtual" | null;
    isDateOpen: boolean;
    connectedMarketplaces: ConnectedMarketplace[];
    marketplace: string;
    searchTerm: string;
    onOpenChange: (open: boolean) => void;
    onTempDateRangeChange: (range: DateRange | undefined) => void;
    onApply: () => void;
    onQuickRange: (key: "hoje" | "7dias" | "15dias" | "30dias" | "90dias" | "mesAtual") => void;
    onMarketplaceChange: (val: string) => void;
    onSearchChange: (val: string) => void;
}

export function ProductPerformanceFilterBar({
    appliedDateRange, tempDateRange, activeQuick, isDateOpen,
    connectedMarketplaces, marketplace, searchTerm,
    onOpenChange, onTempDateRangeChange, onApply, onQuickRange,
    onMarketplaceChange, onSearchChange,
}: ProductPerformanceFilterBarProps) {
    return (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-transparent p-1">
            {/* Date picker */}
            <Popover open={isDateOpen} onOpenChange={onOpenChange}>
                <PopoverTrigger asChild>
                    <Button variant="outline" className="h-12 w-[300px] justify-start rounded-2xl border-0 bg-white px-3 text-left shadow-lg ring-1 ring-gray-200/60 hover:bg-white">
                        <CalendarIcon className="mr-3 h-4 w-4 text-violet-600" />
                        <span className="flex flex-col leading-tight">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-600">
                                Período de dados
                            </span>
                            <span className="text-sm font-medium text-gray-700">
                                {appliedDateRange?.from ? (
                                    appliedDateRange.to
                                        ? `${format(appliedDateRange.from, "dd MMM, y", { locale: ptBR })} – ${format(appliedDateRange.to, "dd MMM, y", { locale: ptBR })}`
                                        : format(appliedDateRange.from, "dd MMM, y", { locale: ptBR })
                                ) : "Selecione o período"}
                            </span>
                        </span>
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[420px] rounded-2xl border-violet-100" align="start">
                    <div className="p-3 space-y-3">
                        <div className="grid grid-cols-3 gap-2">
                            {(["hoje", "7dias", "15dias", "30dias", "90dias", "mesAtual"] as const).map((key) => (
                                <Button
                                    key={key}
                                    variant="outline"
                                    size="sm"
                                    className={`rounded-lg border transition-colors ${
                                        activeQuick === key
                                            ? "bg-violet-600 text-white border-violet-600 hover:bg-violet-700"
                                            : "border-violet-100 text-gray-600 hover:border-violet-300 hover:text-violet-700"
                                    }`}
                                    onClick={() => onQuickRange(key)}
                                >
                                    {QUICK_LABELS[key]}
                                </Button>
                            ))}
                        </div>
                        <p className="text-xs text-gray-500 font-medium">Personalizar data</p>
                        <Calendar
                            initialFocus
                            mode="range"
                            defaultMonth={tempDateRange?.from || new Date()}
                            selected={tempDateRange}
                            onSelect={onTempDateRangeChange}
                            numberOfMonths={1}
                        />
                        <div className="flex justify-end">
                            <Button size="sm" className="rounded-xl bg-violet-600 hover:bg-violet-700" onClick={onApply}>Aplicar</Button>
                        </div>
                    </div>
                </PopoverContent>
            </Popover>

            {/* Marketplace filter */}
            <MarketplaceFilterSelect
                value={marketplace}
                onChange={onMarketplaceChange}
                connectedMarketplaces={connectedMarketplaces}
            />

            {/* Search */}
            <div className="relative flex-1 min-w-[220px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                    className="h-12 rounded-2xl border-0 bg-white pl-10 pr-4 shadow-lg ring-1 ring-gray-200/60 focus-visible:ring-violet-500"
                    placeholder="Buscar produto ou SKU..."
                    value={searchTerm}
                    onChange={(e) => onSearchChange(e.target.value)}
                />
            </div>
        </div>
    );
}
