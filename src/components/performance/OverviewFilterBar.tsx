import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import type { ConnectedMarketplace } from "@/services/performance.service";
import { MarketplaceFilterSelect } from "./MarketplaceFilterSelect";

interface OverviewFilterBarProps {
    appliedDateRange: DateRange | undefined;
    tempDateRange: DateRange | undefined;
    activeQuick: "hoje" | "7dias" | "15dias" | "30dias" | "90dias" | "mesAtual" | null;
    isDatePopoverOpen: boolean;
    connectedMarketplaces: ConnectedMarketplace[];
    selectedMarketplace: string;
    onOpenChange: (open: boolean) => void;
    onTempDateRangeChange: (range: DateRange | undefined) => void;
    onApply: () => void;
    onQuickRange: (key: "hoje" | "7dias" | "15dias" | "30dias" | "90dias" | "mesAtual") => void;
    onMarketplaceChange: (value: string) => void;
}

const QUICK_LABELS: Record<string, string> = {
    hoje: "Hoje",
    "7dias": "Últimos 7 dias",
    "15dias": "Últimos 15 dias",
    "30dias": "Últimos 30 dias",
    "90dias": "Últimos 90 dias",
    mesAtual: "Mês atual",
};

export function OverviewFilterBar({
    appliedDateRange, tempDateRange, activeQuick, isDatePopoverOpen,
    connectedMarketplaces, selectedMarketplace,
    onOpenChange, onTempDateRangeChange, onApply, onQuickRange, onMarketplaceChange,
}: OverviewFilterBarProps) {
    return (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-violet-100 bg-white/95 p-3 shadow-sm">
            <Popover open={isDatePopoverOpen} onOpenChange={onOpenChange}>
                <PopoverTrigger asChild>
                    <Button variant="outline" className="h-12 w-[320px] justify-start rounded-xl border-violet-200 px-3 text-left hover:border-violet-300">
                        <CalendarIcon className="mr-3 h-4 w-4 text-violet-600" />
                        <span className="flex flex-col leading-tight">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-600">
                                Período de dados
                            </span>
                            <span className="text-sm font-medium text-gray-700">
                                {appliedDateRange?.from ? (
                                    appliedDateRange.to ? (
                                        <>
                                            {format(appliedDateRange.from, "dd MMM, y", { locale: ptBR })} -{" "}
                                            {format(appliedDateRange.to, "dd MMM, y", { locale: ptBR })}
                                        </>
                                    ) : format(appliedDateRange.from, "dd MMM, y", { locale: ptBR })
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
                        <div className="text-sm text-gray-600 font-medium">Personalizar data</div>
                        <Calendar
                            initialFocus
                            mode="range"
                            defaultMonth={tempDateRange?.from || new Date()}
                            selected={tempDateRange}
                            onSelect={onTempDateRangeChange}
                            numberOfMonths={1}
                        />
                        <div className="flex justify-end">
                            <Button className="rounded-xl bg-violet-600 hover:bg-violet-700" onClick={onApply}>Aplicar</Button>
                        </div>
                    </div>
                </PopoverContent>
            </Popover>

            <MarketplaceFilterSelect
                value={selectedMarketplace}
                onChange={onMarketplaceChange}
                connectedMarketplaces={connectedMarketplaces}
                triggerClassName="h-12 w-[240px] rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60"
            />
        </div>
    );
}
