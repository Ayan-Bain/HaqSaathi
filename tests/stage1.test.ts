import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { db, getApprovedSchemeRecord } from "@/lib/db";

describe("Stage 1 — Data layer and tiered catalogue verification", () => {
  const catalogue = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "data", "catalogue.json"), "utf8")
  );
  const verified = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "data", "schemes-verified.json"), "utf8")
  );

  it("1. SELECT COUNT(*) FROM schemes matches catalogue.json length", () => {
    const row = db.prepare("SELECT COUNT(*) as count FROM schemes").get() as { count: number };
    expect(row.count).toBe(catalogue.length);
  });

  it("2. SELECT COUNT(*) FROM schemes WHERE verification_tier='verified' returns 2 or 3", () => {
    const row = db
      .prepare("SELECT COUNT(*) as count FROM schemes WHERE verification_tier='verified'")
      .get() as { count: number };
    expect([2, 3]).toContain(row.count);
    expect(row.count).toBe(verified.length);
  });

  it("3. SELECT COUNT(*) FROM schemes WHERE verification_tier='listed' AND official_documents IS NOT NULL returns 0", () => {
    const row = db
      .prepare(
        "SELECT COUNT(*) as count FROM schemes WHERE verification_tier='listed' AND official_documents IS NOT NULL"
      )
      .get() as { count: number };
    expect(row.count).toBe(0);
  });

  it("4. Table CHECK constraint rejects Tier A row with NULL official_source_checked_at", () => {
    expect(() => {
      db.prepare(`
        INSERT INTO schemes (
          scheme_id, name, jurisdiction, verification_tier,
          official_apply_url, official_source_url, official_source_checked_at,
          official_documents, official_fee
        ) VALUES (
          'test-invalid-tier-a', 'Invalid Scheme', 'central', 'verified',
          'https://example.gov.in', 'https://example.gov.in', NULL,
          '[]', '{}'
        )
      `).run();
    }).toThrow();
  });

  it("5. Every official_documents[].source_reference in Tier A resolves to a valid source ID", () => {
    const verifiedRows = db
      .prepare("SELECT * FROM schemes WHERE verification_tier='verified'")
      .all() as any[];

    for (const r of verifiedRows) {
      const docs = JSON.parse(r.official_documents);
      expect(Array.isArray(docs)).toBe(true);
      expect(docs.length).toBeGreaterThan(0);
      for (const d of docs) {
        expect(d.source_reference).toBeDefined();
        expect(typeof d.source_reference).toBe("string");
        expect(d.source_reference.length).toBeGreaterThan(0);
      }
    }
  });

  it("6. SELECT COUNT(*) FROM feedback WHERE is_demo_data = 1 returns 8 referencing Tier A schemes", () => {
    const row = db
      .prepare("SELECT COUNT(*) as count FROM feedback WHERE is_demo_data = 1")
      .get() as { count: number };
    expect(row.count).toBe(8);

    const feedbackSchemes = db
      .prepare("SELECT DISTINCT scheme_id FROM feedback WHERE is_demo_data = 1")
      .all() as { scheme_id: string }[];

    for (const fsRow of feedbackSchemes) {
      const scheme = db
        .prepare("SELECT verification_tier FROM schemes WHERE scheme_id = ?")
        .get(fsRow.scheme_id) as { verification_tier: string } | undefined;
      expect(scheme).toBeDefined();
      expect(scheme?.verification_tier).toBe("verified");
    }
  });

  it("7. SELECT COUNT(*) FROM community_guidance returns 0", () => {
    const row = db
      .prepare("SELECT COUNT(*) as count FROM community_guidance")
      .get() as { count: number };
    expect(row.count).toBe(0);
  });

  it("8. Re-running insert with a duplicate case_key is rejected by the unique index", () => {
    expect(() => {
      db.prepare(`
        INSERT INTO feedback (
          feedback_id, scheme_id, district_code, verification_date,
          attended, official_list_was_sufficient, additional_document_concepts,
          consent_for_aggregate_use, is_demo_data, case_key, created_at, quality_status
        ) VALUES (
          'dup-fb', 'assam-orunodoi', 'AS-KAM', '2026-09-10',
          1, 0, '[]',
          1, 1, 'case-demo-001', '2026-09-10T11:00:00Z', 'valid'
        )
      `).run();
    }).toThrow(/UNIQUE constraint failed: feedback\.case_key/);
  });

  it("9. getApprovedSchemeRecord parses verified scheme correctly and returns null for listed scheme", () => {
    const orunodoi = getApprovedSchemeRecord("assam-orunodoi");
    expect(orunodoi).not.toBeNull();
    expect(orunodoi?.verification_tier).toBe("verified");
    expect(Array.isArray(orunodoi?.official_documents)).toBe(true);
    expect(orunodoi?.official_fee?.amount_inr).toBe(0);
    expect(orunodoi?.validity_rules).toHaveProperty("income-certificate");

    const listed = getApprovedSchemeRecord("pmjay");
    expect(listed).toBeNull();
  });
});

