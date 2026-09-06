type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const checkEmail = params["check-email"] === "1";

  return (
    <main className="wrap authWrap">
      <section className="authCard">
        <span className="badge">Social AI Engine</span>
        <h1>Entrar no motor social</h1>
        <p className="muted">Cada empresa fica num workspace isolado e liga as suas próprias contas Meta.</p>
        {error && <div className="alert error">{error === "invalid" ? "Confirma o email e usa uma password com pelo menos 8 caracteres." : error}</div>}
        {checkEmail && <div className="alert">Confirma o email para ativar a conta e depois volta aqui.</div>}

        <form className="stack" action="/api/auth/password" method="post">
          <label>Email<input name="email" type="email" autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" minLength={8} required /></label>
          <div className="actions">
            <button className="button primary" name="mode" value="login">Entrar</button>
            <button className="button" name="mode" value="signup">Criar conta</button>
          </div>
        </form>
      </section>
    </main>
  );
}
