const modules = [
  ["Inbox IA", "DMs, comentários e respostas num único sítio."],
  ["Automações", "Palavras-chave, comentário → DM e follow-ups."],
  ["Conteúdo", "Criação e agendamento de posts e campanhas."],
  ["Leads", "Qualificação e envio para SD Dialer, PARCENDi ou webhook."],
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
          Liga contas Instagram profissionais, automatiza comentários e mensagens,
          qualifica interessados com IA e envia os leads para o CRM certo.
        </p>
        <div className="heroActions">
          <a className="button primary" href="/login">Começar</a>
          <a className="button" href="/dashboard">Abrir dashboard</a>
        </div>
        <div className="status">V0.2: autenticação + multiempresa + Instagram OAuth + token cifrado + webhook oficial.</div>
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
