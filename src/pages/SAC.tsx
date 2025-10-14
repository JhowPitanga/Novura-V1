import React, { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, BarChart, Bar } from "recharts";
import { MessageSquare, AlertTriangle, Sparkles, User, Clock, BadgePercent, Tag, Send, Shuffle, Smile, Phone, Video, MoreVertical, Paperclip } from "lucide-react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

// Tipos básicos
type TicketType = "pergunta" | "reclamacao" | "pos_venda";

type Ticket = {
  id: string;
  canal: "Shopee" | "Mercado Livre" | "Magalu" | "Amazon";
  cliente: string;
  assunto: string;
  tipo: TicketType;
  pedidoId?: string;
  status: "novo" | "em_andamento" | "aguardando_cliente" | "resolvido";
  volatilidade: number; // 0-100 (raiva/urgência)
  riscoPRR: "Baixo" | "Médio" | "Alto";
  tagsIA: string[];
  atribuidoA?: string;
  historico: { time: string; event: string }[];
  slaMinLeft: number;
};

const membrosEquipe = ["Ana", "Carlos", "Marina", "João", "Fernanda"];

// Dados mock de tickets
const mockTickets: Ticket[] = [
  {
    id: "TCK-001",
    canal: "Mercado Livre",
    cliente: "Paulo Andrade",
    assunto: "Dúvida de prazo de entrega",
    tipo: "pergunta",
    pedidoId: "PED12345",
    status: "novo",
    volatilidade: 35,
    riscoPRR: "Médio",
    tagsIA: ["Dúvida de Prazo"],
    historico: [{ time: "há 5 min", event: "Mensagem recebida" }],
    slaMinLeft: 95,
  },
  {
    id: "TCK-002",
    canal: "Shopee",
    cliente: "Larissa Dias",
    assunto: "Produto chegou com defeito",
    tipo: "reclamacao",
    pedidoId: "PED12346",
    status: "em_andamento",
    volatilidade: 82,
    riscoPRR: "Alto",
    tagsIA: ["Reclamação de Defeito"],
    historico: [{ time: "há 12 min", event: "Mensagem recebida" }],
    atribuidoA: "Ana",
    slaMinLeft: 20,
  },
  {
    id: "TCK-003",
    canal: "Amazon",
    cliente: "Ricardo M.",
    assunto: "Problema de rastreio",
    tipo: "pos_venda",
    pedidoId: "PED12347",
    status: "aguardando_cliente",
    volatilidade: 58,
    riscoPRR: "Médio",
    tagsIA: ["Problema de Rastreio"],
    historico: [{ time: "há 1 h", event: "Mensagem enviada: link de rastreio" }],
    atribuidoA: "Carlos",
    slaMinLeft: 45,
  },
  {
    id: "TCK-004",
    canal: "Magalu",
    cliente: "Débora S.",
    assunto: "Troca por tamanho",
    tipo: "pos_venda",
    pedidoId: "PED12348",
    status: "novo",
    volatilidade: 44,
    riscoPRR: "Baixo",
    tagsIA: ["Troca / Devolução"],
    historico: [{ time: "há 20 min", event: "Mensagem recebida" }],
    slaMinLeft: 120,
  },
];

// Ícone inline de "estrelas IA"
const IAStars = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" className="inline-block mr-1">
    <path d="M12 2l1.8 4.5L18 8.3l-4.2 1.2L12 14l-1.8-4.5L6 8.3l4.2-1.2L12 2z" fill="currentColor" opacity="0.9" />
    <circle cx="19" cy="5" r="2" fill="currentColor" opacity="0.6" />
    <circle cx="5" cy="6" r="1.6" fill="currentColor" opacity="0.6" />
  </svg>
);

// Componente de Chips de Classificação IA
function ClassificationChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center text-xs px-2 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
      <IAStars /> {label}
    </span>
  );
}

// Cálculo de prioridade inteligente (ASPD + Índice de Volatilidade)
function usePrioridadeInteligente(tickets: Ticket[], ativo: boolean) {
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

function ChannelBadge({ canal }: { canal: Ticket["canal"] }) {
  const styles: Record<string, string> = {
    "Shopee": "bg-orange-100 text-orange-700",
    "Mercado Livre": "bg-yellow-100 text-yellow-800",
    "Magalu": "bg-blue-100 text-blue-700",
    "Amazon": "bg-gray-100 text-gray-700",
  };
  return <span className={`text-xs px-2 py-1 rounded-full border ${styles[canal]} border-transparent`}>{canal}</span>;
}

function RiskBadge({ risco }: { risco: Ticket["riscoPRR"] }) {
  const cls = risco === "Alto" ? "bg-red-100 text-red-700" : risco === "Médio" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700";
  return <span className={`text-xs px-2 py-1 rounded-full ${cls}`}>Risco {risco}</span>;
}

function SACTicketInbox({
  tickets,
  onSelect,
  titulo,
  prioridadeInteligenteAtiva,
  setPrioridadeInteligenteAtiva,
}: {
  tickets: Ticket[];
  onSelect: (t: Ticket) => void;
  titulo: string;
  prioridadeInteligenteAtiva: boolean;
  setPrioridadeInteligenteAtiva: (v: boolean) => void;
}) {
  const sorted = usePrioridadeInteligente(tickets, prioridadeInteligenteAtiva);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center"><MessageSquare className="w-5 h-5 mr-2" /> {titulo}</h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPrioridadeInteligenteAtiva(!prioridadeInteligenteAtiva)}>
            <Shuffle className={`w-4 h-4 mr-2 ${prioridadeInteligenteAtiva ? "text-purple-600" : "text-gray-600"}`} />
            Priorização Inteligente
          </Button>
          <Input placeholder="Pesquisar por cliente, pedido ou assunto" className="w-64" />
        </div>
      </div>

      <div className="rounded-lg border bg-white">
        <div className="grid grid-cols-12 px-4 py-2 text-xs font-medium text-gray-600 border-b">
          <div className="col-span-2">Cliente</div>
          <div className="col-span-3">Assunto</div>
          <div className="col-span-2">Canal</div>
          <div className="col-span-2">Classificação (IA)</div>
          <div className="col-span-1">Volatilidade</div>
          <div className="col-span-2">Risco / SLA</div>
        </div>
        {sorted.map((t) => (
          <button key={t.id} onClick={() => onSelect(t)} className="grid grid-cols-12 w-full px-4 py-3 text-sm text-left hover:bg-gray-50">
            <div className="col-span-2">
              <div className="font-medium text-gray-900 flex items-center gap-2">
                {t.cliente}
                <span className="text-xs text-gray-500">#{t.id}</span>
              </div>
              <div className="text-xs text-gray-500">Pedido: {t.pedidoId ?? "-"}</div>
            </div>
            <div className="col-span-3">
              <div className="text-gray-800">{t.assunto}</div>
              <div className="text-xs text-gray-500 capitalize">{t.tipo.replace("_", " ")}</div>
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <ChannelBadge canal={t.canal} />
              <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 capitalize">{t.status.replace("_", " ")}</span>
            </div>
            <div className="col-span-2 flex items-center gap-2 flex-wrap">
              {t.tagsIA.map((tag) => (
                <ClassificationChip key={tag} label={tag} />
              ))}
            </div>
            <div className="col-span-1 flex items-center gap-1">
              <AlertTriangle className={`w-4 h-4 ${t.volatilidade > 70 ? "text-red-600" : t.volatilidade > 50 ? "text-amber-600" : "text-emerald-600"}`} />
              <span>{t.volatilidade}</span>
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <RiskBadge risco={t.riscoPRR} />
              <Clock className="w-4 h-4 text-gray-500" />
              <span className="text-xs text-gray-600">SLA 2h</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function SACChatPanel({ ticket }: { ticket?: Ticket }) {
  const [mensagens, setMensagens] = useState<{ from: "cliente" | "equipe"; text: string; time: string }[]>(
    ticket ? [{ from: "cliente", text: "Olá, preciso de ajuda", time: "há 5 min" }] : []
  );
  const [texto, setTexto] = useState("");

  function gerarRespostaIA() {
    if (!ticket) return;
    const base = ticket.tipo === "pergunta" ?
      "Olá, obrigado pela mensagem! O prazo de entrega para seu pedido {PED} é de 2-5 dias úteis. Você pode acompanhar pelo link: {RASTREIO}." :
      ticket.tipo === "reclamacao" ?
      "Sinto muito pelo ocorrido. Podemos realizar troca ou reembolso conforme política do marketplace. Por favor, envie fotos do produto e embalagem para agilizar." :
      "Segue novo link de rastreio atualizado e orientações de pós-venda. Caso precise, podemos oferecer upgrade ou item complementar com desconto.";
    const resposta = base
      .replace("{PED}", ticket.pedidoId || "-")
      .replace("{RASTREIO}", "https://rastreio.exemplo.com/" + (ticket.pedidoId || ""));
    setTexto(resposta);
  }

  return (
    <div className="h-full rounded-lg border bg-white flex flex-col">
      <header className="flex items-center justify-between p-4 border-b bg-white">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center text-white relative">
            <User className="w-6 h-6" />
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full ring-2 ring-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{ticket ? ticket.cliente : "Cliente"}</h2>
            <p className="text-sm text-gray-600">{ticket?.canal ?? "SAC"}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="icon" className="text-gray-600 hover:bg-gray-100">
            <Phone className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-gray-600 hover:bg-gray-100">
            <Video className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-gray-600 hover:bg-gray-100">
            <MoreVertical className="w-5 h-5" />
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-gray-50">
        {mensagens.map((m, i) => (
          <div key={i} className={`flex mb-2 ${m.from === "equipe" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-xs lg:max-w-md p-3 rounded-xl shadow-sm ${m.from === "equipe" 
              ? "bg-purple-600 text-white rounded-br-none" 
              : "bg-gray-200 text-gray-800 rounded-tl-none"
            }`}>
              <p className="text-sm">{m.text}</p>
              <span className={`block mt-1 text-xs ${m.from === "equipe" ? "text-purple-100/80" : "text-gray-500"} text-right`}>
                {m.time}
              </span>
            </div>
          </div>
        ))}
      </div>

      <footer className="p-4 border-t bg-white">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={gerarRespostaIA}><Sparkles className="w-4 h-4 mr-2" /> Gerar Resposta (IA)</Button>
            <Button variant="outline" size="sm"><BadgePercent className="w-4 h-4 mr-2" /> Cross-Selling</Button>
          </div>
          {ticket?.pedidoId && <span className="text-xs text-gray-600">Pedido {ticket.pedidoId}</span>}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (texto.trim()) { setMensagens([...mensagens, { from: "equipe", text: texto.trim(), time: "agora" }]); setTexto(""); } }} className="flex items-center space-x-3">
          <Button type="button" variant="ghost" size="icon" className="text-gray-500 hover:bg-gray-100">
            <Paperclip className="w-5 h-5" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="text-gray-500 hover:bg-gray-100">
            <Smile className="w-5 h-5" />
          </Button>
          <Input
            className="flex-1 h-12 rounded-full px-6 bg-gray-100 border-gray-200 focus:border-purple-500 transition-colors"
            placeholder="Escreva uma mensagem..."
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <Button type="submit" className="w-12 h-12 rounded-full bg-purple-600 hover:bg-purple-700" size="icon" disabled={!texto.trim()}>
            <Send className="w-5 h-5" />
          </Button>
        </form>
      </footer>
    </div>
  );
}

function MetricsTab() {
  const sentimentData = [
    { day: "Seg", value: 65 },
    { day: "Ter", value: 58 },
    { day: "Qua", value: 62 },
    { day: "Qui", value: 54 },
    { day: "Sex", value: 60 },
    { day: "Sáb", value: 68 },
    { day: "Dom", value: 70 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[220px]">
          <Select>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Todos os marketplaces" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="mercado-livre">Mercado Livre</SelectItem>
              <SelectItem value="shopee">Shopee</SelectItem>
              <SelectItem value="magalu">Magalu</SelectItem>
              <SelectItem value="amazon">Amazon</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="flex items-center gap-2">
              <Clock className="w-4 h-4" /> Selecionar datas
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-2 w-auto">
            <Calendar />
          </PopoverContent>
        </Popover>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-lg border bg-white p-4">
          <div className="flex items-center gap-2 mb-2"><Sparkles className="w-4 h-4 text-purple-600" /><span className="text-sm font-medium">Valor financeiro gerado por IA</span></div>
          <div className="text-2xl font-bold">R$ 18.920,00</div>
          <div className="text-xs text-gray-600">Últimos 30 dias</div>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="flex items-center gap-2 mb-2"><MessageSquare className="w-4 h-4 text-emerald-600" /><span className="text-sm font-medium">Quantidade de Perguntas respondidas</span></div>
          <div className="text-2xl font-bold">1.247</div>
          <div className="text-xs text-gray-600">No período selecionado</div>
        </div>
        <div className="rounded-lg border bg-red-50 p-4 border-red-200">
          <div className="flex items-center gap-2 mb-2"><AlertTriangle className="w-4 h-4 text-red-600" /><span className="text-sm font-medium text-red-800">Mensagens esperando</span></div>
          <div className="text-2xl font-bold text-red-700">37</div>
          <div className="text-xs text-red-600">Ação recomendada: priorizar alto risco</div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-7">
          <div className="rounded-lg border bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900">Sentimento Médio Diário</h3>
              <span className="text-xs text-gray-600">Monitoramento Contínuo</span>
            </div>
            <ChartContainer config={{ value: { label: "Sentimento", color: "hsl(var(--chart-1))" } }}>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={sentimentData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis domain={[0, 100]} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="value" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        </div>
        <div className="col-span-12 lg:col-span-5 grid gap-4">
          <div className="rounded-lg border bg-white p-4">
            <div className="flex items-center gap-2 mb-2"><AlertTriangle className="w-4 h-4 text-red-600" /><span className="text-sm font-medium">Custo da Insatisfação por Marketplace</span></div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between"><ChannelBadge canal="Mercado Livre" /><span>R$ 4.300</span></div>
              <div className="flex items-center justify-between"><ChannelBadge canal="Shopee" /><span>R$ 3.100</span></div>
              <div className="flex items-center justify-between"><ChannelBadge canal="Magalu" /><span>R$ 2.000</span></div>
              <div className="flex items-center justify-between"><ChannelBadge canal="Amazon" /><span>R$ 1.050</span></div>
            </div>
          </div>
          <div className="rounded-lg border bg-white p-4">
            <div className="flex items-center gap-2 mb-2"><Tag className="w-4 h-4 text-purple-600" /><span className="text-sm font-medium">Causas mais frequentes (IA)</span></div>
            <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
              <li>Produto Quebrado: Lote 37-B (falha na embalagem)</li>
              <li>Atraso de Transporte: Hub SP-02 (pico às segundas)</li>
              <li>Prazo Divergente: Config. ML vs Shopee</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SAC() {
  const [prioridadeInteligenteAtiva, setPrioridadeInteligenteAtiva] = useState(true);
  const [tickets] = useState<Ticket[]>(mockTickets);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | undefined>(mockTickets[0]);
  const perguntas = tickets.filter((t) => t.tipo === "pergunta");
  const reclamacoes = tickets.filter((t) => t.tipo === "reclamacao");
  const posVenda = tickets.filter((t) => t.tipo === "pos_venda");

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gray-50">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <GlobalHeader />
          <main className="flex-1 p-6 overflow-auto">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold text-gray-900 flex items-center"><MessageSquare className="w-6 h-6 mr-2" /> Central de SAC</h1>
                <p className="text-sm text-gray-600">Integração Multi-Canal • Priorização Inteligente • Classificação Automática • PRR</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm"><User className="w-4 h-4 mr-2" /> Minha Fila</Button>
                <Button variant="default" size="sm" className="bg-novura-primary text-white">Novo Ticket</Button>
              </div>
            </div>

            <div className="rounded-lg border bg-amber-50 border-amber-200 p-3 flex items-center gap-3 mt-4">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <div>
                <p className="text-sm font-medium text-amber-800">Alerta de Potencial Problema</p>
                <p className="text-xs text-amber-700">Cliente X: Risco Alto de Atraso. Sugestão: Enviar mensagem proativa agora.</p>
              </div>
            </div>

            <Tabs defaultValue="metricas" className="w-full mt-4">
              <TabsList className="bg-white p-1 rounded-xl border shadow-sm">
                <TabsTrigger value="metricas">Métricas</TabsTrigger>
                <TabsTrigger value="perguntas">Perguntas</TabsTrigger>
                <TabsTrigger value="reclamacoes">Reclamações</TabsTrigger>
                <TabsTrigger value="posvenda">Pós-venda</TabsTrigger>
              </TabsList>

              <TabsContent value="metricas" className="mt-6">
                <MetricsTab />
              </TabsContent>

              <TabsContent value="perguntas" className="mt-6">
                <div className="grid grid-cols-12 gap-6">
                  <div className="col-span-12 lg:col-span-7">
                    <SACTicketInbox
                      tickets={perguntas}
                      titulo="Perguntas"
                      onSelect={setSelectedTicket}
                      prioridadeInteligenteAtiva={prioridadeInteligenteAtiva}
                      setPrioridadeInteligenteAtiva={setPrioridadeInteligenteAtiva}
                    />
                  </div>
                  <div className="col-span-12 lg:col-span-5">
                    <SACChatPanel ticket={selectedTicket} />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="reclamacoes" className="mt-6">
                <div className="grid grid-cols-12 gap-6">
                  <div className="col-span-12 lg:col-span-7">
                    <SACTicketInbox
                      tickets={reclamacoes}
                      titulo="Reclamações"
                      onSelect={setSelectedTicket}
                      prioridadeInteligenteAtiva={prioridadeInteligenteAtiva}
                      setPrioridadeInteligenteAtiva={setPrioridadeInteligenteAtiva}
                    />
                  </div>
                  <div className="col-span-12 lg:col-span-5">
                    <SACChatPanel ticket={selectedTicket} />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="posvenda" className="mt-6">
                <div className="grid grid-cols-12 gap-6">
                  <div className="col-span-12 lg:col-span-7">
                    <SACTicketInbox
                      tickets={posVenda}
                      titulo="Pós-venda"
                      onSelect={setSelectedTicket}
                      prioridadeInteligenteAtiva={prioridadeInteligenteAtiva}
                      setPrioridadeInteligenteAtiva={setPrioridadeInteligenteAtiva}
                    />
                  </div>
                  <div className="col-span-12 lg:col-span-5">
                    <SACChatPanel ticket={selectedTicket} />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}