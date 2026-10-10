import { connection, NextResponse } from "next/server";
import { getCatalogue } from "@/lib/db";

export async function GET() {
  await connection();
  const schemes = getCatalogue();
  return NextResponse.json({ schemes, count: schemes.length }, { headers: { "Cache-Control": "no-store" } });
}
