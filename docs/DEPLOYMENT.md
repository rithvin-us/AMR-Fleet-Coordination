# Deployment & production readiness

MOSAIC is a static single-page app. "Deploying" means serving the built `dist/`
folder — there is no server, database, or runtime configuration.

## Build

```bash
npm ci          # reproducible install from package-lock.json
npm run build   # -> dist/  (index.html + hashed CSS/JS assets)
npm run preview # serve the production build locally
```

Output is a handful of static files; `three.js` is bundled into one hashed chunk.

## Hosting options

Any static host works — no special runtime:

- **GitHub Pages** — automated via `.github/workflows/deploy.yml` on merge to
  `main` (enable once under *Settings → Pages → Source: GitHub Actions*). The
  workflow builds with the correct project-site base path.
- **Netlify / Vercel / Cloudflare Pages** — build command `npm run build`, publish
  directory `dist`.
- **S3 + CloudFront / any CDN / nginx** — upload `dist/` and serve as static files.

### Base path

For a GitHub project site the app is served under `/<repo>/`, so the build must set
Vite's `base` accordingly. The deploy workflow does this automatically
(`vite build --base=/<repo>/`). For a root domain or custom domain, the default
`base: '/'` in `vite.config.js` is correct.

## External resources

- **Fonts** load from Google Fonts via `<link>` in `index.html`. They degrade
  gracefully to system fonts if blocked (e.g. air-gapped networks). To fully
  self-host, download the WOFF2 files into `public/` and swap the `<link>` for a
  local `@font-face` block.
- **Icons** are inline SVG (`src/icons.js`) — no CDN, no web-font. Nothing to
  configure.
- **No other third-party runtime dependencies.**

## Production-readiness checklist

- [x] Zero runtime service dependencies (static hosting only).
- [x] Reproducible install (`package-lock.json`, `npm ci`).
- [x] Head-less test + invariant suite (`npm run test`).
- [x] Asset/icon invariants enforced in CI (`npm run check:icons`).
- [x] Clean production build in CI on every push (`.github/workflows/ci.yml`).
- [x] Automated deploy on merge to `main` (`.github/workflows/deploy.yml`).
- [x] Single night theme, no theme-toggle state to manage.
- [x] Responsive across laptop → 4K, and browser zoom 50–200 %.
- [ ] Optional: self-host fonts for fully offline / air-gapped deployment.
- [ ] Optional: add a backend only if you need real robots, persistence, or
      multi-user (see [BACKEND.md](BACKEND.md)).

## Performance notes

- The 3D twin caps the device pixel ratio at 2 and uses a single animation loop;
  it targets 60 FPS on integrated GPUs.
- The engine runs a single-threaded 10 Hz tick; at 10× speed it does 100
  sub-steps/second and still leaves headroom for rendering at the default fleet
  size.
