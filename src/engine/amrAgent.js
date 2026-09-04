// =============================================================================
//  engine/amrAgent.js — Autonomous Mobile Robot edge agent
//
//  Each AMR is an independent edge node with its OWN intelligence:
//    - local state (pose, battery, payload, health)
//    - local A* planner (edge computing — no central route server)
//    - deterministic token coordination for protected zones
//    - a P2P inbox (beacons, obstacle gossip, failure alerts)
//    - a task execution state machine
//
//  Collision freedom is guaranteed by a reservation protocol enforced through
//  the world (simulation): while traversing an edge an AMR reserves BOTH
//  endpoint nodes, so two robots can never share a node or meet head-on. The
//  FIFO token engine sits on top for the protected intersections.
// =============================================================================

import { findPath } from './astar.js';
import { MSG } from './p2pBus.js';

const R2D = 180 / Math.PI;

export class AMRAgent {
  constructor(spec, config) {
    this.config = config;
    this.id = spec.id;
    this.model = spec.model;
    this.startNode = spec.startNode;
    this.homeNode = spec.homeNode;
    this.initialBattery = spec.battery;

    this.pose = {
      x: 0,
      y: 0,
      currentNodeId: spec.startNode,
      targetNodeId: null,
      headingDeg: 0,
      velocity: 0,
      progress: 0,
    };
    this.battery = { soc: spec.battery, voltage: socToVolt(spec.battery), isCharging: false };
    this.payload = { isLoaded: false, currentLoadKg: 0, maxCapacityKg: spec.maxCapacityKg, taskId: null };
    this.navigation = { destinationNodeId: null, currentPath: [], pathCost: 0, rerouteCount: 0, phase: null };
    this.coordination = {
      heldZones: new Set(),
      waitingForToken: null,
      requestTimestamp: 0,
      nearbyPeers: [],
    };
    this.health = { motorState: 'nominal', lidarStatus: 'nominal', lastHeartbeat: 0 };

    this.task = null;
    this.status = 'idle';
    this.inbox = [];
    this.localBlocked = new Set(); // obstacle edges learned via P2P gossip
    this.dwellUntil = 0;
    this.recoverAt = 0;
    this._resumeStatus = null;
    this._beaconAcc = 0;
    this._failureAnnounced = false;
    this._stopWaitUntil = 0;
    this._hopGrantUntil = 0;
    this._holdUntil = 0;

    this.metrics = { waitingTime: 0, distance: 0, tasksCompleted: 0 };
  }

  // ---------------------------------------------------------------------------
  //  Lifecycle
  // ---------------------------------------------------------------------------
  reset(world) {
    const n = world.graph.getNode(this.startNode);
    this.pose = {
      x: n.x,
      y: n.y,
      currentNodeId: this.startNode,
      targetNodeId: null,
      headingDeg: 0,
      velocity: 0,
      progress: 0,
    };
    this.battery = { soc: this.initialBattery, voltage: socToVolt(this.initialBattery), isCharging: false };
    this.payload = { isLoaded: false, currentLoadKg: 0, maxCapacityKg: this.payload.maxCapacityKg, taskId: null };
    this.navigation = { destinationNodeId: null, currentPath: [], pathCost: 0, rerouteCount: 0, phase: null };
    this.coordination = { heldZones: new Set(), waitingForToken: null, requestTimestamp: 0, nearbyPeers: [] };
    this.health = { motorState: 'nominal', lidarStatus: 'nominal', lastHeartbeat: 0 };
    this.task = null;
    this.status = 'idle';
    this.inbox = [];
    this.localBlocked = new Set();
    this.dwellUntil = 0;
    this.recoverAt = 0;
    this._resumeStatus = null;
    this._beaconAcc = 0;
    this._failureAnnounced = false;
    this._stopWaitUntil = 0;
    this._hopGrantUntil = 0;
    this._holdUntil = 0;
    this.metrics = { waitingTime: 0, distance: 0, tasksCompleted: 0 };
    world.tryReserveNode(this.startNode, this.id, world.time, true);
  }

  assignTask(task, world) {
    this.task = task;
    this.payload.taskId = task.id;
    this.battery.isCharging = false;
    this.navigation.phase = 'to_pickup';
    this.navigation.destinationNodeId = task.pickup;
    this.status = 'moving';
    this.planTo(task.pickup, world);
    // Announce the claim to the fleet (P2P TASK_CLAIM).
    world.bus.send(
      {
        senderId: this.id,
        recipientId: 'BROADCAST',
        type: MSG.TASK_CLAIM,
        payload: { taskId: task.id, pickup: task.pickup, dropoff: task.dropoff },
      },
      world,
    );
  }

  planTo(destId, world, avoidEdges = null) {
    const avoid = new Set([...this.localBlocked]);
    if (avoidEdges) for (const e of avoidEdges) avoid.add(e);
    const res = findPath(world.graph, this.pose.currentNodeId, destId, { avoidEdges: avoid });
    if (res.path) {
      this.navigation.currentPath = res.path;
      this.navigation.pathCost = res.cost;
      this.navigation.destinationNodeId = destId;
      return true;
    }
    // No route right now — hold and retry (obstacle may clear / peer may move).
    this.navigation.currentPath = [this.pose.currentNodeId];
    this.navigation.pathCost = Infinity;
    return false;
  }

  // ---------------------------------------------------------------------------
  //  Main tick
  // ---------------------------------------------------------------------------
  tick(dt, world) {
    const now = world.time;

    if (this.status === 'failed') {
      this.pose.velocity = 0;
      if (!this._failureAnnounced) {
        world.bus.send({ senderId: this.id, recipientId: 'BROADCAST', type: MSG.FAILURE, payload: {} }, world);
        this._failureAnnounced = true;
      }
      if (this.recoverAt && now >= this.recoverAt) this._recover(world);
      return;
    }
    if (this.status === 'stopped') {
      this.pose.velocity = 0;
      return;
    }

    this._processInbox();
    this._maybeBeacon(dt, world);

    // Keep held token leases alive while powered/live, and reconcile our local
    // view with the authoritative holder so a revoked token can never leave a
    // stale "I still hold it" claim behind (self-healing).
    for (const zid of [...this.coordination.heldZones]) {
      if (world.tokens.holds(zid, this.id)) world.tokens.heartbeat(zid, this.id, now);
      else this.coordination.heldZones.delete(zid);
    }

    // Dwell states -----------------------------------------------------------
    if (this.status === 'loading') {
      if (now >= this.dwellUntil) {
        this.payload.isLoaded = true;
        this.payload.currentLoadKg = this.task ? this.task.loadKg : 0;
        this.navigation.phase = 'to_dropoff';
        this.status = 'moving';
        this.planTo(this.task.dropoff, world);
      }
      return;
    }
    if (this.status === 'unloading') {
      if (now >= this.dwellUntil) this._completeTask(world);
      return;
    }
    if (this.status === 'charging') {
      this.battery.isCharging = true;
      this.battery.soc = Math.min(100, this.battery.soc + 8 * dt);
      this.battery.voltage = socToVolt(this.battery.soc);
      if (this.battery.soc >= 95) {
        this.battery.isCharging = false;
        this.status = 'idle';
        this.navigation.phase = null;
      }
      return;
    }

    // Idle: charging docks are the only valid staging spot. Anywhere else — a
    // work bay (pickup/dropoff/packing) or a through-junction — an idle AMR
    // would block peers, so it retires to the nearest dock (and tops up there).
    if (this.status === 'idle') {
      const here = world.graph.getNode(this.pose.currentNodeId);
      if (here.type === 'charging') {
        if (this.battery.soc < 99) this.status = 'charging'; // top up while parked
      } else {
        const dock = world.graph.nearestOfType(this.pose.currentNodeId, 'charging');
        if (dock && dock !== this.pose.currentNodeId) {
          this.navigation.phase = this.battery.soc < this.config.lowBatteryPct ? 'to_charge' : 'to_park';
          this.status = 'moving';
          this.planTo(dock, world);
        }
      }
      return;
    }

    // Moving / waiting -------------------------------------------------------
    if (this.pose.targetNodeId == null) {
      this._decideNext(dt, world);
    } else {
      this._advance(dt, world);
    }
  }

  // ---------------------------------------------------------------------------
  //  Movement internals
  // ---------------------------------------------------------------------------
  _decideNext(dt, world) {
    const path = this.navigation.currentPath;
    const cur = this.pose.currentNodeId;

    if (!path || path.length <= 1) {
      // Path exhausted. Only "arrived" if we are actually at the destination;
      // otherwise (e.g. after a deadlock retreat) hold briefly, then re-plan.
      if (!this.navigation.destinationNodeId || cur === this.navigation.destinationNodeId) {
        this._onArriveDestination(world);
      } else if (world.time < this._holdUntil) {
        this.status = 'waiting_traffic';
        this.pose.velocity = 0;
        this.metrics.waitingTime += dt;
        world.metrics.waitingTime += dt;
      } else {
        this.planTo(this.navigation.destinationNodeId, world);
        this.status = 'moving';
      }
      return;
    }
    const next = path[1];
    // Only hold reservation interest in the node we actually want next.
    world.pruneWaitersExcept(this.id, next);
    const edge = world.graph.getEdge(cur, next);

    // Edge no longer usable -> local A* replan.
    if (!edge || edge.blocked || world.graph.getNode(next).disabled) {
      this.navigation.rerouteCount++;
      world.metrics.reroutes++;
      this.planTo(this.navigation.destinationNodeId, world);
      this.pose.velocity = 0;
      return;
    }

    // Deterministic FIFO token gate for protected zones.
    const zone = world.tokens.zoneForNode(next);
    if (zone && !this.coordination.heldZones.has(zone.id)) {
      if (!world.tokens.holds(zone.id, this.id)) {
        if (this.coordination.waitingForToken !== zone.id) {
          this.coordination.waitingForToken = zone.id;
          this.coordination.requestTimestamp = world.time;
          world.tokens.request(zone.id, this.id, world.time, this._priority());
          world.bus.send(
            { senderId: this.id, recipientId: 'BROADCAST', type: MSG.TOKEN_REQUEST, payload: { zone: zone.id } },
            world,
          );
        }
        this.status = 'waiting_token';
        this.pose.velocity = 0;
        this.metrics.waitingTime += dt;
        world.metrics.waitingTime += dt;
        return;
      }
      // Granted. In centralised stop-and-wait (baseline) mode every AMR makes a
      // full fixed stop at each intersection before it may proceed — this is
      // the delay the distributed regime negotiates away.
      if (!world.distributedMode) {
        if (this._stopWaitUntil === 0) {
          this._stopWaitUntil = world.time + this.config.baselineIntersectionWaitS * 1000;
        }
        if (world.time < this._stopWaitUntil) {
          this.status = 'waiting_token';
          this.pose.velocity = 0;
          this.metrics.waitingTime += dt;
          world.metrics.waitingTime += dt;
          return;
        }
        this._stopWaitUntil = 0;
      }
      this.coordination.heldZones.add(zone.id);
      this.coordination.waitingForToken = null;
    }

    // Baseline centralised control: each movement segment requires a
    // request->grant round-trip to the central server (latency), which the
    // distributed fleet avoids by deciding locally at the edge.
    if (!world.distributedMode) {
      if (this._hopGrantUntil === 0) this._hopGrantUntil = world.time + this.config.baselineGrantS * 1000;
      if (world.time < this._hopGrantUntil) {
        this.status = 'waiting_token';
        this.pose.velocity = 0;
        this.metrics.waitingTime += dt;
        world.metrics.waitingTime += dt;
        return;
      }
    }

    // Acquire BOTH the single-lane corridor (edge) and the destination node,
    // atomically: never hold one while waiting for the other, so this pair can
    // never itself deadlock. Edge first (it is the scarcer, capacity-1 resource).
    const ekey = keyOf(cur, next);
    world.pruneEdgeWaitersExcept(this.id, ekey);
    if (!world.tryReserveEdge(cur, next, this.id, world.time)) {
      // Distributed edge intelligence: flow around a congested corridor via a
      // free alternate route instead of queuing (baseline stays put and waits).
      if (this._tryCongestionReroute(world)) return;
      this.status = 'waiting_traffic';
      this.pose.velocity = 0;
      this.metrics.waitingTime += dt;
      world.metrics.waitingTime += dt;
      return;
    }
    if (!world.tryReserveNode(next, this.id, world.time)) {
      world.releaseEdge(cur, next, this.id); // roll back the partial claim
      if (this._tryCongestionReroute(world)) return;
      this.status = 'waiting_traffic';
      this.pose.velocity = 0;
      this.metrics.waitingTime += dt;
      world.metrics.waitingTime += dt;
      return;
    }

    // Commit to the edge.
    this.pose.targetNodeId = next;
    this.pose.progress = 0;
    this._hopGrantUntil = 0; // consumed for this hop
    this.status = 'moving';
    const a = world.graph.getNode(cur);
    const b = world.graph.getNode(next);
    this.pose.headingDeg = Math.atan2(b.y - a.y, b.x - a.x) * R2D;
  }

  /**
   * Congestion-aware detour (distributed mode only). When the shortest next hop
   * is blocked by traffic, look for an alternate route to the destination whose
   * first hop is free RIGHT NOW and take it — the dynamic A* recalculation that
   * lets the distributed fleet bypass congested zones. Returns true if adopted.
   */
  _tryCongestionReroute(world) {
    if (!world.distributedMode || !world.settings.dynamicRerouting) return false;
    const cur = this.pose.currentNodeId;
    const dest = this.navigation.destinationNodeId;
    if (!dest) return false;
    const busyNext = this.navigation.currentPath[1];
    const avoid = new Set(this.localBlocked);
    if (busyNext) avoid.add(keyOf(cur, busyNext));
    const res = findPath(world.graph, cur, dest, { avoidEdges: avoid });
    if (!res.path || res.path.length < 2) return false;
    // Only divert for a genuine short bypass — never trade a brief wait for a
    // long loop. Compare against the remaining shortest cost on the open graph.
    const direct = findPath(world.graph, cur, dest);
    if (direct.path && res.cost > direct.cost * 1.25) return false;
    const step = res.path[1];
    // Only divert if the alternative's first hop is actually free right now.
    if (world.edgeOccupants(keyOf(cur, step)).size >= 1) return false;
    const n = world.graph.getNode(step);
    if (n.disabled || world.nodeOccupants(step).size >= (n.capacity ?? 1)) return false;
    const z = world.tokens.zoneForNode(step);
    if (z && !this.coordination.heldZones.has(z.id)) return false; // don't divert into a token zone
    this.navigation.currentPath = res.path;
    this.navigation.pathCost = res.cost;
    this.navigation.rerouteCount++;
    world.metrics.reroutes++;
    return true;
  }

  _advance(dt, world) {
    const cur = this.pose.currentNodeId;
    const next = this.pose.targetNodeId;
    const edge = world.graph.getEdge(cur, next);
    const a = world.graph.getNode(cur);
    const b = world.graph.getNode(next);
    const len = edge ? edge.distance : Math.hypot(b.x - a.x, b.y - a.y);

    const targetV = Math.min(this.config.maxSpeed, edge ? edge.speed : this.config.maxSpeed);
    this.pose.velocity = Math.min(targetV, this.pose.velocity + this.config.accel * dt);
    const step = this.pose.velocity * dt;
    this.pose.progress += step / len;
    this.metrics.distance += step;

    // Battery drain proportional to distance travelled.
    this.battery.soc = Math.max(0, this.battery.soc - step * 0.045);
    this.battery.voltage = socToVolt(this.battery.soc);

    if (this.pose.progress >= 1) {
      // Arrived at `next`.
      this.pose.progress = 0;
      world.releaseEdge(cur, next, this.id); // free the corridor
      world.releaseNode(cur, this.id); // free the node we left; we still hold `next`
      this.pose.currentNodeId = next;
      this.pose.targetNodeId = null;
      this.pose.x = b.x;
      this.pose.y = b.y;
      this.navigation.currentPath.shift(); // drop old current; [0] is now `next`

      // Release any token whose zone we have fully cleared.
      for (const zid of [...this.coordination.heldZones]) {
        const z = world.tokens.zones.get(zid);
        if (z && !z.nodeIds.includes(this.pose.currentNodeId)) {
          world.tokens.release(zid, this.id, world.time);
          this.coordination.heldZones.delete(zid);
          world.bus.send(
            { senderId: this.id, recipientId: 'BROADCAST', type: MSG.TOKEN_RELEASE, payload: { zone: zid } },
            world,
          );
        }
      }
    } else {
      this.pose.x = a.x + (b.x - a.x) * this.pose.progress;
      this.pose.y = a.y + (b.y - a.y) * this.pose.progress;
    }
  }

  _onArriveDestination(world) {
    const phase = this.navigation.phase;
    this.pose.velocity = 0;
    if (phase === 'to_pickup') {
      this.status = 'loading';
      this.dwellUntil = world.time + this.config.loadSeconds * 1000;
    } else if (phase === 'to_dropoff') {
      this.status = 'unloading';
      this.dwellUntil = world.time + this.config.unloadSeconds * 1000;
    } else if (phase === 'to_charge') {
      this.status = 'charging';
    } else {
      // Arrived at a parking dock (to_park) or generic idle.
      this.status = 'idle';
      this.navigation.phase = null;
    }
  }

  _completeTask(world) {
    const task = this.task;
    this.payload.isLoaded = false;
    this.payload.currentLoadKg = 0;
    this.payload.taskId = null;
    this.navigation.phase = null;
    this.navigation.destinationNodeId = null;
    this.status = 'idle';
    this.metrics.tasksCompleted++;
    this.task = null;
    if (task) world.completeTask(task, this);
    world.bus.send(
      { senderId: this.id, recipientId: 'BROADCAST', type: MSG.BEACON, payload: { node: this.pose.currentNodeId, soc: this.battery.soc, idle: true } },
      world,
    );
  }

  // ---------------------------------------------------------------------------
  //  Deadlock resolution hook — yield: detour, else retreat to a free node.
  //  Returns true if this AMR was able to give way (breaking the cycle).
  // ---------------------------------------------------------------------------
  yieldFor(world, contestedEdgeKey) {
    // Cannot yield mid-edge; let it clear first.
    if (this.pose.targetNodeId != null) return false;

    const cur = this.pose.currentNodeId;
    const dest = this.navigation.destinationNodeId;
    const intendedNext = this.navigation.currentPath[1];

    // A neighbour we can actually vacate INTO right now (free, unblocked, and
    // not a token zone so yielding never itself needs a grant).
    const canEnter = (to) => {
      const e = world.graph.edges.get(keyOf(cur, to));
      if (!e || e.blocked) return false;
      if (world.edgeOccupants(e.key).size >= 1) return false; // corridor busy
      const n = world.graph.getNode(to);
      if (n.disabled) return false;
      if (world.tokens.zoneForNode(to)) return false;
      const cap = n.capacity ?? 1;
      return world.nodeOccupants(to).size < cap;
    };

    const dropTokenReq = () => {
      if (this.coordination.waitingForToken) {
        const z = world.tokens.zones.get(this.coordination.waitingForToken);
        if (z) z.queue = z.queue.filter((q) => q.amrId !== this.id);
        this.coordination.waitingForToken = null;
      }
    };

    // 1) A* detour that avoids the contested edge AND whose first step vacates
    //    into a currently-free neighbour (so we truly break the cycle, not just
    //    re-queue behind the next robot).
    if (dest && contestedEdgeKey) {
      const res = findPath(world.graph, cur, dest, {
        avoidEdges: new Set([contestedEdgeKey, ...this.localBlocked]),
      });
      if (res.path && res.path.length > 1 && keyOf(cur, res.path[1]) !== contestedEdgeKey && canEnter(res.path[1])) {
        dropTokenReq();
        this.navigation.currentPath = res.path;
        this.navigation.pathCost = res.cost;
        this.navigation.rerouteCount++;
        this.status = 'moving';
        return true;
      }
    }

    // 2) Retreat into any free adjacent node, then hold there briefly (a
    //    "waiting node" dwell) before re-planning — this stops the yielder from
    //    immediately charging back into the hotspot and lets the trapped robot
    //    claim the space it just freed.
    for (const { to } of world.graph.neighbors(cur)) {
      if (to === intendedNext) continue;
      if (!canEnter(to)) continue;
      dropTokenReq();
      this.navigation.currentPath = [cur, to]; // step aside; destination unchanged
      this.navigation.rerouteCount++;
      this._holdUntil = world.time + 2500;
      this.status = 'moving';
      return true;
    }
    return false;
  }

  currentEdgeKey() {
    const cur = this.pose.currentNodeId;
    const nxt = this.pose.targetNodeId || this.navigation.currentPath[1];
    if (!cur || !nxt) return null;
    return cur < nxt ? `${cur}|${nxt}` : `${nxt}|${cur}`;
  }

  // ---------------------------------------------------------------------------
  //  Failure / recovery / stop
  // ---------------------------------------------------------------------------
  fail(world, recoverMs = 10000) {
    this.status = 'failed';
    this.health.motorState = 'fault';
    this.pose.velocity = 0;
    this._failureAnnounced = false;
    this.recoverAt = world.time + recoverMs;
    // Release the edge and target reservation; keep occupying current node as a
    // static obstacle and disable it for peer path planning.
    if (this.pose.targetNodeId) {
      world.releaseEdge(this.pose.currentNodeId, this.pose.targetNodeId, this.id);
      world.releaseNode(this.pose.targetNodeId, this.id);
      this.pose.targetNodeId = null;
    }
    world.graph.setDisabled(this.pose.currentNodeId, true);
    world._clearWaiter(this.id);
    world._clearEdgeWaiter(this.id);
    world.tokens.evict(this.id, world.time);
    for (const zid of this.coordination.heldZones) {
      world.bus.send({ senderId: this.id, recipientId: 'BROADCAST', type: MSG.TOKEN_RELEASE, payload: { zone: zid } }, world);
    }
    this.coordination.heldZones.clear();
    this.coordination.waitingForToken = null;
    // Hand the task back for AI reassignment.
    if (this.task) {
      world.reclaimTask(this.task);
      this.task = null;
      this.payload = { isLoaded: false, currentLoadKg: 0, maxCapacityKg: this.payload.maxCapacityKg, taskId: null };
      this.navigation.phase = null;
    }
  }

  _recover(world) {
    this.status = 'idle';
    this.health.motorState = 'nominal';
    this.recoverAt = 0;
    world.graph.setDisabled(this.pose.currentNodeId, false);
  }

  // ---------------------------------------------------------------------------
  //  Comms
  // ---------------------------------------------------------------------------
  _maybeBeacon(dt, world) {
    // P2P gossip broadcast is operator-gated (Settings → P2P Gossip Broadcast).
    if (world.settings && world.settings.gossipBroadcast === false) return;
    this._beaconAcc += dt;
    const period = 1 / this.config.heartbeatHz;
    if (this._beaconAcc >= period) {
      this._beaconAcc = 0;
      this.health.lastHeartbeat = world.time;
      world.bus.send(
        {
          senderId: this.id,
          recipientId: 'BROADCAST',
          type: MSG.BEACON,
          payload: { node: this.pose.currentNodeId, soc: this.battery.soc, v: this.pose.velocity },
        },
        world,
      );
    }
  }

  _processInbox() {
    const peers = new Set();
    for (const msg of this.inbox) {
      if (msg.senderId !== this.id) peers.add(msg.senderId);
      if (msg.type === MSG.OBSTACLE && msg.payload && msg.payload.edgeKey) {
        // Learn the obstacle locally (edge intelligence / gossip).
        this.localBlocked.add(msg.payload.edgeKey);
      }
      if (msg.type === MSG.OBSTACLE && msg.payload && msg.payload.cleared) {
        this.localBlocked.delete(msg.payload.edgeKey);
      }
    }
    this.coordination.nearbyPeers = [...peers];
    this.inbox.length = 0;
  }

  _priority() {
    return this.task ? this.task.priority : 0;
  }
}

function socToVolt(soc) {
  return +(42 + (soc / 100) * 12).toFixed(1); // 48 V nominal pack: 42 V empty .. 54 V full
}

function keyOf(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
