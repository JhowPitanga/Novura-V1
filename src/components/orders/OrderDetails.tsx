import { useOrderDrawerFinance } from "@/hooks/useOrderDrawerFinance";
import { useAuth } from "@/hooks/useAuth";
import type { Order } from "@/types/orders";
import { OrderFinancials } from "./OrderFinancials";
import { OrderGeneralInfo } from "./OrderGeneralInfo";
import { OrderItemsList } from "./OrderItemsList";
import { OrderTimeline } from "./OrderTimeline";

interface OrderDetailsProps {
  order: Readonly<Order>;
  drawerOpen?: boolean;
}

export function OrderDetails({ order, drawerOpen = true }: OrderDetailsProps) {
  const { organizationId } = useAuth();
  const { breakdown, taxRatePct, loading } = useOrderDrawerFinance(order, organizationId);

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      <OrderGeneralInfo order={order} />
      <OrderItemsList order={order} />
      <OrderFinancials breakdown={breakdown} taxRatePct={taxRatePct} loading={loading} />
      <OrderTimeline orderId={order.id} drawerOpen={drawerOpen} />
    </div>
  );
}
