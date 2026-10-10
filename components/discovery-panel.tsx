"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { categoryLabel } from "@/lib/catalogue";
import type { SchemeRecord, MatchResult, DiscoveryProfile } from "@/lib/types";

interface DiscoveryApiResponse {
  matches: MatchResult[];
  message?: string;
  summary?: string;
  disclaimer?: string;
  generatedBy?: string;
}

const AGE_BANDS: DiscoveryProfile["ageBand"][] = ["unknown", "under-18", "18-40", "40-60", "60-plus"];
const AGE_LABEL: Record<DiscoveryProfile["ageBand"], string> = {
  unknown: "Prefer not to say", "under-18": "Under 18", "18-40": "18–40", "40-60": "40–60", "60-plus": "60 or older",
};
const INCOME_BANDS: DiscoveryProfile["incomeBand"][] = ["unknown", "below-1l", "1l-2.5l", "2.5l-5l", "above-5l"];
const INCOME_LABEL: Record<DiscoveryProfile["incomeBand"], string> = {
  unknown: "Prefer not to say", "below-1l": "Below ₹1 lakh", "1l-2.5l": "₹1–2.5 lakh",
  "2.5l-5l": "₹2.5–5 lakh", "above-5l": "Above ₹5 lakh",
};

const BANNER =
  "This is a starting point, not an eligibility decision. HaqSaathi is an independent information tool, not a government service. Confirm on the official portal before you apply.";

export function DiscoveryPanel({ schemes }: { schemes: SchemeRecord[] }) {
  const states = useMemo(() => [...new Set(schemes.flatMap((s) => (s.state ? [s.state] : [])))].sort(), [schemes]);
  const categories = useMemo(() => [...new Set(schemes.flatMap((s) => (s.category ? [s.category] : [])))].sort(), [schemes]);
  const byId = useMemo(() => new Map(schemes.map((s) => [s.scheme_id, s])), [schemes]);

  const [open, setOpen] = useState(false);
  const [state, setState] = useState("");
  const [ageBand, setAgeBand] = useState<DiscoveryProfile["ageBand"]>("unknown");
  const [gender, setGender] = useState<DiscoveryProfile["gender"]>("prefer-not-to-say");
  const [incomeBand, setIncomeBand] = useState<DiscoveryProfile["incomeBand"]>("unknown");
  const [socialCategory, setSocialCategory] = useState<DiscoveryProfile["socialCategory"]>("prefer-not-to-say");
  const [benefitInterest, setBenefitInterest] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiscoveryApiResponse | null>(null);

  function toggleBenefit(cat: string) {
    setBenefitInterest((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    const profile: DiscoveryProfile = { state: state || null, ageBand, gender, incomeBand, socialCategory, benefitInterest };
    try {
      const res = await fetch("/api/discovery/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (!res.ok) {
        setError("We could not load suggestions. Please try again.");
        return;
      }
      setResult((await res.json()) as DiscoveryApiResponse);
    } catch {
      setError("We could not load suggestions. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return <section className="panel discovery-panel" aria-labelledby="discovery-heading">
    <h2 id="discovery-heading">Not sure where to start?</h2>
    <p className="muted">
      Answer a few optional questions and we will suggest schemes worth checking. Nothing you enter is stored,
      and we never ask for Aadhaar, PAN, or bank details.
    </p>
    <button className="button-secondary" type="button" aria-expanded={open} aria-controls="discovery-form"
      onClick={() => setOpen((value) => !value)}>
      {open ? "Hide" : "Find schemes for me"}
    </button>

    {open && <form id="discovery-form" onSubmit={onSubmit}>
      <div className="field-grid">
        <label className="field" htmlFor="d-state">State
          <select className="control" id="d-state" value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">Prefer not to say</option>
            {states.map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label className="field" htmlFor="d-age">Age
          <select className="control" id="d-age" value={ageBand} onChange={(e) => setAgeBand(e.target.value as DiscoveryProfile["ageBand"])}>
            {AGE_BANDS.map((value) => <option key={value} value={value}>{AGE_LABEL[value]}</option>)}
          </select>
        </label>
        <label className="field" htmlFor="d-gender">Gender
          <select className="control" id="d-gender" value={gender} onChange={(e) => setGender(e.target.value as DiscoveryProfile["gender"])}>
            <option value="prefer-not-to-say">Prefer not to say</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="field" htmlFor="d-income">Yearly household income
          <select className="control" id="d-income" value={incomeBand} onChange={(e) => setIncomeBand(e.target.value as DiscoveryProfile["incomeBand"])}>
            {INCOME_BANDS.map((value) => <option key={value} value={value}>{INCOME_LABEL[value]}</option>)}
          </select>
        </label>
        <label className="field" htmlFor="d-social">Social category
          <select className="control" id="d-social" value={socialCategory} onChange={(e) => setSocialCategory(e.target.value as DiscoveryProfile["socialCategory"])}>
            <option value="prefer-not-to-say">Prefer not to say</option>
            <option value="general">General</option>
            <option value="sc">SC</option>
            <option value="st">ST</option>
            <option value="obc">OBC</option>
          </select>
        </label>
      </div>
      <fieldset>
        <legend>What kind of help are you looking for? (optional)</legend>
        <div className="benefit-grid">
          {categories.map((cat) => <label key={cat}>
            <input type="checkbox" checked={benefitInterest.includes(cat)} onChange={() => toggleBenefit(cat)} />
            {categoryLabel(cat)}
          </label>)}
        </div>
      </fieldset>
      <button className="button" type="submit" disabled={loading}>
        {loading ? "Finding…" : "Show schemes worth checking"}
      </button>
    </form>}

    {error && <p role="alert" className="error">{error}</p>}

    {result && <div className="discovery-results">
      <p className="discovery-notice">{result.disclaimer ?? BANNER}</p>
      <p className="results-count" role="status">
        {result.message ?? result.summary ?? `${result.matches.length} scheme(s) worth checking`}
      </p>
      {result.matches.length === 0
        ? <p className="muted">No confident matches. Browse the full catalogue below to explore all schemes.</p>
        : <div className="catalogue-grid">
          {result.matches.map((match) => {
            const scheme = byId.get(match.scheme_id);
            if (!scheme) return null;
            return <article className="scheme-card" key={match.scheme_id}>
              <span className="badge-row">
                <span className={`badge ${match.tier === "verified" ? "badge-official" : "badge-neutral"}`}>
                  {match.tier === "verified" ? "Checklist verified" : "Not yet verified"}
                </span>
                <span className="badge badge-neutral">
                  {match.relevance === "likely" ? "Likely relevant" : "Possibly relevant"}
                </span>
              </span>
              <p className="eyebrow">{scheme.state ?? "Central scheme"} · {categoryLabel(scheme.category)}</p>
              <h3><Link className="card-link" href={`/scheme/${match.scheme_id}`}>{scheme.name}</Link></h3>
              {match.reasons.length > 0 && <ul className="reason-list">
                {match.reasons.map((reason, index) => <li key={index}>{reason}</li>)}
              </ul>}
              <p className="muted">Worth checking — confirm the details on the official portal.</p>
            </article>;
          })}
        </div>}
    </div>}
  </section>;
}
