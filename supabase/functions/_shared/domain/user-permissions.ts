/**
 * Builds a limited permissions map (view-only per module) for new members.
 */

export type Permissions = Record<string, Record<string, boolean>>;

export function buildLimitedPermissions(
  modules: string[] = ["desempenho", "pedidos"],
): Permissions {
  const perms: Permissions = {};
  for (const m of modules) {
    perms[m] = { view: true };
  }
  return perms;
}
