
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
  const [statusCounts, setStatusCounts] = useState({ vincular: 0, emissao: 0, impressao: 0, coleta: 0, enviado: 0 });
  const [delayedFlags, setDelayedFlags] = useState({ vincular: false, emissao: false, impressao: false, coleta: false });

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
          .from('companies')
          .select('id, organization_id, certificado_validade, certificado_a1_url, razao_social')
          .eq('organization_id', organizationId)
          .not('certificado_validade', 'is', null)
          .lte('certificado_validade', toDateStr)
          .order('certificado_validade', { ascending: true });

        if (error) throw error;

        const mapped: ExpiringCert[] = (data || []).map((row: any) => {
          const vt = row.certificado_validade as string;
          const vtDate = new Date(vt + 'T00:00:00');
          const diffMs = vtDate.getTime() - today.getTime();
          const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          return {
            id: row.id,
            company_id: row.id,
            valid_to: vt,
            file_name: row.certificado_a1_url ?? null,
            company_name: row.razao_social ?? null,
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

  useEffect(() => {
    const fetchCounts = async () => {
      if (!organizationId) return;
      try {
        const mk = 'marketplace_orders_presented_new';
        const delivered = ['delivered','receiver_received','picked_up','ready_to_pickup','shipped','dropped_off'];
        const { data, error } = await (supabase as any)
          .from(mk)
          .select('id,status_interno,shipment_status,shipment_sla_status,estimated_delivery_limit_at,shipment_sla_expected_date')
          .eq('organizations_id', organizationId);
        if (error) throw error;
        const rows: any[] = Array.isArray(data) ? data : [];
        const vincArr = ['A vincular','A Vincular','A VINCULAR'];
        const emisArr = ['Emissao NF','Emissão NF','EMISSÃO NF','Subir xml','subir xml'];
        const imprArr = ['Impressao','Impressão','IMPRESSÃO'];
        const colArr = ['Aguardando Coleta','Aguardando coleta','AGUARDANDO COLETA'];
        const cancelArr = ['Cancelado','Devolução','Devolucao'];
        const isDelivered = (s: any) => delivered.includes(String(s || '').toLowerCase());
        const nowMs = Date.now();
        const isExpired = (r: any) => {
          const edStr = r?.estimated_delivery_limit_at || r?.shipment_sla_expected_date;
          if (!edStr) return false;
          const ed = new Date(edStr).getTime();
          return ed <= nowMs;
        };
        const isDelayed = (r: any) => {
          const si = String(r?.status_interno || '');
          if (si === 'Enviado' || cancelArr.includes(si)) return false;
          if (isDelivered(r?.shipment_status)) return false;
          const slaStatusLower = String(r?.shipment_sla_status || '').toLowerCase();
          return slaStatusLower === 'delayed' || isExpired(r);
        };
        const vincRows = rows.filter(r => vincArr.includes(String(r?.status_interno || '')));
        const emisRows = rows.filter(r => emisArr.includes(String(r?.status_interno || '')));
        const imprRows = rows.filter(r => imprArr.includes(String(r?.status_interno || '')));
        const colRows = rows.filter(r => colArr.includes(String(r?.status_interno || '')));
        const envRows = rows.filter(r => String(r?.status_interno || '') === 'Enviado');
        setStatusCounts({
          vincular: vincRows.length,
          emissao: emisRows.length,
          impressao: imprRows.length,
          coleta: colRows.length,
          enviado: envRows.length,
        });
        setDelayedFlags({
          vincular: vincRows.some(isDelayed),
          emissao: emisRows.some(isDelayed),
          impressao: imprRows.some(isDelayed),
          coleta: colRows.some(isDelayed),
        });
      } catch {
        setStatusCounts({ vincular: 0, emissao: 0, impressao: 0, coleta: 0, enviado: 0 });
        setDelayedFlags({ vincular: false, emissao: false, impressao: false, coleta: false });
      }
    };
    fetchCounts();
  }, [organizationId]);

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
              <Card className="mb-8 border-purple-200 bg-purple-50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-purple-700" />
                      <h3 className="text-base font-semibold text-purple-800">Certificados A1 vencendo em até 30 dias</h3>
                    </div>
                    {loadingCerts && (
                      <span className="text-xs text-purple-700">Atualizando...</span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {expiringCerts.map((c) => {
                      const expired = c.daysLeft < 0;
                      const critical = c.daysLeft <= 7;
                      const dateFmt = new Date(c.valid_to + 'T00:00:00').toLocaleDateString('pt-BR');
                      return (
                        <div
                          key={c.id}
                          className={`flex items-center justify-between p-3 rounded-md ${expired ? 'bg-red-50 border border-red-200' : 'bg-white border border-purple-200'}`}
                        >
                          <div className="flex items-center gap-3">
                            <Badge
                              variant={expired ? "destructive" : "secondary"}
                              className={expired ? "bg-red-600 text-white" : "bg-purple-100 text-purple-800"}
                            >
                              {expired ? 'Vencido' : `${c.daysLeft} dia${Math.abs(c.daysLeft) === 1 ? '' : 's'}`}
                            </Badge>
                            <div className="text-sm text-gray-800">
                              <span className="font-medium">{c.company_name || 'Empresa'}</span>
                              <span className="text-gray-500"> • Validade: {dateFmt}</span>
                              {expired ? (
                                <div className="text-xs text-red-700 mt-1">
                                  Certificado vencido, atualize para voltar a emitir suas notas
                                </div>
                              ) : null}
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
            <Card className="mb-8 bg-gradient-to-r from-novura-primary to-purple-600 text-white overflow-hidden relative rounded-xl">
              <CardContent className="px-8 py-10 md:py-12">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h2 className="text-2xl md:text-3xl font-bold mb-2">🎉 Bem-vindo(a) ao Novura</h2>
                    <p className="text-purple-100 mb-6">
                      Gerencie sua empresa em um só lugar com desempenho e simplicidade.
                    </p>
                    <Button asChild variant="secondary" className="bg-white text-novura-primary hover:bg-gray-100 rounded-xl h-11 px-5">
                      <Link to="/novura-academy">
                        Explorar Novura
                        <ChevronRight className="w-4 h-4 ml-2" />
                      </Link>
                    </Button>
                  </div>
                  <div className="hidden md:block">
                    <div className="w-36 h-36 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm">
                      <span className="text-4xl">✨</span>
                    </div>
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
                    <Link to="/pedidos?status=a-vincular">
                      <div className={`text-2xl font-bold ${delayedFlags.vincular ? 'text-red-600' : 'text-gray-900'}`}>{statusCounts.vincular}</div>
                      <div className={`text-sm ${delayedFlags.vincular ? 'text-red-600' : 'text-gray-600'} text-center`}>Vincular</div>
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" className="h-auto p-4 flex flex-col items-center space-y-2 hover:bg-gray-50 rounded-xl">
                    <Link to="/pedidos/emissao_nfe/emitir">
                      <div className={`text-2xl font-bold ${delayedFlags.emissao ? 'text-red-600' : 'text-gray-900'}`}>{statusCounts.emissao}</div>
                      <div className={`text-sm ${delayedFlags.emissao ? 'text-red-600' : 'text-gray-600'} text-center`}>Para emitir</div>
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" className="h-auto p-4 flex flex-col items-center space-y-2 hover:bg-gray-50 rounded-xl">
                    <Link to="/pedidos?status=impressao">
                      <div className={`text-2xl font-bold ${delayedFlags.impressao ? 'text-red-600' : 'text-gray-900'}`}>{statusCounts.impressao}</div>
                      <div className={`text-sm ${delayedFlags.impressao ? 'text-red-600' : 'text-gray-600'} text-center`}>Imprimir</div>
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" className="h-auto p-4 flex flex-col items-center space-y-2 hover:bg-gray-50 rounded-xl">
                    <Link to="/pedidos?status=aguardando-coleta">
                      <div className={`text-2xl font-bold ${delayedFlags.coleta ? 'text-red-600' : 'text-gray-900'}`}>{statusCounts.coleta}</div>
                      <div className={`text-sm ${delayedFlags.coleta ? 'text-red-600' : 'text-gray-600'} text-center`}>Coleta</div>
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" className="h-auto p-4 flex flex-col items-center space-y-2 hover:bg-gray-50 rounded-xl">
                    <Link to="/pedidos?status=enviado">
                      <div className="text-2xl font-bold text-gray-900">{statusCounts.enviado}</div>
                      <div className="text-sm text-gray-600 text-center">Enviado</div>
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            
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
