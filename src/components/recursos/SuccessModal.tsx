
import { CheckCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface SuccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SuccessModal({ open, onOpenChange }: SuccessModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md text-center">
        <DialogHeader className="items-center space-y-4">
          <div className="flex items-center justify-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center animate-bounce">
              <CheckCircle className="w-12 h-12 text-green-600" />
            </div>
          </div>
          <DialogTitle className="text-2xl font-bold text-green-600">
            Parabéns pela compra!
          </DialogTitle>
          <DialogDescription className="text-lg text-gray-600">
            Seu pedido foi realizado com sucesso e será processado em breve.
            Você receberá um e-mail de confirmação com os detalhes do pedido.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-6 space-y-4">
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600 mb-2">Próximos passos:</p>
            <ul className="text-sm text-left space-y-1">
              <li>• Confirmação do pedido por e-mail</li>
              <li>• Processamento em até 1 dia útil</li>
              <li>• Acompanhamento via WhatsApp</li>
              <li>• Entrega em 3-5 dias úteis</li>
            </ul>
          </div>
          <Button 
            onClick={() => onOpenChange(false)}
            className="w-full bg-green-600 hover:bg-green-700"
          >
            Continuar Comprando
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
