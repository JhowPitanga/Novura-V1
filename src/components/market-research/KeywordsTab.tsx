import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tag, Search, TrendingUp } from "lucide-react";

export function KeywordsTab() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Tag className="w-5 h-5 text-purple-600" />
            <span>Pesquisa de Palavras-chave</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-purple-100 rounded-full">
                <Search className="w-8 h-8 text-purple-600" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Análise de Palavras-chave
            </h3>
            <p className="text-gray-600 mb-4">
              Esta funcionalidade será implementada em breve para análise de palavras-chave e tendências de busca.
            </p>
            <div className="flex justify-center space-x-4 text-sm text-gray-500">
              <div className="flex items-center space-x-1">
                <TrendingUp className="w-4 h-4" />
                <span>Volume de busca</span>
              </div>
              <div className="flex items-center space-x-1">
                <Tag className="w-4 h-4" />
                <span>Palavras relacionadas</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}