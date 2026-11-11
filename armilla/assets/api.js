/* Armilla invite pages — the only network calls the static site makes (WP-116): the public Edge Functions
 * `invite-public` (GET meta, POST complete / revoke) and `invite-result` (GET the invitee's result), with the public
 * anon key and no cookie, no credentials, no referrer. Same headers and envelope as apps/web/src/lib/cloud/api.ts
 * (`apikey`, `Accept`, JSON body; `{data, meta}` / `{error:{code, details}}`, 20 s timeout). The tokens travel only in
 * the query / body of these requests — never in logs here, never in the page's address. */
import { apiConfig } from './config.js';
import { ApiError } from './invite-core.js';

const TIMEOUT_MS = 20_000;

export class NetworkError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NetworkError';
  }
}

export async function callFn(name, { method = 'POST', query = {}, body } = {}) {
  const cfg = apiConfig();
  const params = new URLSearchParams(query);
  // the region the database lives in (Supabase "Regional invocations": the query form is the one CORS allows)
  params.set('forceFunctionRegion', cfg.region);
  const headers = { apikey: cfg.anonKey, Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${cfg.api}/functions/v1/${name}?${params}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: ctl.signal,
    });
  } catch (e) {
    throw new NetworkError(e instanceof Error ? e.message : 'network');
  } finally {
    clearTimeout(timer);
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok) {
    const err = json?.error;
    throw new ApiError(res.status, err?.code ?? `HTTP_${res.status}`, Array.isArray(err?.details) ? err.details : []);
  }
  return json?.data;
}

export const getPublicInvite = (token) => callFn('invite-public', { method: 'GET', query: { token } });
export const completePublicInvite = (body) => callFn('invite-public', { body });
export const revokePublicInvite = (token) => callFn('invite-public', { body: { token, action: 'revoke' } });
export const getInviteResult = (token) => callFn('invite-result', { method: 'GET', query: { token } });
