export interface App {
  id: string;
  name: string;
  description: string;
  logo: string;
  category: "marketplaces" | "logistics" | "dropshipping" | "others";
  isConnected: boolean;
  price: "free" | "paid";
  /** marketplace_providers.key — null for legacy apps without a provider */
  providerKey?: string | null;
  /** Human-readable provider display name e.g. 'Mercado Livre' */
  providerDisplayName?: string | null;
}

export interface AppConnection {
  appId: string;
  storeName: string;
  status: "active" | "reconnect" | "inactive";
  authenticatedAt: string;
  expiresAt: string;
  /** The marketplace_integrations.id — used for warehouse config and setup completion. */
  integrationId?: string | null;
  /** Whether the integration has been fully configured (company + warehouse). */
  setupStatus?: "pending" | "completed";
}
