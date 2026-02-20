import { Badge } from "@/components/ui/badge";

export function getStatusBadge(status: string) {
  switch (status) {
    case "Autorizada":
      return <Badge variant="default">Autorizada</Badge>;
    case "Pendente":
      return <Badge className="bg-yellow-500">Pendente</Badge>;
    case "Cancelada":
      return <Badge variant="destructive">Cancelada</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
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
