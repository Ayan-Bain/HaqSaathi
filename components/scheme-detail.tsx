import Link from "next/link";
import type { CommunityGuidanceRecord, SchemeRecord } from "@/lib/types";
import { CommunityNote } from "./community-note";
import { ReadinessPanel } from "./readiness-panel";
import { FeedbackForm } from "./feedback-form";
import { DemandCheckPanel } from "./demand-check-panel";

export function SchemeDetail({ scheme, guidance }: { scheme: SchemeRecord; guidance: CommunityGuidanceRecord[] }) {
  const heading = <header className="scheme-heading">
    <Link className="back-link" href="/">← All schemes</Link>
    <p className="eyebrow">{scheme.state ?? "Central scheme"}</p>
    <h1>{scheme.name}</h1>
  </header>;

  if (scheme.verification_tier === "listed") {
    return <main id="main-content" className="page-shell narrow">
      {heading}
      <section className="panel unverified-panel">
        <span className="badge badge-neutral">Not yet verified</span>
        <p>We have not yet checked this scheme&apos;s document requirements against an official source, so we are not showing a checklist. Anything we showed here would be a guess.</p>
        <a className="button" href={scheme.official_apply_url} target="_blank" rel="noopener noreferrer">Open the official portal ↗</a>
      </section>
    </main>;
  }

  const published = guidance.filter((note) => note.status !== "withdrawn");
  return <main id="main-content" className="page-shell narrow stack">
    {heading}
    <section className="panel official-panel" aria-labelledby="official-heading">
      <span className="badge badge-official">Official requirements</span>
      <h2 id="official-heading">The official document list</h2>
      <p className="muted">Checklist verified · last checked: {scheme.official_source_checked_at}. Check the official source for changes before your visit.</p>
      <ul className="document-list">{scheme.official_documents?.map((document) => <li key={document.document_id}>
        <h3>{document.name}</h3>
        <p className="muted">Last checked: {scheme.official_source_checked_at}</p>
        <a className="source-link" href={scheme.official_source_url!} target="_blank" rel="noopener noreferrer">Official source ↗ <span>({document.source_reference})</span></a>
      </li>)}</ul>
      <a className="button-secondary" href={scheme.official_apply_url} target="_blank" rel="noopener noreferrer">Open the official portal ↗</a>
    </section>
    {published.length > 0 && <section className="stack" aria-labelledby="community-heading">
      <h2 id="community-heading">Community-reported experiences</h2>
      {published.map((note) => <CommunityNote key={note.guidance_id} note={note} />)}
    </section>}
    <ReadinessPanel scheme={scheme} />
    <DemandCheckPanel scheme={scheme} />
    <FeedbackForm schemeId={scheme.scheme_id} />
  </main>;
}