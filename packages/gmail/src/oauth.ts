import { createHash, randomBytes } from "node:crypto";
import { OAuth2Client } from "google-auth-library";

export const GMAIL_MODIFY_SCOPE = "https://www.googleapis.com/auth/gmail.modify";

export type OAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function createOAuthClient(cfg: OAuthConfig): OAuth2Client {
  return new OAuth2Client(cfg.clientId, cfg.clientSecret, cfg.redirectUri);
}

export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildAuthUrl(
  client: OAuth2Client,
  opts: { state: string; codeChallenge: string },
): string {
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [GMAIL_MODIFY_SCOPE],
    state: opts.state,
    code_challenge: opts.codeChallenge,
    // google-auth-library types use a narrow enum; S256 is the correct PKCE method.
    code_challenge_method: "S256" as never,
  });
}

export async function exchangeCode(
  client: OAuth2Client,
  opts: { code: string; codeVerifier: string },
): Promise<{ refreshToken: string; accessToken?: string; email?: string }> {
  const { tokens } = await client.getToken({
    code: opts.code,
    codeVerifier: opts.codeVerifier,
  });
  if (!tokens.refresh_token) {
    throw new Error("oauth_missing_refresh_token");
  }
  client.setCredentials(tokens);
  const ticket = await client.request<{ email?: string }>({
    url: "https://www.googleapis.com/oauth2/v2/userinfo",
  });
  return {
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token ?? undefined,
    email: ticket.data.email,
  };
}

export function scopeExplanation(): string {
  return (
    "Inbox Pilot requests the Gmail modify scope so it can read messages and add " +
    "app-owned Recruiting/* labels. It will not archive, delete, send, mark read, " +
    "or remove INBOX/UNREAD. Backend allowlists further restrict every write."
  );
}
