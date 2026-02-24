import { useOrderCmv } from "@/hooks/useOrderCmv";
import { OrderGeneralInfo } from "./OrderGeneralInfo";
import { OrderItemsList } from "./OrderItemsList";
import { OrderFinancials } from "./OrderFinancials";

interface OrderDetailsProps {
    pedido: any;
}

export function OrderDetails({ pedido }: OrderDetailsProps) {
    const cmvLinked = useOrderCmv(pedido);

    return (
        <div className="space-y-6 max-w-full overflow-x-hidden">
            <OrderGeneralInfo pedido={pedido} />
            <OrderItemsList pedido={pedido} />
            <OrderFinancials pedido={pedido} cmvLinked={cmvLinked} />
        </div>
    );
}
