// Stage 4 — Feedback and consensus pipeline.
//
// This module is the deterministic policy that decides whether community
// feedback is strong enough to publish as a community note. It is a PURE
// function: no database access, no I/O, no clock reads other than the `today`
// argument it is handed. Same input -> same output, always. That property is
// what makes it reviewable line by line and is asserted in consensus.test.ts.

export interface ConsensusConfig {
  minReports: number; // 5   — a single report never publishes (acceptance test 2)
  minAgreement: number; // 0.70
  windowDays: number; // 90  — older feedback stops counting (freshness floor)
  minDistinctDates: number; // 2  — one visit repeated by many people is not consensus
}

export const DEFAULT_CONFIG: ConsensusConfig = {
  minReports: 5,
  minAgreement: 0.7,
  windowDays: 90,
  minDistinctDates: 2,
};

export interface FeedbackRow {
  feedback_id: string;
  scheme_id: string;
  district_code: string | null;
  verification_date: string;
  attended: boolean;
  official_list_was_sufficient: boolean | null;
  additional_document_concepts: string[];
  consent_for_aggregate_use: boolean;
  quality_status: string;
}

export type Decision =
  | {
      publish: true;
      conceptId: string;
      count: number;
      agreement: number;
      firstReportedAt: string;
      lastReportedAt: string;
      status: "community-reported";
    }
  | {
      publish: true;
      conceptId: string;
      count: number;
      agreement: number;
      firstReportedAt: string;
      lastReportedAt: string;
      status: "conflicting";
    }
  | {
      publish: false;
      conceptId: string;
      reason: string;
      count: number;
      agreement: number;
    };

export function computeConsensus(
  rows: FeedbackRow[],
  conceptId: string,
  today: Date,
  cfg: ConsensusConfig = DEFAULT_CONFIG,
): Decision {
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - cfg.windowDays);

  // Eligible = attended, consented, in-window, quality-passed.
  // A non-attendee is excluded entirely — never counted as a negative.
  const eligible = rows.filter(
    (r) =>
      r.attended &&
      r.consent_for_aggregate_use &&
      r.quality_status === "valid" &&
      new Date(r.verification_date) >= cutoff,
  );

  const mentioning = eligible.filter((r) =>
    r.additional_document_concepts.includes(conceptId),
  );
  const count = mentioning.length;

  // Denominator = everyone who answered the "was the list sufficient?" question,
  // not just those who named this document. Counting only namers would silently
  // turn 83% agreement into 100% — this line is the whole point of the function.
  const answered = eligible.filter(
    (r) => r.official_list_was_sufficient !== null,
  );
  const agreement = answered.length ? count / answered.length : 0;

  const dates = new Set(mentioning.map((r) => r.verification_date));

  const fail = (reason: string): Decision => ({
    publish: false,
    conceptId,
    reason,
    count,
    agreement,
  });

  if (count < cfg.minReports) return fail("below_min_reports");
  if (dates.size < cfg.minDistinctDates) return fail("single_visit_date");
  if (agreement < cfg.minAgreement) {
    // Enough reports but weak agreement -> publish as conflicting, not as absent.
    // Silence would let a 50/50 split look like "no one has ever been asked".
    return {
      publish: true,
      conceptId,
      count,
      agreement,
      status: "conflicting",
      firstReportedAt: minDate(mentioning),
      lastReportedAt: maxDate(mentioning),
    };
  }

  return {
    publish: true,
    conceptId,
    count,
    agreement,
    status: "community-reported",
    firstReportedAt: minDate(mentioning),
    lastReportedAt: maxDate(mentioning),
  };
}

const minDate = (r: FeedbackRow[]) =>
  r.map((x) => x.verification_date).sort()[0];
const maxDate = (r: FeedbackRow[]) =>
  r.map((x) => x.verification_date).sort().at(-1)!;

// ---------------------------------------------------------------------------
// Normalisation — keep it simple and confirmable.
//
// Structurally compatible with DocumentConceptRecord in ./types. A document
// name only reaches the database at "high" confidence; anything below that is
// bounced back to the user as "Did you mean …?" before it is stored
// (acceptance test 8).
// ---------------------------------------------------------------------------

export interface ConceptRow {
  concept_id: string;
  canonical_name: string;
  synonyms: string[];
}

export type NormalisationResult =
  | { conceptId: string; confidence: "high" }
  | { conceptId: string | null; confidence: "low" }
  | { conceptId: null; confidence: "none" };

export function normaliseDocumentName(
  raw: string,
  concepts: ConceptRow[],
): NormalisationResult {
  const needle = raw.trim().toLowerCase();

  const exact = concepts.find(
    (c) =>
      c.canonical_name.toLowerCase() === needle || c.synonyms.includes(needle),
  );
  if (exact) return { conceptId: exact.concept_id, confidence: "high" };

  const partial = concepts.find((c) =>
    c.synonyms.some((s) => needle.includes(s) || s.includes(needle)),
  );
  if (partial) return { conceptId: partial.concept_id, confidence: "low" };

  return { conceptId: null, confidence: "none" };
}

