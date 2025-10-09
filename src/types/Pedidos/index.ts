export interface Item {
    id: string;
    nome: string;
    sku: string | null;
    quantidade: number;
    valor: number;
    vinculado?: boolean;
    marketplace?: string;
    bipado?: boolean;
    imagem?: string;
}

export interface Pedido {
    id: string;
    marketplace: string;
    produto: string;
    sku: string | null;
    cliente: string;
    valor: number;
    data: string;
    status: string;
    subStatus?: string;
    tipoEnvio: string;
    idPlataforma: string;
    quantidadeTotal: number;
    imagem: string;
    itens: Item[];
    financeiro: {
        valorPedido: number;
        taxaFrete: number;
        taxaMarketplace: number;
        cupom: number;
        impostos: number;
        liquido: number;
        margem: number;
    };
    impressoEtiqueta: boolean;
    impressoLista: boolean;
}

export interface PrintingSettings {
    pickingList: {
        groupByProduct: boolean;
        includeOrderNumber: boolean;
        includeBarcode: boolean;
    };
    label: {
        labelSize: "10x15" | "A4";
        separateLabelPerItem: boolean;
    };
}

export interface Column {
    id: string;
    name: string;
    enabled: boolean;
    alwaysVisible?: boolean;
    render: (pedido: Pedido) => JSX.Element | string;
}