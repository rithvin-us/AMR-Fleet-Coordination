// =============================================================================
//  engine/collisionAvoidance.js — Predictive collision & deadlock avoidance
//                                 (ADVISORY layer / pluggable stub)
//
//  WHAT THIS IS
//  ------------
//  A self-contained, deterministic *advisory* layer that predicts imminent
//  robot-to-robot conflicts (near-misses) and circular-wait (deadlock) risk a
//  few seconds ahead of time. It is intentionally a STUB with a clean plug-in
//  seam: drop in your own policy (velocity obstacles, ORCA/RVO, MAPF, a learned
//  policy, …) via `CollisionAvoidance.registerPolicy()` without touching the
//  rest of the app.
//
//  WHY IT IS ADVISORY (read before wiring it into movement)
//  --------------------------------------------------------
//  Collision freedom in MOSAIC is *structural*: a corridor is a capacity-1 FIFO
//  resource and every node has a fixed capacity (see engine/simulation.js's
//  reservation protocol + engine/tokenManager.js). Those invariants already make
//  two robots sharing a lane or a point impossible. This module therefore does
//  NOT move robots or override reservations — doing so could only *weaken* the
//  guarantee. Instead it surfaces *early-warning advisories* and a live
//  "interventions" metric, exactly the signal a real fleet's ADAS/again-safety
//  layer would raise. Your future algorithm can consume the same advisories and,
//  if you choose, feed them back into planning (e.g. bias A* away from a
//  predicted hotspot) — the safe, additive place to experiment.
//
//  INTERFACE (stable — build against this)
//  ---------------------------------------
//    const ca = new CollisionAvoidance({ horizonS, safetyRadiusM });
//    ca.registerPolicy(fn)   // fn(ctx) => 'clear'|'slow'|'stop'|'reroute'
//    const report = ca.evaluate(world)
//        // => { advisories: Advisory[], interventions: number, deadlockRisk: n }
//
//    Advisory = {
//      kind: 'near_miss' | 'deadlock_risk',
//      a: amrId, b: amrId|null,
//      ttcS: number,          // predicted time-to-conflict (seconds)
//      sepM: number,          // current separation (metres)
//      action: 'slow'|'stop'|'reroute'|'monitor',
//      note: string,
//    }
// =============================================================================

const R2D = 180 / Math.PI;

export class CollisionAvoidance {
  /**
   * @param {{horizonS?:number, safetyRadiusM?:number, slowRadiusM?:number}} [opts]
   */
  constructor(opts = {}) {
    this.horizonS = opts.horizonS ?? 3.0;       // look-ahead window (s)
    this.safetyRadiusM = opts.safetyRadiusM ?? 2.4; // hard "too close" ring (m)
    this.slowRadiusM = opts.slowRadiusM ?? 5.0;  // soft "caution" ring (m)
    this.interventionsTotal = 0;
    this.lastReport = { advisories: [], interventions: 0, deadlockRisk: 0 };
    this._policy = defaultPolicy; // swappable via registerPolicy()
  }

  /**
   * Replace the built-in advisory policy. Your function receives a context
   * object and must return one of 'clear' | 'slow' | 'stop' | 'reroute'.
   * @param {(ctx: AvoidanceContext) => 'clear'|'slow'|'stop'|'reroute'} fn
   */
  registerPolicy(fn) {
    if (typeof fn === 'function') this._policy = fn;
    return this;
  }

  /**
   * Evaluate the current world and produce advisories. Pure w.r.t. the world:
   * it reads pose/velocity/heading only and never mutates agents.
   * @param {import('./simulation.js').Simulation} world
   */
  evaluate(world) {
    const advisories = [];
    const agents = world.agents.filter((a) => a.status !== 'failed' && a.status !== 'stopped');

    // 1) Pairwise predictive near-miss (constant-velocity closest-approach).
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const a = agents[i];
        const b = agents[j];
        // Two robots resting on the same shared bay are not a moving conflict.
        if (a.pose.currentNodeId === b.pose.currentNodeId) continue;
        const sep = dist(a.pose, b.pose);
        if (sep > this.slowRadiusM) continue; // outside the caution ring

        const ttc = timeToClosestApproach(a, b, this.safetyRadiusM);
        const ctx = {
          a: a.id, b: b.id, sepM: sep, ttcS: ttc,
          safetyRadiusM: this.safetyRadiusM, slowRadiusM: this.slowRadiusM,
          horizonS: this.horizonS, agentA: a, agentB: b,
        };
        const action = this._policy(ctx);
        if (action && action !== 'clear') {
          advisories.push({
            kind: 'near_miss', a: a.id, b: b.id,
            ttcS: round1(ttc), sepM: round1(sep), action,
            note: `${a.id}↔${b.id} closing (sep ${round1(sep)} m, TTC ${ttc === Infinity ? '∞' : round1(ttc) + ' s'})`,
          });
        }
      }
    }

    // 2) Circular-wait (deadlock) risk from the live wait-for relationships.
    //    Reuses the same signal the deterministic resolver acts on, but reports
    //    it a step earlier as a risk score rather than a resolution.
    const waiters = agents.filter((a) => a.status === 'waiting_traffic' || a.status === 'waiting_token');
    let deadlockRisk = 0;
    for (const a of waiters) {
      const next = a.pose.targetNodeId || a.navigation.currentPath[1];
      if (!next) continue;
      const blockers = new Set();
      for (const occ of world.nodeOccupants(next)) if (occ !== a.id) blockers.add(occ);
      // A waiter blocked by another waiter is the seed of a circular wait.
      for (const bId of blockers) {
        const b = world.getAgent(bId);
        if (b && (b.status === 'waiting_traffic' || b.status === 'waiting_token')) {
          deadlockRisk++;
          advisories.push({
            kind: 'deadlock_risk', a: a.id, b: bId,
            ttcS: 0, sepM: round1(dist(a.pose, b.pose)),
            action: 'reroute',
            note: `${a.id} waiting on ${bId} which is itself waiting — circular-wait risk`,
          });
          break;
        }
      }
    }

    const interventions = advisories.filter((x) => x.action === 'stop' || x.action === 'reroute').length;
    this.interventionsTotal += interventions;
    this.lastReport = { advisories, interventions, deadlockRisk };
    return this.lastReport;
  }

  reset() {
    this.interventionsTotal = 0;
    this.lastReport = { advisories: [], interventions: 0, deadlockRisk: 0 };
  }
}

// ---------------------------------------------------------------------------
//  Default advisory policy (replace via registerPolicy for your algorithm).
//  Simple, explainable, deterministic:
//    - inside the safety ring, or TTC below ~1s  -> 'stop'
//    - closing within the caution ring / horizon -> 'slow'
//    - otherwise                                 -> 'clear'
// ---------------------------------------------------------------------------
function defaultPolicy(ctx) {
  if (ctx.sepM <= ctx.safetyRadiusM) return 'stop';
  if (ctx.ttcS !== Infinity && ctx.ttcS <= 1.0) return 'stop';
  if (ctx.ttcS !== Infinity && ctx.ttcS <= ctx.horizonS) return 'slow';
  return 'clear';
}

// ---------------------------------------------------------------------------
//  Geometry helpers
// ---------------------------------------------------------------------------
function dist(p, q) {
  return Math.hypot(p.x - q.x, p.y - q.y);
}

/** Unit velocity vector from heading + speed. */
function velVec(a) {
  const h = (a.pose.headingDeg || 0) / R2D;
  const v = a.pose.velocity || 0;
  return { x: Math.cos(h) * v, y: Math.sin(h) * v };
}

/**
 * Time (s) until two constant-velocity robots reach the safety radius, or
 * Infinity if they never do within a sane window. Standard relative-motion
 * closest-approach solution.
 */
function timeToClosestApproach(a, b, safetyR) {
  const rp = { x: b.pose.x - a.pose.x, y: b.pose.y - a.pose.y };
  const va = velVec(a);
  const vb = velVec(b);
  const rv = { x: vb.x - va.x, y: vb.y - va.y };
  const rv2 = rv.x * rv.x + rv.y * rv.y;
  if (rv2 < 1e-6) return Infinity; // no relative motion
  // t that minimises |rp + rv t|
  const tMin = -(rp.x * rv.x + rp.y * rv.y) / rv2;
  if (tMin <= 0) return Infinity; // separating, not closing
  // separation at tMin
  const cx = rp.x + rv.x * tMin;
  const cy = rp.y + rv.y * tMin;
  const minSep = Math.hypot(cx, cy);
  if (minSep > safetyR) return Infinity; // closest approach still safe
  return tMin;
}

function round1(x) {
  return x === Infinity ? Infinity : Math.round(x * 10) / 10;
}
