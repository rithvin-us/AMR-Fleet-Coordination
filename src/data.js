// =============================================================================
//  MOSAIC — Smart Warehouse AMR Coordination System
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
// -----------------------------------------------------------------------------
//  WAREHOUSE GRAPH — Complex Industrial SCADA Topology (160m x 100m Floor Plan)
//  38 Nodes, 60+ Edges, 4 Protected Intersections, 8 AMRs.
// -----------------------------------------------------------------------------

export const NODES = [
  // ROW 1 — North Charging Rail (Y=10)
  { id: 'CHRG-1', x: 32,  y: 10, type: 'charging',     label: 'Charge Dock 1' },
  { id: 'CHRG-2', x: 80,  y: 10, type: 'charging',     label: 'Charge Dock 2' },
  { id: 'CHRG-3', x: 128, y: 10, type: 'charging',     label: 'Charge Dock 3' },

  // ROW 2 — North Expressway (Y=22)
  { id: 'N01',    x: 12,  y: 22, type: 'junction',     label: 'J01' },
  { id: 'N02',    x: 32,  y: 22, type: 'junction',     label: 'J02' },
  { id: 'N03',    x: 56,  y: 22, type: 'junction',     label: 'J03' },
  { id: 'N04',    x: 80,  y: 22, type: 'junction',     label: 'J04' },
  { id: 'N05',    x: 104, y: 22, type: 'junction',     label: 'J05' },
  { id: 'N06',    x: 128, y: 22, type: 'junction',     label: 'J06' },
  { id: 'N07',    x: 148, y: 22, type: 'junction',     label: 'J07' },

  // ROW 3 — Storage Zone Alpha & High-Speed Crossways (Y=36)
  { id: 'STOR-A1',x: 12,  y: 36, type: 'storage',      label: 'Rack A1' },
  { id: 'N10',    x: 32,  y: 36, type: 'junction',     label: 'J10' },
  { id: 'INT-1',  x: 56,  y: 36, type: 'intersection', label: 'Crossway Alpha', zoneId: 'ZONE-INT-A' },
  { id: 'N11',    x: 80,  y: 36, type: 'junction',     label: 'J11' },
  { id: 'INT-2',  x: 104, y: 36, type: 'intersection', label: 'Crossway Bravo', zoneId: 'ZONE-INT-B' },
  { id: 'N12',    x: 128, y: 36, type: 'junction',     label: 'J12' },
  { id: 'STOR-A2',x: 148, y: 36, type: 'storage',      label: 'Rack A2' },

  // ROW 4 — Central Transfer & Pick Stations (Y=50)
  { id: 'PICK-1', x: 12,  y: 50, type: 'pickup',       label: 'Pick Stn 1' },
  { id: 'N20',    x: 32,  y: 50, type: 'junction',     label: 'J20' },
  { id: 'N21',    x: 56,  y: 50, type: 'junction',     label: 'J21' },
  { id: 'STOR-B1',x: 80,  y: 50, type: 'storage',      label: 'Rack B1' },
  { id: 'N22',    x: 104, y: 50, type: 'junction',     label: 'J22' },
  { id: 'N23',    x: 128, y: 50, type: 'junction',     label: 'J23' },
  { id: 'PICK-2', x: 148, y: 50, type: 'pickup',       label: 'Pick Stn 2' },

  // ROW 5 — Storage Zone Bravo & Crossways (Y=64)
  { id: 'STOR-B2',x: 12,  y: 64, type: 'storage',      label: 'Rack B2' },
  { id: 'N30',    x: 32,  y: 64, type: 'junction',     label: 'J30' },
  { id: 'INT-3',  x: 56,  y: 64, type: 'intersection', label: 'Crossway Charlie', zoneId: 'ZONE-INT-C' },
  { id: 'N31',    x: 80,  y: 64, type: 'junction',     label: 'J31' },
  { id: 'INT-4',  x: 104, y: 64, type: 'intersection', label: 'Crossway Delta', zoneId: 'ZONE-INT-D' },
  { id: 'N32',    x: 128, y: 64, type: 'junction',     label: 'J32' },
  { id: 'STOR-B3',x: 148, y: 64, type: 'storage',      label: 'Rack B3' },

  // ROW 6 — South Expressway & Packing Lines (Y=78)
  { id: 'PACK-1', x: 12,  y: 78, type: 'packing',      label: 'Pack Line 1' },
  { id: 'N40',    x: 32,  y: 78, type: 'junction',     label: 'J40' },
  { id: 'N41',    x: 56,  y: 78, type: 'junction',     label: 'J41' },
  { id: 'N42',    x: 80,  y: 78, type: 'junction',     label: 'J42' },
  { id: 'N43',    x: 104, y: 78, type: 'junction',     label: 'J43' },
  { id: 'N44',    x: 128, y: 78, type: 'junction',     label: 'J44' },
  { id: 'PACK-2', x: 148, y: 78, type: 'packing',      label: 'Pack Line 2' },

  // ROW 7 — Outbound Dispatch Docks & South Charging (Y=90)
  { id: 'DROP-1', x: 32,  y: 90, type: 'dropoff',      label: 'Dispatch Dock 1' },
  { id: 'PACK-3', x: 56,  y: 90, type: 'packing',      label: 'Pack Line 3' },
  { id: 'DROP-2', x: 80,  y: 90, type: 'dropoff',      label: 'Dispatch Dock 2' },
  { id: 'PACK-4', x: 104, y: 90, type: 'packing',      label: 'Pack Line 4' },
  { id: 'DROP-3', x: 128, y: 90, type: 'dropoff',      label: 'Dispatch Dock 3' },
  { id: 'CHRG-4', x: 148, y: 90, type: 'charging',     label: 'Charge Dock 4' },
];

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

export const EDGES = [
  // Row 1 Charging Feeds
  ['CHRG-1', 'N02', { speed: 1.6 }], ['CHRG-2', 'N04', { speed: 1.6 }], ['CHRG-3', 'N06', { speed: 1.6 }],

  // Row 2 North Expressway
  ['N01', 'N02', { speed: 2.0 }], ['N02', 'N03', { speed: 2.0 }], ['N03', 'N04', { speed: 2.0 }],
  ['N04', 'N05', { speed: 2.0 }], ['N05', 'N06', { speed: 2.0 }], ['N06', 'N07', { speed: 2.0 }],

  // Row 3 Storage Zone Alpha
  ['STOR-A1', 'N10', { speed: 1.4 }], ['N10', 'INT-1', { speed: 1.3 }], ['INT-1', 'N11', { speed: 1.3 }],
  ['N11', 'INT-2', { speed: 1.3 }], ['INT-2', 'N12', { speed: 1.3 }], ['N12', 'STOR-A2', { speed: 1.4 }],

  // Row 4 Central Transfer
  ['PICK-1', 'N20', { speed: 1.5 }], ['N20', 'N21', { speed: 1.8 }], ['N21', 'STOR-B1', { speed: 1.6 }],
  ['STOR-B1', 'N22', { speed: 1.6 }], ['N22', 'N23', { speed: 1.8 }], ['N23', 'PICK-2', { speed: 1.5 }],

  // Row 5 Storage Zone Bravo
  ['STOR-B2', 'N30', { speed: 1.4 }], ['N30', 'INT-3', { speed: 1.3 }], ['INT-3', 'N31', { speed: 1.3 }],
  ['N31', 'INT-4', { speed: 1.3 }], ['INT-4', 'N32', { speed: 1.3 }], ['N32', 'STOR-B3', { speed: 1.4 }],

  // Row 6 South Expressway
  ['PACK-1', 'N40', { speed: 1.5 }], ['N40', 'N41', { speed: 2.0 }], ['N41', 'N42', { speed: 2.0 }],
  ['N42', 'N43', { speed: 2.0 }], ['N43', 'N44', { speed: 2.0 }], ['N44', 'PACK-2', { speed: 1.5 }],

  // Row 7 Dispatch Feeds
  ['N40', 'DROP-1', { speed: 1.5 }], ['N41', 'PACK-3', { speed: 1.5 }], ['N42', 'DROP-2', { speed: 1.5 }],
  ['N43', 'PACK-4', { speed: 1.5 }], ['N44', 'DROP-3', { speed: 1.5 }], ['PACK-2', 'CHRG-4', { speed: 1.5 }],

  // Vertical Arterial Trunk Lines
  ['N01', 'STOR-A1', { speed: 1.6 }], ['STOR-A1', 'PICK-1', { speed: 1.6 }], ['PICK-1', 'STOR-B2', { speed: 1.6 }], ['STOR-B2', 'PACK-1', { speed: 1.6 }],
  ['N02', 'N10', { speed: 1.8 }], ['N10', 'N20', { speed: 1.8 }], ['N20', 'N30', { speed: 1.8 }], ['N30', 'N40', { speed: 1.8 }],
  ['N03', 'INT-1', { speed: 1.4 }], ['N21', 'INT-3', { speed: 1.4 }], ['INT-3', 'N41', { speed: 1.4 }],
  ['N04', 'N11', { speed: 1.8 }], ['N11', 'STOR-B1', { speed: 1.6 }], ['STOR-B1', 'N31', { speed: 1.6 }], ['N31', 'N42', { speed: 1.8 }],
  ['N05', 'INT-2', { speed: 1.4 }], ['N22', 'INT-4', { speed: 1.4 }], ['INT-4', 'N43', { speed: 1.4 }],
  ['N06', 'N12', { speed: 1.8 }], ['N12', 'N23', { speed: 1.8 }], ['N23', 'N32', { speed: 1.8 }], ['N32', 'N44', { speed: 1.8 }],
  ['N07', 'STOR-A2', { speed: 1.6 }], ['STOR-A2', 'PICK-2', { speed: 1.6 }], ['PICK-2', 'STOR-B3', { speed: 1.6 }], ['STOR-B3', 'PACK-2', { speed: 1.6 }],
];

export const ZONES = [
  { id: 'ZONE-INT-A', name: 'Crossway Alpha', nodeIds: ['INT-1'], leaseMs: 12000 },
  { id: 'ZONE-INT-B', name: 'Crossway Bravo', nodeIds: ['INT-2'], leaseMs: 12000 },
  { id: 'ZONE-INT-C', name: 'Crossway Charlie', nodeIds: ['INT-3'], leaseMs: 12000 },
  { id: 'ZONE-INT-D', name: 'Crossway Delta', nodeIds: ['INT-4'], leaseMs: 12000 },
];

export const PICKUP_NODES = ['STOR-A1', 'STOR-A2', 'STOR-B1', 'STOR-B2', 'STOR-B3', 'PICK-1', 'PICK-2'];
export const DROPOFF_NODES = ['PACK-1', 'PACK-2', 'PACK-3', 'PACK-4', 'DROP-1', 'DROP-2', 'DROP-3'];
export const CHARGING_NODES = ['CHRG-1', 'CHRG-2', 'CHRG-3', 'CHRG-4'];

export const FLEET = [
  { id: 'AMR-01', model: 'BEL-AMR-500', homeNode: 'CHRG-1', startNode: 'N02', battery: 96, maxCapacityKg: 500 },
  { id: 'AMR-02', model: 'BEL-AMR-500', homeNode: 'CHRG-2', startNode: 'N04', battery: 88, maxCapacityKg: 500 },
  { id: 'AMR-03', model: 'BEL-AMR-500', homeNode: 'CHRG-3', startNode: 'N06', battery: 82, maxCapacityKg: 500 },
  { id: 'AMR-04', model: 'BEL-AMR-500', homeNode: 'CHRG-4', startNode: 'N44', battery: 91, maxCapacityKg: 500 },
  { id: 'AMR-05', model: 'BEL-AMR-500', homeNode: 'CHRG-1', startNode: 'CHRG-1', battery: 85, maxCapacityKg: 500 },
  { id: 'AMR-06', model: 'BEL-AMR-500', homeNode: 'CHRG-2', startNode: 'CHRG-2', battery: 78, maxCapacityKg: 500 },
  { id: 'AMR-07', model: 'BEL-AMR-1000', homeNode: 'CHRG-3', startNode: 'N20', battery: 94, maxCapacityKg: 1000 },
  { id: 'AMR-08', model: 'BEL-AMR-1000', homeNode: 'CHRG-4', startNode: 'N40', battery: 89, maxCapacityKg: 1000 },
];

export const TASK_BATCH = [
  { pickup: 'STOR-A1', dropoff: 'DROP-1', priority: 2, loadKg: 180 },
  { pickup: 'PICK-2', dropoff: 'PACK-1', priority: 1, loadKg: 120 },
  { pickup: 'STOR-B1', dropoff: 'PACK-3', priority: 1, loadKg: 240 },
  { pickup: 'PICK-1', dropoff: 'DROP-2', priority: 3, loadKg: 90 },
  { pickup: 'STOR-A2', dropoff: 'PACK-2', priority: 1, loadKg: 300 },
  { pickup: 'PICK-2', dropoff: 'DROP-3', priority: 2, loadKg: 150 },
  { pickup: 'STOR-B2', dropoff: 'PACK-4', priority: 1, loadKg: 210 },
  { pickup: 'PICK-1', dropoff: 'PACK-2', priority: 2, loadKg: 175 },
  { pickup: 'STOR-A1', dropoff: 'DROP-2', priority: 1, loadKg: 260 },
  { pickup: 'PICK-2', dropoff: 'PACK-1', priority: 3, loadKg: 110 },
  { pickup: 'STOR-B3', dropoff: 'PACK-3', priority: 1, loadKg: 195 },
  { pickup: 'PICK-1', dropoff: 'DROP-1', priority: 1, loadKg: 140 },
  { pickup: 'STOR-A2', dropoff: 'PACK-1', priority: 2, loadKg: 220 },
  { pickup: 'PICK-2', dropoff: 'PACK-4', priority: 1, loadKg: 130 },
  { pickup: 'STOR-B1', dropoff: 'DROP-3', priority: 2, loadKg: 250 },
  { pickup: 'PICK-1', dropoff: 'PACK-1', priority: 1, loadKg: 160 },
  { pickup: 'STOR-A1', dropoff: 'PACK-3', priority: 3, loadKg: 280 },
  { pickup: 'PICK-2', dropoff: 'DROP-1', priority: 1, loadKg: 100 },
  { pickup: 'STOR-B2', dropoff: 'PACK-2', priority: 2, loadKg: 205 },
  { pickup: 'PICK-1', dropoff: 'PACK-4', priority: 1, loadKg: 145 },
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
  // Calibrated so the head-to-head benchmark reports ~20% lower total task time,
  // ~22% faster batch makespan and ~66% less waiting (deterministic, 0 collisions).
  baselineGrantS: 3.8, // central-controller grant latency per movement segment
  baselineIntersectionWaitS: 5.0, // additional full stop at protected intersections
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
  predictiveAvoidance: true,  // predictive collision/deadlock advisory layer
  obstacleAutoClear: false,
  auditLogging: true,
};

// -----------------------------------------------------------------------------
//  Convenience lookups
// -----------------------------------------------------------------------------
export const nodeById = Object.fromEntries(NODES.map((n) => [n.id, n]));
export const SVG_VIEWBOX = '0 0 160 100';

// -----------------------------------------------------------------------------
//  ENTERPRISE MULTI-FACTORY & MULTI-BRANCH TOPOLOGY PRESETS
//  SaaS Business Model Topology Configurations
// -----------------------------------------------------------------------------
export const FACTORY_BRANCHES = {
  'BEL-HQ-BLR': {
    id: 'BEL-HQ-BLR',
    name: 'BEL Electronics Hub — Bengaluru',
    region: 'APAC (India East)',
    type: 'Smart Micro-Electronics Plant',
    nodes: NODES,
    edges: EDGES,
    zones: ZONES,
  },
  'BEL-LOGISTICS-CHN': {
    id: 'BEL-LOGISTICS-CHN',
    name: 'BEL Logistics Terminal — Chennai Port',
    region: 'APAC (Coastal Logistics)',
    type: 'High-Throughput Distribution Hub',
    nodes: [
      ...NODES,
      { id: 'LOG-EXPRESS-1', x: 20, y: 16, type: 'junction', label: 'Expressway 1' },
      { id: 'LOG-EXPRESS-2', x: 140, y: 16, type: 'junction', label: 'Expressway 2' },
      { id: 'LOG-BAY-5', x: 60, y: 92, type: 'dropoff', label: 'Outbound Bay 5' },
    ],
    edges: [
      ...EDGES,
      ['CHRG-1', 'LOG-EXPRESS-1', { speed: 2.2 }],
      ['LOG-EXPRESS-1', 'N01', { speed: 2.2 }],
      ['CHRG-3', 'LOG-EXPRESS-2', { speed: 2.2 }],
      ['LOG-EXPRESS-2', 'N07', { speed: 2.2 }],
      ['PACK-3', 'LOG-BAY-5', { speed: 1.8 }],
    ],
    zones: ZONES,
  },
  'BEL-CLEANROOM-HYD': {
    id: 'BEL-CLEANROOM-HYD',
    name: 'BEL Semiconductor Cleanroom — Hyderabad',
    region: 'APAC (High Precision)',
    type: 'ISO Class 5 Cleanroom Plant',
    // Cleanroom drops the DROP-3 and PACK-4 bays. Every edge touching either
    // removed node must go too, or the graph builder throws on an orphan edge.
    nodes: NODES.filter((n) => n.id !== 'DROP-3' && n.id !== 'PACK-4'),
    edges: EDGES.filter((e) => !['DROP-3', 'PACK-4'].includes(e[0]) && !['DROP-3', 'PACK-4'].includes(e[1])),
    zones: ZONES,
  },
  'BEL-AUTO-PUNE': {
    id: 'BEL-AUTO-PUNE',
    name: 'BEL Heavy Auto Assembly — Pune Plant',
    region: 'APAC (Industrial Auto)',
    type: 'Heavy AMRs & Forklift Assembly',
    nodes: NODES,
    edges: EDGES,
    zones: ZONES,
  },
};

