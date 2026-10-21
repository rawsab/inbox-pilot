import { OAuth2Client } from "google-auth-library";
import { createOAuthClient, type OAuthConfig } from "./oauth.js";
import { RealGmailClient } from "./real-client.js";
import { SyntheticMailbox } from "./synthetic-mailbox.js";
import type { GmailConnector } from "./types.js";

export type GmailMode = "mock" | "live";

let sharedMock: SyntheticMailbox | null = null;

export function getSharedMockMailbox(): SyntheticMailbox {
  if (!sharedMock) {
    sharedMock = new SyntheticMailbox(
      [
        {
          id: "seed",
          subject: "Application received",
          body: "Thank you for your application for Engineer at SeedCo. We received your application.",
          from: "careers@seedco.example",
        },
      ],
      { replicateTo: 1 },
    );
  }
  return sharedMock;
}

export function setSharedMockMailbox(mailbox: SyntheticMailbox) {
  sharedMock = mailbox;
}

export function createGmailConnector(opts: {
  mode: GmailMode;
  refreshToken?: string;
  oauth?: OAuthConfig;
}): GmailConnector {
  if (opts.mode === "mock" || !opts.refreshToken || !opts.oauth) {
    return getSharedMockMailbox();
  }
  const client = createOAuthClient(opts.oauth);
  client.setCredentials({ refresh_token: opts.refreshToken });
  return new RealGmailClient(client as OAuth2Client);
}
