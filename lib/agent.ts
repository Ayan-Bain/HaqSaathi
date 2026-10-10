import { z } from "zod";
import type { ValidationResult } from "./types";

export const AgentOutputSchema = z.object({
  status: z.enum(["ready_for_review", "needs_attention", "insufficient_information"]),
  summary: z.string().max(600),
  checks: z.array(
    z.object({
      checkId: z.string(),
      status: z.enum(["pass", "needs_attention", "unknown", "informational"]),
      explanation: z.string().max(400),
      basis: z.enum(["official_rule", "user_input", "community_report"]),
      sourceRefs: z.array(z.string()),
    })
  ),
  followUpQuestion: z.object({ key: z.string(), question: z.string().max(200) }).nullable(),
  disclaimer: z.string(),
});

export function validateAgentReferences(
  out: z.infer<typeof AgentOutputSchema>,
  v: ValidationResult
): boolean {
  const ids = new Set(v.allowedCheckIds);
  const refs = new Set(v.allowedSourceRefs);
  const keys = new Set(v.allowedFollowUpKeys);
  const byId = new Map(v.checks.map((c) => [c.checkId, c]));

  if (out.status !== v.overallStatus) return false; // agent cannot re-grade
  if (out.followUpQuestion && !keys.has(out.followUpQuestion.key)) return false;

  for (const c of out.checks) {
    if (!ids.has(c.checkId)) return false; // no invented checks
    if (!c.sourceRefs.every((r) => refs.has(r))) return false; // no invented citations
    const original = byId.get(c.checkId);
    if (!original) return false;
    if (c.status !== original.status) return false; // no re-grading a check
    if (c.basis !== original.basis) return false; // no promoting community → official
    if (!c.sourceRefs.every((r) => original.sourceRefs.includes(r))) return false;
  }
  return true;
}

