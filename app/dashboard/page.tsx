import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Workspace = { id: string; name: string; slug: string };
type SocialAccount = { id: string; organization_id: string; provider: string; display_name: string | null; status: string };

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id,role")
    .eq("user_id", user.id);

  const ids = (memberships || []).map((item) => item.organization_id);
  let workspaces: Workspace[] = [];
  let socialAccounts: SocialAccount[] = [];

  if (ids.length) {
    const { data: orgs } = await supabase.from("organizations").select("id,name,slug").in("id", ids).order("created_at");
    workspaces = (orgs || []) as Workspace[];
    const { data: accounts } = await supabase
      .from("social_accounts")
      .select("id,organization_id,provider,display_name,status")
      .in("organization_id", ids);
    socialAccounts = (accounts || []) as SocialAccount[];
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
          return (
            <article className="card workspace" key={workspace.id}>
              <div className="workspaceTitle"><div><h2>{workspace.name}</h2><small className="muted">{workspace.slug}</small></div><span className="pill">{accounts.length} canais</span></div>
              <div className="channelList">
                {accounts.map((account) => (
                  <div className="channel" key={account.id}>
                    <strong>Instagram · {account.display_name || "Conta ligada"}</strong>
                    <span className="muted">{account.status}</span>
                  </div>
                ))}
              </div>
              <a className="button primary full" href={`/api/meta/oauth/start?organization=${workspace.id}`}>Ligar Instagram</a>
            </article>
          );
        })}
      </section>
    </main>
  );
}
