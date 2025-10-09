
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, CreditCard, Plus, Minus } from "lucide-react";

interface CartItem {
  id: number;
  nome: string;
  preco: number;
  image: string;
  quantidade: number;
}

interface Address {
  id: string;
  tipo: string;
  endereco: string;
  cidade: string;
}

interface PaymentMethod {
  id: string;
  nome: string;
  ativo: boolean;
}

interface CheckoutStepsProps {
  step: number;
  cartItems: CartItem[];
  addresses: Address[];
  paymentMethods: PaymentMethod[];
  selectedAddress: string;
  selectedPayment: string;
  totalAmount: number;
  onUpdateQuantity: (id: number, delta: number) => void;
  onAddressChange: (addressId: string) => void;
  onPaymentChange: (paymentId: string) => void;
}

export function CheckoutSteps({
  step,
  cartItems,
  addresses,
  paymentMethods,
  selectedAddress,
  selectedPayment,
  totalAmount,
  onUpdateQuantity,
  onAddressChange,
  onPaymentChange
}: CheckoutStepsProps) {
  if (step === 0) {
    return (
      <div className="space-y-4">
        <h3 className="font-semibold text-lg text-gray-900">Produtos no Carrinho</h3>
        {cartItems.length === 0 ? (
          <p className="text-gray-600 text-center py-8">Carrinho vazio</p>
        ) : (
          cartItems.map((item) => (
            <div key={item.id} className="flex items-center space-x-4 p-4 border border-gray-200 rounded-xl bg-white">
              <img 
                src={item.image} 
                alt={item.nome}
                className="w-16 h-16 rounded-lg object-cover"
              />
              <div className="flex-1">
                <h4 className="font-medium text-gray-900">{item.nome}</h4>
                <p className="text-sm text-gray-600">R$ {item.preco.toFixed(2)}</p>
              </div>
              <div className="flex items-center space-x-2">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => onUpdateQuantity(item.id, -1)}
                  className="h-8 w-8 p-0 border-gray-300"
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <span className="w-8 text-center font-medium">{item.quantidade}</span>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => onUpdateQuantity(item.id, 1)}
                  className="h-8 w-8 p-0 border-gray-300"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="text-right">
                <p className="font-semibold text-novura-primary">R$ {(item.preco * item.quantidade).toFixed(2)}</p>
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="space-y-4">
        <h3 className="font-semibold text-lg flex items-center text-gray-900">
          <MapPin className="w-5 h-5 mr-2 text-novura-primary" />
          Endereço de Entrega
        </h3>
        <div className="space-y-3">
          {addresses.map((endereco) => (
            <label key={endereco.id} className="flex items-start space-x-3 p-4 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
              <input 
                type="radio" 
                name="endereco" 
                value={endereco.id}
                checked={selectedAddress === endereco.id}
                onChange={(e) => onAddressChange(e.target.value)}
                className="mt-1 text-novura-primary focus:ring-novura-primary"
              />
              <div>
                <p className="font-medium text-gray-900">{endereco.tipo}</p>
                <p className="text-sm text-gray-600">{endereco.endereco}</p>
                <p className="text-sm text-gray-600">{endereco.cidade}</p>
              </div>
            </label>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg flex items-center text-gray-900">
        <CreditCard className="w-5 h-5 mr-2 text-novura-primary" />
        Meio de Pagamento
      </h3>
      <div className="space-y-3">
        {paymentMethods.map((meio) => (
          <label key={meio.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
            <div className="flex items-center space-x-3">
              <input 
                type="radio" 
                name="pagamento" 
                value={meio.id} 
                disabled={!meio.ativo}
                checked={selectedPayment === meio.id}
                onChange={(e) => onPaymentChange(e.target.value)}
                className="text-novura-primary focus:ring-novura-primary"
              />
              <span className={meio.ativo ? "text-gray-900" : "text-gray-400"}>
                {meio.nome}
              </span>
            </div>
            <Badge variant={meio.ativo ? "default" : "outline"} className={meio.ativo ? "bg-novura-primary" : ""}>
              {meio.ativo ? "Disponível" : "Indisponível"}
            </Badge>
          </label>
        ))}
      </div>

      {/* Clube Novura */}
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
        <div className="flex items-center space-x-3 mb-2">
          <div className="w-8 h-8 bg-novura-primary rounded-full flex items-center justify-center">
            <span className="text-white text-sm font-bold">N</span>
          </div>
          <div>
            <p className="font-medium text-gray-900">Clube Novura</p>
            <p className="text-sm text-gray-600">Desconto de 5% aplicado automaticamente</p>
          </div>
        </div>
        <p className="text-xs text-purple-700 bg-purple-100 px-2 py-1 rounded-lg inline-block">
          Economia de R$ {(totalAmount * 0.05).toFixed(2)} nesta compra
        </p>
      </div>

      <div className="border-t border-gray-200 pt-4 mt-6">
        <h4 className="font-semibold mb-3 text-gray-900">Resumo do Pedido</h4>
        <div className="space-y-2">
          <div className="flex justify-between text-gray-600">
            <span>Subtotal</span>
            <span>R$ {totalAmount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Frete</span>
            <span>R$ 25,90</span>
          </div>
          <div className="flex justify-between text-purple-600">
            <span>Desconto Clube Novura (5%)</span>
            <span>-R$ {(totalAmount * 0.05).toFixed(2)}</span>
          </div>
          <hr className="border-gray-200" />
          <div className="flex justify-between font-bold text-lg text-gray-900">
            <span>Total</span>
            <span className="text-novura-primary">R$ {(totalAmount + 25.90 - (totalAmount * 0.05)).toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
