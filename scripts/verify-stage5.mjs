// Uses an already-running Chrome CDP endpoint; no browser library dependency.
// Start the app on an isolated database before running this mutation smoke test.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const base = process.env.STAGE5_BASE_URL ?? "http://localhost:3998";
const cdp = process.env.STAGE5_CDP_URL ?? "http://localhost:9225";
const secret = process.env.RECOMPUTE_SECRET;
assert.equal(process.env.STAGE5_ALLOW_TEST_WRITES, "1", "Use an isolated database and set STAGE5_ALLOW_TEST_WRITES=1: this smoke test writes feedback and recomputes guidance");
assert.ok(secret, "Set RECOMPUTE_SECRET for the isolated test app");
const targets = await (await fetch(`${cdp}/json`)).json();
const socket = new WebSocket(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
let serial = 0;
const pending = new Map();
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  const handler = pending.get(message.id);
  if (!handler) return;
  pending.delete(message.id);
  if (message.error) handler.reject(new Error(JSON.stringify(message.error)));
  else handler.resolve(message.result);
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++serial;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function wait(expression) {
  for (let i = 0; i < 150; i++) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out: ${expression}`);
}
async function navigate(url, text) {
  await call("Page.navigate", { url: `${base}${url}` });
  await wait(`document.body?.innerText.includes(${JSON.stringify(text)})`);
  await new Promise((resolve) => setTimeout(resolve, 600));
}
async function setControl(selector, value) {
  await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) throw new Error('Control not found: ' + ${JSON.stringify(selector)});
    const prototype = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
}
async function clickText(text) {
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(text)}));
    if (!button) throw new Error('Button missing'); button.click();
  })()`);
}
async function checkWidth() {
  assert.ok(await evaluate("document.documentElement.scrollWidth <= 360"), "No horizontal overflow at 360px");
  assert.ok(await evaluate("document.querySelector('.independence').getBoundingClientRect().bottom < 640"), "Independence notice above fold");
  const small = await evaluate(`([...document.querySelectorAll('button, select, input:not([type=checkbox]), textarea, a:not(.skip-link)')])
    .filter(e => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height < 44).map(e => e.outerHTML)`);
  assert.deepEqual(small, [], "Tap targets at least 44px");
}

try {
  await call("Page.enable");
  await call("Emulation.setDeviceMetricsOverride", { width: 360, height: 640, deviceScaleFactor: 1, mobile: true });
  await navigate("/", "schemes in the catalogue");
  const catalogue = await (await fetch(`${base}/api/schemes`)).json();
  assert.equal(await evaluate("document.querySelectorAll('.scheme-card').length"), catalogue.count);
  await checkWidth();
  await setControl("#state-filter", "Assam");
  await setControl("#category-filter", "income-support");
  await wait("document.querySelectorAll('.scheme-card').length === 1");
  await clickText("Clear filters");
  await wait(`document.querySelectorAll('.scheme-card').length === ${catalogue.count}`);
  await navigate("/scheme/pmjay", "Anything we showed here would be a guess");
  assert.equal(await evaluate("document.querySelectorAll('form').length"), 0);
  await checkWidth();
  await navigate("/scheme/pm-kisan", "Application readiness");
  assert.equal(await evaluate("document.querySelectorAll('.community-panel').length"), 0);
  await checkWidth();
  await navigate("/scheme/assam-orunodoi", "Application readiness");
  await clickText("Check readiness");
  await wait("document.body.innerText.includes('Standard explanation')");
  assert.ok(await evaluate("document.body.innerText.includes('is on the official list')"));
  await evaluate("document.querySelectorAll('form')[0].querySelectorAll('input[type=checkbox]').forEach(input => input.click())");
  await wait("document.querySelectorAll('form')[0].querySelectorAll('input[type=date]').length === 2");
  await setControl("form input[type='date']:nth-of-type(1)", "2020-01-01");
  await setControl("select[id$='-name-match']", "mismatch_detected");
  assert.ok(await evaluate("!document.body.innerText.includes('Standard explanation')"), "Editing clears stale readiness result");
  await clickText("Check readiness");
  await wait("document.body.innerText.includes('Standard explanation')");
  assert.ok(await evaluate("document.body.innerText.includes('outside the validity period')"));
  assert.ok(await evaluate("document.body.innerText.includes('names do not appear to match')"));
  await call("Network.enable");
  await call("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await clickText("Check readiness");
  await wait("document.querySelector('[role=alert]') !== null");
  await call("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await clickText("Retry readiness check");
  await wait("document.body.innerText.includes('Standard explanation')");
  const officialBefore = await evaluate("document.querySelector('.official-panel').innerHTML");

  const recompute = await fetch(`${base}/api/community-guidance/recompute`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-recompute-secret": secret },
    body: JSON.stringify({ today: "2026-10-10" }),
  });
  assert.equal(recompute.status, 200);
  await navigate("/scheme/assam-orunodoi", "DEMO DATA");
  assert.equal(await evaluate("document.querySelector('.official-panel').innerHTML"), officialBefore);
  await checkWidth();
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.official-panel')).borderLeftStyle"), "solid");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.community-panel')).borderLeftStyle"), "dashed");

  await evaluate("window.scrollTo(0,0); document.documentElement.style.filter = 'grayscale(1)'");
  const screenshot = await call("Page.captureScreenshot", { captureBeyondViewport: true, fromSurface: true });
  const screenshotPath = path.join(os.tmpdir(), "haqsaathi-stage5-greyscale.png");
  await fs.writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
  await evaluate("document.documentElement.style.filter = ''");
  console.log(`Greyscale screenshot: ${screenshotPath}`);

  // Fill the feedback UI using its actual controls and confirmation flow.
  await setControl("select:has(option[value='attended'])", "attended");
  await setControl("input[type='date']", "2026-10-05");
  await setControl("select:has(option[value='prefer_not'])", "no");
  await setControl("textarea", "residence");
  await evaluate("[...document.querySelectorAll('input[type=checkbox]')].at(-1).click()");
  await clickText("Submit real feedback");
  await wait("document.body.innerText.includes('Did you mean')");
  await clickText("Confirm all suggestions");
  await wait("document.body.innerText.includes('Your real feedback has been recorded')");
  const gateBody = { schemeId: 'pmjay', confirmedFields: {}, documentInventory: [] };
  assert.equal((await fetch(`${base}/api/application/check`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gateBody) })).status, 404);
  assert.equal((await fetch(`${base}/api/verification/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schemeId: 'pmjay', attended: true, verificationDate: '2026-10-05', consentForAggregateUse: true, additionalDocumentNames: [], caseKey: 'stage5-tierb-gate' }) })).status, 400);
  await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate("/", "schemes in the catalogue");
  assert.ok(await evaluate("document.documentElement.scrollWidth <= 1280"));
  console.log("Stage 5 browser checks passed: catalogue filters, tier gate, 360px targets, readiness, recompute, provenance, confirmation.");
} finally {
  socket.close();
}