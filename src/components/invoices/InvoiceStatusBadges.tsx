import { Badge } from "@/components/ui/badge";

export function getStatusBadge(status: string) {
  switch (status) {
    case "Autorizada":
      return <Badge className="bg-green-500 text-white hover:bg-green-500">Autorizada</Badge>;
    case "Pendente":
      return <Badge className="bg-orange-500 text-white hover:bg-orange-500">Pendente</Badge>;
    case "Processando":
      return <Badge className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50">Processando</Badge>;
    case "Na fila":
      return <Badge className="border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-50">Na fila</Badge>;
    case "Cancelada":
      return <Badge className="border-gray-200 bg-gray-100 text-gray-700 hover:bg-gray-100">Cancelada</Badge>;
    case "Rejeitada":
      return <Badge className="bg-red-500 text-white hover:bg-red-500">Rejeitada</Badge>;
    case "Erro":
      return <Badge className="bg-red-500 text-white hover:bg-red-500">Erro</Badge>;
    default:
      return <Badge variant="secondary">{status || "Sem status"}</Badge>;
  }
}

export function getTipoBadge(tipo: string) {
  switch (tipo) {
    case "Entrada":
      return <Badge className="bg-blue-500">Entrada</Badge>;
    case "Saída":
      return <Badge className="bg-green-500">Saída</Badge>;
    case "Compra":
      return <Badge className="bg-purple-500">Compra</Badge>;
    default:
      return <Badge variant="secondary">{tipo}</Badge>;
  }
}

export function getEnvioBadge(status?: string) {
  const s = String(status || "").toLowerCase();
  if (s === "sent") return <Badge className="bg-green-500 text-white">Enviado</Badge>;
  if (s === "error") return <Badge variant="destructive">Erro</Badge>;
  return <Badge variant="outline">Pendente</Badge>;
}
