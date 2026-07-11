import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/whatsapp/encryption";
import { getShopInfo } from "@/lib/shopify/shopify-client";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get account_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile?.account_id) {
      return NextResponse.json({ error: "No account associated with user" }, { status: 400 });
    }

    const accountId = profile.account_id;
    const body = await request.json().catch(() => ({}));

    let connectionLabel = "";
    let configData: Record<string, any> = {};

    if (key === "shopify") {
      // Validate Shopify using existing shopify-client getShopInfo
      try {
        const shop = await getShopInfo();
        connectionLabel = shop.domain || "Shopify Store";
        configData = {
          shopName: shop.name,
          domain: shop.domain,
        };
      } catch (err: any) {
        return NextResponse.json(
          { error: `Shopify validation failed: ${err.message || "Check environment config"}` },
          { status: 400 }
        );
      }
    } else if (key === "razorpay") {
      const { keyId, keySecret } = body;
      if (!keyId?.trim() || !keySecret?.trim()) {
        return NextResponse.json({ error: "Key ID and Key Secret are required" }, { status: 400 });
      }

      // Validate credentials against Razorpay API
      const auth = Buffer.from(`${keyId.trim()}:${keySecret.trim()}`).toString("base64");
      const res = await fetch("https://api.razorpay.com/v1/orders?count=1", {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      });

      if (res.status === 401) {
        return NextResponse.json({ error: "Invalid Razorpay Key ID or Key Secret" }, { status: 400 });
      }

      connectionLabel = `Razorpay (${keyId.trim().substring(0, 8)}...)`;
      configData = {
        keyId: keyId.trim(),
        encrypted_secret: encrypt(keySecret.trim()),
      };
    } else if (key === "shiprocket") {
      const { email, password } = body;
      if (!email?.trim() || !password?.trim()) {
        return NextResponse.json({ error: "Email and Password are required" }, { status: 400 });
      }

      // Validate login against Shiprocket
      const res = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password: password.trim() }),
      });

      if (!res.ok) {
        return NextResponse.json({ error: "Invalid Shiprocket Email or Password" }, { status: 400 });
      }

      connectionLabel = email.trim();
      configData = {
        email: email.trim(),
        encrypted_password: encrypt(password.trim()),
      };
    } else if (key === "cashfree") {
      const { clientId, clientSecret, environment } = body;
      if (!clientId?.trim() || !clientSecret?.trim()) {
        return NextResponse.json({ error: "Client ID and Client Secret are required" }, { status: 400 });
      }

      const env = (environment || "SANDBOX").toUpperCase();
      if (env !== "SANDBOX" && env !== "PRODUCTION") {
        return NextResponse.json({ error: "Environment must be SANDBOX or PRODUCTION" }, { status: 400 });
      }

      // Validate credentials against Cashfree API
      const envUrl = env === "PRODUCTION" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";
      const res = await fetch(`${envUrl}/orders?limit=1`, {
        headers: {
          "x-client-id": clientId.trim(),
          "x-client-secret": clientSecret.trim(),
          "x-api-version": "2023-08-01",
        },
      });

      if (res.status === 401) {
        return NextResponse.json({ error: "Invalid Cashfree Client ID or Client Secret" }, { status: 400 });
      }

      // Write/upsert to cashfree_config
      const encryptedSecret = encrypt(clientSecret.trim());
      const { error: cfConfigErr } = await supabase
        .from("cashfree_config")
        .upsert({
          account_id: accountId,
          client_id: clientId.trim(),
          client_secret: encryptedSecret,
          environment: env,
          api_version: "2023-08-01",
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "account_id",
        });

      if (cfConfigErr) {
        console.error("Error saving Cashfree config:", cfConfigErr);
        return NextResponse.json({ error: "Failed to save Cashfree credentials in database" }, { status: 500 });
      }

      connectionLabel = `Cashfree (${env})`;
      configData = {
        clientId: clientId.trim(),
        environment: env,
      };
    } else if (key === "generic_webhook") {
      const { trigger_event, target_url } = body;
      if (!trigger_event?.trim()) {
        return NextResponse.json({ error: "Trigger event is required" }, { status: 400 });
      }

      const endpointId = crypto.randomUUID();
      const origin = typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_SITE_URL || "https://wacrm.com";
      const endpointUrl = `${origin}/api/webhooks/generic/${endpointId}`;

      const { error: insertWebhookErr } = await supabase
        .from("webhook_endpoints")
        .insert({
          id: endpointId,
          account_id: accountId,
          endpoint_url: endpointUrl,
          target_url: target_url || null,
          trigger_event: trigger_event.trim(),
          is_active: true,
        });

      if (insertWebhookErr) {
        console.error("Error creating webhook endpoint:", insertWebhookErr);
        return NextResponse.json({ error: "Failed to create webhook endpoint" }, { status: 500 });
      }

      connectionLabel = "Developer Webhook";
      configData = {
        latest_trigger: trigger_event.trim(),
      };
    } else {
      return NextResponse.json({ error: "Unsupported integration type" }, { status: 400 });
    }

    // Insert or update merchant_integrations
    const { error: upsertErr } = await supabase
      .from("merchant_integrations")
      .upsert({
        account_id: accountId,
        integration_key: key,
        status: "connected",
        config: configData,
        connection_label: connectionLabel,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "account_id, integration_key",
      });

    if (upsertErr) {
      console.error("Error saving merchant integration:", upsertErr);
      return NextResponse.json({ error: "Failed to save connection status" }, { status: 500 });
    }

    return NextResponse.json({ success: true, connection_label: connectionLabel });
  } catch (err: any) {
    console.error("[POST /api/integrations/connect] error:", err.message || err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
