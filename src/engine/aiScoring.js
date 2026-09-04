// =============================================================================
//  engine/aiScoring.js — Multi-factor Edge-AI candidate scoring
//
//  OPTIMISATION layer only. It recommends which AMR should take a task; it can
//  never grant physical access (that is the token engine's job). The scorer is
//  a pure function of a normalised feature vector, which keeps it 100%
//  deterministic/testable and lets it be swapped for an RL policy later via the
//  same `score(candidate, task)` interface.
//
//    Cost(AMRi) = w1·D + w2·C + w3·(1-B) + w4·W + w5·H     (lower = better)
//
//    D = normalised A* distance to pickup      C = path congestion index
//    B = battery state of charge               W = workload (carrying?)
//    H = health/degradation factor
// =============================================================================

import { findPath } from './astar.js';

/**
 * Extract the normalised feature vector for one AMR / task pair.
 * @returns {{D:number,C:number,B:number,W:number,H:number, reachable:boolean, pathCost:number}}
 */
export function extractFeatures(amr, task, graph) {
  const from = amr.pose.currentNodeId || amr.startNode;
  const res = findPath(graph, from, task.pickup);
  const reachable = !!res.path;
  const diameter = graph.diameter();

  // D — travel distance to pickup, normalised by graph diameter.
  const rawDist = reachable ? res.cost : diameter * 3;
  const D = Math.min(1, rawDist / (diameter * 2));

  // C — congestion index along the planned path (avg edge congestion above 1).
  let C = 0;
  if (reachable && res.path.length > 1) {
    let sum = 0;
    for (let i = 0; i < res.path.length - 1; i++) {
      const e = graph.getEdge(res.path[i], res.path[i + 1]);
      if (e) sum += e.congestion - 1;
    }
    C = Math.min(1, sum / (res.path.length - 1) / 2);
  }

  // B — battery state of charge (0..1).
  const B = Math.max(0, Math.min(1, amr.battery.soc / 100));

  // W — workload penalty: already carrying a load?
  const W = amr.payload.isLoaded ? 1 : 0;

  // H — health/degradation.
  const H =
    amr.health.motorState === 'fault' || amr.health.lidarStatus === 'fault'
      ? 1
      : amr.health.motorState === 'degraded' || amr.health.lidarStatus === 'blinded'
      ? 0.8
      : 0;

  return { D, C, B, W, H, reachable, pathCost: rawDist };
}

/** Weighted-sum cost from a feature vector. */
export function scoreFeatures(f, weights) {
  return (
    weights.w1_distance * f.D +
    weights.w2_congestion * f.C +
    weights.w3_battery * (1 - f.B) +
    weights.w4_workload * f.W +
    weights.w5_health * f.H
  );
}

/**
 * Rank eligible candidates for a task. Returns the full ranking (ascending
 * cost) with feature breakdowns, plus the winner.
 * @param {Array} candidates  live AMR agents
 * @param {object} task
 * @param {WarehouseGraph} graph
 * @param {object} weights
 * @param {object} config
 */
export function rankCandidates(candidates, task, graph, weights, config) {
  const ranked = [];
  for (const amr of candidates) {
    if (!isEligible(amr, config)) continue;
    const f = extractFeatures(amr, task, graph);
    if (!f.reachable) continue;
    let cost = scoreFeatures(f, weights);
    // Hard preference: an AMR below the low-battery line is heavily penalised
    // (recommendation only — it may still be chosen if it is the sole option).
    // Gated by the "Battery-aware Dispatch" operator setting.
    if (config.batteryAware !== false && amr.battery.soc < config.lowBatteryPct) cost += 0.5;
    ranked.push({ amrId: amr.id, cost, features: f });
  }
  ranked.sort((a, b) => a.cost - b.cost);
  return { ranked, winner: ranked[0] || null };
}

function isEligible(amr, config) {
  return (
    (amr.status === 'idle' || amr.status === 'charging') &&
    amr.pose.targetNodeId == null &&
    !amr.payload.isLoaded &&
    amr.health.motorState !== 'fault' &&
    amr.battery.soc > config.criticalBatteryPct
  );
}
