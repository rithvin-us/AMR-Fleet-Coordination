# Contributing / developer guide

## Setup

```bash
npm ci
npm run dev       # http://localhost:5173
```

Before pushing:

```bash
npm run ci        # check:icons + headless test + build
```

## Project layout

```
index.html                 app shell
src/
  main.js                  controller + tick loop + icon hydration
  pages.js                 8 views (render/mount/update)
  data.js                  seed graph, fleet, tasks, config, presets
  style.css                night SCADA design system (single theme)
  icons.js                 inline SVG icon set + hydrateIcons()
  engine/                  coordination engine (see docs/ENGINE.md)
scripts/
  smoke.mjs                headless engine test (npm run test)
  check-icons.mjs          icon/emoji/CDN invariants (npm run check:icons)
docs/                      this documentation
.github/workflows/         CI + CD
```

## Conventions

- **Match the surrounding code.** Vanilla ES modules, no framework, no runtime
  deps beyond Three.js.
- **Never weaken the safety layer.** Optimization/heuristics may only *recommend*.
  The reservation + token model is the collision guarantee and must not be bypassed
  for a UI or performance convenience. The head-less test asserts zero reservation
  violations — keep it green.
- **Icons are inline SVG.** Add a new glyph to `src/icons.js` (24×24 stroke path)
  and reference it as `<i class="fas fa-<name>"></i>`; `hydrateIcons` swaps it in.
  `npm run check:icons` fails the build if a referenced icon has no SVG, if an
  emoji sneaks in, or if a Font Awesome CDN reference reappears.
- **Single night theme.** Use CSS design tokens (`var(--bg-*)`, `var(--text-*)`,
  `var(--accent)` …) rather than hard-coded hexes so the theme stays consistent.

## Plugging in your own collision-/deadlock-avoidance algorithm

`src/engine/collisionAvoidance.js` is a deliberate seam. It is **advisory** — it
predicts and reports, it does not move robots (the deterministic layer does). To
drop in your algorithm:

```js
import { CollisionAvoidance } from './engine/collisionAvoidance.js';

sim.avoidance.registerPolicy((ctx) => {
  // ctx = { a, b, sepM, ttcS, safetyRadiusM, slowRadiusM, horizonS, agentA, agentB }
  // return one of: 'clear' | 'slow' | 'stop' | 'reroute'
  // e.g. velocity-obstacle / ORCA / MAPF / learned policy here
  return myPolicy(ctx);
});
```

`evaluate(world)` returns `{ advisories, interventions, deadlockRisk }`, which the
dashboard surfaces as the "Avoid. Adv" KPI. If you later want advisories to
influence planning, feed them into A\* edge costs or dispatch — an additive change
that still cannot break the safety invariant.

## Plugging in a learned task-allocation policy

`src/engine/aiScoring.js` scores candidates as a pure function of a normalized
feature vector. Replace `scoreFeatures` (or wrap `rankCandidates`) with a learned
policy behind the same interface; nothing else changes.

## Adding a warehouse layout / site

Edit `src/data.js` (`NODES`, `EDGES`, `ZONES`, or a new `FACTORY_BRANCHES` entry),
or build it live in the Map Customizer and export JSON. Any topology change routes
through `simulation._syncGraphState()`, which reconciles the live world.

## Tests

`scripts/smoke.mjs` is the source of truth for engine invariants — extend it when
you add engine behavior. It must pass head-lessly (`node scripts/smoke.mjs`) so CI
stays fast and browser-free.
