import { Pedido } from "../../types/pedidos";

export const filterPedidosByStatus = (pedidos: Pedido[], status: string) => {
    if (status === "Todos") {
        return pedidos;
    }
    return pedidos.filter(pedido => pedido.status === status);
};

export const findPedidoById = (pedidos: Pedido[], id: string) => {
    return pedidos.find(pedido => pedido.id === id);
};