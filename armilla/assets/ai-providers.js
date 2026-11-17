/* Armilla privacy policy — the "which company each AI feature uses now" table follows the service (WP-236, D-65 O-3).
 *
 * The owner moves an AI feature between OpenAI and Google with one command on the server (deploy/scripts), never by
 * editing this page. So when the page opens, this script asks production's public health endpoint for the routing it
 * resolves — GET <api>/functions/v1/healthz → data.ai.surfaces.<surface>.provider — and writes each row's company.
 *
 *   rows   <tr data-ai-surfaces="ask"> … <td data-ai-provider>OpenAI</td>: the surface name(s) a row stands for
 *          (`supabase/functions/_shared/llm/provider.ts` MODEL_SURFACES; deploy/site/tests pins the mapping)
 *   cell   the company's NAME only (never a model); a row whose surfaces sit with different companies shows both
 *   fail   no answer within the timeout, a non-200, an unreadable body, a surface missing or without a provider, or a
 *          provider we have no name for → that row (or the whole table) keeps the text it was published with — the
 *          assignment on the publication date. Without JavaScript the published table is all there is.
 *
 * The request is a CORS "simple" GET: no cookie, no credentials, no key, no custom header, no referrer; the endpoint
 * answers `access-control-allow-origin: https://arcturatech.com`. The page's CSP allows exactly this host
 * (connect-src). Nothing is stored.
 */
import { SITE } from './config.js';

export const COMPANY = Object.freeze({ openai: 'OpenAI', gemini: 'Google (Gemini API)', anthropic: 'Anthropic' });
export const TIMEOUT_MS = 6_000;

/** The company text for one row, or null when any of its surfaces cannot be named (keep the published text). */
export function companiesFor(surfaces, routing) {
  const names = [];
  for (const s of surfaces) {
    const provider = routing?.[s]?.provider;
    const name = typeof provider === 'string' ? COMPANY[provider] : undefined;
    if (!name) return null;
    if (!names.includes(name)) names.push(name);
  }
  return names.length ? names.join(' / ') : null;
}

/** The routing from production's health endpoint, or null. */
export async function readRouting({ api = SITE.api, region = SITE.region, fetchFn = globalThis.fetch, timeoutMs = TIMEOUT_MS } = {}) {
  if (typeof fetchFn !== 'function') return null;
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    const res = await fetchFn(`${api}/functions/v1/healthz?forceFunctionRegion=${encodeURIComponent(region)}`, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: ctl?.signal,
    });
    if (!res || !res.ok) return null;
    const json = await res.json();
    const surfaces = json?.data?.ai?.surfaces;
    return surfaces && typeof surfaces === 'object' ? surfaces : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Fill the table under `root`. Returns 'filled' (every row from the service), 'partial' (some rows kept their published
 * text), 'failed' (the service could not be read — nothing changed) or 'none' (no table on the page).
 */
export async function fillAiProviders(root, opts = {}) {
  const rows = [...(root?.querySelectorAll?.('tr[data-ai-surfaces]') ?? [])];
  if (rows.length === 0) return 'none';
  const routing = await readRouting(opts);
  if (!routing) return 'failed';
  let kept = 0;
  for (const row of rows) {
    const surfaces = (row.getAttribute('data-ai-surfaces') || '').split(/\s+/).filter(Boolean);
    const cell = row.querySelector('[data-ai-provider]');
    const text = cell ? companiesFor(surfaces, routing) : null;
    if (text === null) {
      kept += 1;
      continue;
    }
    if (cell.textContent !== text) cell.textContent = text;
  }
  return kept === 0 ? 'filled' : 'partial';
}

if (typeof document !== 'undefined') {
  const run = () => {
    void fillAiProviders(document);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
}
