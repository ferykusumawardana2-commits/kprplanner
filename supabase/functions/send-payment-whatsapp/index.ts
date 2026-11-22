const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST")
    return respond({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const anonKey = requiredEnv("SUPABASE_ANON_KEY");
    const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const graphVersion = requiredEnv("WHATSAPP_GRAPH_API_VERSION");
    const phoneNumberId = requiredEnv("WHATSAPP_PHONE_NUMBER_ID");
    const accessTokenWhatsApp = requiredEnv("WHATSAPP_ACCESS_TOKEN");
    const templateName = requiredEnv("WHATSAPP_TEMPLATE_NAME");
    const templateLanguage = requiredEnv("WHATSAPP_TEMPLATE_LANGUAGE");
    if (!/^v[0-9]+\.[0-9]+$/.test(graphVersion))
      throw new Error("Invalid WHATSAPP_GRAPH_API_VERSION");
    const accessToken = request.headers
      .get("Authorization")
      ?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken) return respond({ error: "Authentication required." }, 401);

    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!authResponse.ok)
      return respond({ error: "Your session is invalid or expired." }, 401);
    const user = await authResponse.json();

    let orderId: string;
    try {
      const body = await request.json();
      orderId = body.order_id;
    } catch {
      return respond({ error: "A valid order_id is required." }, 400);
    }
    if (
      typeof orderId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        orderId,
      )
    )
      return respond({ error: "A valid order_id is required." }, 400);

    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };
    const ownedOrderUrl = new URL("/rest/v1/orders", supabaseUrl);
    ownedOrderUrl.searchParams.set("select", "id");
    ownedOrderUrl.searchParams.set("id", `eq.${orderId}`);
    ownedOrderUrl.searchParams.set("user_id", `eq.${user.id}`);
    const ownedOrderResponse = await fetch(ownedOrderUrl, { headers });
    if (!ownedOrderResponse.ok)
      return respond({ error: "Could not verify this order." }, 502);
    const ownedOrders = await ownedOrderResponse.json();
    if (!Array.isArray(ownedOrders) || ownedOrders.length !== 1)
      return respond({ error: "Order not found." }, 404);

    const claimResponse = await fetch(
      `${supabaseUrl}/rest/v1/rpc/claim_payment_whatsapp_notification`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ p_order_id: orderId }),
      },
    );
    if (!claimResponse.ok)
      return respond(
        { error: "This order is not eligible for a WhatsApp notification." },
        409,
      );
    const claimedData = await claimResponse.json();
    const order = Array.isArray(claimedData) ? claimedData[0] : claimedData;
    if (
      !order ||
      !/^[1-9][0-9]{7,14}$/.test(order.nomor_telepon || "") ||
      !order.whatsapp_notified_at
    )
      return respond({ error: "The order has no valid WhatsApp recipient." }, 409);

    const releaseClaim = async () => {
      const releaseResponse = await fetch(
        `${supabaseUrl}/rest/v1/rpc/release_payment_whatsapp_notification`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            p_order_id: orderId,
            p_claimed_at: order.whatsapp_notified_at,
          }),
        },
      );
      if (!releaseResponse.ok)
        console.error("Could not release the WhatsApp notification claim.");
    };

    const shortOrderId = order.id.replace(/-/g, "").slice(-8).toUpperCase();
    let whatsappResponse: Response;
    try {
      whatsappResponse = await fetch(
        `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(phoneNumberId)}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessTokenWhatsApp}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: order.nomor_telepon,
            type: "template",
            template: {
              name: templateName,
              language: { code: templateLanguage },
              components: [
                {
                  type: "body",
                  parameters: [
                    { type: "text", text: order.plan_nama },
                    { type: "text", text: `#${shortOrderId}` },
                    {
                      type: "text",
                      text: `Rp${Number(order.total).toLocaleString("id-ID")}`,
                    },
                  ],
                },
              ],
            },
          }),
        },
      );
    } catch {
      await releaseClaim();
      return respond(
        { error: "Could not connect to the WhatsApp service. Try again later." },
        502,
      );
    }

    if (!whatsappResponse.ok) {
      await releaseClaim();
      return respond(
        {
          error: `WhatsApp rejected the notification (HTTP ${whatsappResponse.status}).`,
        },
        502,
      );
    }

    return respond({ sent: true });
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Unexpected notification error.",
    );
    return respond(
      { error: "WhatsApp notification could not be sent. Check server configuration." },
      500,
    );
  }
});
