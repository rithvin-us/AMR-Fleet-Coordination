// =============================================================================
//  engine/p2pBus.js — Virtual peer-to-peer mesh network
//
//  Simulates robot-to-robot radio with realistic imperfections so the
//  distributed coordination is exercised the way it would be on real edge
//  hardware:
//    - Range limited (RSSI derived from inter-AMR distance).
//    - Latency jitter (config min..max ms) before delivery.
//    - Stochastic packet loss (config drop rate) + out-of-range drops.
//  Messages are delivered into each recipient AMR's local `inbox`.
// =============================================================================

export const MSG = {
  BEACON: 'BEACON_HEARTBEAT',
  TOKEN_REQUEST: 'TOKEN_REQUEST',
  TOKEN_GRANT: 'TOKEN_GRANT',
  TOKEN_RELEASE: 'TOKEN_RELEASE',
  OBSTACLE: 'OBSTACLE_DETECTED',
  FAILURE: 'AMR_FAILURE_ALERT',
  TASK_CLAIM: 'TASK_CLAIM',
};

let SEQ = 0;

export class P2PBus {
  constructor(config) {
    this.config = config;
    this.inflight = []; // { deliverAt, to, msg }
    this.log = []; // rolling delivered-message log for the UI
    this.sent = 0; // messages transmitted (a broadcast counts once)
    this.attempts = 0; // per-recipient delivery attempts (for true link loss)
    this.delivered = 0;
    this.dropped = 0;
    this._latencySum = 0;
  }

  /**
   * Broadcast or unicast a message. `getAgents()` returns the live roster and
   * `positionOf(id)` the {x,y} of each AMR so RSSI can be computed.
   */
  send(msg, world) {
    const now = world.time;
    const sender = world.getAgent(msg.senderId);
    const senderPos = sender ? sender.pose : { x: 0, y: 0 };
    msg.messageId = `M${(SEQ++).toString(36)}`;
    msg.timestamp = now;
    this.sent++;

    const recipients =
      msg.recipientId === 'BROADCAST'
        ? world.agents.filter((a) => a.id !== msg.senderId)
        : [world.getAgent(msg.recipientId)].filter(Boolean);

    let anyDelivered = false;
    this.attempts += recipients.length;
    for (const r of recipients) {
      const d = Math.hypot(senderPos.x - r.pose.x, senderPos.y - r.pose.y);
      const rssi = rssiFromDistance(d);
      const outOfRange = d > this.config.p2pRangeM;
      const lost = outOfRange || Math.random() < this.config.p2pDropRate;
      if (lost) {
        this.dropped++;
        continue;
      }
      const latency =
        this.config.p2pLatencyMinMs +
        Math.random() * (this.config.p2pLatencyMaxMs - this.config.p2pLatencyMinMs);
      this.inflight.push({
        deliverAt: now + latency,
        to: r.id,
        msg,
        rssi,
        latency,
      });
      anyDelivered = true;
    }

    // Record the transmit event for the live feed (even a pure broadcast).
    this._pushLog({
      messageId: msg.messageId,
      from: msg.senderId,
      to: msg.recipientId,
      type: msg.type,
      summary: summarize(msg),
      rssi: recipients.length ? bestRssi(senderPos, recipients) : -30,
      t: now,
      delivered: anyDelivered,
    });
    return msg;
  }

  /** Deliver all messages whose latency window has elapsed. */
  update(world) {
    if (!this.inflight.length) return;
    const now = world.time;
    const stillFlying = [];
    for (const p of this.inflight) {
      if (p.deliverAt <= now) {
        const target = world.getAgent(p.to);
        if (target && target.status !== 'failed') {
          target.inbox.push(p.msg);
          this.delivered++;
          this._latencySum += p.latency;
        }
      } else {
        stillFlying.push(p);
      }
    }
    this.inflight = stillFlying;
  }

  avgLatency() {
    return this.delivered ? this._latencySum / this.delivered : 0;
  }

  dropRate() {
    return this.attempts ? this.dropped / this.attempts : 0;
  }

  _pushLog(entry) {
    this.log.unshift(entry);
    if (this.log.length > 60) this.log.pop();
  }
}

function rssiFromDistance(d) {
  // -30 dBm near, decaying with distance, floored at -95 dBm.
  return Math.max(-95, Math.round(-30 - d * 0.85));
}

function bestRssi(from, recipients) {
  let best = -95;
  for (const r of recipients) {
    const d = Math.hypot(from.x - r.pose.x, from.y - r.pose.y);
    best = Math.max(best, rssiFromDistance(d));
  }
  return best;
}

function summarize(msg) {
  const p = msg.payload || {};
  switch (msg.type) {
    case MSG.BEACON:
      return `pose @ ${p.node || '—'} · SoC ${Math.round(p.soc ?? 0)}%`;
    case MSG.TOKEN_REQUEST:
      return `request ${p.zone}`;
    case MSG.TOKEN_RELEASE:
      return `cleared ${p.zone}`;
    case MSG.OBSTACLE:
      return `edge ${p.edge} BLOCKED`;
    case MSG.FAILURE:
      return `${msg.senderId} fault — release all`;
    case MSG.TASK_CLAIM:
      return `claimed ${p.taskId} (${p.pickup}→${p.dropoff})`;
    default:
      return msg.type;
  }
}
