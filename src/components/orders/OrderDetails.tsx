import { useOrderCmv } from "@/hooks/useOrderCmv";
import type { Order } from "@/types/orders";
import { OrderFinancials } from "./OrderFinancials";
import { OrderGeneralInfo } from "./OrderGeneralInfo";
import { OrderItemsList } from "./OrderItemsList";


export function OrderDetails(order: Readonly<Order>) {
    const cmvLinked = useOrderCmv(order);

    return (
        <div className="space-y-6 max-w-full overflow-x-hidden">
            <OrderGeneralInfo order={order} />
            <OrderItemsList order={order} />
            <OrderFinancials order={order} cmvLinked={cmvLinked} />
        </div>
    );
}
