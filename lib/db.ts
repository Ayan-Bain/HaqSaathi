import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { SchemeRecord, CommunityGuidanceRecord } from "./types";

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new Database(path.join(dataDir, "haqsaathi.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS schemes (
  scheme_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,          -- central | state
  state TEXT,
  category TEXT,                       -- income-support | health | housing | pension | ...
  verification_tier TEXT NOT NULL,     -- 'verified' | 'listed'
  official_apply_url TEXT NOT NULL,
  official_source_url TEXT,            -- NULL allowed for tier 'listed'
  official_source_checked_at TEXT,     -- NULL allowed for tier 'listed'
  official_documents TEXT,             -- JSON array; NULL for tier 'listed'
  official_fee TEXT,                   -- JSON object; NULL for tier 'listed'
  validity_rules TEXT,                 -- JSON object; NULL for tier 'listed'
  CHECK (verification_tier IN ('verified','listed')),
  CHECK (
    verification_tier = 'listed' OR
    (official_source_url IS NOT NULL
     AND official_source_checked_at IS NOT NULL
     AND official_documents IS NOT NULL
     AND official_fee IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS feedback (
  feedback_id TEXT PRIMARY KEY,
  scheme_id TEXT NOT NULL,
  district_code TEXT,
  verification_date TEXT NOT NULL,
  attended INTEGER NOT NULL,
  official_list_was_sufficient INTEGER,
  additional_document_concepts TEXT NOT NULL, -- JSON array
  application_progress TEXT,
  consent_for_aggregate_use INTEGER NOT NULL,
  is_demo_data INTEGER NOT NULL DEFAULT 0,
  case_key TEXT NOT NULL,             -- dedupe key: device/account + scheme + visit
  created_at TEXT NOT NULL,
  quality_status TEXT NOT NULL DEFAULT 'pending-validation'
);

CREATE UNIQUE INDEX IF NOT EXISTS feedback_case_unique ON feedback(case_key);

CREATE TABLE IF NOT EXISTS community_guidance (
  guidance_id TEXT PRIMARY KEY,
  scheme_id TEXT NOT NULL,
  document_concept_id TEXT NOT NULL,
  scope_state TEXT,
  scope_district_code TEXT,
  status TEXT NOT NULL,               -- community-reported | conflicting | withdrawn
  valid_report_count INTEGER NOT NULL,
  agreement_ratio REAL NOT NULL,
  first_reported_at TEXT,
  last_reported_at TEXT,
  published_at TEXT,
  expires_or_review_at TEXT,
  evidence_summary TEXT,
  official_source_confirms INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS guidance_audit (
  audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
  guidance_id TEXT,
  scheme_id TEXT NOT NULL,
  document_concept_id TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  rule_applied TEXT NOT NULL,
  evidence_summary TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS document_concepts (
  concept_id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  synonyms TEXT NOT NULL             -- JSON array, lowercased
);
`);

export function getApprovedSchemeRecord(schemeId: string): SchemeRecord | null {
  const row = db.prepare(`
    SELECT * FROM schemes
    WHERE scheme_id = ? AND verification_tier = 'verified'
  `).get(schemeId) as any;

  if (!row) return null;

  return {
    ...row,
    official_documents: row.official_documents ? JSON.parse(row.official_documents) : null,
    official_fee: row.official_fee ? JSON.parse(row.official_fee) : null,
    validity_rules: row.validity_rules ? JSON.parse(row.validity_rules) : null,
  };
}

export function getPublishedGuidance(schemeId: string): CommunityGuidanceRecord[] {
  const rows = db.prepare(`
    SELECT cg.*, dc.canonical_name
    FROM community_guidance cg
    LEFT JOIN document_concepts dc ON cg.document_concept_id = dc.concept_id
    WHERE cg.scheme_id = ? AND cg.status IN ('community-reported', 'conflicting')
  `).all(schemeId) as any[];

  return rows.map((r) => ({
    ...r,
    official_source_confirms: Boolean(r.official_source_confirms),
  }));
}

export function projectApprovedSchemeForAgent(scheme: SchemeRecord) {
  return {
    scheme_id: scheme.scheme_id,
    name: scheme.name,
    jurisdiction: scheme.jurisdiction,
    state: scheme.state,
    category: scheme.category,
    official_apply_url: scheme.official_apply_url,
    official_source_url: scheme.official_source_url,
    official_source_checked_at: scheme.official_source_checked_at,
    official_documents: scheme.official_documents,
    official_fee: scheme.official_fee,
    validity_rules: scheme.validity_rules,
  };
}
