import { NextResponse } from "next/server";
import { z } from "zod";
import { getSchemeRecord } from "@/lib/db";
import type { SchemeRecord } from "@/lib/types";

// Body is capped; a runaway body is a 413, not a hang.
const MAX_BODY = 8_000;

const DemandCheckSchema = z.object({
  schemeId: z.string().min(1).max(64),
  reportedAmountInr: z.number().int().nonnegative(),
});

function getVerifiedFee(scheme: SchemeRecord) {
  if (!scheme.official_fee) return null;
  if (scheme.official_fee.status !== "verified") return null;
  return scheme.official_fee;
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

  const parsed = DemandCheckSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const scheme = getSchemeRecord(input.schemeId);
  if (!scheme) {
    return NextResponse.json({ error: "Unsupported scheme." }, { status: 404 });
  }

  // Only verified (Tier A) schemes have a fee record that can be checked.
  if (scheme.verification_tier !== "verified") {
    return NextResponse.json(
      { error: "Demand Check is only available for verified schemes." },
      { status: 400 },
    );
  }

  const fee = getVerifiedFee(scheme);
  const reported = input.reportedAmountInr;

  if (!fee) {
    return NextResponse.json({
      verdict: "unknown",
      message: "We do not have a verified fee record for this scheme. Please ask the office to show the official fee rule.",
      script: null,
      sourceUrl: scheme.official_source_url,
    });
  }

  if (fee.amount_inr === 0 && reported > 0) {
    return NextResponse.json({
      verdict: "mismatch",
      message: `The official source we checked lists no application fee for this scheme (checked ${fee.checked_at ?? scheme.official_source_checked_at}).`,
      script: "Could you please show me the official fee rule and provide a receipt?",
      sourceUrl: scheme.official_source_url,
    });
  }

  if (fee.amount_inr > 0 && reported !== fee.amount_inr) {
    return NextResponse.json({
      verdict: "mismatch",
      message: `The official source we checked lists an application fee of ₹${fee.amount_inr} (checked ${fee.checked_at ?? scheme.official_source_checked_at}). You reported ₹${reported}.`,
      script: "Could you please show me the official fee rule and provide a receipt?",
      sourceUrl: scheme.official_source_url,
    });
  }

  // Amounts match (both zero, or both equal positive value)
  return NextResponse.json({
    verdict: "match",
    message: `The reported amount (₹${reported}) matches the official fee record (₹${fee.amount_inr}, checked ${fee.checked_at ?? scheme.official_source_checked_at}).`,
    script: null,
    sourceUrl: scheme.official_source_url,
  });
}