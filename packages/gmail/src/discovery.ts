import type { DiscoveredMessageRef, GmailConnector } from "./types.js";

export type ScanBoundary = {
  kind: "new_only" | "historical";
  maxDays?: number;
  maxMessages?: number;
  startedAt?: string;
};

export type DiscoveryResult = {
  messages: DiscoveredMessageRef[];
  newHistoryId?: string;
  coverageGap?: boolean;
  pages: number;
};

const EXCLUDED_LABELS = new Set(["SENT", "DRAFT", "SPAM", "TRASH"]);

function isExcluded(labelIds: string[]): boolean {
  return labelIds.some((l) => EXCLUDED_LABELS.has(l.toUpperCase()));
}

/**
 * Paginated initial / historical discovery. Caller persists IDs before advancing cursor.
 */
export async function discoverHistorical(
  connector: GmailConnector,
  boundary: ScanBoundary,
): Promise<DiscoveryResult> {
  const maxMessages = boundary.maxMessages ?? 2000;
  const maxDays = boundary.maxDays ?? 30;
  const afterEpochSeconds = Math.floor((Date.now() - maxDays * 86_400_000) / 1000);
  const messages: DiscoveredMessageRef[] = [];
  let pageToken: string | undefined;
  let pages = 0;

  while (messages.length < maxMessages) {
    const page = await connector.listMessages({
      pageToken,
      maxResults: Math.min(100, maxMessages - messages.length),
      afterEpochSeconds: boundary.kind === "historical" ? afterEpochSeconds : undefined,
    });
    pages += 1;
    for (const m of page.messages) {
      if (isExcluded(m.labelIds)) continue;
      messages.push(m);
      if (messages.length >= maxMessages) break;
    }
    pageToken = page.nextPageToken;
    if (!pageToken) break;
  }

  const profile = await connector.getProfile();
  return {
    messages,
    newHistoryId: profile.historyId,
    pages,
  };
}

/**
 * Incremental history sync. On expired cursor, caller should run bounded rescan.
 */
export async function discoverIncremental(
  connector: GmailConnector,
  startHistoryId: string,
): Promise<DiscoveryResult> {
  const messages: DiscoveredMessageRef[] = [];
  let pageToken: string | undefined;
  let pages = 0;
  let historyId = startHistoryId;
  let coverageGap = false;

  while (true) {
    const page = await connector.listHistory({
      startHistoryId,
      pageToken,
    });
    pages += 1;
    if (page.expired) {
      coverageGap = true;
      break;
    }
    for (const m of page.messages) {
      if (isExcluded(m.labelIds)) continue;
      messages.push(m);
    }
    historyId = page.historyId;
    pageToken = page.nextPageToken;
    if (!pageToken) break;
  }

  return { messages, newHistoryId: historyId, coverageGap, pages };
}

/** Deduplicate by Gmail message id while preserving order. */
export function dedupeMessageRefs(refs: DiscoveredMessageRef[]): DiscoveredMessageRef[] {
  const seen = new Set<string>();
  const out: DiscoveredMessageRef[] = [];
  for (const r of refs) {
    if (seen.has(r.gmailMessageId)) continue;
    seen.add(r.gmailMessageId);
    out.push(r);
  }
  return out;
}
