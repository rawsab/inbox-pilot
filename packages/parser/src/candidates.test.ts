import { describe, expect, it } from "vitest";
import { extractCandidates } from "./candidates.js";

describe("extractCandidates", () => {
  it("extracts role and company from application phrasing", () => {
    const c = extractCandidates({
      subject: "Application received",
      body: "Thank you for your application for Software Engineer at Acme Corp.",
    });
    expect(c.some((x) => x.field_type === "company" && x.normalized_value.includes("Acme"))).toBe(
      true,
    );
    expect(c.some((x) => x.field_type === "role" && x.normalized_value.includes("Software"))).toBe(
      true,
    );
  });

  it("does not treat ATS sender as employer", () => {
    const c = extractCandidates({
      subject: "Update",
      body: "Your application is under review.",
      senderDisplayName: "Greenhouse",
      senderDomain: "greenhouse.io",
    });
    expect(c.filter((x) => x.field_type === "company")).toHaveLength(0);
  });

  it("returns empty candidates when no pattern matches", () => {
    const c = extractCandidates({
      subject: "Hello",
      body: "Just checking in casually.",
    });
    expect(c).toHaveLength(0);
  });

  it("parses Greenhouse ATS template without treating Greenhouse as employer", () => {
    const c = extractCandidates({
      subject: "Thanks for applying",
      body: "Thanks for applying to RealEmployer for the Product Manager role.",
      senderDisplayName: "Greenhouse",
      senderDomain: "greenhouse.io",
    });
    expect(c.some((x) => x.normalized_value === "RealEmployer")).toBe(true);
    expect(c.some((x) => x.normalized_value === "Greenhouse")).toBe(false);
  });

  it("parses Lever ATS template", () => {
    const c = extractCandidates({
      subject: "Application submitted",
      body: "Your application for Data Analyst at RealEmployer was successfully submitted.",
      senderDomain: "lever.co",
      senderDisplayName: "Lever",
    });
    expect(c.some((x) => x.field_type === "company" && x.rule_id.includes("lever"))).toBe(
      true,
    );
  });
});

