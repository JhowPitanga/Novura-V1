import React, { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, BarChart, Bar } from "recharts";
import { MessageSquare, AlertTriangle, Sparkles, User, Clock, BadgePercent, ArrowUpRight, Tag, Send, Shuffle, Smile } from "lucide-react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

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
  onAssign,
  titulo,
  prioridadeInteligenteAtiva,
  setPrioridadeInteligenteAtiva,
}: {
  tickets: Ticket[];
  onSelect: (t: Ticket) => void;
  onAssign: (id: string, user: string) => void;
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
          <div className="col-span-2">Pedido / Atribuição</div>
        </div>
        {sorted.map((t) => (
          <button key={t.id} onClick={() => onSelect(t)} className="grid grid-cols-12 w-full px-4 py-3 text-sm text-left hover:bg-gray-50">
            <div className="col-span-2">
              <div className="font-medium text-gray-900">{t.cliente}</div>
              <div className="text-xs text-gray-500">#{t.id}</div>
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
            <div className="col-span-2 flex items-center gap-2">
              <span className="text-xs text-gray-700">{t.pedidoId || "-"}</span>
              <select
                value={t.atribuidoA || ""}
                onChange={(e) => onAssign(t.id, e.target.value)}
                className="text-xs border rounded px-2 py-1"
              >
                <option value="">Atribuir...</option>
                {membrosEquipe.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
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
    <div className="h-full rounded-lg border bg-white p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-novura-primary" />
          <span className="font-medium">Chat com {ticket ? ticket.cliente : "Cliente"}</span>
          {ticket?.pedidoId && <span className="text-xs text-gray-600">Pedido {ticket.pedidoId}</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={gerarRespostaIA}><Sparkles className="w-4 h-4 mr-2" /> Gerar Resposta (IA)</Button>
          <Button variant="outline" size="sm"><BadgePercent className="w-4 h-4 mr-2" /> Cross-Selling</Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto space-y-4">
        {mensagens.map((m, i) => (
          <div key={i} className={`max-w-[70%] p-3 rounded-lg ${m.from === "cliente" ? "bg-gray-100 text-gray-800" : "bg-novura-primary/10 text-gray-900 ml-auto"}`}>
            <div className="text-xs text-gray-500 mb-1">{m.time}</div>
            <div className="text-sm">{m.text}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Input placeholder="Digite sua mensagem..." value={texto} onChange={(e) => setTexto(e.target.value)} />
        <Button onClick={() => { if (texto.trim()) { setMensagens([...mensagens, { from: "equipe", text: texto.trim(), time: "agora" }]); setTexto(""); } }}>
          <Send className="w-4 h-4 mr-2" /> Enviar
        </Button>
      </div>
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
          <div className="flex items-center gap-2 mb-2"><ArrowUpRight className="w-4 h-4 text-emerald-600" /><span className="text-sm font-medium">Valor Financeiro Salvo por Atendimento Proativo (PRR)</span></div>
          <div className="text-2xl font-bold">R$ 12.450,00</div>
          <div className="text-xs text-gray-600">Últimos 30 dias</div>
        </div>
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
          <div className="flex items-center gap-2 mb-2"><Tag className="w-4 h-4 text-purple-600" /><span className="text-sm font-medium">Causas Raiz Mais Frequentes (IA)</span></div>
          <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
            <li>Produto Quebrado: Lote 37-B (falha na embalagem)</li>
            <li>Atraso de Transporte: Hub SP-02 (pico às segundas)</li>
            <li>Prazo Divergente: Config. ML vs Shopee</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function SAC() {
  const [prioridadeInteligenteAtiva, setPrioridadeInteligenteAtiva] = useState(true);
  const [tickets, setTickets] = useState<Ticket[]>(mockTickets);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | undefined>(tickets[0]);
  const perguntas = tickets.filter((t) => t.tipo === "pergunta");
  const reclamacoes = tickets.filter((t) => t.tipo === "reclamacao");
  const posVenda = tickets.filter((t) => t.tipo === "pos_venda");

  function handleAssign(id: string, user: string) {
    setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, atribuidoA: user } : t)));
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
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
      {/* Alerta Proativo (PRR) */}
      <div className="rounded-lg border bg-amber-50 border-amber-200 p-3 flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600" />
        <div>
          <p className="text-sm font-medium text-amber-800">Alerta de Potencial Problema</p>
          <p className="text-xs text-amber-700">Cliente X: Risco Alto de Atraso. Sugestão: Enviar mensagem proativa agora.</p>
        </div>
      </div>
      {/* Conteúdo por abas */}
      <Tabs defaultValue="metricas" className="w-full">
        <TabsList className="bg-gray-100 p-1 rounded-xl border-0 shadow-sm">
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
                onAssign={handleAssign}
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
                onAssign={handleAssign}
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
                onAssign={handleAssign}
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
    </div>
  );
}