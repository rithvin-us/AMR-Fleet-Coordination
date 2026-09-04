// =============================================================================
//  engine/simulation.js — 10 Hz simulation & coordination controller
//
//  Owns the shared world: graph, fleet, deterministic token engine, virtual
//  P2P bus, task book, node reservations, and the supervisory metrics. Runs a
//  fixed 100 ms tick (sub-stepped for time dilation) and publishes state to UI
//  subscribers. Also exposes the interactive fault-injection console.
// =============================================================================

import { WarehouseGraph } from './graph.js';
import { TokenManager } from './tokenManager.js';
import { P2PBus, MSG } from './p2pBus.js';
import { AMRAgent } from './amrAgent.js';
import { rankCandidates } from './aiScoring.js';
import { findPath } from './astar.js';
import { detectDeadlocks, resolveDeadlocks } from './deadlock.js';
import {
  NODES,
  EDGES,
  ZONES,
  FLEET,
  TASK_BATCH,
  DEFAULT_WEIGHTS,
  DEFAULT_CONFIG,
  defaultSettings,
} from '../data.js';

const TICK_MS = 100; // wall-clock cadence
const DT = 0.1; // seconds per simulation sub-step

export class Simulation {
  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.weights = { ...DEFAULT_WEIGHTS };
    this.settings = { ...defaultSettings };
    this.speed = 2; // 1x, 2x, 5x, 10x
    this.running = false;
    this.subscribers = new Set();
    this._timer = null;
    this._taskSeq = 0;
    this.liveTopUp = true; // false for headless benchmark (fixed batch)
    this.build();
  }

  get distributedMode() {
    return this.settings.distributedMode;
  }

  // ---------------------------------------------------------------------------
  //  World construction / reset
  // ---------------------------------------------------------------------------
  build() {
    this.time = 0;
    this.tickCount = 0;
    this.graph = new WarehouseGraph(NODES, EDGES, ZONES);
    this.tokens = new TokenManager(ZONES, this.config);
    this.bus = new P2PBus(this.config);
    this.nodeReservations = new Map(); // nodeId -> Set(amrId)  (current occupants)
    this.nodeWaiters = new Map(); // nodeId -> Map(amrId -> firstRequestTime)
    this.edgeReservations = new Map(); // edgeKey -> Set(amrId) (capacity 1: single-lane)
    this.edgeWaiters = new Map(); // edgeKey -> Map(amrId -> firstRequestTime)
    this.minSeparation = Infinity; // closest approach ever observed (safety telemetry)
    this.agents = FLEET.map((spec) => new AMRAgent(spec, this.config));
    this.tasks = [];
    this.completedLog = [];
    this.alerts = [];
    this.deadlockEvents = [];
    this.metrics = {
      collisions: 0,
      lastCollision: null,
      completedTasks: 0,
      totalTaskTimeMs: 0,
      waitingTime: 0,
      reroutes: 0,
      deadlocksResolved: 0,
    };
    for (const a of this.agents) a.reset(this);
    // Seed an initial backlog; live mode keeps topping it up.
    for (let i = 0; i < 6; i++) this._spawnTask(TASK_BATCH[i % TASK_BATCH.length]);
    this._pushAlert('info', 'Fleet initialised', `${this.agents.length} AMR edge nodes online — distributed coordination active.`);
  }

  reset() {
    const wasRunning = this.running;
    this.stop();
    this.build();
    this._emit();
    if (wasRunning) this.start();
  }

  getAgent(id) {
    return this.agents.find((a) => a.id === id);
  }

  // ---------------------------------------------------------------------------
  //  Reservation protocol (collision-free movement primitive)
  // ---------------------------------------------------------------------------
  nodeOccupants(nodeId) {
    return this.nodeReservations.get(nodeId) || new Set();
  }

  /**
   * Reserve a node for an AMR. Reservation is FIFO-fair: when a node has free
   * capacity it is granted to the AMR(s) that have been waiting longest (ties
   * broken by id), NOT simply to whoever asks first in tick order. This is the
   * same fairness the intersection tokens use, applied to every node — it
   * prevents a robot that just arrived from starving one that has been waiting
   * to move (e.g. a robot trying to exit a single-lane bay).
   */
  tryReserveNode(nodeId, amrId, now = this.time, force = false) {
    let occ = this.nodeReservations.get(nodeId);
    if (!occ) {
      occ = new Set();
      this.nodeReservations.set(nodeId, occ);
    }
    if (occ.has(amrId)) return true;
    if (force) {
      occ.add(amrId);
      this._clearWaiter(amrId);
      return true;
    }
    let waiters = this.nodeWaiters.get(nodeId);
    if (!waiters) {
      waiters = new Map();
      this.nodeWaiters.set(nodeId, waiters);
    }
    if (!waiters.has(amrId)) waiters.set(amrId, now); // record first-request time

    const cap = this.graph.getNode(nodeId).capacity ?? 1;
    const free = cap - occ.size;
    if (free <= 0) return false;

    const order = [...waiters.entries()].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
    const eligible = order.slice(0, free).some((e) => e[0] === amrId);
    if (!eligible) return false;

    occ.add(amrId);
    waiters.delete(amrId);
    return true;
  }

  releaseNode(nodeId, amrId) {
    const set = this.nodeReservations.get(nodeId);
    if (set) set.delete(amrId);
  }

  /** Remove an AMR's pending reservation interest everywhere. */
  _clearWaiter(amrId) {
    for (const w of this.nodeWaiters.values()) w.delete(amrId);
  }

  /** Keep only the AMR's interest in `keepNodeId`, clearing stale intents. */
  pruneWaitersExcept(amrId, keepNodeId) {
    for (const [nid, w] of this.nodeWaiters) if (nid !== keepNodeId) w.delete(amrId);
  }

  // --- Edge reservations: a corridor is a single-lane, capacity-1 FIFO resource
  //     (only one AMR on an edge at a time, in either direction). This makes
  //     head-on and same-lane collisions structurally impossible.
  edgeOccupants(edgeKey) {
    return this.edgeReservations.get(edgeKey) || new Set();
  }

  tryReserveEdge(a, b, amrId, now = this.time) {
    const key = WarehouseGraph.edgeKey(a, b);
    let occ = this.edgeReservations.get(key);
    if (!occ) {
      occ = new Set();
      this.edgeReservations.set(key, occ);
    }
    if (occ.has(amrId)) return true;
    let waiters = this.edgeWaiters.get(key);
    if (!waiters) {
      waiters = new Map();
      this.edgeWaiters.set(key, waiters);
    }
    if (!waiters.has(amrId)) waiters.set(amrId, now);
    if (occ.size >= 1) return false; // single-lane
    const order = [...waiters.entries()].sort((x, y) => x[1] - y[1] || (x[0] < y[0] ? -1 : 1));
    if (order[0][0] !== amrId) return false; // not our turn (FIFO)
    occ.add(amrId);
    waiters.delete(amrId);
    return true;
  }

  releaseEdge(a, b, amrId) {
    const occ = this.edgeReservations.get(WarehouseGraph.edgeKey(a, b));
    if (occ) occ.delete(amrId);
  }

  _clearEdgeWaiter(amrId) {
    for (const w of this.edgeWaiters.values()) w.delete(amrId);
  }

  pruneEdgeWaitersExcept(amrId, keepKey) {
    for (const [k, w] of this.edgeWaiters) if (k !== keepKey) w.delete(amrId);
  }

  _isAlive(amrId) {
    const a = this.getAgent(amrId);
    return !!a && a.status !== 'failed' && a.status !== 'stopped';
  }

  // ---------------------------------------------------------------------------
  //  Task book
  // ---------------------------------------------------------------------------
  _spawnTask(tmpl) {
    const id = `TASK-${String(1000 + this._taskSeq++).toString()}`;
    this.tasks.push({
      id,
      pickup: tmpl.pickup,
      dropoff: tmpl.dropoff,
      priority: tmpl.priority,
      loadKg: tmpl.loadKg,
      status: 'unassigned',
      assignedAmrId: null,
      createdAt: this.time,
      startedAt: null,
      completedAt: null,
      totalTimeSeconds: null,
    });
  }

  reclaimTask(task) {
    task.status = 'unassigned';
    task.assignedAmrId = null;
    task.startedAt = null;
    this._pushAlert('warning', 'Task reassignment', `${task.id} orphaned by AMR failure — re-evaluating candidates.`);
  }

  completeTask(task, amr) {
    task.status = 'completed';
    task.completedAt = this.time;
    task.assignedAmrId = amr.id;
    task.totalTimeSeconds = ((this.time - (task.startedAt ?? task.createdAt)) / 1000);
    this.metrics.completedTasks++;
    this.metrics.totalTaskTimeMs += this.time - (task.startedAt ?? task.createdAt);
    this.completedLog.unshift(task);
    if (this.completedLog.length > 30) this.completedLog.pop();
    this.tasks = this.tasks.filter((t) => t !== task);
  }

  _dispatch() {
    const open = this.tasks
      .filter((t) => t.status === 'unassigned')
      .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
    if (!open.length) return;

    // Eligible = idle or parked-and-charging, not mid-edge, healthy, above the
    // critical battery floor. (Charging AMRs can abandon the dock for work.)
    let pool = this.agents.filter(
      (a) =>
        (a.status === 'idle' || a.status === 'charging') &&
        a.pose.targetNodeId == null &&
        !a.payload.isLoaded &&
        a.health.motorState !== 'fault' &&
        a.battery.soc > this.config.lowBatteryPct,
    );

    // Flow control: never route two AMRs to the same single-lane pickup/dropoff
    // bay at once — they would fight over its one access node. Defer a task
    // whose endpoint is already being served.
    const busyPickups = new Set();
    const busyDropoffs = new Set();
    for (const a of this.agents) {
      if (!a.task) continue;
      if (a.navigation.phase === 'to_pickup') busyPickups.add(a.task.pickup);
      if (a.navigation.phase === 'to_dropoff') busyDropoffs.add(a.task.dropoff);
    }

    for (const task of open) {
      if (!pool.length) break;
      if (busyPickups.has(task.pickup) || busyDropoffs.has(task.dropoff)) continue;
      let chosen = null;
      let ranking = null;
      if (this.distributedMode && this.settings.aiTaskAllocation) {
        const { ranked, winner } = rankCandidates(pool, task, this.graph, this.weights, this.config);
        ranking = ranked;
        chosen = winner ? this.getAgent(winner.amrId) : null;
      } else {
        // Centralised baseline: nearest-available by A* path length.
        chosen = this._nearestAgent(pool, task.pickup);
      }
      if (!chosen) continue;
      task.status = 'assigned';
      task.assignedAmrId = chosen.id;
      task.startedAt = this.time;
      task.ranking = ranking; // kept for the AI inspector panel
      chosen.assignTask(task, this);
      busyPickups.add(task.pickup);
      busyDropoffs.add(task.dropoff);
      pool = pool.filter((a) => a !== chosen);
    }
  }

  _nearestAgent(pool, pickup) {
    let best = null;
    let bestC = Infinity;
    for (const a of pool) {
      const r = findPath(this.graph, a.pose.currentNodeId, pickup);
      if (r.path && r.cost < bestC) {
        bestC = r.cost;
        best = a;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------------------
  //  Simulation step
  // ---------------------------------------------------------------------------
  step(dt) {
    this.time += dt * 1000;
    this.tickCount++;

    // Keep the order book populated in live mode.
    if (this.liveTopUp) {
      const openCount = this.tasks.filter((t) => t.status === 'unassigned' || t.status === 'assigned').length;
      if (openCount < this.agents.length + 1) {
        this._spawnTask(TASK_BATCH[this._taskSeq % TASK_BATCH.length]);
      }
    }

    // Baseline regime uses static routing; distributed uses congestion-aware.
    this.graph.routingUsesCongestion = this.settings.congestionWeighting;

    this._dispatch();
    this.bus.update(this);
    this.tokens.update(this.time, (id) => this._isAlive(id));
    for (const a of this.agents) a.tick(dt, this);
    this._updateCongestion();

    if (this.settings.deadlockResolver && this.tickCount % 3 === 0) {
      const hazards = detectDeadlocks(this);
      if (hazards.cycles.length) {
        const n = resolveDeadlocks(hazards, this);
        if (n > 0) {
          this.metrics.deadlocksResolved += n;
          const kind = hazards.cycles.some((c) => c.length === 2) ? 'head-on' : 'circular-wait';
          this.deadlockEvents.unshift({ t: this.time, n, kind });
          if (this.deadlockEvents.length > 20) this.deadlockEvents.pop();
          this._pushAlert('warning', 'Deadlock resolved', `${n} ${kind} wait(s) broken via priority yield + A* detour.`);
        }
      }
    }

    this._checkCollisions();
  }

  /** Recompute edge congestion for congestion-aware routing (traffic + queue). */
  _updateCongestion() {
    for (const e of this.graph.edges.values()) {
      const occ = this.edgeReservations.get(e.key);
      const wait = this.edgeWaiters.get(e.key);
      const occN = occ ? occ.size : 0;
      const waitN = wait ? wait.size : 0;
      e.activeAMRs = occ || new Set();
      e.congestion = 1 + occN * 0.6 + Math.min(waitN, 3) * 0.5;
    }
  }

  /**
   * Safety verification. Collisions are structurally impossible under the
   * reservation protocol, so this asserts the invariant directly (two AMRs on
   * one edge, or a node over capacity) and separately records the closest
   * physical approach for telemetry.
   */
  _checkCollisions() {
    for (const [, occ] of this.edgeReservations) {
      if (occ.size > 1) {
        this.metrics.collisions++;
        const ids = [...occ];
        this.metrics.lastCollision = { a: ids[0], b: ids[1], t: this.time };
        this._pushAlert('critical', 'RESERVATION VIOLATION', `Edge shared by ${ids.join(' & ')}.`);
      }
    }
    for (const [nid, occ] of this.nodeReservations) {
      const cap = this.graph.getNode(nid).capacity ?? 1;
      if (occ.size > cap) {
        this.metrics.collisions++;
        this._pushAlert('critical', 'RESERVATION VIOLATION', `${nid} over capacity (${occ.size}/${cap}).`);
      }
    }
    // Closest-approach telemetry (moving pairs on distinct nodes).
    const a = this.agents;
    for (let i = 0; i < a.length; i++) {
      for (let j = i + 1; j < a.length; j++) {
        const p = a[i];
        const q = a[j];
        if (p.status === 'failed' || q.status === 'failed') continue;
        if (p.pose.currentNodeId === q.pose.currentNodeId) continue; // co-located at a shared bay
        const d = Math.hypot(p.pose.x - q.pose.x, p.pose.y - q.pose.y);
        if (d < this.minSeparation) this.minSeparation = d;
      }
    }
  }

  // ---------------------------------------------------------------------------
  //  Clock / loop control
  // ---------------------------------------------------------------------------
  start() {
    if (this._timer) return;
    this.running = true;
    this._timer = setInterval(() => {
      const steps = this.speed;
      for (let s = 0; s < steps; s++) this.step(DT);
      this._emit();
    }, TICK_MS);
    this._emit();
  }

  stop() {
    this.running = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this._emit();
  }

  toggleRun() {
    this.running ? this.stop() : this.start();
  }

  setSpeed(mult) {
    this.speed = mult;
    this._emit();
  }

  // ---------------------------------------------------------------------------
  //  Fault / scenario injection console
  // ---------------------------------------------------------------------------
  toggleObstacle(a, b) {
    const e = this.graph.toggleBlocked(a, b);
    if (!e) return;
    // The nearest AMR "detects" it and gossips to the fleet.
    const detector = this._nearestAgentToEdge(a, b) || this.agents[0];
    this.bus.send(
      {
        senderId: detector.id,
        recipientId: 'BROADCAST',
        type: MSG.OBSTACLE,
        payload: { edge: `${a}-${b}`, edgeKey: e.key, cleared: !e.blocked },
      },
      this,
    );
    if (e.blocked) {
      detector.localBlocked.add(e.key);
      this._pushAlert('warning', 'Obstacle injected', `Edge ${a}–${b} BLOCKED — fleet re-routing via local A*.`);
    } else {
      this._pushAlert('info', 'Obstacle cleared', `Edge ${a}–${b} restored to service.`);
    }
    this._emit();
  }

  _nearestAgentToEdge(a, b) {
    const na = this.graph.getNode(a);
    const nb = this.graph.getNode(b);
    const mid = { x: (na.x + nb.x) / 2, y: (na.y + nb.y) / 2 };
    let best = null;
    let bestD = Infinity;
    for (const ag of this.agents) {
      const d = Math.hypot(ag.pose.x - mid.x, ag.pose.y - mid.y);
      if (d < bestD) {
        bestD = d;
        best = ag;
      }
    }
    return best;
  }

  injectFailure(amrId) {
    const a = this.getAgent(amrId);
    if (!a || a.status === 'failed') return;
    a.fail(this);
    this._pushAlert('critical', 'AMR fault', `${amrId} E-stopped — tokens released, task handed back for AI reassignment.`);
    this._emit();
  }

  injectLowBattery(amrId, pct = 12) {
    const a = this.getAgent(amrId);
    if (!a) return;
    a.battery.soc = pct;
    this._pushAlert('warning', 'Low battery', `${amrId} SoC forced to ${pct}% — will refuse tasks & seek charging.`);
    this._emit();
  }

  globalEStop() {
    for (const a of this.agents) {
      if (a.status !== 'failed') {
        a._resumeStatus = a.status;
        a.status = 'stopped';
        a.pose.velocity = 0;
      }
    }
    this.estopActive = true;
    this._pushAlert('critical', 'GLOBAL E-STOP', 'All AMRs commanded to immediate halt by supervisor.');
    this._emit();
  }

  releaseEStop() {
    for (const a of this.agents) {
      if (a.status === 'stopped') a.status = a._resumeStatus || 'idle';
    }
    this.estopActive = false;
    this._pushAlert('info', 'E-stop released', 'Fleet cleared to resume autonomous operation.');
    this._emit();
  }

  stopAgent(amrId, stop) {
    const a = this.getAgent(amrId);
    if (!a || a.status === 'failed') return;
    if (stop) {
      a._resumeStatus = a.status === 'stopped' ? 'idle' : a.status;
      a.status = 'stopped';
      a.pose.velocity = 0;
    } else if (a.status === 'stopped') {
      a.status = a._resumeStatus || 'idle';
    }
    this._emit();
  }

  // ---------------------------------------------------------------------------
  //  Derived metrics for the dashboard
  // ---------------------------------------------------------------------------
  kpis() {
    const minutes = this.time / 60000 || 1e-9;
    return {
      collisions: this.metrics.collisions,
      completed: this.metrics.completedTasks,
      throughput: this.metrics.completedTasks / minutes, // tasks/min
      avgTaskTime: this.metrics.completedTasks ? this.metrics.totalTaskTimeMs / this.metrics.completedTasks / 1000 : 0,
      waitingTime: this.metrics.waitingTime,
      reroutes: this.metrics.reroutes,
      deadlocksResolved: this.metrics.deadlocksResolved,
      messages: this.bus.sent,
      avgLatency: this.bus.avgLatency(),
      dropRate: this.bus.dropRate(),
      activeTokens: this.tokens.snapshot().filter((z) => z.holder).length,
      simSeconds: this.time / 1000,
    };
  }

  // ---------------------------------------------------------------------------
  //  Pub/Sub
  // ---------------------------------------------------------------------------
  subscribe(fn) {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  _emit() {
    for (const fn of this.subscribers) fn(this);
  }

  _pushAlert(type, title, desc) {
    this.alerts.unshift({ type, title, desc, t: this.time, time: fmtClock(this.time) });
    if (this.alerts.length > 30) this.alerts.pop();
  }
}

function fmtClock(ms) {
  const s = Math.floor(ms / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}
