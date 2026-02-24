import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, AlertTriangle } from "lucide-react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { CleanNavigation } from "@/components/CleanNavigation";
import { mockTickets } from "@/types/customer-service";
import { TicketInbox } from "@/components/customer-service/TicketInbox";

const marketplaceNavItems = [
    { title: "Mercado Livre", path: "/sac/mercado-livre", description: "Perguntas" },
    { title: "Shopee", path: "/sac/shopee", description: "Em breve" },
    { title: "Magalu", path: "/sac/magalu", description: "Em breve" },
    { title: "Amazon", path: "/sac/amazon", description: "Em breve" },
];

export default function SAC() {
    const [prioridadeInteligenteAtiva, setPrioridadeInteligenteAtiva] = useState(true);
    const [activeMarketplacePath, setActiveMarketplacePath] = useState("/sac/mercado-livre");
    const [questionsTab, setQuestionsTab] = useState("todas");

    const perguntas = mockTickets.filter((t) => t.tipo === "pergunta");
    const reclamacoes = mockTickets.filter((t) => t.tipo === "reclamacao");
    const posVenda = mockTickets.filter((t) => t.tipo === "pos_venda");
    const perguntasML = perguntas.filter((t) => t.canal === "Mercado Livre");
    const activePerguntas = activeMarketplacePath === "/sac/mercado-livre" ? perguntasML : perguntas;

    const inboxProps = {
        prioridadeInteligenteAtiva,
        setPrioridadeInteligenteAtiva,
        onSelect: () => {},
    };

    return (
        <SidebarProvider>
            <div className="min-h-screen flex w-full bg-gray-50">
                <AppSidebar />
                <div className="flex-1 flex flex-col">
                    <GlobalHeader />
                    <main className="flex-1 p-6 overflow-auto">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <h1 className="text-2xl font-semibold text-gray-900 flex items-center">
                                    <MessageSquare className="w-6 h-6 mr-2" /> Central de SAC
                                </h1>
                                <p className="text-sm text-gray-600">
                                    Integração Multi-Canal • Priorização Inteligente • Classificação Automática • PRR
                                </p>
                            </div>
                        </div>

                        <div className="rounded-lg border bg-amber-50 border-amber-200 p-3 flex items-center gap-3 mt-4">
                            <AlertTriangle className="w-5 h-5 text-amber-600" />
                            <div>
                                <p className="text-sm font-medium text-amber-800">Alerta de Potencial Problema</p>
                                <p className="text-xs text-amber-700">
                                    Cliente X: Risco Alto de Atraso. Sugestão: Enviar mensagem proativa agora.
                                </p>
                            </div>
                        </div>

                        <CleanNavigation
                            items={marketplaceNavItems}
                            basePath=""
                            activePath={activeMarketplacePath}
                            onNavigate={(path) => setActiveMarketplacePath(path)}
                        />

                        <Tabs defaultValue="perguntas" className="w-full mt-4">
                            <div className="border-b border-gray-200 w-full">
                                <TabsList className="bg-transparent p-0 h-auto">
                                    {[
                                        { value: "perguntas", label: "Perguntas" },
                                        { value: "reclamacoes", label: "Reclamações" },
                                        { value: "posvenda", label: "Pós-venda" },
                                    ].map(({ value, label }) => (
                                        <TabsTrigger
                                            key={value}
                                            value={value}
                                            className="px-6 py-4 border-b-2 border-transparent data-[state=active]:border-novura-primary data-[state=active]:text-novura-primary hover:text-novura-primary rounded-none bg-transparent"
                                        >
                                            {label}
                                        </TabsTrigger>
                                    ))}
                                </TabsList>
                            </div>

                            <TabsContent value="perguntas" className="mt-6">
                                <div className="border-b border-gray-200 w-full mb-4">
                                    <Tabs value={questionsTab} onValueChange={setQuestionsTab} className="w-full">
                                        <TabsList className="bg-transparent p-0 h-auto">
                                            {[
                                                { value: "todas", label: "Todas" },
                                                { value: "nao-respondidas", label: "Não Respondidas" },
                                                { value: "respondidas", label: "Respondidas" },
                                            ].map(({ value, label }) => (
                                                <TabsTrigger
                                                    key={value}
                                                    value={value}
                                                    className="px-6 py-4 border-b-2 border-transparent data-[state=active]:border-novura-primary data-[state=active]:text-novura-primary hover:text-novura-primary rounded-none bg-transparent"
                                                >
                                                    {label}
                                                </TabsTrigger>
                                            ))}
                                        </TabsList>
                                        <TabsContent value="todas" className="mt-4">
                                            <TicketInbox {...inboxProps} tickets={activePerguntas} titulo="Perguntas" />
                                        </TabsContent>
                                        <TabsContent value="nao-respondidas" className="mt-4">
                                            <TicketInbox {...inboxProps} tickets={activePerguntas.filter((t) => t.status === "novo")} titulo="Não Respondidas" />
                                        </TabsContent>
                                        <TabsContent value="respondidas" className="mt-4">
                                            <TicketInbox {...inboxProps} tickets={activePerguntas.filter((t) => t.status !== "novo")} titulo="Respondidas" />
                                        </TabsContent>
                                    </Tabs>
                                </div>
                            </TabsContent>

                            <TabsContent value="reclamacoes" className="mt-6">
                                <TicketInbox {...inboxProps} tickets={reclamacoes} titulo="Reclamações" />
                            </TabsContent>

                            <TabsContent value="posvenda" className="mt-6">
                                <TicketInbox {...inboxProps} tickets={posVenda} titulo="Pós-venda" />
                            </TabsContent>
                        </Tabs>
                    </main>
                </div>
            </div>
        </SidebarProvider>
    );
}
