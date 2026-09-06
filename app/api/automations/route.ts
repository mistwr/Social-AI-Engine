import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url), 303);

  const form = await request.formData();
  const organizationId = String(form.get("organization_id") || "");
  const socialAccountId = String(form.get("social_account_id") || "") || null;
  const keywordText = String(form.get("keywords") || "");
  const reply = String(form.get("reply") || "").trim().slice(0, 1000);
  const keywords = [...new Set(keywordText.split(/[\n,;]+/).map((item) => item.trim().toLocaleLowerCase("pt-PT")).filter(Boolean))].slice(0, 30);

  if (!organizationId || !keywords.length || !reply) {
    return NextResponse.redirect(new URL("/dashboard?error=automation-fields", request.url), 303);
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return NextResponse.redirect(new URL("/dashboard?error=forbidden", request.url), 303);

  if (socialAccountId) {
    const { data: account } = await supabase
      .from("social_accounts")
      .select("id")
      .eq("id", socialAccountId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!account) return NextResponse.redirect(new URL("/dashboard?error=invalid-channel", request.url), 303);
  }

  const { error } = await supabase.from("automations").insert({
    organization_id: organizationId,
    social_account_id: socialAccountId,
    name: `Comentário → DM: ${keywords.slice(0, 3).join(", ")}`,
    trigger_type: "comment_keyword",
    trigger_config: { keywords, match: "contains" },
    action_config: { type: "private_reply", text: reply },
    enabled: true,
  });

  if (error) return NextResponse.redirect(new URL(`/dashboard?error=${encodeURIComponent(error.message)}`, request.url), 303);
  return NextResponse.redirect(new URL("/dashboard?automation=created", request.url), 303);
}
