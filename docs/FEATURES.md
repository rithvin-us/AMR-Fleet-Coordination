# Features

## What a fleet-coordination manager's dashboard should have

A comprehensive candidate list of features useful to a warehouse AMR fleet
coordination manager. Items tagged **[built]** are implemented in MOSAIC today; **[top 3]** marks the
three picked as most valuable and implemented/hardened in this iteration.

### Situational awareness
- **[top 3]** **Live fleet KPI command center** — utilization, availability, throughput,
  avg task time, waiting time, collisions, deadlocks resolved, avoidance
  advisories, tokens held, mesh connectivity, congestion index, reroutes,
  average battery, fault count (18 live tiles + 3 ring gauges).
- **[built]** Real-time 2D schematic **and** 3D WebGL digital twin of the floor.
- **[built]** Per-AMR telemetry roster + single-vehicle inspector.
- **[built]** Active-missions board with per-mission stage and progress.
- **[built]** Live P2P mesh view (RSSI, latency, packet feed).

### Task & order management
- **[top 3]** **Order book with task lifecycle** — create, modify, cancel, dispatch;
  priority levels (P1–P3), load weight, live assignment status, AI-based
  allocation to the best candidate.
- **[built]** One-click scenario dispatch and fault injection.

### Safety & risk
- **[top 3]** **Proactive safety & congestion intelligence** — predictive collision /
  deadlock advisory layer (ADAS stub), live congestion heatmap of the busiest
  corridors, notifications/alerts center, and battery-risk ranking (lowest SoC
  first) so at-risk units surface immediately.
- **[built]** Global + per-AMR emergency stop, fault injection & recovery.
- **[built]** FIFO intersection token board (queues, holders, transaction log).
- **[built]** Deadlock detection & resolution with live counter.

### Analytics
- **[built]** Baseline vs edge-AI benchmark (deterministic, reproducible).
- **[built]** Onboard perception view (LiDAR sweep + sensor health).

### Configuration & extensibility
- **[built]** Live coordination settings (11 toggles, all mapped to real behavior).
- **[built]** Tunable AI scoring weights.
- **[built]** Interactive Map Customizer (add/remove nodes & edges, 1-click aisle
  generator, JSON import/export, multi-site presets) with live hot-reload.

### Candidate features not yet built (good backlog / future work)
- Historical KPI trends & shift reports (needs persistence → see
  [BACKEND.md](BACKEND.md)).
- Predictive maintenance from motor/battery degradation trends.
- Geo-fencing / no-go zones and speed-zone overlays.
- Heat-map replay of an incident timeline.
- Role-based access & multi-supervisor shared session.
- Energy/charging schedule optimizer.
- SLA / on-time-delivery tracking per order.

---

## The top three, and how they were implemented

### 1. Live Fleet KPI Command Center  [top 3]
Everything a supervisor needs at a glance, computed live from real simulation
state (never hard-coded). Implemented as an 18-tile KPI strip plus three SVG ring
gauges (utilization, throughput/min, P2P mesh connectivity). All values derive
from `Simulation.kpis()`, which now exposes fleet aggregates (active, available,
charging, faults, avg battery, utilization, mesh connectivity, congestion index,
avoidance interventions, deadlock risk, …).

- Code: `src/pages.js` (`dashboard.render` / `dashboard.mount` update loop),
  `src/engine/simulation.js` (`kpis()`).

### 2. Task / Order Management  [top 3]
A working order book: create, modify, cancel and dispatch tasks with priority and
load weight; the AI layer assigns each to the best candidate and the board shows
live status (queued → assigned AMR). The create/modify modal — previously
non-functional (its trigger button did not exist) — is now wired end to end.

- Code: `src/pages.js` (order-book widget + task modal), `src/engine/simulation.js`
  (`addTask`, `updateTask`, `cancelTask`, `_dispatch`).

### 3. Proactive Safety & Congestion Intelligence  [top 3]
Turns the dashboard from reactive to proactive:

- **Predictive avoidance** — `src/engine/collisionAvoidance.js` predicts near-miss
  and circular-wait risk and reports a live "interventions" KPI; it is a pluggable
  stub (`registerPolicy`) for a future custom algorithm, and never overrides the
  deterministic safety core.
- **Live congestion** — the busiest corridors are computed each tick from real
  edge occupancy + queue length and shown as a ranked bar list (replacing the old
  static graphic).
- **Notifications & battery risk** — the alert stream and a lowest-SoC-first
  battery ranking surface problems before they escalate.

- Code: `src/engine/collisionAvoidance.js`, `src/pages.js` (congestion, notifications,
  battery widgets), `src/engine/simulation.js` (advisory wiring + KPIs).

---

## The eight dashboard views

1. **Warehouse Map** — KPI command center, 2D schematic + 3D digital twin, order
   book, scenario/fault injection, telemetry roster, token board, mesh feed.
2. **Fleet Monitor** — per-AMR roster + inspector with direct movement commands.
3. **P2P Mesh** — spatial RF mesh, RSSI/latency, live packet feed.
4. **FIFO Tokens** — intersection queues, holders, transaction log.
5. **Safety / E-Stop** — global + per-AMR emergency stop, fault/recovery.
6. **Perception** — per-robot LiDAR sweep + sensor health.
7. **Telemetry & Benchmark** — live KPIs + baseline-vs-edge-AI benchmark.
8. **Settings** — 11 coordination toggles + AI scoring weight sliders.
