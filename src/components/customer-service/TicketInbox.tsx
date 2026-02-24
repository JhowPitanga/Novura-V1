import { useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, MessageSquare, Send, Shuffle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Ticket } from "@/types/customer-service";
import { ClassificationChip, ChannelBadge, RiskBadge, SLABadge } from "./TicketBadges";

function usePrioridadeInteligente(tickets: Ticket[], ativo: boolean): Ticket[] {
    return useMemo(() => {
        if (!ativo) return tickets;
        const riskWeight = { Baixo: 1, Médio: 2, Alto: 3 } as const;
        return [...tickets].sort((a, b) => {
            const aScore = a.volatilidade * 0.7 + riskWeight[a.riscoPRR] * 30;
            const bScore = b.volatilidade * 0.7 + riskWeight[b.riscoPRR] * 30;
            return bScore - aScore;
        });
    }, [tickets, ativo]);
}

interface TicketInboxProps {
    tickets: Ticket[];
    onSelect: (t: Ticket) => void;
    titulo: string;
    prioridadeInteligenteAtiva: boolean;
    setPrioridadeInteligenteAtiva: (v: boolean) => void;
}

export function TicketInbox({
    tickets, onSelect, titulo,
    prioridadeInteligenteAtiva, setPrioridadeInteligenteAtiva,
}: TicketInboxProps) {
    const sorted = usePrioridadeInteligente(tickets, prioridadeInteligenteAtiva);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <MessageSquare className="w-5 h-5 mr-2" /> {titulo}
                </h3>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPrioridadeInteligenteAtiva(!prioridadeInteligenteAtiva)}
                    >
                        <Shuffle className={`w-4 h-4 mr-2 ${prioridadeInteligenteAtiva ? "text-purple-600" : "text-gray-600"}`} />
                        Priorização Inteligente
                    </Button>
                    <Input placeholder="Pesquisar por cliente, pedido ou assunto" className="w-64" />
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
                {sorted.map((t) => (
                    <Card key={t.id} className="border border-gray-200">
                        <CardHeader className="p-4 pb-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-gray-900">{t.cliente}</span>
                                    <span className="text-xs text-gray-500">#{t.id}</span>
                                    <ChannelBadge canal={t.canal} />
                                    <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 capitalize">
                                        {t.status.replace("_", " ")}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <RiskBadge risco={t.riscoPRR} />
                                    <SLABadge minutesLeft={t.slaMinLeft} />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-2">
                            <div className="flex items-start justify-between">
                                <div className="space-y-1">
                                    <div className="text-gray-800">{t.assunto}</div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {t.tagsIA.map((tag) => <ClassificationChip key={tag} label={tag} />)}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <AlertTriangle className={`w-4 h-4 ${
                                        t.volatilidade > 70 ? "text-red-600"
                                        : t.volatilidade > 50 ? "text-amber-600"
                                        : "text-emerald-600"
                                    }`} />
                                    <span className="text-sm text-gray-700">{t.volatilidade}</span>
                                </div>
                            </div>
                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                                {t.itemId && <Badge className="bg-gray-100 text-gray-700">Item {t.itemId}</Badge>}
                                {t.createdAt && <Badge className="bg-gray-100 text-gray-700">Criado {t.createdAt}</Badge>}
                                {t.hold && <Badge className="bg-blue-500 text-white">Hold</Badge>}
                                {t.suspectedSpam && <Badge className="bg-amber-500 text-white">Spam suspeito</Badge>}
                                {t.deletedFromListing && <Badge className="bg-gray-500 text-white">Removido do anúncio</Badge>}
                                {t.answerStatus === "BANNED" && <Badge className="bg-red-600 text-white">Resposta BANIDA</Badge>}
                                {t.answerStatus === "ACTIVE" && <Badge className="bg-emerald-600 text-white">Resposta ATIVA</Badge>}
                                {t.answerStatus === "DISABLED" && <Badge className="bg-gray-600 text-white">Resposta DESABILITADA</Badge>}
                            </div>
                            <div className="mt-3 flex items-center space-x-3">
                                <Input
                                    className="flex-1 h-12 rounded-full px-6 bg-gray-100 border-gray-200 focus:border-purple-500"
                                    placeholder="Responder..."
                                />
                                <Button
                                    className="w-12 h-12 rounded-full bg-purple-600 hover:bg-purple-700"
                                    size="icon"
                                    onClick={() => onSelect(t)}
                                >
                                    <Send className="w-5 h-5" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
