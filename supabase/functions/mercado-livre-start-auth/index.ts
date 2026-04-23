// @deprecated — thin wrapper. Delegates to the generic oauth-start-auth function.
// Kept to preserve the redirect_uri registered in the Mercado Livre Developer Portal.
// Remove after updating the ML app's redirect_uri to /functions/v1/oauth-start-auth.

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
  const targetUrl = `${supabaseUrl}/functions/v1/oauth-start-auth`;

  // Forward the request body, injecting providerKey
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const merged = { providerKey: "mercado_livre", ...body };

  const resp = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: req.headers.get("authorization") ?? "",
    },
    body: JSON.stringify(merged),
  });

  return new Response(resp.body, {
    status: resp.status,
    headers: {
      "content-type": resp.headers.get("content-type") ?? "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
