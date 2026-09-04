// =============================================================================
//  scripts/smoke.mjs — Headless engine smoke + invariant test (no browser)
//
//  Runs the coordination engine head-less and asserts the load-bearing
//  invariants so CI catches regressions:
//    1. The sim advances and completes tasks.
//    2. Zero reservation violations (collision counter stays 0).
//    3. The Map Customizer / branch switch (_syncGraphState) never throws.
//    4. The baseline-vs-edge-AI benchmark runs and reports zero collisions.
//    5. The predictive collision-avoidance advisory layer evaluates cleanly.
//
//  Usage:  node scripts/smoke.mjs
// =============================================================================

import { Simulation } from '../src/engine/simulation.js';
import { MapCustomizer } from '../src/engine/mapCustomizer.js';
import { runBenchmark } from '../src/engine/benchmark.js';
import { CollisionAvoidance } from '../src/engine/collisionAvoidance.js';
import { FACTORY_BRANCHES } from '../src/data.js';

let failures = 0;
const ok = (cond, msg) => {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.error(`  ✗ ${msg}`);
    failures++;
  }
};

console.log('MOSAIC engine smoke test\n');

// --- 1. Core simulation advances collision-free --------------------------------
console.log('[1] Core simulation');
const sim = new Simulation();
for (let i = 0; i < 6000; i++) sim.step(0.1); // 10 min of sim time
ok(sim.time > 0, 'clock advanced');
ok(sim.metrics.completedTasks > 0, `tasks completed (${sim.metrics.completedTasks})`);
ok(sim.metrics.collisions === 0, `zero reservation violations (${sim.metrics.collisions})`);
ok(sim.kpis().fleetSize === sim.agents.length, 'kpis expose fleet aggregates');
ok(typeof sim.kpis().meshConnectivityPct === 'number', 'mesh connectivity computed');

// --- 2. Map Customizer + _syncGraphState never throws --------------------------
console.log('\n[2] Map Customizer & branch switch (_syncGraphState)');
const cust = new MapCustomizer(sim);
try {
  cust.addNode({ id: 'TEST-N1', type: 'junction', x: 20, y: 44, label: 'Test' });
  cust.addEdge('TEST-N1', 'N10', 1.6);
  cust.generateAisleArray({ prefix: 'AISLE-Z', rowY: 44, count: 4, spacingX: 20 });
  cust.removeEdge('TEST-N1', 'N10');
  cust.removeNode('TEST-N1');
  ok(true, 'add/remove node + edge + aisle array succeeded');
} catch (e) {
  ok(false, `customizer threw: ${e.message}`);
}
try {
  for (const key of Object.keys(FACTORY_BRANCHES)) sim.switchFactoryBranch(key);
  for (let i = 0; i < 300; i++) sim.step(0.1); // run on the switched topology
  ok(sim.metrics.collisions === 0, 'no violations after branch switches');
} catch (e) {
  ok(false, `branch switch threw: ${e.message}`);
}

// --- 3. Benchmark runs and meets the safety criterion --------------------------
console.log('\n[3] Baseline vs Edge-AI benchmark');
try {
  const r = runBenchmark();
  ok(r.baseline.completed > 0 && r.edgeAI.completed > 0, 'both regimes completed the batch');
  ok(r.comparison.meetsZeroCollision, 'zero collisions in both regimes');
  ok(typeof r.comparison.timeReductionPct === 'number', `time delta computed (${r.comparison.timeReductionPct}%)`);
} catch (e) {
  ok(false, `benchmark threw: ${e.message}`);
}

// --- 4. Collision-avoidance advisory layer evaluates ---------------------------
console.log('\n[4] Predictive collision-avoidance stub');
try {
  const sim2 = new Simulation();
  for (let i = 0; i < 1200; i++) sim2.step(0.1);
  const ca = new CollisionAvoidance();
  const report = ca.evaluate(sim2);
  ok(Array.isArray(report.advisories), 'advisory report is an array');
  ok(typeof report.deadlockRisk === 'number', 'deadlock-risk score computed');
  // custom policy hook
  ca.registerPolicy(() => 'clear');
  const clear = ca.evaluate(sim2);
  ok(clear.interventions === 0, 'custom policy hook overrides advisories');
} catch (e) {
  ok(false, `avoidance threw: ${e.message}`);
}

console.log('');
if (failures) {
  console.error(`SMOKE TEST FAILED: ${failures} assertion(s) failed.`);
  process.exit(1);
} else {
  console.log('SMOKE TEST PASSED: all invariants hold.');
}
