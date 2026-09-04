# Coordination engine reference

All engine modules live in `src/engine/`. They are plain ES modules with no
framework dependency, so they run in the browser and head-less in Node (see
`scripts/smoke.mjs`).

## `simulation.js` — the world

Owns the graph, fleet, token engine, P2P bus, task book, reservation ledgers, and
supervisory metrics. Runs the 10 Hz tick and publishes to UI subscribers.

Key methods:

- `step(dt)` — one simulation sub-step (dispatch → comms → tokens → agents →
  congestion → deadlock → predictive avoidance → invariant check).
- `tryReserveNode` / `tryReserveEdge` — FIFO-fair reservation grants.
- `_dispatch()` — task→AMR allocation (AI scoring or nearest baseline).
- `_syncGraphState()` — reconcile live state with a rebuilt graph after Map
  Customizer edits or a site switch (rebuilds tokens + ledgers, re-homes agents,
  prunes invalid tasks). **Load-bearing for all topology editing.**
- `kpis()` — derived metrics + fleet aggregates consumed by the dashboard.
- Fault console: `toggleObstacle`, `injectFailure`, `injectLowBattery`,
  `globalEStop` / `releaseEStop`, `stopAgent`.

## `graph.js` — warehouse topology

Undirected adjacency graph with per-edge dynamic impedance. `edgeCost(edge) =
distance × congestion` (or `distance` when congestion routing is off; `Infinity`
if blocked). Straight-line admissible heuristic.

## `astar.js` — local A\*

Runs *on each AMR*. Binary-heap open set, dynamic edge cost, optional `avoidEdges`
set (used by the deadlock resolver and congestion detours). Returns
`{ path, cost, expanded }`.

## `tokenManager.js` — deterministic FIFO tokens (safety)

Mutual exclusion per protected zone (capacity 1), strict FIFO by request
timestamp (ties by AMR id), and a **dead-man lease**: a live holder proves progress
via heartbeat; a silent/failed holder past the dead-man window is force-revoked.
`update(now, isAlive, deadmanEnabled)` — a genuinely dead holder is always revoked;
stall/lease revocation is gated by the operator's Dead-man Release setting.

## `p2pBus.js` — virtual P2P mesh

Range-limited RSSI, latency jitter (`p2pLatencyMin/MaxMs`), and stochastic packet
loss (`p2pDropRate`). Messages: beacons, token request/release, obstacle gossip,
failure alerts, task claims. Delivered into each agent's `inbox`.

## `amrAgent.js` — the AMR edge agent

Per-robot state machine: `idle → moving → (waiting_token | waiting_traffic) →
loading → moving → unloading → idle`, plus `charging`, `stopped`, `failed`.
Owns kinematics, battery drain, local A\* planning, token coordination, and the
reservation-based movement primitive. Heading is `pose.headingDeg` (consumed by
both the 2D and 3D renderers). Congestion-aware detours via
`_tryCongestionReroute`. Deadlock yield via `yieldFor`.

## `aiScoring.js` — multi-factor task scoring

Pure function of a normalized feature vector `{D, C, B, W, H}`, weighted by the
live-tunable weights. RL-ready: swap `scoreFeatures` for a learned policy behind
the same `rankCandidates` interface. Battery-aware penalty gated by
`config.batteryAware`.

## `deadlock.js` — wait-for-graph cycles

Builds one wait-for graph over node reservations, single-lane corridors, and token
holds, so head-on (2-cycles) and k-way gridlock are detected uniformly (DFS colour
cycle finder). Resolution is deterministic and liveness-preserving.

## `collisionAvoidance.js` — predictive advisory (pluggable stub)

Non-authoritative early-warning: constant-velocity time-to-closest-approach for
near-misses + circular-wait risk. Exposes `registerPolicy(fn)` for a custom
algorithm (velocity obstacles, ORCA/RVO, MAPF, learned policy). It never moves
robots or overrides reservations — advisory failures degrade to "no early warning",
never to a collision. See [CONTRIBUTING.md](CONTRIBUTING.md) for the plug-in seam.

## `benchmark.js` — baseline vs edge-AI

Runs the same fixed task batch head-less under both regimes and computes the
comparison. Deterministic. See [SIMULATION.md](SIMULATION.md).

## `threeMap.js` — 3D WebGL digital twin

Three.js scene: night control-room floor/grid, cutaway walls + loading docks,
multi-tier storage racks, charging pads, octahedron intersection markers, and
forklift vehicles. Vehicle heading comes from `pose.headingDeg`; the mast/fork
carriage animates by **job phase** (retrieving → carrying → placing) so pick/place
work is legible. P2P links render as laser beams; floating badges show each
vehicle's live job.

## `mapCustomizer.js` — topology editing

Add/remove nodes & edges, 1-click rack-aisle generator, JSON import/export, and
multi-site presets. Every mutation rebuilds the graph and calls
`simulation._syncGraphState()` to reconcile the live world.
