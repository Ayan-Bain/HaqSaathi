# HaqSaathi

An independent scheme application companion. The catalogue includes verified and
listed schemes; community reports are never merged into official checklists.

## Stage 6 — Demand Check, Acceptance Pass, Freeze

From `C:\HaqSaathi`, run `pnpm seed` once, then `pnpm dev`. Open
`http://localhost:3000`. Use the state/category filters or open a verified scheme
to check document readiness, run **Demand Check**, and submit real verification feedback.

### Tier A (Verified) — 2 schemes
- **assam-orunodoi** (Orunodoi Scheme, Assam, income-support) — full official document list, fee record (₹0, verified), validity rules, source refs, checked 2026-10-10
- **pm-kisan** (PM-KISAN, central, income-support) — full official document list, fee record (₹0, verified), validity rules, source refs, checked 2026-10-10

**Why these two:** They are the only schemes where we personally read the official government pages and recorded every document, fee, and validity rule with a source reference and check date. Every other scheme in the catalogue is Tier B.

### Tier B (Listed) — 11 schemes
All remaining schemes (pmjay, pmay-urban, pmuy, pmmvy, nsp-scholarships, nfsa-ration-card, mgnrega-job-card, assam-nijut-moina, enam-agri, swayam-education, plus any added without verification). Tier B has only name, jurisdiction, state, official portal URL, and `source_checked_at`. No checklist, no readiness check, no feedback form, no fee claim — the absence is the feature.

### Community notes are synthetic
The 8 feedback rows seeded in `data/seed-feedback.json` are **synthetic** (DEMO DATA). They are not from real applicants. Published notes carry an `is_demo_data` flag and a prominent red **DEMO DATA** banner. A mixed note (some synthetic, some real) still shows the banner. This is the honest position: we have no real reports yet, and we do not pretend otherwise.

### Freshness expiry is unimplemented
Design acceptance test 6 (confidence decay over time) is **not implemented**. Notes do not age out or get re-reviewed automatically. This is documented as known-missing rather than pretending it passes.

### SDK agent path: fallback-only for this demo
`@cline/agents` is installed but no provider credentials are configured in the demo environment. The readiness endpoint always returns `generatedBy: "deterministic"` with template explanations. The agent code path is present, tested, and guarded by `validateAgentReferences()`; it will activate if `CLINE_MODEL_API_KEY` is set and `FORCE_FALLBACK` is not `1`. See Stage 3 tests for the allow-list contract.

## Stage 7 — Scheme-discovery chatbot

An optional entry point on the catalogue page ("Find schemes for me"). The user
answers a few coarse, skippable questions — state, age band, gender, income band,
social category, benefit interest — and gets a tier-aware shortlist of schemes
**worth checking**. It never collects Aadhaar/PAN/bank/DOB (bands only), and the
route rejects any 12-digit value as potential PII.

- **No eligibility verdicts.** A deterministic, pure `matchSchemes()` owns every
  include/exclude. It excludes only on a catalogue-state mismatch or a *verified*
  eligibility contradiction, and uses the band's most-permissive edge so a straddling
  band is kept ("when in doubt, include"). Unknown / prefer-not-to-say never excludes.
  Results say "you may be able to apply," never "you qualify."
- **Verified eligibility** lives in `data/eligibility.json` (sidecar, Tier-A honesty
  gate), joined in memory — the frozen Stage 1 schema is untouched.
- **Agent is conversation-only**, bounded like Stage 3: `validateDiscoveryReferences()`
  rejects any scheme the matcher didn't return, forbidden language ("eligible",
  "qualify", "guaranteed", "will get", "entitled") in summary/notes/reasons, and a
  weakened disclaimer. Falls back to the deterministic form + templates when no
  credentials are set or `FORCE_FALLBACK=1`.

## Validation

```powershell
pnpm test
pnpm exec tsc --noEmit
pnpm build
```

All 108 tests pass (Stages 1–7); `tsc --noEmit` and `next build` are clean. Stage 6 adds
the Demand Check API tests (`tests/stage6.test.ts`): tier gate, zero-fee mismatch,
positive-fee match/mismatch, unknown-fee verdict, PII/body-size guards, and the
neutrality guard (no "corrupt", "illegal", "bribe"). Stage 7 adds `tests/stage7.test.ts`
(allow-list + route guards) and `lib/discovery.test.ts` (matcher exclusion rules).

`C:\HaqSaathi\scripts\verify-stage5.mjs` runs real-browser smoke checks via Chrome
DevTools Protocol using built-in Node APIs (no new browser dependency). Start a
separately seeded test app with `HAQSAATHI_DB_PATH` pointing at a disposable SQLite
file, `FORCE_FALLBACK=1`, and `RECOMPUTE_SECRET` configured. Start headless Chrome
with `--remote-debugging-port=9225` and an isolated `--user-data-dir`. Then run:

```powershell
$env:STAGE5_BASE_URL = 'http://localhost:3998'
$env:STAGE5_CDP_URL = 'http://localhost:9225'
$env:RECOMPUTE_SECRET = 'your-test-server-secret'
$env:STAGE5_ALLOW_TEST_WRITES = '1'
node C:\HaqSaathi\scripts\verify-stage5.mjs
```

This script writes feedback and recomputes notes; **do not point it at real data**.
It checks filters, 360 px overflow/tap targets, tier gates, missing/stale/mismatched
readiness inputs, offline retry, synthetic labels and feedback confirmation. It
saves a greyscale screenshot to the OS temporary directory for visual review.

---

The project uses Next.js, React, TypeScript and local SQLite. Run locally or in a
long-lived container; SQLite is not persistent on a serverless filesystem.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
