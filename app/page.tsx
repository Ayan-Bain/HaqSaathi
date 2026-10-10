import { Suspense } from "react";
import { connection } from "next/server";
import { Catalogue } from "@/components/catalogue";
import { DiscoveryPanel } from "@/components/discovery-panel";
import { getCatalogue } from "@/lib/db";

async function CatalogueData() {
  await connection();
  const schemes = getCatalogue();
  return <>
    <DiscoveryPanel schemes={schemes} />
    <Catalogue schemes={schemes} />
  </>;
}

export default function Home() {
  return <main id="main-content" className="page-shell">
    <header className="hero">
      <p className="eyebrow">Your scheme application companion</p>
      <h1>Know what to bring.<br />Know where it comes from.</h1>
      <p>Find a scheme, check its official requirements, and prepare for your visit. Community experiences stay separate from government rules.</p>
    </header>
    <Suspense fallback={<p role="status" className="panel">Loading scheme catalogue…</p>}>
      <CatalogueData />
    </Suspense>
  </main>;
}