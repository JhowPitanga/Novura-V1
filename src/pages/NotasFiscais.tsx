
import { useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { FileText, Download, Eye, Plus, Search, Filter, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SidebarProvider } from "@/components/ui/sidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { AppSidebar } from "@/components/AppSidebar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CleanNavigation } from "@/components/CleanNavigation";

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
            </div>

            <CleanNavigation
              items={[
                { title: "Todas", path: "/todas", description: "Todas as notas" },
                { title: "Saída", path: "/saidas", description: "Notas de saída" },
                { title: "Entrada", path: "/entrada", description: "Notas de entrada" },
              ]}
              basePath="/notas-fiscais"
            />

            <div className="mt-0">
              <Routes>
                <Route
                  path="todas"
                  element={<NotasTodas getStatusBadge={getStatusBadge} getTipoBadge={getTipoBadge} />}
                />
                <Route
                  path="saidas"
                  element={<NotasSaida getStatusBadge={getStatusBadge} getTipoBadge={getTipoBadge} />}
                />
                <Route
                  path="entrada"
                  element={<NotasEntrada getStatusBadge={getStatusBadge} getTipoBadge={getTipoBadge} />}
                />
                <Route index element={<Navigate to="todas" replace />} />
              </Routes>
            </div>

          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function NotasTodas({ getStatusBadge, getTipoBadge }: { getStatusBadge: (s: string) => JSX.Element; getTipoBadge: (t: string) => JSX.Element }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("todos");
  const filtered = notasFiscais.filter((n) => {
    const term = searchTerm.trim().toLowerCase();
    const matchText = `${n.numero} ${n.cliente || ""} ${n.fornecedor || ""}`.toLowerCase().includes(term);
    const matchStatus =
      selectedStatus === "todos" ||
      (selectedStatus === "autorizada" && n.status === "Autorizada") ||
      (selectedStatus === "pendente" && n.status === "Pendente") ||
      (selectedStatus === "cancelada" && n.status === "Cancelada");
    return matchText && matchStatus;
  });
  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Buscar por número, cliente ou fornecedor"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
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
              {filtered.map((nota) => (
                <TableRow key={nota.id} className="hover:bg-gray-50/50">
                  <TableCell>
                    <div>
                      <p className="font-medium text-gray-900">{nota.numero}</p>
                      <p className="text-xs text-gray-500 font-mono">
                        {nota.chave.substring(0, 20)}...
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>{getTipoBadge(nota.tipo)}</TableCell>
                  <TableCell>
                    <span className="text-gray-900">{nota.cliente || nota.fornecedor}</span>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">
                      R$ {nota.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-gray-600">
                      {new Date(nota.data).toLocaleDateString("pt-BR")}
                    </span>
                  </TableCell>
                  <TableCell>{getStatusBadge(nota.status)}</TableCell>
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
    </div>
  );
}

function NotasSaida({ getStatusBadge, getTipoBadge }: { getStatusBadge: (s: string) => JSX.Element; getTipoBadge: (t: string) => JSX.Element }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("todos");
  const filtered = notasFiscais
    .filter((n) => n.tipo === "Saída")
    .filter((n) => {
      const term = searchTerm.trim().toLowerCase();
      const matchText = `${n.numero} ${n.cliente || ""}`.toLowerCase().includes(term);
      const matchStatus =
        selectedStatus === "todos" ||
        (selectedStatus === "autorizada" && n.status === "Autorizada") ||
        (selectedStatus === "pendente" && n.status === "Pendente") ||
        (selectedStatus === "cancelada" && n.status === "Cancelada");
      return matchText && matchStatus;
    });
  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Buscar por número ou cliente"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
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
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-gray-100">
                <TableHead>Número</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((nota) => (
                <TableRow key={nota.id} className="hover:bg-gray-50/50">
                  <TableCell>
                    <div>
                      <p className="font-medium text-gray-900">{nota.numero}</p>
                      <p className="text-xs text-gray-500 font-mono">
                        {nota.chave.substring(0, 20)}...
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>{getTipoBadge(nota.tipo)}</TableCell>
                  <TableCell>
                    <span className="text-gray-900">{nota.cliente}</span>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">
                      R$ {nota.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-gray-600">
                      {new Date(nota.data).toLocaleDateString("pt-BR")}
                    </span>
                  </TableCell>
                  <TableCell>{getStatusBadge(nota.status)}</TableCell>
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
    </div>
  );
}

function NotasEntrada({ getStatusBadge, getTipoBadge }: { getStatusBadge: (s: string) => JSX.Element; getTipoBadge: (t: string) => JSX.Element }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("todos");
  const filtered = notasFiscais
    .filter((n) => n.tipo === "Entrada")
    .filter((n) => {
      const term = searchTerm.trim().toLowerCase();
      const matchText = `${n.numero} ${n.fornecedor || ""}`.toLowerCase().includes(term);
      const matchStatus =
        selectedStatus === "todos" ||
        (selectedStatus === "autorizada" && n.status === "Autorizada") ||
        (selectedStatus === "pendente" && n.status === "Pendente") ||
        (selectedStatus === "cancelada" && n.status === "Cancelada");
      return matchText && matchStatus;
    });
  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Buscar por número ou fornecedor"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
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
        <Button className="bg-novura-primary hover:bg-novura-primary/90">
          <Plus className="w-4 h-4 mr-2" />
          Nova Nota Fiscal
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-gray-100">
                <TableHead>Número</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((nota) => (
                <TableRow key={nota.id} className="hover:bg-gray-50/50">
                  <TableCell>
                    <div>
                      <p className="font-medium text-gray-900">{nota.numero}</p>
                      <p className="text-xs text-gray-500 font-mono">
                        {nota.chave.substring(0, 20)}...
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>{getTipoBadge(nota.tipo)}</TableCell>
                  <TableCell>
                    <span className="text-gray-900">{nota.fornecedor}</span>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">
                      R$ {nota.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-gray-600">
                      {new Date(nota.data).toLocaleDateString("pt-BR")}
                    </span>
                  </TableCell>
                  <TableCell>{getStatusBadge(nota.status)}</TableCell>
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
    </div>
  );
}
