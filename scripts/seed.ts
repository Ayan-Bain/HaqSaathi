import fs from "fs";
import path from "path";
import { db } from "../lib/db";

function seed() {
  const cataloguePath = path.join(process.cwd(), "data", "catalogue.json");
  const verifiedPath = path.join(process.cwd(), "data", "schemes-verified.json");
  const feedbackPath = path.join(process.cwd(), "data", "seed-feedback.json");
  const conceptsPath = path.join(process.cwd(), "data", "document-concepts.json");

  const catalogue = JSON.parse(fs.readFileSync(cataloguePath, "utf8"));
  const verified = JSON.parse(fs.readFileSync(verifiedPath, "utf8"));
  const feedbackSeed = JSON.parse(fs.readFileSync(feedbackPath, "utf8"));
  const concepts = JSON.parse(fs.readFileSync(conceptsPath, "utf8"));

  // 1. Seed Schemes (Tier B stubs, then Tier A overwrites)
  const upsertScheme = db.prepare(`
    INSERT OR REPLACE INTO schemes
      (scheme_id, name, jurisdiction, state, category, verification_tier,
       official_apply_url, official_source_url, official_source_checked_at,
       official_documents, official_fee, validity_rules)
    VALUES (@scheme_id, @name, @jurisdiction, @state, @category, @verification_tier,
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
        official_documents: r.official_documents ? JSON.stringify(r.official_documents) : null,
        official_fee: r.official_fee ? JSON.stringify(r.official_fee) : null,
        validity_rules: r.validity_rules ? JSON.stringify(r.validity_rules) : null,
      });
    }
  });

  runSchemes(catalogue); // Tier B stubs
  runSchemes(verified);  // Tier A overwrites

  // 2. Seed Document Concepts
  const upsertConcept = db.prepare(`
    INSERT OR REPLACE INTO document_concepts
      (concept_id, canonical_name, synonyms)
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

  // 3. Seed Feedback (Delete existing demo data to ensure idempotency across seed runs,
  // then use plain INSERT INTO feedback so unique index on case_key is strictly enforced)
  db.prepare("DELETE FROM feedback WHERE is_demo_data = 1").run();

  const insertFeedback = db.prepare(`
    INSERT INTO feedback
      (feedback_id, scheme_id, district_code, verification_date,
       attended, official_list_was_sufficient, additional_document_concepts,
       application_progress, consent_for_aggregate_use, is_demo_data,
       case_key, created_at, quality_status)
    VALUES
      (@feedback_id, @scheme_id, @district_code, @verification_date,
       @attended, @official_list_was_sufficient, @additional_document_concepts,
       @application_progress, @consent_for_aggregate_use, @is_demo_data,
       @case_key, @created_at, @quality_status)
  `);

  const runFeedback = db.transaction((rows: any[]) => {
    for (const r of rows) {
      insertFeedback.run({
        feedback_id: r.feedback_id,
        scheme_id: r.scheme_id,
        district_code: r.district_code ?? null,
        verification_date: r.verification_date,
        attended: r.attended ? 1 : 0,
        official_list_was_sufficient:
          r.official_list_was_sufficient === null || r.official_list_was_sufficient === undefined
            ? null
            : r.official_list_was_sufficient
              ? 1
              : 0,
        additional_document_concepts: JSON.stringify(r.additional_document_concepts ?? []),
        application_progress: r.application_progress ?? null,
        consent_for_aggregate_use: r.consent_for_aggregate_use ? 1 : 0,
        is_demo_data: r.is_demo_data ? 1 : 0,
        case_key: r.case_key,
        created_at: r.created_at,
        quality_status: r.quality_status ?? "valid",
      });
    }
  });

  runFeedback(feedbackSeed);

  console.log("Database seeded successfully.");
}

seed();

