# HaqSaathi

An independent scheme application companion. The catalogue includes verified and
listed schemes; community reports are never merged into official checklists.

## Stage 5 UI

From `C:\HaqSaathi`, run `pnpm seed` once, then `pnpm dev`. Open
`http://localhost:3000`. Use the state/category filters or open a verified scheme
to check document readiness and submit real verification feedback.

- Verified schemes show source links, check dates, a readiness form, and published
  community notes with scope, report count, dates, and uncertainty.
- Listed schemes show only the unverified notice and official portal link.
- Synthetic evidence is explicitly marked **DEMO DATA**, including mixed synthetic
  and real evidence. Existing databases are migrated automatically.
- Feedback requires consent. Ambiguous document names require confirmation.
  The form is **not a simulation**: it saves real feedback; use a test database
  when rehearsing. Demand Check is reserved for Stage 6.

Copy `C:\HaqSaathi\.env.local.example` to `C:\HaqSaathi\.env.local` and set
`RECOMPUTE_SECRET` to enable the protected recompute API. Send that secret in
`x-recompute-secret` with `POST /api/community-guidance/recompute`.
Recompute is server-side only; the secret is never exposed in the UI.

## Validation

```powershell
pnpm test
pnpm exec tsc --noEmit
pnpm build
```

Stage 5 includes component-rendering tests, tier/API gates, demo-provenance and
confirmation tests, and a **mocked** agent-versus-fallback contract test. A live
model comparison still requires valid provider credentials. Without credentials,
readiness uses the deterministic path and shows **Standard explanation**.

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
