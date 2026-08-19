/**
 * Live end-to-end verification of the ShipStation **Custom Store** order channel.
 *
 * @channel custom-store
 *
 * This is the loop that decides whether the integration actually works. Unit tests cannot answer
 * that question here: the failure modes this integration keeps producing are ones where every
 * function passes its own test and the feed still returns nothing ShipStation can use — a 200 whose
 * body is JSON, an XML document with a misnamed element, credentials the server will not honour.
 * Those only surface when something speaks to the endpoint the way ShipStation does.
 *
 * So this script *is* ShipStation. It makes the same two calls, with the same Basic auth, the same
 * query parameters and the same date format, and then judges the response against
 * `docs/shipstation-custom-store.md`.
 *
 * Run it against anything:
 *
 * ```bash
 *   node scripts/verify-custom-store.mjs                        # localhost:3000
 *   node scripts/verify-custom-store.mjs --base-url https://rebelshops.com
 *   node scripts/verify-custom-store.mjs --verbose              # dump bodies on failure
 * ```
 *
 * Credentials come from `CUSTOM_STORE_USER` / `CUSTOM_STORE_PASS`, or are provisioned through the
 * app's own admin API when `ADMIN_EMAIL` / `ADMIN_PASSWORD` are set. Provisioning deliberately goes
 * through the real route rather than writing the database directly: a credential this script minted
 * itself would prove nothing about the path a merchant actually takes, which is precisely the gap
 * that produced audit P0-1.
 *
 * Exits non-zero if any REQUIRED check fails. Checks marked ADVISORY report but do not fail the
 * run — see `KNOWN_XSD_GAPS` for why the published schema is not treated as a hard gate.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Endpoint under test, relative to the base URL. */
const ENDPOINT = '/api/shipstation/orders';

/**
 * Elements the published XSD (§6) omits but the field table (§5) and ShipStation's own example
 * (§2) both include. Verified 2026-08-19: ShipStation's example fails its own schema on this.
 * Treating the XSD as a hard gate would mean deleting valid, documented fields to satisfy a stale
 * document, so these are reported and allowed rather than silently stripped from the check.
 */
const KNOWN_XSD_GAPS = ['CurrencyCode'];

/** Free-text elements the spec (§2, "What to return") says must be CDATA-wrapped. */
const CDATA_ELEMENTS = ['Name', 'Company', 'Address1', 'City', 'CustomerNotes', 'InternalNotes'];

const args = process.argv.slice(2);
const BASE_URL = (readFlag('--base-url') ?? 'http://localhost:3000').replace(/\/+$/, '');
const VERBOSE = args.includes('--verbose');

const results = [];

/**
 * Read a `--flag value` pair from argv.
 *
 * @param {string} name - Flag name including leading dashes.
 * @returns {string|undefined} The value, or undefined when the flag is absent.
 */
function readFlag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

/**
 * Record the outcome of one check.
 *
 * @param {string} id - Stable identifier, e.g. `EXPORT-3`.
 * @param {boolean} ok - Whether the check passed.
 * @param {string} detail - What was observed. Shown for passes and failures alike, because a
 *   passing check whose detail reads wrong is how a broken verification script hides a bug.
 * @param {{advisory?: boolean, body?: string}} [opts] - Advisory checks never fail the run.
 * @returns {void}
 */
function record(id, ok, detail, opts = {}) {
  results.push({ id, ok, detail, advisory: Boolean(opts.advisory) });
  const mark = ok ? '[32m✓[0m' : opts.advisory ? '[33m![0m' : '[31m✗[0m';
  console.log(`  ${mark} ${id}  ${detail}`);
  if (!ok && VERBOSE && opts.body) {
    console.log(`      ${opts.body.slice(0, 600).replace(/\n/g, '\n      ')}`);
  }
}

/**
 * Format a date the way ShipStation sends it: `MM/dd/yyyy HH:mm`, UTC, 24-hour.
 *
 * @param {Date} date - The instant to format.
 * @returns {string} Formatted date.
 */
function shipStationDate(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(date.getUTCMonth() + 1)}/${p(date.getUTCDate())}/${date.getUTCFullYear()} ${p(date.getUTCHours())}:${p(date.getUTCMinutes())}`;
}

/**
 * Call the Custom Store endpoint exactly as ShipStation would.
 *
 * @param {{user?: string, pass?: string, method?: string, query?: Record<string,string>, body?: string}} opts
 * @returns {Promise<{status: number, contentType: string, body: string}>}
 */
async function call({ user, pass, method = 'GET', query = {}, body }) {
  const url = new URL(BASE_URL + ENDPOINT);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

  const headers = {};
  if (user !== undefined) {
    headers.Authorization = 'Basic ' + Buffer.from(`${user}:${pass ?? ''}`).toString('base64');
  }
  if (body) headers['Content-Type'] = 'application/xml';

  const res = await fetch(url, { method, headers, body });
  return {
    status: res.status,
    contentType: res.headers.get('content-type') ?? '',
    body: await res.text(),
  };
}

/**
 * Whether a response body is XML rather than JSON.
 *
 * @param {{contentType: string, body: string}} res - Response to classify.
 * @returns {boolean} True when both the content type and the body look like XML.
 */
function isXml(res) {
  return /xml/i.test(res.contentType) && /^\s*<\??xml|^\s*</.test(res.body);
}

/**
 * Validate a document against the spec's XSD using xmllint, tolerating the known schema gaps.
 *
 * @param {string} xml - Document to validate.
 * @param {string} xsdPath - Path to the extracted schema.
 * @returns {{ok: boolean, errors: string[], tolerated: string[]}}
 */
function validateAgainstXsd(xml, xsdPath) {
  const dir = mkdtempSync(join(tmpdir(), 'cs-verify-'));
  const xmlPath = join(dir, 'orders.xml');
  writeFileSync(xmlPath, xml);

  let output = '';
  try {
    execFileSync('xmllint', ['--noout', '--schema', xsdPath, xmlPath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, errors: [], tolerated: [] };
  } catch (err) {
    output = String(err.stderr ?? err.stdout ?? err.message);
  }

  const lines = output.split('\n').filter((l) => l.includes('Schemas validity error'));
  const tolerated = lines.filter((l) => KNOWN_XSD_GAPS.some((g) => l.includes(`'${g}'`)));
  const errors = lines.filter((l) => !tolerated.includes(l));
  return { ok: errors.length === 0, errors, tolerated };
}

/**
 * Obtain Custom Store credentials for the run.
 *
 * @returns {Promise<{user: string, pass: string}|null>} Credentials, or null when the credential
 *   path is not implemented yet — which is itself a reportable state, not a crash.
 */
async function resolveCredentials() {
  if (process.env.CUSTOM_STORE_USER && process.env.CUSTOM_STORE_PASS) {
    return { user: process.env.CUSTOM_STORE_USER, pass: process.env.CUSTOM_STORE_PASS };
  }

  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    return null;
  }
  return issueFor(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD, { checkRoundTrip: true });
}

/**
 * Issue Custom Store credentials for one merchant through the real admin route.
 *
 * Deliberately never writes the database directly. A credential this script minted itself would
 * prove nothing about the path a merchant actually takes — which is precisely the gap that let
 * audit P0-1 ship a screen showing credentials the server had never stored.
 *
 * @param {string} email - Merchant sign-in email.
 * @param {string} password - Merchant sign-in password.
 * @param {{checkRoundTrip?: boolean}} [opts] - Whether to assert the read-back matches.
 * @returns {Promise<{user: string, pass: string}|null>} Credentials, or null on any failure.
 */
async function issueFor(email, password, opts = {}) {
  const login = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) {
    console.log(`  (could not sign in as ${email}: ${login.status})`);
    return null;
  }
  const { token } = await login.json();

  const issued = await fetch(`${BASE_URL}/api/admin/integrations/shipstation/custom-store`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ rotate: true }),
  });
  if (!issued.ok) {
    console.log(`  (credential issue failed for ${email}: ${issued.status} ${(await issued.text()).slice(0, 160)})`);
    return null;
  }
  const { username, password: secret } = (await issued.json()).data ?? {};
  if (!username || !secret) {
    console.log(`  (credential route returned no username/password for ${email})`);
    return null;
  }

  if (opts.checkRoundTrip) {
    // What the screen reads back must equal what was persisted, or the merchant is being shown a
    // credential the server will not accept.
    const readBack = await fetch(`${BASE_URL}/api/admin/integrations/shipstation/custom-store`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const readBody = readBack.ok ? await readBack.json() : {};
    record('CRED-1', readBody?.data?.username === username && readBody?.data?.password === secret, 'credentials read back identical to those issued (no phantom-credential class of bug)');
    record('CRED-2', Boolean(readBody?.data?.statusMapping?.['Paid Status']), `status mapping supplied for ShipStation's form: ${JSON.stringify(readBody?.data?.statusMapping ?? {})}`);
  }

  return { user: username, pass: secret };
}

/**
 * Run every check and report.
 *
 * @returns {Promise<void>}
 */
async function main() {
  console.log(`\nShipStation Custom Store verification → ${BASE_URL}${ENDPOINT}\n`);

  const window = {
    start_date: shipStationDate(new Date(Date.UTC(2000, 0, 1))),
    end_date: shipStationDate(new Date(Date.UTC(2100, 0, 1))),
  };

  // ---- Authentication -------------------------------------------------------------------
  console.log('Authentication');
  const anon = await call({ query: { action: 'export', ...window, page: '1' } });
  record('AUTH-1', anon.status === 401, `no credentials → ${anon.status} (want 401)`, { body: anon.body });
  record('AUTH-2', isXml(anon), `401 body is ${isXml(anon) ? 'XML' : `${anon.contentType || 'untyped'} — spec requires XML`}`, { body: anon.body });

  const wrong = await call({ user: 'nobody', pass: 'wrong', query: { action: 'export', ...window, page: '1' } });
  record('AUTH-3', wrong.status === 401, `bad credentials → ${wrong.status} (want 401)`, { body: wrong.body });
  record(
    'AUTH-4',
    !/no such|unknown user|not found/i.test(wrong.body),
    'failure reason does not reveal whether the username exists',
    { body: wrong.body },
  );

  const creds = await resolveCredentials();
  if (!creds) {
    record('AUTH-5', false, 'no Custom Store credentials available — set CUSTOM_STORE_USER / CUSTOM_STORE_PASS, or implement the credential path');
    summarise();
    return;
  }

  // ---- Export ---------------------------------------------------------------------------
  console.log('\nExport (action=export)');
  const exp = await call({ ...creds, query: { action: 'export', ...window, page: '1' } });
  record('EXPORT-1', exp.status === 200, `valid credentials → ${exp.status} (want 200)`, { body: exp.body });
  record('EXPORT-2', isXml(exp), `content type is ${exp.contentType || 'unset'}`, { body: exp.body });

  let wellFormed = false;
  try {
    execFileSync('xmllint', ['--noout', '-'], { input: exp.body, stdio: ['pipe', 'ignore', 'pipe'] });
    wellFormed = true;
  } catch { /* reported below */ }
  record('EXPORT-3', wellFormed, wellFormed ? 'body is well-formed XML' : 'body is NOT well-formed XML', { body: exp.body });

  if (wellFormed) {
    const root = exp.body.match(/<Orders([^>]*)>/);
    record('EXPORT-4', Boolean(root && /pages\s*=/.test(root[1])), `root <Orders> carries a pages attribute${root ? ` (${root[1].trim() || 'none'})` : ''}`);
    record('EXPORT-5', Boolean(root) && !/\bpage\s*=/.test(root[1]), 'root carries no non-spec page attribute (spec defines only "pages")');

    const cdataMissing = CDATA_ELEMENTS.filter((el) => {
      const m = exp.body.match(new RegExp(`<${el}>([^<]+)</${el}>`));
      return m && m[1].trim() !== '' && !m[1].includes('CDATA');
    });
    record('EXPORT-6', cdataMissing.length === 0, cdataMissing.length ? `free-text not CDATA-wrapped: ${cdataMissing.join(', ')}` : 'free-text fields are CDATA-wrapped');

    const dates = [...exp.body.matchAll(/<(OrderDate|LastModified)>([^<]*)</g)].map((m) => m[2]);
    const badDates = dates.filter((d) => !/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(d.trim()));
    record('EXPORT-7', dates.length > 0 && badDates.length === 0, dates.length === 0 ? 'no orders in window to date-check' : badDates.length ? `dates not MM/dd/yyyy HH:mm: ${badDates.slice(0, 3).join(', ')}` : `${dates.length} dates in MM/dd/yyyy HH:mm`);

    const xsdPath = readFlag('--xsd');
    if (xsdPath) {
      const v = validateAgainstXsd(exp.body, xsdPath);
      record('EXPORT-8', v.ok, v.ok ? `validates against the XSD${v.tolerated.length ? ` (${v.tolerated.length} known gap(s) tolerated)` : ''}` : `XSD errors: ${v.errors.slice(0, 2).join(' | ')}`, { advisory: true, body: v.errors.join('\n') });
    }

    // The spec (§2) says return every order modified in the window REGARDLESS of status.
    const statuses = [...exp.body.matchAll(/<OrderStatus>(?:<!\[CDATA\[)?([^<\]]*)/g)].map((m) => m[1]);
    record('EXPORT-9', statuses.some((s) => /cancel/i.test(s)), statuses.length === 0 ? 'no orders returned — cannot check status coverage' : `cancelled orders present in feed (statuses: ${[...new Set(statuses)].join(', ')})`);
  }

  // ---- Tenant isolation -----------------------------------------------------------------
  // The credential *is* the tenant selector here — there is no store id anywhere in a ShipStation
  // request — so isolation rests entirely on the username lookup resolving exactly one row.
  if (process.env.ADMIN_EMAIL_B && process.env.ADMIN_PASSWORD_B) {
    console.log('\nTenant isolation');
    const other = await issueFor(process.env.ADMIN_EMAIL_B, process.env.ADMIN_PASSWORD_B);
    if (other) {
      record('TENANT-1', other.user !== creds.user, `second store has a distinct username (${other.user})`);

      const swapped = await call({ user: other.user, pass: creds.pass, query: { action: 'export', ...window, page: '1' } });
      record('TENANT-2', swapped.status === 401, `store A's secret against store B's username → ${swapped.status} (want 401)`);

      const mine = await call({ ...creds, query: { action: 'export', ...window, page: '1' } });
      const theirs = await call({ user: other.user, pass: other.pass, query: { action: 'export', ...window, page: '1' } });
      const numbers = (xml) => new Set([...xml.matchAll(/<OrderNumber>(?:<!\[CDATA\[)?([^<\]]*)/g)].map((m) => m[1]));
      const a = numbers(mine.body);
      const b = numbers(theirs.body);
      const overlap = [...a].filter((n) => b.has(n));
      record('TENANT-3', a.size > 0 && b.size > 0 && overlap.length === 0, `store A sees ${a.size} orders, store B sees ${b.size}, overlap ${overlap.length} (want 0)`);
    } else {
      record('TENANT-1', false, 'could not issue credentials for the second store');
    }
  }

  console.log('\nAction routing');
  const badAction = await call({ ...creds, query: { action: 'nonsense', ...window } });
  record('ACTION-1', badAction.status >= 400, `unknown action → ${badAction.status} (want 4xx)`, { body: badAction.body });
  record('ACTION-2', isXml(badAction), `error body is ${isXml(badAction) ? 'XML' : 'not XML'}`, { body: badAction.body });

  const postNoAction = await call({ ...creds, method: 'POST', body: '<ShipNotice><OrderNumber>x</OrderNumber></ShipNotice>' });
  record('ACTION-3', postNoAction.status >= 400, `POST without action=shipnotify → ${postNoAction.status} (want 4xx; a bare POST must not be treated as a ship notice)`, { body: postNoAction.body });

  summarise();
}

/**
 * Print the summary and set the exit code.
 *
 * @returns {void}
 */
function summarise() {
  const required = results.filter((r) => !r.advisory);
  const failed = required.filter((r) => !r.ok);
  const advisory = results.filter((r) => r.advisory && !r.ok);

  console.log(`\n${'─'.repeat(64)}`);
  console.log(`  ${required.length - failed.length}/${required.length} required checks passed${advisory.length ? `, ${advisory.length} advisory warning(s)` : ''}`);
  if (failed.length) {
    console.log('\n  Failing:');
    for (const f of failed) console.log(`    ${f.id}  ${f.detail}`);
  }
  console.log(`${'─'.repeat(64)}\n`);
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((err) => {
  console.error(`\nVerification could not run: ${err.message}\n`);
  process.exitCode = 2;
});
