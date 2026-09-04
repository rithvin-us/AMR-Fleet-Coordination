// =============================================================================
//  engine/tokenManager.js — Deterministic FIFO token safety engine
//
//  This is the SAFETY layer. It has absolute authority over entry into
//  protected zones (intersections / choke points). The AI layer can never
//  override it. Guarantees:
//    - Mutual exclusion: at most one token holder per zone (capacity 1).
//    - Strict FIFO ordering by monotonic request timestamp; ties broken by
//      AMR id (AMR-01 < AMR-02) so ordering is total and deterministic.
//    - Dead-man release: a holder that stalls / goes silent past its lease is
//      force-revoked and the token passes to the next in queue.
// =============================================================================

export class TokenManager {
  constructor(zones, config) {
    this.config = config;
    /** @type {Map<string, object>} */
    this.zones = new Map();
    this.log = []; // rolling transaction log for the UI
    this.grantsTotal = 0;
    this.revokesTotal = 0;

    for (const z of zones) {
      this.zones.set(z.id, {
        id: z.id,
        name: z.name,
        nodeIds: z.nodeIds,
        leaseMs: z.leaseMs ?? config.tokenLeaseMs,
        holder: null,
        grantedAt: null,
        lastSeenActive: null, // updated by holder heartbeat (dead-man)
        queue: [], // [{ amrId, ts, priority }]
      });
    }
  }

  zoneForNode(nodeId) {
    for (const z of this.zones.values()) {
      if (z.nodeIds.includes(nodeId)) return z;
    }
    return null;
  }

  /** Enqueue a request (idempotent per AMR). Returns the zone. */
  request(zoneId, amrId, ts, priority = 0) {
    const z = this.zones.get(zoneId);
    if (!z) return null;
    if (z.holder === amrId) return z;
    if (!z.queue.some((q) => q.amrId === amrId)) {
      z.queue.push({ amrId, ts, priority });
      this._sortQueue(z);
    }
    return z;
  }

  /** True when `amrId` currently owns exclusive entry to the zone. */
  holds(zoneId, amrId) {
    const z = this.zones.get(zoneId);
    return !!z && z.holder === amrId;
  }

  /** Queue position (0 = holder, 1 = next, ...). -1 if not involved. */
  positionOf(zoneId, amrId) {
    const z = this.zones.get(zoneId);
    if (!z) return -1;
    if (z.holder === amrId) return 0;
    const i = z.queue.findIndex((q) => q.amrId === amrId);
    return i === -1 ? -1 : i + 1;
  }

  /** Holder keeps its lease alive by proving forward progress each tick. */
  heartbeat(zoneId, amrId, now) {
    const z = this.zones.get(zoneId);
    if (z && z.holder === amrId) z.lastSeenActive = now;
  }

  /** Voluntary release on zone exit. */
  release(zoneId, amrId, now) {
    const z = this.zones.get(zoneId);
    if (!z || z.holder !== amrId) return;
    this._log(now, amrId, z, 'released');
    z.holder = null;
    z.grantedAt = null;
    z.lastSeenActive = null;
  }

  /** Drop an AMR entirely (failure / e-stop) from holder + all queues. */
  evict(amrId, now) {
    for (const z of this.zones.values()) {
      if (z.holder === amrId) {
        this._log(now, amrId, z, 'evicted');
        z.holder = null;
        z.grantedAt = null;
        z.lastSeenActive = null;
      }
      z.queue = z.queue.filter((q) => q.amrId !== amrId);
    }
  }

  /**
   * Per-tick update. Grants free zones to the FIFO head and enforces the
   * dead-man lease. `isAlive(amrId)` lets the engine ask the world whether a
   * holder is still making progress.
   */
  update(now, isAlive) {
    for (const z of this.zones.values()) {
      // Dead-man enforcement: a *live* holder proves progress with a heartbeat
      // every tick, so it never loses its token while crossing. Only a holder
      // that has gone silent past the dead-man window (failed / powered-down)
      // or is no longer alive is force-revoked; the fixed lease is the ultimate
      // backstop for a holder that somehow stops heartbeating.
      if (z.holder) {
        const silentFor = z.lastSeenActive != null ? now - z.lastSeenActive : 0;
        const stalledSilent = z.lastSeenActive != null && silentFor > this.config.deadmanMs;
        const leaseExpired = z.lastSeenActive != null && silentFor > z.leaseMs;
        const dead = isAlive ? !isAlive(z.holder) : false;
        if (dead || stalledSilent || leaseExpired) {
          this._log(now, z.holder, z, dead ? 'revoked (dead-man)' : 'revoked (stall)');
          this.revokesTotal++;
          z.holder = null;
          z.grantedAt = null;
          z.lastSeenActive = null;
        }
      }
      // Grant to FIFO head
      if (!z.holder && z.queue.length) {
        this._sortQueue(z);
        const head = z.queue.shift();
        z.holder = head.amrId;
        z.grantedAt = now;
        z.lastSeenActive = now;
        this.grantsTotal++;
        this._log(now, head.amrId, z, 'granted');
      }
    }
  }

  snapshot() {
    return [...this.zones.values()].map((z) => ({
      id: z.id,
      name: z.name,
      nodeIds: z.nodeIds,
      holder: z.holder,
      grantedAt: z.grantedAt,
      queue: z.queue.map((q) => ({ ...q })),
    }));
  }

  _sortQueue(z) {
    // FIFO by timestamp; deterministic tie-break by AMR id.
    z.queue.sort((p, q) => p.ts - q.ts || (p.amrId < q.amrId ? -1 : 1));
  }

  _log(now, amrId, zone, status) {
    this.log.unshift({
      t: now,
      time: fmtClock(now),
      amrId,
      zoneId: zone.id,
      zoneName: zone.name,
      status,
    });
    if (this.log.length > 40) this.log.pop();
  }
}

function fmtClock(ms) {
  const s = ms / 1000;
  const mm = String(Math.floor(s / 60) % 60).padStart(2, '0');
  const ss = String(Math.floor(s) % 60).padStart(2, '0');
  const cs = String(Math.floor((ms % 1000) / 10)).padStart(2, '0');
  return `${mm}:${ss}.${cs}`;
}
