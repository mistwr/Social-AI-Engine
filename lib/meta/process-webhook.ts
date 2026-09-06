import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/security/secret-box";

type CommentValue = {
  id?: string;
  text?: string;
  from?: { id?: string; username?: string };
  media?: { id?: string; media_product_type?: string };
};

type MetaEntry = {
  id?: string;
  field?: string;
  value?: CommentValue;
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

async function processComment(entry: MetaEntry) {
  if (!entry.id || !entry.value?.id || !entry.value.text) return;
  const admin = createSupabaseAdminClient();
  const { data: account } = await admin
    .from("social_accounts")
    .select("id,organization_id,external_account_id")
    .eq("provider", "instagram")
    .eq("external_account_id", entry.id)
    .maybeSingle();
  if (!account) return;

  const { data: automations } = await admin
    .from("automations")
    .select("id,trigger_config,action_config")
    .eq("organization_id", account.organization_id)
    .eq("trigger_type", "comment_keyword")
    .eq("enabled", true)
    .or(`social_account_id.eq.${account.id},social_account_id.is.null`)
    .order("created_at", { ascending: true });

  const match = (automations || []).map((automation) => ({
    automation,
    keyword: matchesKeyword(entry.value?.text || "", automation.trigger_config as TriggerConfig),
  })).find((item) => item.keyword);
  if (!match) return;

  const action = match.automation.action_config as ActionConfig;
  const replyText = String(action.text || "").trim().slice(0, 1000);
  if (action.type !== "private_reply" || !replyText) return;

  const { data: run, error: runError } = await admin.from("automation_runs").insert({
    organization_id: account.organization_id,
    automation_id: match.automation.id,
    social_account_id: account.id,
    external_event_id: entry.value.id,
    trigger_type: "comment_keyword",
    status: "processing",
    result: { keyword: match.keyword },
  }).select("id").single();

  if (runError?.code === "23505") return;
  if (runError || !run) throw runError || new Error("Could not create automation run");

  try {
    const { data: credential, error: credentialError } = await admin
      .from("social_credentials")
      .select("token_ciphertext,expires_at")
      .eq("social_account_id", account.id)
      .single();
    if (credentialError || !credential) throw credentialError || new Error("Instagram credential missing");
    if (credential.expires_at && Date.parse(credential.expires_at) <= Date.now()) throw new Error("Instagram token expired");

    const result = await sendPrivateReply(account.external_account_id, entry.value.id, replyText, decryptSecret(credential.token_ciphertext));
    await admin.from("automation_runs").update({
      status: "done",
      result: { keyword: match.keyword, recipient_id: result.recipient_id, message_id: result.message_id },
      updated_at: new Date().toISOString(),
    }).eq("id", run.id);

    await admin.from("leads").insert({
      organization_id: account.organization_id,
      name: entry.value.from?.username || null,
      source: "instagram_comment",
      interest: match.keyword,
      status: "engaged",
      metadata: {
        comment_id: entry.value.id,
        commenter_id: entry.value.from?.id || null,
        media_id: entry.value.media?.id || null,
        original_comment: entry.value.text,
        automation_id: match.automation.id,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Automation failed";
    await admin.from("automation_runs").update({
      status: "error",
      result: { keyword: match.keyword, error: message },
      updated_at: new Date().toISOString(),
    }).eq("id", run.id);
  }
}

export async function processMetaWebhook(payload: MetaWebhook) {
  if (payload.object !== "instagram") return;
  for (const entry of payload.entry || []) {
    if (entry.field === "comments") await processComment(entry);
  }
}
