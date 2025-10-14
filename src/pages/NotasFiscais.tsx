
import { useState } from "react";
import { FileText, Download, Eye, Plus, Search, Filter, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SidebarProvider } from "@/components/ui/sidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { AppSidebar } from "@/components/AppSidebar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Bell, Users } from "lucide-react";

const notasFiscais = [
  { id: 1, numero: "000001234", tipo: "Saída", cliente: "João Silva Santos", valor: 2599.99, data: "2024-01-15", status: "Autorizada", chave: "35240101234567000123550010000012341123456789" },
  { id: 2, numero: "000001235", tipo: "Entrada", fornecedor: "Tech Distribuidora Ltda", valor: 15999.90, data: "2024-01-14", status: "Autorizada", chave: "35240101234567000123550010000012351123456789" },
  { id: 3, numero: "000001236", tipo: "Saída", cliente: "Maria Oliveira Costa", valor: 899.99, data: "2024-01-13", status: "Pendente", chave: "35240101234567000123550010000012361123456789" },
  { id: 4, numero: "000001237", tipo: "Compra", fornecedor: "Apple Inc.", valor: 45999.50, data: "2024-01-12", status: "Autorizada", chave: "35240101234567000123550010000012371123456789" },
  { id: 5, numero: "000001238", tipo: "Saída", cliente: "Pedro Henrique Lima", valor: 1299.99, data: "2024-01-11", status: "Cancelada", chave: "35240101234567000123550010000012381123456789" },
  { id: 6, numero: "000001239", tipo: "Entrada", fornecedor: "Samsung Brasil", valor: 8999.99, data: "2024-01-10", status: "Autorizada", chave: "35240101234567000123550010000012391123456789" },
  { id: 7, numero: "000001240", tipo: "Saída", cliente: "Ana Paula Santos", valor: 3499.99, data: "2024-01-09", status: "Autorizada", chave: "35240101234567000123550010000012401123456789" },
  { id: 8, numero: "000001241", tipo: "Compra", fornecedor: "Multilaser S.A.", valor: 2199.99, data: "2024-01-08", status: "Pendente", chave: "35240101234567000123550010000012411123456789" },
];

export default function NotasFiscais() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTipo, setSelectedTipo] = useState("todos");
  const [selectedStatus, setSelectedStatus] = useState("todos");

  const getStatusBadge = (status: string) => {
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
  };

  const getTipoBadge = (tipo: string) => {
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
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gray-50">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col">
          <GlobalHeader />
          
          {/* Main Content */}
          <main className="flex-1 p-6 overflow-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Controle de Notas Fiscais</h1>
                <p className="text-gray-600">Gerencie todas as suas notas fiscais de entrada, saída e compras</p>
              </div>
              <Button className="bg-novura-primary hover:bg-novura-primary/90">
                <Plus className="w-4 h-4 mr-2" />
                Nova Nota Fiscal
              </Button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total do Mês</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">R$ 81.399,34</div>
                  <p className="text-xs text-muted-foreground">8 notas emitidas</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Notas de Saída</CardTitle>
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">4</div>
                  <p className="text-xs text-muted-foreground">R$ 8.299,96</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Notas de Entrada</CardTitle>
                  <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">2</div>
                  <p className="text-xs text-muted-foreground">R$ 24.999,89</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Notas de Compra</CardTitle>
                  <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">2</div>
                  <p className="text-xs text-muted-foreground">R$ 48.199,49</p>
                </CardContent>
              </Card>
            </div>

            {/* Filters */}
            <div className="flex items-center space-x-4 mb-6">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Buscar por número, cliente ou fornecedor..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={selectedTipo} onValueChange={setSelectedTipo}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  <SelectItem value="entrada">Entrada</SelectItem>
                  <SelectItem value="saida">Saída</SelectItem>
                  <SelectItem value="compra">Compra</SelectItem>
                </SelectContent>
              </Select>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  <SelectItem value="autorizada">Autorizada</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm">
                <Filter className="w-4 h-4 mr-2" />
                Mais Filtros
              </Button>
            </div>

            {/* Notes Table */}
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-gray-100">
                      <TableHead>Número</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Cliente/Fornecedor</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-20">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {notasFiscais.map((nota) => (
                      <TableRow key={nota.id} className="hover:bg-gray-50/50">
                        <TableCell>
                          <div>
                            <p className="font-medium text-gray-900">{nota.numero}</p>
                            <p className="text-xs text-gray-500 font-mono">
                              {nota.chave.substring(0, 20)}...
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {getTipoBadge(nota.tipo)}
                        </TableCell>
                        <TableCell>
                          <span className="text-gray-900">
                            {nota.cliente || nota.fornecedor}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">
                            R$ {nota.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-gray-600">
                            {new Date(nota.data).toLocaleDateString('pt-BR')}
                          </span>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(nota.status)}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuItem>
                                <Eye className="w-4 h-4 mr-2" />
                                Visualizar
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Download className="w-4 h-4 mr-2" />
                                Download PDF
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Download className="w-4 h-4 mr-2" />
                                Download XML
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
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
