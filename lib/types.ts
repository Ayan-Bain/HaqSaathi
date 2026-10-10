export type CheckType =
  | "missing_document"
  | "missing_field"
  | "date_check"
  | "mismatch"
  | "community_note";

export type CheckStatus = "pass" | "needs_attention" | "unknown" | "informational";
export type CheckBasis = "official_rule" | "user_input" | "community_report";

export interface CheckResult {
  checkId: string;
  checkType: CheckType;
  status: CheckStatus;
  basis: CheckBasis;
  messageKey: string;
  sourceRefs: string[];
  params?: Record<string, string | number | null>;
}

export interface ValidationResult {
  overallStatus: "ready_for_review" | "needs_attention" | "insufficient_information";
  checks: CheckResult[];
  allowedFollowUpKeys: string[];
  allowedCheckIds: string[];
  allowedSourceRefs: string[];
}

export interface DocumentInventoryItem {
  documentConceptId: string;
  available: boolean;
  issueDate?: string | null;
  expiryDate?: string | null;
}

export interface OfficialDocument {
  document_id: string;
  name: string;
  source_reference: string;
  is_official: boolean;
}

export interface OfficialFee {
  amount_inr: number;
  status: "verified" | "unverified";
  source_reference: string;
  checked_at?: string;
}

export interface ValidityRule {
  max_age_months: number;
  source_reference: string;
}

export interface SchemeRecord {
  scheme_id: string;
  name: string;
  jurisdiction: "central" | "state";
  state: string | null;
  category: string | null;
  verification_tier: "verified" | "listed";
  official_apply_url: string;
  official_source_url: string | null;
  official_source_checked_at: string | null;
  official_documents: OfficialDocument[] | null;
  official_fee: OfficialFee | null;
  validity_rules: Record<string, ValidityRule> | null;
}

export interface FeedbackRecord {
  feedback_id: string;
  scheme_id: string;
  district_code: string | null;
  verification_date: string;
  attended: boolean;
  official_list_was_sufficient: boolean | null;
  additional_document_concepts: string[];
  application_progress: string | null;
  consent_for_aggregate_use: boolean;
  is_demo_data: boolean;
  case_key: string;
  created_at: string;
  quality_status: string;
}

export interface CommunityGuidanceRecord {
  guidance_id: string;
  scheme_id: string;
  document_concept_id: string;
  scope_state: string | null;
  scope_district_code: string | null;
  status: "community-reported" | "conflicting" | "withdrawn";
  valid_report_count: number;
  agreement_ratio: number;
  first_reported_at: string | null;
  last_reported_at: string | null;
  published_at: string | null;
  expires_or_review_at: string | null;
  evidence_summary: string | null;
  official_source_confirms: number;
  version: number;
  canonical_name?: string;
  is_demo_data?: boolean;
}

export interface DocumentConceptRecord {
  concept_id: string;
  canonical_name: string;
  synonyms: string[];
}

// Stage 7 — Scheme Discovery
export interface DiscoveryProfile {
  state: string | null;
  ageBand: "under-18" | "18-40" | "40-60" | "60-plus" | "unknown";
  gender: "female" | "male" | "other" | "prefer-not-to-say";
  incomeBand: "below-1l" | "1l-2.5l" | "2.5l-5l" | "above-5l" | "unknown";
  socialCategory: "general" | "sc" | "st" | "obc" | "prefer-not-to-say";
  benefitInterest: string[];
}

export interface EligibilityCriteria {
  states?: string[] | null;
  gender?: Array<"female" | "male" | "other"> | null;
  min_age?: number | null;
  max_household_income_inr_annual?: number | null;
  social_categories?: Array<"general" | "sc" | "st" | "obc"> | null;
  source_reference: string;
  status: "verified" | "indicative";
}

export interface SchemeForMatch {
  scheme_id: string;
  name: string;
  jurisdiction: "central" | "state";
  state: string | null;
  category: string | null;
  verification_tier: "verified" | "listed";
  eligibility?: EligibilityCriteria | null;
}

export interface MatchResult {
  scheme_id: string;
  tier: "verified" | "listed";
  relevance: "likely" | "possible";
  reasons: string[];
}

export interface DiscoveryResponse {
  matches: MatchResult[];
  message: string;
  generatedBy: "agent" | "deterministic";
}

