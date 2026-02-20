
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function InventarioTab() {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Próximos Inventários</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                <div>
        <p className="font-medium">Armazém Principal SP</p>
                  <p className="text-sm text-gray-600">Setor A - Eletrônicos</p>
                </div>
                <Badge>Agendado 25/01</Badge>
              </div>
              <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                <div>
                  <p className="font-medium">Centro Fulfillment</p>
                  <p className="text-sm text-gray-600">Geral</p>
                </div>
                <Badge className="bg-orange-500">Em Andamento</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Divergências Encontradas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                <div>
                  <p className="font-medium">iPad Air - IPA-004</p>
                  <p className="text-sm text-gray-600">Sistema: 5 | Físico: 3</p>
                </div>
                <Badge variant="destructive">-2</Badge>
              </div>
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                <div>
                  <p className="font-medium">AirPods Pro - APP-003</p>
                  <p className="text-sm text-gray-600">Sistema: 45 | Físico: 47</p>
                </div>
                <Badge className="bg-green-500">+2</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Relatório de Acuracidade</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-green-600">98.5%</p>
              <p className="text-sm text-gray-600">Acuracidade Geral</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">12</p>
              <p className="text-sm text-gray-600">Inventários Realizados</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-orange-600">3</p>
              <p className="text-sm text-gray-600">Divergências Pendentes</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
