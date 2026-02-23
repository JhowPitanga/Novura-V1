export interface App {
    id: string;
    name: string;
    description: string;
    logo: string;
    category: 'marketplaces' | 'logistics' | 'dropshipping' | 'others';
    isConnected: boolean;
    price: 'free' | 'paid';
}

export interface AppConnection {
    appId: string;
    storeName: string;
    status: 'active' | 'reconnect' | 'inactive';
    authenticatedAt: string;
    expiresAt: string;
}
