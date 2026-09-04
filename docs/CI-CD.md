# CI / CD

Because MOSAIC is a fully static front-end with **no backend service**, the
pipeline validates the front-end thoroughly and treats the built bundle as the
deployable artifact. Both workflows live in `.github/workflows/`.

## Continuous Integration — `ci.yml`

Runs on every push to `main` / `claude/**` and on every pull request:

1. **Install** — `npm ci` (reproducible, from the lockfile).
2. **Icon & asset invariants** — `npm run check:icons`:
   - every `fa-*` icon referenced in the UI resolves to a real inline SVG (no
     silent fallback dots),
   - no decorative emoji in shipped source,
   - no Font Awesome CDN reference (we ship inline SVG only).
3. **Headless engine test** — `npm run test` (`scripts/smoke.mjs`):
   - the simulation advances and completes tasks,
   - **zero reservation violations** (collision counter stays 0),
   - the Map Customizer + site switch (`_syncGraphState`) never throws,
   - the baseline-vs-edge-AI benchmark runs and reports zero collisions,
   - the predictive-avoidance advisory layer evaluates and its policy hook works.
4. **Production build** — `npm run build`, uploaded as an artifact.

Locally, `npm run ci` runs the same three checks in order.

## Continuous Deployment — `deploy.yml`

On merge to `main` (or manual dispatch):

1. install → run the head-less test → `vite build` with the Pages base path,
2. publish `dist/` to **GitHub Pages** via the official Pages actions.

Enable once under *Settings → Pages → Source: GitHub Actions*. For Netlify/Vercel/
Cloudflare Pages instead, point them at build command `npm run build`, publish
directory `dist` (see [DEPLOYMENT.md](DEPLOYMENT.md)).

## What about the backend?

There is no backend to build or deploy — that is by design (see
[BACKEND.md](BACKEND.md)). If one is added later (real robots, persistence,
multi-user), extend the pipeline with a second job: lint/test the service, build a
container image, and deploy it separately; the front-end job stays as-is and simply
points at the new gateway via a runtime flag.

## Extending the pipeline

Natural next additions (kept out to avoid dependency bloat, easy to add):

- **ESLint + Prettier** — add the dev deps and a `lint` script, then a CI step.
- **Lighthouse CI** — budget checks on the built site.
- **Playwright smoke** — a headless browser check that the app boots without
  console errors and the dashboard renders live data (this repository was verified
  this way during development).
