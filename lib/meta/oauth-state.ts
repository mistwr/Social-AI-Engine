import crypto from "node:crypto";

export type MetaOAuthState = {
  userId: string;
  organizationId: string;
  exp: number;
  nonce: string;
};

function secret() {
  const value = process.env.META_OAUTH_STATE_SECRET || process.env.META_APP_SECRET;
  if (!value) throw new Error("META_OAUTH_STATE_SECRET or META_APP_SECRET is required");
  return value;
}

export function signMetaOAuthState(input: Omit<MetaOAuthState, "exp" | "nonce">) {
  const payload: MetaOAuthState = {
    ...input,
    exp: Math.floor(Date.now() / 1000) + 10 * 60,
    nonce: crypto.randomBytes(16).toString("hex"),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyMetaOAuthState(state: string): MetaOAuthState {
  const [body, signature] = state.split(".");
  if (!body || !signature) throw new Error("Invalid OAuth state");
  const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error("Invalid OAuth state signature");
  const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as MetaOAuthState;
  if (parsed.exp < Math.floor(Date.now() / 1000)) throw new Error("OAuth state expired");
  return parsed;
}
