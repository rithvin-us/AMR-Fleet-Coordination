# Is a backend needed?

**Short answer: no — not for what this project does.** MOSAIC is a simulation and
command-console *digital twin*. The HTML/CSS/JS + Three.js file structure is more
than sufficient to run the full coordination model (A\*, FIFO tokens, P2P mesh,
deadlock resolution, predictive avoidance) for the fleet sizes involved.

## Why the current client-side structure is enough

The question was specifically: *is the back end actually needed for the HTML/JS
files, or is this file structure enough to run complicated models for a handful
of AMRs?*

- **Compute is tiny.** The graph is ~40 nodes / ~60 edges. A\* over that expands a
  few dozen nodes per plan; the whole fleet re-plans in well under a millisecond.
  The 10 Hz tick does this comfortably in a single browser thread while also
  rendering a 3D scene at 60 FPS.
- **Scale headroom.** The engine runs the head-less benchmark of hundreds of
  simulated seconds in a fraction of a second (see `npm run test`). Going from 8
  AMRs to a few dozen stays interactive. The 2–4 AMR case in the brief is trivial.
- **No shared state to coordinate.** Everything the app needs — graph, fleet,
  tasks, reservations, tokens — lives in memory and is owned by one
  `Simulation` instance. There is nothing a server would arbitrate.
- **No persistence requirement.** It is a live demo/twin; nothing needs to survive
  a refresh. Layouts can be exported/imported as JSON from the browser.
- **No secrets.** No API keys, no auth, no database. Static hosting (GitHub Pages,
  any CDN/S3 bucket) serves the whole thing.

So the file structure — `index.html` + `src/**` bundled by Vite — is the entire
runtime. That is a feature: it deploys anywhere, has zero server cost, and cannot
have a backend outage.

## When you *would* add a backend

A backend becomes worthwhile only when you move past "single-user digital twin"
into one of these:

| Need | Why a backend | Suggested shape |
|------|---------------|-----------------|
| **Real robots** | Ingest live telemetry and send commands to physical AMRs | ROS 2 / MQTT bridge → WebSocket gateway |
| **Multi-user / shared ops room** | Several supervisors viewing one authoritative fleet state | Stateful service (WebSocket) as source of truth; browser becomes a thin view |
| **Persistence & history** | Store tasks, audit logs, KPIs over time; replay incidents | Time-series DB (Postgres/Timescale, InfluxDB) + REST/GraphQL |
| **Fleet-scale simulation (100s–1000s)** | Heavier compute, headless batch runs, parameter sweeps | Node/Python worker service; browser requests runs |
| **Auth / multi-tenant SaaS** | Accounts, roles, per-site isolation | API gateway + identity provider |
| **Heavy optimization / learning** | Train/serve an RL or MAPF policy | Python inference service behind the AI-scoring / avoidance seam |

## Recommended migration path (if it ever goes to production with real robots)

1. Keep the browser app as the **operator console / digital twin** (it already is
   one).
2. Introduce a **WebSocket gateway** that streams authoritative fleet state; make
   the browser subscribe to it instead of a local `Simulation` when a `?live=1`
   flag is present. The `Simulation` interface (pose, status, tasks, tokens) is
   already the natural contract.
3. Put the **deterministic safety layer on the robots / edge controllers** (it is
   already designed to run locally per-agent) and use the server only for
   dispatch, telemetry aggregation, and persistence — never for the collision
   guarantee.
4. Serve the AI scoring and predictive-avoidance policies from an inference
   service behind their existing interfaces.

The point of the architecture (optimization decoupled from safety, per-agent edge
logic) is exactly what makes this migration incremental: nothing about the current
client-side structure has to be thrown away.
