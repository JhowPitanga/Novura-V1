
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";

export function FulfillmentTab() {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Mercado Livre Full</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Produtos ativos:</span>
                <span className="font-bold">15</span>
              </div>
              <div className="flex justify-between">
                <span>Estoque total:</span>
                <span className="font-bold">245</span>
              </div>
              <div className="flex justify-between">
                <span>Vendas hoje:</span>
                <span className="font-bold text-green-600">8</span>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Amazon FBA</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Produtos ativos:</span>
                <span className="font-bold">12</span>
              </div>
              <div className="flex justify-between">
                <span>Estoque total:</span>
                <span className="font-bold">189</span>
              </div>
              <div className="flex justify-between">
                <span>Vendas hoje:</span>
                <span className="font-bold text-green-600">5</span>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Centro Próprio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Produtos ativos:</span>
                <span className="font-bold">18</span>
              </div>
              <div className="flex justify-between">
                <span>Estoque total:</span>
                <span className="font-bold">312</span>
              </div>
              <div className="flex justify-between">
                <span>Vendas hoje:</span>
                <span className="font-bold text-green-600">12</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Produtos Fulfillment</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Marketplace</TableHead>
                <TableHead>Estoque</TableHead>
                <TableHead>Vendas 7d</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>iPhone 15 Pro</TableCell>
                <TableCell>Mercado Livre</TableCell>
                <TableCell>25</TableCell>
                <TableCell>8</TableCell>
                <TableCell><Badge className="bg-green-500">Ativo</Badge></TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm">
                    <Eye className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
