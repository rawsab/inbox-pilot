import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type {
  DiscoveredMessageRef,
  FetchedMessage,
  GmailConnector,
  GmailLabel,
  HistoryPage,
  ListPage,
  Profile,
} from "./types.js";

export type SyntheticSeed = {
  id: string;
  subject: string;
  body: string;
  from: string;
  from_name?: string;
};

/**
 * In-memory mailbox for Stage 2 dry-run discovery tests.
 * Supports pagination and a fake history cursor.
 */
export class SyntheticMailbox implements GmailConnector {
  private readonly messages: FetchedMessage[] = [];
  private historyId = 1000;
  private readonly addedSince = new Map<number, DiscoveredMessageRef[]>();
  mutations = 0;

  constructor(seeds: SyntheticSeed[], opts?: { replicateTo?: number }) {
    const target = opts?.replicateTo ?? seeds.length;
    for (let i = 0; i < target; i++) {
      const seed = seeds[i % seeds.length]!;
      const suffix = i < seeds.length ? "" : `_r${i}`;
      const id = `synth_${seed.id}${suffix}`;
      const raw = buildMime({
        from: seed.from_name ? `${seed.from_name} <${seed.from}>` : seed.from,
        subject: seed.subject,
        body: seed.body,
        messageId: id,
      });
      this.messages.push({
        gmailMessageId: id,
        gmailThreadId: `thread_${seed.id}${suffix}`,
        internalDate: new Date(Date.now() - (target - i) * 60_000),
        subject: seed.subject,
        from: seed.from,
        fromName: seed.from_name,
        labelIds: ["INBOX", "UNREAD"],
        rawMime: raw,
      });
    }
  }

  static fromFixtureDir(dir: string, replicateTo = 50): SyntheticMailbox {
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .sort();
    const seeds = files.map(
      (f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as SyntheticSeed,
    );
    return new SyntheticMailbox(seeds, { replicateTo });
  }

  /** Simulate a message arriving after the initial boundary. */
  injectNew(seed: SyntheticSeed): DiscoveredMessageRef {
    this.historyId += 1;
    const id = `synth_live_${seed.id}_${this.historyId}`;
    const raw = buildMime({
      from: seed.from,
      subject: seed.subject,
      body: seed.body,
      messageId: id,
    });
    const msg: FetchedMessage = {
      gmailMessageId: id,
      gmailThreadId: `thread_live_${seed.id}`,
      internalDate: new Date(),
      subject: seed.subject,
      from: seed.from,
      fromName: seed.from_name,
      labelIds: ["INBOX"],
      rawMime: raw,
    };
    this.messages.push(msg);
    const ref: DiscoveredMessageRef = {
      gmailMessageId: id,
      gmailThreadId: msg.gmailThreadId,
      internalDate: msg.internalDate,
      labelIds: msg.labelIds,
    };
    const bucket = this.addedSince.get(this.historyId) ?? [];
    bucket.push(ref);
    this.addedSince.set(this.historyId, bucket);
    return ref;
  }

  getMutationCount() {
    return this.mutations;
  }

  async getProfile(): Promise<Profile> {
    return {
      emailAddress: "synthetic@localhost.test",
      historyId: String(this.historyId),
      messagesTotal: this.messages.length,
    };
  }

  async listMessages(opts: {
    pageToken?: string;
    maxResults?: number;
    q?: string;
    afterEpochSeconds?: number;
  }): Promise<ListPage> {
    const pageSize = opts.maxResults ?? 50;
    const start = opts.pageToken ? Number(opts.pageToken) : 0;
    let list = [...this.messages];
    if (opts.afterEpochSeconds) {
      const afterMs = opts.afterEpochSeconds * 1000;
      list = list.filter((m) => m.internalDate.getTime() >= afterMs);
    }
    // Exclude spam/trash/sent/drafts by construction.
    const slice = list.slice(start, start + pageSize);
    const next = start + pageSize < list.length ? String(start + pageSize) : undefined;
    return {
      messages: slice.map((m) => ({
        gmailMessageId: m.gmailMessageId,
        gmailThreadId: m.gmailThreadId,
        internalDate: m.internalDate,
        labelIds: m.labelIds,
      })),
      nextPageToken: next,
      resultSizeEstimate: list.length,
    };
  }

  async listHistory(opts: {
    startHistoryId: string;
    pageToken?: string;
  }): Promise<HistoryPage> {
    const start = Number(opts.startHistoryId);
    if (!Number.isFinite(start) || start < 0) {
      return { messages: [], historyId: String(this.historyId), expired: true };
    }
    // Simulate expiration for very old cursors.
    if (start < this.historyId - 5000) {
      return { messages: [], historyId: String(this.historyId), expired: true };
    }
    const messages: DiscoveredMessageRef[] = [];
    for (const [hid, refs] of this.addedSince) {
      if (hid > start) messages.push(...refs);
    }
    return {
      messages,
      historyId: String(this.historyId),
    };
  }

  async getMessage(gmailMessageId: string): Promise<FetchedMessage | null> {
    return this.messages.find((m) => m.gmailMessageId === gmailMessageId) ?? null;
  }

  async listLabels(): Promise<GmailLabel[]> {
    return [
      { id: "INBOX", name: "INBOX" },
      { id: "UNREAD", name: "UNREAD" },
    ];
  }
}

function buildMime(opts: {
  from: string;
  subject: string;
  body: string;
  messageId: string;
}): Buffer {
  const text = [
    `From: ${opts.from}`,
    `To: owner@localhost.test`,
    `Subject: ${opts.subject}`,
    `Message-ID: <${opts.messageId}@synthetic.local>`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    opts.body,
  ].join("\r\n");
  return Buffer.from(text, "utf8");
}
