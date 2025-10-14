
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EditKitHeaderProps {
  productName: string;
  sku: string;
  onBack: () => void;
  onSave: () => void;
}

export function EditKitHeader({ productName, sku, onBack, onSave }: EditKitHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Editar Kit</h1>
        <p className="text-gray-600">SKU: {sku}</p>
      </div>
      <div className="flex items-center space-x-3">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>
        <Button onClick={onSave} className="bg-novura-primary hover:bg-novura-primary/90">
          <Save className="w-4 h-4 mr-2" />
          Salvar Alterações
        </Button>
      </div>
    </div>
  );
}
