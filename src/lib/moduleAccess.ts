/**
 * Resolves platform/org module switches from rpc_get_user_access_context.
 */

export type ModuleSwitchState = "on" | "off" | "unknown";

function readGlobalBucket(
  raw: Record<string, unknown>,
): Record<string, { active?: boolean }> {
  if (raw.global && typeof raw.global === "object") {
    return raw.global as Record<string, { active?: boolean }>;
  }
  return {};
}

/** Legacy rows stored module keys at the top level: { "anuncios": { "active": true } } */
function readLegacyFlatBucket(raw: Record<string, unknown>): Record<string, { active?: boolean }> {
  const map: Record<string, { active?: boolean }> = {};
  for (const key of Object.keys(raw)) {
    if (key === "global") continue;
    const entry = raw[key];
    if (entry && typeof entry === "object" && "active" in (entry as object)) {
      map[key] = entry as { active?: boolean };
    }
  }
  return map;
}

export function parseModuleActiveMap(
  moduleSwitches: Record<string, unknown> | null | undefined,
): Record<string, boolean> {
  const raw = (moduleSwitches || {}) as Record<string, unknown>;
  const global = { ...readLegacyFlatBucket(raw), ...readGlobalBucket(raw) };
  const map: Record<string, boolean> = {};
  for (const key of Object.keys(global)) {
    map[key] = Boolean(global[key]?.active);
  }
  return map;
}

export function getModuleSwitchState(
  module: string,
  activeMap: Record<string, boolean>,
): ModuleSwitchState {
  if (!(module in activeMap)) return "unknown";
  return activeMap[module] ? "on" : "off";
}

/** Baseline view when the org/platform switch is explicitly on. */
export function isOrgModuleEnabled(
  module: string,
  activeMap: Record<string, boolean>,
): boolean {
  return getModuleSwitchState(module, activeMap) === "on";
}

export function isOrgModuleDisabled(
  module: string,
  activeMap: Record<string, boolean>,
): boolean {
  return getModuleSwitchState(module, activeMap) === "off";
}

/** Module is available unless explicitly turned off at platform/org level. */
export function isModuleSwitchAllowing(
  module: string,
  activeMap: Record<string, boolean>,
): boolean {
  return !isOrgModuleDisabled(module, activeMap);
}
