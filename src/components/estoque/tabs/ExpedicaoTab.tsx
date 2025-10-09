
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Truck, Eye } from "lucide-react";
import { expedicaoData } from "@/data/estoqueData";
import { getStatusBadge } from "@/utils/estoqueUtils";

export function ExpedicaoTab() {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-gray-100">
              <TableHead>Pedido</TableHead>
              <TableHead>Transportadora</TableHead>
              <TableHead>Rastreamento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Previsão</TableHead>
              <TableHead>Armazém</TableHead>
              <TableHead className="w-20">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expedicaoData.map((item) => (
              <TableRow key={item.id} className="hover:bg-gray-50/50">
                <TableCell>
                  <span className="font-medium">{item.pedido}</span>
                </TableCell>
                <TableCell>{item.transportadora}</TableCell>
                <TableCell>
                  <Badge variant="outline">{item.rastreamento}</Badge>
                </TableCell>
                <TableCell>{getStatusBadge(item.status)}</TableCell>
                <TableCell>{new Date(item.previsao).toLocaleDateString('pt-BR')}</TableCell>
                <TableCell>{item.galpao}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem>
                        <Truck className="w-4 h-4 mr-2" />
                        Rastrear
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Eye className="w-4 h-4 mr-2" />
                        Detalhes
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
