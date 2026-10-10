import { z } from "zod";
import type { MatchResult } from "./types";

// Agent output schema for discovery
export const DiscoveryOutputSchema = z.object({
  summary: z.string().min(1).max(200),
  matches: z.array(
    z.object({
      scheme_id: z.string().min(1).max(64),
      tier: z.enum(["verified", "listed"]),
      relevance: z.enum(["likely", "possible"]),
      reasons: z.array(z.string().max(200)).max(5),
      // Agent may add a brief note per scheme
      note: z.string().max(300).optional(),
    })
  ).max(20),
  disclaimer: z.string().default("This is a starting point, not an eligibility decision. HaqSaathi is an independent information tool, not a government service. Confirm on the official portal before you apply."),
});

// Validate that agent output only references schemes the matcher returned
// and never uses forbidden language
export function validateDiscoveryReferences(
  agentOutput: z.infer<typeof DiscoveryOutputSchema>,
  deterministicMatches: MatchResult[]
): boolean {
  const allowedSchemeIds = new Set(deterministicMatches.map((m) => m.scheme_id));
  const forbiddenWords = ["eligible", "qualify", "guaranteed", "will get", "entitled"];

  // Check all scheme_ids are from matcher
  for (const match of agentOutput.matches) {
    if (!allowedSchemeIds.has(match.scheme_id)) {
      return false;
    }
  }

  // Check no forbidden words in any agent-controlled text: summary, notes, AND reasons.
  const allText = [
    agentOutput.summary,
    ...agentOutput.matches.flatMap((m) => [m.note ?? "", ...m.reasons]),
  ].join(" ").toLowerCase();
  for (const word of forbiddenWords) {
    if (allText.includes(word)) {
      return false;
    }
  }

  // Check disclaimer is present and contains key phrases
  if (!agentOutput.disclaimer.toLowerCase().includes("not an eligibility decision")) {
    return false;
  }
  if (!agentOutput.disclaimer.toLowerCase().includes("confirm on the official portal")) {
    return false;
  }

  return true;
}