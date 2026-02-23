export type TicketType = "pergunta" | "reclamacao" | "pos_venda";

export type Ticket = {
    id: string;
    canal: "Shopee" | "Mercado Livre" | "Magalu" | "Amazon";
    cliente: string;
    assunto: string;
    tipo: TicketType;
    pedidoId?: string;
    status: "novo" | "em_andamento" | "aguardando_cliente" | "resolvido";
    volatilidade: number; // 0-100
    riscoPRR: "Baixo" | "Médio" | "Alto";
    tagsIA: string[];
    atribuidoA?: string;
    historico: { time: string; event: string }[];
    slaMinLeft: number;
    itemId?: string;
    createdAt?: string;
    hold?: boolean;
    suspectedSpam?: boolean;
    deletedFromListing?: boolean;
    answerStatus?: "ACTIVE" | "DISABLED" | "BANNED" | null;
};

export const membrosEquipe = ["Ana", "Carlos", "Marina", "João", "Fernanda"];

export const mockTickets: Ticket[] = [
    {
        id: "TCK-001", canal: "Mercado Livre", cliente: "Paulo Andrade",
        assunto: "Dúvida de prazo de entrega", tipo: "pergunta", pedidoId: "PED12345",
        status: "novo", volatilidade: 35, riscoPRR: "Médio", tagsIA: ["Dúvida de Prazo"],
        historico: [{ time: "há 5 min", event: "Mensagem recebida" }], slaMinLeft: 95,
        itemId: "MLB1623490410", createdAt: "há 5 min", hold: false, suspectedSpam: false,
        deletedFromListing: false, answerStatus: null,
    },
    {
        id: "TCK-002", canal: "Shopee", cliente: "Larissa Dias",
        assunto: "Produto chegou com defeito", tipo: "reclamacao", pedidoId: "PED12346",
        status: "em_andamento", volatilidade: 82, riscoPRR: "Alto", tagsIA: ["Reclamação de Defeito"],
        historico: [{ time: "há 12 min", event: "Mensagem recebida" }], atribuidoA: "Ana", slaMinLeft: 20,
    },
    {
        id: "TCK-003", canal: "Amazon", cliente: "Ricardo M.",
        assunto: "Problema de rastreio", tipo: "pos_venda", pedidoId: "PED12347",
        status: "aguardando_cliente", volatilidade: 58, riscoPRR: "Médio", tagsIA: ["Problema de Rastreio"],
        historico: [{ time: "há 1 h", event: "Mensagem enviada: link de rastreio" }], atribuidoA: "Carlos", slaMinLeft: 45,
    },
    {
        id: "TCK-004", canal: "Magalu", cliente: "Débora S.",
        assunto: "Troca por tamanho", tipo: "pos_venda", pedidoId: "PED12348",
        status: "novo", volatilidade: 44, riscoPRR: "Baixo", tagsIA: ["Troca / Devolução"],
        historico: [{ time: "há 20 min", event: "Mensagem recebida" }], slaMinLeft: 120,
    },
    {
        id: "TCK-005", canal: "Mercado Livre", cliente: "Beatriz Souza",
        assunto: "Tem tamanho P disponível?", tipo: "pergunta", pedidoId: undefined,
        status: "em_andamento", volatilidade: 52, riscoPRR: "Baixo", tagsIA: ["Disponibilidade", "Tamanho"],
        historico: [{ time: "há 20 min", event: "Mensagem recebida" }], slaMinLeft: 70,
        itemId: "MLB1234567890", createdAt: "há 20 min", hold: false, suspectedSpam: false,
        deletedFromListing: false, answerStatus: "ACTIVE",
    },
    {
        id: "TCK-006", canal: "Mercado Livre", cliente: "Eduardo Lima",
        assunto: "Posso retirar em loja?", tipo: "pergunta", pedidoId: undefined,
        status: "aguardando_cliente", volatilidade: 41, riscoPRR: "Médio", tagsIA: ["Retirada", "Entrega"],
        historico: [{ time: "há 1 h", event: "Mensagem enviada: política de retirada" }], slaMinLeft: 35,
        itemId: "MLB0987654321", createdAt: "há 1 h", hold: true, suspectedSpam: false,
        deletedFromListing: false, answerStatus: "DISABLED",
    },
    {
        id: "TCK-007", canal: "Mercado Livre", cliente: "Carla M.",
        assunto: "Qual a voltagem do produto?", tipo: "pergunta", pedidoId: undefined,
        status: "resolvido", volatilidade: 28, riscoPRR: "Baixo", tagsIA: ["Especificação Técnica"],
        historico: [{ time: "há 2 h", event: "Resposta enviada: voltagem 110/220 bivolt" }], slaMinLeft: 120,
        itemId: "MLB1122334455", createdAt: "há 2 h", hold: false, suspectedSpam: false,
        deletedFromListing: false, answerStatus: "ACTIVE",
    },
    {
        id: "TCK-008", canal: "Mercado Livre", cliente: "Rafael P.",
        assunto: "Preço por atacado?", tipo: "pergunta", pedidoId: undefined,
        status: "novo", volatilidade: 76, riscoPRR: "Alto", tagsIA: ["Negociação", "Atacado"],
        historico: [{ time: "há 10 min", event: "Mensagem recebida" }], slaMinLeft: 25,
        itemId: "MLB5566778899", createdAt: "há 10 min", hold: false, suspectedSpam: true,
        deletedFromListing: false, answerStatus: "BANNED",
    },
];
