import { NextResponse } from "next/server";
import { db, getPublishedGuidance } from "@/lib/db";

// Shape of a raw row from the schemes table (JSON columns are still strings
// here and parsed below). Typed explicitly instead of `any`.
interface SchemeRow {
  scheme_id: string;
  name: string;
  jurisdiction: string;
  state: string | null;
  category: string | null;
  verification_tier: string;
  official_apply_url: string;
  official_source_url: string | null;
  official_source_checked_at: string | null;
  official_documents: string | null;
  official_fee: string | null;
  validity_rules: string | null;
}

// Note: no `export const runtime = "nodejs"` — this project runs with
// cacheComponents enabled, which forbids that segment config. The Node.js
// runtime is already the default for route handlers, and better-sqlite3 works
// under it, so nothing is lost by omitting the export.

// GET /api/schemes/:id
//
// Returns a scheme together with two DELIBERATELY SEPARATE top-level keys:
//   - official_documents — the verified official checklist (null for Tier B)
//   - community_guidance — published community notes (never merged into the
//     official array)
//
// The separation is the product's core claim: community reports sit BESIDE the
// official list, never inside it. The official list is byte-identical before
// and after a recompute because recompute never writes to the schemes table.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const row = db
    .prepare(`SELECT * FROM schemes WHERE scheme_id = ?`)
    .get(id) as SchemeRow | undefined;
  if (!row) {
    return NextResponse.json({ error: "Scheme not found." }, { status: 404 });
  }

  const isVerified = row.verification_tier === "verified";

  const scheme = {
    scheme_id: row.scheme_id,
    name: row.name,
    jurisdiction: row.jurisdiction,
    state: row.state,
    category: row.category,
    verification_tier: row.verification_tier,
    official_apply_url: row.official_apply_url,
    official_source_url: isVerified ? row.official_source_url : null,
    official_source_checked_at: isVerified ? row.official_source_checked_at : null,
  };

  // Community guidance is only meaningful for verified schemes (Tier B collects
  // no feedback), but the query is naturally empty for them anyway.
  const communityGuidance = isVerified ? getPublishedGuidance(id) : [];

  // Cache-Control: no-store — this response reflects mutable state (a community
  // note appears the moment a recompute publishes it), so it must never be
  // cached by the dev server, a browser, or a CDN. This header is what keeps
  // the "recompute -> note appears beside the official list" demo step honest;
  // without it the identical GET URL can be served stale from a response cache.
  return NextResponse.json(
    {
      scheme,
      // Separate top-level keys — never one merged array.
      official_documents: isVerified && row.official_documents
        ? JSON.parse(row.official_documents)
        : null,
      official_fee: isVerified && row.official_fee
        ? JSON.parse(row.official_fee)
        : null,
      validity_rules: isVerified && row.validity_rules
        ? JSON.parse(row.validity_rules)
        : null,
      community_guidance: communityGuidance,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

