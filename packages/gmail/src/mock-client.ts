import {
  ActionGatewayRequest,
  AllowedGmailMethod,
  LabelDelta,
  evaluateActionGateway,
} from "@inbox-pilot/contracts";

export type MockMessage = {
  id: string;
  threadId: string;
  internalDate: string;
  subject: string;
  from: string;
  labelIds: string[];
  body: string;
};

/**
 * In-memory Gmail stand-in. Mutations only succeed through the action gateway.
 */
export class MockGmailClient {
  private readonly messages = new Map<string, MockMessage>();
  private readonly labels = new Map<string, { id: string; name: string }>();
  private mutations = 0;

  seed(messages: MockMessage[]) {
    for (const m of messages) {
      this.messages.set(m.id, { ...m, labelIds: [...m.labelIds] });
    }
  }

  getMutationCount() {
    return this.mutations;
  }

  listMessages(): MockMessage[] {
    return [...this.messages.values()].map((m) => ({
      ...m,
      labelIds: [...m.labelIds],
    }));
  }

  getMessage(id: string): MockMessage | undefined {
    const m = this.messages.get(id);
    return m ? { ...m, labelIds: [...m.labelIds] } : undefined;
  }

  createLabel(name: string): { id: string; name: string } {
    const id = `Label_${name.replace(/\W+/g, "_")}`;
    const label = { id, name };
    this.labels.set(id, label);
    this.mutations += 1;
    return label;
  }

  /**
   * Apply a label delta only if the gateway allows it.
   * Dry-run callers should never invoke this.
   */
  modifyMessage(
    accountId: string,
    messageId: string,
    delta: LabelDelta,
    allowlistedLabelIds: ReadonlySet<string>,
  ): { ok: true; labels: string[] } | { ok: false; reason: string } {
    const request: ActionGatewayRequest = {
      method: AllowedGmailMethod.MESSAGES_MODIFY,
      accountId,
      messageId,
      delta,
    };
    const gate = evaluateActionGateway(request, allowlistedLabelIds);
    if (!gate.ok) {
      return { ok: false, reason: gate.reason };
    }

    const msg = this.messages.get(messageId);
    if (!msg) {
      return { ok: false, reason: "message_not_found" };
    }

    const set = new Set(msg.labelIds);
    for (const id of delta.removeLabelIds) set.delete(id);
    for (const id of delta.addLabelIds) set.add(id);
    msg.labelIds = [...set];
    this.mutations += 1;
    return { ok: true, labels: msg.labelIds };
  }
}
