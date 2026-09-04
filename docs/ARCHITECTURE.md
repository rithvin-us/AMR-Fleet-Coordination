# Architecture

MOSAIC is a fully client-side single-page application. There is no server: the
browser runs the simulation, the coordination engine, and the rendering. State
flows one way — the engine owns the world, the UI subscribes and renders.

```
┌──────────────────────────── Browser ────────────────────────────┐
│                                                                  │
│  index.html ── app shell (sidebar, topbar, sim controls)         │
│      │                                                           │
│      ▼                                                           │
│  src/main.js ── controller: navigation, global chrome, tick loop │
│      │                 │                                         │
│      │ renders         │ subscribes to sim ticks                 │
│      ▼                 ▼                                         │
│  src/pages.js ── 8 view renderers + live updaters                │
│      │                                                           │
│      │ reads live state          ┌───────────────────────────┐  │
│      └─────────────────────────► │  src/engine/simulation.js │  │
│                                  │  (owns the world, 10 Hz)  │  │
│                                  └───────────┬───────────────┘  │
│   src/icons.js  (inline SVG)                 │ composes         │
│   src/style.css (night theme)                ▼                  │
│                          graph · astar · tokenManager · p2pBus  │
│                          amrAgent · aiScoring · deadlock ·      │
│                          collisionAvoidance · benchmark         │
│                                                                  │
│   src/engine/threeMap.js ── 3D WebGL digital twin (Three.js)    │
│   src/engine/mapCustomizer.js ── interactive topology editing   │
└──────────────────────────────────────────────────────────────────┘
```

## The two-layer coordination model

The defining design rule (see [INNOVATION.md](INNOVATION.md)):

```
        AI OPTIMIZATION LAYER            recommends only
   task scoring · congestion routing · battery/workload balancing
                        │  (never overrides)
                        ▼
        DETERMINISTIC SAFETY LAYER       absolute authority
   capacity-1 corridor reservations · node-capacity reservations
   FIFO intersection tokens · dead-man release · deadlock resolver
```

Collision-freedom is a property of the **safety layer's resource model**, so the
optimization layer can be replaced freely.

## Runtime data flow (per 100 ms tick)

`Simulation.step(dt)` runs a fixed 100 ms cadence, sub-stepped for time dilation
(1×/2×/5×/10×). Each step:

1. top up the order book (live mode);
2. dispatch unassigned tasks (AI scoring or nearest-agent baseline);
3. deliver in-flight P2P messages;
4. update the FIFO token engine (grants + dead-man revocation);
5. tick every AMR agent (plan → reserve → advance → dwell/charge);
6. recompute edge congestion;
7. run deadlock detection/resolution (every 3rd tick);
8. run the predictive-avoidance advisory pass;
9. assert collision-free invariants and record telemetry.

Then `Simulation._emit()` notifies subscribers; `main.js` re-renders the active
page's live section and refreshes the global chrome.

## Module responsibilities

| Module | Responsibility |
|--------|----------------|
| `main.js` | Owns the `Simulation`, page navigation, global chrome, the subscribe/render loop, icon hydration. |
| `pages.js` | Eight `{ title, render, mount }` view definitions; `render` builds skeleton, `mount` wires events and returns an `update(sim)` callback. |
| `data.js` | Seed domain data: warehouse graph, fleet, task batch, AI weights, config, multi-site presets. |
| `icons.js` | Inline flat-SVG icon set + `hydrateIcons(root)` (replaces the Font Awesome web-font). |
| `engine/simulation.js` | The world: reservations, task book, tick orchestration, fault injection, KPIs. |
| `engine/graph.js` | Topological warehouse graph with dynamic edge cost (distance × congestion). |
| `engine/astar.js` | Local A\* planner (binary-heap open set, `avoidEdges`). |
| `engine/tokenManager.js` | Deterministic FIFO intersection tokens + dead-man lease. |
| `engine/p2pBus.js` | Virtual P2P mesh: RSSI, latency jitter, packet loss. |
| `engine/amrAgent.js` | The AMR edge agent: state machine, kinematics, local planning, reservation movement. |
| `engine/aiScoring.js` | Multi-factor task scoring (RL-ready). |
| `engine/deadlock.js` | Wait-for-graph cycle detection + deterministic resolution. |
| `engine/collisionAvoidance.js` | Predictive near-miss / deadlock-risk advisory layer (pluggable stub). |
| `engine/benchmark.js` | Head-less baseline vs edge-AI comparison. |
| `engine/threeMap.js` | 3D WebGL digital twin (Three.js): night scene, forklifts, pick/place animation. |
| `engine/mapCustomizer.js` | Interactive topology editing + multi-site presets + JSON import/export. |

## Rendering: one engine, two views

The same `Simulation` graph drives:

- a **2D SVG schematic** (`buildWarehouseSVG` / `updateWarehouse` in `pages.js`), and
- a **3D WebGL digital twin** (`threeMap.js`).

Both read live agent pose/status each tick; neither owns state. The 3D twin maps
graph coordinates (160×100 m) into world space and renders forklifts whose mast/
fork animation is driven by real agent job phase (retrieving / carrying / placing).

## Why this is production-shaped

- Deterministic core, pure functions where it matters → testable head-less (see
  `scripts/smoke.mjs`).
- Zero runtime service dependencies → trivial static hosting/CDN.
- Clear seams (AI policy, avoidance policy, topology) → extensible without
  touching safety.

See [BACKEND.md](BACKEND.md) for when a backend *would* be added, and
[ENGINE.md](ENGINE.md) for the engine internals.
