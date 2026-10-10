import { describe, it, expect } from "vitest";
import { validateApplication } from "./validateApplication";
import type { SchemeRecord, CommunityGuidanceRecord } from "./types";

const mockScheme: SchemeRecord = {
  scheme_id: "assam-orunodoi",
  name: "Orunodoi Scheme",
  jurisdiction: "state",
  state: "Assam",
  category: "income-support",
  verification_tier: "verified",
  official_apply_url: "https://finance.assam.gov.in/",
  official_source_url: "https://finance.assam.gov.in/",
  official_source_checked_at: "2026-10-10",
  official_documents: [
    {
      document_id: "identity-proof",
      name: "Identity proof",
      source_reference: "scheme-source-1",
      is_official: true,
    },
    {
      document_id: "income-certificate",
      name: "Income certificate",
      source_reference: "scheme-source-2",
      is_official: true,
    },
    {
      document_id: "bank-passbook-copy",
      name: "Bank passbook first page",
      source_reference: "scheme-source-1",
      is_official: true,
    },
  ],
  official_fee: {
    amount_inr: 0,
    status: "verified",
    source_reference: "scheme-source-3",
  },
  validity_rules: {
    "income-certificate": {
      max_age_months: 12,
      source_reference: "scheme-source-2",
    },
  },
};

const fixedToday = new Date("2026-10-10T12:00:00Z");

describe("Stage 2 — validateApplication deterministic validation", () => {
  it("1. Missing official document produces needs_attention check with official_rule basis and non-empty sourceRefs", () => {
    const result = validateApplication({
      scheme: mockScheme,
      confirmedFields: {},
      documentInventory: [
        { documentConceptId: "income-certificate", available: true, issueDate: "2026-08-01" },
        { documentConceptId: "bank-passbook-copy", available: true },
        // identity-proof is missing
      ],
      publishedGuidance: [],
      today: fixedToday,
    });

    const missingCheck = result.checks.find((c) => c.checkId === "missing-doc-identity-proof");
    expect(missingCheck).toBeDefined();
    expect(missingCheck?.status).toBe("needs_attention");
    expect(missingCheck?.basis).toBe("official_rule");
    expect(missingCheck?.sourceRefs.length).toBeGreaterThan(0);
    expect(missingCheck?.sourceRefs).toContain("scheme-source-1");
    expect(result.overallStatus).toBe("needs_attention");
  });

  it("2. All documents present and dates fresh produces overallStatus ready_for_review", () => {
    const result = validateApplication({
      scheme: mockScheme,
      confirmedFields: {},
      documentInventory: [
        { documentConceptId: "identity-proof", available: true },
        { documentConceptId: "income-certificate", available: true, issueDate: "2026-06-01" },
        { documentConceptId: "bank-passbook-copy", available: true },
      ],
      publishedGuidance: [],
      today: fixedToday,
    });

    expect(result.overallStatus).toBe("ready_for_review");
    expect(result.checks.every((c) => c.status === "pass")).toBe(true);
  });

  it("3. Expired certificate (expiryDate in the past) produces needs_attention and date.stale", () => {
    const result = validateApplication({
      scheme: mockScheme,
      confirmedFields: {},
      documentInventory: [
        { documentConceptId: "identity-proof", available: true },
        {
          documentConceptId: "income-certificate",
          available: true,
          expiryDate: "2026-05-01", // in the past relative to fixedToday (2026-10-10)
        },
        { documentConceptId: "bank-passbook-copy", available: true },
      ],
      publishedGuidance: [],
      today: fixedToday,
    });

    const dateCheck = result.checks.find((c) => c.checkId === "validity-income-certificate");
    expect(dateCheck).toBeDefined();
    expect(dateCheck?.status).toBe("needs_attention");
    expect(dateCheck?.messageKey).toBe("date.stale");
    expect(dateCheck?.basis).toBe("official_rule");
    expect(result.overallStatus).toBe("needs_attention");
  });

  it("4. Certificate with no date at all produces unknown status and matching allowedFollowUpKeys", () => {
    const result = validateApplication({
      scheme: mockScheme,
      confirmedFields: {},
      documentInventory: [
        { documentConceptId: "identity-proof", available: true },
        {
          documentConceptId: "income-certificate",
          available: true,
          issueDate: null,
          expiryDate: null,
        },
        { documentConceptId: "bank-passbook-copy", available: true },
      ],
      publishedGuidance: [],
      today: fixedToday,
    });

    const unknownCheck = result.checks.find(
      (c) => c.checkId === "validity-unknown-income-certificate"
    );
    expect(unknownCheck).toBeDefined();
    expect(unknownCheck?.status).toBe("unknown");
    expect(unknownCheck?.messageKey).toBe("date.unknown");
    expect(result.allowedFollowUpKeys).toContain("income-certificate_validity_unknown");
    expect(result.overallStatus).toBe("insufficient_information");
  });

  it("5. Scheme with no validity_rules entry for a document produces no date check for it", () => {
    const result = validateApplication({
      scheme: mockScheme,
      confirmedFields: {},
      documentInventory: [
        { documentConceptId: "identity-proof", available: true, issueDate: "2020-01-01" },
        { documentConceptId: "bank-passbook-copy", available: true, issueDate: "2015-01-01" },
        { documentConceptId: "income-certificate", available: true, issueDate: "2026-08-01" },
      ],
      publishedGuidance: [],
      today: fixedToday,
    });

    const dateChecks = result.checks.filter((c) => c.checkType === "date_check");
    // Only income-certificate has a rule in mockScheme.validity_rules
    expect(dateChecks.length).toBe(1);
    expect(dateChecks[0].checkId).toBe("validity-income-certificate");
    expect(result.checks.some((c) => c.checkId === "validity-identity-proof")).toBe(false);
    expect(result.checks.some((c) => c.checkId === "validity-bank-passbook-copy")).toBe(false);
  });

  it("6. applicant_name_match_status mismatch_detected produces name-mismatch-1 with user_input basis and empty sourceRefs", () => {
    const result = validateApplication({
      scheme: mockScheme,
      confirmedFields: { applicant_name_match_status: "mismatch_detected" },
      documentInventory: [
        { documentConceptId: "identity-proof", available: true },
        { documentConceptId: "income-certificate", available: true, issueDate: "2026-08-01" },
        { documentConceptId: "bank-passbook-copy", available: true },
      ],
      publishedGuidance: [],
      today: fixedToday,
    });

    const mismatchCheck = result.checks.find((c) => c.checkId === "name-mismatch-1");
    expect(mismatchCheck).toBeDefined();
    expect(mismatchCheck?.checkType).toBe("mismatch");
    expect(mismatchCheck?.status).toBe("needs_attention");
    expect(mismatchCheck?.basis).toBe("user_input");
    expect(mismatchCheck?.sourceRefs).toEqual([]);
    expect(result.overallStatus).toBe("needs_attention");
  });

  it("7. Published community guidance present + everything else fine keeps overallStatus ready_for_review and community check informational", () => {
    const guidance: CommunityGuidanceRecord[] = [
      {
        guidance_id: "cg-1",
        scheme_id: "assam-orunodoi",
        document_concept_id: "local-residence-certificate",
        scope_state: "Assam",
        scope_district_code: "AS-KAM",
        status: "community-reported",
        valid_report_count: 6,
        agreement_ratio: 0.85,
        first_reported_at: "2026-09-10",
        last_reported_at: "2026-09-28",
        published_at: "2026-09-29",
        expires_or_review_at: null,
        evidence_summary: "Reported by 6 applicants",
        official_source_confirms: 0,
        version: 1,
      },
    ];

    const result = validateApplication({
      scheme: mockScheme,
      confirmedFields: {},
      documentInventory: [
        { documentConceptId: "identity-proof", available: true },
        { documentConceptId: "income-certificate", available: true, issueDate: "2026-08-01" },
        { documentConceptId: "bank-passbook-copy", available: true },
      ],
      publishedGuidance: guidance,
      today: fixedToday,
    });

    const communityCheck = result.checks.find(
      (c) => c.checkId === "community-local-residence-certificate"
    );
    expect(communityCheck).toBeDefined();
    expect(communityCheck?.checkType).toBe("community_note");
    expect(communityCheck?.status).toBe("informational");
    expect(communityCheck?.basis).toBe("community_report");
    expect(result.overallStatus).toBe("ready_for_review");
  });

  it("8. allowedCheckIds contains every emitted checkId and nothing more", () => {
    const guidance: CommunityGuidanceRecord[] = [
      {
        guidance_id: "cg-1",
        scheme_id: "assam-orunodoi",
        document_concept_id: "local-residence-certificate",
        scope_state: "Assam",
        scope_district_code: "AS-KAM",
        status: "community-reported",
        valid_report_count: 6,
        agreement_ratio: 0.85,
        first_reported_at: "2026-09-10",
        last_reported_at: "2026-09-28",
        published_at: "2026-09-29",
        expires_or_review_at: null,
        evidence_summary: "Reported by 6 applicants",
        official_source_confirms: 0,
        version: 1,
      },
    ];

    const result = validateApplication({
      scheme: mockScheme,
      confirmedFields: { applicant_name_match_status: "mismatch_detected" },
      documentInventory: [
        { documentConceptId: "identity-proof", available: true },
        { documentConceptId: "income-certificate", available: true, issueDate: "2026-08-01" },
      ],
      publishedGuidance: guidance,
      today: fixedToday,
    });

    const emittedIds = result.checks.map((c) => c.checkId);
    expect(result.allowedCheckIds).toEqual(emittedIds);
    expect(new Set(result.allowedCheckIds).size).toBe(emittedIds.length);
  });

  it("9. Function is pure: calling twice with identical input returns deep-equal output and touches no DB", () => {
    const input = {
      scheme: mockScheme,
      confirmedFields: { applicant_name_match_status: "mismatch_detected" },
      documentInventory: [
        { documentConceptId: "identity-proof", available: true },
        { documentConceptId: "income-certificate", available: false },
        { documentConceptId: "bank-passbook-copy", available: true },
      ],
      publishedGuidance: [],
      today: fixedToday,
    };

    const run1 = validateApplication(input);
    const run2 = validateApplication(input);

    expect(run1).toEqual(run2);
  });
});
