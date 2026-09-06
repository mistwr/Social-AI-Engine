import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { lead_id?: string };
  const leadId = String(body.lead_id || "");
  if (!leadId) return NextResponse.json({ error: "lead_id_required" }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: lead, error: leadError } = await admin
    .from("social_ai_leads")
    .select("id,organization_id,name,phone,email,interest,status,metadata,sd_dialer_lead_id")
    .eq("id", leadId)
    .single();
  if (leadError || !lead) return NextResponse.json({ error: "lead_not_found" }, { status: 404 });

  const { data: membership } = await admin
    .from("social_ai_organization_members")
    .select("role")
    .eq("organization_id", lead.organization_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (lead.sd_dialer_lead_id) {
    return NextResponse.json({ ok: true, already_synced: true, sd_dialer_lead_id: lead.sd_dialer_lead_id });
  }

  const phone = String(lead.phone || "").trim();
  const name = String(lead.name || "").trim();
  if (!phone || !name) {
    await admin.from("social_ai_leads").update({ sync_status: "not_ready" }).eq("id", lead.id);
    return NextResponse.json({ error: "lead_not_ready", requires: ["name", "phone"] }, { status: 409 });
  }

  const { data: organization, error: orgError } = await admin
    .from("social_ai_organizations")
    .select("sd_dialer_company_id,name")
    .eq("id", lead.organization_id)
    .single();
  if (orgError || !organization?.sd_dialer_company_id) {
    return NextResponse.json({ error: "sd_dialer_company_not_configured" }, { status: 409 });
  }

  await admin.from("social_ai_leads").update({ sync_status: "ready" }).eq("id", lead.id);

  const metadata = (lead.metadata || {}) as Record<string, unknown>;
  const observations = [
    "Origem: Social AI Engine / Instagram",
    lead.interest ? `Interesse: ${lead.interest}` : null,
    metadata.original_comment ? `Comentário: ${String(metadata.original_comment)}` : null,
  ].filter(Boolean).join("\n");

  const { data: crmLead, error: crmError } = await admin
    .from("leads")
    .insert({
      company_id: organization.sd_dialer_company_id,
      nome: name,
      telefone: phone,
      email: lead.email || null,
      observacoes: observations || null,
      origem: "social_ai_instagram",
      custom_fields: {
        social_ai_lead_id: lead.id,
        social_ai_organization_id: lead.organization_id,
        interest: lead.interest || null,
        instagram_comment_id: metadata.comment_id || null,
        instagram_user_id: metadata.commenter_id || null,
      },
      consentimento_rgpd: false,
      skip_auto_assign: false,
    })
    .select("id")
    .single();

  if (crmError || !crmLead) {
    await admin.from("social_ai_leads").update({
      sync_status: "error",
      metadata: { ...metadata, sync_error: crmError?.message || "unknown" },
    }).eq("id", lead.id);
    return NextResponse.json({ error: "sd_dialer_insert_failed", detail: crmError?.message }, { status: 500 });
  }

  await admin.from("social_ai_leads").update({
    sd_dialer_lead_id: crmLead.id,
    sync_status: "synced",
    synced_at: new Date().toISOString(),
  }).eq("id", lead.id);

  return NextResponse.json({ ok: true, sd_dialer_lead_id: crmLead.id });
}
