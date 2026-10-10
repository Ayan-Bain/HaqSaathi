"use client";

import { useId, useRef, useState, type FormEvent } from "react";

interface DocumentSuggestion {
  raw: string;
  suggestedConceptId: string | null;
  suggestedName: string | null;
  confidence: "low" | "none";
}

function isSuggestion(value: unknown): value is DocumentSuggestion {
  if (!value || typeof value !== "object") return false;
  const item = value as DocumentSuggestion;
  return typeof item.raw === "string" &&
    (item.suggestedConceptId === null || typeof item.suggestedConceptId === "string") &&
    (item.suggestedName === null || typeof item.suggestedName === "string") &&
    ["low", "none"].includes(item.confidence);
}

export function FeedbackForm({ schemeId }: { schemeId: string }) {
  return <FeedbackFields key={schemeId} schemeId={schemeId} />;
}

function FeedbackFields({ schemeId }: { schemeId: string }) {
  const id = useId();
  const [attendance, setAttendance] = useState("");
  const [sufficient, setSufficient] = useState("");
  const [district, setDistrict] = useState("");
  const [date, setDate] = useState("");
  const [additionalNames, setAdditionalNames] = useState("");
  const [progress, setProgress] = useState("");
  const [consent, setConsent] = useState(false);
  const [suggestions, setSuggestions] = useState<DocumentSuggestion[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recorded, setRecorded] = useState<string | null>(null);
  const caseKey = useRef<string | null>(null);
  const inFlight = useRef(false);
  const namesInput = useRef<HTMLTextAreaElement>(null);

  function edited() {
    setSuggestions([]);
    setError(null);
  }

  const allSuggestionsMatch = suggestions.length > 0 && suggestions.every((item) =>
    item.confidence === "low" && Boolean(item.suggestedConceptId) && Boolean(item.suggestedName),
  );

  async function send(confirmAll = false) {
    if (inFlight.current || recorded) return;
    setError(null);
    const names = attendance === "attended" ? additionalNames.split(/\r?\n/).map((name) => name.trim()).filter(Boolean) : [];
    if (!consent || !attendance || !date || (attendance === "attended" && !sufficient)) {
      setError("Please complete the required fields and consent before submitting.");
      return;
    }
    if (names.length > 20 || names.some((name) => name.length > 120)) {
      setError("Enter up to 20 document names, one per line, with no more than 120 characters each.");
      return;
    }
    // The API accepts confirmed IDs as a group. Never send a partial group:
    // that would silently discard unmatched names on the server.
    if (confirmAll && (!allSuggestionsMatch || !suggestions.every((item) => names.includes(item.raw)))) {
      setError("Some document names have no matching suggestion. Edit those names before submitting.");
      return;
    }
    inFlight.current = true;
    setPending(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      caseKey.current ??= `web-${crypto.randomUUID()}`;
      const response = await fetch("/api/verification/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          schemeId,
          districtCode: district.trim() || null,
          verificationDate: date,
          attended: attendance === "attended",
          officialListWasSufficient: attendance !== "attended" ? null : sufficient === "yes" ? true : sufficient === "no" ? false : null,
          additionalDocumentNames: names,
          applicationProgress: progress || null,
          consentForAggregateUse: consent,
          caseKey: caseKey.current,
          ...(confirmAll ? { confirmedConcepts: suggestions.map((item) => item.suggestedConceptId!) } : {}),
        }),
      });
      if (response.status === 409) {
        setRecorded("Feedback for this case has already been recorded. No duplicate report was saved.");
        setSuggestions([]);
        return;
      }
      const data = await response.json() as { status?: string; needsConfirmation?: unknown; feedbackId?: unknown };
      if (!response.ok) throw new Error(`Feedback could not be saved (HTTP ${response.status}). Please retry with the same form.`);
      if (data.status === "needs_confirmation" && Array.isArray(data.needsConfirmation) && data.needsConfirmation.length > 0 && data.needsConfirmation.every(isSuggestion) && data.needsConfirmation.every((item) => names.includes(item.raw))) {
        setSuggestions(data.needsConfirmation);
      } else if (data.status === "recorded" && typeof data.feedbackId === "string") {
        setRecorded("Thank you. Your real feedback has been recorded for aggregate use. A single report does not publish a community note.");
        setSuggestions([]);
      } else {
        throw new Error("The server returned an unreadable response. Retry with this form; the same case key prevents duplicate reports.");
      }
    } catch (failure) {
      setError(failure instanceof Error && failure.name !== "AbortError" ? failure.message : "The request timed out. It may have been saved. Retry with this form to avoid a duplicate report.");
    } finally {
      clearTimeout(timeout);
      inFlight.current = false;
      setPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (suggestions.length > 0) return;
    void send();
  }

  return (
    <section className="panel stack" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>Share your verification experience</h2>
      <p>Submit only your actual experience. <strong>Simulation unavailable:</strong> this form saves real feedback, not synthetic demo data.</p>
      <p className="muted" id={`${id}-privacy`}>Do not enter your name, Aadhaar/PAN number, phone number, bank details, application number, or other personal identifiers. For additional documents, enter document types only.</p>
      <form className="stack" onSubmit={submit} aria-describedby={`${id}-privacy`} aria-busy={pending}>
        <fieldset className="stack" disabled={pending || Boolean(recorded)}>
          <legend>Your visit</legend>
          <label className="field">Did you attend verification?
            <select id={`${id}-attendance`} className="control" required value={attendance} onChange={(event) => { edited(); setAttendance(event.target.value); }}>
              <option value="">Choose an answer</option>
              <option value="attended">Yes, I attended</option>
              <option value="postponed">Visit postponed / I did not attend</option>
            </select>
          </label>
          <div className="field-grid">
            <label className="field">{attendance === "postponed" ? "Planned visit date" : "Verification date"} (required)
              <input className="control" type="date" required value={date} onChange={(event) => { edited(); setDate(event.target.value); }} />
            </label>
            <label className="field">District code (optional)
              <input className="control" type="text" maxLength={32} autoComplete="off" value={district} onChange={(event) => { edited(); setDistrict(event.target.value); }} />
            </label>
          </div>
          {attendance === "attended" && <>
            <label className="field">Was the official document list sufficient?
              <select id={`${id}-sufficient`} className="control" required value={sufficient} onChange={(event) => { edited(); setSufficient(event.target.value); }}>
                <option value="">Choose an answer</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
                <option value="unknown">I do not know</option>
                <option value="prefer_not">Prefer not to answer</option>
              </select>
            </label>
            <label className="field" htmlFor={`${id}-documents`}>Additional document names requested (optional, one per line)</label>
            <textarea ref={namesInput} id={`${id}-documents`} className="control" rows={4} maxLength={2419} autoComplete="off" spellCheck={false} value={additionalNames} onChange={(event) => { edited(); setAdditionalNames(event.target.value); }} aria-describedby={`${id}-document-help`} />
            <p className="muted" id={`${id}-document-help`}>Up to 20 document types; 120 characters per name. No document numbers or personal details.</p>
          </>}
          {attendance === "postponed" && <p className="muted">A postponed visit is recorded separately and does not count as evidence of documents requested.</p>}
          <label className="field">Application progress (optional)
            <select className="control" value={progress} onChange={(event) => { edited(); setProgress(event.target.value); }}>
              <option value="">Prefer not to answer</option>
              <option value="not_started">Not started</option>
              <option value="preparing">Preparing documents</option>
              <option value="submitted">Submitted</option>
              <option value="pending_verification">Awaiting verification</option>
              <option value="under_review">Under review</option>
              <option value="completed">Completed</option>
              <option value="do_not_know">I do not know</option>
            </select>
          </label>
          <label className="field"><span><input type="checkbox" required checked={consent} onChange={(event) => { edited(); setConsent(event.target.checked); }} /> I consent to this feedback being stored and used in aggregate community guidance. (Required)</span></label>
          {suggestions.length === 0 && <button className="button" type="submit">{pending ? "Saving…" : error ? "Retry feedback submission" : "Submit real feedback"}</button>}
        </fieldset>
        {suggestions.length > 0 && <section className="community-panel stack" aria-labelledby={`${id}-confirm`}>
          <h3 id={`${id}-confirm`}>Confirm document names before saving</h3>
          <p>No feedback has been saved by this confirmation step. Check every suggested document type.</p>
          <ul className="stack">
            {suggestions.map((item, index) => <li className="check-row" key={`${item.raw}-${index}`}>
              <p>You entered: <strong>{item.raw}</strong></p>
              {item.confidence === "low" && item.suggestedConceptId && item.suggestedName
                ? <p>Did you mean <strong>{item.suggestedName}</strong>?</p>
                : <p className="error">No matching document type was found. Edit this name; it cannot be silently omitted.</p>}
            </li>)}
          </ul>
          {allSuggestionsMatch && <button type="button" className="button" disabled={pending || !consent} onClick={() => void send(true)}>{pending ? "Saving…" : "Confirm all suggestions and submit real feedback"}</button>}
          <button type="button" className="button-secondary" disabled={pending} onClick={() => { edited(); namesInput.current?.focus(); }}>Edit document names</button>
        </section>}
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      <div aria-live="polite" aria-atomic="true">
        {pending && <p role="status">Sending feedback. Please wait.</p>}
        {suggestions.length > 0 && !pending && <p role="status">Review the document-name suggestions above before submitting.</p>}
        {recorded && <p role="status">{recorded}</p>}
      </div>
    </section>
  );
}