import { Agent } from "@cline/agents";
import type { AgentTool } from "@cline/shared";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validateApplication } from "@/lib/validateApplication";
import { buildDeterministicReadinessReport } from "@/lib/fallback";
import { AgentOutputSchema, validateAgentReferences } from "@/lib/agent";
import {
  getApprovedSchemeRecord,
  getPublishedGuidance,
  projectApprovedSchemeForAgent,
} from "@/lib/db";
import type { SchemeRecord } from "@/lib/types";

export const runtime = "nodejs";

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
      })
    )
    .max(30),
  locale: z.string().default("en-IN"),
});

export function createSchemeTool(
  scheme: SchemeRecord,
  allowedSchemeId: string
): AgentTool<{ scheme_id: string }, unknown> {
  return {
    name: "get_approved_scheme_record",
    description: "Read the approved record for this request's scheme only.",
    inputSchema: {
      type: "object",
      properties: { scheme_id: { type: "string" } },
      required: ["scheme_id"],
    },
    async execute({ scheme_id }: { scheme_id: string }, context?: any) {
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

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 32_000) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const input = parsed.data;

  const scheme = getApprovedSchemeRecord(input.schemeId);
  if (!scheme) {
    return NextResponse.json({ error: "Unsupported scheme." }, { status: 404 });
  }

  // Facts are decided here, before and regardless of the agent.
  const validation = validateApplication({
    scheme,
    confirmedFields: input.confirmedFields,
    documentInventory: input.documentInventory,
    publishedGuidance: getPublishedGuidance(input.schemeId),
  });

  if (!process.env.CLINE_MODEL_API_KEY || process.env.FORCE_FALLBACK === "1") {
    return NextResponse.json(buildDeterministicReadinessReport(validation));
  }

  const schemeTool = createSchemeTool(scheme, input.schemeId);

  try {
    const agent = new Agent({
      providerId: process.env.CLINE_PROVIDER_ID!,
      modelId: process.env.CLINE_MODEL_ID!,
      apiKey: process.env.CLINE_MODEL_API_KEY,
      systemPrompt: buildSystemPrompt(input.locale),
      tools: [schemeTool as any],
      maxIterations: 3,
      modelOptions: { maxTokens: 1800 },
    } as any);

    const timeout = setTimeout(
      () => agent.abort?.(),
      Number(process.env.AGENT_TIMEOUT_MS ?? 12000)
    );

    const result = await agent.run(
      JSON.stringify({
        locale: input.locale,
        validation,
        allowedFollowUpKeys: validation.allowedFollowUpKeys,
      })
    );
    clearTimeout(timeout);

    if (result.status !== "completed") {
      return NextResponse.json(buildDeterministicReadinessReport(validation));
    }

    const json = safelyParseAgentJson(result.outputText ?? "");
    const checked = AgentOutputSchema.safeParse(json);
    if (!checked.success || !validateAgentReferences(checked.data, validation)) {
      return NextResponse.json(buildDeterministicReadinessReport(validation));
    }

    return NextResponse.json({ ...checked.data, generatedBy: "agent" });
  } catch (err) {
    console.error("check_failed", { schemeId: input.schemeId, kind: (err as Error).name });
    return NextResponse.json(buildDeterministicReadinessReport(validation));
  }
}
