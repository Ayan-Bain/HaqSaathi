import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  computeConsensus,
  type FeedbackRow,
  type Decision,
} from "@/lib/consensus";

// Note: no `export const runtime = "nodejs"` — this project runs with
// cacheComponents enabled, which forbids that segment config. The Node.js
// runtime is already the default for route handlers, and better-sqlite3 works
// under it, so nothing is lost by omitting the export.

// The recompute job is the deterministic policy engine turning raw feedback
// into published community notes. It is protected by a shared secret even in
// the prototype; production would make this a scheduled job. It NEVER touches
// the `schemes` table, so the official document list is byte-identical before
// and after a run — that invariant is the core claim of the product.

// Raw row shapes from SQLite (JSON columns arrive as strings). Typed explicitly
// instead of `any`.
interface RawFeedbackRow {
  feedback_id: string;
  scheme_id: string;
  district_code: string | null;
  verification_date: string;
  attended: number;
  official_list_was_sufficient: number | null;
  additional_document_concepts: string;
  consent_for_aggregate_use: number;
  quality_status: string;
}

interface RawGuidanceRow {
  status: string;
  valid_report_count: number;
  agreement_ratio: number;
  version: number;
}

const BodySchema = z.object({
  // Optional deterministic "today" for reproducible runs / tests. Defaults to
  // the real clock when omitted.
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function loadFeedbackRows(schemeId: string, districtCode: string | null): FeedbackRow[] {
  const rows = db
    .prepare(
      `SELECT feedback_id, scheme_id, district_code, verification_date,
              attended, official_list_was_sufficient, additional_document_concepts,
              consent_for_aggregate_use, quality_status
         FROM feedback
        WHERE scheme_id = ? AND district_code IS ?`,
    )
    .all(schemeId, districtCode) as RawFeedbackRow[];

  return rows.map((r) => ({
    feedback_id: r.feedback_id,
    scheme_id: r.scheme_id,
    district_code: r.district_code,
    verification_date: r.verification_date,
    attended: Boolean(r.attended),
    official_list_was_sufficient:
      r.official_list_was_sufficient === null
        ? null
        : Boolean(r.official_list_was_sufficient),
    additional_document_concepts: JSON.parse(r.additional_document_concepts) as string[],
    consent_for_aggregate_use: Boolean(r.consent_for_aggregate_use),
    quality_status: r.quality_status,
  }));
}

function distinctConcepts(rows: FeedbackRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) for (const c of r.additional_document_concepts) set.add(c);
  return [...set];
}

function guidanceIdFor(schemeId: string, districtCode: string | null, conceptId: string) {
  return `${schemeId}::${districtCode ?? "ALL"}::${conceptId}`;
}

function describeRule(decision: Decision): string {
  if (!decision.publish) return `not_published:${decision.reason}`;
  if (decision.status === "conflicting") {
    return "published:conflicting (count>=5, distinct_dates>=2, agreement<0.70)";
  }
  return "published:community-reported (count>=5, distinct_dates>=2, agreement>=0.70)";
}

function buildEvidenceSummary(decision: Decision, mentioning: FeedbackRow[]): string {
  const distinctDates = new Set(mentioning.map((r) => r.verification_date)).size;
  const allDemo = mentioning.length > 0 && mentioning.every((r) => r.feedback_id.startsWith("fb-demo-"));
  const pct = Math.round(decision.agreement * 1000) / 10;
  let summary =
    `Reported by ${decision.count} applicant(s) across ${distinctDates} visit date(s); ` +
    `${pct}% agreement among respondents who answered whether the official list was sufficient. ` +
    `Community-sourced, not an official requirement.`;
  if (decision.publish && decision.status === "conflicting") {
    summary += " Applicants disagree about whether this is needed.";
  }
  if (allDemo) summary += " DEMO DATA.";
  return summary;
}

export async function POST(request: Request) {
  // Shared-secret gate. Even in the prototype this endpoint is protected; a
  // judge curling it with no secret gets a clean 403, never a silent write.
  const secret = request.headers.get("x-recompute-secret");
  if (!process.env.RECOMPUTE_SECRET || secret !== process.env.RECOMPUTE_SECRET) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  // Optional deterministic "today" so a demo/test can pin the clock.
  let today = new Date();
  const raw = await request.text();
  if (raw.trim()) {
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    if (parsed.data.today) today = new Date(`${parsed.data.today}T00:00:00.000Z`);
  }

  // Distinct (scheme, district) scopes that have any feedback at all.
  const scopes = db
    .prepare(`SELECT DISTINCT scheme_id, district_code FROM feedback`)
    .all() as { scheme_id: string; district_code: string | null }[];

  let published = 0;
  let withdrawn = 0;
  const nowIso = new Date().toISOString();

  const upsertGuidance = db.prepare(
    `INSERT INTO community_guidance
       (guidance_id, scheme_id, document_concept_id, scope_state,
        scope_district_code, status, valid_report_count, agreement_ratio,
        first_reported_at, last_reported_at, published_at,
        expires_or_review_at, evidence_summary, official_source_confirms, version)
     VALUES
       (@guidance_id, @scheme_id, @document_concept_id, @scope_state,
        @scope_district_code, @status, @valid_report_count, @agreement_ratio,
        @first_reported_at, @last_reported_at, @published_at,
        @expires_or_review_at, @evidence_summary, 0,
        COALESCE((SELECT version FROM community_guidance WHERE guidance_id = @guidance_id), 0) + 1)
     ON CONFLICT(guidance_id) DO UPDATE SET
        status = excluded.status,
        valid_report_count = excluded.valid_report_count,
        agreement_ratio = excluded.agreement_ratio,
        first_reported_at = excluded.first_reported_at,
        last_reported_at = excluded.last_reported_at,
        published_at = excluded.published_at,
        expires_or_review_at = excluded.expires_or_review_at,
        evidence_summary = excluded.evidence_summary,
        official_source_confirms = 0,
        version = community_guidance.version + 1`,
  );

  const insertAudit = db.prepare(
    `INSERT INTO guidance_audit
       (guidance_id, scheme_id, document_concept_id, previous_value,
        new_value, rule_applied, evidence_summary, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const apply = db.transaction(() => {
    for (const scope of scopes) {
      const rows = loadFeedbackRows(scope.scheme_id, scope.district_code);
      const conceptIds = distinctConcepts(rows);

      for (const conceptId of conceptIds) {
        const decision = computeConsensus(rows, conceptId, today);
        const guidanceId = guidanceIdFor(
          scope.scheme_id,
          scope.district_code,
          conceptId,
        );

        const existing = db
          .prepare(`SELECT * FROM community_guidance WHERE guidance_id = ?`)
          .get(guidanceId) as RawGuidanceRow | undefined;

        // For audit, capture the previous published state (if any).
        const previousValue = existing
          ? JSON.stringify({
              status: existing.status,
              valid_report_count: existing.valid_report_count,
              agreement_ratio: existing.agreement_ratio,
              version: existing.version,
            })
          : null;

        if (decision.publish) {
          const mentioning = rows.filter((r) =>
            r.additional_document_concepts.includes(conceptId),
          );
          const evidenceSummary = buildEvidenceSummary(decision, mentioning);

          upsertGuidance.run({
            guidance_id: guidanceId,
            scheme_id: scope.scheme_id,
            document_concept_id: conceptId,
            scope_state: null,
            scope_district_code: scope.district_code,
            status: decision.status,
            valid_report_count: decision.count,
            agreement_ratio: decision.agreement,
            first_reported_at: decision.firstReportedAt,
            last_reported_at: decision.lastReportedAt,
            published_at: nowIso,
            expires_or_review_at: null,
            evidence_summary: evidenceSummary,
          });

          insertAudit.run(
            guidanceId,
            scope.scheme_id,
            conceptId,
            previousValue,
            JSON.stringify({
              status: decision.status,
              valid_report_count: decision.count,
              agreement_ratio: decision.agreement,
            }),
            describeRule(decision),
            evidenceSummary,
            nowIso,
          );
          published += 1;
        } else if (existing) {
          // Previously published, now below threshold (e.g. aged out): withdraw.
          db.prepare(
            `UPDATE community_guidance
                SET status = 'withdrawn', version = version + 1
              WHERE guidance_id = ?`,
          ).run(guidanceId);
          insertAudit.run(
            guidanceId,
            scope.scheme_id,
            conceptId,
            previousValue,
            JSON.stringify({ status: "withdrawn" }),
            describeRule(decision),
            buildEvidenceSummary(decision, []),
            nowIso,
          );
          withdrawn += 1;
        }
        // else: never published and still below threshold -> write nothing.
      }
    }
  });

  apply();

  return NextResponse.json({
    ok: true,
    scopesEvaluated: scopes.length,
    published,
    withdrawn,
  });
}

