export function env() {
  return {
    databaseUrl:
      process.env.DATABASE_URL ?? "postgres://inbox:inbox@localhost:5432/inbox_pilot",
    port: Number(process.env.PORT ?? 3000),
    host: process.env.HOST ?? "0.0.0.0",
    schedulerToken: process.env.SCHEDULER_BEARER_TOKEN ?? "",
    ownerPassword: process.env.OWNER_PASSWORD ?? "local-dev-only-change-me",
    tokenEncryptionKey:
      process.env.TOKEN_ENCRYPTION_KEY ??
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    sessionSecret: process.env.SESSION_SECRET ?? "local-dev-session-secret-change-me",
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    googleRedirectUri:
      process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3000/oauth/gmail/callback",
    gmailMode: (process.env.GMAIL_MODE === "live" ? "live" : "mock") as "mock" | "live",
    realMailToJev: process.env.REAL_MAIL_TO_JEV_ENABLED === "true",
  };
}
