import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SyncResult =
  | { ok: true; already_synced?: boolean; sd_dialer_lead_id: string }
  | { ok: false; code: string; detail?: string; requires?: string[] };

export async function syncSocialLeadToSdDialer(leadId: string): Promise<SyncResult> {
  const admin = createSupabaseAdminClient();

  const { data: lead, error: leadError } = await admin
    .from("social_ai_leads")
    .select("id,organization_id,name,phone,email,interest,status,metadata,sd_dialer_lead_id")
    .eq("id", leadId)
    .single();

  if (leadError || !lead) return { ok: false, code: "lead_not_found" };

  if (lead.sd_dialer_lead_id) {
    return { ok: true, already_synced: true, sd_dialer_lead_id: lead.sd_dialer_lead_id };
  }

  const phone = String(lead.phone || "").replace(/\s+/g, "").trim();
  const name = String(lead.name || "").trim();
  if (!phone || !name) {
    await admin.from("social_ai_leads").update({ sync_status: "not_ready" }).eq("id", lead.id);
    return { ok: false, code: "lead_not_ready", requires: ["name", "phone"] };
  }

  const { data: organization, error: orgError } = await admin
    .from("social_ai_organizations")
    .select("sd_dialer_company_id,name")
    .eq("id", lead.organization_id)
    .single();

  if (orgError || !organization?.sd_dialer_company_id) {
    return { ok: false, code: "sd_dialer_company_not_configured" };
  }

  await admin.from("social_ai_leads").update({ sync_status: "ready" }).eq("id", lead.id);

  const metadata = (lead.metadata || {}) as Record<string, unknown>;
  const observations = [
    "Origem: Social AI Engine / Instagram",
    lead.interest ? `Interesse: ${lead.interest}` : null,
    metadata.original_comment ? `Comentário: ${String(metadata.original_comment)}` : null,
  ].filter(Boolean).join("\n");

  const { data: duplicate } = await admin
    .from("leads")
    .select("id")
    .eq("company_id", organization.sd_dialer_company_id)
    .eq("telefone", phone)
    .limit(1)
    .maybeSingle();

  if (duplicate?.id) {
    await admin.from("social_ai_leads").update({
      sd_dialer_lead_id: duplicate.id,
      sync_status: "synced",
      synced_at: new Date().toISOString(),
      metadata: { ...metadata, sync_mode: "matched_existing_phone" },
    }).eq("id", lead.id);
    return { ok: true, already_synced: true, sd_dialer_lead_id: duplicate.id };
  }

  const { data: crmLead, error: crmError } = await admin
    .from("leads")
    .insert({
      company_id: organization.sd_dialer_company_id,
      nome: name,
      telefone: phone,
      email: lead.email || null,
      observacoes: observations || null,
      origem: "outro",
      custom_fields: {
        source: "social_ai_instagram",
        social_ai_lead_id: lead.id,
        social_ai_organization_id: lead.organization_id,
        interest: lead.interest || null,
        instagram_comment_id: metadata.comment_id || null,
        instagram_user_id: metadata.commenter_id || metadata.instagram_user_id || null,
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
    return { ok: false, code: "sd_dialer_insert_failed", detail: crmError?.message };
  }

  await admin.from("social_ai_leads").update({
    sd_dialer_lead_id: crmLead.id,
    sync_status: "synced",
    synced_at: new Date().toISOString(),
  }).eq("id", lead.id);

  return { ok: true, sd_dialer_lead_id: crmLead.id };
}
