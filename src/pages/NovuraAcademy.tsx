
import { useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { CleanNavigation } from "@/components/CleanNavigation";
import { GlobalHeader } from "@/components/GlobalHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, Clock, Star, Users, Award } from "lucide-react";
import { Routes, Route } from "react-router-dom";

const navigationItems = [
  { title: "Cursos", path: "", description: "Cursos sobre marketplaces" },
  { title: "Mentorias", path: "/mentorias", description: "Mentorias especializadas" },
];

const cursosData = [
  {
    id: 1,
    titulo: "Mercado Livre Completo",
    instrutor: "João Silva",
    duracao: "2h 30min",
    nivel: "Iniciante",
    avaliacao: 4.9,
    alunos: 1247,
    thumbnail: "/placeholder.svg",
    marketplace: "Mercado Livre"
  },
  {
    id: 2,
    titulo: "Amazon FBA Avançado",
    instrutor: "Maria Santos",
    duracao: "3h 15min",
    nivel: "Avançado",
    avaliacao: 4.8,
    alunos: 856,
    thumbnail: "/placeholder.svg",
    marketplace: "Amazon"
  },
  {
    id: 3,
    titulo: "Shopee para Iniciantes",
    instrutor: "Carlos Lima",
    duracao: "1h 45min",
    nivel: "Iniciante",
    avaliacao: 4.7,
    alunos: 634,
    thumbnail: "/placeholder.svg",
    marketplace: "Shopee"
  }
];

const mentoresData = [
  {
    id: 1,
    nome: "Ana Costa",
    especialidade: "Mercado Livre",
    experiencia: "5 anos",
    avaliacoes: 4.9,
    sessoes: 234,
    foto: "/placeholder.svg",
    marketplaces: ["Mercado Livre", "Amazon"]
  },
  {
    id: 2,
    nome: "Roberto Alves",
    especialidade: "Amazon",
    experiencia: "8 anos",
    avaliacoes: 4.8,
    sessoes: 189,
    foto: "/placeholder.svg",
    marketplaces: ["Amazon", "Shopee"]
  },
  {
    id: 3,
    nome: "Fernanda Lima",
    especialidade: "Multi-marketplace",
    experiencia: "6 anos",
    avaliacoes: 4.9,
    sessoes: 312,
    foto: "/placeholder.svg",
    marketplaces: ["Mercado Livre", "Amazon", "Shopee", "Magazine Luiza"]
  }
];

function Cursos() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cursosData.map((curso) => (
          <Card key={curso.id} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer bg-white rounded-xl overflow-hidden group">
            <CardContent className="p-0">
              <div className="relative">
                <img 
                  src={curso.thumbnail} 
                  alt={curso.titulo}
                  className="w-full h-48 object-cover bg-gray-100"
                />
                <div className="absolute inset-0 bg-black/20"></div>
                <div className="absolute top-4 left-4">
                  <Badge className="bg-novura-primary text-white">
                    {curso.marketplace}
                  </Badge>
                </div>
                <div className="absolute top-4 right-4">
                  <Badge variant="outline" className="bg-white/90 text-gray-700">
                    {curso.nivel}
                  </Badge>
                </div>
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
                    <Play className="w-6 h-6 text-novura-primary ml-1" />
                  </div>
                </div>
              </div>
              
              <div className="p-6">
                <h3 className="font-semibold text-gray-900 mb-2">{curso.titulo}</h3>
                <p className="text-sm text-gray-600 mb-3">Instrutor: {curso.instrutor}</p>
                
                <div className="flex items-center justify-between text-sm text-gray-600 mb-4">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-1">
                      <Clock className="w-4 h-4" />
                      <span>{curso.duracao}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Users className="w-4 h-4" />
                      <span>{curso.alunos}</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Star className="w-4 h-4 text-yellow-500 fill-current" />
                    <span>{curso.avaliacao}</span>
                  </div>
                </div>
                
                <Button className="w-full bg-novura-primary hover:bg-novura-primary/90 rounded-xl">
                  Iniciar Curso
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Mentorias() {
  const [filtroMarketplace, setFiltroMarketplace] = useState("todos");

  const mentoresFiltrados = filtroMarketplace === "todos" 
    ? mentoresData 
    : mentoresData.filter(mentor => mentor.marketplaces.includes(filtroMarketplace));

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4 mb-6">
        <Select value={filtroMarketplace} onValueChange={setFiltroMarketplace}>
          <SelectTrigger className="w-60 rounded-xl">
            <SelectValue placeholder="Filtrar por marketplace" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os Marketplaces</SelectItem>
            <SelectItem value="Mercado Livre">Mercado Livre</SelectItem>
            <SelectItem value="Amazon">Amazon</SelectItem>
            <SelectItem value="Shopee">Shopee</SelectItem>
            <SelectItem value="Magazine Luiza">Magazine Luiza</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mentoresFiltrados.map((mentor) => (
          <Card key={mentor.id} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer bg-white rounded-xl overflow-hidden">
            <CardContent className="p-6">
              <div className="flex items-center space-x-4 mb-4">
                <img 
                  src={mentor.foto} 
                  alt={mentor.nome}
                  className="w-16 h-16 rounded-full object-cover bg-gray-100"
                />
                <div>
                  <h3 className="font-semibold text-gray-900">{mentor.nome}</h3>
                  <p className="text-sm text-gray-600">{mentor.especialidade}</p>
                  <div className="flex items-center space-x-1 mt-1">
                    <Star className="w-4 h-4 text-yellow-500 fill-current" />
                    <span className="text-sm text-gray-600">{mentor.avaliacoes}</span>
                  </div>
                </div>
              </div>
              
              <div className="space-y-3 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Experiência:</span>
                  <span className="text-gray-900">{mentor.experiencia}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Sessões:</span>
                  <span className="text-gray-900">{mentor.sessoes}</span>
                </div>
              </div>

              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-2">Marketplaces:</p>
                <div className="flex flex-wrap gap-1">
                  {mentor.marketplaces.map((marketplace) => (
                    <Badge key={marketplace} variant="outline" className="text-xs">
                      {marketplace}
                    </Badge>
                  ))}
                </div>
              </div>
              
              <Button className="w-full bg-novura-primary hover:bg-novura-primary/90 rounded-xl">
                <Award className="w-4 h-4 mr-2" />
                Agendar Mentoria
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function NovuraAcademy() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gray-50">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col">
          <GlobalHeader />

          {/* Navigation */}
          <CleanNavigation items={navigationItems} basePath="/novura-academy" />

          {/* Main Content */}
          <main className="flex-1 p-6 overflow-auto">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900">Academia de Conhecimento</h1>
              <p className="text-gray-600">Desenvolva suas habilidades com nossos cursos e mentorias especializadas</p>
            </div>

            <Routes>
              <Route path="/" element={<Cursos />} />
              <Route path="/mentorias" element={<Mentorias />} />
            </Routes>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
