// =============================================================================
//  pages.js — View renderers + live updaters for the 8 dashboard pages.
//
//  Each page exports { title, render(sim) -> html, mount(sim, root) -> update }.
//  `render` builds the static skeleton; `mount` wires interactions and returns
//  an `update(sim)` callback the controller calls on every simulation tick.
// =============================================================================

import { SVG_VIEWBOX } from './data.js';
import { runBenchmark } from './engine/benchmark.js';
import { ThreeWarehouseMap } from './engine/threeMap.js';
import { MapCustomizer } from './engine/mapCustomizer.js';

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
    const isJunc = n.type === 'junction';
    if (isInt) {
      nodes += `<g class="wh-node-group">
        <rect class="wh-node wh-node-intersection" data-id="${n.id}" x="${n.x - 2.8}" y="${n.y - 2.8}" width="5.6" height="5.6" rx="1.2" transform="rotate(45 ${n.x} ${n.y})"/>
        <text class="wh-node-label" x="${n.x}" y="${n.y - 4.2}">${esc(n.label)}</text>
      </g>`;
    } else {
      const r = isJunc ? 1.4 : 2.4;
      const labelY = isJunc ? n.y - 2.2 : n.y + 4.8;
      const label = isJunc ? n.id : n.label.replace(/(Charge Dock|Rack|Pick Stn|Pack Line|Dispatch Dock) /, (m, w) => ({ 'Charge Dock': '⚡ C', Rack: 'RACK ', 'Pick Stn': 'PICK ', 'Pack Line': 'PACK ', 'Dispatch Dock': 'DROP ' }[w]));
      nodes += `<g class="wh-node-group">
        <circle class="wh-node wh-node-${n.type}" data-id="${n.id}" cx="${n.x}" cy="${n.y}" r="${r}"/>
        <text class="wh-node-label ${isJunc ? 'junc-label' : ''}" x="${n.x}" y="${labelY}">${esc(label)}</text>
      </g>`;
    }
  }

  const facilityOverlays = `
    <!-- Building Perimeter -->
    <rect class="wh-bg-grid" x="2" y="2" width="156" height="96" rx="3" fill="none" stroke="#cbd5e1" stroke-width="0.5" stroke-dasharray="2 2"/>
    
    <!-- Rack Zone Alpha -->
    <g class="wh-facility-zone">
      <rect x="6" y="28" width="148" height="16" rx="2" fill="rgba(16, 185, 129, 0.05)" stroke="rgba(16, 185, 129, 0.3)" stroke-width="0.5"/>
      <text x="80" y="30.5" fill="#0f172a" font-size="1.8" font-weight="800" text-anchor="middle" font-family="var(--font-mono)">STORAGE ZONE ALPHA (RACKS A1 - A2)</text>
    </g>

    <!-- Rack Zone Bravo -->
    <g class="wh-facility-zone">
      <rect x="6" y="56" width="148" height="16" rx="2" fill="rgba(16, 185, 129, 0.05)" stroke="rgba(16, 185, 129, 0.3)" stroke-width="0.5"/>
      <text x="80" y="58.5" fill="#0f172a" font-size="1.8" font-weight="800" text-anchor="middle" font-family="var(--font-mono)">STORAGE ZONE BRAVO (RACKS B1 - B3)</text>
    </g>

    <!-- Fulfillment Zone -->
    <g class="wh-facility-zone">
      <rect x="6" y="84" width="148" height="12" rx="2" fill="rgba(2, 132, 199, 0.05)" stroke="rgba(2, 132, 199, 0.3)" stroke-width="0.5"/>
      <text x="80" y="86.5" fill="#0f172a" font-size="1.8" font-weight="800" text-anchor="middle" font-family="var(--font-mono)">OUTBOUND FULFILLMENT & DISPATCH BAY</text>
    </g>

    <!-- Scale & Compass -->
    <g class="wh-scale-bar" transform="translate(6 95)">
      <line x1="0" y1="0" x2="20" y2="0" stroke="#475569" stroke-width="0.5"/>
      <line x1="0" y1="-1" x2="0" y2="1" stroke="#475569" stroke-width="0.5"/>
      <line x1="20" y1="-1" x2="20" y2="1" stroke="#475569" stroke-width="0.5"/>
      <text x="10" y="-1.5" fill="#0f172a" font-size="1.5" font-weight="700" font-family="var(--font-mono)" text-anchor="middle">20 METRES</text>
    </g>
  `;

  return `<div class="warehouse-wrap"><svg class="warehouse-svg" viewBox="${SVG_VIEWBOX}" preserveAspectRatio="xMidYMid meet">
    ${facilityOverlays}
    <g class="wh-edges">${edges}</g>
    <g class="wh-mesh-links"></g>
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

  // Update Real-Time Adaptive Spatial P2P Mesh Overlay on Map Canvas
  const meshLayer = root.querySelector('.wh-mesh-links');
  if (meshLayer) {
    let meshHTML = '';
    const liveAgents = sim.agents.filter((a) => a.status !== 'failed');
    const n = liveAgents.length;
    const p2pRange = sim.config.p2pRangeM || 30;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a1 = liveAgents[i];
        const a2 = liveAgents[j];
        const dist = Math.hypot(a1.pose.x - a2.pose.x, a1.pose.y - a2.pose.y);
        if (dist <= p2pRange) {
          const signalRatio = Math.max(0.1, 1 - dist / p2pRange);
          const opacity = (signalRatio * 0.65).toFixed(2);
          const dash = dist < 12 ? '0.6 0.6' : '1.2 1.2';
          meshHTML += `<line class="wh-mesh-link" x1="${a1.pose.x.toFixed(2)}" y1="${a1.pose.y.toFixed(2)}" x2="${a2.pose.x.toFixed(2)}" y2="${a2.pose.y.toFixed(2)}" stroke="#0969da" stroke-width="0.35" stroke-dasharray="${dash}" opacity="${opacity}"/>`;
        }
      }
    }
    meshLayer.innerHTML = meshHTML;
  }

  // AMRs
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
        `<circle class="wh-amr-halo" r="3.2"></circle>` +
        `<g class="wh-amr-chassis">` +
          `<rect class="wh-amr-body" x="-2.2" y="-1.5" width="4.4" height="3.0" rx="0.8"></rect>` +
          `<polygon points="1.8,0 0.8,-0.8 0.8,0.8" fill="#ffffff" opacity="0.95"></polygon>` +
          `<rect class="wh-amr-cargo" x="-1.1" y="-0.9" width="2.2" height="1.8" rx="0.3" fill="none" stroke="#ffffff" stroke-width="0.3"></rect>` +
        `</g>` +
        `<g class="wh-amr-badge" transform="translate(0 -2.8)">` +
          `<rect x="-2.4" y="-1.0" width="4.8" height="2.0" rx="0.5" fill="#0f172a" stroke="#000000" stroke-width="0.3"></rect>` +
          `<text class="wh-amr-label" y="0.2" fill="#ffffff">${short(a.id)}</text>` +
        `</g>`;
      layer.appendChild(el);
    }
    
    const rot = a.pose.headingDeg || 0;
    el.setAttribute('transform', `translate(${a.pose.x.toFixed(2)} ${a.pose.y.toFixed(2)})`);
    
    const chassis = el.querySelector('.wh-amr-chassis');
    if (chassis) chassis.setAttribute('transform', `rotate(${rot.toFixed(1)})`);

    const body = el.querySelector('.wh-amr-body');
    if (body) {
      body.setAttribute('fill', AMR_FILL[a.status] || 'var(--text-muted)');
    }
    
    const cargo = el.querySelector('.wh-amr-cargo');
    if (cargo) {
      cargo.style.display = a.payload.isLoaded ? 'block' : 'none';
    }

    const halo = el.querySelector('.wh-amr-halo');
    if (halo) {
      const waiting = a.status === 'waiting_token' || a.status === 'waiting_traffic';
      halo.setAttribute('stroke', a.status === 'failed' ? 'var(--danger)' : 'var(--warning)');
      halo.setAttribute('stroke-width', waiting || a.status === 'failed' ? '0.5' : '0');
    }
  }
}

// ===========================================================================
//  1. WAREHOUSE MAP (Dashboard)
// ===========================================================================
// ===========================================================================
//  1. WAREHOUSE MAP (Dashboard & 3D WebGL Digital Twin Console)
// ===========================================================================
export const dashboard = {
  title: 'Warehouse Map',
  render(sim) {
    return `
    <div class="scada-console-wrapper">
    <!-- MAIN 3-COLUMN SCADA DASHBOARD LAYOUT -->
    <div class="scada-dashboard-grid mb-14">

      <!-- LEFT COLUMN: FLEET OVERVIEW & ACTIVE MISSIONS -->
      <div style="display:flex;flex-direction:column;gap:14px">
        <!-- Fleet Overview -->
        <div class="card">
          <div class="card-header" style="padding:10px 12px">
            <div class="card-title" style="font-size:11px;color:#94a3b8;font-family:var(--font-mono)"><i class="fas fa-layer-group"></i> FLEET OVERVIEW</div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:4px 0">
            <div class="scada-metric-tile" style="border-left:3px solid #10b981">
              <div class="scada-metric-lbl">Total Assets</div>
              <div class="scada-metric-val" style="color:#10b981">39</div>
            </div>
            <div class="scada-metric-tile" style="border-left:3px solid #38bdf8">
              <div class="scada-metric-lbl">Available</div>
              <div class="scada-metric-val" style="color:#38bdf8">29</div>
            </div>
            <div class="scada-metric-tile" style="border-left:3px solid #f59e0b">
              <div class="scada-metric-lbl">In Mission</div>
              <div class="scada-metric-val" style="color:#fbbf24">8</div>
            </div>
            <div class="scada-metric-tile" style="border-left:3px solid #ea580c">
              <div class="scada-metric-lbl">Charging</div>
              <div class="scada-metric-val" style="color:#f97316">2</div>
            </div>
          </div>
        </div>

        <!-- Active Missions Roster -->
        <div class="card" style="flex:1">
          <div class="card-header" style="padding:10px 12px">
            <div class="card-title" style="font-size:11px;color:#94a3b8;font-family:var(--font-mono)"><i class="fas fa-list-check"></i> ACTIVE MISSIONS</div>
            <span style="color:#64748b;font-size:12px"><i class="fas fa-ellipsis"></i></span>
          </div>
          <div style="overflow-y:auto;max-height:310px">
            <table class="active-missions-table">
              <thead>
                <tr>
                  <th>ID <i class="fas fa-arrows-up-down" style="font-size:8px"></i></th>
                  <th>Destination</th>
                  <th>Progress</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="color:#10b981;font-weight:700">AMR-204</td>
                  <td>Aisle B4</td>
                  <td>
                    <div class="scada-progress-bar"><div class="scada-progress-fill scada-progress-green" style="width:88%"></div></div>
                  </td>
                </tr>
                <tr>
                  <td style="color:#38bdf8;font-weight:700">AGV-158</td>
                  <td>Aisle B1</td>
                  <td>
                    <div class="scada-progress-bar"><div class="scada-progress-fill scada-progress-green" style="width:82%"></div></div>
                  </td>
                </tr>
                <tr>
                  <td style="color:#10b981;font-weight:700">AMR-204</td>
                  <td>Aisle B4</td>
                  <td>
                    <div class="scada-progress-bar"><div class="scada-progress-fill scada-progress-cyan" style="width:71%"></div></div>
                  </td>
                </tr>
                <tr>
                  <td style="color:#38bdf8;font-weight:700">AGV-198</td>
                  <td>Aisle B3</td>
                  <td>
                    <div class="scada-progress-bar"><div class="scada-progress-fill scada-progress-cyan" style="width:64%"></div></div>
                  </td>
                </tr>
                <tr>
                  <td style="color:#38bdf8;font-weight:700">AGV-158</td>
                  <td>Aisle B6</td>
                  <td>
                    <div class="scada-progress-bar"><div class="scada-progress-fill scada-progress-cyan" style="width:52%"></div></div>
                  </td>
                </tr>
                <tr>
                  <td style="color:#10b981;font-weight:700">AMR-103</td>
                  <td>Aisle B6</td>
                  <td>
                    <div class="scada-progress-bar"><div class="scada-progress-fill scada-progress-cyan" style="width:45%"></div></div>
                  </td>
                </tr>
                <tr>
                  <td style="color:#38bdf8;font-weight:700">AGV-167</td>
                  <td>Aisle B5</td>
                  <td>
                    <div class="scada-progress-bar"><div class="scada-progress-fill scada-progress-green" style="width:34%"></div></div>
                  </td>
                </tr>
                <tr>
                  <td style="color:#38bdf8;font-weight:700">AGV-188</td>
                  <td>Aisle B31</td>
                  <td>
                    <div class="scada-progress-bar"><div class="scada-progress-fill scada-progress-green" style="width:20%"></div></div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Zone 4 Utilization -->
        <div class="card">
          <div class="card-header" style="padding:8px 12px">
            <div class="card-title" style="font-size:10px;color:#94a3b8;font-family:var(--font-mono)">ZONE 4 UTILIZATION</div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">
            <div style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:4px;padding:8px;text-anchor:middle;text-align:center">
              <div style="font-size:9px;color:#94a3b8;font-family:var(--font-mono)">AMRs</div>
              <div style="font-size:18px;font-weight:800;color:#10b981;font-family:var(--font-display)">18</div>
            </div>
            <div style="background:rgba(2,132,199,0.1);border:1px solid rgba(2,132,199,0.3);border-radius:4px;padding:8px;text-align:center">
              <div style="font-size:9px;color:#94a3b8;font-family:var(--font-mono)">AGVs</div>
              <div style="font-size:18px;font-weight:800;color:#38bdf8;font-family:var(--font-display)">12</div>
            </div>
            <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:4px;padding:8px;text-align:center">
              <div style="font-size:9px;color:#94a3b8;font-family:var(--font-mono)">Forklifts</div>
              <div style="font-size:18px;font-weight:800;color:#fbbf24;font-family:var(--font-display)">9</div>
            </div>
          </div>
        </div>
      </div>

      <!-- CENTER COLUMN: MAIN WEBGL 3D DIGITAL TWIN VIEWPORT -->
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="card" style="padding:0;overflow:hidden;position:relative;background:#040d1a;border:1px solid rgba(0,242,255,0.25);box-shadow:0 8px 30px rgba(0,0,0,0.6)">
          <div class="card-header" style="padding:10px 14px;background:rgba(15,23,42,0.95);border-bottom:1px solid rgba(255,255,255,0.08)">
            <div class="card-title" style="font-size:12px;color:#00f2ff;font-family:var(--font-display);letter-spacing:0.8px">
              <i class="fas fa-cube" style="color:#00f2ff"></i> GLOBAL LOGISTICS HUB - ZONE 4
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <div class="speed-group" id="viewModeGroup">
                <button id="btnMode2D"><i class="fas fa-border-all"></i> 2D Plan</button>
                <button class="active" id="btnMode3D"><i class="fas fa-cube" style="color:var(--accent)"></i> 3D Digital Twin</button>
                <button id="btnOpenCustomizer"><i class="fas fa-sliders" style="color:var(--warning)"></i> Customize Map</button>
              </div>
              <button class="btn btn-sm btn-icon" id="btnFullscreen3DHeader" style="color:#94a3b8"><i class="fas fa-expand"></i></button>
              <button class="btn btn-sm btn-icon" style="color:#94a3b8"><i class="fas fa-gear"></i></button>
            </div>
          </div>

          <div class="warehouse-container-box" style="position:relative">
            <!-- 2D SVG Schematic View (Hidden by default in 3D mode) -->
            <div id="svgCanvasWrap" style="display:none;">
              ${buildWarehouseSVG(sim, true)}
            </div>

            <!-- 3D WebGL Digital Twin View Container -->
            <div id="threeCanvasContainer" style="display:block;height:540px;">
              <div class="scada-hud-overlay">
                <div class="scada-hud-card">
                  <i class="fas fa-microchip" style="color:#00f2ff;margin-right:4px"></i> <b>WEBGL 3D DIGITAL TWIN</b> | <span id="hud3DStats">60 FPS · Industrial SCADA Twin</span>
                </div>
                <div class="scada-preset-bar" id="cameraPresetBar">
                  <button class="active" data-preset="3d"><i class="fas fa-camera"></i> Isometric</button>
                  <button data-preset="iso"><i class="fas fa-vector-square"></i> 2.5D Top</button>
                  <button data-preset="2d"><i class="fas fa-map"></i> Flat Plan</button>
                </div>
              </div>

              <!-- Bottom Floating SCADA Control Bar -->
              <div class="scada-bottom-controls">
                <button class="scada-control-btn" id="btnViewAngle"><i class="fas fa-arrows-spin"></i> View Angle</button>
                <button class="scada-control-btn" id="btnZoomToggle"><i class="fas fa-magnifying-glass"></i> Zoom</button>
                <button class="scada-control-btn" id="btnLayersToggle"><i class="fas fa-layer-group"></i> Layers</button>
              </div>
            </div>
          </div>
        </div>

        <!-- SCADA Quick Action / Scenario Controls -->
        <div class="card" style="padding:10px 14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div class="card-title" style="font-size:11px;color:#94a3b8;font-family:var(--font-mono)"><i class="fas fa-flask"></i> SCADA SCENARIO & FAULT INJECTION</div>
            <span class="card-badge info" style="font-size:9px">LOCAL A* & FIFO TOKENS</span>
          </div>
          <div class="pill-row" id="scenarioBtns">
            <button class="btn btn-sm" data-act="obstacle"><i class="fas fa-triangle-exclamation"></i> +1 Obstacle</button>
            <button class="btn btn-sm" data-act="multi_obstacle"><i class="fas fa-road-barrier"></i> +3 Obstacles</button>
            <button class="btn btn-sm" data-act="clear_obstacles"><i class="fas fa-rotate-left"></i> Clear All</button>
            <button class="btn btn-sm" data-act="failure"><i class="fas fa-plug-circle-xmark"></i> Inject Fault</button>
            <button class="btn btn-sm" data-act="lowbatt"><i class="fas fa-battery-quarter"></i> Low Battery</button>
            <button class="btn btn-sm primary" data-act="task"><i class="fas fa-plus"></i> Dispatch Task</button>
          </div>
        </div>
      </div>

      <!-- RIGHT COLUMN: VEHICLE STATUS, ALERTS & TRAFFIC FLOW -->
      <div style="display:flex;flex-direction:column;gap:14px">
        <!-- Vehicle Status Roster -->
        <div class="card">
          <div class="card-header" style="padding:10px 12px">
            <div class="card-title" style="font-size:11px;color:#94a3b8;font-family:var(--font-mono)"><i class="fas fa-truck-ramp-box"></i> VEHICLE STATUS</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;padding-top:4px">
            <div style="background:#f6f8fa;border:1px solid #d0d7de;border-radius:6px;padding:8px 10px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <span style="color:#10b981;font-weight:800;font-family:var(--font-mono);font-size:12px">AMR-204</span>
                <span style="color:#10b981;font-weight:700;font-family:var(--font-mono);font-size:11px">88%</span>
                <span style="color:#10b981;font-weight:700;font-family:var(--font-mono);font-size:11px">88%</span>
              </div>
              <div class="scada-progress-bar"><div class="scada-progress-fill scada-progress-green" style="width:88%"></div></div>
              <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:9.5px;color:#64748b;font-family:var(--font-mono)">
                <span>Current Task</span>
                <span>En Route</span>
              </div>
            </div>

            <div style="background:#f6f8fa;border:1px solid #d0d7de;border-radius:6px;padding:8px 10px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <span style="color:#d97706;font-weight:800;font-family:var(--font-mono);font-size:12px">FL-012</span>
                <span style="color:#d97706;font-weight:700;font-family:var(--font-mono);font-size:11px">54%</span>
                <span style="color:#d97706;font-weight:700;font-family:var(--font-mono);font-size:11px">54%</span>
              </div>
              <div class="scada-progress-bar"><div class="scada-progress-fill" style="width:54%;background:linear-gradient(90deg,#d97706,#f59e0b)"></div></div>
              <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:9.5px;color:#64748b;font-family:var(--font-mono)">
                <span>Location</span>
                <span>Charging</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Notifications / Alerts -->
        <div class="card">
          <div class="card-header" style="padding:10px 12px">
            <div class="card-title" style="font-size:11px;color:#94a3b8;font-family:var(--font-mono)"><i class="fas fa-bell"></i> NOTIFICATIONS/ALERTS</div>
          </div>
          <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);border-radius:6px;padding:10px;display:flex;align-items:center;gap:10px;color:#f87171;font-family:var(--font-mono);font-size:11px">
            <i class="fas fa-triangle-exclamation" style="font-size:14px;color:#ef4444"></i>
            <div>Aisle B4 Blocked - Re-routing</div>
          </div>
        </div>

        <!-- Traffic Flow Map Thermal Heatmap Preview -->
        <div class="card">
          <div class="card-header" style="padding:10px 12px">
            <div class="card-title" style="font-size:11px;color:#94a3b8;font-family:var(--font-mono)"><i class="fas fa-fire-flame-curved"></i> TRAFFIC FLOW MAP</div>
          </div>
          <div style="background:#020617;border-radius:6px;padding:6px;height:120px;position:relative;overflow:hidden;border:1px solid rgba(255,255,255,0.08)">
            <!-- Thermal Heatmap Canvas Graphic -->
            <div style="position:absolute;inset:0;background:radial-gradient(circle at 70% 40%, rgba(239,68,68,0.7), transparent 45%), radial-gradient(circle at 40% 60%, rgba(245,158,11,0.6), transparent 50%), radial-gradient(circle at 20% 30%, rgba(16,185,129,0.5), transparent 40%), linear-gradient(135deg, #040d1a 0%, #0b192c 100%);opacity:0.85"></div>
            <div style="position:absolute;bottom:6px;left:8px;font-size:9px;color:#94a3b8;font-family:var(--font-mono);z-index:2">HIGH DENSITY CONGESTION CORRIDOR</div>
          </div>
        </div>
      </div>

    </div>

    <!-- SCADA TELEMETRY RING GAUGES CARD -->
    <div class="card mb-14">
      <div class="card-header">
        <div class="card-title"><i class="fas fa-chart-pie"></i> Fleet SCADA Operational Telemetry Gauges</div>
        <span class="card-badge success">REAL-TIME MONITORING</span>
      </div>
      <div class="grid-3" style="align-items:center;padding:10px 0;">
        <div class="ring-gauge-wrap">
          <svg class="ring-gauge-svg" viewBox="0 0 100 100">
            <circle class="ring-gauge-bg" cx="50" cy="50" r="40"/>
            <circle class="ring-gauge-fill" id="ringUtilization" cx="50" cy="50" r="40" stroke-dasharray="251.2" stroke-dashoffset="60"/>
            <text class="ring-gauge-val" x="50" y="55" text-anchor="middle" transform="rotate(90 50 50)" id="ringValUtil">75%</text>
          </svg>
          <div style="font-size:11px;font-weight:700;margin-top:6px;font-family:var(--font-mono)">Fleet Utilization</div>
        </div>
        <div class="ring-gauge-wrap">
          <svg class="ring-gauge-svg" viewBox="0 0 100 100">
            <circle class="ring-gauge-bg" cx="50" cy="50" r="40"/>
            <circle class="ring-gauge-fill" id="ringThroughput" cx="50" cy="50" r="40" stroke-dasharray="251.2" stroke-dashoffset="90" stroke="#10b981"/>
            <text class="ring-gauge-val" x="50" y="55" text-anchor="middle" transform="rotate(90 50 50)" id="ringValTput">0.0</text>
          </svg>
          <div style="font-size:11px;font-weight:700;margin-top:6px;font-family:var(--font-mono)">Throughput / Min</div>
        </div>
        <div class="ring-gauge-wrap">
          <svg class="ring-gauge-svg" viewBox="0 0 100 100">
            <circle class="ring-gauge-bg" cx="50" cy="50" r="40"/>
            <circle class="ring-gauge-fill" id="ringMesh" cx="50" cy="50" r="40" stroke-dasharray="251.2" stroke-dashoffset="0" stroke="#00f2ff"/>
            <text class="ring-gauge-val" x="50" y="55" text-anchor="middle" transform="rotate(90 50 50)" id="ringValMesh">100%</text>
          </svg>
          <div style="font-size:11px;font-weight:700;margin-top:6px;font-family:var(--font-mono)">P2P Mesh Connectivity</div>
        </div>
      </div>
    </div>

    <!-- LOWER SCADA TELEMETRY DISPLAY -->
    <div class="card mb-14">
      <div class="card-header">
        <div class="card-title"><i class="fas fa-microchip"></i> AMR Fleet Edge Telemetry Roster</div>
        <div style="display:flex;gap:12px;align-items:center">
          <span class="hint" style="margin:0"><i class="fas fa-tower-broadcast"></i> 10 Hz LIVE TELEMETRY</span>
          <span class="card-badge success">SYSTEM NOMINAL</span>
        </div>
      </div>
      <div class="grid-4" id="dashFleetGrid" style="gap:10px"></div>
    </div>

    <div class="grid-2 mb-14">
      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="fas fa-key"></i> FIFO Intersection Token Locks</div>
          <span class="card-badge warning" id="dashTokCount">0 ZONES HELD</span>
        </div>
        <div id="dashTokenGrid" style="display:grid;grid-template-columns:1fr 1fr;gap:10px"></div>
      </div>
      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="fas fa-tower-broadcast"></i> P2P Mesh Gossip Traffic</div>
          <span class="card-badge success">GOSSIP BUS ACTIVE</span>
        </div>
        <div class="msg-feed" id="dashMsgFeed" style="max-height:220px;overflow-y:auto"></div>
      </div>
    </div>
    
    <!-- Map Customizer Drawer Host -->
    <div id="customizerDrawerHost"></div>

    <!-- TASK CREATOR & MODIFIER MODAL -->
    <div class="task-modal-overlay" id="taskModalOverlay" style="display:none;position:fixed;inset:0;background:rgba(4,13,26,0.8);backdrop-filter:blur(6px);z-index:2000;align-items:center;justify-content:center;">
      <div class="task-modal-card" style="background:var(--navy);border:1px solid rgba(0,242,255,0.3);border-radius:8px;width:420px;padding:20px;color:#fff;box-shadow:0 10px 30px rgba(0,0,0,0.6);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:8px">
          <div style="font-family:var(--font-display);font-weight:700;font-size:14px;color:#00f2ff;" id="taskModalTitle">
            <i class="fas fa-tasks"></i> Dispatch & Modify Custom Task
          </div>
          <button class="btn btn-sm btn-icon" id="btnCloseTaskModal"><i class="fas fa-xmark"></i></button>
        </div>

        <input type="hidden" id="taskEditId" value="">

        <div style="display:flex;flex-direction:column;gap:12px;">
          <div>
            <label style="font-size:10px;color:#94a3b8;font-family:var(--font-mono)">PICKUP NODE TARGET</label>
            <select id="taskPickupSelect" class="select-sm" style="margin-top:4px"></select>
          </div>
          <div>
            <label style="font-size:10px;color:#94a3b8;font-family:var(--font-mono)">DROPOFF NODE TARGET</label>
            <select id="taskDropoffSelect" class="select-sm" style="margin-top:4px"></select>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div>
              <label style="font-size:10px;color:#94a3b8;font-family:var(--font-mono)">PRIORITY LEVEL</label>
              <select id="taskPrioritySelect" class="select-sm" style="margin-top:4px">
                <option value="1">P1 — Critical / Urgent</option>
                <option value="2" selected>P2 — High Priority</option>
                <option value="3">P3 — Standard Priority</option>
              </select>
            </div>
            <div>
              <label style="font-size:10px;color:#94a3b8;font-family:var(--font-mono)">LOAD WEIGHT (KG)</label>
              <input type="number" id="taskLoadKg" class="input-sm" value="180" min="10" max="1000" style="margin-top:4px">
            </div>
          </div>

          <button class="btn btn-primary btn-sm w-full" id="btnSaveTask" style="margin-top:10px;padding:8px"><i class="fas fa-check"></i> Save & Dispatch Order</button>
        </div>
      </div>
    </div>
    </div>`;
  },
  mount(sim, root) {
    // 1. Initialize 3D WebGL Digital Twin Engine
    const threeContainer = root.querySelector('#threeCanvasContainer');
    let threeMap = null;
    if (threeContainer) {
      threeMap = new ThreeWarehouseMap(threeContainer, (a, b) => {
        sim.toggleObstacle(a, b);
      });
      threeMap.buildSceneGraph(sim.graph);
    }

    // 2. Initialize Interactive Map Customizer
    const customizer = new MapCustomizer(sim);
    const customizerHost = root.querySelector('#customizerDrawerHost');
    if (customizerHost) {
      customizerHost.innerHTML = customizer.renderCustomizerDrawerHTML();
      customizer.bindCustomizerEvents(customizerHost, () => {
        // Hot-reload SVG and 3D WebGL scene when layout changes!
        const svgWrap = root.querySelector('#svgCanvasWrap');
        if (svgWrap) {
          svgWrap.innerHTML = buildWarehouseSVG(sim, true);
        }
        if (threeMap) {
          threeMap.buildSceneGraph(sim.graph);
        }
      });
    }

    // 3. View Mode Toggles (2D Plan vs 3D Digital Twin vs Customizer Drawer)
    const svgCanvasWrap = root.querySelector('#svgCanvasWrap');
    const btnMode2D = root.querySelector('#btnMode2D');
    const btnMode3D = root.querySelector('#btnMode3D');
    const btnOpenCustomizer = root.querySelector('#btnOpenCustomizer');

    btnMode2D?.addEventListener('click', () => {
      btnMode2D.classList.add('active');
      btnMode3D?.classList.remove('active');
      if (svgCanvasWrap) svgCanvasWrap.style.display = 'block';
      if (threeContainer) threeContainer.style.display = 'none';
    });

    btnMode3D?.addEventListener('click', () => {
      btnMode3D.classList.add('active');
      btnMode2D?.classList.remove('active');
      if (svgCanvasWrap) svgCanvasWrap.style.display = 'none';
      if (threeContainer) {
        threeContainer.style.display = 'block';
        threeMap?.handleResize();
      }
    });

    btnOpenCustomizer?.addEventListener('click', () => {
      const drawer = root.querySelector('#customizerDrawer');
      if (drawer) drawer.classList.add('open');
    });

    root.querySelector('#btnCloseCustomizer')?.addEventListener('click', () => {
      const drawer = root.querySelector('#customizerDrawer');
      if (drawer) drawer.classList.remove('open');
    });

    // 4. Camera Presets Bar & Floating Control Toolbar for 3D View
    root.querySelector('#btnFullscreen3DHeader')?.addEventListener('click', () => {
      threeMap?.toggleFullscreen();
    });

    let viewAngleIdx = 0;
    const presets = ['3d', 'iso', '2d'];
    root.querySelector('#btnViewAngle')?.addEventListener('click', () => {
      viewAngleIdx = (viewAngleIdx + 1) % presets.length;
      threeMap?.setCameraPreset(presets[viewAngleIdx]);
    });

    let zoomedIn = false;
    root.querySelector('#btnZoomToggle')?.addEventListener('click', () => {
      zoomedIn = !zoomedIn;
      if (threeMap && threeMap.camera && threeMap.controls) {
        if (zoomedIn) {
          threeMap.camera.position.multiplyScalar(0.7);
        } else {
          threeMap.camera.position.multiplyScalar(1.4);
        }
        threeMap.controls.update();
      }
    });

    root.querySelector('#btnLayersToggle')?.addEventListener('click', () => {
      if (threeMap) {
        threeMap.floorGrid.visible = !threeMap.floorGrid.visible;
      }
    });

    root.querySelector('#cameraPresetBar')?.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.id === 'btnFullscreen3D') {
        threeMap?.toggleFullscreen();
        return;
      }
      const preset = btn.dataset.preset;
      if (!preset) return;
      root.querySelectorAll('#cameraPresetBar button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      threeMap?.setCameraPreset(preset);
    });

    // 5. 2D SVG Edge Clicks & Scenario Control Buttons
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
      } else if (act === 'multi_obstacle') {
        const es = [...sim.graph.edges.values()].filter((x) => !x.blocked);
        for (let i = 0; i < 3 && es.length > 0; i++) {
          const idx = Math.floor(Math.random() * es.length);
          const e2 = es.splice(idx, 1)[0];
          if (e2) sim.toggleObstacle(e2.a, e2.b);
        }
      } else if (act === 'clear_obstacles') {
        const blocked = [...sim.graph.edges.values()].filter((x) => x.blocked);
        for (const e2 of blocked) {
          sim.toggleObstacle(e2.a, e2.b);
        }
      } else if (act === 'failure') {
        const live = sim.agents.filter((a) => a.status !== 'failed');
        const a = live[Math.floor(Math.random() * live.length)];
        if (a) sim.injectFailure(a.id);
      } else if (act === 'lowbatt') {
        const a = sim.agents.filter((x) => x.status !== 'failed').sort((x, y) => y.battery.soc - x.battery.soc)[0];
        if (a) sim.injectLowBattery(a.id);
      } else if (act === 'task') {
        const T = [
          { pickup: 'STOR-A1', dropoff: 'DROP-1', priority: 2, loadKg: 180 },
          { pickup: 'PICK-2', dropoff: 'PACK-2', priority: 1, loadKg: 140 },
          { pickup: 'STOR-B1', dropoff: 'PACK-1', priority: 3, loadKg: 260 },
        ];
        sim._spawnTask(T[Math.floor(Math.random() * T.length)]);
      }
    });

    root.querySelector('#dashFleetGrid')?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-dash-amr]');
      if (!btn) return;
      const amrId = btn.dataset.dashAmr;
      const a = sim.getAgent(amrId);
      if (a && a.status !== 'failed') {
        sim.stopAgent(amrId, a.status !== 'stopped');
      }
    });

    // Task Modal & Task Modification Wiring
    const taskModal = root.querySelector('#taskModalOverlay');
    const openModalBtn = root.querySelector('#btnOpenTaskModal');
    const closeModalBtn = root.querySelector('#btnCloseTaskModal');
    const saveTaskBtn = root.querySelector('#btnSaveTask');
    const pickupSelect = root.querySelector('#taskPickupSelect');
    const dropoffSelect = root.querySelector('#taskDropoffSelect');

    const populateTaskNodeDropdowns = () => {
      if (!pickupSelect || !dropoffSelect) return;
      const nodes = [...sim.graph.nodes.values()];
      const opts = nodes.map((n) => `<option value="${n.id}">${n.id} (${n.label})</option>`).join('');
      pickupSelect.innerHTML = opts;
      dropoffSelect.innerHTML = opts;
    };

    openModalBtn?.addEventListener('click', () => {
      populateTaskNodeDropdowns();
      root.querySelector('#taskModalTitle').innerHTML = '<i class="fas fa-plus-circle"></i> Create & Dispatch Custom Task';
      root.querySelector('#taskEditId').value = '';
      if (taskModal) taskModal.style.display = 'flex';
    });

    closeModalBtn?.addEventListener('click', () => {
      if (taskModal) taskModal.style.display = 'none';
    });

    saveTaskBtn?.addEventListener('click', () => {
      const editId = root.querySelector('#taskEditId').value;
      const pickup = pickupSelect.value;
      const dropoff = dropoffSelect.value;
      const priority = root.querySelector('#taskPrioritySelect').value;
      const loadKg = root.querySelector('#taskLoadKg').value || 180;

      if (!pickup || !dropoff) {
        alert('Please select both pickup and dropoff nodes.');
        return;
      }

      if (editId) {
        sim.updateTask(editId, { pickup, dropoff, priority, loadKg });
      } else {
        sim.addTask({ pickup, dropoff, priority, loadKg });
      }

      if (taskModal) taskModal.style.display = 'none';
    });

    root.querySelector('#taskList')?.addEventListener('click', (e) => {
      const btnEdit = e.target.closest('.btnEditTask');
      const btnCancel = e.target.closest('.btnCancelTask');

      if (btnEdit) {
        const taskId = btnEdit.dataset.taskId;
        const task = sim.tasks.find((t) => t.id === taskId);
        if (task) {
          populateTaskNodeDropdowns();
          root.querySelector('#taskModalTitle').innerHTML = `<i class="fas fa-pen"></i> Modify Task ${task.id}`;
          root.querySelector('#taskEditId').value = task.id;
          pickupSelect.value = task.pickup;
          dropoffSelect.value = task.dropoff;
          root.querySelector('#taskPrioritySelect').value = String(task.priority);
          root.querySelector('#taskLoadKg').value = String(task.loadKg);
          if (taskModal) taskModal.style.display = 'flex';
        }
      } else if (btnCancel) {
        const taskId = btnCancel.dataset.taskId;
        sim.cancelTask(taskId);
      }
    });

    return function update(sim) {
      // Update 2D SVG
      updateWarehouse(root, sim);

      // Update 3D WebGL Digital Twin
      if (threeMap) {
        threeMap.update(sim);
      }

      // Update KPIs
      const k = sim.kpis();
      setText(root, '#kpiCompleted', k.completed);
      const coll = root.querySelector('#kpiCollisions');
      if (coll) {
        coll.textContent = k.collisions;
        coll.classList.toggle('danger-text', k.collisions > 0);
        coll.classList.toggle('safe', k.collisions === 0);
      }
      setText(root, '#kpiThroughput', num(k.throughput, 2));
      const activeCount = sim.agents.filter((a) => a.status !== 'idle' && a.status !== 'charging' && a.status !== 'failed').length;
      setText(root, '#kpiActive', `${activeCount}/${sim.agents.length}`);
      setText(root, '#whBadge', sim.distributedMode ? 'DISTRIBUTED' : 'CENTRALISED');

      // Update SCADA SVG Ring Gauges
      const utilPct = Math.round((activeCount / Math.max(1, sim.agents.length)) * 100);
      const ringUtil = root.querySelector('#ringUtilization');
      if (ringUtil) {
        ringUtil.style.strokeDashoffset = String(251.2 * (1 - utilPct / 100));
      }
      setText(root, '#ringValUtil', `${utilPct}%`);

      const ringTput = root.querySelector('#ringThroughput');
      if (ringTput) {
        const tVal = Math.min(100, (k.throughput / 15) * 100);
        ringTput.style.strokeDashoffset = String(251.2 * (1 - tVal / 100));
      }
      setText(root, '#ringValTput', num(k.throughput, 1));

      // Tasks roster with Edit & Cancel actions
      const tasks = sim.tasks.filter((t) => t.status !== 'completed').slice(0, 12);
      setText(root, '#taskCount', sim.tasks.length);
      const tl = root.querySelector('#taskList');
      if (tl) {
        tl.innerHTML = tasks.length
          ? tasks
              .map(
                (t) => `
            <div class="msg-row" style="display:flex;justify-content:space-between;align-items:center;padding:5px 4px">
              <div style="flex:1">
                <div class="msg-head">
                  <span class="accent-text" style="font-weight:700">${t.id}</span>
                  <span class="status-pill ${t.status === 'unassigned' ? 'waiting_traffic' : 'moving'}" style="font-size:8.5px">${t.status === 'unassigned' ? 'queued' : esc(t.assignedAmrId || '')}</span>
                </div>
                <div class="msg-meta">${t.pickup} → ${t.dropoff} · ${t.loadKg}kg · P${t.priority}</div>
              </div>
              <div style="display:flex;gap:4px;margin-left:6px">
                <button class="btn btn-sm btnEditTask" data-task-id="${t.id}" style="padding:1px 5px;font-size:9px" title="Modify Task Target"><i class="fas fa-pen"></i></button>
                <button class="btn btn-sm btnCancelTask" data-task-id="${t.id}" style="padding:1px 5px;font-size:9px;color:var(--danger)" title="Cancel Task"><i class="fas fa-xmark"></i></button>
              </div>
            </div>`,
              )
              .join('')
          : '<div class="alerts-empty">Order book empty</div>';
      }

      // Update AMR Fleet Telemetry Roster
      const fg = root.querySelector('#dashFleetGrid');
      if (fg) {
        fg.innerHTML = sim.agents
          .map((a) => {
            const soc = a.battery.soc;
            const routeStr = `${a.pose.currentNodeId}${a.pose.targetNodeId ? ' → ' + a.pose.targetNodeId : ''}`;
            const cargoStr = a.payload.isLoaded ? `<span class="accent-text"><i class="fas fa-box"></i> ${a.payload.currentLoadKg}kg</span>` : '<span class="muted">Empty</span>';
            const speedStr = `${num(a.pose.velocity, 2)}m/s`;
            const motorOk = a.health.motorState === 'nominal';
            const lidarOk = a.health.lidarStatus === 'nominal';
            const btnText = a.status === 'failed' ? 'Fault' : a.status === 'stopped' ? 'Resume' : 'Hold';
            const btnClass = a.status === 'failed' ? '' : a.status === 'stopped' ? 'primary' : 'danger';

            return `
            <div class="card" style="padding:10px 12px;background:var(--bg-panel);margin:0">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <span style="font-weight:800;font-family:var(--font-mono);font-size:12px;display:flex;align-items:center;gap:5px">
                  <i class="fas fa-truck-ramp-box" style="color:var(--accent)"></i> ${a.id}
                </span>
                <span class="status-pill ${a.status}" style="font-size:8.5px">${STATUS_LABEL[a.status] || a.status}</span>
              </div>
              <div style="font-size:11px;line-height:1.4">
                <div style="display:flex;justify-content:space-between"><span class="muted">Node</span><span class="mono" style="font-weight:600">${routeStr}</span></div>
                <div style="display:flex;justify-content:space-between"><span class="muted">Speed / Cargo</span><span class="mono">${speedStr} · ${cargoStr}</span></div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:3px">
                  <span class="muted">Battery</span>
                  ${batteryHTML(soc)}
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;padding-top:4px;border-top:1px solid var(--border-color);font-size:10px">
                  <span style="display:flex;gap:7px;align-items:center">
                    <span title="Motor State" class="${motorOk ? 'safe' : 'danger-text'}"><i class="fas fa-microchip"></i> M</span>
                    <span title="LiDAR Sensors" class="${lidarOk ? 'safe' : 'danger-text'}"><i class="fas fa-wave-square"></i> L</span>
                    <span class="muted mono">${a.navigation.rerouteCount} reroutes</span>
                  </span>
                  <button class="btn ${btnClass}" data-dash-amr="${a.id}" style="padding:2px 6px;font-size:9.5px;height:20px" ${a.status === 'failed' ? 'disabled' : ''}>${btnText}</button>
                </div>
              </div>
            </div>`;
          })
          .join('');
      }

      // Update Intersection Token Locks
      const snap = sim.tokens.snapshot();
      setText(root, '#dashTokCount', `${snap.filter((z) => z.holder).length}/${snap.length} HELD`);
      const tg = root.querySelector('#dashTokenGrid');
      if (tg) {
        tg.innerHTML = snap
          .map((z) => {
            const isHeld = !!z.holder;
            const holderStr = isHeld
              ? `<span class="fifo-slot holder" style="padding:2px 6px;font-size:10px"><span class="pos">•</span>${short(z.holder)}</span>`
              : '<span class="fifo-empty" style="font-size:10px">clear</span>';
            const qStr = z.queue.length
              ? z.queue.map((e, i) => `<span class="fifo-slot" style="padding:2px 6px;font-size:10px"><span class="pos">${i + 1}</span>${short(e.amrId)}</span>`).join('')
              : '';
            return `
            <div class="zone-card ${isHeld ? 'held' : ''}" style="padding:8px 10px">
              <div class="zone-head" style="margin-bottom:4px">
                <span class="zone-name" style="font-size:11px"><i class="fas fa-diamond-turn-right" style="color:var(--warning)"></i> ${z.name.replace('INT-', 'INT ')}</span>
                <span class="card-badge ${isHeld ? 'danger' : 'success'}" style="font-size:8.5px">${isHeld ? 'OCCUPIED' : 'FREE'}</span>
              </div>
              <div class="fifo-queue" style="margin-top:4px">${holderStr}${qStr}</div>
            </div>`;
          })
          .join('');
      }

      // Update Live P2P Mesh Feed
      const mf = root.querySelector('#dashMsgFeed');
      if (mf) {
        const logs = sim.bus.log.slice(0, 10);
        mf.innerHTML = logs.length
          ? logs
              .map(
                (m) => `
            <div class="msg-row" style="padding:4px 2px">
              <div class="msg-head">
                <span class="accent-text" style="font-size:10.5px">${m.from} → ${m.to === 'BROADCAST' ? 'ALL' : m.to}</span>
                <span class="msg-type ${m.type}">${m.type.replace('_', ' ')}</span>
              </div>
              <div class="msg-meta">${esc(m.summary)} · RSSI ${m.rssi}dBm</div>
            </div>`,
              )
              .join('')
          : '<div class="alerts-empty">No gossip messages</div>';
      }
    };
  },
};

// ===========================================================================
//  2. FLEET MONITOR
// ===========================================================================
// ===========================================================================
//  2. FLEET MONITOR (Master Single-Screen Console)
// ===========================================================================
const socToVolt = (soc) => 22.0 + (soc / 100) * 3.6;

export const fleet = {
  title: 'Fleet Monitor',
  render() {
    return `
      <div class="card mb-14">
        <div class="card-header">
          <div class="card-title"><i class="fas fa-truck-ramp-box"></i> Master AMR Fleet Supervision Console</div>
          <div style="display:flex;align-items:center;gap:10px">
            <span class="hint" style="margin:0"><i class="fas fa-hand-pointer"></i> Select any robot row to inspect telemetry or issue movement commands</span>
            <span class="card-badge success">8 AMRS ONLINE</span>
          </div>
        </div>

        <div class="grid-2-13" style="gap:14px;align-items:start">
          <!-- LEFT: SINGLE-SCREEN MASTER FLEET ROSTER TABLE -->
          <div style="border:1px solid var(--border-color);border-radius:var(--radius-sm);overflow:hidden;background:var(--bg-panel)">
            <table class="data-table fleet-roster-table">
              <thead>
                <tr>
                  <th>AMR ID</th>
                  <th>Status</th>
                  <th>Location / Target</th>
                  <th>Speed</th>
                  <th>Battery</th>
                  <th>Payload</th>
                  <th>Sensors</th>
                </tr>
              </thead>
              <tbody id="fleetRosterBody"></tbody>
            </table>
          </div>

          <!-- RIGHT: SELECTED VEHICLE MOVEMENT & TELEMETRY INSPECTOR -->
          <div class="card" id="amrInspectorCard" style="background:var(--bg-panel);margin:0">
            <div id="amrInspectorContent"></div>
          </div>
        </div>
      </div>`;
  },
  mount(sim, root) {
    let selectedAmrId = 'AMR-01';

    // Roster row click listener to select AMR
    root.querySelector('#fleetRosterBody')?.addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-amr-id]');
      if (tr) {
        selectedAmrId = tr.dataset.amrId;
      }
    });

    // Inspector Action listener for Direct Movement Commands
    root.querySelector('#amrInspectorCard')?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-amr-act]');
      if (!btn) return;
      const act = btn.dataset.amrAct;
      const targetAmrId = btn.dataset.amrId || selectedAmrId;
      const a = sim.getAgent(targetAmrId);
      if (!a) return;

      if (act === 'send_charge') {
        const dock = sim.graph.nearestOfType(a.pose.currentNodeId, 'charging') || 'CHRG-1';
        a.navigation.phase = 'to_charge';
        a.status = 'moving';
        a.planTo(dock, sim);
        sim._pushAlert('info', 'Vehicle Motion', `${a.id} dispatched directly to Charge Dock ${dock}.`);
      } else if (act === 'force_reroute') {
        const dest = a.navigation.destinationNodeId || 'STOR-A1';
        a.status = 'moving';
        a.planTo(dest, sim);
        a.navigation.rerouteCount++;
        sim._pushAlert('info', 'Vehicle Reroute', `Forced local A* path re-planning for ${a.id}.`);
      } else if (act === 'toggle_hold') {
        sim.stopAgent(a.id, a.status !== 'stopped');
      } else if (act === 'toggle_fault') {
        if (a.status === 'failed') {
          a.health.motorState = 'nominal';
          a.health.lidarStatus = 'nominal';
          a.status = 'idle';
          sim._pushAlert('info', 'AMR Recovered', `${a.id} cleared of fault state & restored to service.`);
        } else {
          sim.injectFailure(a.id);
        }
      } else if (act === 'dispatch_node') {
        const sel = root.querySelector('#dispatchDestSelect');
        if (sel && sel.value) {
          a.status = 'moving';
          a.navigation.phase = 'manual_dispatch';
          a.planTo(sel.value, sim);
          sim._pushAlert('info', 'Direct Dispatch', `${a.id} commanded to move directly to node ${sel.value}.`);
        }
      }
    });

    return function update(sim) {
      const roster = root.querySelector('#fleetRosterBody');
      if (roster) {
        roster.innerHTML = sim.agents
          .map((a) => {
            const isSel = a.id === selectedAmrId;
            const soc = a.battery.soc;
            const routeStr = `${a.pose.currentNodeId}${a.pose.targetNodeId ? ' → ' + a.pose.targetNodeId : ''}`;
            const speedStr = `${num(a.pose.velocity, 2)} m/s`;
            const cargoStr = a.payload.isLoaded ? `${a.payload.currentLoadKg} kg` : 'empty';
            const motorOk = a.health.motorState === 'nominal';
            const lidarOk = a.health.lidarStatus === 'nominal';

            return `
            <tr data-amr-id="${a.id}" class="${isSel ? 'selected-roster-row' : ''}" style="cursor:pointer;background:${isSel ? 'rgba(9,105,218,0.22)' : 'transparent'};border-left:${isSel ? '4px solid var(--accent)' : '4px solid transparent'};transition:all 0.15s ease;">
              <td class="mono" style="font-weight:800;color:var(--accent)">
                <i class="fas fa-truck-ramp-box"></i> ${a.id}
              </td>
              <td><span class="status-pill ${a.status}" style="font-size:8.5px">${STATUS_LABEL[a.status] || a.status}</span></td>
              <td class="mono" style="font-size:11px">${routeStr}</td>
              <td class="mono" style="font-size:11px">${speedStr}</td>
              <td>${batteryHTML(soc)}</td>
              <td style="font-size:11px">${cargoStr}</td>
              <td>
                <span title="Motor"><i class="fas fa-microchip ${motorOk ? 'safe' : 'danger-text'}"></i></span>
                <span title="LiDAR"><i class="fas fa-wave-square ${lidarOk ? 'safe' : 'danger-text'}"></i></span>
              </td>
            </tr>`;
          })
          .join('');
      }

      // Update Inspector Panel for selectedAmrId
      const inspector = root.querySelector('#amrInspectorContent');
      if (inspector) {
        const a = sim.getAgent(selectedAmrId) || sim.agents[0];
        if (a) {
          const soc = a.battery.soc;
          const taskStr = a.task ? `${a.task.id} (${a.task.pickup} → ${a.task.dropoff})` : 'No Active Task';
          const isFailed = a.status === 'failed';
          const isStopped = a.status === 'stopped';

          inspector.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border-color)">
              <div>
                <span style="font-size:16px;font-weight:800;font-family:var(--font-display);color:var(--text-primary);display:flex;align-items:center;gap:8px">
                  <i class="fas fa-truck-ramp-box" style="color:var(--accent)"></i> ${a.id} Inspector
                </span>
                <span style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono)">Model: ${a.model} · Firmware v2.4</span>
              </div>
              <span class="status-pill ${a.status}">${STATUS_LABEL[a.status] || a.status}</span>
            </div>

            <!-- DIRECT MOVEMENT CONTROL ACTIONS -->
            <div style="margin-bottom:12px">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;letter-spacing:0.5px">
                <i class="fas fa-gamepad" style="color:var(--accent)"></i> Vehicle Movement Controls
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
                <button class="btn" data-amr-act="send_charge" data-amr-id="${a.id}">
                  <i class="fas fa-bolt" style="color:var(--accent)"></i> Dispatch Charge
                </button>
                <button class="btn" data-amr-act="force_reroute" data-amr-id="${a.id}">
                  <i class="fas fa-route" style="color:var(--info)"></i> Force Reroute
                </button>
                <button class="btn" data-amr-act="toggle_hold" data-amr-id="${a.id}" ${isFailed ? 'disabled' : ''}>
                  <i class="fas fa-${isStopped ? 'play' : 'pause'}" style="color:var(--warning)"></i> ${isStopped ? 'Resume' : 'Hold Position'}
                </button>
                <button class="btn ${isFailed ? 'primary' : 'danger'}" data-amr-act="toggle_fault" data-amr-id="${a.id}">
                  <i class="fas fa-${isFailed ? 'wrench' : 'power-off'}"></i> ${isFailed ? 'Clear Fault' : 'E-Stop Fault'}
                </button>
              </div>
            </div>

            <!-- DIRECT POINT-TO-POINT DISPATCH -->
            <div style="margin-bottom:12px;padding:8px;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:var(--radius-sm)">
              <div style="font-size:10.5px;font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:5px">
                <i class="fas fa-paper-plane" style="color:var(--accent)"></i> Direct Node Dispatch
              </div>
              <div style="display:flex;gap:6px">
                <select id="dispatchDestSelect" class="mono" style="flex:1;padding:4px 8px;font-size:11px;border:1px solid var(--border-color);border-radius:3px;background:var(--bg-panel);color:var(--text-primary)">
                  <option value="STOR-A">STOR-A (Storage Zone Alpha)</option>
                  <option value="STOR-B">STOR-B (Storage Zone Bravo)</option>
                  <option value="PICK-1">PICK-1 (Pick Station 1)</option>
                  <option value="PICK-2">PICK-2 (Pick Station 2)</option>
                  <option value="PACK-1">PACK-1 (Pack Line 1)</option>
                  <option value="PACK-2">PACK-2 (Pack Line 2)</option>
                  <option value="DROP-1">DROP-1 (Dispatch Bay 1)</option>
                  <option value="DROP-2">DROP-2 (Dispatch Bay 2)</option>
                  <option value="CHRG-1">CHRG-1 (Charge Dock 1)</option>
                  <option value="CHRG-2">CHRG-2 (Charge Dock 2)</option>
                </select>
                <button class="btn primary" data-amr-act="dispatch_node" data-amr-id="${a.id}" style="padding:4px 10px">Dispatch</button>
              </div>
            </div>

            <!-- LIDAR SWEEP VISUALIZER -->
            <div style="margin-bottom:12px">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;letter-spacing:0.5px">
                <i class="fas fa-wave-square" style="color:var(--accent)"></i> Forward LiDAR Sweep Radar
              </div>
              <div class="amr-feed" style="border-radius:var(--radius-sm)">
                <div class="lidar-view" style="aspect-ratio: 16/7">
                  ${!isFailed ? '<div class="lidar-sweep"></div>' : '<div style="color:var(--danger);font-size:11px;padding:20px;text-align:center">LiDAR Offline — Vehicle Faulted</div>'}
                </div>
              </div>
            </div>

            <!-- DETAILED EDGE TELEMETRY READOUT -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:11px">
              <div style="background:var(--bg-secondary);padding:6px 8px;border-radius:4px;border:1px solid var(--border-color)">
                <span class="muted">Battery Voltage</span><br>
                <span class="mono" style="font-weight:700">${num(socToVolt(soc), 1)} V (${num(soc)}%)</span>
              </div>
              <div style="background:var(--bg-secondary);padding:6px 8px;border-radius:4px;border:1px solid var(--border-color)">
                <span class="muted">Speed / Heading</span><br>
                <span class="mono" style="font-weight:700">${num(a.pose.velocity, 2)} m/s · ${num(a.pose.headingDeg, 0)}°</span>
              </div>
              <div style="background:var(--bg-secondary);padding:6px 8px;border-radius:4px;border:1px solid var(--border-color)">
                <span class="muted">Payload Load</span><br>
                <span class="mono" style="font-weight:700">${a.payload.isLoaded ? a.payload.currentLoadKg + ' kg' : 'Empty'}</span>
              </div>
              <div style="background:var(--bg-secondary);padding:6px 8px;border-radius:4px;border:1px solid var(--border-color)">
                <span class="muted">Nearby P2P Peers</span><br>
                <span class="mono" style="font-weight:700">${a.coordination.nearbyPeers.length} active</span>
              </div>
            </div>

            <div style="margin-top:8px;font-size:10.5px;color:var(--text-muted);background:var(--bg-secondary);padding:6px 8px;border-radius:4px;border:1px solid var(--border-color)">
              <span class="muted">Task Assignment</span><br>
              <span class="mono accent-text">${esc(taskStr)}</span>
            </div>`;
        }
      }
    };
  },
};

// ===========================================================================
//  3. P2P MESH (V2V)
// ===========================================================================
export const v2v = {
  title: 'P2P Mesh',
  render(sim) {
    return `
      <h2 class="section-title"><i class="fas fa-tower-broadcast"></i> Robot-to-Robot Adaptive P2P Mesh Network</h2>
      <div class="section-sub">Live spatial RF gossip matrix — direct vehicle-to-vehicle heartbeats, token negotiation, and obstacle alerts without central server latency.</div>
      <div class="grid-4 mb-14">
        ${kpiCard('cyan', 'fa-satellite-dish', 'meshSent', '0', 'Messages Transmitted')}
        ${kpiCard('blue', 'fa-stopwatch', 'meshLat', '0', 'Avg Bus Latency (ms)')}
        ${kpiCard('amber', 'fa-wifi', 'meshDrop', '0', 'Packet Drop Rate %')}
        ${kpiCard('green', 'fa-share-nodes', 'meshRange', '0', 'Active Spatial Links')}
      </div>
      <div class="grid-2-13">
        <div class="card">
          <div class="card-header">
            <div class="card-title"><i class="fas fa-network-wired"></i> Real-Time Spatial Mesh Floor Plan</div>
            <span class="card-badge success"><i class="fas fa-tower-broadcast"></i> ADAPTIVE RF MESH</span>
          </div>
          <div class="mesh-view" id="meshView" style="min-height:360px;position:relative;background:#ffffff;border:1px solid var(--border-color);overflow:hidden"></div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title"><i class="fas fa-scroll"></i> Live RF Packet Feed</div></div>
          <div class="msg-feed" id="msgFeed" style="max-height:360px"></div>
        </div>
      </div>`;
  },
  mount(sim, root) {
    return function update(sim) {
      const k = sim.kpis();
      setText(root, '#meshSent', k.messages);
      setText(root, '#meshLat', num(k.avgLatency, 1));
      setText(root, '#meshDrop', num(k.dropRate * 100, 1));

      const liveAgents = sim.agents;
      const p2pRange = sim.config.p2pRangeM || 30;
      let links = 0;

      for (let i = 0; i < liveAgents.length; i++) {
        for (let j = i + 1; j < liveAgents.length; j++) {
          const d = Math.hypot(liveAgents[i].pose.x - liveAgents[j].pose.x, liveAgents[i].pose.y - liveAgents[j].pose.y);
          if (d <= p2pRange && liveAgents[i].status !== 'failed' && liveAgents[j].status !== 'failed') links++;
        }
      }
      setText(root, '#meshRange', links);

      // Render Spatial Adaptive Mesh topology matching real-time warehouse coordinates
      const mv = root.querySelector('#meshView');
      if (mv) {
        const recent = new Set(sim.bus.log.slice(0, 3).map((m) => m.from));
        let nodesHTML = '';
        let linksSVG = '<svg style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none" viewBox="0 0 160 100" preserveAspectRatio="xMidYMid meet">';

        // Draw dynamic RF link lines
        for (let i = 0; i < liveAgents.length; i++) {
          for (let j = i + 1; j < liveAgents.length; j++) {
            const a1 = liveAgents[i];
            const a2 = liveAgents[j];
            if (a1.status === 'failed' || a2.status === 'failed') continue;
            const dist = Math.hypot(a1.pose.x - a2.pose.x, a1.pose.y - a2.pose.y);
            if (dist <= p2pRange) {
              const rssi = Math.round(-40 - (dist / p2pRange) * 45);
              const signalRatio = Math.max(0.15, 1 - dist / p2pRange);
              const opacity = (signalRatio * 0.85).toFixed(2);
              const isTx = recent.has(a1.id) || recent.has(a2.id);
              const strokeColor = isTx ? '#1a7f37' : '#0969da';

              linksSVG += `<line x1="${a1.pose.x.toFixed(1)}" y1="${a1.pose.y.toFixed(1)}" x2="${a2.pose.x.toFixed(1)}" y2="${a2.pose.y.toFixed(1)}" stroke="${strokeColor}" stroke-width="${isTx ? 0.9 : 0.4}" stroke-dasharray="1 1" opacity="${opacity}"/>`;
              const midX = (a1.pose.x + a2.pose.x) / 2;
              const midY = (a1.pose.y + a2.pose.y) / 2;
              linksSVG += `<text x="${midX.toFixed(1)}" y="${midY.toFixed(1)}" fill="#475569" font-size="1.4" font-family="var(--font-mono)" text-anchor="middle">${rssi}dBm</text>`;
            }
          }
        }
        linksSVG += '</svg>';

        // Draw nodes positioned at physical coordinates
        for (const a of liveAgents) {
          const posX = ((a.pose.x / 160) * 88 + 6).toFixed(1);
          const posY = ((a.pose.y / 100) * 84 + 8).toFixed(1);
          const isTx = recent.has(a.id);
          const isFailed = a.status === 'failed';

          nodesHTML += `
            <div class="comm-node ${isTx ? 'tx' : ''}" data-id="${a.id}" style="left:${posX}%;top:${posY}%;opacity:${isFailed ? 0.35 : 1};z-index:2">
              <span style="font-weight:800;font-size:10px">${short(a.id)}</span>
              <small data-soc>${num(a.battery.soc)}%</small>
            </div>`;
        }

        mv.innerHTML = linksSVG + nodesHTML;
      }

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
      const stopBtn = e.target.closest('button[data-stop]');
      if (stopBtn) {
        const a = sim.getAgent(stopBtn.dataset.stop);
        if (a && a.status !== 'failed') sim.stopAgent(a.id, a.status !== 'stopped');
        return;
      }
      const failBtn = e.target.closest('button[data-fail]');
      if (failBtn) {
        const amrId = failBtn.dataset.fail;
        const a = sim.getAgent(amrId);
        if (a) {
          if (a.status === 'failed') {
            a.health.motorState = 'nominal';
            a.health.lidarStatus = 'nominal';
            a.status = 'idle';
            sim._pushAlert('info', 'AMR Recovered', `${a.id} fault cleared — restored to autonomous service.`);
            sim._emit();
          } else {
            sim.injectFailure(amrId);
          }
        }
      }
    });

    return function update(sim) {
      const kb = root.querySelector('#killBtn');
      const st = root.querySelector('#estopStatus');
      if (kb) kb.classList.toggle('active', !!sim.estopActive);
      if (st) {
        st.textContent = sim.estopActive ? 'ACTIVATED' : 'ARMED';
        st.className = `card-badge ${sim.estopActive ? 'danger' : 'success'}`;
      }
      const list = root.querySelector('#amrStopList');
      if (list) {
        list.innerHTML = sim.agents
          .map((a) => {
            const isFailed = a.status === 'failed';
            const isStopped = a.status === 'stopped';
            const failBtnText = isFailed ? 'Recover' : 'Fault';
            const failBtnClass = isFailed ? 'btn primary' : 'btn danger';

            return `
            <div class="toggle-row" style="padding:10px 4px">
              <div class="toggle-label">
                <div style="display:flex;gap:8px;align-items:center">
                  <span style="font-weight:800;font-family:var(--font-mono);font-size:13px;color:var(--text-primary)">${a.id}</span>
                  <span class="status-pill ${a.status}" style="font-size:8.5px">${STATUS_LABEL[a.status] || a.status}</span>
                </div>
                <div class="muted mono" style="font-size:10.5px;margin-top:2px">
                  Node: <b>${a.pose.currentNodeId}${a.pose.targetNodeId ? ' → ' + a.pose.targetNodeId : ''}</b> · Battery <b>${num(a.battery.soc)}%</b>
                </div>
              </div>
              <div style="display:flex;gap:6px;align-items:center">
                <button class="btn ${isStopped ? 'primary' : ''}" data-stop="${a.id}" ${isFailed ? 'disabled' : ''} style="min-width:72px">
                  <i class="fas fa-${isStopped ? 'play' : 'pause'}"></i> ${isStopped ? 'Resume' : 'Stop'}
                </button>
                <button class="${failBtnClass}" data-fail="${a.id}" style="min-width:72px">
                  <i class="fas fa-${isFailed ? 'wrench' : 'power-off'}"></i> ${failBtnText}
                </button>
              </div>
            </div>`;
          })
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
      <div class="section-sub">Real-time forward LiDAR point-cloud sweep and onboard sensor telemetry for each AMR edge node.</div>
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


