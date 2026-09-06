import { NextRequest, NextResponse } from "next/server";
import { verifyMetaOAuthState } from "@/lib/meta/oauth-state";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/security/secret-box";

function graphVersion() {
  return process.env.META_GRAPH_API_VERSION || "v26.0";
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const stateText = request.nextUrl.searchParams.get("state");
  const denied = request.nextUrl.searchParams.get("error");
  if (denied) return NextResponse.redirect(new URL(`/dashboard?error=${encodeURIComponent(denied)}`, request.url));
  if (!code || !stateText) return NextResponse.redirect(new URL("/dashboard?error=meta-callback", request.url));

  try {
    const state = verifyMetaOAuthState(stateText);
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    const redirectUri = process.env.META_REDIRECT_URI || `${request.nextUrl.origin}/api/meta/oauth/callback`;
    if (!appId || !appSecret) throw new Error("Meta app is not configured");

    const admin = createSupabaseAdminClient();
    const { data: membership } = await admin
      .from("organization_members")
      .select("organization_id")
      .eq("organization_id", state.organizationId)
      .eq("user_id", state.userId)
      .maybeSingle();
    if (!membership) throw new Error("Workspace access denied");

    const form = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    });
    const shortResponse = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      cache: "no-store",
    });
    const shortData = (await shortResponse.json()) as { access_token?: string; user_id?: number | string; error_message?: string };
    if (!shortResponse.ok || !shortData.access_token) throw new Error(shortData.error_message || "Instagram token exchange failed");

    const longUrl = new URL(`https://graph.instagram.com/${graphVersion()}/access_token`);
    longUrl.searchParams.set("grant_type", "ig_exchange_token");
    longUrl.searchParams.set("client_secret", appSecret);
    longUrl.searchParams.set("access_token", shortData.access_token);
    const longResponse = await fetch(longUrl, { cache: "no-store" });
    const longData = (await longResponse.json()) as { access_token?: string; expires_in?: number; error?: { message?: string } };
    if (!longResponse.ok || !longData.access_token) throw new Error(longData.error?.message || "Long-lived Instagram token exchange failed");

    const profileUrl = new URL(`https://graph.instagram.com/${graphVersion()}/me`);
    profileUrl.searchParams.set("fields", "user_id,username,name");
    profileUrl.searchParams.set("access_token", longData.access_token);
    const profileResponse = await fetch(profileUrl, { cache: "no-store" });
    const profile = (await profileResponse.json()) as { id?: string; user_id?: string; username?: string; name?: string; error?: { message?: string } };
    if (!profileResponse.ok) throw new Error(profile.error?.message || "Instagram profile lookup failed");
    const externalAccountId = String(profile.user_id || profile.id || shortData.user_id || "");
    if (!externalAccountId) throw new Error("Instagram account id missing");

    const { data: existing } = await admin
      .from("social_accounts")
      .select("id,organization_id")
      .eq("provider", "instagram")
      .eq("external_account_id", externalAccountId)
      .maybeSingle();
    if (existing && existing.organization_id !== state.organizationId) throw new Error("This Instagram account is already connected to another workspace");

    let socialAccountId = existing?.id as string | undefined;
    if (socialAccountId) {
      const { error } = await admin.from("social_accounts").update({
        display_name: profile.username || profile.name || "Instagram",
        status: "connected",
      }).eq("id", socialAccountId);
      if (error) throw error;
    } else {
      const { data: account, error } = await admin.from("social_accounts").insert({
        organization_id: state.organizationId,
        provider: "instagram",
        external_account_id: externalAccountId,
        display_name: profile.username || profile.name || "Instagram",
        status: "connected",
      }).select("id").single();
      if (error || !account) throw error || new Error("Could not save Instagram account");
      socialAccountId = account.id;
    }

    const expiresAt = new Date(Date.now() + (longData.expires_in || 5_184_000) * 1000).toISOString();
    const { error: credentialError } = await admin.from("social_credentials").upsert({
      social_account_id: socialAccountId,
      token_ciphertext: encryptSecret(longData.access_token),
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: "social_account_id" });
    if (credentialError) throw credentialError;

    const subscribeUrl = new URL(`https://graph.instagram.com/${graphVersion()}/${externalAccountId}/subscribed_apps`);
    subscribeUrl.searchParams.set("subscribed_fields", "messages,message_edit,message_reactions,messaging_seen,comments");
    subscribeUrl.searchParams.set("access_token", longData.access_token);
    const subscribeResponse = await fetch(subscribeUrl, { method: "POST", cache: "no-store" });
    const subscribeData = (await subscribeResponse.json()) as { success?: boolean };
    const webhookStatus = subscribeResponse.ok && subscribeData.success ? "subscribed" : "needs_review";
    await admin.from("social_accounts").update({ status: webhookStatus === "subscribed" ? "connected" : "connected_webhook_pending" }).eq("id", socialAccountId);

    return NextResponse.redirect(new URL(`/dashboard?instagram=${webhookStatus}`, request.url));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Instagram connection failed";
    return NextResponse.redirect(new URL(`/dashboard?error=${encodeURIComponent(message)}`, request.url));
  }
}
