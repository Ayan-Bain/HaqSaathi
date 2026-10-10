import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { POST } from "@/app/api/discovery/match/route";
import { validateDiscoveryReferences } from "@/lib/discovery-agent";
import type { MatchResult } from "@/lib/types";

const matcherOutput: MatchResult[] = [
  { scheme_id: "assam-orunodoi", tier: "verified", relevance: "likely", reasons: ["available in Assam"] },
  { scheme_id: "pm-kisan", tier: "verified", relevance: "likely", reasons: ["central scheme — available nationwide"] },
];

function validAgentOutput() {
  return {
    summary: "A few schemes worth checking.",
    matches: [
      {
        scheme_id: "assam-orunodoi",
        tier: "verified" as const,
        relevance: "likely" as const,
        reasons: ["available in Assam"],
        note: "You may be able to apply.",
      },
    ],
    disclaimer:
      "This is a starting point, not an eligibility decision. HaqSaathi is an independent information tool, not a government service. Confirm on the official portal before you apply.",
  };
}

describe("Stage 7 — discovery allow-list (validateDiscoveryReferences)", () => {
  it("accepts a valid, in-scope output", () => {
    expect(validateDiscoveryReferences(validAgentOutput(), matcherOutput)).toBe(true);
  });

  it("rejects an output naming a scheme the matcher did not return", () => {
    const out = validAgentOutput();
    out.matches[0].scheme_id = "invented-scheme";
    expect(validateDiscoveryReferences(out, matcherOutput)).toBe(false);
  });

  it("rejects forbidden language in a note", () => {
    const out = validAgentOutput();
    out.matches[0].note = "You qualify for this scheme.";
    expect(validateDiscoveryReferences(out, matcherOutput)).toBe(false);
  });

  it("rejects forbidden language hidden in reasons", () => {
    const out = validAgentOutput();
    out.matches[0].reasons = ["you qualify automatically"];
    expect(validateDiscoveryReferences(out, matcherOutput)).toBe(false);
  });

  it("rejects a missing or weakened disclaimer", () => {
    const out = validAgentOutput();
    out.disclaimer = "Here are some schemes.";
    expect(validateDiscoveryReferences(out, matcherOutput)).toBe(false);
  });
});

describe("Stage 7 — POST /api/discovery/match (deterministic path)", () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    process.env = { ...originalEnv, FORCE_FALLBACK: "1" };
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function req(body: unknown) {
    return new Request("http://localhost:3000/api/discovery/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns a deterministic shortlist for a well-formed profile, verified first", async () => {
    const res = await POST(req({ state: "Assam", benefitInterest: ["income-support"] }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.generatedBy).toBe("deterministic");
    expect(Array.isArray(json.matches)).toBe(true);
    expect(json.matches.length).toBeGreaterThan(0);
    expect(json.matches[0].tier).toBe("verified");
    // No result may assert eligibility anywhere in its reasons.
    for (const match of json.matches) {
      for (const reason of match.reasons) {
        expect(reason.toLowerCase()).not.toContain("eligible");
        expect(reason.toLowerCase()).not.toContain("qualify");
      }
    }
  });

  it("rejects a 12-digit PII value with 400", async () => {
    const res = await POST(req({ state: "123456789012" }));
    expect(res.status).toBe(400);
  });

  it("rejects a payload over the size cap with 413", async () => {
    const res = await POST(req({ benefitInterest: Array(5000).fill("xxxx") }));
    expect(res.status).toBe(413);
  });
});
