const modules = [
  ["Inbox IA", "DMs, comentários e respostas num único sítio."],
  ["Automações", "Palavras-chave, comentário → DM e follow-ups."],
  ["Conteúdo", "Criação e agendamento de posts e campanhas."],
  ["Leads", "Qualificação e envio para SD Dialer, Parcendi ou webhook."],
  ["Multiempresa", "Workspaces isolados por organização com RLS."],
  ["Analytics", "Mensagens, leads, conversões e desempenho por conta."],
];

export default function Home() {
  return (
    <main className="wrap">
      <section className="hero">
        <span className="badge">Social AI Engine · SaaS multiempresa</span>
        <h1>Transforma redes sociais em leads.</h1>
        <p>
          Motor independente para Instagram/Meta com automações, IA, publicação,
          captação de leads e integrações CRM. Preparado para Netlify + Supabase.
        </p>
        <div className="status">V0.1: base criada · próximo passo: ligar Meta OAuth, webhook e Supabase.</div>
      </section>
      <section className="grid">
        {modules.map(([title, text]) => (
          <article className="card" key={title}>
            <h3>{title}</h3>
            <p className="muted">{text}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
