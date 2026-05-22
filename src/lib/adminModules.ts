import type { OrgModuleCatalogItem } from "@/types/admin";

/** Modules in active development — grouped separately in admin UI */
export const DEV_MODULE_KEYS = new Set(["recursos_seller", "novura_academy", "comunidade"]);

export function sortAdminModules(modules: OrgModuleCatalogItem[]): {
  production: OrgModuleCatalogItem[];
  inDevelopment: OrgModuleCatalogItem[];
} {
  const production: OrgModuleCatalogItem[] = [];
  const inDevelopment: OrgModuleCatalogItem[] = [];
  for (const mod of modules) {
    if (DEV_MODULE_KEYS.has(mod.module_key)) {
      inDevelopment.push(mod);
    } else {
      production.push(mod);
    }
  }
  return { production, inDevelopment };
}
