import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/security/secret-box";
import { syncSocialLeadToSdDialer } from "@/lib/sd-dialer/sync-lead";

type CommentValue = {
  id?: string;
  text?: string;
  from?: { id?: string; username?: string };
  media?: { id?: string; media_product_type?: string };
};

type MessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean };
};

type MetaChange = { field?: string; value?: CommentValue };
type MetaEntry = {
  id?: string;
  field?: string;
  value?: CommentValue;
  changes?: MetaChange[];
  messaging?: MessagingEvent[];
};

type MetaWebhook = { object?: string; entry?: MetaEntry[] };
type TriggerConfig = { keywords?: string[]; match?: "contains" | "exact" };
type ActionConfig = { type?: string; text?: string };

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-PT").trim();
}

function matchesKeyword(text: string, config: TriggerConfig) {
  const normalized = normalize(text);
  for (const raw of config.keywords || []) {
    const keyword = normalize(raw);
    if (!keyword) continue;
    if (config.match === "exact" ? normalized === keyword : normalized.includes(keyword)) return keyword;
  }
  return null;
}

function extractPortuguesePhone(text: string) {
  const compact = text.replace(/[().\s-]/g, "");
  const match = compact.match(/(?:\+351|00351)?(9[1236]\d{7})/);
  return match?.[1] ? `+351${match[1]}` : null;
}

function extractName(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  const match = clean.match(/(?:chamo[- ]?me|o meu nome [ée]|sou o|sou a)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]{1,50})/i);
  if (!match?.[1]) return null;
  return match[1].split(/[,.;!?\n]/)[0].trim().slice(0, 60) || null;
}

async function sendPrivateReply(igUserId: string, commentId: string, text: string, token: string) {
  const version = process.env.META_GRAPH_API_VERSION || "v26.0";
  const response = await fetch(`https://graph.instagram.com/${version}/${encodeURIComponent(igUserId)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text } }),
    cache: "no-store",
  });
  const body = await response.json() as { recipient_id?: string; message_id?: string; error?: { message?: string; code?: number } };
  if (!response.ok) throw new Error(body.error?.message || `Instagram private reply failed (${response.status})`);
  return body;
}

async function processComment(entryId: string | undefined, value: CommentValue | undefined) {
  if (!entryId || !value?.id || !value.text) return;
  const admin = createSupabaseAdminClient();
  const { data: account } = await admin
    .from("social_ai_social_accounts")
    .select("id,organization_id,external_account_id")
    .eq("provider", "instagram")
    .eq("external_account_id", entryId)
    .maybeSingle();
  if (!account) return;

  const { data: automations } = await admin
    .from("social_ai_automations")
    .select("id,trigger_config,action_config")
    .eq("organization_id", account.organization_id)
    .eq("trigger_type", "comment_keyword")
    .eq("enabled", true)
    .or(`social_account_id.eq.${account.id},social_account_id.is.null`)
    .order("created_at", { ascending: true });

  const match = (automations || []).map((automation) => ({
    automation,
    keyword: matchesKeyword(value.text || "", automation.trigger_config as TriggerConfig),
  })).find((item) => item.keyword);
  if (!match) return;

  const action = match.automation.action_config as ActionConfig;
  const replyText = String(action.text || "").trim().slice(0, 1000);
  if (action.type !== "private_reply" || !replyText) return;

  const { data: run, error: runError } = await admin.from("social_ai_automation_runs").insert({
    organization_id: account.organization_id,
    automation_id: match.automation.id,
    social_account_id: account.id,
    external_event_id: value.id,
    trigger_type: "comment_keyword",
    status: "processing",
    result: { keyword: match.keyword },
  }).select("id").single();

  if (runError?.code === "23505") return;
  if (runError || !run) throw runError || new Error("Could not create automation run");

  try {
    const { data: credential, error: credentialError } = await admin
      .from("social_ai_social_credentials")
      .select("token_ciphertext,expires_at")
      .eq("social_account_id", account.id)
      .single();
    if (credentialError || !credential) throw credentialError || new Error("Instagram credential missing");
    if (credential.expires_at && Date.parse(credential.expires_at) <= Date.now()) throw new Error("Instagram token expired");

    const result = await sendPrivateReply(account.external_account_id, value.id, replyText, decryptSecret(credential.token_ciphertext));
    await admin.from("social_ai_automation_runs").update({
      status: "done",
      result: { keyword: match.keyword, recipient_id: result.recipient_id, message_id: result.message_id },
      updated_at: new Date().toISOString(),
    }).eq("id", run.id);

    await admin.from("social_ai_leads").insert({
      organization_id: account.organization_id,
      name: value.from?.username || null,
      source: "instagram_comment",
      interest: match.keyword,
      status: "engaged",
      metadata: {
        comment_id: value.id,
        commenter_id: value.from?.id || null,
        media_id: value.media?.id || null,
        original_comment: value.text,
        automation_id: match.automation.id,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Automation failed";
    await admin.from("social_ai_automation_runs").update({
      status: "error",
      result: { keyword: match.keyword, error: message },
      updated_at: new Date().toISOString(),
    }).eq("id", run.id);
  }
}

async function processMessage(entryId: string | undefined, event: MessagingEvent) {
  const senderId = event.sender?.id;
  const recipientId = event.recipient?.id;
  const messageId = event.message?.mid;
  const text = String(event.message?.text || "").trim();
  if (!senderId || !recipientId || !text || event.message?.is_echo) return;

  const admin = createSupabaseAdminClient();
  const accountExternalId = entryId || recipientId;
  const { data: account } = await admin
    .from("social_ai_social_accounts")
    .select("id,organization_id,external_account_id")
    .eq("provider", "instagram")
    .eq("external_account_id", accountExternalId)
    .maybeSingle();
  if (!account) return;

  const { data: existingConversation } = await admin
    .from("social_ai_conversations")
    .select("id,contact_name")
    .eq("social_account_id", account.id)
    .eq("external_thread_id", senderId)
    .maybeSingle();

  let conversationId = existingConversation?.id as string | undefined;
  const detectedName = extractName(text);
  if (!conversationId) {
    const { data: created, error } = await admin.from("social_ai_conversations").insert({
      organization_id: account.organization_id,
      social_account_id: account.id,
      external_thread_id: senderId,
      contact_external_id: senderId,
      contact_name: detectedName,
      status: "open",
    }).select("id").single();
    if (error || !created) throw error || new Error("Could not create Instagram conversation");
    conversationId = created.id;
  } else {
    await admin.from("social_ai_conversations").update({
      updated_at: new Date().toISOString(),
      ...(detectedName && !existingConversation?.contact_name ? { contact_name: detectedName } : {}),
    }).eq("id", conversationId);
  }

  if (messageId) {
    const { data: duplicateMessage } = await admin
      .from("social_ai_messages")
      .select("id")
      .eq("external_message_id", messageId)
      .maybeSingle();
    if (duplicateMessage) return;
  }

  await admin.from("social_ai_messages").insert({
    organization_id: account.organization_id,
    conversation_id: conversationId,
    external_message_id: messageId || null,
    direction: "inbound",
    body: text.slice(0, 4000),
    payload: { sender_id: senderId, recipient_id: recipientId, timestamp: event.timestamp || null },
  });

  const phone = extractPortuguesePhone(text);
  const { data: existingLead } = await admin
    .from("social_ai_leads")
    .select("id,name,phone,metadata,sd_dialer_lead_id")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let leadId = existingLead?.id as string | undefined;
  if (!leadId) {
    const { data: createdLead, error } = await admin.from("social_ai_leads").insert({
      organization_id: account.organization_id,
      conversation_id: conversationId,
      name: detectedName,
      phone,
      source: "instagram_dm",
      status: phone ? "qualified" : "engaged",
      sync_status: phone && detectedName ? "ready" : "not_ready",
      metadata: { instagram_user_id: senderId },
    }).select("id").single();
    if (error || !createdLead) throw error || new Error("Could not create Instagram DM lead");
    leadId = createdLead.id;
  } else if (existingLead) {
    const metadata = (existingLead.metadata || {}) as Record<string, unknown>;
    const nextName = existingLead.name || detectedName;
    const nextPhone = existingLead.phone || phone;
    await admin.from("social_ai_leads").update({
      name: nextName || null,
      phone: nextPhone || null,
      status: nextName && nextPhone ? "qualified" : "engaged",
      sync_status: nextName && nextPhone ? "ready" : "not_ready",
      metadata: { ...metadata, instagram_user_id: senderId },
    }).eq("id", leadId);
  }

  if (leadId && !existingLead?.sd_dialer_lead_id) {
    await syncSocialLeadToSdDialer(leadId).catch(() => null);
  }
}

export async function processMetaWebhook(payload: MetaWebhook) {
  if (payload.object !== "instagram") return;
  for (const entry of payload.entry || []) {
    if (entry.field === "comments") await processComment(entry.id, entry.value);
    for (const change of entry.changes || []) {
      if (change.field === "comments") await processComment(entry.id, change.value);
    }
    for (const event of entry.messaging || []) {
      await processMessage(entry.id, event);
    }
  }
}
