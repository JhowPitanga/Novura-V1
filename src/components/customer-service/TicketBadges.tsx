import { Badge } from "@/components/ui/badge";
import type { Ticket } from "@/types/customer-service";

export function IAStars() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" className="inline-block mr-1">
            <path d="M12 2l1.8 4.5L18 8.3l-4.2 1.2L12 14l-1.8-4.5L6 8.3l4.2-1.2L12 2z" fill="currentColor" opacity="0.9" />
            <circle cx="19" cy="5" r="2" fill="currentColor" opacity="0.6" />
            <circle cx="5" cy="6" r="1.6" fill="currentColor" opacity="0.6" />
        </svg>
    );
}

export function ClassificationChip({ label }: { label: string }) {
    return (
        <span className="inline-flex items-center text-xs px-2 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
            <IAStars /> {label}
        </span>
    );
}

export function ChannelBadge({ canal }: { canal: Ticket["canal"] }) {
    const styles: Record<string, string> = {
        "Shopee": "bg-orange-100 text-orange-700",
        "Mercado Livre": "bg-yellow-100 text-yellow-800",
        "Magalu": "bg-blue-100 text-blue-700",
        "Amazon": "bg-gray-100 text-gray-700",
    };
    return (
        <span className={`text-xs px-2 py-1 rounded-full border ${styles[canal]} border-transparent`}>
            {canal}
        </span>
    );
}

export function RiskBadge({ risco }: { risco: Ticket["riscoPRR"] }) {
    const cls = risco === "Alto"
        ? "bg-red-100 text-red-700"
        : risco === "Médio"
        ? "bg-amber-100 text-amber-700"
        : "bg-emerald-100 text-emerald-700";
    return <span className={`text-xs px-2 py-1 rounded-full ${cls}`}>Risco {risco}</span>;
}

export function SLABadge({ minutesLeft }: { minutesLeft: number }) {
    const variant = minutesLeft <= 30
        ? "bg-red-600 text-white"
        : minutesLeft <= 90
        ? "bg-orange-500 text-white"
        : "bg-emerald-500 text-white";
    const label = minutesLeft <= 30 ? "Urgente" : minutesLeft <= 90 ? "Atenção" : "Confortável";
    return (
        <Badge className={`${variant} rounded-full px-2 py-1 text-xs`}>
            {label} • {minutesLeft}m
        </Badge>
    );
}
