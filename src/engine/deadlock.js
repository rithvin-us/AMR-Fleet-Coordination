// =============================================================================
//  engine/deadlock.js — Circular-wait detection & resolution
//
//  Builds a wait-for graph over the coordination resources (reserved nodes and
//  held tokens) and looks for cycles. This uniformly captures:
//    - Head-on stand-offs  (A wants B's node, B wants A's node) — a 2-cycle.
//    - N-way reservation gridlock                              — a k-cycle.
//    - Token cycles at protected intersections.
//
//  Because a *waiting* AMR has no committed target (its intent lives in its
//  planned path), edges are drawn from `intendedNext` to whoever reserves that
//  node / holds that token.
//
//  Resolution is deterministic and liveness-preserving: within a cycle the
//  highest-id member that CAN yield (A* detour, else retreat to a free
//  adjacent node) does so. A member trapped on a leaf cannot yield, so the
//  choice naturally falls to a peer that can — freeing the constrained robot.
// =============================================================================

export function detectDeadlocks(world) {
  const agents = world.agents;
  const waitFor = new Map(); // amrId -> Set(amrId it is blocked behind)

  for (const a of agents) {
    if (a.status !== 'waiting_traffic' && a.status !== 'waiting_token') continue;
    const next = a.pose.targetNodeId || a.navigation.currentPath[1];
    if (!next) continue;

    const blockers = new Set();
    // Whoever physically reserves the node we want.
    for (const occ of world.nodeOccupants(next)) if (occ !== a.id) blockers.add(occ);
    // Whoever occupies the single-lane corridor we need.
    const ek = world.graph.constructor.edgeKey(a.pose.currentNodeId, next);
    for (const occ of world.edgeOccupants(ek)) if (occ !== a.id) blockers.add(occ);
    // Whoever holds the token for a protected node we want.
    const zone = world.tokens.zoneForNode(next);
    if (zone && zone.nodeIds) {
      const z = world.tokens.zones.get(zone.id);
      if (z && z.holder && z.holder !== a.id) blockers.add(z.holder);
    }
    if (blockers.size) waitFor.set(a.id, blockers);
  }

  const cycles = findCycles(waitFor);
  return { cycles, waitFor };
}

export function resolveDeadlocks(hazards, world) {
  const byId = new Map(world.agents.map((a) => [a.id, a]));
  let resolved = 0;

  for (const cycle of hazards.cycles) {
    const members = [...new Set(cycle)].sort().reverse(); // highest id first
    let broke = false;
    for (const id of members) {
      const amr = byId.get(id);
      if (amr && amr.yieldFor(world, amr.currentEdgeKey())) {
        resolved++;
        broke = true;
        break; // one yield breaks this cycle
      }
    }
    if (broke) continue;

    // Trapped cycle (both members boxed in — e.g. one on a leaf, the other
    // ringed by occupied nodes). Cascade: yield a *peripheral* waiter that is
    // feeding the jam and still has somewhere free to step. That frees a node,
    // and the cycle member can retreat on the next pass.
    const waiters = world.agents
      .filter((a) => (a.status === 'waiting_traffic' || a.status === 'waiting_token') && a.pose.targetNodeId == null)
      .sort((a, b) => (a.id < b.id ? 1 : -1));
    for (const a of waiters) {
      if (members.includes(a.id)) continue;
      if (a.yieldFor(world, a.currentEdgeKey())) {
        resolved++;
        break;
      }
    }
  }
  return resolved;
}

/** DFS colour-based cycle finder for a small directed graph. */
function findCycles(waitFor) {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map();
  const stack = [];
  const cycles = [];
  const nodes = new Set(waitFor.keys());
  for (const set of waitFor.values()) for (const v of set) nodes.add(v);
  for (const n of nodes) color.set(n, WHITE);

  const dfs = (u) => {
    color.set(u, GRAY);
    stack.push(u);
    for (const v of waitFor.get(u) || []) {
      if (color.get(v) === GRAY) {
        const idx = stack.indexOf(v);
        if (idx !== -1) cycles.push(stack.slice(idx));
      } else if (color.get(v) === WHITE) {
        dfs(v);
      }
    }
    stack.pop();
    color.set(u, BLACK);
  };

  for (const n of nodes) if (color.get(n) === WHITE) dfs(n);
  return cycles;
}
