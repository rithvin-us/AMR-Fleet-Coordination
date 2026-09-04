// =============================================================================
//  pages.js — View renderers + live updaters for the 8 dashboard pages.
//
//  Each page exports { title, render(sim) -> html, mount(sim, root) -> update }.
//  `render` builds the static skeleton; `mount` wires interactions and returns
//  an `update(sim)` callback the controller calls on every simulation tick.
// =============================================================================

import { SVG_VIEWBOX } from './data.js';
import { runBenchmark } from './engine/benchmark.js';

// ---------------------------------------------------------------------------
//  Shared helpers
// ---------------------------------------------------------------------------
const AMR_FILL = {
  moving: 'var(--accent)',
  idle: 'var(--info)',
  charging: 'var(--accent-2)',
  loading: 'var(--warning)',
  unloading: 'var(--warning)',
  waiting_token: 'var(--text-muted)',
  waiting_traffic: 'var(--text-muted)',
  failed: 'var(--danger)',
  stopped: 'var(--danger)',
};

const STATUS_LABEL = {
  moving: 'moving',
  idle: 'idle',
  charging: 'charging',
  loading: 'loading',
  unloading: 'unloading',
  waiting_token: 'wait · token',
  waiting_traffic: 'wait · traffic',
  failed: 'FAULT',
  stopped: 'stopped',
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const short = (id) => id.replace('AMR-', '');
const num = (x, d = 0) => (x == null || !isFinite(x) ? '—' : x.toFixed(d));

function batteryHTML(soc) {
  const cls = soc > 55 ? 'green' : soc > 22 ? 'amber' : 'red';
  const col = soc > 55 ? 'var(--success)' : soc > 22 ? 'var(--warning)' : 'var(--danger)';
  return `<span class="battery"><span class="battery-shell"><span class="battery-level" style="width:${Math.max(4, soc)}%;background:${col}"></span></span><span class="mono" style="font-size:11px">${num(soc)}%</span></span>`;
}

// ---------------------------------------------------------------------------
//  Warehouse SVG canvas (built once, AMRs/edges updated live)
// ---------------------------------------------------------------------------
function buildWarehouseSVG(sim, interactive) {
  const g = sim.graph;
  let edges = '';
  for (const e of g.edges.values()) {
    const a = g.getNode(e.a);
    const b = g.getNode(e.b);
    edges += `<line class="wh-edge" data-key="${e.key}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
    if (interactive) {
      edges += `<line class="wh-edge-hit" data-a="${e.a}" data-b="${e.b}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
    }
  }
  let nodes = '';
  for (const n of g.nodes.values()) {
    const isInt = n.type === 'intersection';
    if (isInt) {
      nodes += `<rect class="wh-node wh-node-intersection" data-id="${n.id}" x="${n.x - 2.4}" y="${n.y - 2.4}" width="4.8" height="4.8" rx="1" transform="rotate(45 ${n.x} ${n.y})"/>`;
    } else {
      const r = n.type === 'junction' ? 1.9 : 2.5;
      nodes += `<circle class="wh-node wh-node-${n.type}" data-id="${n.id}" cx="${n.x}" cy="${n.y}" r="${r}"/>`;
    }
    const labelY = n.type === 'junction' ? n.y - 2.8 : n.y + 5;
    const label = n.type === 'junction' ? n.id : n.label.replace(/(Charging Dock|Storage Rack|Pick Station|Packing Bay|Dispatch Dock|Crossway) /, (m, w) => ({ 'Charging Dock': '⚡', 'Storage Rack': 'STOR ', 'Pick Station': 'PICK ', 'Packing Bay': 'PACK ', 'Dispatch Dock': 'DROP ', Crossway: 'INT ' }[w]));
    nodes += `<text class="wh-node-label" x="${n.x}" y="${labelY}">${esc(label)}</text>`;
  }
  return `<div class="warehouse-wrap"><svg class="warehouse-svg" viewBox="${SVG_VIEWBOX}" preserveAspectRatio="xMidYMid meet">
    <g class="wh-edges">${edges}</g>
    <g class="wh-nodes">${nodes}</g>
    <g class="wh-amrs"></g>
  </svg></div>`;
}

function updateWarehouse(root, sim) {
  const g = sim.graph;
  // Edges: blocked / busy / clear
  root.querySelectorAll('.wh-edge').forEach((el) => {
    const e = g.edges.get(el.dataset.key);
    if (!e) return;
    const occ = sim.edgeOccupants(e.key).size > 0;
    el.classList.toggle('blocked', !!e.blocked);
    el.classList.toggle('busy', !e.blocked && occ);
  });
  // Intersection nodes: held
  const held = new Set(sim.tokens.snapshot().filter((z) => z.holder).flatMap((z) => z.nodeIds));
  root.querySelectorAll('.wh-node-intersection').forEach((el) => {
    el.classList.toggle('held', held.has(el.dataset.id));
  });
  // AMRs (persistent elements so CSS transitions apply)
  const layer = root.querySelector('.wh-amrs');
  if (!layer) return;
  const svgNS = 'http://www.w3.org/2000/svg';
  for (const a of sim.agents) {
    let el = layer.querySelector(`g[data-id="${a.id}"]`);
    if (!el) {
      el = document.createElementNS(svgNS, 'g');
      el.setAttribute('data-id', a.id);
      el.setAttribute('class', 'wh-amr');
      el.innerHTML =
        `<circle class="wh-amr-halo" r="3.6"></circle>` +
        `<rect class="wh-amr-body" x="-2.3" y="-1.8" width="4.6" height="3.6" rx="1"></rect>` +
        `<text class="wh-amr-label" y="0.1">${short(a.id)}</text>`;
      layer.appendChild(el);
    }
    el.setAttribute('transform', `translate(${a.pose.x.toFixed(2)} ${a.pose.y.toFixed(2)})`);
    const body = el.querySelector('.wh-amr-body');
    body.setAttribute('fill', AMR_FILL[a.status] || 'var(--text-muted)');
    body.setAttribute('class', 'wh-amr-body' + (a.payload.isLoaded ? ' wh-amr-loaded' : ''));
    const halo = el.querySelector('.wh-amr-halo');
    const waiting = a.status === 'waiting_token' || a.status === 'waiting_traffic';
    halo.setAttribute('stroke', a.status === 'failed' ? 'var(--danger)' : 'var(--warning)');
    halo.setAttribute('stroke-width', waiting || a.status === 'failed' ? '0.6' : '0');
  }
}

// ===========================================================================
//  1. WAREHOUSE MAP (Dashboard)
// ===========================================================================
export const dashboard = {
  title: 'Warehouse Map',
  render(sim) {
    return `
    <div class="grid-4 mb-14">
      ${kpiCard('cyan', 'fa-list-check', 'kpiCompleted', '0', 'Tasks Completed')}
      ${kpiCard('green', 'fa-shield-halved', 'kpiCollisions', '0', 'Collisions')}
      ${kpiCard('blue', 'fa-gauge-high', 'kpiThroughput', '0', 'Throughput / min')}
      ${kpiCard('amber', 'fa-robot', 'kpiActive', '0', 'AMRs Active')}
    </div>
    <div class="grid-2-13">
      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="fas fa-diagram-project"></i> Live Warehouse Graph</div>
          <div class="card-badge success" id="whBadge">DISTRIBUTED</div>
        </div>
        ${buildWarehouseSVG(sim, true)}
        <div class="wh-legend">
          <span><i style="background:var(--accent)"></i>AMR moving</span>
          <span><i style="background:var(--warning)"></i>loading</span>
          <span><i style="background:var(--text-muted)"></i>waiting</span>
          <span><i style="background:var(--danger)"></i>fault</span>
          <span><i style="background:var(--warning);border-radius:0;transform:rotate(45deg)"></i>intersection</span>
          <span><i style="background:var(--danger)"></i>blocked lane</span>
          <span class="hint"><i class="fas fa-hand-pointer"></i> click a lane to block/clear it</span>
        </div>
      </div>
      <div class="flex-side">
        <div class="card mb-14">
          <div class="card-header"><div class="card-title"><i class="fas fa-flask"></i> Scenario Injection</div></div>
          <div class="pill-row" id="scenarioBtns">
            <button class="btn" data-act="obstacle"><i class="fas fa-triangle-exclamation"></i> Random Obstacle</button>
            <button class="btn" data-act="failure"><i class="fas fa-robot"></i> Inject Fault</button>
            <button class="btn" data-act="lowbatt"><i class="fas fa-battery-quarter"></i> Low Battery</button>
            <button class="btn" data-act="task"><i class="fas fa-plus"></i> Add Task</button>
          </div>
          <div class="hint" style="margin-top:10px"><i class="fas fa-circle-info"></i> Deterministic FIFO tokens + local A* keep collisions at zero through every scenario.</div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title"><i class="fas fa-diagram-next"></i> Active Tasks</div><span class="card-badge info" id="taskCount">0</span></div>
          <div id="taskList" style="max-height:300px;overflow-y:auto"></div>
        </div>
      </div>
    </div>`;
  },
  mount(sim, root) {
    const edges = root.querySelector('.wh-edges');
    if (edges) {
      edges.addEventListener('click', (e) => {
        const hit = e.target.closest('.wh-edge-hit');
        if (hit) sim.toggleObstacle(hit.dataset.a, hit.dataset.b);
      });
    }
    root.querySelector('#scenarioBtns')?.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'obstacle') {
        const es = [...sim.graph.edges.values()].filter((x) => !x.blocked);
        const e2 = es[Math.floor(Math.random() * es.length)];
        if (e2) sim.toggleObstacle(e2.a, e2.b);
      } else if (act === 'failure') {
        const live = sim.agents.filter((a) => a.status !== 'failed');
        const a = live[Math.floor(Math.random() * live.length)];
        if (a) sim.injectFailure(a.id);
      } else if (act === 'lowbatt') {
        const a = sim.agents.filter((x) => x.status !== 'failed').sort((x, y) => y.battery.soc - x.battery.soc)[0];
        if (a) sim.injectLowBattery(a.id);
      } else if (act === 'task') {
        const T = [
          { pickup: 'STOR-A', dropoff: 'DROP-1', priority: 2, loadKg: 180 },
          { pickup: 'PICK-2', dropoff: 'PACK-2', priority: 1, loadKg: 140 },
          { pickup: 'STOR-B', dropoff: 'PACK-1', priority: 3, loadKg: 260 },
        ];
        sim._spawnTask(T[Math.floor(Math.random() * T.length)]);
      }
    });

    return function update(sim) {
      updateWarehouse(root, sim);
      const k = sim.kpis();
      setText(root, '#kpiCompleted', k.completed);
      const coll = root.querySelector('#kpiCollisions');
      if (coll) {
        coll.textContent = k.collisions;
        coll.classList.toggle('danger-text', k.collisions > 0);
        coll.classList.toggle('safe', k.collisions === 0);
      }
      setText(root, '#kpiThroughput', num(k.throughput, 2));
      setText(root, '#kpiActive', `${sim.agents.filter((a) => a.status !== 'idle' && a.status !== 'charging' && a.status !== 'failed').length}/${sim.agents.length}`);
      setText(root, '#whBadge', sim.distributedMode ? 'DISTRIBUTED' : 'CENTRALISED');

      const tasks = sim.tasks.filter((t) => t.status !== 'completed').slice(0, 12);
      setText(root, '#taskCount', sim.tasks.length);
      const tl = root.querySelector('#taskList');
      if (tl) {
        tl.innerHTML = tasks.length
          ? tasks
              .map(
                (t) => `<div class="msg-row"><div class="msg-head">
              <span class="accent-text">${t.id}</span>
              <span class="status-pill ${t.status === 'unassigned' ? 'waiting_traffic' : 'moving'}">${t.status === 'unassigned' ? 'queued' : esc(t.assignedAmrId || '')}</span></div>
              <div class="msg-meta">${t.pickup} → ${t.dropoff} · ${t.loadKg}kg · P${t.priority}</div></div>`,
              )
              .join('')
          : '<div class="alerts-empty">Order book empty</div>';
      }
    };
  },
};

// ===========================================================================
//  2. FLEET MONITOR
// ===========================================================================
export const fleet = {
  title: 'Fleet Monitor',
  render() {
    return `
      <h2 class="section-title"><i class="fas fa-robot"></i> AMR Fleet Monitor</h2>
      <div class="section-sub">Per-robot edge telemetry — pose, battery, payload, task and health.</div>
      <div class="grid-3" id="fleetGrid"></div>`;
  },
  mount(sim, root) {
    return function update(sim) {
      const grid = root.querySelector('#fleetGrid');
      if (!grid) return;
      grid.innerHTML = sim.agents.map((a) => fleetCard(a, sim)).join('');
    };
  },
};

function fleetCard(a, sim) {
  const soc = a.battery.soc;
  const task = a.task ? `${a.task.id} · ${a.task.pickup}→${a.task.dropoff}` : '—';
  const peers = a.coordination.nearbyPeers.length;
  return `
  <div class="card">
    <div class="card-header">
      <div class="card-title"><i class="fas fa-robot"></i> ${a.id}</div>
      <span class="status-pill ${a.status}">${STATUS_LABEL[a.status] || a.status}</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;font-size:12px">
      <div><span class="muted">Model</span><br>${a.model}</div>
      <div><span class="muted">At node</span><br><span class="mono">${a.pose.currentNodeId}${a.pose.targetNodeId ? ' → ' + a.pose.targetNodeId : ''}</span></div>
      <div><span class="muted">Speed</span><br><span class="mono">${num(a.pose.velocity, 2)} m/s</span></div>
      <div><span class="muted">Payload</span><br>${a.payload.isLoaded ? a.payload.currentLoadKg + ' kg' : 'empty'}</div>
      <div><span class="muted">Task</span><br><span style="font-size:11px">${esc(task)}</span></div>
      <div><span class="muted">Peers in range</span><br><span class="mono">${peers}</span></div>
    </div>
    <div style="margin-top:12px">
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:5px"><span class="muted">Battery ${a.battery.isCharging ? '· charging ⚡' : ''}</span>${batteryHTML(soc)}</div>
      <div class="progress-bar"><div class="progress-fill ${soc > 55 ? 'green' : soc > 22 ? 'amber' : 'red'}" style="width:${soc}%"></div></div>
    </div>
    <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:11px">
      <div><span class="muted">Motor</span><br><span class="${a.health.motorState === 'nominal' ? 'safe' : 'danger-text'}">${a.health.motorState}</span></div>
      <div><span class="muted">LiDAR</span><br><span class="${a.health.lidarStatus === 'nominal' ? 'safe' : 'danger-text'}">${a.health.lidarStatus}</span></div>
      <div><span class="muted">Reroutes</span><br><span class="mono">${a.navigation.rerouteCount}</span></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px">
      <button class="btn ${a.status === 'failed' ? '' : 'danger'}" data-fail="${a.id}" style="flex:1">
        <i class="fas fa-${a.status === 'failed' ? 'rotate-right' : 'power-off'}"></i> ${a.status === 'failed' ? 'Recovering…' : 'E-Stop'}
      </button>
    </div>
  </div>`;
}

// ===========================================================================
//  3. P2P MESH (V2V)
// ===========================================================================
export const v2v = {
  title: 'P2P Mesh',
  render(sim) {
    return `
      <h2 class="section-title"><i class="fas fa-tower-broadcast"></i> Robot-to-Robot P2P Mesh</h2>
      <div class="section-sub">Decentralised gossip — heartbeats, token negotiation and obstacle alerts. No central server in the motion loop.</div>
      <div class="grid-4 mb-14">
        ${kpiCard('cyan', 'fa-satellite-dish', 'meshSent', '0', 'Messages Sent')}
        ${kpiCard('blue', 'fa-stopwatch', 'meshLat', '0', 'Avg Latency (ms)')}
        ${kpiCard('amber', 'fa-wifi', 'meshDrop', '0', 'Packet Loss %')}
        ${kpiCard('green', 'fa-share-nodes', 'meshRange', '0', 'Links In Range')}
      </div>
      <div class="grid-2-13">
        <div class="card">
          <div class="card-header"><div class="card-title"><i class="fas fa-network-wired"></i> Mesh Topology</div><span class="card-badge success">GOSSIP ACTIVE</span></div>
          <div class="mesh-view" id="meshView"></div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title"><i class="fas fa-scroll"></i> Live Packet Feed</div></div>
          <div class="msg-feed" id="msgFeed"></div>
        </div>
      </div>`;
  },
  mount(sim, root) {
    return function update(sim) {
      const k = sim.kpis();
      setText(root, '#meshSent', k.messages);
      setText(root, '#meshLat', num(k.avgLatency, 1));
      setText(root, '#meshDrop', num(k.dropRate * 100, 1));
      const n = sim.agents.length;
      let links = 0;
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
          const d = Math.hypot(sim.agents[i].pose.x - sim.agents[j].pose.x, sim.agents[i].pose.y - sim.agents[j].pose.y);
          if (d <= sim.config.p2pRangeM && sim.agents[i].status !== 'failed' && sim.agents[j].status !== 'failed') links++;
        }
      setText(root, '#meshRange', links);

      // topology ring
      const mv = root.querySelector('#meshView');
      if (mv && !mv._built) {
        mv.innerHTML = sim.agents
          .map((a, i) => {
            const ang = (i / sim.agents.length) * Math.PI * 2 - Math.PI / 2;
            const x = 50 + 34 * Math.cos(ang);
            const y = 50 + 38 * Math.sin(ang);
            return `<div class="comm-node" data-id="${a.id}" style="left:${x}%;top:${y}%">${short(a.id)}<small data-soc>—</small></div>`;
          })
          .join('');
        mv._built = true;
      }
      const recent = new Set(sim.bus.log.slice(0, 3).map((m) => m.from));
      mv?.querySelectorAll('.comm-node').forEach((el) => {
        const a = sim.getAgent(el.dataset.id);
        el.classList.toggle('tx', recent.has(el.dataset.id));
        el.style.opacity = a.status === 'failed' ? 0.35 : 1;
        const s = el.querySelector('[data-soc]');
        if (s) s.textContent = num(a.battery.soc) + '%';
      });

      const feed = root.querySelector('#msgFeed');
      if (feed) {
        feed.innerHTML = sim.bus.log
          .slice(0, 24)
          .map(
            (m) => `<div class="msg-row"><div class="msg-head">
              <span class="accent-text">${m.from} → ${m.to === 'BROADCAST' ? 'ALL' : m.to}</span>
              <span class="msg-type ${m.type}">${m.type.replace('_', ' ')}</span></div>
              <div class="msg-meta">${esc(m.summary)} · RSSI ${m.rssi}dBm ${m.delivered ? '' : '· DROPPED'}</div></div>`,
          )
          .join('');
      }
    };
  },
};

// ===========================================================================
//  4. FIFO TOKENS
// ===========================================================================
export const token = {
  title: 'FIFO Tokens',
  render() {
    return `
      <h2 class="section-title"><i class="fas fa-key"></i> Deterministic FIFO Token Protocol</h2>
      <div class="section-sub">The safety layer. Exclusive intersection access granted strictly by request timestamp — the AI can never override it.</div>
      <div class="grid-3 mb-14">
        ${kpiCard('cyan', 'fa-key', 'tokGrants', '0', 'Tokens Granted')}
        ${kpiCard('amber', 'fa-hourglass-half', 'tokActive', '0', 'Zones Occupied')}
        ${kpiCard('red', 'fa-rotate', 'tokRevokes', '0', 'Dead-man Revokes')}
      </div>
      <div id="zoneCards" class="grid-2 mb-14"></div>
      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fas fa-clock-rotate-left"></i> Token Transaction Log</div></div>
        <div style="overflow-x:auto"><table class="data-table">
          <thead><tr><th>Time</th><th>AMR</th><th>Zone</th><th>Event</th></tr></thead>
          <tbody id="tokLog"></tbody>
        </table></div>
      </div>`;
  },
  mount(sim, root) {
    return function update(sim) {
      const snap = sim.tokens.snapshot();
      setText(root, '#tokGrants', sim.tokens.grantsTotal);
      setText(root, '#tokActive', snap.filter((z) => z.holder).length);
      setText(root, '#tokRevokes', sim.tokens.revokesTotal);
      const zc = root.querySelector('#zoneCards');
      if (zc) {
        zc.innerHTML = snap
          .map((z) => {
            const holder = z.holder
              ? `<span class="fifo-slot holder"><span class="pos">•</span>${short(z.holder)}</span>`
              : '<span class="fifo-empty">zone clear</span>';
            const q = z.queue
              .map((e, i) => `<i class="fas fa-arrow-right fifo-arrow"></i><span class="fifo-slot"><span class="pos">${i + 1}</span>${short(e.amrId)}</span>`)
              .join('');
            return `<div class="zone-card ${z.holder ? 'held' : ''}">
              <div class="zone-head"><span class="zone-name"><i class="fas fa-diamond-turn-right"></i> ${z.name}</span>
              <span class="card-badge ${z.holder ? 'danger' : 'success'}">${z.holder ? 'OCCUPIED' : 'FREE'}</span></div>
              <div class="hint">${z.nodeIds.join(', ')} · capacity 1 · FIFO by timestamp</div>
              <div class="fifo-queue">${holder}${q}</div></div>`;
          })
          .join('');
      }
      const log = root.querySelector('#tokLog');
      if (log) {
        log.innerHTML = sim.tokens.log
          .slice(0, 14)
          .map(
            (l) => `<tr><td class="mono">${l.time}</td><td class="accent-text">${short(l.amrId)}</td><td>${esc(l.zoneName)}</td>
            <td><span class="status-pill ${l.status.includes('granted') ? 'moving' : l.status.includes('revoked') ? 'failed' : 'idle'}">${esc(l.status)}</span></td></tr>`,
          )
          .join('');
      }
    };
  },
};

// ===========================================================================
//  5. SAFETY / E-STOP (Kill switch)
// ===========================================================================
export const killswitch = {
  title: 'Safety / E-Stop',
  render(sim) {
    return `
      <h2 class="section-title"><i class="fas fa-circle-stop"></i> Warehouse Safety Console</h2>
      <div class="section-sub">Hardware-authority emergency stop. On fault, tokens release and the task is re-scored to a healthy AMR.</div>
      <div class="grid-2-13">
        <div class="card">
          <div class="card-header"><div class="card-title"><i class="fas fa-hand"></i> Global Emergency Stop</div><span class="card-badge danger" id="estopStatus">ARMED</span></div>
          <div class="kill-switch-container">
            <button class="kill-btn" id="killBtn"><i class="fas fa-power-off"></i><span>E-STOP</span><span style="font-size:9px;font-weight:500">ALL AMRS</span></button>
            <p class="hint" style="text-align:center;max-width:300px">Immediately halts every AMR. Reservation state is preserved; release resumes autonomous operation.</p>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title"><i class="fas fa-list-check"></i> Per-AMR Control</div></div>
          <div id="amrStopList" style="max-height:440px;overflow-y:auto"></div>
        </div>
      </div>`;
  },
  mount(sim, root) {
    root.querySelector('#killBtn')?.addEventListener('click', () => {
      if (sim.estopActive) sim.releaseEStop();
      else sim.globalEStop();
    });
    root.querySelector('#amrStopList')?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-stop]');
      if (btn) {
        const a = sim.getAgent(btn.dataset.stop);
        if (a) sim.stopAgent(a.id, a.status !== 'stopped');
      }
      const fb = e.target.closest('button[data-fail]');
      if (fb) sim.injectFailure(fb.dataset.fail);
    });
    return function update(sim) {
      const kb = root.querySelector('#killBtn');
      const st = root.querySelector('#estopStatus');
      if (kb) kb.classList.toggle('active', !!sim.estopActive);
      if (st) {
        st.textContent = sim.estopActive ? 'ACTIVATED' : 'ARMED';
        st.className = 'card-badge danger';
      }
      const list = root.querySelector('#amrStopList');
      if (list) {
        list.innerHTML = sim.agents
          .map(
            (a) => `<div class="toggle-row">
            <div class="toggle-label"><span style="display:flex;gap:7px;align-items:center"><span class="status-pill ${a.status}" style="font-size:8px">${STATUS_LABEL[a.status] || a.status}</span> ${a.id}</span>
            <span>${a.pose.currentNodeId} · ${num(a.battery.soc)}%</span></div>
            <div style="display:flex;gap:6px">
              <button class="btn" data-stop="${a.id}" ${a.status === 'failed' ? 'disabled' : ''}>${a.status === 'stopped' ? 'Resume' : 'Stop'}</button>
              <button class="btn danger" data-fail="${a.id}" ${a.status === 'failed' ? 'disabled' : ''}>Fault</button>
            </div></div>`,
          )
          .join('');
      }
    };
  },
};

// ===========================================================================
//  6. PERCEPTION
// ===========================================================================
export const supervision = {
  title: 'Perception',
  render() {
    return `
      <h2 class="section-title"><i class="fas fa-satellite-dish"></i> Autonomous Perception & Sensors</h2>
      <div class="section-sub">Simulated forward LiDAR sweep and onboard sensor health for each AMR edge node.</div>
      <div class="perception-grid" id="percGrid"></div>`;
  },
  mount(sim, root) {
    return function update(sim) {
      const grid = root.querySelector('#percGrid');
      if (!grid) return;
      // Build once, then update footers (keep the CSS sweep animation running).
      if (!grid._built) {
        grid.innerHTML = sim.agents
          .map(
            (a) => `<div class="amr-feed" data-id="${a.id}">
            <div class="amr-feed-header"><span>${a.id}</span><span class="status-pill ${a.status}" data-st style="font-size:8px">${STATUS_LABEL[a.status] || a.status}</span></div>
            <div class="lidar-view">${a.status !== 'failed' ? '<div class="lidar-sweep"></div>' : ''}</div>
            <div class="amr-feed-footer"><span data-node><i class="fas fa-location-dot"></i> —</span><span data-lidar><i class="fas fa-wave-square"></i> —</span></div>
          </div>`,
          )
          .join('');
        grid._built = true;
      }
      grid.querySelectorAll('.amr-feed').forEach((el) => {
        const a = sim.getAgent(el.dataset.id);
        const st = el.querySelector('[data-st]');
        st.textContent = STATUS_LABEL[a.status] || a.status;
        st.className = 'status-pill ' + a.status;
        el.querySelector('[data-node]').innerHTML = `<i class="fas fa-location-dot"></i> ${a.pose.currentNodeId}${a.pose.targetNodeId ? '→' + a.pose.targetNodeId : ''}`;
        el.querySelector('[data-lidar]').innerHTML = `<i class="fas fa-wave-square"></i> ${a.health.lidarStatus}`;
        const view = el.querySelector('.lidar-view');
        const hasSweep = !!view.querySelector('.lidar-sweep');
        if (a.status === 'failed' && hasSweep) view.innerHTML = '';
        else if (a.status !== 'failed' && !hasSweep) view.innerHTML = '<div class="lidar-sweep"></div>';
      });
    };
  },
};

// ===========================================================================
//  7. TELEMETRY & BENCHMARK
// ===========================================================================
export const telemetry = {
  title: 'Telemetry & Benchmark',
  render() {
    return `
      <h2 class="section-title"><i class="fas fa-chart-line"></i> Intralogistics Telemetry & Benchmark</h2>
      <div class="section-sub">Live coordination metrics plus the head-to-head baseline vs distributed edge-AI benchmark.</div>
      <div class="grid-4 mb-14">
        ${kpiCard('cyan', 'fa-list-check', 'tCompleted', '0', 'Tasks Completed')}
        ${kpiCard('blue', 'fa-clock', 'tAvg', '0', 'Avg Task Time (s)')}
        ${kpiCard('amber', 'fa-hourglass', 'tWait', '0', 'Total Wait (s)')}
        ${kpiCard('green', 'fa-shield-halved', 'tColl', '0', 'Collisions')}
      </div>
      <div class="grid-3 mb-14">
        ${kpiCard('cyan', 'fa-route', 'tReroute', '0', 'Dynamic Reroutes')}
        ${kpiCard('amber', 'fa-diagram-project', 'tDeadlock', '0', 'Deadlocks Resolved')}
        ${kpiCard('green', 'fa-ruler-horizontal', 'tSep', '0', 'Min Separation (m)')}
      </div>
      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="fas fa-flask-vial"></i> Benchmark — Stop-and-Wait vs Edge-AI</div>
          <button class="btn primary" id="runBench"><i class="fas fa-play"></i> Run Benchmark</button>
        </div>
        <div id="benchBody"><div class="hint"><i class="fas fa-circle-info"></i> Runs the same 20-task batch head-less under both regimes and checks the BEL success criteria (≥20% faster, zero collisions).</div></div>
      </div>`;
  },
  mount(sim, root) {
    root.querySelector('#runBench')?.addEventListener('click', () => {
      const body = root.querySelector('#benchBody');
      const btn = root.querySelector('#runBench');
      body.innerHTML = '<div class="hint"><i class="fas fa-spinner fa-spin"></i> Running both regimes…</div>';
      btn.disabled = true;
      setTimeout(() => {
        const r = runBenchmark();
        body.innerHTML = renderBenchmark(r);
        btn.disabled = false;
      }, 60);
    });
    return function update(sim) {
      const k = sim.kpis();
      setText(root, '#tCompleted', k.completed);
      setText(root, '#tAvg', num(k.avgTaskTime, 1));
      setText(root, '#tWait', num(k.waitingTime, 0));
      const c = root.querySelector('#tColl');
      if (c) { c.textContent = k.collisions; c.className = 'v ' + (k.collisions ? 'danger-text' : 'safe'); }
      setText(root, '#tReroute', k.reroutes);
      setText(root, '#tDeadlock', k.deadlocksResolved);
      setText(root, '#tSep', sim.minSeparation === Infinity ? '—' : num(sim.minSeparation, 1));
    };
  },
};

function renderBenchmark(r) {
  const c = r.comparison;
  const bar = (metric, unit, base, edge, betterLower = true) => {
    const max = Math.max(base, edge, 0.0001);
    const wB = Math.max(6, (base / max) * 100);
    const wE = Math.max(6, (edge / max) * 100);
    return `<div class="bench-row">
      <div class="bench-metric">${metric}<small>${unit}</small></div>
      <div class="bench-bars">
        <div class="bench-bar-track"><span class="tag">Baseline</span><div class="bench-bar baseline" style="width:${wB}%">${num(base, 1)}</div></div>
        <div class="bench-bar-track"><span class="tag">Edge-AI</span><div class="bench-bar edgeai" style="width:${wE}%">${num(edge, 1)}</div></div>
      </div></div>`;
  };
  return `
    <div class="grid-2 mb-14" style="margin-top:6px">
      <div class="verdict ${c.meetsTimeTarget ? 'pass' : 'fail'}"><i class="fas fa-${c.meetsTimeTarget ? 'circle-check' : 'circle-xmark'}"></i> Task time −${num(c.timeReductionPct, 1)}% ${c.meetsTimeTarget ? '· meets ≥20% target' : '· below 20% target'}</div>
      <div class="verdict ${c.meetsZeroCollision ? 'pass' : 'fail'}"><i class="fas fa-${c.meetsZeroCollision ? 'circle-check' : 'circle-xmark'}"></i> ${c.totalCollisions} collisions · zero-collision ${c.meetsZeroCollision ? 'verified' : 'FAILED'}</div>
    </div>
    ${bar('Total task time', 'sum of all task durations (s)', r.baseline.totalTaskTimeS, r.edgeAI.totalTaskTimeS)}
    ${bar('Makespan', 'time to clear the 20-task batch (s)', r.baseline.makespanS, r.edgeAI.makespanS)}
    ${bar('Intersection / traffic wait', 'total waiting (s)', r.baseline.waitingTimeS, r.edgeAI.waitingTimeS)}
    <div style="display:flex;gap:20px;flex-wrap:wrap;margin-top:6px;font-size:12px" class="muted">
      <span>Throughput gain: <b class="safe">+${num(c.throughputGainPct, 1)}%</b></span>
      <span>Waiting reduced: <b class="safe">${num(c.waitReductionPct, 1)}%</b></span>
      <span>Deadlocks (edge-AI): <b>${r.edgeAI.deadlocksResolved}</b> resolved</span>
      <span>Tasks: <b>${r.tasks}</b> each regime</span>
    </div>`;
}

// ===========================================================================
//  8. SETTINGS
// ===========================================================================
export const settings = {
  title: 'Settings',
  render(sim) {
    const s = sim.settings;
    const tog = (key, label, desc) =>
      `<div class="toggle-row"><div class="toggle-label"><span>${label}</span><span>${desc}</span></div>
      <label class="toggle"><input type="checkbox" ${s[key] ? 'checked' : ''} data-set="${key}"><span class="toggle-slider"></span></label></div>`;
    const w = sim.weights;
    const slider = (key, label) =>
      `<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span>${label}</span><span class="mono" data-wl="${key}">${w[key].toFixed(2)}</span></div>
      <input type="range" min="0" max="1" step="0.05" value="${w[key]}" data-weight="${key}" style="width:100%"></div>`;
    return `
      <h2 class="section-title"><i class="fas fa-sliders"></i> Coordination Settings</h2>
      <div class="section-sub">Tune the coordination stack live. AI weights recommend; deterministic safety always has final authority.</div>
      <div class="grid-2 mb-14">
        <div class="card">
          <div class="card-header"><div class="card-title"><i class="fas fa-diagram-project"></i> Coordination Mode</div></div>
          ${tog('distributedMode', 'Distributed Edge-AI', 'Off = centralised stop-and-wait baseline')}
          ${tog('aiTaskAllocation', 'AI Task Allocation', 'Multi-factor candidate scoring')}
          ${tog('congestionWeighting', 'Congestion-aware Routing', 'A* avoids busy corridors')}
          ${tog('dynamicRerouting', 'Dynamic Rerouting', 'Local A* replans around obstacles/traffic')}
          ${tog('deadlockResolver', 'Deadlock Resolver', 'Circular-wait detection + priority yield')}
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title"><i class="fas fa-shield-halved"></i> Safety & Comms</div></div>
          ${tog('deadmanRelease', 'Dead-man Token Release', 'Revoke tokens from stalled holders')}
          ${tog('batteryAwareDispatch', 'Battery-aware Dispatch', 'Penalise low-SoC candidates')}
          ${tog('gossipBroadcast', 'P2P Gossip Broadcast', 'Heartbeats & obstacle alerts')}
          ${tog('auditLogging', 'Audit Logging', 'Full token & task traceability')}
        </div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fas fa-scale-balanced"></i> Edge-AI Scoring Weights <span class="muted" style="font-weight:400;text-transform:none;letter-spacing:0">Cost = w₁·D + w₂·C + w₃·(1−B) + w₄·W + w₅·H</span></div><span class="card-badge info" id="wSum">Σ 1.00</span></div>
        <div class="grid-2">
          <div>
            ${slider('w1_distance', 'w₁ · Distance to pickup')}
            ${slider('w2_congestion', 'w₂ · Path congestion')}
            ${slider('w3_battery', 'w₃ · Battery penalty')}
          </div>
          <div>
            ${slider('w4_workload', 'w₄ · Workload')}
            ${slider('w5_health', 'w₅ · Health / degradation')}
            <div class="hint" style="margin-top:10px"><i class="fas fa-circle-info"></i> Weights are the AI optimisation layer — they influence task assignment only, never physical intersection access.</div>
          </div>
        </div>
      </div>`;
  },
  mount(sim, root) {
    root.addEventListener('change', (e) => {
      if (e.target.dataset.set) {
        sim.settings[e.target.dataset.set] = e.target.checked;
        if (e.target.dataset.set === 'distributedMode') {
          sim.graph.routingUsesCongestion = sim.settings.congestionWeighting;
        }
      }
    });
    root.addEventListener('input', (e) => {
      if (e.target.dataset.weight) {
        const key = e.target.dataset.weight;
        sim.weights[key] = parseFloat(e.target.value);
        const lbl = root.querySelector(`[data-wl="${key}"]`);
        if (lbl) lbl.textContent = sim.weights[key].toFixed(2);
        const sum = Object.values(sim.weights).reduce((a, b) => a + b, 0);
        const el = root.querySelector('#wSum');
        if (el) { el.textContent = 'Σ ' + sum.toFixed(2); el.className = 'card-badge ' + (Math.abs(sum - 1) < 0.011 ? 'success' : 'warning'); }
      }
    });
    return null; // static page
  },
};

// ---------------------------------------------------------------------------
//  Small helpers
// ---------------------------------------------------------------------------
function kpiCard(color, icon, id, val, label) {
  return `<div class="card stat-card"><div class="stat-icon ${color}"><i class="fas ${icon}"></i></div>
    <div><div class="stat-value" id="${id}">${val}</div><div class="stat-label">${label}</div></div></div>`;
}
function setText(root, sel, val) {
  const el = root.querySelector(sel);
  if (el) el.textContent = val;
}

export const PAGES = { dashboard, fleet, v2v, token, killswitch, supervision, telemetry, settings };
