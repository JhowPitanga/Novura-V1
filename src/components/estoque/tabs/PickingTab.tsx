
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, PackageOpen, Eye } from "lucide-react";
import { pickingData } from "@/data/estoqueData";
import { getStatusBadge } from "@/utils/estoqueUtils";

export function PickingTab() {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-gray-100">
              <TableHead>Pedido</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Qtd Produtos</TableHead>
              <TableHead>Prioridade</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Operador</TableHead>
              <TableHead>Armazém</TableHead>
              <TableHead className="w-20">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pickingData.map((item) => (
              <TableRow key={item.id} className="hover:bg-gray-50/50">
                <TableCell>
                  <span className="font-medium">{item.pedido}</span>
                </TableCell>
                <TableCell>{item.cliente}</TableCell>
                <TableCell>{item.produtos}</TableCell>
                <TableCell>{getStatusBadge(item.prioridade)}</TableCell>
                <TableCell>{getStatusBadge(item.status)}</TableCell>
                <TableCell>{item.operador}</TableCell>
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
                        <PackageOpen className="w-4 h-4 mr-2" />
                        Iniciar Picking
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Eye className="w-4 h-4 mr-2" />
                        Ver Roteiro
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
