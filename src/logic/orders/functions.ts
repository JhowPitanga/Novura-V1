import type { Order } from "../../types/orders";

export const filterPedidosByStatus = (pedidos: Order[], status: string) => {
    if (status === "Todos") {
        return pedidos;
    }
    return pedidos.filter(pedido => pedido.status === status);
};

export const findPedidoById = (pedidos: Order[], id: string) => {
    return pedidos.find(pedido => pedido.id === id);
};
