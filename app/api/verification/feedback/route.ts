import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { db } from "@/lib/db";
import { normaliseDocumentName, type ConceptRow } from "@/lib/consensus";

// Note: no `export const runtime = "nodejs"` — this project runs with
// cacheComponents enabled, which forbids that segment config. The Node.js
// runtime is already the default for route handlers, and better-sqlite3 works
// under it, so nothing is lost by omitting the export.

// Body is capped like the check route; a runaway body is a 413, not a hang.
const MAX_BODY = 16_000;

const FeedbackSchema = z.object({
  schemeId: z.string().min(1).max(64),
  districtCode: z.string().max(32).nullable().optional(),
  verificationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  attended: z.boolean(),
  officialListWasSufficient: z.boolean().nullable().optional(),
  additionalDocumentNames: z.array(z.string().min(1).max(120)).max(20),
  applicationProgress: z.string().max(40).nullable().optional(),
  // Consent gate: the field must be present AND true. A missing or false flag
  // fails validation -> 400 (acceptance test 10). No Aadhaar/PAN/bank field
  // exists anywhere in this schema on purpose.
  consentForAggregateUse: z.literal(true, {
    message: "Consent for aggregate use is required to submit feedback.",
  }),
  caseKey: z.string().min(1).max(128),
  // Set when the applicant confirms an ambiguous normalisation suggestion.
  confirmedConcepts: z.array(z.string().max(64)).max(20).optional(),
});

function listConcepts(): ConceptRow[] {
  const rows = db
    .prepare(
      "SELECT concept_id, canonical_name, synonyms FROM document_concepts",
    )
    .all() as {
    concept_id: string;
    canonical_name: string;
    synonyms: string;
  }[];
  return rows.map((r) => ({
    concept_id: r.concept_id,
    canonical_name: r.canonical_name,
    synonyms: JSON.parse(r.synonyms) as string[],
  }));
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

  const parsed = FeedbackSchema.safeParse(parsedJson);
  if (!parsed.success) {
    // The consent gate is a 400: "no consent flag -> 400" (acceptance test 10).
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Tier gate, server-side: feedback is only collected for verified (Tier A)
  // schemes. Without a verified official list there is no baseline to compare
  // a report against, so a Tier B report would be uninterpretable.
  const scheme = db
    .prepare(
      "SELECT scheme_id, verification_tier FROM schemes WHERE scheme_id = ?",
    )
    .get(input.schemeId) as
    | { scheme_id: string; verification_tier: string }
    | undefined;
  if (!scheme) {
    return NextResponse.json({ error: "Unsupported scheme." }, { status: 404 });
  }
  if (scheme.verification_tier !== "verified") {
    return NextResponse.json(
      { error: "Feedback is only collected for verified schemes." },
      { status: 400 },
    );
  }

  // Normalisation. A raw name only becomes a stored concept at "high"
  // confidence. Anything lower is bounced back as a "Did you mean …?" confirm
  // step (acceptance test 8) and is NOT written to the database yet.
  const concepts = listConcepts();
  const resolved: string[] = [];
  const needsConfirmation: {
    raw: string;
    suggestedConceptId: string | null;
    suggestedName: string | null;
    confidence: "low" | "none";
  }[] = [];

  for (const name of input.additionalDocumentNames) {
    const norm = normaliseDocumentName(name, concepts);
    if (norm.confidence === "high") {
      // normaliseDocumentName guarantees conceptId is a non-null string at
      // "high" confidence, so this push is type-safe.
      resolved.push(norm.conceptId);
    } else {
      const suggested =
        norm.conceptId != null
          ? (concepts.find((c) => c.concept_id === norm.conceptId) ?? null)
          : null;
      needsConfirmation.push({
        raw: name,
        suggestedConceptId: suggested?.concept_id ?? null,
        suggestedName: suggested?.canonical_name ?? null,
        confidence: norm.confidence,
      });
    }
  }

  // Confirmations must account for every ambiguous suggestion exactly once.
  // Known but unrelated IDs (or an ID for an unrecognised name) are not evidence
  // that the applicant confirmed the suggestion we actually offered.
  if (input.confirmedConcepts?.length) {
    const remaining = needsConfirmation.map((item) => item.suggestedConceptId);
    const valid = input.confirmedConcepts.every((conceptId) => {
      if (!concepts.some((concept) => concept.concept_id === conceptId)) return false;
      const index = remaining.indexOf(conceptId);
      if (index === -1) return false;
      remaining.splice(index, 1);
      return true;
    });
    if (!valid || remaining.length) {
      return NextResponse.json(
        { error: "Confirm one matching suggestion for each ambiguous document name." },
        { status: 400 },
      );
    }
    resolved.push(...input.confirmedConcepts);
    needsConfirmation.length = 0;
  }

  if (needsConfirmation.length) {
    return NextResponse.json(
      {
        status: "needs_confirmation",
        message:
          "Please confirm the document name(s) before we save your feedback.",
        needsConfirmation,
      },
      { status: 200 },
    );
  }

  // Dedupe on case_key: a second submission with the same case_key is a 409,
  // not a duplicate row. Checked before insert so we return a clean 409 rather
  // than letting the UNIQUE index throw a 500.
  const existing = db
    .prepare("SELECT feedback_id FROM feedback WHERE case_key = ?")
    .get(input.caseKey) as { feedback_id: string } | undefined;
  if (existing) {
    return NextResponse.json(
      { error: "Feedback for this case has already been recorded." },
      { status: 409 },
    );
  }

  const feedbackId = `fb-${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO feedback
       (feedback_id, scheme_id, district_code, verification_date,
        attended, official_list_was_sufficient, additional_document_concepts,
        application_progress, consent_for_aggregate_use, is_demo_data,
        case_key, created_at, quality_status)
     VALUES
       (@feedback_id, @scheme_id, @district_code, @verification_date,
        @attended, @official_list_was_sufficient, @additional_document_concepts,
        @application_progress, @consent_for_aggregate_use, 0,
        @case_key, @created_at, 'valid')`,
  ).run({
    feedback_id: feedbackId,
    scheme_id: input.schemeId,
    district_code: input.districtCode ?? null,
    verification_date: input.verificationDate,
    attended: input.attended ? 1 : 0,
    official_list_was_sufficient:
      input.officialListWasSufficient === null ||
      input.officialListWasSufficient === undefined
        ? null
        : input.officialListWasSufficient
          ? 1
          : 0,
    additional_document_concepts: JSON.stringify(resolved),
    application_progress: input.applicationProgress ?? null,
    consent_for_aggregate_use: 1,
    case_key: input.caseKey,
    created_at: createdAt,
  });

  return NextResponse.json(
    {
      status: "recorded",
      feedbackId,
      additionalDocumentConcepts: resolved,
    },
    { status: 201 },
  );
}

