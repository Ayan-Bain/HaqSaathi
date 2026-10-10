import type {
  CheckResult,
  ValidationResult,
  DocumentInventoryItem,
  SchemeRecord,
  CommunityGuidanceRecord,
} from "./types";

interface Args {
  scheme: SchemeRecord;
  confirmedFields: Record<string, unknown>;
  documentInventory: DocumentInventoryItem[];
  publishedGuidance: CommunityGuidanceRecord[];
  today?: Date;
}

export function validateApplication(args: Args): ValidationResult {
  const today = args.today ?? new Date();
  const checks: CheckResult[] = [];
  const followUps: string[] = [];

  const have = new Map(args.documentInventory.map((d) => [d.documentConceptId, d]));

  // 1. Official documents present?
  for (const doc of args.scheme.official_documents ?? []) {
    const item = have.get(doc.document_id);
    if (!item || !item.available) {
      checks.push({
        checkId: `missing-doc-${doc.document_id}`,
        checkType: "missing_document",
        status: "needs_attention",
        basis: "official_rule",
        messageKey: "doc.missing",
        sourceRefs: [doc.source_reference],
        params: { documentName: doc.name },
      });
    } else {
      checks.push({
        checkId: `have-doc-${doc.document_id}`,
        checkType: "missing_document",
        status: "pass",
        basis: "official_rule",
        messageKey: "doc.present",
        sourceRefs: [doc.source_reference],
        params: { documentName: doc.name },
      });
    }
  }

  // 2. Validity / expiry — only where an official rule exists.
  for (const [conceptId, rule] of Object.entries(args.scheme.validity_rules ?? {})) {
    const item = have.get(conceptId);
    if (!item?.available) continue;

    const reference = item.expiryDate ?? item.issueDate ?? null;
    if (!reference) {
      checks.push({
        checkId: `validity-unknown-${conceptId}`,
        checkType: "date_check",
        status: "unknown",
        basis: "official_rule",
        messageKey: "date.unknown",
        sourceRefs: [rule.source_reference],
        params: { documentName: conceptId },
      });
      followUps.push(`${conceptId}_validity_unknown`);
      continue;
    }

    const stale = item.expiryDate
      ? new Date(item.expiryDate) < today
      : monthsBetween(new Date(item.issueDate!), today) > rule.max_age_months;

    checks.push({
      checkId: `validity-${conceptId}`,
      checkType: "date_check",
      status: stale ? "needs_attention" : "pass",
      basis: "official_rule",
      messageKey: stale ? "date.stale" : "date.ok",
      sourceRefs: [rule.source_reference],
      params: { documentName: conceptId, maxAgeMonths: rule.max_age_months },
    });
  }

  // 3. Name mismatch — compared server-side, passed on as a status only.
  if (args.confirmedFields.applicant_name_match_status === "mismatch_detected") {
    checks.push({
      checkId: "name-mismatch-1",
      checkType: "mismatch",
      status: "needs_attention",
      basis: "user_input",
      messageKey: "name.mismatch",
      sourceRefs: [],
    });
  }

  // 4. Published community guidance — informational only, never blocking.
  for (const g of args.publishedGuidance) {
    checks.push({
      checkId: `community-${g.document_concept_id}`,
      checkType: "community_note",
      status: "informational",
      basis: "community_report",
      messageKey: "community.reported",
      sourceRefs: [],
      params: {
        documentName: g.document_concept_id,
        reportCount: g.valid_report_count,
        scope: g.scope_district_code ?? g.scope_state ?? "unspecified",
        firstReportedAt: g.first_reported_at,
        lastReportedAt: g.last_reported_at,
      },
    });
  }

  const blocking = checks.filter(
    (c) => c.status === "needs_attention" && c.basis !== "community_report"
  );
  const unknowns = checks.filter((c) => c.status === "unknown");

  return {
    overallStatus: blocking.length
      ? "needs_attention"
      : unknowns.length
        ? "insufficient_information"
        : "ready_for_review",
    checks,
    allowedFollowUpKeys: followUps,
    allowedCheckIds: checks.map((c) => c.checkId),
    allowedSourceRefs: [...new Set(checks.flatMap((c) => c.sourceRefs))],
  };
}

function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}
