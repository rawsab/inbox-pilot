import { describe, expect, it } from "vitest";
import { MockGmailClient } from "./mock-client.js";

describe("MockGmailClient", () => {
  it("rejects delete-style methods via gateway on modify of protected labels", () => {
    const client = new MockGmailClient();
    client.seed([
      {
        id: "m1",
        threadId: "t1",
        internalDate: new Date().toISOString(),
        subject: "Hi",
        from: "a@b.test",
        labelIds: ["INBOX", "UNREAD"],
        body: "hello",
      },
    ]);

    const result = client.modifyMessage(
      "acct",
      "m1",
      { addLabelIds: [], removeLabelIds: ["INBOX"] },
      new Set(["Label_App"]),
    );
    expect(result.ok).toBe(false);
    expect(client.getMutationCount()).toBe(0);
  });

  it("adds allowlisted labels", () => {
    const client = new MockGmailClient();
    client.seed([
      {
        id: "m1",
        threadId: "t1",
        internalDate: new Date().toISOString(),
        subject: "Hi",
        from: "a@b.test",
        labelIds: ["INBOX"],
        body: "hello",
      },
    ]);
    const labels = new Set(["Label_App"]);
    const result = client.modifyMessage(
      "acct",
      "m1",
      { addLabelIds: ["Label_App"], removeLabelIds: [] },
      labels,
    );
    expect(result.ok).toBe(true);
    expect(client.getMessage("m1")?.labelIds).toContain("Label_App");
    expect(client.getMessage("m1")?.labelIds).toContain("INBOX");
  });
});
