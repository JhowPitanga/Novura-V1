
import { ArrowRight, Check, Star, Users, TrendingUp, Shield, Zap, BarChart3, Package, Sparkles, Building2, CreditCard, Gauge, Truck, Store, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";

const features = [
  { icon: TrendingUp, title: "Análise Inteligente", description: "IA avançada para otimizar suas vendas e identificar oportunidades de crescimento", image: "/images/placeholder.svg" },
  { icon: Users, title: "Gestão Multicanal", description: "Centralize todos os seus marketplaces em uma única plataforma moderna", image: "/images/placeholder.svg" },
  { icon: Shield, title: "Segurança Avançada", description: "Seus dados protegidos com criptografia de ponta e backups automáticos", image: "/images/placeholder.svg" },
  { icon: Zap, title: "Automação Completa", description: "Automatize processos repetitivos e foque no que realmente importa", image: "/images/placeholder.svg" },
  { icon: BarChart3, title: "Relatórios Detalhados", description: "Dashboards em tempo real com métricas que impulsionam suas decisões", image: "/images/placeholder.svg" },
  { icon: Package, title: "Gestão de Estoque", description: "Controle inteligente de inventário com alertas proativos", image: "/images/placeholder.svg" },
];

const erpSolutions = [
  { icon: Building2, title: "ERP Completo", description: "Gestão integrada do PDV ao marketplace, com automações inteligentes." },
  { icon: CreditCard, title: "Financeiro", description: "Contas a pagar/receber, conciliação, boletos e DRE prontos para análise." },
  { icon: Store, title: "PDV + Loja", description: "Controle cada etapa do PDV e leve os produtos para a internet." },
  { icon: LinkIcon, title: "Integrações", description: "Conecte Mercado Livre, Shopee, Amazon, Magalu, Tray e outros." },
  { icon: Truck, title: "Expedição", description: "Impressão de etiquetas, conferência por bipagem e logística integrada." },
  { icon: Gauge, title: "Desempenho", description: "Dashboards e relatórios com indicadores operacionais e de vendas." },
];

const testimonials = [
  {
    name: "Carlos Silva",
    role: "CEO, TechStore",
    content: "O Novura revolucionou nossa operação. Aumentamos 300% as vendas em 6 meses.",
    rating: 5
  },
  {
    name: "Ana Santos",
    role: "Gerente, MegaShop",
    content: "A integração com todos os marketplaces é perfeita. Economizamos 20h por semana.",
    rating: 5
  },
  {
    name: "João Costa",
    role: "Founder, EletroMax",
    content: "A IA do Novura nos ajuda a tomar decisões mais inteligentes todos os dias.",
    rating: 5
  }
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-100">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-novura-primary to-purple-600 rounded-xl flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Novura</h1>
                <p className="text-xs text-gray-500">ERP Inteligente</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Link to="/auth">
                <Button variant="ghost">Entrar</Button>
              </Link>
              <Link to="/cadastro">
                <Button className="bg-novura-primary hover:bg-novura-primary/90">
                  Começar Grátis
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero com movimento */}
      <section className="relative overflow-hidden">
        <div className="absolute -top-16 -left-16 w-64 h-64 bg-gradient-to-br from-novura-primary/20 to-purple-600/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-20 -right-20 w-72 h-72 bg-gradient-to-br from-purple-600/20 to-blue-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="container mx-auto px-6 py-20 text-center">
          <Badge className="mb-6 bg-novura-primary/10 text-novura-primary border-novura-primary/20">
            🚀 Novo: IA Generativa para E-commerce
          </Badge>
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            O ERP Inteligente que
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-novura-primary to-purple-600">
              {" "}Revoluciona{" "}
            </span>
            seu E-commerce
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Gerencie marketplaces, estoque, pedidos e finanças em uma única plataforma com IA e automações.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link to="/cadastro">
              <Button size="lg" className="bg-novura-primary hover:bg-novura-primary/90">
                Começar Grátis Agora
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <Button size="lg" variant="outline">
              Ver Demonstração
            </Button>
          </div>
          <div className="mt-6 flex items-center justify-center gap-6 text-sm text-gray-500">
            <div className="flex items-center gap-2"><Star className="w-4 h-4 text-yellow-500" /> Avaliação 4.9/5</div>
            <div className="flex items-center gap-2"><Users className="w-4 h-4" /> 10.000+ empresas</div>
            <div className="flex items-center gap-2"><Shield className="w-4 h-4" /> Segurança de nível enterprise</div>
          </div>
        </div>
        {/* Marquee de logos */}
        <div className="border-t border-gray-100 bg-gray-50/60">
          <div className="container mx-auto px-6 py-6">
            <div className="flex items-center gap-8 overflow-x-auto no-scrollbar">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="min-w-[140px] h-16 rounded-xl bg-white border border-gray-100 shadow-sm flex items-center justify-center">
                  <img src="/images/placeholder.svg" alt="Logo" className="w-24 h-8 object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/images/placeholder.svg'; }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Funcionalidades que Fazem a Diferença
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Desenvolvido por especialistas em e-commerce para atender todas as suas necessidades
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="border-0 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
                <CardHeader>
                  <div className="w-12 h-12 bg-gradient-to-br from-novura-primary to-purple-600 rounded-lg flex items-center justify-center mb-4">
                    <feature.icon className="w-6 h-6 text-white" />
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 mb-4">{feature.description}</p>
                  <div className="rounded-xl overflow-hidden border border-gray-100">
                    <img src={feature.image} alt={feature.title} className="w-full h-40 object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/images/placeholder.svg'; }} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Destaque de produto */}
      <section className="py-20 bg-gradient-to-br from-gray-50 to-white">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h3 className="text-3xl font-bold text-gray-900 mb-4">Painel Inteligente com IA</h3>
              <p className="text-gray-600 mb-6">Acompanhe indicadores críticos, detecte oportunidades e tome decisões com recomendações da IA.</p>
              <ul className="space-y-3 text-gray-700">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-novura-primary" /> Previsão de demanda e abastecimento</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-novura-primary" /> Otimização de preço por canal</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-novura-primary" /> Alertas proativos de ruptura e devoluções</li>
              </ul>
              <div className="mt-6 flex gap-3">
                <Button className="bg-novura-primary">Explorar Painel</Button>
                <Button variant="outline">Ver Relatórios</Button>
              </div>
            </div>
            <div className="relative">
              <div className="absolute -top-6 -left-6 w-24 h-24 bg-novura-primary/10 rounded-full blur-xl animate-ping" />
              <div className="rounded-2xl border border-gray-100 shadow-xl overflow-hidden">
                <img src="/images/placeholder.svg" alt="Mockup Dashboard" className="w-full h-[360px] object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/images/placeholder.svg'; }} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Seções ERP */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h3 className="text-3xl font-bold text-gray-900">Tudo que seu ERP precisa, no mesmo lugar</h3>
            <p className="text-gray-600">Do financeiro à expedição, pronto para PMEs crescerem rápido</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {erpSolutions.map((s, i) => (
              <Card key={i} className="border-0 shadow-md hover:shadow-xl transition-all">
                <CardHeader>
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-novura-primary rounded-lg flex items-center justify-center mb-4">
                    <s.icon className="w-6 h-6 text-white" />
                  </div>
                  <CardTitle className="text-lg">{s.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600">{s.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Mais de 10.000 Empresas Confiam no Novura
            </h2>
            <p className="text-gray-600">Veja o que nossos clientes dizem sobre nós</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <Card key={index} className="border-0 shadow-lg">
                <CardContent className="p-6">
                  <div className="flex items-center mb-4">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="w-5 h-5 text-yellow-400 fill-current" />
                    ))}
                  </div>
                  <p className="text-gray-600 mb-4">"{testimonial.content}"</p>
                  <div>
                    <p className="font-semibold text-gray-900">{testimonial.name}</p>
                    <p className="text-sm text-gray-500">{testimonial.role}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-novura-primary to-purple-600">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Pronto para Revolucionar seu E-commerce?
          </h2>
          <p className="text-xl text-white/90 mb-8">
            Junte-se a milhares de empresas que já transformaram seus negócios com o Novura
          </p>
          <Link to="/cadastro">
            <Button size="lg" className="bg-white text-novura-primary hover:bg-gray-100">
              Começar Grátis Agora
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-gray-900 text-white">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-8 h-8 bg-gradient-to-br from-novura-primary to-purple-600 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <span className="text-xl font-bold">Novura</span>
              </div>
              <p className="text-gray-400">
                O ERP inteligente que revoluciona o e-commerce brasileiro.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Produto</h3>
              <ul className="space-y-2 text-gray-400">
                <li>Funcionalidades</li>
                <li>Preços</li>
                <li>Integrações</li>
                <li>API</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Suporte</h3>
              <ul className="space-y-2 text-gray-400">
                <li>Central de Ajuda</li>
                <li>Documentação</li>
                <li>Contato</li>
                <li>Status</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Empresa</h3>
              <ul className="space-y-2 text-gray-400">
                <li>Sobre</li>
                <li>Blog</li>
                <li>Carreiras</li>
                <li>Privacidade</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2024 Novura. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
