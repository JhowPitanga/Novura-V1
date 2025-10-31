// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}

function b64ToUint8(b64: string): Uint8Array { 
  const bin = atob(b64); 
  const bytes = new Uint8Array(bin.length); 
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.codePointAt(i) || 0; 
  return bytes; 
}

async function importAesGcmKey(base64Key: string): Promise<CryptoKey> { 
  const keyBytes = b64ToUint8(base64Key); 
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt","decrypt"]); 
}

async function aesGcmDecryptFromString(key: CryptoKey, encStr: string): Promise<string> { 
  const parts = encStr.split(":"); 
  if (parts.length !== 4 || parts[0] !== "enc" || parts[1] !== "gcm") throw new Error("Invalid token format"); 
  const iv = b64ToUint8(parts[2]); 
  const ct = b64ToUint8(parts[3]); 
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct); 
  return new TextDecoder().decode(pt); 
}

// Helper function to get integration with proper error handling
async function getIntegration(admin: any, organizationId: string) {
  const { data: integration, error: integErr } = await admin
    .from("marketplace_integrations")
    .select("id, organizations_id, company_id, meli_user_id, access_token, refresh_token")
    .eq("organizations_id", organizationId)
    .eq("marketplace_name", "Mercado Livre")
    .single();

  if (integErr || !integration) {
    throw new Error("Mercado Livre integration not found or disabled");
  }

  return integration;
}

// Helper function to refresh token if needed
async function ensureValidToken(admin: any, aesKey: CryptoKey, integration: any) {
  const accessToken = await aesGcmDecryptFromString(aesKey, integration.access_token);
  
  // Check if token is expired (simple check - in production you might want to store expires_at)
  const tokenCheckUrl = `https://api.mercadolibre.com/users/me`;
  const tokenCheckResp = await fetch(tokenCheckUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }
  });

  if (tokenCheckResp.ok) {
    return { accessToken, needsRefresh: false };
  }

  // Token is expired, refresh it
  const refreshToken = await aesGcmDecryptFromString(aesKey, integration.refresh_token);
  
  const refreshResp = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: Deno.env.get("MERCADO_LIVRE_CLIENT_ID") || "",
      client_secret: Deno.env.get("MERCADO_LIVRE_CLIENT_SECRET") || "",
      refresh_token: refreshToken
    })
  });

  if (!refreshResp.ok) {
    throw new Error("Failed to refresh token");
  }

  const refreshData = await refreshResp.json();
  
  // Update tokens in database
  const { error: updErr } = await admin
    .from("marketplace_integrations")
    .update({ 
      access_token: refreshData.access_token, 
      refresh_token: refreshData.refresh_token,
      expires_in: refreshData.expires_in,
      meli_user_id: refreshData.user_id 
    })
    .eq("id", integration.id);

  if (updErr) {
    throw new Error(`Failed to save refreshed tokens: ${updErr.message}`);
  }

  return { accessToken: refreshData.access_token, needsRefresh: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return jsonResponse(null, 200);
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
  
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ENC_KEY_B64) {
    return jsonResponse({ error: "Missing service configuration" }, 500);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const aesKey = await importAesGcmKey(ENC_KEY_B64);

  try {
    const body = await req.json();
    const { action, organizationId } = body;

    if (!organizationId) {
      return jsonResponse({ error: "organizationId is required" }, 400);
    }

    switch (action) {
      case "create_test_users":
        return await createTestUsers(admin, aesKey, organizationId);
        
      case "create_test_item":
        return await createTestItem(admin, aesKey, organizationId, body);
        
      case "simulate_order":
        return await simulateOrder(admin, aesKey, organizationId, body);
        
      case "test_webhook":
        return await testWebhook(admin, organizationId, body);
        
      case "full_test":
        return await runFullTest(admin, aesKey, organizationId);
        
      case "check_integration":
        return await checkIntegration(admin, aesKey, organizationId);
        
      case "sync_test_items":
        return await syncTestItems(admin, aesKey, organizationId);
        
      default:
        return jsonResponse({ 
          error: "Invalid action",
          available_actions: [
            "create_test_users", 
            "create_test_item", 
            "simulate_order", 
            "test_webhook", 
            "full_test",
            "check_integration",
            "sync_test_items"
          ]
        }, 400);
    }

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 500);
  }
});

// Verificar integração
async function checkIntegration(admin: any, aesKey: CryptoKey, organizationId: string) {
  try {
    const integration = await getIntegration(admin, organizationId);
    const { accessToken, needsRefresh } = await ensureValidToken(admin, aesKey, integration);

    // Test API connection
    const testResp = await fetch('https://api.mercadolibre.com/users/me', {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }
    });

    const userData = await testResp.json();

    return jsonResponse({
      success: true,
      integration: {
        id: integration.id,
        meli_user_id: integration.meli_user_id,
        company_id: integration.company_id,
        enabled: integration.enabled
      },
      user: {
        id: userData.id,
        nickname: userData.nickname,
        email: userData.email
      },
      token_refreshed: needsRefresh
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: `Integration check failed: ${msg}` }, 500);
  }
}

// Sincronizar itens de teste existentes
async function syncTestItems(admin: any, aesKey: CryptoKey, organizationId: string) {
  try {
    const integration = await getIntegration(admin, organizationId);
    await ensureValidToken(admin, aesKey, integration);

    // Buscar itens de teste na organização
    const { data: testItems, error: itemsErr } = await admin
      .from("marketplace_items")
      .select("marketplace_item_id, title")
      .eq("organizations_id", organizationId)
      .eq("marketplace_name", "Mercado Livre")
      .like("title", "%Item de Teste%");

    if (itemsErr) {
      throw new Error(`Failed to fetch test items: ${itemsErr.message}`);
    }

    if (!testItems || testItems.length === 0) {
      return jsonResponse({
        success: true,
        message: "No test items found to sync",
        synced_count: 0
      });
    }

    // Sincronizar cada item usando a função de sync existente
    const syncResults = [];
    for (const item of testItems) {
      try {
        await admin.functions.invoke('mercado-livre-sync-items', {
          body: { 
            organizationId,
            itemId: item.marketplace_item_id 
          }
        });

        syncResults.push({
          item_id: item.marketplace_item_id,
          title: item.title,
          success: true,
          error: null
        });
      } catch (e) {
        syncResults.push({
          item_id: item.marketplace_item_id,
          title: item.title,
          success: false,
          error: e instanceof Error ? e.message : String(e)
        });
      }
    }

    return jsonResponse({
      success: true,
      message: `Synced ${testItems.length} test items`,
      results: syncResults
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: `Sync test items failed: ${msg}` }, 500);
  }
}

// Criar usuários de teste
async function createTestUsers(admin: any, aesKey: CryptoKey, organizationId: string) {
  try {
    const integration = await getIntegration(admin, organizationId);
    const { accessToken } = await ensureValidToken(admin, aesKey, integration);

    // Criar usuário vendedor de teste
    const sellerResponse = await fetch('https://api.mercadolibre.com/users/test_user', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ "site_id": "MLB" })
    });

    const seller = await sellerResponse.json();

    // Criar usuário comprador de teste
    const buyerResponse = await fetch('https://api.mercadolibre.com/users/test_user', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ "site_id": "MLB" })
    });

    const buyer = await buyerResponse.json();

    // Dados de teste não são salvos em tabela específica
    // Os usuários de teste são criados diretamente no Mercado Livre

    return jsonResponse({
      success: true,
      seller: {
        id: seller.id,
        nickname: seller.nickname,
        password: seller.password
      },
      buyer: {
        id: buyer.id,
        nickname: buyer.nickname,
        password: buyer.password
      }
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: `Failed to create test users: ${msg}` }, 500);
  }
}

// Criar item de teste
async function createTestItem(admin: any, aesKey: CryptoKey, organizationId: string, body: any) {
  try {
    const { sellerId, sellerPassword } = body;

    if (!sellerId || !sellerPassword) {
      return jsonResponse({ error: "sellerId and sellerPassword are required" }, 400);
    }

    // Obter token do usuário de teste
    const tokenResponse = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: Deno.env.get("MERCADO_LIVRE_CLIENT_ID") || "",
        client_secret: Deno.env.get("MERCADO_LIVRE_CLIENT_SECRET") || "",
        username: sellerId,
        password: sellerPassword
      })
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      throw new Error(`Failed to get test user token: ${errorData?.message || tokenResponse.statusText}`);
    }

    const tokenData = await tokenResponse.json();
    const testAccessToken = tokenData.access_token;

    // Criar item de teste
    const itemData = {
      "title": "Item de Teste – Por favor, NÃO OFERTAR!",
      "category_id": "MLA1234", // Categoria "Outros"
      "price": 50,
      "currency_id": "BRL",
      "available_quantity": 10,
      "buying_mode": "buy_it_now",
      "listing_type_id": "free",
      "condition": "new",
      "description": "Produto de teste para desenvolvimento - não ofertar!"
    };

    const itemResponse = await fetch('https://api.mercadolibre.com/items', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${testAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(itemData)
    });

    const item = await itemResponse.json();

    if (!itemResponse.ok) {
      throw new Error(`Failed to create test item: ${item?.message || itemResponse.statusText}`);
    }

    // Sincronizar o item criado com o banco de dados
    try {
      const integration = await getIntegration(admin, organizationId);
      const { accessToken } = await ensureValidToken(admin, aesKey, integration);

      // Buscar dados completos do item
      const itemDetailsResp = await fetch(`https://api.mercadolibre.com/items/${item.id}`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }
      });

      if (itemDetailsResp.ok) {
        const itemDetails = await itemDetailsResp.json();
        
        // Mapear e inserir na tabela marketplace_items
        const nowIso = new Date().toISOString();
        const upsertItem = {
          organizations_id: integration.organizations_id,
          company_id: integration.company_id,
          marketplace_name: "Mercado Livre",
          marketplace_item_id: itemDetails?.id || String(itemDetails?.id || ""),
          title: itemDetails?.title || null,
          sku: itemDetails?.seller_custom_field || itemDetails?.seller_sku || itemDetails?.catalog_product_id || null,
          condition: itemDetails?.condition || null,
          status: itemDetails?.status || null,
          price: typeof itemDetails?.price === "number" ? itemDetails.price : (Number(itemDetails?.price) || null),
          available_quantity: typeof itemDetails?.available_quantity === "number" ? itemDetails.available_quantity : null,
          sold_quantity: typeof itemDetails?.sold_quantity === "number" ? itemDetails.sold_quantity : null,
          category_id: itemDetails?.category_id || null,
          permalink: itemDetails?.permalink || null,
          attributes: Array.isArray(itemDetails?.attributes) ? itemDetails.attributes : [],
          variations: Array.isArray(itemDetails?.variations) ? itemDetails.variations : null,
          pictures: Array.isArray(itemDetails?.pictures) ? itemDetails.pictures : [],
          tags: Array.isArray(itemDetails?.tags) ? itemDetails.tags : null,
          seller_id: itemDetails?.seller?.id ? String(itemDetails.seller.id) : String(sellerId),
          data: itemDetails || null,
          published_at: itemDetails?.stop_time ? null : itemDetails?.date_created || null,
          last_synced_at: nowIso,
          updated_at: nowIso,
        };

        const { error: upsertErr } = await admin
          .from("marketplace_items")
          .upsert(upsertItem, { onConflict: "organizations_id,marketplace_name,marketplace_item_id" });

        if (upsertErr) {
          console.warn(`Failed to sync test item to database: ${upsertErr.message}`);
        }
      }
    } catch (syncError) {
      console.warn(`Failed to sync test item: ${syncError instanceof Error ? syncError.message : String(syncError)}`);
    }

    return jsonResponse({
      success: true,
      item: {
        id: item.id,
        title: item.title,
        price: item.price,
        status: item.status
      },
      message: "Test item created and synced to database"
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: `Failed to create test item: ${msg}` }, 500);
  }
}

// Simular pedido
async function simulateOrder(admin: any, aesKey: CryptoKey, organizationId: string, body: any) {
  try {
    const { buyerId, buyerPassword, itemId } = body;

    if (!buyerId || !buyerPassword || !itemId) {
      return jsonResponse({ error: "buyerId, buyerPassword and itemId are required" }, 400);
    }

    // Obter token do comprador de teste
    const tokenResponse = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: Deno.env.get("MERCADO_LIVRE_CLIENT_ID") || "",
        client_secret: Deno.env.get("MERCADO_LIVRE_CLIENT_SECRET") || "",
        username: buyerId,
        password: buyerPassword
      })
    });

    const tokenData = await tokenResponse.json();
    const testAccessToken = tokenData.access_token;

    // Simular compra com cartão de teste
    const orderData = {
      "order_items": [
        {
          "item": {
            "id": itemId
          },
          "quantity": 1
        }
      ],
      "payment": {
        "card_number": "4509 9535 6623 3704",
        "security_code": "123",
        "expiration_month": 11,
        "expiration_year": 2025,
        "cardholder": {
          "name": "APRO APRO", // Para pagamento aprovado
          "identification": {
            "type": "CPF",
            "number": "12345678901"
          }
        }
      }
    };

    const orderResponse = await fetch('https://api.mercadolibre.com/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${testAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderData)
    });

    const order = await orderResponse.json();

    if (!orderResponse.ok) {
      throw new Error(`Failed to simulate order: ${order?.message || orderResponse.statusText}`);
    }

    return jsonResponse({
      success: true,
      order: {
        id: order.id,
        status: order.status,
        status_detail: order.status_detail
      },
      message: "Test order created successfully"
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: `Failed to simulate order: ${msg}` }, 500);
  }
}

// Testar webhook
async function testWebhook(admin: any, organizationId: string, body: any) {
  try {
    const { orderId, sellerId } = body;

    if (!orderId || !sellerId) {
      return jsonResponse({ error: "orderId and sellerId are required" }, 400);
    }

    // Simular notificação de webhook
    const notification = {
      "resource": `/orders/${orderId}`,
      "user_id": sellerId,
      "topic": "orders_v2",
      "application_id": Deno.env.get("MERCADO_LIVRE_APP_ID") || "123456789",
      "attempts": 1,
      "sent": new Date().toISOString(),
      "received": new Date().toISOString()
    };

    // Chamar função webhook
    const { data, error } = await admin.functions.invoke('mercado-livre-sync-all', {
      body: notification
    });

    if (error) {
      return jsonResponse({ error: `Webhook failed: ${error.message}` }, 500);
    }

    return jsonResponse({
      success: true,
      webhook_result: data,
      notification: notification
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: `Failed to test webhook: ${msg}` }, 500);
  }
}

// Teste completo
async function runFullTest(admin: any, aesKey: CryptoKey, organizationId: string) {
  try {
    const results = {
      test_users: null,
      test_item: null,
      test_order: null,
      webhook_test: null
    };

    // 1. Criar usuários de teste
    const usersResult = await createTestUsers(admin, aesKey, organizationId);
    const usersData = await usersResult.json();
    results.test_users = usersData;

    if (!usersData.success) {
      return jsonResponse({ error: "Failed to create test users", results }, 500);
    }

    // 2. Criar item de teste
    const itemResult = await createTestItem(admin, aesKey, organizationId, {
      sellerId: usersData.seller.id,
      sellerPassword: usersData.seller.password
    });
    const itemData = await itemResult.json();
    results.test_item = itemData;

    if (!itemData.success) {
      return jsonResponse({ error: "Failed to create test item", results }, 500);
    }

    // 3. Simular pedido
    const orderResult = await simulateOrder(admin, aesKey, organizationId, {
      buyerId: usersData.buyer.id,
      buyerPassword: usersData.buyer.password,
      itemId: itemData.item.id
    });
    const orderData = await orderResult.json();
    results.test_order = orderData;

    if (!orderData.success) {
      return jsonResponse({ error: "Failed to simulate order", results }, 500);
    }

    // 4. Testar webhook
    const webhookResult = await testWebhook(admin, organizationId, {
      orderId: orderData.order.id,
      sellerId: usersData.seller.id
    });
    const webhookData = await webhookResult.json();
    results.webhook_test = webhookData;

    return jsonResponse({
      success: true,
      message: "Full test completed successfully",
      results: results
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: `Full test failed: ${msg}` }, 500);
  }
}
