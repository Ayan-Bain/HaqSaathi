import type { ValidationResult } from "./types";

const TEMPLATES: Record<string, (p: Record<string, any>) => string> = {
  "doc.missing": (p) =>
    `${p.documentName} is on the official list and you have not marked it as available.`,
  "doc.present": (p) => `${p.documentName} is marked available.`,
  "date.stale": (p) =>
    `${p.documentName} may be outside the validity period recorded for this scheme.`,
  "date.ok": (p) => `${p.documentName} appears to be within the recorded validity period.`,
  "date.unknown": (p) =>
    `We could not read a date for ${p.documentName}. Please check it before your visit.`,
  "name.mismatch": () =>
    `The names do not appear to match across the records you confirmed.`,
  "community.reported": (p) =>
    `${p.reportCount} applicants reported being asked for ${p.documentName} in ${p.scope}. This is not an official requirement.`,
};

function summarise(v: ValidationResult): string {
  if (v.overallStatus === "ready_for_review") {
    return "All official document requirements appear to be met. Application is ready for review.";
  }
  if (v.overallStatus === "needs_attention") {
    const issues = v.checks.filter(
      (c) => c.status === "needs_attention" && c.basis !== "community_report"
    );
    return `Action required: ${issues.length} item(s) require attention before your application visit.`;
  }
  return "Additional details are needed to confirm readiness for your application.";
}

export function buildDeterministicReadinessReport(v: ValidationResult) {
  return {
    status: v.overallStatus,
    summary: summarise(v),
    checks: v.checks.map((c) => ({
      checkId: c.checkId,
      status: c.status,
      explanation: TEMPLATES[c.messageKey]?.(c.params ?? {}) ?? c.messageKey,
      basis: c.basis,
      sourceRefs: c.sourceRefs,
    })),
    followUpQuestion: v.allowedFollowUpKeys.length
      ? {
          key: v.allowedFollowUpKeys[0],
          question: "Can you check the date on that certificate?",
        }
      : null,
    disclaimer: "This is a preparation check, not a guarantee of approval.",
    generatedBy: "deterministic",
  };
}

