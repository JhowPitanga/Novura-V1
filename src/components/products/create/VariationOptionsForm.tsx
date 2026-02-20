
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TipoVariacao } from "./types";

interface VariationOptionsFormProps {
  tiposVariacao: TipoVariacao[];
  onTiposChange: (tipos: TipoVariacao[]) => void;
  onVariacoesGenerate: () => void;
}

export function VariationOptionsForm({ 
  tiposVariacao, 
  onTiposChange, 
  onVariacoesGenerate
}: VariationOptionsFormProps) {
  const [novaOpcao, setNovaOpcao] = useState<{ [key: string]: string }>({});

  const adicionarOpcao = (tipoId: string) => {
    const opcao = novaOpcao[tipoId]?.trim();
    if (!opcao) return;

    const tiposAtualizados = tiposVariacao.map(tipo => {
      if (tipo.id === tipoId) {
        return {
          ...tipo,
          opcoes: [...tipo.opcoes, opcao]
        };
      }
      return tipo;
    });

    onTiposChange(tiposAtualizados);
    setNovaOpcao({ ...novaOpcao, [tipoId]: "" });
  };

  const removerOpcao = (tipoId: string, opcaoIndex: number) => {
    const tiposAtualizados = tiposVariacao.map(tipo => {
      if (tipo.id === tipoId) {
        return {
          ...tipo,
          opcoes: tipo.opcoes.filter((_, index) => index !== opcaoIndex)
        };
      }
      return tipo;
    });

    onTiposChange(tiposAtualizados);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold">Definir opções das variações</h3>
      </div>

      <div className="space-y-6">
        {tiposVariacao.map((tipo) => {
          const IconComponent = tipo.icon;
          
          return (
            <Card key={tipo.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IconComponent className="w-5 h-5" />
                  {tipo.nome}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    value={novaOpcao[tipo.id] || ""}
                    onChange={(e) => setNovaOpcao({ ...novaOpcao, [tipo.id]: e.target.value })}
                    placeholder={`Digite uma opção de ${tipo.nome.toLowerCase()}`}
                    onKeyPress={(e) => {
                      if (e.key === "Enter") {
                        adicionarOpcao(tipo.id);
                      }
                    }}
                  />
                  <Button
                    onClick={() => adicionarOpcao(tipo.id)}
                    disabled={!novaOpcao[tipo.id]?.trim()}
                    size="sm"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>

                {tipo.opcoes.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {tipo.opcoes.map((opcao, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 bg-gray-100 px-3 py-1 rounded-full"
                      >
                        {tipo.id === "cor" && (
                          <div
                            className="w-4 h-4 rounded-full border"
                            style={{ backgroundColor: opcao.toLowerCase() }}
                          />
                        )}
                        <span className="text-sm">{opcao}</span>
                        <button
                          onClick={() => removerOpcao(tipo.id, index)}
                          className="text-gray-500 hover:text-red-500"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
