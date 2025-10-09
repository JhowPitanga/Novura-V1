
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, PackageCheck, Eye } from "lucide-react";
import { recebimentoData } from "@/data/estoqueData";
import { getStatusBadge } from "@/utils/estoqueUtils";

export function RecebimentoTab() {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-gray-100">
              <TableHead>Nota Fiscal</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Qtd Produtos</TableHead>
              <TableHead>Data Chegada</TableHead>
              <TableHead>Armazém</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-20">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recebimentoData.map((item) => (
              <TableRow key={item.id} className="hover:bg-gray-50/50">
                <TableCell>
                  <span className="font-medium">{item.nf}</span>
                </TableCell>
                <TableCell>{item.fornecedor}</TableCell>
                <TableCell>{item.produtos}</TableCell>
                <TableCell>{new Date(item.dataChegada).toLocaleDateString('pt-BR')}</TableCell>
                <TableCell>{item.galpao}</TableCell>
                <TableCell>{getStatusBadge(item.status)}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem>
                        <PackageCheck className="w-4 h-4 mr-2" />
                        Conferir
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
