import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import fs from "fs";
import path from "path";

/* eslint-disable @typescript-eslint/no-require-imports */
const { tmpDir } = vi.hoisted(() => {
  const nodeFs = require("fs") as typeof import("fs");
  const nodePath = require("path") as typeof import("path");
  const nodeOs = require("os") as typeof import("os");
  const dir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "hs-stage6-"));
  process.env.HAQSAATHI_DB_PATH = nodePath.join(dir, "test.db");
  return { tmpDir: dir };
});
/* eslint-enable @typescript-eslint/no-require-imports */

import { db } from "@/lib/db";
import { POST as demandCheckPost } from "@/app/api/demand-check/route";

function readJson(name: string): any {
  return JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "data", name), "utf8"),
  );
}

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
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/demand-check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Stage 6 — Demand Check", () => {
  beforeAll(() => {
    seedTempDb();
  });

  beforeEach(() => {
    seedTempDb();
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("rejects Tier B schemes with 400", async () => {
    const res = await demandCheckPost(makeRequest({ schemeId: "pmjay", reportedAmountInr: 0 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("verified");
  });

  it("returns match when reported amount equals verified zero fee", async () => {
    const res = await demandCheckPost(makeRequest({ schemeId: "assam-orunodoi", reportedAmountInr: 0 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.verdict).toBe("match");
    expect(json.message).toContain("matches");
  });

  it("returns mismatch when reported amount > 0 but verified fee is 0", async () => {
    const res = await demandCheckPost(makeRequest({ schemeId: "assam-orunodoi", reportedAmountInr: 500 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.verdict).toBe("mismatch");
    expect(json.message).toContain("no application fee");
    expect(json.script).toContain("show me the official fee rule");
    expect(json.sourceUrl).toBeTruthy();
  });

  it("returns mismatch when reported amount differs from verified positive fee", async () => {
    // Set up a scheme with a positive verified fee for this test
    db.prepare(`
      INSERT OR REPLACE INTO schemes
        (scheme_id, name, jurisdiction, state, category, verification_tier,
         official_apply_url, official_source_url, official_source_checked_at,
         official_documents, official_fee, validity_rules)
      VALUES
        ('test-positive-fee', 'Test Positive Fee', 'central', null, 'test', 'verified',
         'https://example.com', 'https://example.com', '2026-10-10',
         '[]', '{"amount_inr":100,"status":"verified","source_reference":"test-src-1","checked_at":"2026-10-10"}', '{}')
    `).run();

    const res = await demandCheckPost(makeRequest({ schemeId: "test-positive-fee", reportedAmountInr: 50 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.verdict).toBe("mismatch");
    expect(json.message).toContain("₹100");
    expect(json.message).toContain("₹50");
  });

  it("returns match when reported amount equals verified positive fee", async () => {
    const res = await demandCheckPost(makeRequest({ schemeId: "test-positive-fee", reportedAmountInr: 100 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.verdict).toBe("match");
    expect(json.message).toContain("matches");
  });

  it("returns unknown when fee record exists but status is unverified", async () => {
    db.prepare(`
      INSERT OR REPLACE INTO schemes
        (scheme_id, name, jurisdiction, state, category, verification_tier,
         official_apply_url, official_source_url, official_source_checked_at,
         official_documents, official_fee, validity_rules)
      VALUES
        ('test-unverified-fee', 'Test Unverified Fee', 'central', null, 'test', 'verified',
         'https://example.com', 'https://example.com', '2026-10-10',
         '[]', '{"amount_inr":0,"status":"unverified","source_reference":"test-src-1","checked_at":"2026-10-10"}', '{}')
    `).run();

    const res = await demandCheckPost(makeRequest({ schemeId: "test-unverified-fee", reportedAmountInr: 0 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.verdict).toBe("unknown");
    expect(json.message).toContain("verified fee record");
  });

  it("returns 404 for unknown scheme", async () => {
    const res = await demandCheckPost(makeRequest({ schemeId: "does-not-exist", reportedAmountInr: 0 }));
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid request body", async () => {
    const res = await demandCheckPost(makeRequest({ schemeId: "", reportedAmountInr: 0 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for negative amount", async () => {
    const res = await demandCheckPost(makeRequest({ schemeId: "assam-orunodoi", reportedAmountInr: -100 }));
    expect(res.status).toBe(400);
  });

  it("returns 413 for oversized body", async () => {
    const hugeBody = { schemeId: "assam-orunodoi", reportedAmountInr: 0, padding: "x".repeat(10000) };
    const res = await demandCheckPost(new Request("http://localhost/api/demand-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(hugeBody),
    }));
    expect(res.status).toBe(413);
  });

  it("never uses words 'corrupt', 'illegal', or 'bribe' in any response", async () => {
    const res = await demandCheckPost(makeRequest({ schemeId: "assam-orunodoi", reportedAmountInr: 500 }));
    const json = await res.json();
    const text = JSON.stringify(json).toLowerCase();
    expect(text).not.toContain("corrupt");
    expect(text).not.toContain("illegal");
    expect(text).not.toContain("bribe");
  });
});