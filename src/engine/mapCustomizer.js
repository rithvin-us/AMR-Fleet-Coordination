// =============================================================================
//  mapCustomizer.js — Interactive Warehouse Map Graph Customizer & Aisle Generator
//
//  Provides industrial graph customization capabilities:
//  - 1-Click Aisle Array Generator (multi-rack storage corridors)
//  - Add, edit, remove nodes (Junctions, Storage Racks, Pallet Trays, Charging)
//  - Add, edit, remove pathway edges with custom speed limits
//  - Define protected FIFO intersection zones
//  - Export current warehouse topology as Production JSON
//  - Import custom layout JSON files with live hot-reloading
// =============================================================================

import { NODES as SEED_NODES, EDGES as SEED_EDGES, ZONES as SEED_ZONES, FACTORY_BRANCHES } from '../data.js';
import { WarehouseGraph } from './graph.js';

export class MapCustomizer {
  constructor(sim) {
    this.sim = sim;
  }

  // ---------------------------------------------------------------------------
  // 1-Click Multi-Rack Storage Aisle Array Generator
  // ---------------------------------------------------------------------------
  generateAisleArray({ prefix = 'AISLE', rowY = 44, startX = 20, count = 4, spacingX = 28, type = 'storage' }) {
    const currentNodes = [...this.sim.graph.nodes.values()];
    const currentEdgesMap = new Map([...this.sim.graph.edges.values()].map((e) => [e.key, [e.a, e.b, { speed: e.speed }]]));
    const currentZones = this.sim.graph.zones || [];

    const newNodes = [];
    const newEdges = [];
    let prevNodeId = null;

    for (let i = 0; i < count; i++) {
      const nodeId = `${prefix}-${i + 1}`;
      const x = startX + i * spacingX;
      const label = `Rack ${prefix} ${i + 1}`;

      if (!this.sim.graph.nodes.has(nodeId)) {
        const nObj = { id: nodeId, x, y: Number(rowY), type, label, capacity: 1 };
        currentNodes.push(nObj);
        newNodes.push(nObj);
      }

      if (prevNodeId) {
        const edgeKey = WarehouseGraph.edgeKey(prevNodeId, nodeId);
        currentEdgesMap.set(edgeKey, [prevNodeId, nodeId, { speed: 1.6 }]);
        newEdges.push([prevNodeId, nodeId]);
      }
      prevNodeId = nodeId;
    }

    this.sim.graph = new WarehouseGraph(currentNodes, [...currentEdgesMap.values()], currentZones);
    this.sim._syncGraphState();
    return { newNodes, newEdges };
  }

  // ---------------------------------------------------------------------------
  // Single Node & Edge Mutations
  // ---------------------------------------------------------------------------
  addNode(nodeData) {
    const { id, x, y, type = 'junction', label } = nodeData;
    if (!id || this.sim.graph.nodes.has(id)) {
      throw new Error(`Node ID "${id}" already exists or is invalid.`);
    }

    const newNode = {
      id,
      x: Number(x),
      y: Number(y),
      type,
      label: label || id,
      capacity: type === 'intersection' ? 1 : 2,
    };

    const currentNodes = [...this.sim.graph.nodes.values(), newNode];
    const currentEdges = [...this.sim.graph.edges.values()].map((e) => [e.a, e.b, { speed: e.speed }]);
    const currentZones = this.sim.graph.zones || [];

    this.sim.graph = new WarehouseGraph(currentNodes, currentEdges, currentZones);
    this.sim._syncGraphState();
    return newNode;
  }

  removeNode(nodeId) {
    if (!this.sim.graph.nodes.has(nodeId)) return;

    const currentNodes = [...this.sim.graph.nodes.values()].filter((n) => n.id !== nodeId);
    const currentEdges = [...this.sim.graph.edges.values()]
      .filter((e) => e.a !== nodeId && e.b !== nodeId)
      .map((e) => [e.a, e.b, { speed: e.speed }]);
    const currentZones = this.sim.graph.zones || [];

    this.sim.graph = new WarehouseGraph(currentNodes, currentEdges, currentZones);
    this.sim._syncGraphState();
  }

  addEdge(a, b, speed = 1.5) {
    if (!this.sim.graph.nodes.has(a) || !this.sim.graph.nodes.has(b)) {
      throw new Error(`Cannot add edge: Nodes "${a}" or "${b}" do not exist.`);
    }

    const currentNodes = [...this.sim.graph.nodes.values()];
    const edgeKey = WarehouseGraph.edgeKey(a, b);
    const currentEdgesMap = new Map([...this.sim.graph.edges.values()].map((e) => [e.key, [e.a, e.b, { speed: e.speed }]]));
    currentEdgesMap.set(edgeKey, [a, b, { speed: Number(speed) }]);

    const currentZones = this.sim.graph.zones || [];
    this.sim.graph = new WarehouseGraph(currentNodes, [...currentEdgesMap.values()], currentZones);
    this.sim._syncGraphState();
  }

  removeEdge(a, b) {
    const targetKey = WarehouseGraph.edgeKey(a, b);
    const currentNodes = [...this.sim.graph.nodes.values()];
    const currentEdges = [...this.sim.graph.edges.values()]
      .filter((e) => e.key !== targetKey)
      .map((e) => [e.a, e.b, { speed: e.speed }]);
    const currentZones = this.sim.graph.zones || [];

    this.sim.graph = new WarehouseGraph(currentNodes, currentEdges, currentZones);
    this.sim._syncGraphState();
  }

  // ---------------------------------------------------------------------------
  // Layout JSON Import / Export
  // ---------------------------------------------------------------------------
  exportLayoutJSON() {
    const nodes = [...this.sim.graph.nodes.values()].map((n) => ({
      id: n.id,
      x: n.x,
      y: n.y,
      type: n.type,
      label: n.label,
    }));

    const edges = [...this.sim.graph.edges.values()].map((e) => [
      e.a,
      e.b,
      { speed: e.speed },
    ]);

    const zones = this.sim.graph.zones || [];

    const layoutObj = {
      version: '2.5.0',
      timestamp: new Date().toISOString(),
      nodes,
      edges,
      zones,
    };

    return JSON.stringify(layoutObj, null, 2);
  }

  importLayoutJSON(jsonString) {
    try {
      const data = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
      if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
        throw new Error('Invalid layout format: JSON must contain "nodes" and "edges" arrays.');
      }

      this.sim.graph = new WarehouseGraph(data.nodes, data.edges, data.zones || []);
      this.sim._syncGraphState();
      return true;
    } catch (err) {
      console.error('Layout import failed:', err);
      throw err;
    }
  }

  resetToDefaultLayout() {
    this.sim.graph = new WarehouseGraph(SEED_NODES, SEED_EDGES, SEED_ZONES);
    this.sim._syncGraphState();
  }

  // ---------------------------------------------------------------------------
  // Map Customizer Drawer HTML Component
  // ---------------------------------------------------------------------------
  renderCustomizerDrawerHTML() {
    const nodes = [...this.sim.graph.nodes.values()];
    const edges = [...this.sim.graph.edges.values()];

    return `
    <div class="customizer-drawer" id="customizerDrawer">
      <div class="customizer-header">
        <div class="customizer-title"><i class="fas fa-sliders" style="color:var(--accent)"></i> Warehouse Map Customizer</div>
        <button class="btn btn-sm btn-icon" id="btnCloseCustomizer"><i class="fas fa-xmark"></i></button>
      </div>

      <div class="customizer-tabs">
        <button class="cust-tab active" data-tab="branch"><i class="fas fa-building-user"></i> Branches</button>
        <button class="cust-tab" data-tab="aisle"><i class="fas fa-cubes"></i> Aisles</button>
        <button class="cust-tab" data-tab="node"><i class="fas fa-plus-circle"></i> Nodes/Edges</button>
        <button class="cust-tab" data-tab="json"><i class="fas fa-file-code"></i> JSON</button>
      </div>

      <div class="customizer-body">
        <!-- TAB 0: Enterprise Factory Branch Presets -->
        <div class="cust-tab-content active" id="tabBranch">
          <div class="customizer-section">
            <div class="customizer-section-title"><i class="fas fa-network-wired"></i> Multi-Factory Enterprise Branch Topology</div>
            <div class="hint mb-14">SaaS multi-tenant business model: switch active topology models across global factory branches.</div>
            <div style="display:flex;flex-direction:column;gap:8px">
              ${Object.values(FACTORY_BRANCHES).map((b) => `
                <button class="btn btn-sm btnBranchSelect ${this.sim.activeBranchId === b.id ? 'primary' : ''}" data-branch-id="${b.id}" style="justify-content:space-between;text-align:left;padding:8px 10px;">
                  <div>
                    <div style="font-weight:700">${b.name}</div>
                    <div style="font-size:9.5px;opacity:0.75" class="mono">${b.type} · ${b.region}</div>
                  </div>
                  <i class="fas fa-chevron-right"></i>
                </button>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- TAB 1: 1-Click Aisle Generator -->
        <div class="cust-tab-content" id="tabAisle" style="display:none">
          <div class="customizer-section">
            <div class="customizer-section-title"><i class="fas fa-wand-magic-sparkles"></i> 1-Click Storage Aisle Generator</div>
            <div class="hint mb-14">Spawn multi-tier storage rack corridors with auto-linked topological nodes.</div>
            <div class="customizer-grid mb-6">
              <div>
                <label style="font-size:10px;color:var(--text-muted)">Aisle Prefix</label>
                <input type="text" id="aislePrefix" class="input-sm" value="AISLE-C" placeholder="AISLE-C">
              </div>
              <div>
                <label style="font-size:10px;color:var(--text-muted)">Row Y Position (m)</label>
                <input type="number" id="aisleRowY" class="input-sm" value="44" min="10" max="90">
              </div>
              <div>
                <label style="font-size:10px;color:var(--text-muted)">Number of Racks</label>
                <input type="number" id="aisleCount" class="input-sm" value="5" min="2" max="10">
              </div>
              <div>
                <label style="font-size:10px;color:var(--text-muted)">Rack Spacing (m)</label>
                <input type="number" id="aisleSpacing" class="input-sm" value="24" min="10" max="50">
              </div>
            </div>
            <button class="btn btn-primary btn-sm w-full mt-6" id="btnGenerateAisle"><i class="fas fa-plus"></i> Spawn Storage Aisle Corridor</button>
          </div>
        </div>

        <!-- TAB 2: Single Node & Edge Editor -->
        <div class="cust-tab-content" id="tabNode" style="display:none">
          <div class="customizer-section">
            <div class="customizer-section-title"><i class="fas fa-circle-plus"></i> Add New Single Node</div>
            <div class="customizer-grid">
              <input type="text" id="custNodeId" class="input-sm" placeholder="Node ID (e.g. N99)">
              <select id="custNodeType" class="select-sm">
                <option value="junction">Junction (J)</option>
                <option value="storage">Storage Rack / Pallet Tray</option>
                <option value="pickup">Pick Station</option>
                <option value="packing">Pack Line</option>
                <option value="dropoff">Dispatch Dock</option>
                <option value="charging">Charging Dock</option>
                <option value="intersection">FIFO Intersection</option>
              </select>
              <input type="number" id="custNodeX" class="input-sm" placeholder="X (0-160m)" min="0" max="160">
              <input type="number" id="custNodeY" class="input-sm" placeholder="Y (0-100m)" min="0" max="100">
            </div>
            <button class="btn btn-primary btn-sm w-full mt-6" id="btnAddNode"><i class="fas fa-plus"></i> Create Node</button>
          </div>

          <div class="customizer-section">
            <div class="customizer-section-title"><i class="fas fa-link"></i> Connect Pathway Edge</div>
            <div class="customizer-grid">
              <select id="custEdgeA" class="select-sm">
                ${nodes.map((n) => `<option value="${n.id}">From: ${n.id} (${n.label})</option>`).join('')}
              </select>
              <select id="custEdgeB" class="select-sm">
                ${nodes.map((n) => `<option value="${n.id}">To: ${n.id} (${n.label})</option>`).join('')}
              </select>
            </div>
            <div class="customizer-flex mt-6">
              <input type="number" id="custEdgeSpeed" class="input-sm" placeholder="Speed Limit (m/s)" value="1.8" step="0.1">
              <button class="btn btn-secondary btn-sm" id="btnAddEdge"><i class="fas fa-route"></i> Connect Edge</button>
            </div>
          </div>
        </div>

        <!-- TAB 3: Layout JSON Config -->
        <div class="cust-tab-content" id="tabJson" style="display:none">
          <div class="customizer-section">
            <div class="customizer-section-title"><i class="fas fa-file-code"></i> Topology JSON Config</div>
            <div class="customizer-btn-group">
              <button class="btn btn-sm" id="btnExportJSON"><i class="fas fa-download"></i> Export JSON</button>
              <label class="btn btn-sm" for="fileImportJSON" style="cursor:pointer"><i class="fas fa-upload"></i> Import JSON</label>
              <input type="file" id="fileImportJSON" accept=".json" style="display:none">
              <button class="btn btn-sm btn-danger" id="btnResetDefaultLayout"><i class="fas fa-rotate-left"></i> Reset Seed</button>
            </div>
            <textarea id="custJSONArea" class="customizer-json-area" placeholder="JSON topology string..." rows="5"></textarea>
            <button class="btn btn-sm btn-primary w-full mt-6" id="btnApplyJSONText"><i class="fas fa-check"></i> Apply JSON Text</button>
          </div>
        </div>

        <!-- Existing Elements Summary List -->
        <div class="customizer-section">
          <div class="customizer-section-title"><i class="fas fa-list"></i> Spatial Topology Graph (${nodes.length} Nodes, ${edges.length} Edges)</div>
          <div class="customizer-list">
            ${edges.map((e) => `
              <div class="customizer-item">
                <span><i class="fas fa-ruler-combined" style="color:var(--accent)"></i> <b>${e.a}</b> &hArr; <b>${e.b}</b> (${e.speed}m/s)</span>
                <button class="btn-icon-danger btnDeleteEdge" data-a="${e.a}" data-b="${e.b}"><i class="fas fa-trash"></i></button>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>`;
  }

  // ---------------------------------------------------------------------------
  // Event Binding
  // ---------------------------------------------------------------------------
  bindCustomizerEvents(containerElement, onLayoutChanged) {
    const el = containerElement;
    if (!el) return;

    // Tab Switching
    el.querySelectorAll('.cust-tab').forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        el.querySelectorAll('.cust-tab').forEach((b) => b.classList.remove('active'));
        el.querySelectorAll('.cust-tab-content').forEach((c) => (c.style.display = 'none'));
        tabBtn.classList.add('active');
        const targetTab = tabBtn.dataset.tab;
        if (targetTab === 'branch') el.querySelector('#tabBranch').style.display = 'block';
        if (targetTab === 'aisle') el.querySelector('#tabAisle').style.display = 'block';
        if (targetTab === 'node') el.querySelector('#tabNode').style.display = 'block';
        if (targetTab === 'json') el.querySelector('#tabJson').style.display = 'block';
      });
    });

    // Branch Preset Switching
    el.querySelectorAll('.btnBranchSelect').forEach((btn) => {
      btn.addEventListener('click', () => {
        const branchId = btn.dataset.branchId;
        if (branchId && this.sim.switchFactoryBranch(branchId)) {
          if (onLayoutChanged) onLayoutChanged();
        }
      });
    });

    // Generate Storage Aisle Array
    el.querySelector('#btnGenerateAisle')?.addEventListener('click', () => {
      try {
        const prefix = el.querySelector('#aislePrefix').value.trim() || 'AISLE-C';
        const rowY = el.querySelector('#aisleRowY').value || 44;
        const count = parseInt(el.querySelector('#aisleCount').value || '5', 10);
        const spacingX = parseInt(el.querySelector('#aisleSpacing').value || '24', 10);

        this.generateAisleArray({ prefix, rowY, count, spacingX, type: 'storage' });
        if (onLayoutChanged) onLayoutChanged();
      } catch (err) {
        alert('Aisle Generation error: ' + err.message);
      }
    });

    // Add Node
    el.querySelector('#btnAddNode')?.addEventListener('click', () => {
      try {
        const id = el.querySelector('#custNodeId').value.trim();
        const type = el.querySelector('#custNodeType').value;
        const x = el.querySelector('#custNodeX').value;
        const y = el.querySelector('#custNodeY').value;

        if (!id || !x || !y) {
          alert('Please fill in Node ID, X, and Y coordinates.');
          return;
        }

        this.addNode({ id, type, x, y, label: id });
        if (onLayoutChanged) onLayoutChanged();
      } catch (err) {
        alert(err.message);
      }
    });

    // Add Edge
    el.querySelector('#btnAddEdge')?.addEventListener('click', () => {
      try {
        const a = el.querySelector('#custEdgeA').value;
        const b = el.querySelector('#custEdgeB').value;
        const speed = el.querySelector('#custEdgeSpeed').value || 1.8;

        if (a === b) {
          alert('Cannot connect a node to itself.');
          return;
        }

        this.addEdge(a, b, speed);
        if (onLayoutChanged) onLayoutChanged();
      } catch (err) {
        alert(err.message);
      }
    });

    // Delete Edge
    el.querySelectorAll('.btnDeleteEdge').forEach((btn) => {
      btn.addEventListener('click', () => {
        const a = btn.dataset.a;
        const b = btn.dataset.b;
        this.removeEdge(a, b);
        if (onLayoutChanged) onLayoutChanged();
      });
    });

    // Export JSON
    el.querySelector('#btnExportJSON')?.addEventListener('click', () => {
      const json = this.exportLayoutJSON();
      el.querySelector('#custJSONArea').value = json;
      
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `warehouse_layout_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    // Apply JSON Text
    el.querySelector('#btnApplyJSONText')?.addEventListener('click', () => {
      try {
        const txt = el.querySelector('#custJSONArea').value;
        if (!txt) return;
        this.importLayoutJSON(txt);
        if (onLayoutChanged) onLayoutChanged();
      } catch (err) {
        alert('Invalid JSON topology string: ' + err.message);
      }
    });

    // File Import JSON
    el.querySelector('#fileImportJSON')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          this.importLayoutJSON(evt.target.result);
          if (onLayoutChanged) onLayoutChanged();
        } catch (err) {
          alert('Import failed: ' + err.message);
        }
      };
      reader.readAsText(file);
    });

    // Reset Default
    el.querySelector('#btnResetDefaultLayout')?.addEventListener('click', () => {
      if (confirm('Reset graph layout to default factory seed?')) {
        this.resetToDefaultLayout();
        if (onLayoutChanged) onLayoutChanged();
      }
    });
  }
}
