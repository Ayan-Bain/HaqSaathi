# HaqSaathi: Scheme Application Companion

## Integrated Product Design Document

**Version:** 1.1  
**Updated:** 2026-10-10  
**Purpose:** Cline AI Builder Hackathon — working-product design  
**Core capabilities:** Government-scheme application guidance, pre-submission document checks, community-reported verification requirements, and citizen protection  
**Design principle:** Official rules stay official. Community experience improves practical guidance, but never silently rewrites government rules.

---

## 1. Executive Summary

HaqSaathi helps people prepare stronger applications for government schemes. It focuses on the steps between deciding to apply and completing verification.

A citizen selects a scheme or finds one through a short guided intake. HaqSaathi explains the official application steps, checks the documents the citizen has, identifies missing or inconsistent information, and creates a plain-language checklist. Where useful, it helps the citizen prepare a draft form.

The product addresses a common information gap: an official scheme page may list documents, but an applicant may only discover during offline verification that the office also expects another document or a different version of a certificate.

HaqSaathi adds a feedback loop. After the user's scheduled verification date, it asks whether the listed documents were sufficient. If not, it asks which additional documents were requested and whether the application progressed. It groups similar reports for the same scheme and relevant location. When enough independent reports agree, the product automatically adds a clearly labelled community observation:

> **Official website lists:** [official documents].  
> **Additional community reports:** Multiple applicants have reported that [document] may also be requested during verification in [area/office context]. This is not confirmed as an official requirement. Confirm with the relevant office before travelling.

This creates a continuously improving guidance system. It does **not** mean that the underlying language model retrains itself on every report. Instead, the application updates a controlled, traceable knowledge layer using aggregated feedback, confidence thresholds, source dates, and abuse checks. Official requirements and community observations remain separate.

HaqSaathi retains the existing citizen-protection features from the original design: official-fee checks, warnings about suspicious payment demands, neutral complaint-draft support, and a record of visits if the user chooses to keep one. The `POST /api/application/check` route uses the Cline SDK `@cline/agents` package as a constrained explanation agent. The deterministic validation engine remains the source of truth; the agent turns its results into accessible language and proposes a follow-up question only when a known field is missing or uncertain. The agent has read-only access to the current approved scheme record and cannot write to the community knowledge base.

## 2. Problem Statement

Applicants can face four connected problems:

1. **Complex instructions.** Scheme rules and application instructions may be long, technical, or available in a language the applicant does not prefer.
2. **Incomplete practical guidance.** A website may omit a document that a particular verification office commonly asks applicants to bring. Applicants can learn this only after travelling to the office.
3. **Preventable application delays.** A name mismatch, expired certificate, missing attachment, or incomplete form can cause another visit.
4. **Unclear fees and demands.** Applicants may not know the official fee, whether a requested payment is legitimate, or what safe next step is available.

A static checklist cannot solve the second problem. A generic chatbot cannot safely solve all four. HaqSaathi combines official information, deterministic validation, and aggregated applicant experience, while making the source and confidence of each claim visible.

## 3. Product Goal and Non-Goals

### 3.1 Goals

- Help a citizen prepare an application for a selected government scheme.
- Explain official document requirements in short, accessible language.
- Catch likely missing documents and inconsistencies before submission or travel.
- Collect post-verification feedback with the user's consent.
- Identify repeated reports of additional documents and publish a confidence-labelled community note when evidence crosses a threshold.
- Keep government requirements separate from user-reported practices.
- Explain the published official fee and provide safe, verified escalation options when a user reports a suspicious demand.
- Work on a basic smartphone and support text-first interaction with optional voice input.

### 3.2 Non-goals for the hackathon MVP

- The product will not submit an application to a government portal on the user's behalf.
- The product will not decide legal entitlement or replace the official eligibility authority.
- The product will not assert that an official is corrupt or that an office has acted unlawfully.
- The product will not claim that a community-reported document is an official requirement.
- The product will not automatically retrain or fine-tune a foundation model from raw feedback.
- The product will not collect Aadhaar, PAN, bank-account numbers, OTPs, or copies of sensitive identity documents for community analytics.
- The first prototype will not cover every state and every scheme. It will support a small, well-verified set of schemes.

## 4. Target Users and Main Scenario

### Primary user

A citizen applying for a public benefit who needs a clear checklist and wants to avoid repeat visits to an office or verification centre.

### Secondary users

- A family member helping an applicant.
- A community volunteer or support worker helping people prepare forms.
- A scheme-data maintainer who reviews official source updates and system alerts.

### Main scenario

1. A citizen selects a scheme.
2. HaqSaathi displays the official checklist, application steps, source link, last-checked date, and known official fee.
3. The citizen checks off documents they already have or uploads a form/document for on-device or session-based extraction where feasible.
4. HaqSaathi flags missing items, likely expired certificates, and inconsistencies. Each warning shows why it appeared.
5. The citizen receives an application-readiness report and can export a checklist or draft form.
6. The citizen schedules or records an offline verification date.
7. After that date, HaqSaathi asks whether the documents were sufficient and whether more documents were requested.
8. The citizen may report additional document names without uploading the documents themselves.
9. HaqSaathi compares the report with other reports for the same scheme, state/district or office context, and recent time window.
10. When the evidence threshold is met, HaqSaathi automatically updates the **community-reported guidance** for future applicants. The official checklist remains unchanged unless an official source changes.

## 5. Core Product Principles

1. **Official rules and community reports are separate.** Never merge them into one unlabelled list.
2. **Rules, not guesses, for critical checks.** A deterministic rules engine handles required-field checks, known document requirements, date/expiry checks where the official rule is known, and fee comparisons. The Cline SDK agent may help interpret the supplied context and explain the results, but it cannot override a rule-engine result, create an official requirement, or decide eligibility.
3. **Every requirement has provenance.** Store the source URL, relevant text or page reference, retrieval date, location applicability, and status.
4. **Confidence must be visible.** Use labels such as “Officially listed,” “Community-reported,” “Conflicting reports,” and “Needs confirmation.”
5. **Say when information is missing.** Do not make up a document requirement, fee, official link, phone number, or deadline.
6. **Do not penalise applicants.** An unknown or contradictory document report must not mark someone ineligible.
7. **Minimise data.** Collect only what is needed. Keep private application details separate from aggregate feedback.
8. **Respect user choice.** Verification follow-up reminders require consent and can be disabled.
9. **No public accusation.** Reports describe observed requests and outcomes, not the character or intent of a named person.
10. **Accessible language.** Use short sentences, local-language explanations where supported, and a text fallback if speech recognition fails.

## 6. Main User Experience

### 6.1 Entry and scheme selection

The user can select a scheme from a small catalogue or search by scheme name. A guided intake may ask state, district, basic non-sensitive profile facts, and the type of benefit sought. The application helper is the main product; scheme discovery is only an entry point to the application workflow.

### 6.2 Scheme application page

Each scheme page should show four visibly separate sections:

- **Official requirements:** Documents and steps found in verified government sources.
- **Community-reported additional documents:** Documents applicants report being asked for during verification. This section is hidden until its evidence threshold is met.
- **Application readiness:** Personal checklist of known documents, missing fields, expiry dates, or mismatches.
- **Fees and help:** Published official fee, official application link, and safe next steps if a payment demand or suspicious message is reported.

Each official record shows the official source link and last-checked date. Each community note shows its location scope, report count, reporting period, confidence label, last updated date, and an explicit statement that it is not an official rule.

### 6.3 Pre-submission form check

The user can enter information manually or upload a form and supporting document scans if safe extraction is supported. The flow is split into deterministic checks and an explanation step powered by the Cline SDK.

1. **Extract and confirm.** OCR or a document-capable model extracts fields. The app shows extracted values to the user for confirmation. Low-confidence values are not silently accepted.
2. **Validate the request.** `POST /api/application/check` validates the request schema, limits payload size, verifies the selected scheme ID, and loads the current approved scheme record on the server.
3. **Run deterministic checks.** The validation module checks known required fields and documents, date/expiry rules that are supported by official data, and obvious consistency issues. It returns stable check IDs, outcomes, and source references. It also identifies missing information that may need a user answer.
4. **Run the constrained Cline agent.** The `@cline/agents` agent receives a minimised version of the confirmed fields, document inventory, deterministic check results, and a read-only custom tool for the current approved scheme record. It explains the results in plain language and may select a follow-up question from the server-provided list of missing or uncertain fields.
5. **Validate the agent output.** The API validates the agent's response against an output schema. It rejects unknown check IDs, unsupported source references, and unapproved requirement claims. If the agent fails, times out, or returns invalid output, the route returns a deterministic template built from the rule-engine results.
6. **Return the readiness report.** The response includes a status such as `ready_for_review`, `needs_attention`, or `insufficient_information`. It must never claim that an application is guaranteed to be accepted.

The agent's role is explanation and controlled orchestration, not unrestricted application validation. The rule engine should remain small, explicit, and unit-tested; the SDK avoids writing a large set of nested UI conditionals, but it does not replace exact business rules with probabilistic decisions.

If name or other field values need comparison, run the comparison on the server and pass the agent a minimal result such as `name_mismatch_detected` where possible. Do not send raw identity-document scans, Aadhaar/PAN numbers, bank numbers, OTPs, or unnecessary personal data to the agent provider.
### 6.4 Verification date and follow-up

The app may ask: “Do you have an offline verification appointment or expected visit date?” The user can enter a date or skip it. If reminders are enabled, the app sends one short follow-up after the scheduled date, with a retry option if the visit was postponed.

The follow-up asks:

1. Did you attend the verification visit?
2. Were the documents you brought sufficient to continue or complete verification?
3. If not, which additional document(s) did the office ask for?
4. Did the office give a reason or written instruction? (Optional.)
5. Was the application accepted for the next step, completed, or left pending? (Optional.)

The form should offer “visit postponed,” “I do not know,” and “prefer not to answer.” A citizen must not be treated as a negative report if they do not respond.

### 6.5 Citizen protection: fee and demand check

The existing HaqSaathi Demand Check remains in scope because it directly affects access to scheme applications.

- Compare the reported amount with a verified official fee record.
- If the verified official fee is zero, explain that the official source lists no application fee; do not make claims beyond the source.
- Show the source link and the date it was checked.
- Provide a calm, safe script, for example: “Could you please show me the official fee rule and provide a receipt?”
- Show only escalation channels whose details have been checked from official sources.
- Offer neutral complaint or information-request drafts only when the user chooses to create them.

Extra document requests must be handled carefully. A community report that a document was requested does not prove that the request was unlawful. The app should help the user distinguish between the published list and what was reportedly requested in practice.

## 7. Self-Improving Community Knowledge System

### 7.1 What “the AI learns by itself” means here

The product improves automatically as new feedback arrives, but it does not immediately change official facts or retrain its base model on every submission.

The automatic learning loop updates a structured knowledge layer for each scheme. A model may help normalise document names and group similar answers, but deterministic policy code decides whether the evidence is strong enough to publish a community note.

This is safer, more explainable, faster to implement, and easier to reverse than continuous uncontrolled model fine-tuning.

### 7.2 Feedback processing pipeline

1. **Collect:** Receive the user's answer after the scheduled verification date, with consent.
2. **Validate:** Check that the scheme and reported location context exist; limit duplicate submissions from the same case.
3. **Normalise:** Map language variants and synonyms to a canonical document concept. For example, similar names for the same local residence certificate may be grouped only after a confidence check.
4. **Separate:** Keep official requirements, user-reported additional documents, and administrative observations in separate data fields.
5. **Aggregate:** Calculate the number of independent reports, agreement rate, reporting dates, geographic scope, and recency.
6. **Screen for abuse:** Detect repeated text, abnormal submission patterns, contradictory reports, and sudden coordinated activity.
7. **Apply publication policy:** Publish only if the threshold is satisfied; otherwise keep the information as an unconfirmed signal.
8. **Version:** Save the previous value, new value, evidence summary, date, and rule that caused the change.
9. **Expire or review:** Recalculate confidence over time. Old observations lose prominence and may be marked stale.

### 7.3 Initial consensus policy for the prototype

The following is a starting policy, not a claim that these thresholds are universally correct. It should be configurable and tested.

- At least **5 independent feedback submissions** for the same scheme and relevant geographic scope within the previous **90 days**.
- At least **70% agreement** among valid responses that the same additional document was requested.
- Reports should cover at least **2 distinct visit dates** where the data allows this check.
- Exclude duplicates, test records, obvious spam, and feedback with unclear scheme/location association.
- If the threshold is not met, show the item only as an internal signal or a low-confidence note, not as a broadly published recommendation.
- For a document that could be sensitive or has a high risk of causing cost or delay, require additional verification or a human review before prominent publication.

The threshold means: “multiple applicants have reported this.” It does not mean: “the government officially requires this.”

### 7.4 Published wording

When the publication threshold is met, use wording such as:

> **Official website lists:** [official documents].  
> **Community-reported additional document:** [document] may also be requested during verification in [district/office scope]. This is based on [N] recent applicant reports between [start date] and [end date]. It is not listed in the official source we checked. Requirements may vary. Please confirm with the relevant office before travelling.

If reports conflict, say so. For example:

> Applicants have reported different experiences. Some were asked for [document]; others were not. Treat this as an unconfirmed local practice and contact the office before your visit.

Never silently change the official document list. Never describe a community-reported document as mandatory unless an authoritative official source confirms it.

### 7.5 What if most users report an additional document?

If the threshold is met, future applicants see the new community note automatically. The official list and the community note appear side by side. The app records the update in a visible change history.

If an official source later adds that document, the record is promoted to “Officially listed” only after the source is verified. The previous community evidence remains in history, but the current display prioritises the official source.

### 7.6 Feedback quality and abuse controls

- One feedback submission per case and visit, with edits allowed for a short window.
- Rate limits by account/device and basic anti-bot controls. Do not rely on a single device signal as proof of identity.
- Do not reward users based on whether they report a particular document.
- Group reports by scheme and location; do not generalise a local office practice to an entire state without supporting evidence.
- Track contradictory feedback rather than deleting it.
- Provide “report this guidance” and “this does not match my experience” controls.
- Keep an audit trail for every published or withdrawn note.
- The application-check SDK route has no write permission for published guidance and no access to raw feedback records.
- Use human review for suspected manipulation, sensitive claims, or major changes to highly consequential guidance.

### 7.7 Model choice and learning boundaries

- Use a language model to extract answers, classify feedback, and normalise document names into candidate concepts.
- Ask the user to confirm extracted document names before submission.
- Use deterministic logic for counts, agreement ratios, geographic scope, time windows, and publication thresholds.
- Use retrieval from official source records for official requirements.
- Do not use unverified community feedback to fine-tune the foundation model in the MVP.
- Future versions may evaluate supervised fine-tuning or a classifier using quality-reviewed, consented, minimised data, but only after privacy, bias, security and rollback reviews.


### 7.8 Cline SDK boundary for application checks

The Cline agent used by `POST /api/application/check` is separate from the feedback-learning pipeline.

- It may read only the approved record for the scheme currently being checked and the already-computed validation results.
- Its custom tool is read-only. It cannot create or edit scheme records, feedback records, community guidance, thresholds, or audit events.
- It cannot call `POST /api/community-guidance/recompute` or access the database with general write permissions.
- It must not treat individual or aggregated user reports as official requirements. Published community guidance may be displayed as community-reported context, with its label and evidence count intact.
- The endpoint does not trigger model fine-tuning. Feedback aggregation is a separate deterministic job with its own publication policy, validation and audit trail.
- If the SDK fails, the endpoint returns the deterministic readiness report and explains any checks in a template. A model outage must not block the basic application check.
## 8. Data Model

The MVP can use a small relational database or JSON records. Use stable identifiers and keep official fields separate from community fields.

### 8.1 Scheme record

```json
{
  "scheme_id": "example-scheme",
  "name": "Example Government Scheme",
  "jurisdiction": "state-or-central",
  "state": "Assam",
  "official_apply_url": "https://official.example.gov.in/apply",
  "official_source_url": "https://official.example.gov.in/requirements",
  "official_source_checked_at": "YYYY-MM-DD",
  "official_documents": [
    {
      "document_id": "identity-proof",
      "name": "Identity proof",
      "source_reference": "Requirements page, section 2",
      "is_official": true
    }
  ],
  "official_fee": {
    "amount_inr": 0,
    "status": "verified",
    "source_reference": "Official fee page"
  },
  "community_guidance_version": 1
}
```

Use placeholder values in development. Production values must be checked against official sources.

### 8.2 Verification feedback record

```json
{
  "feedback_id": "random-id",
  "scheme_id": "example-scheme",
  "scheme_jurisdiction": "state-or-central",
  "district_code": "optional-coarse-location",
  "verification_date": "YYYY-MM-DD",
  "attended": true,
  "official_list_was_sufficient": false,
  "additional_document_concepts": ["local-residence-certificate"],
  "application_progress": "continued",
  "consent_for_aggregate_use": true,
  "created_at": "timestamp",
  "quality_status": "pending-validation"
}
```

Do not put a citizen's name, Aadhaar number, PAN, bank number, full address, or a scan of the document in the aggregate feedback record. Use a coarse location only when it is needed to scope the guidance.

### 8.3 Community guidance record

```json
{
  "guidance_id": "random-id",
  "scheme_id": "example-scheme",
  "document_concept_id": "local-residence-certificate",
  "scope": {
    "state": "Assam",
    "district_code": "optional",
    "office_id": null
  },
  "status": "community-reported",
  "valid_report_count": 7,
  "agreement_ratio": 0.86,
  "first_reported_at": "YYYY-MM-DD",
  "last_reported_at": "YYYY-MM-DD",
  "published_at": "YYYY-MM-DD",
  "expires_or_review_at": "YYYY-MM-DD",
  "evidence_summary": "Multiple applicants reported being asked for this document.",
  "official_source_confirms": false,
  "version": 2
}
```

This record is not an official requirement record. `official_source_confirms` can become true only after the source is checked and linked.

## 9. Proposed Architecture

Keep the hackathon build small: one mobile-first Next.js app, one API layer, one structured database, a deterministic validation module, and one constrained Cline SDK agent for explanations.

### 9.1 High-level request path

```text
Mobile-first Next.js frontend
        |
        | POST /api/application/check
        v
Request validation + scheme ID authorization
        |
        v
Load approved scheme record + confirmed form/document inventory
        |
        v
Deterministic validation module
        |  produces stable check IDs, outcomes, known missing items,
        |  source references, and allowed follow-up questions
        v
Cline SDK Agent (@cline/agents)
        |  read-only custom tool: current approved scheme record only
        |  explains supplied results; selects a permitted follow-up question
        v
Server output-schema validation + allowed-ID/source checks
        |
        +---- valid agent output ------> Readiness report JSON
        |
        +---- error/timeout/invalid --> deterministic explanation fallback
```

The community feedback flow is separate:

```text
Post-visit feedback -> validation/normalisation -> deterministic aggregation
       -> consensus threshold + abuse checks -> versioned community guidance
```

The application-check agent cannot publish or edit community guidance. This separation is intentional.

### 9.2 Front end

- Next.js progressive web app.
- Large buttons, plain-language messages, keyboard-accessible forms and mobile layouts.
- Text input always available; voice input is optional.
- Scheme application page, document checklist, readiness report, verification follow-up, community guidance panel, and fee/demand check.
- Show which warnings are based on official records and which are based on community reports.

### 9.3 Back end

- Next.js API routes running in the **Node.js runtime**, not an Edge runtime, for the SDK route.
- Scheme/source service for approved official records.
- A deterministic `validateApplication()` module that produces machine-readable check results.
- A Cline SDK agent factory used by `POST /api/application/check` with a short timeout, bounded token/iteration budget, and a restricted custom tool list.
- Feedback collection and aggregation service with independent permissions.
- Notification scheduler for opted-in follow-ups.
- Audit/version service for community guidance.

### 9.4 Cline SDK agent: role and limits

Use `@cline/agents` for the lightweight agent loop and define only the custom tools needed by the application-check flow. Current official Cline SDK documentation describes `@cline/agents` as the stateless/runtime-agnostic agent package, but labels the package experimental. The package requires Node.js 22 or later. Confirm current package versions and deployment support before the hackathon demo.

**Agent responsibilities**

1. Read the approved structured scheme record for the current scheme through a read-only tool.
2. Interpret the deterministic validation results and explain them in simple, accessible language.
3. Explain the difference between official requirements and published community-reported observations.
4. Select a follow-up question only from the server-supplied list of allowed questions.
5. Return a structured report that the API validates before sending to the frontend.

**Agent must not**

- Decide legal eligibility or change a rule-engine result.
- Invent requirements, deadlines, official fees, or source links.
- Promote community reports into official requirements.
- write to scheme data, feedback, community guidance, or the audit history.
- access arbitrary databases, external websites, shell, filesystem, or general-purpose tools from the application route.
- receive raw identity-document scans or unnecessary sensitive identifiers.

### 9.5 Custom tool design

Provide one narrow tool such as `get_approved_scheme_record`. The route should bind it to the requested, already-authorised scheme ID. If the agent requests another scheme ID, the tool returns a structured error. The tool returns only approved fields:

- official documents and their verified source references;
- official application steps and known official fees;
- published community guidance, with status, scope, report count and dates;
- source-check timestamps and freshness flags.

Do not return unpublished raw feedback or internal personal data. The tool is read-only and has no database mutation capability.

### 9.6 Deterministic validation module

`validateApplication()` should return data rather than user-facing prose. Example fields:

- `checkId`: stable identifier for this finding;
- `checkType`: `missing_document`, `missing_field`, `date_check`, `mismatch`, `community_note`, or similar;
- `status`: `pass`, `needs_attention`, `unknown`, or `informational`;
- `basis`: `official_rule`, `user_input`, or `community_report`;
- `messageKey`: a stable key for fallback text;
- `sourceRefs`: source IDs already loaded by the server;
- `allowedFollowUpKeys`: known missing or uncertain fields the user can clarify.

The module owns calculations, official-rule evaluation, source attribution, and check IDs. The Cline agent turns this data into an explanation; it does not recalculate critical facts.

### 9.7 AI components

1. **Extraction model:** Parse uploaded forms and feedback into structured JSON.
2. **Document normaliser:** Map synonyms and language variants to candidate canonical document names; ask for user confirmation if confidence is low.
3. **Cline SDK explanation agent:** Explain deterministic results in the user's language and select an allowed follow-up question. It is invoked by `POST /api/application/check` and has no access to the feedback write path.
4. **Optional vision model:** Read scanned forms or document images. Do not store raw scans for community analytics.

### 9.8 Storage and permissions

- PostgreSQL/Supabase or a small SQLite database for the prototype.
- Separate tables/collections for schemes, official requirements, feedback, canonical document concepts, community guidance versions, personal reminder preferences, and audit events.
- The application-check server role may read approved scheme data and write only operational request logs if needed; it must not have community-guidance mutation permissions.
- The feedback aggregation job may write community guidance only after deterministic policy checks pass. Keep this permission separate from the application-check route.
- Store minimal user reminder preferences separately from anonymous or pseudonymous feedback.

### 9.9 Notifications

For the prototype, an in-app reminder or email can be sufficient. A production deployment would need secure notification preferences, consent records, a reminder queue, delivery retries, and a simple way to mark the visit as postponed.
## 10. Suggested Technical Stack

| Layer | Suggested choice | Reason |
|---|---|---|
| Front end | Next.js + TypeScript | Fast single-app build and good deployment support |
| UI | Tailwind CSS + accessible component library | Responsive, quick to refine |
| Database | Supabase/PostgreSQL | Structured records and simple API integration |
| AI extraction/vision | A model API supporting structured output; vision capability if available | Document extraction and field extraction |
| Cline SDK agent | `@cline/agents` with `@cline/shared` and `@cline/llms` (or the supported `@cline/sdk` package) | Constrained, stateless explanation agent inside the application-check API route; experimental package, confirm current versions |
| Document extraction | PDF text extraction, with OCR fallback | Keep the pipeline inexpensive and auditable |
| Validation | TypeScript `validateApplication()` rules module with unit tests | Stable, repeatable checks; not delegated to the LLM |
| PDF export | pdf-lib or equivalent | Checklist and readiness report |
| Deployment | Vercel or a comparable host | Quick hackathon deployment |

Choose tools already configured in the development environment. Do not spend the hackathon integrating a new service unless it is necessary for the main demo. The current Cline SDK package documentation specifies Node.js 22+; verify the actual host runtime and current package status before committing to this integration. Keep a deterministic fallback if the SDK cannot run in the deployment environment.

## 11. Core API Design and Cline SDK Integration

Suggested endpoints; names can change to match implementation.

- `GET /api/schemes` — list supported schemes.
- `GET /api/schemes/:id` — return official requirements and published community guidance separately.
- `POST /api/application/check` — validate a draft form and user-confirmed document inventory, then use the Cline SDK agent to explain the validated results.
- `POST /api/verification/feedback` — accept post-visit feedback with consent.
- `POST /api/community-guidance/recompute` — run aggregation for affected scheme/scope. In production, this should be a protected job, not an open public endpoint.
- `GET /api/community-guidance/:schemeId` — return published, confidence-labelled observations.
- `POST /api/reminders` — create or update an opted-in verification reminder.
- `POST /api/demand-check` — compare a reported payment demand against a verified official-fee record.

### 11.1 Exact integration point: `POST /api/application/check`

The Cline SDK agent is instantiated and run inside this endpoint. The route does not expose the SDK directly to the browser. The backend controls the model configuration, tool list, scheme access, input minimisation, output validation and fallback response.

**Request flow**

1. Validate the request body and apply payload-size and rate limits.
2. Verify that `schemeId` identifies a supported scheme.
3. Load the approved official scheme record and only the currently published community guidance for that scheme.
4. Run the deterministic `validateApplication()` module.
5. Create a short-lived Cline `Agent` from `@cline/agents` with a system prompt, a bounded token/iteration budget and the read-only `get_approved_scheme_record` custom tool.
6. Pass the agent the confirmed form fields, a document inventory, validation results, approved scheme ID, source references and permitted follow-up question keys. Minimise or redact personal values that are not needed to explain the findings.
7. Ask the agent to return structured JSON with a plain-language summary, explanation for each supplied check ID, and at most one allowed follow-up question if information is missing.
8. Parse and validate the result on the server. Accept only known check IDs, source IDs and follow-up keys. Do not accept any new official requirement from model output.
9. Return the verified response. If the SDK errors, times out, returns non-completed status, or produces invalid output, return a deterministic explanation fallback based on the original validation results.

### 11.2 Request contract

Example request; use only user-confirmed extracted values and the document inventory needed for the check.

```json
{
  "schemeId": "example-scheme",
  "confirmedFields": {
    "applicant_name_match_status": "mismatch_detected",
    "certificate_issue_date": "2026-01-12"
  },
  "documentInventory": [
    {
      "documentConceptId": "identity-proof",
      "available": true,
      "expiryDate": null
    },
    {
      "documentConceptId": "income-certificate",
      "available": true,
      "expiryDate": "2025-12-31"
    }
  ],
  "locale": "as-IN"
}
```

This example intentionally uses a mismatch status rather than passing full identity-document contents into the agent. Where exact field values are genuinely required to produce the user-facing explanation, minimise the payload and never include Aadhaar, PAN, bank numbers, OTPs, or raw scans in the agent prompt.

### 11.3 Response contract

```json
{
  "status": "needs_attention",
  "summary": "Please review two items before your visit.",
  "checks": [
    {
      "checkId": "name-mismatch-1",
      "status": "needs_attention",
      "explanation": "The names do not appear to match across the records you confirmed.",
      "basis": "user_input",
      "sourceRefs": []
    },
    {
      "checkId": "income-cert-expiry-1",
      "status": "needs_attention",
      "explanation": "The certificate may be outside the validity period recorded for this scheme.",
      "basis": "official_rule",
      "sourceRefs": ["scheme-source-2"]
    }
  ],
  "followUpQuestion": {
    "key": "income_certificate_validity_unknown",
    "question": "Does your certificate show a newer issue date?"
  },
  "disclaimer": "This is a preparation check, not a guarantee of approval."
}
```

All IDs and source references in the response must originate from server-side data. The agent cannot create a new `checkId`, `sourceRef`, or `followUpQuestion.key`. The application should validate the output using a schema (for example, Zod) and verify every ID against the request's allow-list.

### 11.4 Agent prompt and tool policy

Use a short system prompt with rules such as:

- Explain only the validation results and approved scheme records supplied for this request.
- Treat the deterministic validation results as authoritative for checks they cover.
- Do not make eligibility decisions or invent documents, fees, deadlines, appeal rights, citations, or official source text.
- Keep official requirements and community-reported observations explicitly separated.
- Do not use community reports to claim an official requirement.
- If required information is missing, choose only a follow-up question from the provided allowed list; do not invent a new data requirement.
- Produce only the documented response schema. If evidence is insufficient, say so.

The only custom tool should be read-only `get_approved_scheme_record`. Its argument schema contains a scheme ID, but its execution function must compare that ID with the scheme authorised by the API route and reject any mismatch. Return only approved official fields and published community guidance; do not expose raw feedback, user records, or write tools.

### 11.5 TypeScript route outline

The following is an implementation outline, not copy-paste-complete production code. Exact SDK types and provider/model identifiers must be checked against the installed version.

```ts
// app/api/application/check/route.ts
import { Agent } from "@cline/agents";
import type { AgentTool } from "@cline/shared";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const RequestSchema = z.object({
  schemeId: z.string().min(1),
  confirmedFields: z.record(z.string(), z.unknown()),
  documentInventory: z.array(z.object({
    documentConceptId: z.string(),
    available: z.boolean(),
    expiryDate: z.string().nullable().optional(),
  })),
  locale: z.string().default("en-IN"),
});

// Define this to match the response contract above. Validate the agent's
// output and additionally check each ID against the server-generated allow-list.
const AgentOutputSchema = z.object({
  status: z.enum(["ready_for_review", "needs_attention", "insufficient_information"]),
  summary: z.string(),
  checks: z.array(z.object({
    checkId: z.string(),
    status: z.enum(["pass", "needs_attention", "unknown", "informational"]),
    explanation: z.string(),
    basis: z.enum(["official_rule", "user_input", "community_report"]),
    sourceRefs: z.array(z.string()),
  })),
  followUpQuestion: z.object({
    key: z.string(),
    question: z.string(),
  }).nullable(),
  disclaimer: z.string(),
});

export async function POST(request: Request) {
  const parsedRequest = RequestSchema.safeParse(await request.json());
  if (!parsedRequest.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const input = parsedRequest.data;
  // Add authentication/rate limiting where appropriate.
  // Load only the approved record; reject unsupported scheme IDs.
  const scheme = await getApprovedSchemeRecord(input.schemeId);
  if (!scheme) {
    return NextResponse.json({ error: "Unsupported scheme." }, { status: 404 });
  }

  // These checks own the facts. They run even if the agent is unavailable.
  const validation = validateApplication({
    scheme,
    confirmedFields: input.confirmedFields,
    documentInventory: input.documentInventory,
  });

  const getApprovedSchemeRecordTool: AgentTool<
    { scheme_id: string },
    { ok: boolean; scheme?: ApprovedSchemeForAgent; error?: string }
  > = {
    name: "get_approved_scheme_record",
    description: "Read the approved record for this request's scheme only.",
    inputSchema: {
      type: "object",
      properties: { scheme_id: { type: "string" } },
      required: ["scheme_id"],
    },
    async execute({ scheme_id }) {
      if (scheme_id !== input.schemeId) {
        return { ok: false, error: "Scheme is outside this request's scope." };
      }
      // Return a projection of approved fields only; no raw feedback or PII.
      return { ok: true, scheme: projectApprovedSchemeForAgent(scheme) };
    },
  };

  try {
    const agent = new Agent({
      providerId: process.env.CLINE_PROVIDER_ID!,
      modelId: process.env.CLINE_MODEL_ID!,
      apiKey: process.env.CLINE_MODEL_API_KEY,
      systemPrompt: buildReadinessSystemPrompt(input.locale, validation),
      tools: [getApprovedSchemeRecordTool],
      maxTokensPerTurn: 1800,
      maxIterations: 3,
    });

    const result = await agent.run(JSON.stringify({
      locale: input.locale,
      confirmedFields: minimiseFieldsForExplanation(input.confirmedFields),
      documentInventory: input.documentInventory,
      validation,
      allowedFollowUpKeys: validation.allowedFollowUpKeys,
    }));

    if (result.status !== "completed") {
      return NextResponse.json(buildDeterministicReadinessReport(validation));
    }

    const agentJson = safelyParseAgentJson(result.outputText);
    const checkedOutput = AgentOutputSchema.safeParse(agentJson);
    if (!checkedOutput.success || !validateAgentReferences(checkedOutput.data, validation)) {
      return NextResponse.json(buildDeterministicReadinessReport(validation));
    }

    return NextResponse.json(checkedOutput.data);
  } catch {
    // Log a request ID and error category, not personal form/document values.
    return NextResponse.json(buildDeterministicReadinessReport(validation));
  }
}
```

Before implementation, align the schema types with the actual `validateApplication()` return type, add a request body size limit, avoid logging personal field values, and handle timeouts with `agent.abort()` if the installed SDK version supports the documented runtime API. The agent is created per request and its state is not used to learn from other applicants.

### 11.6 Runtime, cost and reliability notes

- `@cline/agents` is marked experimental in the official repository. Use a pinned, tested package version for the demo rather than floating dependencies.
- The official package metadata specifies Node.js `>=22`; configure a compatible Node runtime and do not deploy this route to an Edge runtime unless a future tested SDK version supports it.
- Set conservative token and iteration budgets, plus a request timeout. Avoid long multi-turn conversations in this endpoint.
- Check `result.status`; do not treat failed or aborted agent runs as successful responses.
- Do not log the raw prompt or applicant documents. Log a request ID, latency, model status and validation outcome counts.
- SDK provider/model selection must be configured by server environment variables; never accept model names, provider IDs, API keys, or tool definitions from the browser.
- If package compatibility, hosting constraints, or model credentials block the SDK integration, preserve the deterministic endpoint and use its fallback report for the hackathon demo.
## 12. Eight-Hour MVP Scope

### Must build

1. **Scheme application catalogue:** 3–5 carefully verified example schemes, not 15–20 unverified entries.
2. **Official checklist:** documents, application steps, source link and last-checked date.
3. **Form/document readiness check:** allow typed document inventory and one example uploaded form; run deterministic checks, then invoke the Cline SDK explanation agent through `POST /api/application/check`; provide a deterministic fallback.
4. **Community extra-document feedback:** capture whether the official list was sufficient and which additional document was requested.
5. **Automatic consensus update:** process a seeded set of sample feedback records and publish a community note when the threshold is reached.
6. **Visual separation:** keep official requirements and community-reported guidance in separate panels.
7. **Demand Check:** show the known official fee and source; provide neutral, safe wording.
8. **Cline SDK boundary:** allow only the read-only approved-scheme tool; validate output IDs and source references; test the deterministic fallback.
9. **Demo-safe data:** use fictional applicant data and explicitly label synthetic feedback used to demonstrate consensus.

### If time remains

- Voice intake in Hindi or English, with text fallback.
- PDF checklist export.
- Opt-in post-visit notification.
- Complaint or information-request draft.
- More languages or more schemes.
- In-app report correction and moderation queue.

### Do not build in the first eight hours

- Automated submission to government websites.
- Direct integration with citizen identity databases.
- A model-training pipeline.
- Nationwide scheme coverage.
- Automated claims that a document is legally mandatory based only on community feedback.

## 13. Acceptance Tests

The prototype is not ready until these cases pass.

1. An official requirement appears only with a valid official source record and check date.
2. A document mentioned by one user is not published as a widely applicable community note.
3. A note is published only after the configured count, agreement, time window and scope checks pass.
4. Community feedback never overwrites or deletes the official requirement list.
5. Conflicting feedback produces an uncertainty label rather than an unsupported conclusion.
6. Old guidance loses confidence or is flagged for review according to the freshness policy.
7. A missing or expired document warning explains the rule that caused it.
8. Low-confidence extraction asks the user to verify the value.
9. A citizen who does not attend the visit is not counted as a negative outcome.
10. No Aadhaar/PAN/bank number is required for feedback or included in analytics records.
11. A zero official fee is displayed only when supported by a verified source record.
12. Complaint text is neutral, user-controlled and does not invent names or events.
13. `POST /api/application/check` runs deterministic validation even if the Cline SDK is unavailable.
14. The agent cannot access another scheme's record by changing its requested tool argument.
15. The agent cannot write to feedback, community guidance, official requirements, or audit/version records.
16. An invalid agent response or unknown check/source ID is rejected and replaced by the deterministic fallback.
17. The agent output cannot turn community-reported guidance into an official requirement.
18. The API returns a controlled error or fallback when the agent fails, aborts, or times out.

## 14. Privacy, Security and Abuse Risks

### Personal data

- Ask for consent before sending a post-visit reminder or using feedback to improve community guidance.
- Keep personal form drafts and reminder preferences separate from aggregated feedback.
- Do not collect Aadhaar, PAN, bank details, OTPs, or full identity-document scans for the feedback loop.
- If document scanning is supported, explain whether images are processed locally or sent to a server. Delete temporary server copies according to a defined retention period.
- The Cline agent receives only the minimum extracted context and validation results needed for explanation. Do not send raw scans, Aadhaar/PAN/bank numbers, OTPs, or unrelated personal details to the model provider.
- Provide a way to delete an account's reminders and personal draft data.

### Incorrect reports and coordinated manipulation

- Require several independent reports before publishing a community note.
- Keep scheme and location scope narrow.
- Use rate limits, duplicate detection, recency windows and audit logs.
- Preserve conflicting reports.
- Give maintainers a way to hide a note quickly if manipulation is suspected.
- Never display a user's identity publicly.

### Safety and trust

- Show that HaqSaathi is an independent information tool, not a government service.
- Never promise approval or guaranteed eligibility.
- Do not call a community-reported document illegal, corrupt or mandatory.
- Verify complaint channels, fee records and official links before displaying them.
- Keep legal disclaimers short and visible.

## 15. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Official sources are outdated or unavailable | Display last-checked date and mark stale records. Do not silently rely on old data. |
| AI invents a requirement | Generate answers only from retrieved records; use structured fields and validation rules. |
| Community reports are manipulated | Apply consensus thresholds, rate limits, duplicate checks and review tools. |
| Requirements differ by district or office | Scope notes geographically and show that local practice may vary. |
| Model merges different documents with similar names | Ask for confirmation and keep uncertain concepts separate. |
| Users mistake community reports for official rules | Use separate panels, explicit labels and distinct visual treatment. |
| Notification feels intrusive | Make it opt-in, limited, and easy to disable. |
| Sensitive documents are exposed | Minimise collection, limit retention, and never place personal data in aggregate analytics. |
| Scope becomes too large | Support a small number of schemes and prove the full learning loop first. |
| Cline SDK is experimental or incompatible with the host | Pin and test a package version, use a compatible Node.js runtime, and preserve deterministic fallback output. |
| Agent invents a finding or citation | Accept only server-issued check IDs and source references; validate structured output and fall back on errors. |
| Agent accidentally reads or changes feedback data | Expose only a read-only, scheme-scoped tool; separate database permissions and never add community-write tools to the agent. |

## 16. Demo Script (Approximately 3 Minutes)

1. **Problem (20 sec):** An applicant can bring every document listed online and still discover at an offline verification centre that another document is expected.
2. **Prepare an application (40 sec):** Select a sample scheme. Show official documents, the source and the readiness check.
3. **Find a mismatch (30 sec):** Show the form checker catching an incomplete field or a certificate mismatch and explaining how to fix it.
4. **Show the missing-document gap (30 sec):** Show the official checklist and explain that community feedback is initially empty.
5. **Simulate feedback (35 sec):** After a fictional scheduled verification date, submit several synthetic applicant outcomes. Show the additional document being normalised and consensus calculated.
6. **Show automatic learning (25 sec):** Once the threshold is met, show the community note appear beside—not inside—the official list. Display the report count, date range and warning that the note is not an official requirement.
7. **Show citizen protection (20 sec):** Open Demand Check, compare a reported charge with the verified official fee, and show the source and safe next step.
8. **Close (10 sec):** Explain that the product improves from real applicant outcomes while keeping official rules auditable.

**Demo integrity:** If feedback is seeded or synthetic, show an explicit “Demo data” label. Do not imply that the sample report count represents real applicants.

## 17. Use of Cline

Cline is used in two different ways. Keep these roles distinct in the README, PPT and demo.

### 17.1 Cline as the coding partner

Use Cline from the first commit and record the work for the required demo video.

Suggested small tasks:

1. Define and validate the scheme, document, feedback and community-guidance schemas.
2. Implement official/community separation in the UI.
3. Build the deterministic application-readiness checks and unit tests.
4. Build the Cline SDK agent wrapper and the read-only approved-scheme tool.
5. Add output-schema validation and deterministic fallback handling to `POST /api/application/check`.
6. Build the feedback aggregation and threshold tests.
7. Add the audit history, demo dataset, and tests for prompt injection, unknown IDs, and denied writes.
8. Prepare the README, architecture diagram and demo flow.

Give Cline small tasks and run tests after each one. Record a short clip of Cline building the core route and tests.

### 17.2 Cline SDK inside HaqSaathi

Use the lightweight, stateless `@cline/agents` package in `POST /api/application/check`, provided the current experimental package works with the chosen Node.js host. Official package documentation describes `@cline/agents` as a stateless agent loop with custom tools and requires Node.js 22 or later. Read the latest SDK documentation and pin a tested version before implementation.

**Agent role:**

- Read approved structured scheme data through one read-only, scheme-scoped custom tool.
- Explain deterministic check results in simple language and the selected locale.
- Explain when a note is community-reported instead of officially listed.
- Select, but not invent, a follow-up question from the allowed questions returned by the backend.
- Return structured output that the API validates before it is sent to the frontend.

**Agent restrictions:**

- It does not decide legal eligibility or run the only validation pass.
- It cannot create or modify official requirements, community guidance, consensus thresholds or audit history.
- It cannot see raw feedback records or arbitrary database tables.
- It cannot use filesystem, shell, web browsing or other general-purpose tools from this request route.
- It cannot transform community reports into official requirements.
- It must not receive unnecessary PII or raw identity-document scans.

### 17.3 Deterministic fallback and demonstration

The endpoint runs `validateApplication()` before invoking the agent. If the agent fails, reaches its iteration limit, is aborted, times out or returns invalid structured output, HaqSaathi returns a useful report generated from deterministic validation results. The basic feature must work without the SDK.

The feedback aggregation pipeline remains a separate deterministic process. It may use a model to normalise candidate document names, but only the publication policy can write an updated community note. The application-check agent cannot invoke or bypass that policy.

For the demo video, show:

1. Cline helping build or test the API route.
2. A request reaching `POST /api/application/check`.
3. The deterministic check results being passed to the Cline agent.
4. A natural-language explanation with allowed source references and a permitted follow-up question.
5. The fallback working when the agent output is forced to fail validation.
6. The separate feedback consensus flow publishing a community note without changing the official document list.
## 18. Delivery Plan

| Time block | Deliverable |
|---|---|
| Hour 1 | Finalise one scheme and sample official sources; define data schemas |
| Hour 2 | Build scheme page and official checklist |
| Hour 3 | Build deterministic readiness checks and mismatch report |
| Hour 4 | Integrate `@cline/agents` into `POST /api/application/check`; add the approved-scheme read-only tool and deterministic fallback |
| Hour 5 | Build feedback form and verification-date follow-up flow |
| Hour 6 | Build feedback normalisation, aggregation, threshold rules, and publication audit history |
| Hour 7 | Add Demand Check and run SDK boundary, output-validation, and acceptance tests |
| Hour 8 | Freeze code, prepare README/PPT, record demo and check deployment |

If less time remains, prioritise the full end-to-end learning loop and deterministic application check for one scheme. Only integrate the SDK after the non-AI fallback is working.
## 19. Success Metrics

For the hackathon prototype:

- The user can prepare a checklist for at least one scheme from official source data.
- The system detects a deliberate missing document or field in the demo.
- The system does not publish a community note from a single report.
- The system publishes the note when the configured consensus rule is met.
- The official list remains unchanged by community feedback.
- Every published community note displays count, scope, recency and uncertainty wording.
- The Cline agent only explains server-generated checks and uses only allowed check IDs and source references.
- An SDK failure or malformed response still returns a useful deterministic readiness report.
- The SDK route has no write access to the community feedback publication pipeline.

For a later pilot, evaluate:

- Reduction in repeat visits caused by missing documents.
- Percentage of verification follow-ups completed.
- Precision of reported supplementary-document observations.
- Rate of false or manipulated community reports.
- User understanding of the distinction between official requirements and community reports.
- Application completion rates, measured only with appropriate consent and a valid comparison method.

## 20. Future Scope

- More state and central schemes, each with a verified source record.
- More Indian languages and voice-based guidance.
- Secure reminders through approved channels.
- Partner review by trusted civil-society organisations or service centres.
- Better official-source change detection.
- Community guidance dashboards showing uncertainty and historical changes.
- Accessibility features for low literacy and low bandwidth.
- Controlled evaluation of a feedback classifier after privacy and quality reviews.

## 21. Final Product Definition

**HaqSaathi is a government-scheme application companion that checks a citizen's form and document readiness, protects the citizen with verified fee information, and improves practical guidance from aggregated applicant experiences.**

Its defining feature is the learning loop: after real verification visits, applicants report whether the official checklist was sufficient. When multiple independent reports agree, HaqSaathi adds a scoped, confidence-labelled community note for future applicants. Official requirements remain separate, traceable, and controlled by official sources.

The Cline SDK is embedded only in the application-check path at `POST /api/application/check`, where a constrained `@cline/agents` agent explains deterministic validation results and selects permitted follow-up questions. It has read-only access to approved scheme records and cannot change official requirements or publish community guidance. The application check remains usable through a deterministic fallback if the SDK is unavailable.


## 22. SDK References and Verification Notes

The SDK details below were checked against the official Cline repository on 2026-10-10. Package status, API signatures, supported runtimes, and provider identifiers can change; verify again before implementation.

- [Cline SDK overview and package map](https://github.com/cline/cline/blob/main/sdk/README.md) — describes `@cline/sdk`, `@cline/core`, `@cline/agents`, `@cline/llms`, and `@cline/shared`.
- [`@cline/agents` package documentation](https://github.com/cline/cline/blob/main/sdk/packages/agents/README.md) — describes the stateless/runtime-agnostic agent loop, custom tools, and `Agent.run()`; the package is currently marked experimental.
- [`@cline/agents` package metadata](https://github.com/cline/cline/blob/main/sdk/packages/agents/package.json) — lists Node.js `>=22` in the current package metadata.
- [Cline SDK production guidance](https://github.com/cline/cline/blob/main/.agents/skills/cline-sdk/references/production/REFERENCE.md) — covers run-status handling, token/iteration budgets and timeouts.

These references establish package/API guidance only. They do not establish that the proposed HaqSaathi integration has already been implemented or tested. The TypeScript route in Section 11.5 is a design outline and must be type-checked against the exact installed SDK version.