// =============================================================================
//  engine/astar.js — Local A* path planner
//
//  Runs *on the AMR* (edge intelligence). Searches the warehouse graph using
//  the graph's dynamic edge cost (distance x congestion, Infinity if blocked)
//  and a straight-line admissible heuristic. Supports a per-call `avoidEdges`
//  set so the deadlock resolver can force a detour.
//
//  Returns an array of node ids [start, ..., goal], or null if unreachable.
// =============================================================================

/** Minimal binary min-heap keyed by fScore. Small graphs, but kept honest. */
class MinHeap {
  constructor() {
    this.items = [];
  }
  get size() {
    return this.items.length;
  }
  push(node, priority) {
    this.items.push({ node, priority });
    this._up(this.items.length - 1);
  }
  pop() {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length) {
      this.items[0] = last;
      this._down(0);
    }
    return top && top.node;
  }
  _up(i) {
    const it = this.items;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (it[p].priority <= it[i].priority) break;
      [it[p], it[i]] = [it[i], it[p]];
      i = p;
    }
  }
  _down(i) {
    const it = this.items;
    const n = it.length;
    for (;;) {
      let s = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && it[l].priority < it[s].priority) s = l;
      if (r < n && it[r].priority < it[s].priority) s = r;
      if (s === i) break;
      [it[s], it[i]] = [it[i], it[s]];
      i = s;
    }
  }
}

/**
 * @param {WarehouseGraph} graph
 * @param {string} startId
 * @param {string} goalId
 * @param {{ avoidEdges?: Set<string> }} [opts]
 * @returns {{ path: string[]|null, cost: number, expanded: number }}
 */
export function findPath(graph, startId, goalId, opts = {}) {
  const avoid = opts.avoidEdges || null;
  if (startId === goalId) return { path: [startId], cost: 0, expanded: 0 };
  if (!graph.getNode(startId) || !graph.getNode(goalId)) {
    return { path: null, cost: Infinity, expanded: 0 };
  }

  const open = new MinHeap();
  const gScore = new Map([[startId, 0]]);
  const cameFrom = new Map();
  const closed = new Set();
  let expanded = 0;

  open.push(startId, graph.heuristic(startId, goalId));

  while (open.size) {
    const current = open.pop();
    if (current === goalId) {
      return { path: reconstruct(cameFrom, current), cost: gScore.get(current), expanded };
    }
    if (closed.has(current)) continue;
    closed.add(current);
    expanded++;

    for (const { to, edgeKey } of graph.neighbors(current)) {
      if (closed.has(to)) continue;
      if (avoid && avoid.has(edgeKey)) continue;
      // Skip nodes taken out of service (e.g. a failed AMR parked there),
      // unless it is the goal itself.
      const toNode = graph.getNode(to);
      if (toNode && toNode.disabled && to !== goalId) continue;
      const edge = graph.edges.get(edgeKey);
      const stepCost = graph.edgeCost(edge);
      if (!Number.isFinite(stepCost)) continue; // blocked edge
      const tentative = gScore.get(current) + stepCost;
      if (tentative < (gScore.get(to) ?? Infinity)) {
        cameFrom.set(to, current);
        gScore.set(to, tentative);
        open.push(to, tentative + graph.heuristic(to, goalId));
      }
    }
  }
  return { path: null, cost: Infinity, expanded };
}

function reconstruct(cameFrom, current) {
  const path = [current];
  while (cameFrom.has(current)) {
    current = cameFrom.get(current);
    path.unshift(current);
  }
  return path;
}
