import { describe, it, expect } from "vitest";
import {
  computeConsensus,
  normaliseDocumentName,
  DEFAULT_CONFIG,
  type FeedbackRow,
  type ConceptRow,
} from "./consensus";

// A fixed "today" so every window calculation is deterministic.
// 2026-10-10 is the demo's nominal present; the 90-day window reaches back to
// 2026-07-12.
const TODAY = new Date("2026-10-10T00:00:00.000Z");

function row(overrides: Partial<FeedbackRow> = {}): FeedbackRow {
  return {
    feedback_id: "fb",
    scheme_id: "assam-orunodoi",
    district_code: "AS-KAM",
    verification_date: "2026-09-20",
    attended: true,
    official_list_was_sufficient: false,
    additional_document_concepts: [],
    consent_for_aggregate_use: true,
    quality_status: "valid",
    ...overrides,
  };
}

// Build `n` eligible rows that all name `concept`, each on its own date so the
// distinct-date gate is satisfied unless a test overrides the dates.
function namers(
  n: number,
  dates?: string[],
  concept = "local-residence-certificate",
) {
  return Array.from({ length: n }, (_, i) =>
    row({
      feedback_id: `fb-namer-${i}`,
      verification_date: dates
        ? dates[i]
        : `2026-09-${String(10 + i).padStart(2, "0")}`,
      additional_document_concepts: [concept],
    }),
  );
}

describe("Stage 4 — computeConsensus (pure policy function)", () => {
  it("1. 1 report -> publish: false, reason below_min_reports", () => {
    const decision = computeConsensus(
      namers(1),
      "local-residence-certificate",
      TODAY,
    );
    expect(decision.publish).toBe(false);
    expect(decision).toMatchObject({
      publish: false,
      reason: "below_min_reports",
      count: 1,
    });
  });

  it("2. 4 reports -> still publish: false (below the 5-report floor)", () => {
    const decision = computeConsensus(
      namers(4),
      "local-residence-certificate",
      TODAY,
    );
    expect(decision.publish).toBe(false);
    expect(decision).toMatchObject({
      publish: false,
      reason: "below_min_reports",
      count: 4,
    });
  });

  it("3. 6 reports, 83% agreement, 3 distinct dates -> publish: true, community-reported", () => {
    // 6 namers + 1 extra eligible respondent who answered "sufficient" (names nothing).
    // answered = 7, count = 6 -> agreement 6/7 ≈ 0.857 >= 0.70.
    const rows = [
      ...namers(6, [
        "2026-09-10",
        "2026-09-12",
        "2026-09-15",
        "2026-09-18",
        "2026-09-22",
        "2026-09-25",
      ]),
      row({
        feedback_id: "fb-answered",
        verification_date: "2026-09-28",
        official_list_was_sufficient: true,
        additional_document_concepts: [],
      }),
    ];
    const decision = computeConsensus(
      rows,
      "local-residence-certificate",
      TODAY,
    );
    expect(decision.publish).toBe(true);
    if (decision.publish) {
      expect(decision.status).toBe("community-reported");
      expect(decision.count).toBe(6);
      expect(decision.agreement).toBeCloseTo(6 / 7, 5);
    }
  });

  it("4. 6 reports but all on the same verification_date -> publish: false, single_visit_date", () => {
    const rows = namers(6, Array(6).fill("2026-09-20"));
    const decision = computeConsensus(
      rows,
      "local-residence-certificate",
      TODAY,
    );
    expect(decision.publish).toBe(false);
    expect(decision).toMatchObject({
      publish: false,
      reason: "single_visit_date",
      count: 6,
    });
  });

  it("5. 6 reports, 50% agreement, 3 dates -> publish: true, status conflicting", () => {
    // 6 namers but 12 total answered -> agreement 6/12 = 0.50 < 0.70.
    const rows = [
      ...namers(6, [
        "2026-09-10",
        "2026-09-12",
        "2026-09-15",
        "2026-09-18",
        "2026-09-22",
        "2026-09-25",
      ]),
      ...Array.from({ length: 6 }, (_, i) =>
        row({
          feedback_id: `fb-satisfied-${i}`,
          verification_date: `2026-09-${String(11 + i).padStart(2, "0")}`,
          official_list_was_sufficient: true,
          additional_document_concepts: [],
        }),
      ),
    ];
    const decision = computeConsensus(
      rows,
      "local-residence-certificate",
      TODAY,
    );
    expect(decision.publish).toBe(true);
    if (decision.publish) {
      expect(decision.status).toBe("conflicting");
      expect(decision.count).toBe(6);
      expect(decision.agreement).toBeCloseTo(0.5, 5);
    }
  });

  it("6. Reports older than 90 days are excluded from the count", () => {
    // 5 namers in-window + 3 namers older than the 90-day cutoff (before 2026-07-12).
    const rows = [
      ...namers(5, [
        "2026-09-10",
        "2026-09-12",
        "2026-09-15",
        "2026-09-18",
        "2026-09-22",
      ]),
      ...Array.from({ length: 3 }, (_, i) =>
        row({
          feedback_id: `fb-old-${i}`,
          verification_date: ["2026-05-01", "2026-06-01", "2026-07-01"][i],
          additional_document_concepts: ["local-residence-certificate"],
        }),
      ),
    ];
    const decision = computeConsensus(
      rows,
      "local-residence-certificate",
      TODAY,
    );
    // The three old reports must NOT be counted: count is 5, never 8.
    expect(decision.count).toBe(5);
  });

  it("7. A row with attended: false changes neither numerator nor denominator", () => {
    // 6 eligible namers + 1 eligible answered = agreement 6/7.
    const baseline = [
      ...namers(6, [
        "2026-09-10",
        "2026-09-12",
        "2026-09-15",
        "2026-09-18",
        "2026-09-22",
        "2026-09-25",
      ]),
      row({
        feedback_id: "fb-answered",
        verification_date: "2026-09-28",
        official_list_was_sufficient: true,
      }),
    ];
    // Add a non-attendee who names the concept AND answered the question:
    // it must be dropped entirely, so nothing changes.
    const withNonAttendee = [
      ...baseline,
      row({
        feedback_id: "fb-nonattendee",
        verification_date: "2026-09-29",
        attended: false,
        official_list_was_sufficient: false,
        additional_document_concepts: ["local-residence-certificate"],
      }),
    ];

    const a = computeConsensus(baseline, "local-residence-certificate", TODAY);
    const b = computeConsensus(
      withNonAttendee,
      "local-residence-certificate",
      TODAY,
    );
    expect(b.count).toBe(a.count);
    expect(b.agreement).toBe(a.agreement);
    expect(b).toEqual(a);
  });

  it("8. A row with consent_for_aggregate_use: false is excluded", () => {
    const withoutConsent = namers(5, [
      "2026-09-10",
      "2026-09-12",
      "2026-09-15",
      "2026-09-18",
      "2026-09-22",
    ]);
    const withNonConsenting = [
      ...withoutConsent,
      row({
        feedback_id: "fb-noconsent",
        verification_date: "2026-09-25",
        official_list_was_sufficient: false,
        consent_for_aggregate_use: false,
        additional_document_concepts: ["local-residence-certificate"],
      }),
    ];
    const a = computeConsensus(
      withoutConsent,
      "local-residence-certificate",
      TODAY,
    );
    const b = computeConsensus(
      withNonConsenting,
      "local-residence-certificate",
      TODAY,
    );
    // The non-consenting row is dropped entirely, so nothing changes.
    expect(b).toEqual(a);
    expect(b.count).toBe(5);
  });

  it("9. Function is pure — same input, same output, no DB access / no mutation", () => {
    const rows = namers(6, [
      "2026-09-10",
      "2026-09-12",
      "2026-09-15",
      "2026-09-18",
      "2026-09-22",
      "2026-09-25",
    ]);
    const snapshot = JSON.parse(JSON.stringify(rows));
    const first = computeConsensus(rows, "local-residence-certificate", TODAY);
    const second = computeConsensus(rows, "local-residence-certificate", TODAY);
    expect(second).toEqual(first);
    // Input array untouched — the function does not mutate its arguments.
    expect(rows).toEqual(snapshot);
  });

  it("Extra: quality_status !== 'valid' is excluded", () => {
    const rows = [
      ...namers(5, [
        "2026-09-10",
        "2026-09-12",
        "2026-09-15",
        "2026-09-18",
        "2026-09-22",
      ]),
      row({
        feedback_id: "fb-pending",
        verification_date: "2026-09-25",
        official_list_was_sufficient: false,
        quality_status: "pending-validation",
        additional_document_concepts: ["local-residence-certificate"],
      }),
    ];
    const decision = computeConsensus(
      rows,
      "local-residence-certificate",
      TODAY,
    );
    expect(decision.count).toBe(5); // the pending row is not counted
  });

  it("Extra: DEFAULT_CONFIG matches the documented policy", () => {
    expect(DEFAULT_CONFIG).toEqual({
      minReports: 5,
      minAgreement: 0.7,
      windowDays: 90,
      minDistinctDates: 2,
    });
  });
});

describe("Stage 4 — normaliseDocumentName", () => {
  const concepts: ConceptRow[] = [
    {
      concept_id: "local-residence-certificate",
      canonical_name: "Local residence certificate",
      synonyms: [
        "residence certificate",
        "domicile certificate",
        "nivas praman patra",
      ],
    },
    {
      concept_id: "caste-certificate",
      canonical_name: "Caste certificate",
      synonyms: ["caste proof", "jati praman patra", "community certificate"],
    },
  ];

  it("exact canonical name -> high confidence", () => {
    expect(
      normaliseDocumentName("Local residence certificate", concepts),
    ).toEqual({ conceptId: "local-residence-certificate", confidence: "high" });
  });

  it("exact synonym (case-insensitive, trimmed) -> high confidence", () => {
    expect(
      normaliseDocumentName("  DOMICILE CERTIFICATE ", concepts),
    ).toEqual({ conceptId: "local-residence-certificate", confidence: "high" });
  });

  it("partial/substring match -> low confidence (needs user confirmation)", () => {
    const result = normaliseDocumentName("residence", concepts);
    expect(result.confidence).toBe("low");
    expect(result.conceptId).toBe("local-residence-certificate");
  });

  it("no match -> confidence none, conceptId null", () => {
    expect(normaliseDocumentName("unicorn riding licence", concepts)).toEqual({
      conceptId: null,
      confidence: "none",
    });
  });
});

