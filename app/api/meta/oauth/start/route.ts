import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signMetaOAuthState } from "@/lib/meta/oauth-state";

const scopes = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
  "instagram_business_content_publish",
];

export async function GET(request: NextRequest) {
  const organizationId = request.nextUrl.searchParams.get("organization");
  const appId = process.env.META_APP_ID;
  const redirectUri = process.env.META_REDIRECT_URI || `${request.nextUrl.origin}/api/meta/oauth/callback`;
  if (!organizationId || !appId) return NextResponse.redirect(new URL("/dashboard?error=meta-config", request.url));

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) return NextResponse.redirect(new URL("/dashboard?error=forbidden", request.url));

  const state = signMetaOAuthState({ userId: user.id, organizationId });
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scopes.join(","));
  url.searchParams.set("state", state);

  return NextResponse.redirect(url);
}
