import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Workspace = { id: string; name: string; slug: string };
type SocialAccount = { id: string; organization_id: string; provider: string; display_name: string | null; status: string };
type Automation = {
  id: string;
  organization_id: string;
  social_account_id: string | null;
  name: string;
  enabled: boolean;
  trigger_config: { keywords?: string[] };
  action_config: { text?: string };
};

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("social_ai_organization_members")
    .select("organization_id,role")
    .eq("user_id", user.id);

  const ids = (memberships || []).map((item) => item.organization_id);
  let workspaces: Workspace[] = [];
  let socialAccounts: SocialAccount[] = [];
  let automations: Automation[] = [];

  if (ids.length) {
    const { data: orgs } = await supabase.from("social_ai_organizations").select("id,name,slug").in("id", ids).order("created_at");
    workspaces = (orgs || []) as Workspace[];

    const { data: accounts } = await supabase
      .from("social_ai_social_accounts")
      .select("id,organization_id,provider,display_name,status")
      .in("organization_id", ids);
    socialAccounts = (accounts || []) as SocialAccount[];

    const { data: automationRows } = await supabase
      .from("social_ai_automations")
      .select("id,organization_id,social_account_id,name,enabled,trigger_config,action_config")
      .in("organization_id", ids)
      .order("created_at", { ascending: false });
    automations = (automationRows || []) as Automation[];
  }

  return (
    <main className="wrap dashboard">
      <header className="dashHeader">
        <div>
          <span className="badge">Social AI Engine</span>
          <h1>Central Social AI</h1>
          <p className="muted">Workspaces, canais sociais, automações e leads num único painel.</p>
        </div>
        <form action="/api/auth/logout" method="post"><button className="button">Sair</button></form>
      </header>

      <section className="card workspaceCreator">
        <div><h2>Criar empresa / workspace</h2><p className="muted">Cada cliente fica isolado por organização.</p></div>
        <form className="inlineForm" action="/api/workspaces" method="post">
          <input name="name" placeholder="Ex.: MyPoupar" minLength={2} required />
          <button className="button primary">Criar workspace</button>
        </form>
      </section>

      <section className="workspaceGrid">
        {workspaces.length === 0 && (
          <article className="card empty"><h2>Começa por criar a primeira empresa.</h2><p className="muted">Depois aparece aqui o botão para ligar o Instagram profissional.</p></article>
        )}
        {workspaces.map((workspace) => {
          const accounts = socialAccounts.filter((account) => account.organization_id === workspace.id);
          const workspaceAutomations = automations.filter((automation) => automation.organization_id === workspace.id);
          return (
            <article className="card workspace" key={workspace.id}>
              <div className="workspaceTitle">
                <div><h2>{workspace.name}</h2><small className="muted">{workspace.slug}</small></div>
                <span className="pill">{accounts.length} canais · {workspaceAutomations.length} automações</span>
              </div>

              <div className="channelList">
                {accounts.length === 0 && <div className="channel"><span className="muted">Ainda sem Instagram ligado.</span></div>}
                {accounts.map((account) => (
                  <div className="channel" key={account.id}>
                    <strong>Instagram · {account.display_name || "Conta ligada"}</strong>
                    <span className="muted">{account.status}</span>
                  </div>
                ))}
              </div>

              <a className="button primary full" href={`/api/meta/oauth/start?organization=${workspace.id}`}>Ligar Instagram</a>

              <div className="divider" />
              <h3>Comentário → mensagem privada</h3>
              <p className="muted small">Quando alguém comentar uma palavra-chave, enviamos uma única resposta privada oficial do Instagram.</p>
              <form className="automationForm" action="/api/automations" method="post">
                <input type="hidden" name="organization_id" value={workspace.id} />
                <label>Conta Instagram
                  <select name="social_account_id" defaultValue="">
                    <option value="">Todas as contas deste workspace</option>
                    {accounts.map((account) => <option key={account.id} value={account.id}>{account.display_name || "Instagram"}</option>)}
                  </select>
                </label>
                <label>Palavras-chave
                  <input name="keywords" placeholder="POUPAR, PREÇO, MEO" required />
                </label>
                <label>Mensagem privada
                  <textarea name="reply" rows={4} placeholder="Olá 👋 Posso ajudar-te a verificar a melhor opção. Quanto pagas atualmente?" required />
                </label>
                <button className="button primary" disabled={accounts.length === 0}>Criar automação</button>
              </form>

              {workspaceAutomations.length > 0 && (
                <div className="automationList">
                  <h3>Automações ativas</h3>
                  {workspaceAutomations.map((automation) => (
                    <div className="automation" key={automation.id}>
                      <div><strong>{automation.name}</strong><div className="muted small">{(automation.trigger_config.keywords || []).join(" · ")}</div></div>
                      <span className={`pill ${automation.enabled ? "live" : ""}`}>{automation.enabled ? "Ativa" : "Pausada"}</span>
                    </div>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}
