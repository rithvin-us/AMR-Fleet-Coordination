// =============================================================================
//  engine/graph.js — Warehouse topological graph
//
//  Undirected adjacency graph with per-edge dynamic impedance. Each AMR holds
//  its own replica (built from the same seed) so path planning is fully local.
//  Dynamic state that changes at runtime: `blocked` (obstacle) and
//  `congestion` (traffic multiplier). The A* planner reads `edgeCost()`.
// =============================================================================

import { CAP_BY_TYPE } from '../data.js';

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export class WarehouseGraph {
  constructor(nodes, edges, zones = []) {
    /** @type {Map<string, object>} */
    this.nodes = new Map();
    /** @type {Map<string, object>} edgeKey -> edge */
    this.edges = new Map();
    /** @type {Map<string, Array<{to:string, edgeKey:string}>>} */
    this.adj = new Map();
    this.zones = zones;
    // When false (baseline regime) the A* cost ignores live congestion, i.e.
    // "static routes without dynamic congestion bypass".
    this.routingUsesCongestion = true;

    for (const n of nodes) {
      const capacity = n.capacity ?? CAP_BY_TYPE[n.type] ?? 1;
      this.nodes.set(n.id, { ...n, capacity });
      this.adj.set(n.id, []);
    }

    for (const [a, b, opts = {}] of edges) {
      const na = this.nodes.get(a);
      const nb = this.nodes.get(b);
      if (!na || !nb) throw new Error(`Edge references unknown node: ${a}-${b}`);
      const key = WarehouseGraph.edgeKey(a, b);
      const edge = {
        key,
        a,
        b,
        distance: dist(na, nb),
        speed: opts.speed ?? 1.5,
        blocked: false,
        congestion: 1.0, // 1.0 = clear, grows with traffic
        activeAMRs: new Set(),
      };
      this.edges.set(key, edge);
      // undirected: both directions traversable
      this.adj.get(a).push({ to: b, edgeKey: key });
      this.adj.get(b).push({ to: a, edgeKey: key });
    }
  }

  /** Canonical (order-independent) key so a<->b share one edge record. */
  static edgeKey(a, b) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  getNode(id) {
    return this.nodes.get(id);
  }

  getEdge(a, b) {
    return this.edges.get(WarehouseGraph.edgeKey(a, b));
  }

  neighbors(id) {
    return this.adj.get(id) || [];
  }

  /** Dynamic cost used by A*. Infinity when the edge is blocked. */
  edgeCost(edge) {
    if (!edge || edge.blocked) return Infinity;
    return edge.distance * (this.routingUsesCongestion ? edge.congestion : 1);
  }

  /** Straight-line admissible heuristic between two node ids. */
  heuristic(fromId, toId) {
    return dist(this.nodes.get(fromId), this.nodes.get(toId));
  }

  setBlocked(a, b, blocked) {
    const e = this.getEdge(a, b);
    if (e) e.blocked = blocked;
    return e;
  }

  /** Disable a node for path planning (e.g. a failed AMR is parked on it). */
  setDisabled(id, disabled) {
    const n = this.nodes.get(id);
    if (n) n.disabled = disabled;
    return n;
  }

  toggleBlocked(a, b) {
    const e = this.getEdge(a, b);
    if (e) e.blocked = !e.blocked;
    return e;
  }

  /**
   * Recompute congestion multipliers from live edge occupancy. Called each
   * tick by the simulation. More AMRs on an edge => higher traversal cost,
   * which steers local A* replans away from crowded corridors.
   */
  updateCongestion() {
    for (const e of this.edges.values()) {
      const n = e.activeAMRs.size;
      e.congestion = 1 + n * 0.9; // 0 -> 1.0, 1 -> 1.9, 2 -> 2.8 ...
    }
  }

  /** Nearest node of a given type by graph-agnostic Euclidean distance. */
  nearestOfType(fromId, type) {
    const from = this.nodes.get(fromId);
    let best = null;
    let bestD = Infinity;
    for (const n of this.nodes.values()) {
      if (n.type !== type) continue;
      const d = dist(from, n);
      if (d < bestD) {
        bestD = d;
        best = n.id;
      }
    }
    return best;
  }

  /** Longest straight-line span in the graph — used to normalise distances. */
  diameter() {
    if (this._diameter) return this._diameter;
    let max = 1;
    const arr = [...this.nodes.values()];
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        max = Math.max(max, dist(arr[i], arr[j]));
      }
    }
    this._diameter = max;
    return max;
  }
}
