# MOSAIC — Distributed AMR Fleet Coordination

**Edge-AI based distributed fleet coordination for Autonomous Mobile Robots (AMRs)
in smart warehouses.**

![status](https://img.shields.io/badge/status-active-3fb950)
![coordination](https://img.shields.io/badge/coordination-distributed_edge--AI-2f81f7)
![collisions](https://img.shields.io/badge/collisions-structurally_zero-3fb950)
![runtime deps](https://img.shields.io/badge/runtime_deps-three.js_only-8b98a8)
![theme](https://img.shields.io/badge/theme-night_SCADA-0a0e14)

MOSAIC is a fully client-side simulation and command console that demonstrates a
fleet of AMRs coordinating **without a central brain**. Every robot is an
autonomous edge node that plans its own path (local A\*), negotiates shared space
peer-to-peer, and scores its own tasks — while a **deterministic safety layer**
guarantees zero inter-robot collisions.

The design principle throughout: **AI recommends, determinism decides.**
Optimization (task scoring, congestion-aware routing, battery balancing) only
*recommends*; a reservation-and-token safety layer holds absolute authority, so
collision-freedom is a **structural invariant**, not a statistical outcome.

---

## Success criteria

| Criterion | Result |
|-----------|--------|
| Zero inter-robot collisions | Structurally guaranteed by the reservation protocol — asserted live and in the benchmark |
| ≥ 20% reduction in total task time vs traditional | ~20% lower total task time, ~22% faster batch makespan, ~66% less waiting (deterministic benchmark) |
| ≥ 3 AMRs coordinating | 8 by default, expandable |
| Distributed decision-making | Local A\*, P2P mesh, FIFO tokens, on-robot AI task scoring |

## Architecture in one diagram

```
        AI OPTIMIZATION LAYER            recommends only
   multi-factor task scoring · congestion-aware A* · battery/workload balancing
                        |  (never overrides)
                        v
        DETERMINISTIC SAFETY LAYER       absolute authority
   capacity-1 corridor reservations · node-capacity reservations
   FIFO intersection tokens + dead-man release · deadlock resolver
```

A corridor is a capacity-1 FIFO resource and every node has a fixed capacity, so
two robots can never share a lane or a point. The collision counter in the UI is a
live proof. Full detail in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Features

- **Live fleet KPI command center** — 18 real-time KPI tiles + 3 ring gauges, all
  derived from live simulation state.
- **Task / order management** — create, modify, cancel, dispatch; priority + load
  weight; AI allocation to the best candidate.
- **Proactive safety & congestion intelligence** — predictive collision/deadlock
  advisory layer (pluggable ADAS stub), live congestion of busiest corridors,
  notifications, battery-risk ranking.
- **2D schematic + 3D WebGL digital twin** — one engine, two views; forklifts whose
  mast/fork animate by job phase (retrieving → carrying → placing).
- **Interactive Map Customizer** — add/remove nodes & edges, 1-click rack-aisle
  generator, JSON import/export, multi-site presets, live hot-reload.
- **Baseline vs edge-AI benchmark** — deterministic, reproducible.
- **Eight dashboard views**, single professional night theme, inline SVG icons
  (no icon-font/CDN, no emoji).

See [docs/FEATURES.md](docs/FEATURES.md) for the full list and the top-three
rationale.

## Tech stack

| Technology | Purpose |
|-----------|---------|
| Vanilla JavaScript (ES modules) | Simulation + coordination engine, zero framework |
| HTML5 + inline SVG | 2D warehouse canvas + all icons |
| CSS3 (design tokens) | Night SCADA design system (single theme) |
| Three.js | 3D WebGL digital twin |
| Vite | Dev server & bundler (only dev dependency) |

`three.js` is the **only** runtime dependency. No backend, database, or API keys —
see [docs/BACKEND.md](docs/BACKEND.md) for why, and when one would be added.

## Getting started

```bash
# Install (Vite dev-dep + Three.js)
npm ci

# Dev server
npm run dev            # http://localhost:5173/

# Full local CI (icon/asset checks + headless engine test + production build)
npm run ci

# Production build / preview
npm run build
npm run preview
```

## Project structure

```
mosaic-amr-fleet/
├── index.html                  App shell: sidebar, sim controls, topbar
├── vite.config.js              Build config (base path for Pages)
├── public/favicon.svg
├── scripts/
│   ├── smoke.mjs               Headless engine test + invariants (npm run test)
│   └── check-icons.mjs         Icon/emoji/CDN invariants (npm run check:icons)
├── .github/workflows/          CI (ci.yml) + CD to GitHub Pages (deploy.yml)
├── docs/                       Full documentation (start at docs/README.md)
└── src/
    ├── main.js                 Controller: navigation, controls, tick loop
    ├── pages.js                8 view renderers + live updaters
    ├── data.js                 Warehouse graph, fleet, tasks, config, presets
    ├── icons.js                Inline SVG icon system
    ├── style.css               Night SCADA design system
    └── engine/
        ├── graph.js            Warehouse graph + dynamic costs
        ├── astar.js            Local A* planner
        ├── tokenManager.js     Deterministic FIFO token safety engine
        ├── p2pBus.js           Virtual P2P mesh network
        ├── amrAgent.js         AMR edge agent
        ├── aiScoring.js        Multi-factor task scoring
        ├── deadlock.js         Circular-wait detection & resolution
        ├── collisionAvoidance.js  Predictive advisory layer (pluggable stub)
        ├── simulation.js       10 Hz orchestrator + reservation protocol
        ├── benchmark.js        Baseline vs edge-AI benchmark
        └── threeMap.js         3D WebGL digital twin
```

## Documentation

Full documentation lives in [`docs/`](docs/README.md):
[Architecture](docs/ARCHITECTURE.md) ·
[Engine reference](docs/ENGINE.md) ·
[Features](docs/FEATURES.md) ·
[Simulation & benchmark](docs/SIMULATION.md) ·
[Innovation & novelty](docs/INNOVATION.md) ·
[Backend?](docs/BACKEND.md) ·
[Deployment](docs/DEPLOYMENT.md) ·
[CI/CD](docs/CI-CD.md) ·
[Contributing](docs/CONTRIBUTING.md)

## Safety model (why collisions are impossible)

1. Corridors are capacity-1 FIFO resources — one AMR per lane, either direction,
   making head-on and rear-end collisions structurally impossible.
2. Nodes have fixed capacity; reservations are granted FIFO by wait time (no
   starvation).
3. Protected intersections require a FIFO token with a dead-man lease, so a
   stalled or failed holder can never block the fleet forever.
4. A deadlock resolver detects circular waits and breaks them deterministically.

The simulation continuously asserts these invariants; the collision counter is a
live proof, not a hope.
