import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const configSchema = z.object({
  brand_name: z.string().max(40, "Brand name must be under 40 characters").trim(),
  public_shop_url: z
    .string()
    .trim()
    .refine((val) => {
      if (!val) return true;
      try {
        new URL(val);
        return true;
      } catch {
        return false;
      }
    }, "Please provide a valid URL (e.g. https://example.com)"),
});

export async function GET(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile?.account_id) {
      return NextResponse.json({ error: "No account associated with user" }, { status: 400 });
    }

    const accountId = profile.account_id;

    // Fetch the shopify connection from merchant_integrations
    const { data: integration, error: intError } = await supabase
      .from("merchant_integrations")
      .select("*")
      .eq("account_id", accountId)
      .eq("integration_key", "shopify")
      .maybeSingle();

    if (intError) {
      return NextResponse.json({ error: intError.message }, { status: 500 });
    }

    if (!integration) {
      return NextResponse.json({
        brand_name: "",
        public_shop_url: "",
        shop_url: "",
        connected: false,
      });
    }

    const config = integration.config || {};
    const shopUrl = config.domain || integration.connection_label || "";
    const brandName = config.brand_name || config.shopName || integration.connection_label || "";
    const publicShopUrl = config.public_shop_url || "";

    return NextResponse.json({
      brand_name: brandName,
      public_shop_url: publicShopUrl,
      shop_url: shopUrl,
      connected: true,
    });
  } catch (err: any) {
    console.error("[shopify-config] GET error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    // Zod validation
    const parsed = configSchema.safeParse(body);
    if (!parsed.success) {
      const firstErr = parsed.error.issues[0]?.message || "Validation failed";
      return NextResponse.json({ error: firstErr }, { status: 400 });
    }

    const { brand_name, public_shop_url } = parsed.data;

    // Fetch the shopify connection from merchant_integrations
    const { data: integration, error: intError } = await supabase
      .from("merchant_integrations")
      .select("*")
      .eq("account_id", accountId)
      .eq("integration_key", "shopify")
      .maybeSingle();

    if (intError) {
      return NextResponse.json({ error: intError.message }, { status: 500 });
    }

    if (!integration) {
      return NextResponse.json({ error: "Shopify integration is not connected yet" }, { status: 400 });
    }

    const updatedConfig = {
      ...(integration.config || {}),
      brand_name,
      public_shop_url,
    };

    const { error: updateError } = await supabase
      .from("merchant_integrations")
      .update({
        config: updatedConfig,
        updated_at: new Date().toISOString(),
      })
      .eq("id", integration.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      brand_name,
      public_shop_url,
    });
  } catch (err: any) {
    console.error("[shopify-config] PATCH error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
