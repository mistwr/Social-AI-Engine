import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { syncSocialLeadToSdDialer } from "@/lib/sd-dialer/sync-lead";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { lead_id?: string };
  const leadId = String(body.lead_id || "");
  if (!leadId) return NextResponse.json({ error: "lead_id_required" }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: lead } = await admin
    .from("social_ai_leads")
    .select("organization_id")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return NextResponse.json({ error: "lead_not_found" }, { status: 404 });

  const { data: membership } = await admin
    .from("social_ai_organization_members")
    .select("role")
    .eq("organization_id", lead.organization_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const result = await syncSocialLeadToSdDialer(leadId);
  if (result.ok) return NextResponse.json(result);

  const status = result.code === "lead_not_found" ? 404
    : result.code === "lead_not_ready" || result.code === "sd_dialer_company_not_configured" ? 409
    : 500;
  return NextResponse.json({ error: result.code, detail: result.detail, requires: result.requires }, { status });
}
