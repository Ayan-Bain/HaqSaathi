import { NextResponse } from "next/server";
import { z } from "zod";
import { getCatalogue } from "@/lib/db";
import { matchSchemes, buildSchemesForMatch } from "@/lib/discovery";
import { buildDeterministicDiscoveryResponse } from "@/lib/discovery-fallback";
import { DiscoveryOutputSchema, validateDiscoveryReferences } from "@/lib/discovery-agent";
import { Agent } from "@cline/agents";

// Body is capped; a runaway body is a 413, not a hang.
const MAX_BODY = 16_000;

const DiscoveryProfileSchema = z.object({
  state: z.string().max(64).nullable().default(null),
  ageBand: z.enum(["under-18", "18-40", "40-60", "60-plus", "unknown"]).default("unknown"),
  gender: z.enum(["female", "male", "other", "prefer-not-to-say"]).default("prefer-not-to-say"),
  incomeBand: z.enum(["below-1l", "1l-2.5l", "2.5l-5l", "above-5l", "unknown"]).default("unknown"),
  socialCategory: z.enum(["general", "sc", "st", "obc", "prefer-not-to-say"]).default("prefer-not-to-say"),
  benefitInterest: z.array(z.string().max(64)).max(10).default([]),
});

// PII guard: reject any field containing a 12-digit number (Aadhaar-like)
function containsPii(obj: unknown): boolean {
  const str = JSON.stringify(obj);
  return /\d{12}/.test(str);
}

function buildDiscoverySystemPrompt(profile: z.infer<typeof DiscoveryProfileSchema>, matches: ReturnType<typeof matchSchemes>) {
  const matchIds = matches.map((m) => m.scheme_id).join(", ");
  return `You help a user discover government schemes they may want to explore in en-IN.

The deterministic matcher has already decided which schemes match the user's profile.
Matched scheme IDs: ${matchIds}

Your only job is to rewrite the result as a short, plain message and a one-line summary.

Rules:
- Do not add or remove scheme IDs. Use only the matched scheme IDs.
- Do not say the user is "eligible", "qualifies", "guaranteed", or "will get" any scheme.
- Say "you may be able to apply" or "worth checking" instead.
- Do not add documents, fees, deadlines, or links.
- Reply with JSON matching the response schema and nothing else.`;
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // PII guard
  if (containsPii(parsedJson)) {
    return NextResponse.json({ error: "Request contains potential PII." }, { status: 400 });
  }

  const parsed = DiscoveryProfileSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const profile = parsed.data;

  // Load catalogue and run deterministic matcher
  const catalogue = getCatalogue();
  const schemesForMatch = buildSchemesForMatch(catalogue);
  const matches = matchSchemes(profile, schemesForMatch);

  // Fallback mode
  if (!process.env.CLINE_MODEL_API_KEY || process.env.FORCE_FALLBACK === "1") {
    return NextResponse.json(buildDeterministicDiscoveryResponse(matches));
  }

  // Agent mode
  try {
    const agent = new Agent({
      providerId: process.env.CLINE_PROVIDER_ID!,
      modelId: process.env.CLINE_MODEL_ID!,
      apiKey: process.env.CLINE_MODEL_API_KEY,
      systemPrompt: buildDiscoverySystemPrompt(profile, matches),
      tools: [],
      maxIterations: 2,
      modelOptions: { maxTokens: 1200 },
    });

    const timeout = setTimeout(
      () => agent.abort?.(),
      Number(process.env.AGENT_TIMEOUT_MS ?? 10000)
    );

    const result = await agent.run(
      JSON.stringify({
        profile,
        matches: matches.map((m) => ({ scheme_id: m.scheme_id, tier: m.tier, relevance: m.relevance, reasons: m.reasons })),
      })
    );
    clearTimeout(timeout);

    if (result.status !== "completed") {
      return NextResponse.json(buildDeterministicDiscoveryResponse(matches));
    }

    const agentJson = result.outputText ? JSON.parse(result.outputText.match(/\{[\s\S]*\}/)?.[0] ?? "{}") : {};
    const checkedOutput = DiscoveryOutputSchema.safeParse(agentJson);
    if (!checkedOutput.success || !validateDiscoveryReferences(checkedOutput.data, matches)) {
      return NextResponse.json(buildDeterministicDiscoveryResponse(matches));
    }

    return NextResponse.json({ ...checkedOutput.data, generatedBy: "agent" });
  } catch (err) {
    console.error("discovery_failed", { kind: (err as Error).name });
    return NextResponse.json(buildDeterministicDiscoveryResponse(matches));
  }
}