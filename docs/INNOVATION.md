# Innovation & Novelty Points

This document distills the ideas in MOSAIC that are defensible as **innovation**
(engineering contributions) and **novelty** (what is new or uncommon versus
standard practice). It is written to be lifted directly into a project report,
thesis chapter, or paper "Contributions" / "Novelty" section.

> Framing sentence you can reuse:
> *"MOSAIC demonstrates a distributed, edge-AI fleet-coordination architecture in
> which optimization is strictly decoupled from safety: learning/heuristics only
> **recommend**, while a deterministic reservation-and-token layer holds absolute
> authority, making inter-robot collisions structurally impossible rather than
> statistically unlikely."*

---

## 1. Core novelty: "AI recommends, determinism decides"

The single load-bearing idea. Most fleet systems either (a) centralize control in
one planner (single point of failure, latency bottleneck), or (b) let a learned
policy drive motion directly (safety becomes probabilistic). MOSAIC separates the
two concerns into two layers with a one-way authority relationship:

| Layer | Role | Authority |
|-------|------|-----------|
| Optimization (edge-AI) | multi-factor task scoring, congestion-aware routing, battery/workload balancing | **recommends only** |
| Determinism (safety) | capacity-1 corridor reservations, node-capacity reservations, FIFO intersection tokens, dead-man release | **absolute — can never be overridden** |

**Why it is novel/valuable:** collision-freedom is a *structural invariant* of the
resource model, not an emergent property of a controller. You can swap the entire
AI layer (heuristic → RL → LLM planner) without re-certifying safety. This is the
central argument the rest of the system supports.

## 2. Corridor-as-capacity-1-resource reservation model

Each edge (corridor) is modeled as a **single-lane, capacity-1 FIFO resource**, and
each node has a fixed type-based capacity. An AMR must atomically hold *both* the
corridor and the destination node before it moves. Consequences:

- Head-on and rear-end collisions are **impossible by construction** (two robots
  can never occupy one lane, in either direction).
- No velocity tuning, no safety margins to hand-tune, no "mostly works" — the
  collision counter in the UI is a **live proof**, asserted every tick.

**Novelty angle:** unifies mutual exclusion for *both* edges and nodes under one
FIFO-fair reservation protocol (ties broken deterministically by wait time then
ID), so a just-arrived robot can never starve one that has been waiting.

## 3. Deterministic FIFO intersection tokens with dead-man lease

Protected intersections use a token engine with:

- strict FIFO ordering by monotonic request timestamp (total, deterministic order),
- a **dead-man lease**: a holder must prove forward progress via heartbeat, or the
  token is force-revoked — a failed/stalled robot can *never* deadlock the fleet,
- self-healing revocation reconciled against the authoritative holder.

**Novelty angle:** liveness (no permanent blocking) is guaranteed independently of
the optimization layer and independently of robot health.

## 4. Distributed deadlock detection over a unified wait-for graph

A single wait-for graph captures *all* contention uniformly — node reservations,
single-lane corridor occupancy, and token holds — so head-on stand-offs (2-cycles)
and N-way gridlock (k-cycles) are the same phenomenon. Resolution is deterministic
and liveness-preserving (highest-ID member that *can* yield does so; a trapped
cycle cascades to a peripheral waiter).

**Novelty angle:** most treatments handle head-on and rotational deadlock as
special cases; here they fall out of one cycle-detection pass.

## 5. Predictive collision/deadlock advisory layer (pluggable ADAS)

`src/engine/collisionAvoidance.js` adds a **non-authoritative early-warning layer**:
constant-velocity time-to-closest-approach prediction for near-misses, plus
circular-wait risk scoring, surfaced as a live "interventions" KPI. It exposes a
clean policy seam (`registerPolicy()`) so a custom algorithm (velocity obstacles,
ORCA/RVO, MAPF, or a learned policy) can be dropped in **without touching the
safety core** — the additive, safe place to do research.

**Novelty angle:** an explicit, testable boundary between *advisory* prediction and
*authoritative* prevention. Advisory failures degrade to "no early warning," never
to a collision.

## 6. Edge-local intelligence with a realistic P2P mesh

Every AMR runs its **own** A\* planner and coordination logic (no central route
server). Peer state is exchanged over a simulated P2P radio with range-limited
RSSI, latency jitter, and stochastic packet loss — so the distributed protocol is
exercised under realistic imperfect-communication conditions, not an idealized bus.

**Novelty angle:** congestion-aware rerouting and token pre-negotiation are decided
at the edge; the fleet keeps coordinating as peers appear/disappear.

## 7. Multi-factor, RL-ready task scoring

Task allocation minimizes a transparent weighted cost
`Cost = w1·D + w2·C + w3·(1−B) + w4·W + w5·H` (distance, congestion, battery,
workload, health), tunable live. Because it is a pure function of a normalized
feature vector, it is fully deterministic/testable and swappable for a learned
policy behind the same interface.

## 8. Reproducible, honest baseline-vs-edge-AI benchmark

A head-less benchmark runs the *same* fixed task batch under a centralized
stop-and-wait baseline and the distributed edge-AI regime, reporting total task
time, makespan, waiting time, throughput, and collisions. Results are
**deterministic** (identical across runs) — ideal for a paper's evaluation table.
Representative outcome: **~20% lower total task time, ~22% faster batch makespan,
~66% less waiting, +28% throughput, 0 collisions in both regimes.** See
[SIMULATION.md](SIMULATION.md) for methodology and how to reproduce.

## 9. Topology-agnostic, hot-reloadable warehouse model

The warehouse is a topological graph decoupled from rendering. An interactive Map
Customizer adds/removes nodes and edges, generates rack aisles in one click,
imports/exports layout JSON, and switches between multi-site presets — with the
live simulation reconciled to the new topology on the fly (`_syncGraphState`). The
same engine drives both a 2D SVG schematic and a 3D WebGL digital twin.

**Novelty angle:** one coordination engine, arbitrary warehouse layouts, no code
changes — the graph *is* the configuration.

---

## Suggested "Contributions" bullet list (paste-ready)

1. A fleet-coordination architecture that **provably decouples optimization from
   safety**, keeping collision-freedom as a structural invariant.
2. A **unified FIFO reservation model** for corridors (capacity-1) and nodes
   (typed capacity) that makes head-on/rear-end collisions impossible by
   construction.
3. A **dead-man FIFO token protocol** guaranteeing intersection liveness even under
   robot failure.
4. **Unified wait-for-graph deadlock detection** treating head-on and k-way
   gridlock uniformly, with deterministic, liveness-preserving resolution.
5. A **pluggable predictive-avoidance seam** separating advisory prediction from
   authoritative prevention.
6. **Edge-local planning over a realistic lossy P2P mesh**, with congestion-aware
   dynamic rerouting and token pre-negotiation.
7. A **reproducible, deterministic benchmark** quantifying the distributed regime's
   advantage over a centralized stop-and-wait baseline.

## Honest limitations (good for a "Future Work" section)

- It is a **simulation/digital twin**, not a deployment on physical robots; kinematics
  are simplified (no full dynamics, no real sensor noise models beyond LiDAR sweep
  visualization).
- The predictive-avoidance policy shipped is a **deterministic stub** — a real
  velocity-obstacle/MAPF/learned policy is the intended drop-in.
- The baseline's handicaps (central grant latency, full intersection stops) are a
  **model** of a naive controller; they are defensible but should be stated as
  modeling assumptions, not measurements from a specific commercial system.
