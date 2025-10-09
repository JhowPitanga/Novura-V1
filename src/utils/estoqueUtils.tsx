
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";

export const getStatusBadge = (status: string) => {
  switch (status) {
    case "Crítico":
      return <Badge variant="destructive">Crítico</Badge>;
    case "Baixo":
      return <Badge className="bg-yellow-500 text-white">Baixo</Badge>;
    case "Pendente":
      return <Badge className="bg-orange-500 text-white">Pendente</Badge>;
    case "Conferindo":
      return <Badge className="bg-blue-500 text-white">Conferindo</Badge>;
    case "Concluído":
      return <Badge className="bg-green-500 text-white">Concluído</Badge>;
    case "Em Separação":
      return <Badge className="bg-blue-500 text-white">Em Separação</Badge>;
    case "Aguardando":
      return <Badge className="bg-gray-500 text-white">Aguardando</Badge>;
    case "Separado":
      return <Badge className="bg-green-500 text-white">Separado</Badge>;
    case "Embalado":
      return <Badge className="bg-purple-500 text-white">Embalado</Badge>;
    case "Expedido":
      return <Badge className="bg-green-500 text-white">Expedido</Badge>;
    case "Em Trânsito":
      return <Badge className="bg-blue-500 text-white">Em Trânsito</Badge>;
    case "Urgente":
      return <Badge variant="destructive">Urgente</Badge>;
    case "Alta":
      return <Badge className="bg-orange-500 text-white">Alta</Badge>;
    case "Falha na emissão":
      return <Badge className="bg-red-500 text-white">Falha na emissão</Badge>;
    case "Emitindo":
      return <Badge className="bg-blue-500 text-white">Emitindo</Badge>;
    case "Falha ao enviar":
      return <Badge className="bg-red-500 text-white">Falha ao enviar</Badge>;
    case "Enviado":
      return <Badge className="bg-green-500 text-white">Enviado</Badge>;
    case "Cancelado":
      return <Badge className="bg-gray-500 text-white">Cancelado</Badge>;
    default:
      return <Badge variant="default">Normal</Badge>;
  }
};

export const getStatusIcon = (status: string) => {
  switch (status) {
    case "Crítico":
      return <AlertTriangle className="w-4 h-4 text-red-500" />;
    case "Baixo":
      return <TrendingDown className="w-4 h-4 text-yellow-500" />;
    default:
      return <TrendingUp className="w-4 h-4 text-green-500" />;
  }
};
