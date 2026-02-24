const DEFAULT_CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type",
};

export function corsHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  return { ...DEFAULT_CORS, ...extra };
}

export function jsonResponse(
  body: unknown,
  status = 200,
  extra?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders(extra) },
  });
}

export function handleOptions(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
