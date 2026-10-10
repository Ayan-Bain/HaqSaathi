import fs from "fs";
import path from "path";
import type { DiscoveryProfile, SchemeForMatch, MatchResult, EligibilityCriteria } from "./types";

function loadEligibilitySidecar(): Record<string, EligibilityCriteria> {
  const filePath = path.join(process.cwd(), "data", "eligibility.json");
  if (!fs.existsSync(filePath)) return {};
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

const ELIGIBILITY_SIDECAR = loadEligibilitySidecar();

function ageBandToRange(band: DiscoveryProfile["ageBand"]): { min: number | null; max: number | null } {
  switch (band) {
    case "under-18": return { min: 0, max: 17 };
    case "18-40": return { min: 18, max: 40 };
    case "40-60": return { min: 40, max: 60 };
    case "60-plus": return { min: 60, max: null };
    default: return { min: null, max: null };
  }
}

// Permissive lower edge of the band: the lowest income a person in this band
// could have. An income ceiling excludes the band only when even that lowest
// income is already over the ceiling — "when in doubt, include".
function incomeBandToFloor(band: DiscoveryProfile["incomeBand"]): number | null {
  switch (band) {
    case "below-1l": return 0;
    case "1l-2.5l": return 100000;
    case "2.5l-5l": return 250000;
    case "above-5l": return 500000;
    default: return null; // unknown — never excludes
  }
}

export function matchSchemes(profile: DiscoveryProfile, schemes: SchemeForMatch[]): MatchResult[] {
  const out: MatchResult[] = [];

  for (const s of schemes) {
    const reasons: string[] = [];
    let excluded = false;

    // 1. Hard, factual exclusions — only from catalogue facts or VERIFIED criteria.
    //    Unknown / prefer-not-to-say NEVER excludes (do not penalise).
    if (s.jurisdiction === "state" && s.state && profile.state && s.state !== profile.state) {
      continue;
    }

    if (profile.state && s.jurisdiction === "state" && s.state === profile.state) {
      reasons.push(`available in ${profile.state}`);
    } else if (s.jurisdiction === "central") {
      reasons.push("central scheme — available nationwide");
    }

    const e = s.eligibility;
    if (e?.status === "verified") {
      // State eligibility (additional to jurisdiction)
      if (e.states && profile.state && !e.states.includes(profile.state)) {
        continue;
      }
      if (e.states && profile.state && e.states.includes(profile.state)) {
        reasons.push(`meets state criteria for ${profile.state}`);
      }

      // Gender
      if (e.gender && profile.gender !== "prefer-not-to-say" && profile.gender !== "other") {
        if (!e.gender.includes(profile.gender)) {
          continue;
        }
        reasons.push(`matches gender criteria`);
      }

      // Age
      if (e.min_age !== undefined && e.min_age !== null) {
        const range = ageBandToRange(profile.ageBand);
        if (range.max !== null && range.max < e.min_age) {
          continue;
        }
        reasons.push(`meets minimum age (${e.min_age}+)`);
      }

      // Income ceiling — exclude only if the band's lowest income already exceeds it.
      if (e.max_household_income_inr_annual !== undefined && e.max_household_income_inr_annual !== null) {
        const floor = incomeBandToFloor(profile.incomeBand);
        if (floor !== null && floor > e.max_household_income_inr_annual) {
          continue;
        }
        reasons.push(`may be within income ceiling (₹${e.max_household_income_inr_annual.toLocaleString()}/year)`);
      }

      // Social category
      if (e.social_categories && profile.socialCategory !== "prefer-not-to-say") {
        if (!e.social_categories.includes(profile.socialCategory)) {
          continue;
        }
        reasons.push(`matches social category criteria`);
      }
    }

    // Benefit interest matching (catalogue category)
    if (profile.benefitInterest.length > 0 && s.category && profile.benefitInterest.includes(s.category)) {
      reasons.push(`matches the help you asked about (${s.category})`);
    }

    if (!excluded) {
      out.push({
        scheme_id: s.scheme_id,
        tier: s.verification_tier,
        relevance: reasons.length > 1 ? "likely" : "possible",
        reasons,
      });
    }
  }

  // Sort: verified first, then by relevance (likely before possible), then by name
  out.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === "verified" ? -1 : 1;
    if (a.relevance !== b.relevance) return a.relevance === "likely" ? -1 : 1;
    return a.scheme_id.localeCompare(b.scheme_id);
  });

  return out;
}

export function buildSchemesForMatch(schemes: Array<{
  scheme_id: string;
  name: string;
  jurisdiction: "central" | "state";
  state: string | null;
  category: string | null;
  verification_tier: "verified" | "listed";
}>): SchemeForMatch[] {
  return schemes.map((s) => ({
    ...s,
    eligibility: ELIGIBILITY_SIDECAR[s.scheme_id] ?? null,
  }));
}