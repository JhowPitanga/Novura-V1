import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import type { ConnectedMarketplace } from "@/services/performance.service";

interface OverviewFilterBarProps {
    appliedDateRange: DateRange | undefined;
    tempDateRange: DateRange | undefined;
    activeQuick: "hoje" | "7dias" | "30dias" | null;
    isDatePopoverOpen: boolean;
    connectedMarketplaces: ConnectedMarketplace[];
    selectedMarketplace: string;
    onOpenChange: (open: boolean) => void;
    onTempDateRangeChange: (range: DateRange | undefined) => void;
    onApply: () => void;
    onQuickRange: (key: "hoje" | "7dias" | "30dias") => void;
    onMarketplaceChange: (value: string) => void;
}

const QUICK_LABELS: Record<string, string> = {
    hoje: "Hoje",
    "7dias": "Últimos 7 dias",
    "30dias": "Últimos 30 dias",
};

export function OverviewFilterBar({
    appliedDateRange, tempDateRange, activeQuick, isDatePopoverOpen,
    connectedMarketplaces, selectedMarketplace,
    onOpenChange, onTempDateRangeChange, onApply, onQuickRange, onMarketplaceChange,
}: OverviewFilterBarProps) {
    return (
        <div className="flex items-center space-x-4">
            <Popover open={isDatePopoverOpen} onOpenChange={onOpenChange}>
                <PopoverTrigger asChild>
                    <Button variant="outline" className="w-[320px] justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {appliedDateRange?.from ? (
                            appliedDateRange.to ? (
                                <>
                                    {format(appliedDateRange.from, "dd MMM, y", { locale: ptBR })} -{" "}
                                    {format(appliedDateRange.to, "dd MMM, y", { locale: ptBR })}
                                </>
                            ) : format(appliedDateRange.from, "dd MMM, y", { locale: ptBR })
                        ) : "Selecione o período"}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[380px]" align="start">
                    <div className="p-3 space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                            {(["hoje", "7dias", "30dias"] as const).map((key) => (
                                <Button
                                    key={key}
                                    variant="secondary"
                                    className={activeQuick === key ? "bg-violet-600 text-white hover:bg-violet-700" : ""}
                                    onClick={() => onQuickRange(key)}
                                >
                                    {QUICK_LABELS[key]}
                                </Button>
                            ))}
                        </div>
                        <div className="text-sm text-gray-600">Personalizar data</div>
                        <Calendar
                            initialFocus
                            mode="range"
                            defaultMonth={tempDateRange?.from || new Date()}
                            selected={tempDateRange}
                            onSelect={onTempDateRangeChange}
                            numberOfMonths={1}
                        />
                        <div className="flex justify-end">
                            <Button onClick={onApply}>Aplicar</Button>
                        </div>
                    </div>
                </PopoverContent>
            </Popover>

            <Select value={selectedMarketplace} onValueChange={onMarketplaceChange}>
                <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Marketplace" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {connectedMarketplaces.map((m) => (
                        <SelectItem key={m.slug} value={m.slug}>{m.display}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
