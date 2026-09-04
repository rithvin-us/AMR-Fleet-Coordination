// =============================================================================
//  engine/benchmark.js — Baseline vs Edge-AI benchmark runner
//
//  Runs the SAME fixed task batch head-to-head, head-less (no timers), under
//  two coordination regimes and reports the BEL SIH success metrics:
//    - Zero inter-robot collisions (C = 0)
//    - >= 20% reduction in total task completion time
//
//  Regime A "Stop-and-Wait": centralised nearest-AMR dispatch, static routing
//  (no congestion bypass), full 3 s halt at every protected intersection, no
//  deadlock resolver.
//  Regime B "Distributed Edge-AI": local A* with congestion weighting, FIFO
//  token negotiation (no blanket stop), multi-factor AI dispatch, deadlock
//  resolver on.
// =============================================================================

import { Simulation } from './simulation.js';
import { TASK_BATCH } from '../data.js';

function runRegime(distributed, batch, maxSimSeconds = 4000) {
  const sim = new Simulation();
  sim.liveTopUp = false;
  // The regime differentiators are: dispatch strategy + intersection stops
  // (distributedMode), AI task allocation, and static vs congestion-aware
  // routing. Deadlock resolution is a liveness safety net both regimes keep.
  sim.settings = {
    ...sim.settings,
    distributedMode: distributed,
    aiTaskAllocation: distributed,
    congestionWeighting: distributed,
    dynamicRerouting: true,
    deadlockResolver: true,
  };

  // Replace the seeded backlog with the exact fixed batch (all created at t=0).
  sim.tasks = [];
  sim._taskSeq = 0;
  for (const t of batch) sim._spawnTask(t);

  const target = batch.length;
  const maxSteps = Math.ceil((maxSimSeconds * 1000) / 100); // dt = 0.1 s per step
  let steps = 0;
  while (sim.metrics.completedTasks < target && steps < maxSteps) {
    sim.step(0.1);
    steps++;
  }

  return {
    regime: distributed ? 'Distributed Edge-AI' : 'Centralised Stop-and-Wait',
    completed: sim.metrics.completedTasks,
    totalTaskTimeS: +(sim.metrics.totalTaskTimeMs / 1000).toFixed(1),
    makespanS: +(sim.time / 1000).toFixed(1),
    avgTaskTimeS: +(sim.metrics.completedTasks ? sim.metrics.totalTaskTimeMs / sim.metrics.completedTasks / 1000 : 0).toFixed(1),
    waitingTimeS: +sim.metrics.waitingTime.toFixed(1),
    collisions: sim.metrics.collisions,
    reroutes: sim.metrics.reroutes,
    deadlocksResolved: sim.metrics.deadlocksResolved,
    throughputPerMin: +(sim.metrics.completedTasks / (sim.time / 60000 || 1e-9)).toFixed(2),
  };
}

/**
 * Run both regimes and compute the comparison.
 * @param {Array} [batch] task batch (defaults to the canonical 20-task book)
 */
export function runBenchmark(batch = TASK_BATCH) {
  const baseline = runRegime(false, batch);
  const edgeAI = runRegime(true, batch);

  const timeReductionPct =
    baseline.totalTaskTimeS > 0
      ? +(((baseline.totalTaskTimeS - edgeAI.totalTaskTimeS) / baseline.totalTaskTimeS) * 100).toFixed(1)
      : 0;
  const makespanReductionPct =
    baseline.makespanS > 0 ? +(((baseline.makespanS - edgeAI.makespanS) / baseline.makespanS) * 100).toFixed(1) : 0;
  const waitReductionPct =
    baseline.waitingTimeS > 0
      ? +(((baseline.waitingTimeS - edgeAI.waitingTimeS) / baseline.waitingTimeS) * 100).toFixed(1)
      : 0;
  const throughputGainPct =
    baseline.throughputPerMin > 0
      ? +(((edgeAI.throughputPerMin - baseline.throughputPerMin) / baseline.throughputPerMin) * 100).toFixed(1)
      : 0;

  return {
    baseline,
    edgeAI,
    comparison: {
      timeReductionPct,
      makespanReductionPct,
      waitReductionPct,
      throughputGainPct,
      totalCollisions: baseline.collisions + edgeAI.collisions,
      meetsTimeTarget: timeReductionPct >= 20,
      meetsZeroCollision: baseline.collisions === 0 && edgeAI.collisions === 0,
    },
    tasks: batch.length,
    ranAt: Date.now(),
  };
}
