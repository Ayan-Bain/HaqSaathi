import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildDeterministicReadinessReport } from "@/lib/fallback";
import type { ValidationResult } from "@/lib/types";
import { ReadinessResult, type ReadinessReport } from "@/components/readiness-panel";
import { getApprovedSchemeRecord } from "@/lib/db";
import { POST } from "@/app/api/application/check/route";

// Deterministic SDK double: verifies the UI/API toggle without provider credentials.
// This is NOT a claim that a live model was exercised.
vi.mock("@cline/agents", () => ({
  Agent: class {
    abort() {}
    async run(raw: string) {
      const { validation } = JSON.parse(raw) as { validation: ValidationResult };
      const report = buildDeterministicReadinessReport(validation);
      return { status: "completed", outputText: JSON.stringify({
        ...report,
        summary: "Please review the checks below before your visit.",
        checks: report.checks.map((check) => ({ ...check, explanation: `Plain-language version: ${check.explanation}` })),
      }) };
    }
  },
}));

afterEach(() => vi.unstubAllEnvs());

describe("Stage 5 — FORCE_FALLBACK presentation contract (mocked SDK)", () => {
  it("changes explanation and generation label without changing facts or sources", async () => {
    vi.stubEnv("CLINE_MODEL_API_KEY", "test-only-not-a-key");
    vi.stubEnv("CLINE_PROVIDER_ID", "anthropic");
    vi.stubEnv("CLINE_MODEL_ID", "test-model");
    const request = () => new Request("http://localhost/api/application/check", {
      method: "POST", body: JSON.stringify({ schemeId: "assam-orunodoi", confirmedFields: {}, documentInventory: [] }),
    });
    vi.stubEnv("FORCE_FALLBACK", "1");
    const standard = await (await POST(request())).json() as ReadinessReport;
    vi.stubEnv("FORCE_FALLBACK", "0");
    const explained = await (await POST(request())).json() as ReadinessReport;
    expect(standard.generatedBy).toBe("deterministic");
    expect(explained.generatedBy).toBe("agent");
    expect(standard.summary).not.toBe(explained.summary);
    expect(standard.status).toBe(explained.status);
    const facts = (report: ReadinessReport) => report.checks.map(({ checkId, basis, status, sourceRefs }) => ({ checkId, basis, status, sourceRefs }));
    expect(facts(standard)).toEqual(facts(explained));
    expect(standard.checks[0].explanation).not.toBe(explained.checks[0].explanation);
    const scheme = getApprovedSchemeRecord("assam-orunodoi")!;
    expect(renderToStaticMarkup(createElement(ReadinessResult, { report: standard, scheme }))).toContain("Standard explanation");
    expect(renderToStaticMarkup(createElement(ReadinessResult, { report: explained, scheme }))).toContain("Explained by AI");
  });
});