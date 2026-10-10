import type { MatchResult } from "./types";

function summarise(matches: MatchResult[]): string {
  if (matches.length === 0) {
    return "No confident matches — browse the full catalogue to explore all schemes.";
  }
  const verified = matches.filter((m) => m.tier === "verified").length;
  const listed = matches.filter((m) => m.tier === "listed").length;
  const parts: string[] = [];
  if (verified) parts.push(`${verified} verified scheme${verified > 1 ? "s" : ""}`);
  if (listed) parts.push(`${listed} listed scheme${listed > 1 ? "s" : ""}`);
  return `Found ${parts.join(" and ")} worth checking. This is a starting point, not an eligibility decision.`;
}

export function buildDeterministicDiscoveryResponse(matches: MatchResult[]) {
  return {
    matches,
    message: summarise(matches),
    generatedBy: "deterministic" as const,
  };
}