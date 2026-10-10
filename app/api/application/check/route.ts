import { Agent } from "@cline/agents";
import { NextResponse } from "next/server";
import { validateApplication } from "@/lib/validateApplication";
import { buildDeterministicReadinessReport } from "@/lib/fallback";
import { AgentOutputSchema, validateAgentReferences } from "@/lib/agent";
import {
  getApprovedSchemeRecord,
  getPublishedGuidance,
} from "@/lib/db";
import {
  RequestSchema,
  createSchemeTool,
  buildSystemPrompt,
  safelyParseAgentJson,
} from "@/lib/check-agent";

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
      tools: [schemeTool],
      maxIterations: 3,
      modelOptions: { maxTokens: 1800 },
    });

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
