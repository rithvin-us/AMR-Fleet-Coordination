# 🤖 BEL EdgeFleet — Distributed AMR Fleet Coordination

> **Edge-AI Based Distributed Fleet Coordination System for Autonomous Mobile Robots (AMRs) in Smart Warehouses.**
> Built for the **Bharat Electronics Limited (BEL)** problem statement — Smart India Hackathon (SIH).

![Status](https://img.shields.io/badge/status-active-10b981) ![Coordination](https://img.shields.io/badge/coordination-distributed_edge--AI-00a3e0) ![Safety](https://img.shields.io/badge/collisions-zero-10b981) ![Deps](https://img.shields.io/badge/runtime_deps-0-002b49)

---

## 🔭 Overview

EdgeFleet is a fully client-side, **zero-runtime-dependency** simulation and command console that demonstrates a fleet of Autonomous Mobile Robots coordinating **without a central brain**. Every robot is an autonomous edge node that plans its own path, negotiates shared space peer-to-peer, and scores its own tasks — while a **deterministic safety layer** guarantees zero collisions.

The system directly answers the BEL SIH success criteria:

| BEL Success Criterion | EdgeFleet Result |
| :--- | :--- |
| **Zero inter-robot collisions** | ✅ Structurally guaranteed by the reservation protocol — verified live and in the benchmark |
| **≥ 20% reduction in total task time vs traditional** | ✅ ~21% faster than the centralised stop-and-wait baseline in the built-in benchmark |
| **≥ 3 AMRs coordinating** | ✅ 6 AMRs by default (expandable) |
| **Distributed decision-making** | ✅ Local A*, P2P mesh, FIFO tokens, on-robot AI task scoring |

---

## 🧠 Architecture: AI recommends, determinism decides

The single most important design principle (per the BEL brief) is the strict decoupling of optimisation from safety:

```
┌──────────────────────────────────────────────┐
│            AI OPTIMISATION LAYER             │   recommends only
│  • Multi-factor AMR task scoring             │
│  • Congestion-aware A* routing               │
│  • Battery / workload balancing              │
└───────────────────────┬──────────────────────┘
                        │  (never overrides)
                        ▼
┌──────────────────────────────────────────────┐
│          DETERMINISTIC SAFETY LAYER          │   absolute authority
│  • FIFO mutex tokens at intersections        │
│  • Single-lane corridor reservations         │
│  • Node-occupancy reservations (capacity)    │
│  • Dead-man token release + global E-stop    │
└──────────────────────────────────────────────┘
```

**Collision freedom is not learned or optimised — it is structural.** A corridor (edge) is a capacity-1 FIFO resource and every node has a fixed capacity, so two robots can never share a lane or a point. The AI layer only influences *which* robot takes *which* task and *which* free route it prefers.

---

## ✨ Features

### Coordination engine (`src/engine/`)
- **`graph.js`** — warehouse topological graph: nodes, edges, dynamic congestion, obstacle blocking, capacity-by-type.
- **`astar.js`** — local A* path planner running independently on every AMR (binary-heap open set, dynamic edge costs, obstacle avoidance).
- **`tokenManager.js`** — deterministic **FIFO token engine** for protected intersections: strict timestamp ordering, dead-man lease, self-healing revocation.
- **`p2pBus.js`** — virtual **peer-to-peer mesh**: heartbeats, token negotiation and obstacle gossip with simulated latency, RSSI and packet loss.
- **`amrAgent.js`** — the **AMR edge agent**: task state machine, kinematics, battery, local planning, token coordination, collision-free reservation movement.
- **`aiScoring.js`** — **multi-factor candidate scoring** `Cost = w₁·D + w₂·C + w₃·(1−B) + w₄·W + w₅·H` with an RL-ready interface.
- **`deadlock.js`** — circular-wait detection over the resource wait-for graph + deterministic priority-yield / detour resolution.
- **`simulation.js`** — 10 Hz tick orchestrator, reservation protocol, task dispatch, fault injection, supervisory metrics.
- **`benchmark.js`** — head-less baseline (centralised stop-and-wait) vs proposed (distributed edge-AI) comparison.

### Dashboard (8 live views)
1. **Warehouse Map** — interactive SVG graph, live AMR motion, click any lane to inject/clear an obstacle, scenario console.
2. **Fleet Monitor** — per-AMR telemetry cards (pose, battery, payload, task, health, peers).
3. **P2P Mesh** — mesh topology + live packet feed with RSSI and latency.
4. **FIFO Tokens** — live intersection queues, holders and the transaction log.
5. **Safety / E-Stop** — global and per-AMR emergency stop, fault injection.
6. **Perception** — simulated LiDAR sweep + sensor health per robot.
7. **Telemetry & Benchmark** — live KPIs and the one-click baseline-vs-edge-AI benchmark.
8. **Settings** — toggle coordination features and tune the AI scoring weights live.

### Interactive scenarios
- **Dynamic obstacles** — block a lane; the fleet gossips it and re-plans around it.
- **AMR fault** — kill a robot mid-task; its tokens release and its task is re-scored to the best healthy candidate.
- **Low battery** — force a robot low; it refuses new work and retires to a charging dock.
- **Deadlock demo** — head-on / circular contention is detected and broken by priority yield + A* detour.

---

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| **Vanilla JavaScript (ES modules)** | Entire simulation + coordination engine, zero runtime dependencies |
| **HTML5 + inline SVG** | Live warehouse canvas |
| **CSS3** | BEL navy/cyan design system, dark/light themes, glassmorphism |
| **Vite** | Dev server & bundler (only dev dependency) |
| **Google Fonts + Font Awesome** | Typography & icons (via CDN) |

---

## 🚀 Getting Started

```bash
# 1. Install (only Vite, as a dev dependency)
npm install

# 2. Run the dev server
npm run dev            # → http://localhost:5173/

# 3. Production build / preview
npm run build
npm run preview
```

No backend, database or API keys required — everything runs in the browser.

---

## 📁 Project Structure

```
bel-edgefleet-amr/
├── index.html              # App shell: sidebar, sim control bar, topbar
├── public/
│   └── favicon.svg         # BEL AMR favicon
└── src/
    ├── main.js             # Controller: navigation, controls, live update loop
    ├── pages.js            # 8 view renderers + live updaters
    ├── data.js             # Warehouse graph, fleet, task batch, config
    ├── style.css           # BEL design system
    └── engine/
        ├── graph.js        # Warehouse graph + dynamic costs
        ├── astar.js        # Local A* planner
        ├── tokenManager.js # Deterministic FIFO token safety engine
        ├── p2pBus.js       # Virtual P2P mesh network
        ├── amrAgent.js     # AMR edge agent (state, kinematics, coordination)
        ├── aiScoring.js    # Multi-factor task scoring
        ├── deadlock.js     # Circular-wait detection & resolution
        ├── simulation.js   # 10 Hz orchestrator + reservation protocol
        └── benchmark.js    # Baseline vs edge-AI benchmark
```

---

## 📊 Benchmark

Open **Telemetry & Benchmark → Run Benchmark**. The same fixed 20-task batch runs head-less under both regimes:

- **Baseline — Centralised Stop-and-Wait:** central grant latency per segment, full stop at every intersection, static (congestion-blind) routing, nearest-robot dispatch.
- **Proposed — Distributed Edge-AI:** local A*, congestion-aware routing, FIFO token pre-negotiation (no blanket stop), multi-factor AI dispatch, deadlock resolver.

Representative result: **~21% lower total task time, ~45% less waiting, +13% throughput, and 0 collisions in both regimes** — meeting the BEL targets.

---

## 🔒 Safety Model (why collisions are impossible)

1. **Corridors are capacity-1 FIFO resources.** Only one AMR may occupy an edge at a time, in either direction — this makes head-on and rear-end collisions structurally impossible.
2. **Nodes have fixed capacity.** Junctions hold two, bays and protected intersections exactly one; reservations are granted FIFO by wait time (no starvation).
3. **Protected intersections require a FIFO token** with a dead-man lease, so a stalled or failed holder cannot block the fleet forever.
4. **A deadlock resolver** detects circular waits and breaks them deterministically (lowest-priority robot yields and detours).

The simulation continuously asserts these invariants; the collision counter is a live proof, not a hope.

---

<div align="center">
  <strong>⚡ Built for BEL · Smart India Hackathon — distributed edge intelligence, deterministic safety ⚡</strong>
</div>
