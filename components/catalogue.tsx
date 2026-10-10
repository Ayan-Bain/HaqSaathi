"use client";

import Link from "next/link";
import { useState } from "react";
import { categoryLabel, filterCatalogue } from "@/lib/catalogue";
import type { SchemeRecord } from "@/lib/types";

export function Catalogue({ schemes }: { schemes: SchemeRecord[] }) {
  const [state, setState] = useState("");
  const [category, setCategory] = useState("");
  const states = [...new Set(schemes.flatMap((scheme) => scheme.state ? [scheme.state] : []))].sort();
  const categories = [...new Set(schemes.flatMap((scheme) => scheme.category ? [scheme.category] : []))].sort();
  const visible = filterCatalogue(schemes, state, category);

  return <>
    <div className="panel filter-panel">
      <div className="field-grid">
        <label className="field" htmlFor="state-filter">State or jurisdiction
          <select className="control" id="state-filter" value={state} onChange={(event) => setState(event.target.value)}>
            <option value="">All states and central schemes</option>
            <option value="central">Central schemes</option>
            {states.map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label className="field" htmlFor="category-filter">Category
          <select className="control" id="category-filter" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">All categories</option>
            {categories.map((value) => <option key={value} value={value}>{categoryLabel(value)}</option>)}
          </select>
        </label>
      </div>
      <button className="button-secondary" type="button" onClick={() => { setState(""); setCategory(""); }}>Clear filters</button>
    </div>
    <p className="results-count" role="status">Showing {visible.length} of {schemes.length} schemes in the catalogue</p>
    <div className="catalogue-grid">
      {visible.map((scheme) => <article className="scheme-card" key={scheme.scheme_id}>
        <span className={`badge ${scheme.verification_tier === "verified" ? "badge-official" : "badge-neutral"}`}>
          {scheme.verification_tier === "verified"
            ? `Checklist verified · ${scheme.official_source_checked_at}` : "Not yet verified"}
        </span>
        <p className="eyebrow">{scheme.state ?? "Central scheme"} · {categoryLabel(scheme.category)}</p>
        <h2><Link className="card-link" href={`/scheme/${scheme.scheme_id}`}>{scheme.name}</Link></h2>
        <p className="muted">{scheme.verification_tier === "verified"
          ? "View the official checklist and prepare for your visit."
          : "Visit the official portal. We have not verified a checklist yet."}</p>
      </article>)}
    </div>
    {visible.length === 0 && <p className="panel">No schemes match these filters. Try another state or category.</p>}
  </>;
}