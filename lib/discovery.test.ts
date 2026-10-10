import { describe, it, expect } from "vitest";
import { matchSchemes, buildSchemesForMatch } from "./discovery";
import type { SchemeForMatch, DiscoveryProfile, EligibilityCriteria } from "./types";

function makeSchemes(): SchemeForMatch[] {
  const base = [
    {
      scheme_id: "assam-orunodoi",
      name: "Orunodoi Scheme",
      jurisdiction: "state" as const,
      state: "Assam",
      category: "income-support",
      verification_tier: "verified" as const,
    },
    {
      scheme_id: "pm-kisan",
      name: "PM-KISAN",
      jurisdiction: "central" as const,
      state: null,
      category: "income-support",
      verification_tier: "verified" as const,
    },
    {
      scheme_id: "pmjay",
      name: "Ayushman Bharat PM-JAY",
      jurisdiction: "central" as const,
      state: null,
      category: "health",
      verification_tier: "listed" as const,
    },
    {
      scheme_id: "assam-nijut-moina",
      name: "Nijut Moina",
      jurisdiction: "state" as const,
      state: "Assam",
      category: "education",
      verification_tier: "listed" as const,
    },
    {
      scheme_id: "kerala-scheme",
      name: "Kerala Scheme",
      jurisdiction: "state" as const,
      state: "Kerala",
      category: "income-support",
      verification_tier: "listed" as const,
    },
  ];

  return buildSchemesForMatch(base);
}

const baseProfile: DiscoveryProfile = {
  state: null,
  ageBand: "unknown",
  gender: "prefer-not-to-say",
  incomeBand: "unknown",
  socialCategory: "prefer-not-to-say",
  benefitInterest: [],
};

describe("Stage 7 — Discovery Matcher (pure)", () => {
  it("is pure — same input, same output, no DB or model access", () => {
    const schemes = makeSchemes();
    const profile = { ...baseProfile, state: "Assam", benefitInterest: ["income-support"] };
    const r1 = matchSchemes(profile, schemes);
    const r2 = matchSchemes(profile, schemes);
    expect(r1).toEqual(r2);
    // With state=Assam and benefitInterest=income-support, we get:
    // - assam-orunodoi (state match, verified, category match)
    // - pm-kisan (central, verified, category match)
    // - assam-nijut-moina (state match, listed)
    // - pmjay (central, listed)
    expect(r1.map((m) => m.scheme_id)).toEqual(["assam-orunodoi", "pm-kisan", "assam-nijut-moina", "pmjay"]);
  });

  it("excludes state-jurisdiction scheme for wrong state", () => {
    const schemes = makeSchemes();
    const profile = { ...baseProfile, state: "Kerala" };
    const results = matchSchemes(profile, schemes);
    const ids = results.map((m) => m.scheme_id);
    expect(ids).not.toContain("assam-orunodoi");
    expect(ids).not.toContain("assam-nijut-moina");
    expect(ids).toContain("pm-kisan");
    expect(ids).toContain("pmjay");
    expect(ids).toContain("kerala-scheme");
  });

  it("returns central schemes regardless of profile state", () => {
    const schemes = makeSchemes();
    const profile = { ...baseProfile, state: "Assam" };
    const results = matchSchemes(profile, schemes);
    const ids = results.map((m) => m.scheme_id);
    expect(ids).toContain("pm-kisan");
    expect(ids).toContain("pmjay");
  });

  it("excludes on verified gender criterion, but not for prefer-not-to-say", () => {
    const schemes = makeSchemes();
    const femaleOnlyEligibility: EligibilityCriteria = {
      status: "verified",
      source_reference: "test-src",
      gender: ["female"],
    };
    const schemesWithGender = schemes.map((s) =>
      s.scheme_id === "pm-kisan" ? { ...s, eligibility: femaleOnlyEligibility } : s
    );

    // Female profile should match
    const femaleProfile = { ...baseProfile, gender: "female" as const };
    const femaleResults = matchSchemes(femaleProfile, schemesWithGender);
    expect(femaleResults.map((m) => m.scheme_id)).toContain("pm-kisan");

    // Male profile should be excluded
    const maleProfile = { ...baseProfile, gender: "male" as const };
    const maleResults = matchSchemes(maleProfile, schemesWithGender);
    expect(maleResults.map((m) => m.scheme_id)).not.toContain("pm-kisan");

    // Prefer-not-to-say should NOT be excluded
    const pntsProfile = { ...baseProfile, gender: "prefer-not-to-say" as const };
    const pntsResults = matchSchemes(pntsProfile, schemesWithGender);
    expect(pntsResults.map((m) => m.scheme_id)).toContain("pm-kisan");
  });

  it("excludes on verified min_age, keeps unknown", () => {
    const schemes = makeSchemes();
    const oldAgeEligibility: EligibilityCriteria = {
      status: "verified",
      source_reference: "test-src",
      min_age: 60,
    };
    const schemesWithAge = schemes.map((s) =>
      s.scheme_id === "pm-kisan" ? { ...s, eligibility: oldAgeEligibility } : s
    );

    const youngProfile = { ...baseProfile, ageBand: "18-40" as const };
    const youngResults = matchSchemes(youngProfile, schemesWithAge);
    expect(youngResults.map((m) => m.scheme_id)).not.toContain("pm-kisan");

    const oldProfile = { ...baseProfile, ageBand: "60-plus" as const };
    const oldResults = matchSchemes(oldProfile, schemesWithAge);
    expect(oldResults.map((m) => m.scheme_id)).toContain("pm-kisan");

    const unknownProfile = { ...baseProfile, ageBand: "unknown" as const };
    const unknownResults = matchSchemes(unknownProfile, schemesWithAge);
    expect(unknownResults.map((m) => m.scheme_id)).toContain("pm-kisan");
  });

  it("excludes on verified income ceiling, keeps unknown", () => {
    const schemes = makeSchemes();
    const lowIncomeEligibility: EligibilityCriteria = {
      status: "verified",
      source_reference: "test-src",
      max_household_income_inr_annual: 200000,
    };
    const schemesWithIncome = schemes.map((s) =>
      s.scheme_id === "pm-kisan" ? { ...s, eligibility: lowIncomeEligibility } : s
    );

    // above-5l (floor 500k) is over the 200k ceiling → excluded.
    const aboveProfile = { ...baseProfile, incomeBand: "above-5l" as const };
    expect(matchSchemes(aboveProfile, schemesWithIncome).map((m) => m.scheme_id)).not.toContain("pm-kisan");

    // 2.5l-5l (floor 250k) is over the ceiling → excluded.
    const highIncomeProfile = { ...baseProfile, incomeBand: "2.5l-5l" as const };
    expect(matchSchemes(highIncomeProfile, schemesWithIncome).map((m) => m.scheme_id)).not.toContain("pm-kisan");

    // 1l-2.5l straddles the ceiling (floor 100k ≤ 200k) → kept, since its lowest income could qualify.
    const straddleProfile = { ...baseProfile, incomeBand: "1l-2.5l" as const };
    expect(matchSchemes(straddleProfile, schemesWithIncome).map((m) => m.scheme_id)).toContain("pm-kisan");

    // below-1l (floor 0) is under the ceiling → kept.
    const lowIncomeProfile = { ...baseProfile, incomeBand: "below-1l" as const };
    expect(matchSchemes(lowIncomeProfile, schemesWithIncome).map((m) => m.scheme_id)).toContain("pm-kisan");

    // unknown never excludes → kept.
    const unknownProfile = { ...baseProfile, incomeBand: "unknown" as const };
    expect(matchSchemes(unknownProfile, schemesWithIncome).map((m) => m.scheme_id)).toContain("pm-kisan");
  });

  it("scheme with no eligibility entry is never excluded by eligibility", () => {
    const schemes = makeSchemes();
    // pmjay has no eligibility entry in the sidecar
    const profile = { ...baseProfile, incomeBand: "above-5l" as const, ageBand: "18-40" as const };
    const results = matchSchemes(profile, schemes);
    expect(results.map((m) => m.scheme_id)).toContain("pmjay");
  });

  it("no MatchResult carries boolean eligible field, and reasons never contain 'eligible'/'qualify'", () => {
    const schemes = makeSchemes();
    const profile = { ...baseProfile, state: "Assam", benefitInterest: ["income-support"] };
    const results = matchSchemes(profile, schemes);
    for (const r of results) {
      expect(r).not.toHaveProperty("eligible");
      expect(r).not.toHaveProperty("qualify");
      for (const reason of r.reasons) {
        expect(reason.toLowerCase()).not.toContain("eligible");
        expect(reason.toLowerCase()).not.toContain("qualify");
      }
    }
  });

  it("verified schemes sort first, then likely before possible", () => {
    const schemes = makeSchemes();
    const profile = { ...baseProfile, state: "Assam", benefitInterest: ["income-support"] };
    const results = matchSchemes(profile, schemes);
    // Both assam-orunodoi and pm-kisan are verified
    expect(results[0].tier).toBe("verified");
    expect(results[1].tier).toBe("verified");
    // Listed schemes come after
    const listed = results.filter((r) => r.tier === "listed");
    expect(listed.length).toBeGreaterThan(0);
  });
});