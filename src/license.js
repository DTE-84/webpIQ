import publicJwk from './license-pubkey.json';
import { LICENSE_STORAGE_KEY } from './config.js';

let pro = false;
const listeners = new Set();

function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function verifyKey(key) {
  const parts = String(key || '').trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'WPIQ1') return null;
  if (!crypto.subtle) return null;
  try {
    const pub = await crypto.subtle.importKey('jwk', publicJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pub,
      b64urlToBytes(parts[2]),
      new TextEncoder().encode(parts[1])
    );
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
    if (payload.plan !== 'pro') return null;
    if (payload.exp && payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

function setPro(value) {
  if (pro === value) return;
  pro = value;
  listeners.forEach((fn) => fn(pro));
}

export const isPro = () => pro;
export const onPlanChange = (fn) => listeners.add(fn);

export async function initLicense() {
  let stored = null;
  try { stored = localStorage.getItem(LICENSE_STORAGE_KEY); } catch { /* storage unavailable */ }
  if (stored && (await verifyKey(stored))) setPro(true);
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('pro') === 'dev') setPro(true);
}

export async function activateLicense(key) {
  const payload = await verifyKey(key);
  if (!payload) return false;
  try { localStorage.setItem(LICENSE_STORAGE_KEY, key.trim()); } catch { /* still unlocked for this session */ }
  setPro(true);
  return true;
}

export function deactivateLicense() {
  try { localStorage.removeItem(LICENSE_STORAGE_KEY); } catch { /* ignore */ }
  setPro(false);
}
