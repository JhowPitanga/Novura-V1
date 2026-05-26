import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ConnectedMarketplace } from "@/services/performance.service";

interface MarketplaceFilterSelectProps {
    value: string;
    onChange: (value: string) => void;
    connectedMarketplaces: ConnectedMarketplace[];
    triggerClassName?: string;
}

export function MarketplaceFilterSelect({
    value,
    onChange,
    connectedMarketplaces,
    triggerClassName = "h-12 w-[220px] rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60",
}: MarketplaceFilterSelectProps) {
    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger className={triggerClassName}>
                <SelectValue placeholder="Marketplace" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="todos">Todos os marketplace</SelectItem>
                {connectedMarketplaces.map((marketplace) => (
                    <SelectItem key={marketplace.slug} value={marketplace.slug}>
                        {marketplace.display}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
