import { db } from "../lib/db";
import { execSync } from "child_process";

const rows = db.prepare("SELECT scheme_id, verification_tier, official_apply_url FROM schemes").all() as {
  scheme_id: string;
  verification_tier: string;
  official_apply_url: string;
}[];

console.log(`Checking ${rows.length} scheme URLs...`);

for (const r of rows) {
  try {
    const code = execSync(`curl.exe -s -o NUL -w "%{http_code}" -L --max-time 10 "${r.official_apply_url}"`)
      .toString()
      .trim();
    console.log(`[${r.verification_tier}] ${r.scheme_id} (${r.official_apply_url}) -> ${code}`);
    if (code !== "200") {
      console.error(`URL returned non-200 code: ${code}`);
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`Error checking URL: ${r.official_apply_url}`, err.message);
    process.exit(1);
  }
}

console.log("All official URLs returned HTTP 200 successfully!");

