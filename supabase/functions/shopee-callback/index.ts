// @deprecated — thin wrapper. Delegates to the generic oauth-callback function.
// Shopee will redirect to this URL until the redirect_uri is updated in the Shopee Partner Portal.

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

  const originalUrl = new URL(req.url);
  const targetWithParams = new URL(targetUrl);
  originalUrl.searchParams.forEach((value, key) => {
    targetWithParams.searchParams.set(key, value);
  });
  targetWithParams.searchParams.set("provider_key", "shopee");

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
