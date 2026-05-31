import type { Order } from "@/types/orders";
import { formatCurrency } from "@/utils/orderUtils";
import { Package } from "lucide-react";
import { OrderDrawerSection } from "./OrderDrawerSection";

interface OrderItemsListProps {
  order: Order;
}

export function OrderItemsList({ order }: OrderItemsListProps) {
  const items = Array.isArray(order.items) ? order.items : [];

  return (
    <OrderDrawerSection
      title={`Itens do Pedido (${items.length})`}
      icon={Package}
    >
      <div className="space-y-4">
        <div className="hidden sm:grid grid-cols-[56px_1fr_56px_80px_80px] gap-3 text-xs font-medium text-gray-500 pb-2 border-b border-gray-200">
          <span />
          <span>Produto</span>
          <span className="text-center">Qtd</span>
          <span className="text-right">Unit.</span>
          <span className="text-right">Total</span>
        </div>
        {items.map((item) => {
          const lineTotal = item.unitPrice * (item.quantity || 0);
          return (
            <div
              key={item.id}
              className="grid grid-cols-[56px_1fr] sm:grid-cols-[56px_1fr_56px_80px_80px] gap-3 items-center py-3 border-b border-gray-50 last:border-0"
            >
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                <img
                  src={item.imageUrl || "/placeholder.svg"}
                  alt={item.name}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 leading-snug">{item.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">SKU: {item.sku || "N/A"}</p>
                {item.variationLabel ? (
                  <p className="text-xs text-gray-500">Variação: {item.variationLabel}</p>
                ) : null}
                <p className="text-xs text-gray-500">
                  {item.linked ? (
                    <span className="text-green-600">Vinculado</span>
                  ) : (
                    <span className="text-orange-600">Não vinculado</span>
                  )}
                </p>
                <div className="sm:hidden mt-2 flex gap-4 text-xs">
                  <span>Qtd: <strong className={item.quantity > 1 ? "text-purple-600" : ""}>{item.quantity}</strong></span>
                  <span>Unit: {formatCurrency(item.unitPrice)}</span>
                  <span className="font-semibold text-gray-900">{formatCurrency(lineTotal)}</span>
                </div>
              </div>
              <div className={`hidden sm:block text-center text-sm font-medium ${item.quantity > 1 ? "text-purple-600 bg-purple-50 rounded-lg py-1" : "text-gray-900"}`}>
                {item.quantity}
              </div>
              <div className="hidden sm:block text-right text-sm text-gray-900">
                {formatCurrency(item.unitPrice)}
              </div>
              <div className="hidden sm:block text-right text-sm font-semibold text-gray-900">
                {formatCurrency(lineTotal)}
              </div>
            </div>
          );
        })}
        {items.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">Nenhum item encontrado</p>
        ) : null}
      </div>
    </OrderDrawerSection>
  );
}
