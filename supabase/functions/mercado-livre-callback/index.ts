// @deprecated — thin wrapper. Delegates to the generic oauth-callback function.
// Kept to preserve the redirect_uri registered in the Mercado Livre Developer Portal.
// The marketplace will continue redirecting to this URL until updated.

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const targetUrl = `${supabaseUrl}/functions/v1/oauth-callback`;

  // Forward query params + add provider_key hint so the generic function
  // can pick the correct adapter even before parsing the signed state.
  const originalUrl = new URL(req.url);
  const targetWithParams = new URL(targetUrl);
  originalUrl.searchParams.forEach((value, key) => {
    targetWithParams.searchParams.set(key, value);
  });
  targetWithParams.searchParams.set("provider_key", "mercado_livre");

  const resp = await fetch(targetWithParams.toString(), {
    method: req.method,
    headers: req.headers,
    body: req.method !== "GET" ? req.body : undefined,
  });

  return new Response(resp.body, {
    status: resp.status,
    headers: {
      "content-type": resp.headers.get("content-type") ?? "text/html",
    },
  });
});
