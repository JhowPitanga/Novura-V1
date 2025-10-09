
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  TrendingUp, 
  DollarSign, 
  Package, 
  ShoppingCart,
  ArrowUpRight,
  Sparkles,
  Play,
  Bell,
  Calendar
} from "lucide-react";

interface DashboardProps {
  className?: string;
}

export function Dashboard({ className = "" }: DashboardProps) {
  const salesData = [
    { period: "Hoje", value: "R$ 2.450,00", change: "+12%" },
    { period: "Esta Semana", value: "R$ 15.280,00", change: "+8%" },
    { period: "Este Mês", value: "R$ 48.750,00", change: "+15%" },
  ];

  const quickStats = [
    { title: "Vendas Hoje", value: "47", icon: DollarSign, color: "text-green-600" },
    { title: "Pedidos Pendentes", value: "23", icon: ShoppingCart, color: "text-orange-600" },
    { title: "Produtos Ativos", value: "156", icon: Package, color: "text-blue-600" },
    { title: "Taxa Conversão", value: "3.2%", icon: TrendingUp, color: "text-purple-600" },
  ];

  const recentActivities = [
    { type: "venda", message: "Nova venda no Mercado Livre - R$ 89,90", time: "há 5 min" },
    { type: "estoque", message: "Produto XYZ com estoque baixo (3 unidades)", time: "há 15 min" },
    { type: "pedido", message: "Pedido #1234 aguardando emissão de NF", time: "há 30 min" },
  ];

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header com saudação e notificações */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Bem-vindo de volta! 👋</h1>
          <p className="text-gray-600 mt-1">Aqui está o resumo do seu negócio hoje</p>
        </div>
        <div className="flex items-center space-x-3">
          <Button variant="outline" size="sm" className="relative">
            <Bell className="w-4 h-4" />
            <Badge className="absolute -top-2 -right-2 w-5 h-5 p-0 flex items-center justify-center bg-red-500">
              3
            </Badge>
          </Button>
          <Button className="bg-novura-primary hover:bg-novura-dark">
            <Sparkles className="w-4 h-4 mr-2" />
            Sugestões IA
          </Button>
        </div>
      </div>

      {/* Banner de Publicidade */}
      <Card className="gradient-purple text-white overflow-hidden relative">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h2 className="text-xl font-bold mb-2">🚀 Impulsione suas vendas com IA!</h2>
              <p className="text-purple-100 mb-4">
                Descubra insights automáticos e otimize seus anúncios com nossa nova funcionalidade de IA.
              </p>
              <Button variant="secondary" className="bg-white text-novura-primary hover:bg-gray-100">
                Conhecer Agora
                <ArrowUpRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
            <div className="hidden md:block">
              <div className="w-32 h-32 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm">
                <Sparkles className="w-16 h-16 text-white" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Vendas do Dia */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {salesData.map((item, index) => (
          <Card key={index} className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-gray-600">{item.period}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-gray-900">{item.value}</span>
                <Badge variant="secondary" className="text-green-600 bg-green-50">
                  {item.change}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Estatísticas Rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {quickStats.map((stat, index) => (
          <Card key={index} className="hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">{stat.title}</p>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                </div>
                <div className={`p-3 rounded-full bg-gray-50 ${stat.color}`}>
                  <stat.icon className="w-6 h-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Carrossel de Aulas e Atividades Recentes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Carrossel de Aulas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Play className="w-5 h-5 mr-2 text-novura-primary" />
              Aulas do Sistema
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { title: "Como criar produtos eficientes", duration: "8 min", new: true },
              { title: "Otimizando anúncios no ML", duration: "12 min", new: false },
              { title: "Gestão inteligente de estoque", duration: "15 min", new: true },
            ].map((aula, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-novura-primary rounded-lg flex items-center justify-center">
                    <Play className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{aula.title}</p>
                    <p className="text-sm text-gray-600">{aula.duration}</p>
                  </div>
                </div>
                {aula.new && <Badge className="bg-green-100 text-green-800">Novo</Badge>}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Atividades Recentes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Calendar className="w-5 h-5 mr-2 text-novura-primary" />
              Atividades Recentes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {recentActivities.map((activity, index) => (
              <div key={index} className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors">
                <div className={`w-2 h-2 rounded-full mt-2 ${
                  activity.type === 'venda' ? 'bg-green-500' : 
                  activity.type === 'estoque' ? 'bg-orange-500' : 'bg-blue-500'
                }`} />
                <div className="flex-1">
                  <p className="text-sm text-gray-900">{activity.message}</p>
                  <p className="text-xs text-gray-500 mt-1">{activity.time}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Sugestões de IA */}
      <Card className="border-2 border-novura-primary/20 bg-gradient-to-r from-purple-50 to-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center text-novura-primary">
            <Sparkles className="w-5 h-5 mr-2" />
            Sugestões Inteligentes do Dia
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-4 bg-white rounded-lg border border-purple-100">
            <p className="font-medium text-gray-900 mb-2">💡 Oportunidade de Estoque</p>
            <p className="text-gray-700 text-sm">
              O produto "Tênis Esportivo XYZ" teve um aumento de 25% nas vendas esta semana. 
              Considere aumentar o estoque em 40 unidades para não perder vendas.
            </p>
            <Button size="sm" className="mt-3 bg-novura-primary hover:bg-novura-dark">
              Aplicar Sugestão
            </Button>
          </div>
          
          <div className="p-4 bg-white rounded-lg border border-purple-100">
            <p className="font-medium text-gray-900 mb-2">🎯 Otimização de Preço</p>
            <p className="text-gray-700 text-sm">
              Seus concorrentes baixaram o preço do "Kit Casa Inteligente" em 8%. 
              Ajustar seu preço pode aumentar a competitividade.
            </p>
            <Button size="sm" variant="outline" className="mt-3 border-novura-primary text-novura-primary">
              Ver Detalhes
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
