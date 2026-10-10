"use client";

import { useState, type FormEvent } from "react";

export interface DemandCheckResult {
  verdict: "unknown" | "mismatch" | "match";
  message: string;
  script: string | null;
  sourceUrl: string | null;
}

export function DemandCheckPanel({ scheme }: { scheme: { scheme_id: string; official_source_url: string | null } }) {
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<DemandCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setPending(true);

    const reportedAmount = amount.trim() === "" ? 0 : Number(amount);
    if (!Number.isInteger(reportedAmount) || reportedAmount < 0) {
      setError("Please enter a valid whole number (₹).");
      setPending(false);
      return;
    }

    try {
      const res = await fetch("/api/demand-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemeId: scheme.scheme_id, reportedAmountInr: reportedAmount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Demand check failed.");
        return;
      }
      setResult(data);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const verdictColors: Record<DemandCheckResult["verdict"], { bg: string; text: string; label: string }> = {
    unknown: { bg: "bg-neutral-100", text: "text-neutral-800", label: "Unknown" },
    mismatch: { bg: "bg-red-100", text: "text-red-800", label: "Mismatch" },
    match: { bg: "bg-green-100", text: "text-green-800", label: "Matches official record" },
  };

  return (
    <section className="panel" aria-labelledby="demand-check-heading">
      <h2 id="demand-check-heading">Fees and help — Demand Check</h2>
      <p className="muted">
        Compare what you were asked to pay against the verified official fee record. We never call a payment "corrupt" or "illegal" — we report a discrepancy between two documents, and you decide what it means.
      </p>
      <form onSubmit={handleSubmit} className="stack" aria-busy={pending}>
        <label className="field" htmlFor="demand-amount">
          Amount you were asked to pay (₹, whole number; 0 if no fee was demanded)
          <input
            id="demand-amount"
            className="control"
            type="number"
            min={0}
            step={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={pending}
            placeholder="e.g., 0 or 500"
          />
        </label>
        <button className="button" type="submit" disabled={pending}>
          {pending ? "Checking…" : "Run Demand Check"}
        </button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {result && (
        <div className="stack" role="status" aria-live="polite">
          <div className={`badge ${verdictColors[result.verdict].bg} ${verdictColors[result.verdict].text}`}>
            {verdictColors[result.verdict].label}
          </div>
          <p>{result.message}</p>
          {result.script && (
            <p className="muted">
              <strong>Suggested question to the office:</strong> {result.script}
            </p>
          )}
          {result.sourceUrl && (
            <a className="source-link" href={result.sourceUrl} target="_blank" rel="noopener noreferrer">
              Official source ↗
            </a>
          )}
        </div>
      )}
      <p className="muted">
        We only show escalation channels we personally verified. If no helpline is shown, we could not confirm one.
        HaqSaathi is an independent information tool, not a government service.
      </p>
    </section>
  );
}