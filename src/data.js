// =============================================================================
//  EdgeFleet — BEL Smart Warehouse AMR Coordination System
//  data.js — Static domain definitions (warehouse graph, fleet, tasks, config)
//
//  Everything below is *seed* data. Live state is owned by the simulation
//  engine (src/engine/simulation.js), which clones these definitions on reset.
// =============================================================================

// -----------------------------------------------------------------------------
//  WAREHOUSE GRAPH
//  A directed/undirected graph of the shop floor. Coordinates are in metres and
//  map 1:1 onto the SVG viewBox used by the dashboard canvas ("0 0 84 68").
//
//  Layout (matches the implementation plan §H.2):
//    [CHRG-1]─(N01)──(N02)──(N03)─[CHRG-2]
//               │      │      │
//    [STOR-A]─(N04)──[INT-1]─(N06)─[STOR-B]
//               │      │      │
//    [PICK-1]─(N07)──[INT-2]─(N09)─[PICK-2]
//               │      │      │
//    [PACK-1]─(N10)──(N11)──(N12)─[DROP-1]
//
//  INT-1 / INT-2 are single-capacity protected intersections guarded by the
//  deterministic FIFO token engine.
// -----------------------------------------------------------------------------

// Column X positions (metres): left periphery, three junction columns, right periphery
const X = { pl: 8, c1: 24, c2: 42, c3: 60, pr: 76 };
// Row Y positions (metres)
const Y = { r1: 10, r2: 26, r3: 42, r4: 58, r5: 72 };

// Node capacity is assigned by type in the graph builder (see CAP_BY_TYPE):
// junctions hold 2 AMRs (so a waiting robot never blocks a passing/exiting one),
// intersections and bays hold exactly 1.
export const NODES = [
  // Row 1 — charging rail
  { id: 'CHRG-1', x: X.pl, y: Y.r1, type: 'charging',     label: 'Charging Dock 1' },
  { id: 'N01',    x: X.c1, y: Y.r1, type: 'junction',     label: 'Junction N01' },
  { id: 'N02',    x: X.c2, y: Y.r1, type: 'junction',     label: 'Junction N02' },
  { id: 'N03',    x: X.c3, y: Y.r1, type: 'junction',     label: 'Junction N03' },
  { id: 'CHRG-2', x: X.pr, y: Y.r1, type: 'charging',     label: 'Charging Dock 2' },

  // Row 2 — storage rail + INT-1
  { id: 'STOR-A', x: X.pl, y: Y.r2, type: 'storage',      label: 'Storage Rack A' },
  { id: 'N04',    x: X.c1, y: Y.r2, type: 'junction',     label: 'Junction N04' },
  { id: 'INT-1',  x: X.c2, y: Y.r2, type: 'intersection', label: 'Crossway Alpha', zoneId: 'ZONE-INT-A' },
  { id: 'N06',    x: X.c3, y: Y.r2, type: 'junction',     label: 'Junction N06' },
  { id: 'STOR-B', x: X.pr, y: Y.r2, type: 'storage',      label: 'Storage Rack B' },

  // Row 3 — pick rail + INT-2
  { id: 'PICK-1', x: X.pl, y: Y.r3, type: 'pickup',       label: 'Pick Station 1' },
  { id: 'N07',    x: X.c1, y: Y.r3, type: 'junction',     label: 'Junction N07' },
  { id: 'INT-2',  x: X.c2, y: Y.r3, type: 'intersection', label: 'Crossway Bravo', zoneId: 'ZONE-INT-B' },
  { id: 'N09',    x: X.c3, y: Y.r3, type: 'junction',     label: 'Junction N09' },
  { id: 'PICK-2', x: X.pr, y: Y.r3, type: 'pickup',       label: 'Pick Station 2' },

  // Row 4 — pack / dispatch rail
  { id: 'PACK-1', x: X.pl, y: Y.r4, type: 'packing',      label: 'Packing Bay 1' },
  { id: 'N10',    x: X.c1, y: Y.r4, type: 'junction',     label: 'Junction N10' },
  { id: 'N11',    x: X.c2, y: Y.r4, type: 'junction',     label: 'Junction N11' },
  { id: 'N12',    x: X.c3, y: Y.r4, type: 'junction',     label: 'Junction N12' },
  { id: 'DROP-1', x: X.pr, y: Y.r4, type: 'dropoff',      label: 'Dispatch Dock 1' },

  // Row 5 — central packing bay (spreads dispatch load onto a third lane)
  { id: 'PACK-2', x: X.c2, y: Y.r5, type: 'packing',      label: 'Packing Bay 2' },
];

// AMRs a node may simultaneously hold. Junctions/charging can queue two; bays
// and protected intersections are strictly single-occupancy.
export const CAP_BY_TYPE = {
  charging: 2,
  junction: 2,
  waiting: 2,
  intersection: 1,
  storage: 1,
  pickup: 1,
  packing: 1,
  dropoff: 1,
};

// Edges are declared once (undirected). The graph builder creates both
// directions. `speed` is the segment speed limit (m/s).
export const EDGES = [
  // Row 1 horizontals
  ['CHRG-1', 'N01', { speed: 1.6 }], ['N01', 'N02', { speed: 1.8 }], ['N02', 'N03', { speed: 1.8 }], ['N03', 'CHRG-2', { speed: 1.6 }],
  // Row 2 horizontals
  ['STOR-A', 'N04', { speed: 1.4 }], ['N04', 'INT-1', { speed: 1.2 }], ['INT-1', 'N06', { speed: 1.2 }], ['N06', 'STOR-B', { speed: 1.4 }],
  // Row 3 horizontals
  ['PICK-1', 'N07', { speed: 1.4 }], ['N07', 'INT-2', { speed: 1.2 }], ['INT-2', 'N09', { speed: 1.2 }], ['N09', 'PICK-2', { speed: 1.4 }],
  // Row 4 horizontals
  ['PACK-1', 'N10', { speed: 1.4 }], ['N10', 'N11', { speed: 1.8 }], ['N11', 'N12', { speed: 1.8 }], ['N12', 'DROP-1', { speed: 1.4 }],
  // Left column verticals
  ['N01', 'N04', { speed: 1.6 }], ['N04', 'N07', { speed: 1.6 }], ['N07', 'N10', { speed: 1.6 }],
  // Middle column verticals (into the protected intersections). The two
  // crossways are deliberately NOT directly linked: an AMR must pass through a
  // normal node between them, releasing one intersection token before it can
  // request the next — this structurally prevents adjacent-mutex hold-and-wait.
  ['N02', 'INT-1', { speed: 1.2 }], ['INT-2', 'N11', { speed: 1.2 }],
  // Right column verticals
  ['N03', 'N06', { speed: 1.6 }], ['N06', 'N09', { speed: 1.6 }], ['N09', 'N12', { speed: 1.6 }],
  // Central packing spur
  ['N11', 'PACK-2', { speed: 1.4 }],
];

// Protected zones enforced by the FIFO token engine. Each intersection is a
// mutex zone of capacity 1.
export const ZONES = [
  { id: 'ZONE-INT-A', name: 'Crossway Alpha', nodeIds: ['INT-1'], leaseMs: 12000 },
  { id: 'ZONE-INT-B', name: 'Crossway Bravo', nodeIds: ['INT-2'], leaseMs: 12000 },
];

// Nodes usable as task pickup / dropoff endpoints.
export const PICKUP_NODES = ['STOR-A', 'STOR-B', 'PICK-1', 'PICK-2'];
export const DROPOFF_NODES = ['PACK-1', 'PACK-2', 'DROP-1'];
export const CHARGING_NODES = ['CHRG-1', 'CHRG-2'];

// -----------------------------------------------------------------------------
//  AMR FLEET (initial roster) — BEL-AMR-500 class, 500 kg payload, 48 V pack.
//  ≥ 3 units per BEL problem statement; four gives lively contention.
// -----------------------------------------------------------------------------
export const FLEET = [
  { id: 'AMR-01', model: 'BEL-AMR-500', homeNode: 'CHRG-1', startNode: 'N01', battery: 96, maxCapacityKg: 500 },
  { id: 'AMR-02', model: 'BEL-AMR-500', homeNode: 'CHRG-2', startNode: 'N03', battery: 88, maxCapacityKg: 500 },
  { id: 'AMR-03', model: 'BEL-AMR-500', homeNode: 'CHRG-1', startNode: 'N10', battery: 82, maxCapacityKg: 500 },
  { id: 'AMR-04', model: 'BEL-AMR-500', homeNode: 'CHRG-2', startNode: 'N12', battery: 91, maxCapacityKg: 500 },
  { id: 'AMR-05', model: 'BEL-AMR-500', homeNode: 'CHRG-1', startNode: 'CHRG-1', battery: 85, maxCapacityKg: 500 },
  { id: 'AMR-06', model: 'BEL-AMR-500', homeNode: 'CHRG-2', startNode: 'CHRG-2', battery: 78, maxCapacityKg: 500 },
];

// -----------------------------------------------------------------------------
//  TASK BATCH — deterministic order-book used for live dispatch and for the
//  benchmark runner (identical batch across both regimes for a fair comparison).
// -----------------------------------------------------------------------------
export const TASK_BATCH = [
  { pickup: 'STOR-A', dropoff: 'DROP-1', priority: 2, loadKg: 180 },
  { pickup: 'PICK-2', dropoff: 'PACK-1', priority: 1, loadKg: 120 },
  { pickup: 'STOR-B', dropoff: 'PACK-2', priority: 1, loadKg: 240 },
  { pickup: 'PICK-1', dropoff: 'DROP-1', priority: 3, loadKg: 90 },
  { pickup: 'STOR-A', dropoff: 'PACK-2', priority: 1, loadKg: 300 },
  { pickup: 'PICK-2', dropoff: 'DROP-1', priority: 2, loadKg: 150 },
  { pickup: 'STOR-B', dropoff: 'PACK-1', priority: 1, loadKg: 210 },
  { pickup: 'PICK-1', dropoff: 'PACK-2', priority: 2, loadKg: 175 },
  { pickup: 'STOR-A', dropoff: 'DROP-1', priority: 1, loadKg: 260 },
  { pickup: 'PICK-2', dropoff: 'PACK-1', priority: 3, loadKg: 110 },
  { pickup: 'STOR-B', dropoff: 'PACK-2', priority: 1, loadKg: 195 },
  { pickup: 'PICK-1', dropoff: 'DROP-1', priority: 1, loadKg: 140 },
  { pickup: 'STOR-A', dropoff: 'PACK-1', priority: 2, loadKg: 220 },
  { pickup: 'PICK-2', dropoff: 'PACK-2', priority: 1, loadKg: 130 },
  { pickup: 'STOR-B', dropoff: 'DROP-1', priority: 2, loadKg: 250 },
  { pickup: 'PICK-1', dropoff: 'PACK-1', priority: 1, loadKg: 160 },
  { pickup: 'STOR-A', dropoff: 'PACK-2', priority: 3, loadKg: 280 },
  { pickup: 'PICK-2', dropoff: 'DROP-1', priority: 1, loadKg: 100 },
  { pickup: 'STOR-B', dropoff: 'PACK-1', priority: 2, loadKg: 205 },
  { pickup: 'PICK-1', dropoff: 'PACK-2', priority: 1, loadKg: 145 },
];

// -----------------------------------------------------------------------------
//  EDGE-AI SCORING WEIGHTS  (Cost = w1·D + w2·C + w3·(1-B) + w4·W + w5·H)
//  Must sum to 1.0. Tunable live from the Settings view.
// -----------------------------------------------------------------------------
export const DEFAULT_WEIGHTS = {
  w1_distance:   0.35, // A* path length to pickup
  w2_congestion: 0.20, // traffic along candidate path
  w3_battery:    0.20, // low SoC penalty
  w4_workload:   0.15, // already carrying?
  w5_health:     0.10, // motor / lidar degradation
};

// -----------------------------------------------------------------------------
//  COORDINATION CONFIG — deterministic safety + P2P + AI parameters.
// -----------------------------------------------------------------------------
export const DEFAULT_CONFIG = {
  // Deterministic safety layer
  tokenLeaseMs: 12000,      // dead-man lease before a held token is force-revoked
  deadmanMs: 5000,          // silent-holder timeout
  lowBatteryPct: 20,        // forces recharge preference / task refusal below this
  criticalBatteryPct: 8,
  // P2P mesh
  p2pRangeM: 120,           // radio range in metres (spans the whole floor)
  p2pLatencyMinMs: 5,
  p2pLatencyMaxMs: 20,
  p2pDropRate: 0.02,        // 2% packet loss
  heartbeatHz: 2,           // beacon broadcasts per second
  peerStaleMs: 2000,        // peer cache expiry
  // Kinematics
  loadSeconds: 2.5,         // dwell at pickup
  unloadSeconds: 2.5,       // dwell at dropoff
  maxSpeed: 1.8,            // m/s ceiling
  accel: 1.2,               // m/s^2
  // Baseline (centralised Stop-and-Wait) regime handicaps — modelling a naive
  // central controller: every move segment needs a request->grant round-trip to
  // the server (processed with latency), and every intersection is a full stop.
  // The distributed regime pays neither (local P2P decisions, token pre-negotiation).
  baselineGrantS: 2.2, // central-controller grant latency per movement segment
  baselineIntersectionWaitS: 3.0, // additional full stop at protected intersections
};

// -----------------------------------------------------------------------------
//  DASHBOARD SETTINGS TOGGLES (UI state only)
// -----------------------------------------------------------------------------
export const defaultSettings = {
  distributedMode: true,      // false => centralised stop-and-wait
  aiTaskAllocation: true,
  dynamicRerouting: true,
  gossipBroadcast: true,
  deadlockResolver: true,
  deadmanRelease: true,
  batteryAwareDispatch: true,
  congestionWeighting: true,
  obstacleAutoClear: false,
  auditLogging: true,
};

// -----------------------------------------------------------------------------
//  Convenience lookups
// -----------------------------------------------------------------------------
export const nodeById = Object.fromEntries(NODES.map((n) => [n.id, n]));
export const SVG_VIEWBOX = '0 0 84 82';
