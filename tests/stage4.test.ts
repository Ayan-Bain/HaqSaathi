import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import fs from "fs";
import path from "path";

// Integration tests run against an ISOLATED temporary database so they never
// race with stage1.test.ts (which asserts community_guidance is empty) on the
// shared ./data/haqsaathi.db file. vi.hoisted runs before the ESM imports are
// initialized, so the env var is set before lib/db opens its singleton. Inside
// vi.hoisted the hoisted `fs`/`path` bindings are not yet available, so node
// built-ins are loaded via require() — the documented pattern for this case.
/* eslint-disable @typescript-eslint/no-require-imports */
const { tmpDir } = vi.hoisted(() => {
  const nodeFs = require("fs") as typeof import("fs");
  const nodePath = require("path") as typeof import("path");
  const nodeOs = require("os") as typeof import("os");
  const dir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "hs-stage4-"));
  process.env.HAQSAATHI_DB_PATH = nodePath.join(dir, "test.db");
  process.env.RECOMPUTE_SECRET = "test-recompute-secret";
  return { tmpDir: dir };
});
/* eslint-enable @typescript-eslint/no-require-imports */

import { db } from "@/lib/db";
import { POST as feedbackPost } from "@/app/api/verification/feedback/route";
import { POST as recomputePost } from "@/app/api/community-guidance/recompute/route";
import { GET as schemeGet } from "@/app/api/schemes/[id]/route";

function readJson(name: string): any {
  return JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "data", name), "utf8"),
  );
}

// Seed the isolated DB with the real committed seed files: Tier B catalogue,
// Tier A overwrites, document concepts, and the 8 synthetic feedback rows.
function seedTempDb() {
  const catalogue = readJson("catalogue.json");
  const verified = readJson("schemes-verified.json");
  const concepts = readJson("document-concepts.json");

  const upsertScheme = db.prepare(`
    INSERT OR REPLACE INTO schemes
      (scheme_id, name, jurisdiction, state, category, verification_tier,
       official_apply_url, official_source_url, official_source_checked_at,
       official_documents, official_fee, validity_rules)
    VALUES
      (@scheme_id, @name, @jurisdiction, @state, @category, @verification_tier,
       @official_apply_url, @official_source_url, @official_source_checked_at,
       @official_documents, @official_fee, @validity_rules)
  `);
  const runSchemes = db.transaction((rows: any[]) => {
    for (const r of rows) {
      upsertScheme.run({
        state: null,
        category: null,
        official_source_url: null,
        official_source_checked_at: null,
        ...r,
        official_documents: r.official_documents
          ? JSON.stringify(r.official_documents)
          : null,
        official_fee: r.official_fee ? JSON.stringify(r.official_fee) : null,
        validity_rules: r.validity_rules ? JSON.stringify(r.validity_rules) : null,
      });
    }
  });
  runSchemes(catalogue);
  runSchemes(verified);

  const upsertConcept = db.prepare(`
    INSERT OR REPLACE INTO document_concepts (concept_id, canonical_name, synonyms)
    VALUES (@concept_id, @canonical_name, @synonyms)
  `);
  const runConcepts = db.transaction((rows: any[]) => {
    for (const r of rows) {
      upsertConcept.run({
        concept_id: r.concept_id,
        canonical_name: r.canonical_name,
        synonyms: JSON.stringify(r.synonyms),
      });
    }
  });
  runConcepts(concepts);

  const insertFeedback = db.prepare(`
    INSERT INTO feedback
      (feedback_id, scheme_id, district_code, verification_date, attended,
       official_list_was_sufficient, additional_document_concepts,
       application_progress, consent_for_aggregate_use, is_demo_data,
       case_key, created_at, quality_status)
    VALUES
      (@feedback_id, @scheme_id, @district_code, @verification_date, @attended,
       @official_list_was_sufficient, @additional_document_concepts,
       @application_progress, @consent_for_aggregate_use, @is_demo_data,
       @case_key, @created_at, @quality_status)
  `);

  // Seed only the 8 synthetic feedback rows (used both for the initial seed
  // and to reset the feedback table back to its pristine demo state between
  // describe blocks, so consensus counts are not polluted by earlier writes).
  const seedFeedback = () => {
    const feedback = readJson("seed-feedback.json");
    const runFeedback = db.transaction((rows: any[]) => {
      for (const r of rows) {
        insertFeedback.run({
          feedback_id: r.feedback_id,
          scheme_id: r.scheme_id,
          district_code: r.district_code ?? null,
          verification_date: r.verification_date,
          attended: r.attended ? 1 : 0,
          official_list_was_sufficient:
            r.official_list_was_sufficient === null ||
            r.official_list_was_sufficient === undefined
              ? null
              : r.official_list_was_sufficient
                ? 1
                : 0,
          additional_document_concepts: JSON.stringify(
            r.additional_document_concepts ?? [],
          ),
          application_progress: r.application_progress ?? null,
          consent_for_aggregate_use: r.consent_for_aggregate_use ? 1 : 0,
          is_demo_data: r.is_demo_data ? 1 : 0,
          case_key: r.case_key,
          created_at: r.created_at,
          quality_status: r.quality_status ?? "valid",
        });
      }
    });
    runFeedback(feedback);
  };

  seedFeedback();
}

// Reset the mutable tables back to the pristine seeded demo state so the
// recompute tests observe exactly the 8 seed records regardless of what the
// feedback-POST tests wrote earlier.
function resetToSeedState() {
  db.prepare("DELETE FROM feedback").run();
  db.prepare("DELETE FROM community_guidance").run();
  db.prepare("DELETE FROM guidance_audit").run();
  seedTempDb();
}

function postFeedback(body: unknown, headers: Record<string, string> = {}) {
  return feedbackPost(
    new Request("http://localhost:3000/api/verification/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

function postRecompute(body: unknown = {}, withSecret = true) {
  return recomputePost(
    new Request("http://localhost:3000/api/community-guidance/recompute", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(withSecret ? { "x-recompute-secret": "test-recompute-secret" } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}

function getScheme(id: string) {
  return schemeGet(new Request(`http://localhost:3000/api/schemes/${id}`), {
    params: Promise.resolve({ id }),
  });
}

const VALID_FEEDBACK = {
  schemeId: "assam-orunodoi",
  districtCode: "AS-KAM",
  verificationDate: "2026-10-05",
  attended: true,
  officialListWasSufficient: false,
  additionalDocumentNames: ["Local residence certificate"],
  consentForAggregateUse: true,
  caseKey: "case-e2e-001",
};

describe("Stage 4 — Feedback and consensus pipeline (end-to-end)", () => {
  beforeAll(() => {
    seedTempDb();
  });

  afterAll(() => {
    // Best-effort cleanup of the isolated temp DB.
    try {
      db.close();
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  describe("POST /api/verification/feedback", () => {
    it("1. No consent flag -> 400", async () => {
      // Destructure to omit the consent field entirely from the payload.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { consentForAggregateUse, ...noConsent } = VALID_FEEDBACK;
      const res = await postFeedback({ ...noConsent, caseKey: "case-noconsent" });
      expect(res.status).toBe(400);
    });

    it("1b. consentForAggregateUse: false -> 400", async () => {
      const res = await postFeedback({
        ...VALID_FEEDBACK,
        consentForAggregateUse: false,
        caseKey: "case-falseconsent",
      });
      expect(res.status).toBe(400);
    });

    it("2. A second submission with the same case_key -> 409, not a duplicate row", async () => {
      const first = await postFeedback({ ...VALID_FEEDBACK, caseKey: "case-dup-001" });
      expect(first.status).toBe(201);

      const second = await postFeedback({ ...VALID_FEEDBACK, caseKey: "case-dup-001" });
      expect(second.status).toBe(409);

      const rows = db
        .prepare("SELECT COUNT(*) AS c FROM feedback WHERE case_key = ?")
        .get("case-dup-001") as { c: number };
      expect(rows.c).toBe(1); // exactly one row, never duplicated
    });

    it("2b. Feedback for a Tier B (listed) scheme is rejected", async () => {
      const res = await postFeedback({
        ...VALID_FEEDBACK,
        schemeId: "pmjay", // Tier B listed scheme
        caseKey: "case-tierb-001",
      });
      expect(res.status).toBe(422);
    });

    it("2c. Low-confidence document name returns needs_confirmation and stores nothing", async () => {
      const res = await postFeedback({
        ...VALID_FEEDBACK,
        additionalDocumentNames: ["residence"], // partial -> low confidence
        caseKey: "case-confirm-001",
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("needs_confirmation");
      expect(json.needsConfirmation[0].suggestedConceptId).toBe(
        "local-residence-certificate",
      );

      const rows = db
        .prepare("SELECT COUNT(*) AS c FROM feedback WHERE case_key = ?")
        .get("case-confirm-001") as { c: number };
      expect(rows.c).toBe(0); // nothing persisted until confirmed
    });

    it("2d. Confirming a suggestion with confirmedConcepts stores the row (201)", async () => {
      const res = await postFeedback({
        ...VALID_FEEDBACK,
        additionalDocumentNames: ["residence"],
        confirmedConcepts: ["local-residence-certificate"],
        caseKey: "case-confirmed-001",
      });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.additionalDocumentConcepts).toContain("local-residence-certificate");
    });
  });


  describe("POST /api/community-guidance/recompute", () => {
    beforeEach(() => {
      // Start every recompute test from the pristine 8-record seed state so the
      // consensus counts are deterministic and unaffected by earlier writes.
      resetToSeedState();
    });

    it("3. Without the shared secret -> 403, no writes", async () => {
      const res = await postRecompute({}, false);
      expect(res.status).toBe(403);
      const rows = db.prepare("SELECT COUNT(*) AS c FROM community_guidance").get() as {
        c: number;
      };
      expect(rows.c).toBe(0);
    });

    it("3b. Seed 8 records -> recompute -> exactly ONE published note", async () => {
      const res = await postRecompute({ today: "2026-10-10" });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);

      // local-residence-certificate publishes; caste-certificate does not.
      const published = db
        .prepare(
          `SELECT document_concept_id, status, valid_report_count, agreement_ratio
             FROM community_guidance
            WHERE status IN ('community-reported','conflicting')`,
        )
        .all() as any[];
      expect(published.length).toBe(1);
      expect(published[0].document_concept_id).toBe("local-residence-certificate");
      expect(published[0].status).toBe("community-reported");
      expect(published[0].valid_report_count).toBe(6);
      // 6 namers / 7 answered ≈ 0.857
      expect(published[0].agreement_ratio).toBeCloseTo(6 / 7, 5);

      // caste-certificate is absent (1 report -> below_min_reports).
      const caste = db
        .prepare(
          `SELECT COUNT(*) AS c FROM community_guidance
            WHERE document_concept_id = 'caste-certificate'`,
        )
        .get() as { c: number };
      expect(caste.c).toBe(0);
    });

    it("3c. guidance_audit has one row per publication, with rule_applied populated", async () => {
      // Self-contained: run recompute here rather than depending on 3b's writes.
      const res = await postRecompute({ today: "2026-10-10" });
      expect(res.status).toBe(200);

      const audits = db
        .prepare(
          `SELECT guidance_id, rule_applied, new_value FROM guidance_audit`,
        )
        .all() as any[];
      // Only local-residence-certificate published -> exactly one audit row.
      expect(audits.length).toBe(1);
      expect(audits[0].guidance_id).toContain("local-residence-certificate");
      expect(audits[0].rule_applied).toContain("community-reported");
      expect(audits[0].rule_applied.length).toBeGreaterThan(0);
    });

    it("3d. Recompute is idempotent — running twice does not duplicate published notes", async () => {
      await postRecompute({ today: "2026-10-10" });
      const published = db
        .prepare(
          `SELECT COUNT(*) AS c FROM community_guidance
            WHERE status IN ('community-reported','conflicting')`,
        )
        .get() as { c: number };
      expect(published.c).toBe(1); // still exactly one
    });
  });

  describe("GET /api/schemes/:id", () => {
    beforeEach(() => {
      // Pristine seed state, then one recompute so a community note exists for
      // the verified scheme. Self-contained — no reliance on other blocks.
      resetToSeedState();
    });

    it("4. Returns official_documents and community_guidance as SEPARATE top-level keys", async () => {
      await postRecompute({ today: "2026-10-10" });
      const res = await getScheme("assam-orunodoi");
      expect(res.status).toBe(200);
      const json = await res.json();

      // Both keys exist and are separate.
      expect(Array.isArray(json.official_documents)).toBe(true);
      expect(Array.isArray(json.community_guidance)).toBe(true);

      // Never merged into one array: the official list contains only official docs.
      const officialIds = json.official_documents.map((d: any) => d.document_id);
      expect(officialIds).toContain("identity-proof");
      expect(officialIds).not.toContain("local-residence-certificate");

      // The community note is a distinct object with its own shape.
      expect(json.community_guidance.length).toBe(1);
      expect(json.community_guidance[0].document_concept_id).toBe(
        "local-residence-certificate",
      );
    });

    it("5. Official document list is BYTE-IDENTICAL before and after recompute", async () => {
      const before = await getScheme("assam-orunodoi");
      const beforeJson = await before.json();
      const officialBefore = JSON.stringify(beforeJson.official_documents);

      // Recompute again (should be a no-op change to the schemes table).
      await postRecompute({ today: "2026-10-10" });

      const after = await getScheme("assam-orunodoi");
      const afterJson = await after.json();
      const officialAfter = JSON.stringify(afterJson.official_documents);

      // The official list is untouched by the community pipeline.
      expect(officialAfter).toBe(officialBefore);

      // And the schemes table itself was never written by recompute.
      const rawRow = db
        .prepare("SELECT official_documents FROM schemes WHERE scheme_id = ?")
        .get("assam-orunodoi") as { official_documents: string };
      expect(rawRow.official_documents).toBe(
        JSON.stringify(JSON.parse(officialBefore)),
      );
    });

    it("6. Tier B scheme returns null official_documents and empty community_guidance", async () => {
      const res = await getScheme("pmjay");
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.official_documents).toBeNull();
      expect(json.community_guidance).toEqual([]);
    });

    it("7. Unknown scheme -> 404", async () => {
      const res = await getScheme("does-not-exist");
      expect(res.status).toBe(404);
    });
  });
});

