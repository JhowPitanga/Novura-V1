export const authKeys = {
  all: ["auth"] as const,
  session: () => [...authKeys.all, "session"] as const,
  accessContext: (orgId: string) =>
    [...authKeys.all, "access-context", orgId] as const,
};

export const orderKeys = {
  all: ["orders"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...orderKeys.all, "list", filters] as const,
  detail: (id: string) => [...orderKeys.all, "detail", id] as const,
  metrics: (orgId: string) =>
    [...orderKeys.all, "metrics", orgId] as const,
  summary: (orgId: string) =>
    [...orderKeys.all, "summary", orgId] as const,
};

export const productKeys = {
  all: ["products"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...productKeys.all, "list", filters] as const,
  detail: (id: string) => [...productKeys.all, "detail", id] as const,
  categories: () => [...productKeys.all, "categories"] as const,
  kits: (filters?: Record<string, unknown>) =>
    [...productKeys.all, "kits", filters] as const,
  variations: (productId: string) =>
    [...productKeys.all, "variations", productId] as const,
};

export const inventoryKeys = {
  all: ["inventory"] as const,
  stock: (filters?: Record<string, unknown>) =>
    [...inventoryKeys.all, "stock", filters] as const,
  storage: (orgId: string) =>
    [...inventoryKeys.all, "storage", orgId] as const,
};

export const listingKeys = {
  all: ["listings"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...listingKeys.all, "list", filters] as const,
  detail: (id: string) => [...listingKeys.all, "detail", id] as const,
  ranking: (orgId: string) =>
    [...listingKeys.all, "ranking", orgId] as const,
};

export const invoiceKeys = {
  all: ["invoices"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...invoiceKeys.all, "list", filters] as const,
  detail: (id: string) => [...invoiceKeys.all, "detail", id] as const,
};

export const chatKeys = {
  all: ["chat"] as const,
  channels: (orgId: string) =>
    [...chatKeys.all, "channels", orgId] as const,
  messages: (channelId: string) =>
    [...chatKeys.all, "messages", channelId] as const,
  members: (orgId: string) =>
    [...chatKeys.all, "members", orgId] as const,
};

export const analyticsKeys = {
  all: ["analytics"] as const,
  salesByState: (orgId: string) =>
    [...analyticsKeys.all, "sales-by-state", orgId] as const,
  performance: (orgId: string, period?: string) =>
    [...analyticsKeys.all, "performance", orgId, period] as const,
};

export const settingsKeys = {
  all: ["settings"] as const,
  fiscal: (orgId: string) =>
    [...settingsKeys.all, "fiscal", orgId] as const,
  users: (orgId: string) =>
    [...settingsKeys.all, "users", orgId] as const,
  company: (orgId: string) =>
    [...settingsKeys.all, "company", orgId] as const,
};

export const appsKeys = {
  all: ["apps"] as const,
  connections: (orgId: string) =>
    [...appsKeys.all, "connections", orgId] as const,
};
