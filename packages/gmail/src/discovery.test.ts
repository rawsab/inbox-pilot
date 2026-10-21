import { describe, expect, it } from "vitest";
import { dedupeMessageRefs, discoverHistorical } from "./discovery.js";
import { SyntheticMailbox } from "./synthetic-mailbox.js";

describe("discovery", () => {
  it("paginates a 200-message mailbox without duplicates", async () => {
    const seeds = Array.from({ length: 10 }, (_, i) => ({
      id: `s${i}`,
      subject: `Subj ${i}`,
      body: `Body ${i}`,
      from: `a${i}@ex.test`,
    }));
    const box = new SyntheticMailbox(seeds, { replicateTo: 200 });
    const result = await discoverHistorical(box, {
      kind: "historical",
      maxDays: 30,
      maxMessages: 200,
    });
    expect(result.messages).toHaveLength(200);
    expect(result.pages).toBeGreaterThan(1);
    const ids = result.messages.map((m) => m.gmailMessageId);
    expect(new Set(ids).size).toBe(200);
  });

  it("dedupes overlapping refs", () => {
    const a = {
      gmailMessageId: "m1",
      gmailThreadId: "t1",
      internalDate: new Date(),
      labelIds: ["INBOX"],
    };
    expect(dedupeMessageRefs([a, a, { ...a, gmailMessageId: "m2" }])).toHaveLength(2);
  });

  it("recovers messages injected after boundary via history", async () => {
    const box = new SyntheticMailbox(
      [{ id: "base", subject: "Hi", body: "Hello", from: "a@b.test" }],
      { replicateTo: 5 },
    );
    const profile = await box.getProfile();
    box.injectNew({
      id: "late",
      subject: "Late",
      body: "Arrived during scan",
      from: "c@d.test",
    });
    const { discoverIncremental } = await import("./discovery.js");
    const inc = await discoverIncremental(box, profile.historyId);
    expect(inc.messages.some((m) => m.gmailMessageId.includes("late"))).toBe(true);
  });
});
