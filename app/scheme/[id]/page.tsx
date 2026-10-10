import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getSchemeRecord, getPublishedGuidance } from "@/lib/db";
import { SchemeDetail } from "@/components/scheme-detail";

async function SchemeData({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const scheme = getSchemeRecord(id);
  if (!scheme) notFound();
  return <SchemeDetail scheme={scheme} guidance={scheme.verification_tier === "verified" ? getPublishedGuidance(id) : []} />;
}

export default function SchemePage({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<main id="main-content" className="page-shell"><p role="status">Loading scheme…</p></main>}>
    <SchemeData params={params} />
  </Suspense>;
}
