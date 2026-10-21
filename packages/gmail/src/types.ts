export type DiscoveredMessageRef = {
  gmailMessageId: string;
  gmailThreadId: string;
  internalDate: Date;
  labelIds: string[];
};

export type FetchedMessage = {
  gmailMessageId: string;
  gmailThreadId: string;
  internalDate: Date;
  subject: string;
  from: string;
  fromName?: string;
  labelIds: string[];
  /** Raw RFC822 or constructed MIME for the parser. */
  rawMime: Buffer;
  snippet?: string;
};

export type ListPage = {
  messages: DiscoveredMessageRef[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

export type HistoryPage = {
  messages: DiscoveredMessageRef[];
  historyId: string;
  nextPageToken?: string;
  /** True when Google returns 404 for expired history. */
  expired?: boolean;
};

export type Profile = {
  emailAddress: string;
  historyId: string;
  messagesTotal?: number;
};

export type GmailLabel = {
  id: string;
  name: string;
};

/**
 * Gmail connector surface used by discovery and (later) label writes.
 * Dry-run paths must never call mutating methods.
 */
export interface GmailConnector {
  getProfile(): Promise<Profile>;
  listMessages(opts: {
    pageToken?: string;
    maxResults?: number;
    q?: string;
    afterEpochSeconds?: number;
  }): Promise<ListPage>;
  listHistory(opts: {
    startHistoryId: string;
    pageToken?: string;
  }): Promise<HistoryPage>;
  getMessage(gmailMessageId: string): Promise<FetchedMessage | null>;
  listLabels(): Promise<GmailLabel[]>;
}
