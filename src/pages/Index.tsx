
import { Dashboard } from "@/components/Dashboard";
import { SidebarProvider } from "@/components/ui/sidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Play, Clock, Star, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const aulasData = [
  {
    id: 1,
    titulo: "Introdução ao Novura ERP",
    duracao: "15 min",
    nivel: "Iniciante",
    avaliacao: 4.9,
    thumbnail: "/placeholder.svg",
    categoria: "Fundamentos"
  },
  {
    id: 2,
    titulo: "Gestão de Produtos Avançada",
    duracao: "25 min",
    nivel: "Intermediário",
    avaliacao: 4.8,
    thumbnail: "/placeholder.svg",
    categoria: "Produtos"
  },
  {
    id: 3,
    titulo: "Automação de Pedidos",
    duracao: "20 min",
    nivel: "Avançado",
    avaliacao: 4.9,
    thumbnail: "/placeholder.svg",
    categoria: "Pedidos"
  }
];

const Index = () => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const itemsPerSlide = 3;
  const totalSlides = Math.ceil(aulasData.length / itemsPerSlide);
  const { organizationId } = useAuth();

  interface ExpiringCert {
    id: string;
    company_id: string;
    valid_to: string; // YYYY-MM-DD
    file_name?: string | null;
    company_name?: string | null;
    daysLeft: number;
  }

  const [expiringCerts, setExpiringCerts] = useState<ExpiringCert[]>([]);
  const [loadingCerts, setLoadingCerts] = useState(false);

  const today = useMemo(() => new Date(), []);
  const toDateStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  useEffect(() => {
    const fetchExpiring = async () => {
      if (!organizationId) return;
      setLoadingCerts(true);
      try {
        const { data, error } = await supabase
          .from('company_certificates')
          .select('id, company_id, organizations_id, valid_to, file_name, companies:company_id(razao_social)')
          .eq('active', true)
          .eq('organizations_id', organizationId)
          .not('valid_to', 'is', null)
          .lte('valid_to', toDateStr)
          .order('valid_to', { ascending: true });

        if (error) throw error;

        const mapped: ExpiringCert[] = (data || []).map((row: any) => {
          const vt = row.valid_to as string;
          const vtDate = new Date(vt + 'T00:00:00');
          const diffMs = vtDate.getTime() - today.getTime();
          const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          return {
            id: row.id,
            company_id: row.company_id,
            valid_to: vt,
            file_name: row.file_name ?? null,
            company_name: row.companies?.razao_social ?? null,
            daysLeft,
          };
        });

        setExpiringCerts(mapped);
      } catch (e) {
        console.error('Falha ao carregar certificados a vencer:', e);
        setExpiringCerts([]);
      } finally {
        setLoadingCerts(false);
      }
    };
    fetchExpiring();
  }, [organizationId, toDateStr, today]);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % totalSlides);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + totalSlides) % totalSlides);
  };

  const visibleItems = aulasData.slice(
    currentSlide * itemsPerSlide,
    (currentSlide + 1) * itemsPerSlide
  );

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gray-50">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col">
          <GlobalHeader />

          {/* Main Content */}
          <main className="flex-1 p-6 overflow-auto">
            {/* Alerta de Certificados A1 a vencer */}
            {expiringCerts.length > 0 && (
              <Card className="mb-8 border-yellow-200 bg-yellow-50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-yellow-700" />
                      <h3 className="text-base font-semibold text-yellow-800">Certificados A1 vencendo em até 30 dias</h3>
                    </div>
                    {loadingCerts && (
                      <span className="text-xs text-yellow-700">Atualizando...</span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {expiringCerts.map((c) => {
                      const expired = c.daysLeft < 0;
                      const critical = c.daysLeft <= 7;
                      const dateFmt = new Date(c.valid_to + 'T00:00:00').toLocaleDateString('pt-BR');
                      return (
                        <div key={c.id} className="flex items-center justify-between p-3 rounded-md bg-white border border-yellow-200">
                          <div className="flex items-center gap-3">
                            <Badge variant={expired ? "destructive" : "secondary"}>
                              {expired ? 'Vencido' : `${c.daysLeft} dia${Math.abs(c.daysLeft) === 1 ? '' : 's'}`}
                            </Badge>
                            <div className="text-sm text-gray-800">
                              <span className="font-medium">{c.company_name || 'Empresa'}</span>
                              <span className="text-gray-500"> • Validade: {dateFmt}</span>
                            </div>
                          </div>
                          <Button asChild size="sm" className={critical || expired ? 'bg-red-600 hover:bg-red-700' : 'bg-novura-primary hover:bg-novura-primary/90'}>
                            <Link to={`/configuracoes/notas-fiscais/nova-empresa?companyId=${c.company_id}&step=2&mode=edit`}>
                              Renovar
                            </Link>
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
            {/* Banner de Ofertas Recursos Seller */}
            <Card className="mb-8 gradient-purple text-white overflow-hidden relative">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h2 className="text-xl font-bold mb-2">🛍️ Ofertas Especiais - Recursos Seller</h2>
                    <p className="text-purple-100 mb-4">
                      Descubra produtos com desconto exclusivo para sellers. Fitas, embalagens, etiquetas e impressoras com preços especiais!
                    </p>
                    <Button asChild variant="secondary" className="bg-white text-novura-primary hover:bg-gray-100">
                      <Link to="/recursos-seller">
                        Ver Ofertas
                        <ChevronRight className="w-4 h-4 ml-2" />
                      </Link>
                    </Button>
                  </div>
                  <div className="hidden md:block">
                    <div className="w-32 h-32 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm">
                      <span className="text-4xl">🎯</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* Quadro de Vendas do Dia */}
            <Card className="mb-8 border-0 shadow-lg rounded-xl bg-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Resumo do Dia</h3>
                  <Button asChild variant="outline" size="sm" className="rounded-xl">
                    <Link to="/desempenho">
                      Ver Desempenho
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Link>
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-6">
                  <div className="text-center p-4 bg-gray-50 rounded-xl">
                    <div className="text-2xl font-bold text-gray-900 mb-1">R$ 12.847</div>
                    <div className="text-sm text-gray-600">Vendas do Dia</div>
                  </div>
                  <div className="text-center p-4 bg-gray-50 rounded-xl">
                    <div className="text-2xl font-bold text-gray-900 mb-1">89</div>
                    <div className="text-sm text-gray-600">Pedidos</div>
                  </div>
                  <div className="text-center p-4 bg-gray-50 rounded-xl">
                    <div className="text-2xl font-bold text-gray-900 mb-1">22.5%</div>
                    <div className="text-sm text-gray-600">Margem do Dia</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quadro de Pedidos */}
            <Card className="mb-8 border-0 shadow-lg rounded-xl bg-white">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Status dos Pedidos</h3>
                <div className="grid grid-cols-5 gap-4">
                  <Button asChild variant="ghost" className="h-auto p-4 flex flex-col items-center space-y-2 hover:bg-gray-50 rounded-xl">
                    <Link to="/pedidos">
                      <div className="text-2xl font-bold text-gray-900">18</div>
                      <div className="text-sm text-gray-600 text-center">Vincular</div>
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" className="h-auto p-4 flex flex-col items-center space-y-2 hover:bg-gray-50 rounded-xl">
                    <Link to="/pedidos">
                      <div className="text-2xl font-bold text-gray-900">25</div>
                      <div className="text-sm text-gray-600 text-center">Impressão</div>
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" className="h-auto p-4 flex flex-col items-center space-y-2 hover:bg-gray-50 rounded-xl">
                    <Link to="/pedidos">
                      <div className="text-2xl font-bold text-red-600">8</div>
                      <div className="text-sm text-red-600 text-center">Coleta Atrasada</div>
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" className="h-auto p-4 flex flex-col items-center space-y-2 hover:bg-gray-50 rounded-xl">
                    <Link to="/pedidos">
                      <div className="text-2xl font-bold text-gray-900">67</div>
                      <div className="text-sm text-gray-600 text-center">Enviado</div>
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" className="h-auto p-4 flex flex-col items-center space-y-2 hover:bg-gray-50 rounded-xl">
                    <Link to="/pedidos">
                      <div className="text-2xl font-bold text-gray-900">3</div>
                      <div className="text-sm text-gray-600 text-center">Devoluções</div>
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Quadro de Estoque e CRM */}
            <div className="grid grid-cols-2 gap-6 mb-8">
              <Card className="border-0 shadow-lg rounded-xl bg-white">
                <CardContent className="p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Status do Estoque</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <span className="text-gray-700">Sem Estoque Full</span>
                      <span className="font-semibold text-gray-900">5</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-700">Sem Estoque Armazém</span>
                      <span className="font-semibold text-gray-900">12</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <span className="text-gray-700">Estoque Baixo</span>
                      <span className="font-semibold text-gray-900">23</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg rounded-xl bg-white">
                <CardContent className="p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">CRM</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <span className="text-gray-700 flex items-center">
                        Perguntas
                      </span>
                      <span className="font-semibold text-gray-900">7</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <span className="text-red-600 flex items-center">
                        Reclamações
                      </span>
                      <span className="font-semibold text-red-600">3</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <span className="text-gray-700 flex items-center">
                        Mensagens de Clientes
                      </span>
                      <span className="font-semibold text-gray-900">15</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            
            {/* Academia Novura - Carrossel Centralizado */}
            <div>
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Academia Novura</h2>
                  <p className="text-gray-600 mt-1">Aprenda a dominar todas as funcionalidades do sistema</p>
                </div>
                <Button asChild variant="outline" size="sm" className="rounded-xl">
                  <Link to="/novura-academy">
                    Ver Todos os Cursos
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Link>
                </Button>
              </div>
              
              <div className="relative">
                <div className="flex justify-center space-x-6">
                  {visibleItems.map((aula) => (
                    <Card key={aula.id} className="w-80 border-0 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer bg-white rounded-xl overflow-hidden group">
                      <CardContent className="p-0">
                        <div className="relative">
                          <img 
                            src={aula.thumbnail} 
                            alt={aula.titulo}
                            className="w-full h-48 object-cover bg-gray-100"
                          />
                          <div className="absolute inset-0 bg-black/20"></div>
                          <div className="absolute top-4 left-4">
                            <Badge className="bg-novura-primary text-white">
                              {aula.categoria}
                            </Badge>
                          </div>
                          <div className="absolute top-4 right-4">
                            <Badge variant="outline" className="bg-white/90 text-gray-700">
                              {aula.nivel}
                            </Badge>
                          </div>
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
                              <Play className="w-6 h-6 text-novura-primary ml-1" />
                            </div>
                          </div>
                        </div>
                        
                        <div className="p-6">
                          <h3 className="font-semibold text-gray-900 mb-2 line-clamp-1">{aula.titulo}</h3>
                          
                          <div className="flex items-center justify-between text-sm text-gray-600 mb-3">
                            <div className="flex items-center space-x-1">
                              <Clock className="w-4 h-4" />
                              <span>{aula.duracao}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <Star className="w-4 h-4 text-yellow-500 fill-current" />
                              <span>{aula.avaliacao}</span>
                            </div>
                          </div>
                          
                          <div className="w-full bg-gray-200 rounded-full h-1.5">
                            <div 
                              className="bg-novura-primary h-1.5 rounded-full" 
                              style={{ width: `${Math.random() * 100}%` }}
                            ></div>
                          </div>
                          <p className="text-xs text-gray-500 mt-2">
                            {Math.floor(Math.random() * 80 + 10)}% concluído
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                
                {/* Carousel Navigation */}
                {totalSlides > 1 && (
                  <>
                    <Button
                      variant="outline"
                      size="icon"
                      className="absolute left-4 top-1/2 transform -translate-y-1/2 w-10 h-10 rounded-full bg-white shadow-lg hover:shadow-xl"
                      onClick={prevSlide}
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 w-10 h-10 rounded-full bg-white shadow-lg hover:shadow-xl"
                      onClick={nextSlide}
                    >
                      <ChevronRight className="w-5 h-5" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Index;
