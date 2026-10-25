// Usage: node tools/mint-license.mjs <customer-id-or-email> [--days 365]
// Prints a license key the app accepts. Lifetime unless --days is given.
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--days');
if (!id) {
  console.error('Usage: node tools/mint-license.mjs <customer-id-or-email> [--days N]');
  process.exit(1);
}
const daysIdx = args.indexOf('--days');
const days = daysIdx >= 0 ? Number(args[daysIdx + 1]) : 0;

const key = createPrivateKey({ key: JSON.parse(readFileSync(join(root, 'tools', '.keys', 'private.jwk'), 'utf8')), format: 'jwk' });
const now = Math.floor(Date.now() / 1000);
const payload = { v: 1, plan: 'pro', id, iat: now, ...(days > 0 ? { exp: now + days * 86400 } : {}) };
const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
const sig = sign('sha256', Buffer.from(payloadB64), { key, dsaEncoding: 'ieee-p1363' });
console.log(`WPIQ1.${payloadB64}.${sig.toString('base64url')}`);
