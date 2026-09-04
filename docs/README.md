# MOSAIC documentation

Documentation for **MOSAIC** — Edge-AI Distributed Fleet Coordination for
Autonomous Mobile Robots (AMRs) in smart warehouses.

| Doc | What's inside |
|-----|---------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture, the two-layer coordination model, data flow, module map. |
| [ENGINE.md](ENGINE.md) | Deep-dive reference for every coordination-engine module. |
| [FEATURES.md](FEATURES.md) | Full fleet-manager feature list + the top three built out; the 8 dashboard views. |
| [SIMULATION.md](SIMULATION.md) | Simulation model, safety primitive, benchmark methodology and results. |
| [INNOVATION.md](INNOVATION.md) | Innovation & novelty points — paste-ready for a report/thesis/paper. |
| [BACKEND.md](BACKEND.md) | Is a backend needed? (Short answer: no.) When you would add one, and how. |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Build, hosting options, base path, production-readiness checklist. |
| [CI-CD.md](CI-CD.md) | The CI and CD pipelines and how to extend them. |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Dev setup, conventions, and the plug-in seams (avoidance & scoring policies). |

## 60-second orientation

- MOSAIC is a **fully client-side** simulation + command console: HTML/CSS/JS +
  Three.js, bundled by Vite. No backend, no database, no API keys.
- The defining idea: **AI recommends, determinism decides** — optimization is
  strictly decoupled from safety, so inter-robot collisions are *structurally
  impossible*, not merely unlikely.
- Every AMR is an **edge node** running its own A\* planner and coordinating with
  peers over a simulated P2P mesh; a deterministic FIFO reservation + token layer
  holds absolute safety authority.
- One engine drives both a **2D schematic** and a **3D WebGL digital twin**.

## Quick start

```bash
npm ci
npm run dev       # http://localhost:5173
npm run ci        # icon/asset checks + headless engine test + production build
```

Start with [ARCHITECTURE.md](ARCHITECTURE.md), then [INNOVATION.md](INNOVATION.md)
if you are writing this up, or [ENGINE.md](ENGINE.md) if you are extending the code.
