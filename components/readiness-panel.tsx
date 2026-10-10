"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import type {
  CheckBasis,
  CheckStatus,
  DocumentInventoryItem,
  SchemeRecord,
  ValidationResult,
} from "@/lib/types";

export interface ReadinessReport {
  status: ValidationResult["overallStatus"];
  summary: string;
  checks: {
    checkId: string;
    status: CheckStatus;
    explanation: string;
    basis: CheckBasis;
    sourceRefs: string[];
  }[];
  followUpQuestion: { key: string; question: string } | null;
  disclaimer: string;
  generatedBy: "agent" | "deterministic";
}

const BASIS_LABEL: Record<CheckBasis, string> = {
  official_rule: "Official rule",
  user_input: "From your input",
  community_report: "Community-reported — not an official requirement",
};

const BASIS_CLASS: Record<CheckBasis, string> = {
  official_rule: "badge-official",
  user_input: "badge-neutral",
  community_report: "badge-community",
};

const STATUS_LABEL: Record<CheckStatus | ReadinessReport["status"], string> = {
  pass: "Pass",
  needs_attention: "Needs attention",
  unknown: "Unknown",
  informational: "Information only",
  ready_for_review: "Ready for review",
  insufficient_information: "Insufficient information",
};

function isReadinessReport(value: unknown): value is ReadinessReport {
  if (!value || typeof value !== "object") return false;
  const report = value as ReadinessReport;
  return (
    ["ready_for_review", "needs_attention", "insufficient_information"].includes(report.status) &&
    typeof report.summary === "string" &&
    typeof report.disclaimer === "string" &&
    ["agent", "deterministic"].includes(report.generatedBy) &&
    (report.followUpQuestion === null ||
      (typeof report.followUpQuestion?.key === "string" &&
        typeof report.followUpQuestion?.question === "string")) &&
    Array.isArray(report.checks) &&
    report.checks.every((check) =>
      check && typeof check.checkId === "string" &&
      typeof check.explanation === "string" &&
      ["pass", "needs_attention", "unknown", "informational"].includes(check.status) &&
      ["official_rule", "user_input", "community_report"].includes(check.basis) &&
      Array.isArray(check.sourceRefs) && check.sourceRefs.every((ref) => typeof ref === "string"),
    )
  );
}

export function ReadinessResult({ report, scheme }: { report: ReadinessReport; scheme: SchemeRecord }) {
  const officialReferences = new Set([
    ...(scheme.official_documents ?? []).map((document) => document.source_reference),
    ...Object.values(scheme.validity_rules ?? {}).map((rule) => rule.source_reference),
    ...(scheme.official_fee ? [scheme.official_fee.source_reference] : []),
  ]);

  return (
    <section className="stack" aria-label="Readiness result">
      <h3>{STATUS_LABEL[report.status]}</h3>
      <p>{report.summary}</p>
      <p className="muted">{report.generatedBy === "agent" ? "Explained by AI" : "Standard explanation"}. Checks are determined by recorded rules, not AI.</p>
      <ul className="stack">
        {report.checks.map((check) => (
          <li key={check.checkId} className={`check-row${check.basis === "community_report" ? " community-panel" : ""}`}>
            <span className={`badge ${BASIS_CLASS[check.basis]}`}>{BASIS_LABEL[check.basis]}</span>{" "}
            <strong>{STATUS_LABEL[check.status]}</strong>
            <p>{check.explanation}</p>
            {check.sourceRefs.length > 0 && (
              <ul>
                {check.sourceRefs.map((reference, index) => (
                  <li key={`${reference}-${index}`}>
                    {officialReferences.has(reference) && scheme.official_source_url ? (
                      <a className="source-link" href={scheme.official_source_url} target="_blank" rel="noopener noreferrer">
                        Official source: {reference} (opens in a new tab)
                      </a>
                    ) : <span>Source reference: {reference}</span>}
                  </li>
                ))}
              </ul>
            )}
            {check.basis === "official_rule" && <p className="muted">Last checked: {scheme.official_source_checked_at ?? "Not recorded"}</p>}
          </li>
        ))}
      </ul>
      {report.followUpQuestion && <p><strong>Follow-up:</strong> {report.followUpQuestion.question}</p>}
      <p className="muted">{report.disclaimer}</p>
      <p className="muted">This is a preparation check, not a guarantee of approval.</p>
    </section>
  );
}

export function ReadinessPanel({ scheme }: { scheme: SchemeRecord }) {
  if (scheme.verification_tier !== "verified") return null;
  return <ReadinessForm key={scheme.scheme_id} scheme={scheme} />;
}

function ReadinessForm({ scheme }: { scheme: SchemeRecord }) {
  const id = useId();
  const documents = scheme.official_documents ?? [];
  const initialInventory = () => documents.map((document) => ({ documentConceptId: document.document_id, available: false }));
  const [inventory, setInventory] = useState<DocumentInventoryItem[]>(initialInventory);
  const [nameMatch, setNameMatch] = useState("not_checked");
  const [report, setReport] = useState<ReadinessReport | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  function clearResult() {
    setReport(null);
    setError(null);
  }

  function updateDocument(conceptId: string, update: Partial<DocumentInventoryItem>) {
    clearResult();
    setInventory((current) => current.map((item) => item.documentConceptId === conceptId ? { ...item, ...update } : item));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    clearResult();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch("/api/application/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          schemeId: scheme.scheme_id,
          confirmedFields: { applicant_name_match_status: nameMatch },
          documentInventory: inventory,
          locale: "en-IN",
        }),
      });
      const data: unknown = await response.json();
      if (!response.ok) throw new Error(`The readiness check could not be completed (HTTP ${response.status}). Please retry.`);
      if (!isReadinessReport(data)) throw new Error("The server returned an unreadable result. Please retry.");
      setReport(data);
    } catch (failure) {
      setError(failure instanceof Error && failure.name !== "AbortError" ? failure.message : "The check timed out. Please retry.");
    } finally {
      clearTimeout(timeout);
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <section className="panel stack" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>Application readiness</h2>
      <p>Mark documents you have available. Do not enter names, identity numbers, or upload documents.</p>
      <form onSubmit={submit} className="stack" aria-busy={pending}>
        <fieldset disabled={pending} className="stack">
          <legend>Your document checklist</legend>
          {documents.map((document) => {
            const item = inventory.find((entry) => entry.documentConceptId === document.document_id)!;
            const rule = scheme.validity_rules?.[document.document_id];
            return (
              <div className="check-row stack" key={document.document_id}>
                <label className="field" htmlFor={`${id}-${document.document_id}`}>
                  <span><input id={`${id}-${document.document_id}`} type="checkbox" checked={item.available} onChange={(event) => updateDocument(document.document_id, { available: event.target.checked })} /> I have {document.name}</span>
                </label>
                <span className="badge badge-official">Official rule</span>
                {scheme.official_source_url ? <a className="source-link" href={scheme.official_source_url} target="_blank" rel="noopener noreferrer">Official source: {document.source_reference} (opens in a new tab)</a> : <span>Source reference: {document.source_reference}</span>}
                <p className="muted">Last checked: {scheme.official_source_checked_at ?? "Not recorded"}</p>
                {rule && item.available && (
                  <div className="stack">
                    <p className="muted">Recorded validity rule: {rule.max_age_months} months. Leave dates blank if unknown. If both dates are supplied, the expiry date is used.</p>
                    <div className="field-grid">
                      <label className="field">Issue date for {document.name}<input className="control" type="date" value={item.issueDate ?? ""} onChange={(event) => updateDocument(document.document_id, { issueDate: event.target.value || null })} /></label>
                      <label className="field">Expiry date for {document.name}<input className="control" type="date" value={item.expiryDate ?? ""} onChange={(event) => updateDocument(document.document_id, { expiryDate: event.target.value || null })} /></label>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <label className="field" htmlFor={`${id}-name-match`}>Do the names on your documents match?</label>
          <select className="control" id={`${id}-name-match`} value={nameMatch} onChange={(event) => { clearResult(); setNameMatch(event.target.value); }}>
            <option value="not_checked">I have not checked / I do not know</option>
            <option value="match_confirmed">Yes, they match</option>
            <option value="mismatch_detected">No, there is a mismatch</option>
          </select>
          <p className="muted">Only this status is sent. We do not collect or compare your actual name.</p>
          <button className="button" type="submit">{pending ? "Checking…" : error ? "Retry readiness check" : "Check readiness"}</button>
          <button className="button-secondary" type="button" onClick={() => { setInventory(initialInventory()); setNameMatch("not_checked"); clearResult(); }}>Reset checklist</button>
        </fieldset>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      <div aria-live="polite" aria-atomic="true">
        {pending && <p role="status">Checking the recorded rules. Please wait.</p>}
        {report && <ReadinessResult report={report} scheme={scheme} />}
      </div>
    </section>
  );
}