// One-time: generates the license signing keypair.
// Private key -> tools/.keys/private.jwk (gitignored; BACK IT UP, losing it means you can't mint keys that the shipped app accepts)
// Public key  -> src/license-pubkey.json (committed; embedded in the app)
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const privPath = join(root, 'tools', '.keys', 'private.jwk');
const pubPath = join(root, 'src', 'license-pubkey.json');

if (existsSync(privPath) && !process.argv.includes('--force')) {
  console.error('A private key already exists. Re-run with --force to replace it (invalidates every key minted so far).');
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
mkdirSync(dirname(privPath), { recursive: true });
writeFileSync(privPath, JSON.stringify(privateKey.export({ format: 'jwk' }), null, 2));
writeFileSync(pubPath, JSON.stringify(publicKey.export({ format: 'jwk' }), null, 2) + '\n');
console.log('Wrote', privPath, 'and', pubPath);
