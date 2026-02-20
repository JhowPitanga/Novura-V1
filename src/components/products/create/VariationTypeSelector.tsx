
import { useState } from "react";
import { Palette, Ruler, Zap, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TipoVariacao } from "./types";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface VariationTypeSelectorProps {
  tiposSelecionados: TipoVariacao[];
  onTiposChange: (tipos: TipoVariacao[]) => void;
}

const tiposVariacao = [
  { id: "cor", nome: "Cor", icon: Palette },
  { id: "tamanho", nome: "Tamanho", icon: Ruler },
  { id: "voltagem", nome: "Voltagem", icon: Zap },
];

export function VariationTypeSelector({ 
  tiposSelecionados, 
  onTiposChange
}: VariationTypeSelectorProps) {
  const [customType, setCustomType] = useState("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const toggleTipo = (tipo: typeof tiposVariacao[0]) => {
    console.log("Toggling variation type:", tipo.id);
    const tipoExiste = tiposSelecionados.find(t => t.id === tipo.id);
    
    if (tipoExiste) {
      onTiposChange(tiposSelecionados.filter(t => t.id !== tipo.id));
    } else {
      onTiposChange([...tiposSelecionados, { ...tipo, opcoes: [] }]);
    }
  };

  const addCustomType = () => {
    if (!customType.trim()) {
      console.log("Custom type is empty, not adding");
      return;
    }
    
    console.log("Adding custom type:", customType.trim());
    const customId = `custom_${Date.now()}`;
    const newType: TipoVariacao = {
      id: customId,
      nome: customType.trim(),
      icon: Plus,
      opcoes: []
    };
    
    onTiposChange([...tiposSelecionados, newType]);
    setCustomType("");
    setIsDrawerOpen(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold mb-2">Selecionar tipos de variação</h3>
        <p className="text-gray-600">Escolha os tipos de variação para este produto</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {tiposVariacao.map((tipo) => {
          const isSelected = tiposSelecionados.some(t => t.id === tipo.id);
          const IconComponent = tipo.icon;
          
          return (
            <Card
              key={tipo.id}
              className={`cursor-pointer transition-all border-2 ${
                isSelected 
                  ? "border-primary bg-primary/5" 
                  : "border-gray-200 hover:border-gray-300"
              }`}
              onClick={() => toggleTipo(tipo)}
            >
              <CardContent className="p-6 text-center">
                <IconComponent className={`w-8 h-8 mx-auto mb-3 ${
                  isSelected ? "text-primary" : "text-gray-600"
                }`} />
                <h4 className={`font-medium ${
                  isSelected ? "text-primary" : "text-gray-900"
                }`}>
                  {tipo.nome}
                </h4>
              </CardContent>
            </Card>
          );
        })}

        <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
          <DrawerTrigger asChild>
            <Card className="cursor-pointer transition-all border-2 border-dashed border-gray-300 hover:border-gray-400">
              <CardContent className="p-6 text-center">
                <Plus className="w-8 h-8 mx-auto mb-3 text-gray-600" />
                <h4 className="font-medium text-gray-900">Mais opções</h4>
              </CardContent>
            </Card>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Adicionar tipo personalizado</DrawerTitle>
              <DrawerDescription>
                Digite o nome do tipo de variação personalizada
              </DrawerDescription>
            </DrawerHeader>
            <div className="p-6 space-y-4">
              <div>
                <Label htmlFor="custom-type">Nome do tipo</Label>
                <Input
                  id="custom-type"
                  value={customType}
                  onChange={(e) => setCustomType(e.target.value)}
                  placeholder="Ex: Material, Modelo, etc."
                  className="mt-2"
                />
              </div>
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  onClick={() => setIsDrawerOpen(false)}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={addCustomType}
                  disabled={!customType.trim()}
                  className="flex-1"
                >
                  Adicionar
                </Button>
              </div>
            </div>
          </DrawerContent>
        </Drawer>
      </div>

      {tiposSelecionados.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium">Tipos selecionados:</h4>
          <div className="flex flex-wrap gap-2">
            {tiposSelecionados.map((tipo) => {
              const IconComponent = tipo.icon;
              
              return (
                <div key={tipo.id} className="flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full">
                  <IconComponent className="w-4 h-4" />
                  <span className="text-sm font-medium">{tipo.nome}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
