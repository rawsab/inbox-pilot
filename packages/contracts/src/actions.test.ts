import { describe, expect, it } from "vitest";
import {
  AllowedGmailMethod,
  evaluateActionGateway,
} from "./actions.js";

describe("evaluateActionGateway", () => {
  const labels = new Set(["Label_App", "Label_Review"]);

  it("accepts allowlisted modify with app labels", () => {
    const result = evaluateActionGateway(
      {
        method: AllowedGmailMethod.MESSAGES_MODIFY,
        accountId: "acct",
        messageId: "msg",
        delta: { addLabelIds: ["Label_App"], removeLabelIds: [] },
      },
      labels,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects methods outside the allowlist", () => {
    const result = evaluateActionGateway(
      {
        method: "gmail.users.messages.delete",
        accountId: "acct",
        messageId: "msg",
      },
      labels,
    );
    expect(result).toEqual({ ok: false, reason: "method_not_allowlisted" });
  });

  it("rejects archive-style methods", () => {
    for (const method of [
      "gmail.users.messages.trash",
      "gmail.users.messages.send",
      "gmail.users.messages.batchModify",
      "gmail.users.threads.modify",
    ]) {
      const result = evaluateActionGateway({ method, accountId: "acct" }, labels);
      expect(result.ok).toBe(false);
    }
  });

  it("rejects removing INBOX or UNREAD", () => {
    const result = evaluateActionGateway(
      {
        method: AllowedGmailMethod.MESSAGES_MODIFY,
        accountId: "acct",
        delta: { addLabelIds: [], removeLabelIds: ["INBOX"] },
      },
      labels,
    );
    expect(result).toEqual({ ok: false, reason: "protected_label" });
  });

  it("rejects non-app label ids on modify", () => {
    const result = evaluateActionGateway(
      {
        method: AllowedGmailMethod.MESSAGES_MODIFY,
        accountId: "acct",
        delta: { addLabelIds: ["UserLabel"], removeLabelIds: [] },
      },
      labels,
    );
    expect(result).toEqual({ ok: false, reason: "label_not_allowlisted" });
  });
});
