/** True when the current route is the internal Novura Admin console. */
export function isAdminConsolePath(pathname: string): boolean {
  return pathname === "/novura-admin" || pathname.startsWith("/novura-admin/");
}
