import type { AgentTool } from "@cline/shared";
import { z } from "zod";
import { projectApprovedSchemeForAgent } from "@/lib/db";
import type { SchemeRecord } from "@/lib/types";

export const RequestSchema = z.object({
  schemeId: z.string().min(1).max(64),
  confirmedFields: z.record(z.string(), z.unknown()),
  documentInventory: z
    .array(
      z.object({
        documentConceptId: z.string().max(64),
        available: z.boolean(),
        issueDate: z.string().nullable().optional(),
        expiryDate: z.string().nullable().optional(),
      }),
    )
    .max(30),
  locale: z.string().default("en-IN"),
});

export function createSchemeTool(
  scheme: SchemeRecord,
  allowedSchemeId: string,
): AgentTool<{ scheme_id: string }, unknown> {
  return {
    name: "get_approved_scheme_record",
    description: "Read the approved record for this request's scheme only.",
    inputSchema: {
      type: "object",
      properties: { scheme_id: { type: "string" } },
      required: ["scheme_id"],
    },
    async execute({ scheme_id }: { scheme_id: string }) {
      if (scheme_id !== allowedSchemeId) {
        return { ok: false, error: "Scheme is outside this request's scope." };
      }
      return { ok: true, scheme: projectApprovedSchemeForAgent(scheme) };
    },
  };
}

export function buildSystemPrompt(locale: string) {
  return `You explain government scheme application checks to an applicant in ${locale}.

You receive validation results that are already final. Your only job is to rewrite each
one as a short, plain sentence, and to write a one-line summary.

Rules:
- Do not change any status, basis, checkId or sourceRef. Copy them exactly.
- Do not add checks. Do not add documents, fees, deadlines or links.
- A check with basis "community_report" is something other applicants reported.
  Never call it required, official, or mandatory.
- If a follow-up is needed, pick one key from allowedFollowUpKeys. Do not invent a key.
- Never say an application will be approved.
- Reply with JSON matching the response schema and nothing else.`;
}

export function safelyParseAgentJson(text: string): unknown {
  try {
    const m = text.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch {
    return null;
  }
}