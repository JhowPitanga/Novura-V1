import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, Search, BarChart3 } from "lucide-react";

export function ProductTab() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Package className="w-5 h-5 text-purple-600" />
            <span>Análise de Produtos</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-purple-100 rounded-full">
                <Package className="w-8 h-8 text-purple-600" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Pesquisa de Produtos
            </h3>
            <p className="text-gray-600 mb-4">
              Esta funcionalidade será implementada em breve para análise detalhada de produtos e oportunidades.
            </p>
            <div className="flex justify-center space-x-4 text-sm text-gray-500">
              <div className="flex items-center space-x-1">
                <Search className="w-4 h-4" />
                <span>Busca de produtos</span>
              </div>
              <div className="flex items-center space-x-1">
                <BarChart3 className="w-4 h-4" />
                <span>Análise de performance</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}