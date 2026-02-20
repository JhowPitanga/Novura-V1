
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Repeat, Sparkles } from "lucide-react";

interface RecurringPurchaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RecurringPurchaseModal({ open, onOpenChange }: RecurringPurchaseModalProps) {
  const [minStock, setMinStock] = useState("10");
  const [frequency, setFrequency] = useState("monthly");
  const [aiEnabled, setAiEnabled] = useState(true);

  const handleSave = () => {
    console.log("Configuração de compra recorrente salva:", {
      minStock,
      frequency,
      aiEnabled
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Repeat className="w-5 h-5 text-novura-primary" />
            <span>Compra Recorrente</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="minStock">Estoque Mínimo</Label>
            <Input
              id="minStock"
              type="number"
              value={minStock}
              onChange={(e) => setMinStock(e.target.value)}
              placeholder="Ex: 10"
            />
            <p className="text-sm text-gray-600">
              Quando o estoque atingir essa quantidade, a compra será acionada
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="frequency">Frequência de Verificação</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Diariamente</SelectItem>
                <SelectItem value="weekly">Semanalmente</SelectItem>
                <SelectItem value="monthly">Mensalmente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="bg-gradient-to-r from-purple-50 to-blue-50 p-4 rounded-lg border border-purple-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-novura-primary" />
                <Label htmlFor="ai-enabled" className="text-sm font-medium">
                  Novura AI Inteligente
                </Label>
              </div>
              <Switch
                id="ai-enabled"
                checked={aiEnabled}
                onCheckedChange={setAiEnabled}
              />
            </div>
            <p className="text-sm text-gray-600">
              Permite que a IA ajuste automaticamente as quantidades baseado no histórico de vendas e sazonalidade
            </p>
          </div>

          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">Como Funciona:</h4>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Monitoramento automático do estoque</li>
              <li>• Compra automática quando atingir o limite</li>
              <li>• Notificação antes da compra</li>
              <li>• Histórico de compras automáticas</li>
            </ul>
          </div>
        </div>

        <div className="flex space-x-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Cancelar
          </Button>
          <Button onClick={handleSave} className="flex-1 bg-novura-primary hover:bg-novura-primary/90">
            Ativar Compra Recorrente
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
