import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/whatsapp/encryption";

const META_API_VERSION = "v21.0";
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

async function resolveConfig(supabase: any) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Unauthorized");
  }

  // Resolve account_id
  const { data: profile } = await supabase
    .from("profiles")
    .select("account_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.account_id) {
    throw new Error("No account associated with user");
  }

  // Get WhatsApp config
  const { data: config, error: configError } = await supabase
    .from("whatsapp_config")
    .select("*")
    .eq("account_id", profile.account_id)
    .maybeSingle();

  if (configError || !config) {
    throw new Error("WhatsApp connection not configured");
  }

  const accessToken = decrypt(config.access_token);
  return {
    phoneNumberId: config.phone_number_id,
    wabaId: config.waba_id,
    accessToken,
  };
}

// GET - Retrieve WhatsApp Business Profile details
export async function GET() {
  try {
    const supabase = await createClient();
    const credentials = await resolveConfig(supabase);

    const url = `${META_API_BASE}/${credentials.phoneNumberId}/whatsapp_business_profile?fields=about,address,description,email,vertical,websites,profile_picture_url`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: err.error?.message || "Failed to fetch WhatsApp profile from Meta" },
        { status: res.status }
      );
    }

    const profileData = await res.json();
    return NextResponse.json({ profile: profileData.data?.[0] || {} });
  } catch (err: any) {
    console.error("[GET /api/whatsapp/profile] error:", err.message || err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: err.message === "Unauthorized" ? 401 : 500 }
    );
  }
}

// POST - Update WhatsApp Business Profile details (including picture upload)
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const credentials = await resolveConfig(supabase);

    const formData = await request.formData();
    const address = formData.get("address") as string | null;
    const description = formData.get("description") as string | null;
    const email = formData.get("email") as string | null;
    const vertical = formData.get("vertical") as string | null;
    const about = formData.get("about") as string | null;
    const websitesRaw = formData.get("websites") as string | null;
    const file = formData.get("file") as File | null;

    const profileUpdateBody: Record<string, any> = {
      messaging_product: "whatsapp",
    };

    if (address !== null) profileUpdateBody.address = address;
    if (description !== null) profileUpdateBody.description = description;
    if (email !== null) profileUpdateBody.email = email;
    if (vertical !== null) profileUpdateBody.vertical = vertical;
    if (about !== null) profileUpdateBody.about = about;

    if (websitesRaw) {
      try {
        const websites = JSON.parse(websitesRaw);
        if (Array.isArray(websites)) {
          profileUpdateBody.websites = websites.slice(0, 2);
        }
      } catch {
        // ignore malformed websites array
      }
    }

    // Handle Image file upload if present
    if (file && file.size > 0) {
      const metaAppId = process.env.META_APP_ID;
      if (!metaAppId) {
        return NextResponse.json(
          { error: "META_APP_ID is not configured in env settings" },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());

      // 1. Initiate resumable upload session on Meta
      const initUrl = `${META_API_BASE}/${metaAppId}/uploads?file_length=${buffer.length}&file_type=${file.type}&access_token=${credentials.accessToken}`;
      const initRes = await fetch(initUrl, { method: "POST" });
      if (!initRes.ok) {
        const err = await initRes.json().catch(() => ({}));
        return NextResponse.json(
          { error: `Meta upload initiation failed: ${err.error?.message || initRes.statusText}` },
          { status: initRes.status }
        );
      }
      const initData = await initRes.json();
      const sessionId = initData.id;

      // 2. Upload file binary data
      const uploadUrl = `https://graph.facebook.com/${META_API_VERSION}/${sessionId}`;
      const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          Authorization: `OAuth ${credentials.accessToken}`,
          file_offset: "0",
          "Content-Type": file.type,
        },
        body: buffer,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        return NextResponse.json(
          { error: `Meta file upload failed: ${err.error?.message || uploadRes.statusText}` },
          { status: uploadRes.status }
        );
      }
      const uploadData = await uploadRes.json();
      const fileHandle = uploadData.h;

      // Attach file handle to the profile update body
      profileUpdateBody.profile_picture_handle = fileHandle;
    }

    // 3. Update WhatsApp Business Profile details
    const profileUrl = `${META_API_BASE}/${credentials.phoneNumberId}/whatsapp_business_profile`;
    const profileRes = await fetch(profileUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${credentials.accessToken}`,
      },
      body: JSON.stringify(profileUpdateBody),
    });

    if (!profileRes.ok) {
      const err = await profileRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: err.error?.message || "Failed to update WhatsApp profile on Meta" },
        { status: profileRes.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[POST /api/whatsapp/profile] error:", err.message || err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: err.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
