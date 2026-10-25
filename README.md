# WebPIQ

Private, in-browser bulk image converter (JPG / PNG / HEIC to WebP) for resellers and store owners. Photos never leave the device.

- Web app + installable PWA (Vite, vanilla JS)
- Android / iOS apps via Capacitor (`android/` is generated; iOS must be added on a Mac)
- Encoding runs in a worker pool. Native canvas WebP where available, otherwise a bundled WASM encoder (needed for Safari / iOS WebViews)

## Develop

```bash
npm install
npm run dev          # http://localhost:5173  (add ?pro=dev to unlock Pro locally)
npm run build        # outputs dist/
```

`?encoder=wasm` forces the WASM encoder, which is what iOS will use.

## Pro licensing

Licenses are signed keys (`WPIQ1.<payload>.<signature>`, ECDSA P-256) verified offline in the app. No license server call.

```bash
node tools/gen-keys.mjs                      # once; writes tools/.keys/private.jwk (gitignored) and src/license-pubkey.json
node tools/mint-license.mjs buyer@email.com  # prints a lifetime key; add --days 365 for expiring
```

Back up `tools/.keys/private.jwk`. If it is lost, no new keys will validate against the shipped app. If it leaks, anyone can mint keys; regenerate with `--force` and ship a new build.

## Web release (GitHub Pages)

`.github/workflows/pages.yml` builds and deploys `dist/` on every push to `main`.
In the repo: Settings > Pages > Source: **GitHub Actions**. Optional repo variables: `VITE_CHECKOUT_URL` (Stripe Payment Link), `VITE_PRICE_LABEL`.

## Mobile release

```bash
npm run cap:sync     # build + copy web assets into android/
npx cap open android # needs Android Studio + JDK
```

Store checklist (not done by this repo):
- Apple Developer account ($99/yr) and a Mac (or a cloud Mac builder) for iOS: `npm i @capacitor/ios && npx cap add ios`
- Google Play Developer account; signed AAB; Play Console listing, screenshots, data-safety form
- Privacy policy URL: `<site>/legal/privacy.html`
- **In-app purchase:** Apple and Google require their own billing for unlocking digital features inside the app. The web Stripe checkout is hidden in native builds. Add StoreKit / Play Billing (e.g. RevenueCat) before charging in the apps; until then native builds are free tier.
