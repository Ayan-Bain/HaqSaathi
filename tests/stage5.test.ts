import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Catalogue } from "@/components/catalogue";
import { SchemeDetail } from "@/components/scheme-detail";
import { CommunityNote } from "@/components/community-note";
import { ReadinessResult, type ReadinessReport } from "@/components/readiness-panel";
import { FeedbackForm } from "@/components/feedback-form";
import { filterCatalogue } from "@/lib/catalogue";
import { getCatalogue, getSchemeRecord, db } from "@/lib/db";
import { validateApplication } from "@/lib/validateApplication";
import { buildDeterministicReadinessReport } from "@/lib/fallback";
import type { CommunityGuidanceRecord, SchemeRecord } from "@/lib/types";

const verified = getSchemeRecord("assam-orunodoi")!;
const note: CommunityGuidanceRecord = {
  guidance_id: "test-note", scheme_id: verified.scheme_id,
  document_concept_id: "local-residence-certificate", canonical_name: "Local residence certificate",
  scope_state: "Assam", scope_district_code: "AS-KAM", status: "community-reported",
  valid_report_count: 6, agreement_ratio: 6 / 7,
  first_reported_at: "2026-09-10", last_reported_at: "2026-09-28",
  published_at: "2026-10-10", expires_or_review_at: null, evidence_summary: null,
  official_source_confirms: 0, version: 1, is_demo_data: true,
};

describe("Stage 5 — catalogue and scheme UI", () => {
  it("renders every database row with tier badges, verified dates and verified-first order", () => {
    const schemes = getCatalogue();
    const count = (db.prepare("SELECT COUNT(*) AS count FROM schemes").get() as { count: number }).count;
    const html = renderToStaticMarkup(createElement(Catalogue, { schemes }));
    expect(schemes).toHaveLength(count);
    expect(html).toContain(`Showing ${count} of ${count} schemes`);
    expect(html.match(/class="scheme-card"/g)).toHaveLength(count);
    for (const scheme of schemes) expect(html).toContain(`/scheme/${scheme.scheme_id}`);
    const firstListed = schemes.findIndex((scheme) => scheme.verification_tier === "listed");
    expect(schemes.slice(firstListed).every((scheme) => scheme.verification_tier === "listed")).toBe(true);
    expect(html.match(/Checklist verified ·/g)).toHaveLength(firstListed);
    expect(html.match(/Not yet verified/g)).toHaveLength(count - firstListed);
    expect(html).toContain("2026-10-10");
  });

  it("combines state and category filters without changing catalogue data", () => {
    const schemes = getCatalogue();
    const snapshot = JSON.stringify(schemes);
    expect(filterCatalogue(schemes, "Assam", "income-support").map((s) => s.scheme_id)).toEqual(["assam-orunodoi"]);
    expect(filterCatalogue(schemes, "central", "health").map((s) => s.scheme_id)).toEqual(["pmjay"]);
    expect(filterCatalogue(schemes, "Assam", "health")).toEqual([]);
    expect(filterCatalogue(schemes, "", "")).toHaveLength(schemes.length);
    expect(JSON.stringify(schemes)).toBe(snapshot);
  });

  it("Tier B early return suppresses fee, checklist, readiness, feedback and even supplied notes", () => {
    const html = renderToStaticMarkup(createElement(SchemeDetail, { scheme: getSchemeRecord("pmjay")!, guidance: [note] }));
    expect(html).toContain("Not yet verified");
    expect(html).toContain("Anything we showed here would be a guess");
    expect(html).toContain("Open the official portal");
    for (const forbidden of ["<form", "type=\"checkbox\"", "Application readiness", "Fees and help", "community-panel"]) {
      expect(html).not.toContain(forbidden);
    }
  });

  it("shows a source and check date on each official row, and separates ordered sections", () => {
    const html = renderToStaticMarkup(createElement(SchemeDetail, { scheme: verified, guidance: [note] }));
    const official = html.slice(html.indexOf('<ul class="document-list">'), html.indexOf('</ul>'));
    for (const document of verified.official_documents!) {
      expect(official).toContain(document.source_reference);
    }
    expect(official.match(/Last checked: 2026-10-10/g)).toHaveLength(verified.official_documents!.length);
    expect(official).not.toContain("local-residence-certificate");
    expect(html.indexOf("official-panel")).toBeLessThan(html.indexOf("community-panel"));
    expect(html.indexOf("community-panel")).toBeLessThan(html.indexOf("Application readiness"));
    expect(html.indexOf("Application readiness")).toBeLessThan(html.indexOf("Fees and help"));
  });

  it("does not render an empty community panel or withdrawn notes", () => {
    const scheme = getSchemeRecord("pm-kisan") as SchemeRecord;
    for (const guidance of [[], [{ ...note, status: "withdrawn" as const }]]) {
      const html = renderToStaticMarkup(createElement(SchemeDetail, { scheme, guidance }));
      expect(html).not.toContain("Community-reported experiences");
      expect(html).not.toContain('class="panel community-panel"');
    }
  });

  it("labels synthetic evidence, count, dates, scope and uncertainty prominently", () => {
    const html = renderToStaticMarkup(createElement(CommunityNote, { note }));
    for (const text of ["not an official requirement", "DEMO DATA", "6 applicant reports", "2026-09-10", "2026-09-28", "AS-KAM", "Please confirm"]) expect(html).toContain(text);
    const conflicting = renderToStaticMarkup(createElement(CommunityNote, { note: { ...note, status: "conflicting" } }));
    expect(conflicting).toContain("Applicants reported different experiences");
    const real = renderToStaticMarkup(createElement(CommunityNote, { note: { ...note, is_demo_data: false } }));
    expect(real).not.toContain("DEMO DATA");
  });

  it("renders missing-document rule explanations, every basis badge, sources and generation label", () => {
    const validation = validateApplication({ scheme: verified, documentInventory: [], confirmedFields: { applicant_name_match_status: "mismatch_detected" }, publishedGuidance: [note] });
    const report = buildDeterministicReadinessReport(validation) as ReadinessReport;
    const html = renderToStaticMarkup(createElement(ReadinessResult, { report, scheme: verified }));
    for (const text of ["Official rule", "From your input", "Community-reported", "Standard explanation", "is on the official list", "assam-orunodoi-src-1"]) expect(html).toContain(text);
    expect(html.match(/class="badge(?: [^"]*)?"/g)).toHaveLength(report.checks.length);
    const ai = renderToStaticMarkup(createElement(ReadinessResult, { report: { ...report, generatedBy: "agent" }, scheme: verified }));
    expect(ai).toContain("Explained by AI");
    expect(ai).toContain(report.summary);
  });

  it("offers non-attendance and non-disclosure options without personal identifier fields", () => {
    const html = renderToStaticMarkup(createElement(FeedbackForm, { schemeId: verified.scheme_id }));
    expect(html).toContain("Visit postponed");
    expect(html).toContain("I do not know");
    expect(html).toContain("Prefer not to answer");
    expect(html).toContain("consent");
    expect(html).not.toContain('type="file"');
    expect(html).not.toContain('type="tel"');
  });
});