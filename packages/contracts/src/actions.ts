import { z } from "zod";

/**
 * Gmail operations the action gateway may perform.
 * Everything else is rejected before any API call.
 */
export const AllowedGmailMethod = {
  MESSAGES_MODIFY: "gmail.users.messages.modify",
  LABELS_CREATE: "gmail.users.labels.create",
  LABELS_LIST: "gmail.users.labels.list",
  LABELS_GET: "gmail.users.labels.get",
  MESSAGES_GET: "gmail.users.messages.get",
  MESSAGES_LIST: "gmail.users.messages.list",
  HISTORY_LIST: "gmail.users.history.list",
  PROFILE_GET: "gmail.users.getProfile",
} as const;

export type AllowedGmailMethod = (typeof AllowedGmailMethod)[keyof typeof AllowedGmailMethod];

export const allowedGmailMethodSchema = z.nativeEnum(AllowedGmailMethod);

/** Methods that mutate mailbox state. Discovery/read methods are separate. */
export const MUTATING_GMAIL_METHODS: ReadonlySet<AllowedGmailMethod> = new Set([
  AllowedGmailMethod.MESSAGES_MODIFY,
  AllowedGmailMethod.LABELS_CREATE,
]);

/** System labels that must never be removed. */
export const PROTECTED_SYSTEM_LABELS = ["INBOX", "UNREAD"] as const;

export const DEFAULT_LABEL_NAMESPACE = "Recruiting" as const;

export const AppLabelKey = {
  APPLICATION: "application",
  REJECTION: "rejection",
  INTERVIEW: "interview",
  OFFER: "offer",
  UPDATE: "update",
  NEWSLETTER: "newsletter",
  REVIEW: "review",
} as const;

export type AppLabelKey = (typeof AppLabelKey)[keyof typeof AppLabelKey];

export const APP_LABEL_KEYS: readonly AppLabelKey[] = [
  AppLabelKey.APPLICATION,
  AppLabelKey.REJECTION,
  AppLabelKey.INTERVIEW,
  AppLabelKey.OFFER,
  AppLabelKey.UPDATE,
  AppLabelKey.NEWSLETTER,
  AppLabelKey.REVIEW,
];

export function namespaceLabelPath(namespace: string, leaf: string): string {
  return `${namespace}/${leaf}`;
}

export const LabelDeltaSchema = z.object({
  addLabelIds: z.array(z.string().min(1)).max(2),
  removeLabelIds: z.array(z.string().min(1)).max(2),
});

export type LabelDelta = z.infer<typeof LabelDeltaSchema>;

export type ActionGatewayRequest = {
  method: string;
  accountId: string;
  messageId?: string;
  labelIds?: string[];
  delta?: LabelDelta;
};

export type ActionGatewayResult =
  | { ok: true; method: AllowedGmailMethod }
  | { ok: false; reason: "method_not_allowlisted" | "label_not_allowlisted" | "protected_label" };

/**
 * Pure allowlist check. Rejects every method outside the label allowlist
 * and any attempt to touch protected system labels.
 */
export function evaluateActionGateway(
  request: ActionGatewayRequest,
  allowlistedLabelIds: ReadonlySet<string>,
): ActionGatewayResult {
  const methods = Object.values(AllowedGmailMethod) as string[];
  if (!methods.includes(request.method)) {
    return { ok: false, reason: "method_not_allowlisted" };
  }

  const method = request.method as AllowedGmailMethod;

  if (request.delta) {
    const all = [...request.delta.addLabelIds, ...request.delta.removeLabelIds];
    for (const id of all) {
      if ((PROTECTED_SYSTEM_LABELS as readonly string[]).includes(id)) {
        return { ok: false, reason: "protected_label" };
      }
      if (!allowlistedLabelIds.has(id)) {
        return { ok: false, reason: "label_not_allowlisted" };
      }
    }
  }

  if (request.labelIds) {
    for (const id of request.labelIds) {
      if ((PROTECTED_SYSTEM_LABELS as readonly string[]).includes(id)) {
        return { ok: false, reason: "protected_label" };
      }
      if (
        method === AllowedGmailMethod.MESSAGES_MODIFY &&
        !allowlistedLabelIds.has(id)
      ) {
        return { ok: false, reason: "label_not_allowlisted" };
      }
    }
  }

  return { ok: true, method };
}
