import type { CommunityGuidanceRecord } from "@/lib/types";

export function CommunityNote({ note }: { note: CommunityGuidanceRecord }) {
  if (note.status === "withdrawn") return null;
  return <article className="panel community-panel">
    <span className="badge badge-community">Community-reported — not an official requirement</span>
    <h3>{note.canonical_name ?? note.document_concept_id} may also be requested during verification</h3>
    <p>Scope: {note.scope_district_code ?? note.scope_state ?? "Location not specified"}.</p>
    <p>Based on {note.valid_report_count} applicant reports between {note.first_reported_at ?? "an unspecified date"} and {note.last_reported_at ?? "an unspecified date"}.</p>
    <p>{note.status === "conflicting"
      ? "Applicants reported different experiences — some were asked for this, others were not."
      : "This is a community report, not a government rule."} Requirements may vary. Please confirm with the office before travelling.</p>
    {note.is_demo_data && <p className="demo-label">DEMO DATA — includes synthetic reports, not evidence from real applicants.</p>}
  </article>;
}