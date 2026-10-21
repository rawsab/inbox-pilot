import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import type {
  DiscoveredMessageRef,
  FetchedMessage,
  GmailConnector,
  GmailLabel,
  HistoryPage,
  ListPage,
  Profile,
} from "./types.js";

function parseInternalDate(ms: string | null | undefined): Date {
  const n = Number(ms ?? Date.now());
  return new Date(Number.isFinite(n) ? n : Date.now());
}

export class RealGmailClient implements GmailConnector {
  private readonly gmail;

  constructor(oauth: OAuth2Client) {
    this.gmail = google.gmail({ version: "v1", auth: oauth });
  }

  async getProfile(): Promise<Profile> {
    const res = await this.gmail.users.getProfile({ userId: "me" });
    return {
      emailAddress: res.data.emailAddress ?? "",
      historyId: String(res.data.historyId ?? ""),
      messagesTotal: res.data.messagesTotal ?? undefined,
    };
  }

  async listMessages(opts: {
    pageToken?: string;
    maxResults?: number;
    q?: string;
    afterEpochSeconds?: number;
  }): Promise<ListPage> {
    const qParts = [
      opts.q,
      "-in:sent -in:drafts -in:spam -in:trash",
      opts.afterEpochSeconds ? `after:${opts.afterEpochSeconds}` : undefined,
    ].filter(Boolean);
    const res = await this.gmail.users.messages.list({
      userId: "me",
      maxResults: opts.maxResults ?? 100,
      pageToken: opts.pageToken,
      q: qParts.join(" "),
    });
    const refs: DiscoveredMessageRef[] = [];
    for (const m of res.data.messages ?? []) {
      if (!m.id) continue;
      // List response lacks thread/date; fetch metadata lightly via get with format=minimal later.
      refs.push({
        gmailMessageId: m.id,
        gmailThreadId: m.threadId ?? m.id,
        internalDate: new Date(),
        labelIds: [],
      });
    }
    // Enrich dates/threads for discovered ids (batched lightly).
    const enriched: DiscoveredMessageRef[] = [];
    for (const ref of refs) {
      const meta = await this.gmail.users.messages.get({
        userId: "me",
        id: ref.gmailMessageId,
        format: "minimal",
      });
      enriched.push({
        gmailMessageId: ref.gmailMessageId,
        gmailThreadId: meta.data.threadId ?? ref.gmailThreadId,
        internalDate: parseInternalDate(meta.data.internalDate ?? undefined),
        labelIds: meta.data.labelIds ?? [],
      });
    }
    return {
      messages: enriched,
      nextPageToken: res.data.nextPageToken ?? undefined,
      resultSizeEstimate: res.data.resultSizeEstimate ?? undefined,
    };
  }

  async listHistory(opts: {
    startHistoryId: string;
    pageToken?: string;
  }): Promise<HistoryPage> {
    try {
      const res = await this.gmail.users.history.list({
        userId: "me",
        startHistoryId: opts.startHistoryId,
        pageToken: opts.pageToken,
        historyTypes: ["messageAdded"],
      });
      const messages: DiscoveredMessageRef[] = [];
      for (const h of res.data.history ?? []) {
        for (const added of h.messagesAdded ?? []) {
          const m = added.message;
          if (!m?.id) continue;
          messages.push({
            gmailMessageId: m.id,
            gmailThreadId: m.threadId ?? m.id,
            internalDate: parseInternalDate(m.internalDate ?? undefined),
            labelIds: m.labelIds ?? [],
          });
        }
      }
      return {
        messages,
        historyId: String(res.data.historyId ?? opts.startHistoryId),
        nextPageToken: res.data.nextPageToken ?? undefined,
      };
    } catch (err: unknown) {
      const status = (err as { code?: number }).code;
      if (status === 404) {
        return {
          messages: [],
          historyId: opts.startHistoryId,
          expired: true,
        };
      }
      throw err;
    }
  }

  async getMessage(gmailMessageId: string): Promise<FetchedMessage | null> {
    try {
      const res = await this.gmail.users.messages.get({
        userId: "me",
        id: gmailMessageId,
        format: "raw",
      });
      if (!res.data.raw) return null;
      const rawMime = Buffer.from(res.data.raw, "base64url");
      const headers = res.data.payload?.headers ?? [];
      const subject =
        headers.find((h) => h.name?.toLowerCase() === "subject")?.value ?? "";
      const from =
        headers.find((h) => h.name?.toLowerCase() === "from")?.value ?? "";
      const fromMatch = /^(?:"?([^"]*)"?\s)?<?([^>]+@[^>]+)>?$/.exec(from);
      return {
        gmailMessageId,
        gmailThreadId: res.data.threadId ?? gmailMessageId,
        internalDate: parseInternalDate(res.data.internalDate ?? undefined),
        subject,
        from: fromMatch?.[2] ?? from,
        fromName: fromMatch?.[1]?.trim() || undefined,
        labelIds: res.data.labelIds ?? [],
        rawMime,
        snippet: res.data.snippet ?? undefined,
      };
    } catch (err: unknown) {
      const status = (err as { code?: number }).code;
      if (status === 404) return null;
      throw err;
    }
  }

  async listLabels(): Promise<GmailLabel[]> {
    const res = await this.gmail.users.labels.list({ userId: "me" });
    return (res.data.labels ?? [])
      .filter((l) => l.id && l.name)
      .map((l) => ({ id: l.id!, name: l.name! }));
  }
}
