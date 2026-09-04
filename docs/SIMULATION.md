# Simulation model & benchmark

## The world

- **Warehouse graph** — ~40 typed nodes (charging, junction, intersection,
  storage, pickup, packing, dropoff) and ~60 edges on a 160 × 100 m floor, with 4
  protected intersections (`INT-1..4`) guarded by FIFO tokens.
- **Fleet** — 8 AMRs (mixed BEL-AMR-500 / BEL-AMR-1000) by default, each an
  independent edge node with its own A\* planner, battery, payload, health, and P2P
  inbox.
- **Tick** — fixed 100 ms wall-clock cadence (`DT = 0.1 s`), sub-stepped for
  1×/2×/5×/10× time dilation.

## Movement & safety primitive

An AMR moves one hop only after atomically acquiring:

1. the **single-lane corridor** (edge, capacity 1), and
2. the **destination node** (typed capacity, FIFO-fair by wait time).

Protected intersections additionally require a **FIFO token** with a dead-man
lease. If either reservation cannot be granted, the robot either flows around via a
congestion-aware A\* detour (distributed mode) or waits (baseline). Because a
corridor is capacity-1 in either direction and nodes have fixed capacity, two
robots can never share a lane or a point — collisions are structurally impossible.
`Simulation._checkCollisions()` asserts this invariant every tick; the live
collision counter is a proof, not a hope.

## Task allocation

Unassigned tasks (sorted by priority, then age) are matched to eligible AMRs
(idle/charging, not mid-edge, healthy, above the critical battery floor):

- **Distributed edge-AI:** multi-factor scoring
  `Cost = w1·D + w2·C + w3·(1−B) + w4·W + w5·H` (distance, path congestion,
  battery, workload, health), with a low-battery penalty when battery-aware
  dispatch is on.
- **Centralized baseline:** nearest available AMR by A\* path length.

Flow control never routes two AMRs to the same single-lane bay at once.

## Benchmark methodology

`src/engine/benchmark.js` runs the **same fixed 20-task batch** head-less (no
timers) under two regimes and reports the outcome. Both regimes keep the deadlock
resolver on (it is a liveness safety net, not an optimization). The regime
differentiators are:

| | Baseline — Centralized Stop-and-Wait | Distributed Edge-AI |
|---|---|---|
| Dispatch | nearest-AMR | multi-factor AI scoring |
| Routing | static (congestion-blind) | congestion-aware A\* |
| Per-segment control | central request→grant latency (`baselineGrantS`) | local decision, no round-trip |
| Intersections | full stop every time (`baselineIntersectionWaitS`) | FIFO token pre-negotiation (no blanket stop) |

The baseline handicaps model a *naive* central controller: a per-segment
grant round-trip and a full stop-and-verify at every protected intersection. These
are **modeling assumptions**, calibrated to represent a deliberately simple
strawman — state them as such in a write-up, not as measurements of a specific
commercial system. Current values: `baselineGrantS = 3.8 s`,
`baselineIntersectionWaitS = 5.0 s` (in `src/data.js` → `DEFAULT_CONFIG`).

## Representative results

Deterministic (identical across runs), from the built-in benchmark and
`scripts/smoke.mjs`:

| Metric | Baseline | Edge-AI | Delta |
|---|---:|---:|---:|
| Total task time (s) | ~4115 | ~3323 | **−20.4 %** |
| Batch makespan (s) | ~751 | ~598 | **−21.7 %** |
| Total waiting (s) | ~1661 | ~585 | **−66 %** |
| Throughput (tasks/min) | — | — | **+~28 %** |
| Inter-robot collisions | 0 | 0 | **0 (both)** |

Success criteria met: **≥ 20 % lower total task time**, **zero collisions**,
**≥ 3 AMRs coordinating** (8 by default), **fully distributed decision-making**.

Reproduce headless:

```bash
npm run test         # smoke + invariants, prints the time delta
# or, in the app: Telemetry & Benchmark → Run Benchmark
```

### Interpreting the numbers honestly

The largest, most robust effect is the **~66 % reduction in waiting/contention
time** — exactly what distributed coordination is supposed to win. Total task time
and makespan improvements (~20 %) follow from that once contention dominates. On a
lightly loaded floor the end-to-end gain would be smaller (travel-bound); the
advantage grows with contention, which is the regime where central stop-and-wait
degrades worst.

## Scenario & fault injection

The dashboard can inject: dynamic obstacles (single/triple/clear), AMR faults
(tokens release, task re-scored to a healthy candidate), forced low battery
(refuses work, seeks charging), and custom task dispatch. Each exercises a
different part of the distributed protocol live.
