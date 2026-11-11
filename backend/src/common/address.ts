/**
 * Addresses are the only thing typed into the address bar and the only thing a
 * site author can point at, so there is exactly one place that decides what an
 * address is. Everything else (publish, lookup, links, visits) goes through here.
 *
 * Shape:  one or more DNS-style labels, then a letters-only TLD.   tidepool.zz
 * Canonical form: lowercase, no scheme, no trailing slash.
 */

export const ADDRESS_MAX_LENGTH = 100;

const LABEL = '[a-z0-9]+(?:-[a-z0-9]+)*';
const ADDRESS_RE = new RegExp(`^(?:${LABEL}\\.)+[a-z]{2,10}$`);
// "small://" is accepted as a courtesy prefix, http(s) deliberately is not:
// there is no real network, and `https://evil.example` must never look like an address.
const SCHEME_RE = /^small:\/\//i;

export type AddressResult =
  | { ok: true; address: string }
  | { ok: false; reason: 'malformed'; raw: string };

export function parseAddress(raw: unknown): AddressResult {
  if (typeof raw !== 'string') return { ok: false, reason: 'malformed', raw: '' };
  let s = raw.trim().replace(SCHEME_RE, '').toLowerCase();
  s = s.replace(/\/+$/, '');
  if (s.length === 0 || s.length > ADDRESS_MAX_LENGTH) {
    return { ok: false, reason: 'malformed', raw: raw.slice(0, ADDRESS_MAX_LENGTH) };
  }
  if (!ADDRESS_RE.test(s) || s.split('.').some((l) => l.length > 63)) {
    return { ok: false, reason: 'malformed', raw: raw.slice(0, ADDRESS_MAX_LENGTH) };
  }
  return { ok: true, address: s };
}

/** Convenience for places that only care about "valid canonical address or null". */
export function normalizeAddress(raw: unknown): string | null {
  const r = parseAddress(raw);
  return r.ok ? r.address : null;
}
