// =============================================================================
//  threeMap.js — 3D Cyber-Industrial WebGL Digital Twin Engine (Three.js)
//  
//  Renders real-time 3D SCADA warehouse digital twin:
//  - Hardware-accelerated WebGL rendering with 360° OrbitControls
//  - Realistic 3D Industrial Forklifts (elevating mast, forks, cabin cage, beacon) & AMRs
//  - 3D Extruded Industrial Storage Racks, Pallet Trays & Workstations
//  - Glowing dynamic pathway graph ribbons (Clear / Busy / Blocked)
//  - Volumetric P2P Laser Mesh links between vehicles in RF range
//  - Raycasting for edge obstacle toggle & vehicle selection
//  - Fullscreen / Widescreen Viewport Expansion
// =============================================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class ThreeWarehouseMap {
  constructor(containerElement, onEdgeClick, onObjectSelect) {
    this.container = containerElement;
    this.onEdgeClick = onEdgeClick;
    this.onObjectSelect = onObjectSelect;

    this.width = this.container.clientWidth || 800;
    this.height = this.container.clientHeight || 500;

    // Scene & Renderer Setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x040d1a);
    this.scene.fog = new THREE.FogExp2(0x040d1a, 0.003);

    this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 1, 1000);
    this.camera.position.set(0, 95, 90);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.container.replaceChildren(this.renderer.domElement);

    // Orbit Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02; // Don't clip below floor
    this.controls.minDistance = 15;
    this.controls.maxDistance = 300;
    this.controls.target.set(0, 0, 0);

    // Lighting
    this.initLighting();

    // Scene Groups
    this.floorGroup = new THREE.Group();
    this.graphGroup = new THREE.Group();
    this.facilityGroup = new THREE.Group();
    this.amrGroup = new THREE.Group();
    this.meshGroup = new THREE.Group();
    this.raycastGroup = new THREE.Group();

    this.scene.add(this.floorGroup);
    this.scene.add(this.graphGroup);
    this.scene.add(this.facilityGroup);
    this.scene.add(this.amrGroup);
    this.scene.add(this.meshGroup);
    this.scene.add(this.raycastGroup);

    // Dynamic Objects Cache
    this.amrMeshes = new Map(); // amrId -> record
    this.edgeMeshes = new Map(); // edgeKey -> record
    this.nodeMeshes = new Map(); // nodeId -> record

    // Interactive Raycaster
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.setupInteractivity();

    // Build Floor & Environmental Decor
    this.buildFloor();

    // Resize Handler
    this.handleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.handleResize);

    // Animation Loop
    this.isAnimRunning = true;
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  // Map graph coordinates (160x100) to Three.js world space (Center at 0,0,0)
  mapToWorld(x, y, elevation = 0) {
    return new THREE.Vector3(x - 80, elevation, y - 50);
  }

  initLighting() {
    const ambient = new THREE.AmbientLight(0x1e293b, 2.0);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0x00f2ff, 1.4);
    dirLight.position.set(50, 120, 60);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 10;
    dirLight.shadow.camera.far = 300;
    dirLight.shadow.camera.left = -100;
    dirLight.shadow.camera.right = 100;
    dirLight.shadow.camera.top = 70;
    dirLight.shadow.camera.bottom = -70;
    this.scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x3b82f6, 0.7);
    fillLight.position.set(-70, 50, -60);
    this.scene.add(fillLight);

    const centerPoint = new THREE.PointLight(0x00f2ff, 1.0, 140);
    centerPoint.position.set(0, 20, 0);
    this.scene.add(centerPoint);
  }

  buildFloor() {
    // Large Cyber metallic floor plane (220x160)
    const floorGeo = new THREE.PlaneGeometry(220, 160);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x040e1e,
      roughness: 0.25,
      metalness: 0.85,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.1;
    floor.receiveShadow = true;
    this.floorGroup.add(floor);

    // Glowing Cyber Grid Overlay
    const gridHelper = new THREE.GridHelper(220, 44, 0x00f2ff, 0x1e293b);
    gridHelper.position.y = 0.01;
    gridHelper.material.opacity = 0.3;
    gridHelper.material.transparent = true;
    this.floorGroup.add(gridHelper);

    // Outer Facility Boundary Perimeter Guard Frame
    const frameGeo = new THREE.BoxGeometry(164, 1.2, 104);
    const frameMat = new THREE.MeshBasicMaterial({ color: 0x00f2ff, wireframe: true });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.set(0, 0.6, 0);
    this.floorGroup.add(frame);
  }

  // ---------------------------------------------------------------------------
  // Build 3D Warehouse Scene Graph (Nodes, Edges, Racks, Stations, Pallet Trays)
  // ---------------------------------------------------------------------------
  buildSceneGraph(graph) {
    this.graphGroup.clear();
    this.facilityGroup.clear();
    this.raycastGroup.clear();
    this.edgeMeshes.clear();
    this.nodeMeshes.clear();

    // 1. Build Edges (Pathways)
    for (const edge of graph.edges.values()) {
      const na = graph.getNode(edge.a);
      const nb = graph.getNode(edge.b);
      if (!na || !nb) continue;

      const pA = this.mapToWorld(na.x, na.y, 0.15);
      const pB = this.mapToWorld(nb.x, nb.y, 0.15);

      const pathVec = new THREE.Vector3().subVectors(pB, pA);
      const length = pathVec.length();
      const midPoint = new THREE.Vector3().addVectors(pA, pB).multiplyScalar(0.5);

      // Pathway Ribbon Mesh
      const ribbonGeo = new THREE.BoxGeometry(1.0, 0.06, length);
      const ribbonMat = new THREE.MeshStandardMaterial({
        color: 0x00f2ff,
        emissive: 0x004466,
        emissiveIntensity: 0.6,
        roughness: 0.4,
      });

      const ribbon = new THREE.Mesh(ribbonGeo, ribbonMat);
      ribbon.position.copy(midPoint);
      ribbon.lookAt(pB);

      // Invisible Hitbox for Raycasting
      const hitGeo = new THREE.BoxGeometry(3.5, 1.4, length);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitBox = new THREE.Mesh(hitGeo, hitMat);
      hitBox.position.copy(midPoint);
      hitBox.lookAt(pB);
      hitBox.userData = { type: 'edge', key: edge.key, a: edge.a, b: edge.b };

      this.graphGroup.add(ribbon);
      this.raycastGroup.add(hitBox);
      this.edgeMeshes.set(edge.key, { ribbon, hitBox, mat: ribbonMat });
    }

    // 2. Build Nodes & Infrastructure (Multi-tier Racks, Charge Stations, Pallet Trays)
    for (const node of graph.nodes.values()) {
      const pos = this.mapToWorld(node.x, node.y, 0.2);

      let nodeMesh;
      if (node.type === 'intersection') {
        // Glowing Octahedron FIFO Intersection
        const geo = new THREE.OctahedronGeometry(1.8);
        const mat = new THREE.MeshStandardMaterial({
          color: 0xffa500,
          emissive: 0xff6600,
          emissiveIntensity: 0.9,
        });
        nodeMesh = new THREE.Mesh(geo, mat);
        nodeMesh.position.set(pos.x, pos.y + 1.4, pos.z);

        const ringGeo = new THREE.RingGeometry(2.0, 2.6, 16);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xffa500, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(pos.x, 0.05, pos.z);
        this.facilityGroup.add(ring);

        this.nodeMeshes.set(node.id, { mesh: nodeMesh, ring, mat });
      } else if (node.type === 'charging') {
        // Charging Dock Base
        const padGeo = new THREE.BoxGeometry(4.8, 0.2, 4.8);
        const padMat = new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x054f34, emissiveIntensity: 0.5 });
        nodeMesh = new THREE.Mesh(padGeo, padMat);
        nodeMesh.position.copy(pos);

        // Charging Tower & Light Pillar
        const pillarGeo = new THREE.BoxGeometry(1.0, 4.5, 1.0);
        const pillarMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.85 });
        const pillar = new THREE.Mesh(pillarGeo, pillarMat);
        pillar.position.set(pos.x, 2.25, pos.z - 2.0);
        this.facilityGroup.add(pillar);
      } else if (node.type === 'storage') {
        // 3D Industrial Multi-tier Storage Aisle Rack
        const rackGroup = new THREE.Group();
        rackGroup.position.copy(pos);

        const frameMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.9, roughness: 0.3 });
        const boxMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4 });
        const palletMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 });

        // 4 Steel Vertical Posts
        const postGeo = new THREE.CylinderGeometry(0.18, 0.18, 6.0, 8);
        [[-2.2, -1.6], [2.2, -1.6], [-2.2, 1.6], [2.2, 1.6]].forEach(([dx, dz]) => {
          const p = new THREE.Mesh(postGeo, frameMat);
          p.position.set(dx, 3.0, dz);
          rackGroup.add(p);
        });

        // 3 Shelves with Pallet Trays & Freight Containers
        [1.2, 3.0, 4.8].forEach((lvlY) => {
          const shelfGeo = new THREE.BoxGeometry(4.8, 0.12, 3.4);
          const shelf = new THREE.Mesh(shelfGeo, frameMat);
          shelf.position.set(0, lvlY, 0);
          rackGroup.add(shelf);

          // Pallet Tray
          const palletGeo = new THREE.BoxGeometry(1.6, 0.2, 1.6);
          const pal1 = new THREE.Mesh(palletGeo, palletMat);
          pal1.position.set(-1.2, lvlY + 0.15, 0);
          const pal2 = new THREE.Mesh(palletGeo, palletMat);
          pal2.position.set(1.2, lvlY + 0.15, 0);
          rackGroup.add(pal1);
          rackGroup.add(pal2);

          // Cargo Crate on Pallet
          const crateGeo = new THREE.BoxGeometry(1.3, 1.0, 1.3);
          const c1 = new THREE.Mesh(crateGeo, boxMat);
          c1.position.set(-1.2, lvlY + 0.75, 0);
          const c2 = new THREE.Mesh(crateGeo, boxMat);
          c2.position.set(1.2, lvlY + 0.75, 0);
          rackGroup.add(c1);
          rackGroup.add(c2);
        });

        nodeMesh = rackGroup;
      } else {
        // General Node Marker / Pallet Tray Drop Zone
        const geo = new THREE.CylinderGeometry(1.2, 1.2, 0.1, 16);
        const mat = new THREE.MeshStandardMaterial({ color: 0x0284c7, emissive: 0x0284c7, emissiveIntensity: 0.4 });
        nodeMesh = new THREE.Mesh(geo, mat);
        nodeMesh.position.copy(pos);
      }

      this.facilityGroup.add(nodeMesh);
    }
  }

  // ---------------------------------------------------------------------------
  // Create 3D Industrial Forklift Vehicle Model
  // ---------------------------------------------------------------------------
  createForklift3DMesh(amr) {
    const group = new THREE.Group();

    // Heavy Chassis Body (Industrial Orange / Dark Navy)
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.7, roughness: 0.3 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.9, roughness: 0.2 });

    // Chassis Box & Rear Counterweight
    const chassisGeo = new THREE.BoxGeometry(2.2, 0.9, 3.2);
    const chassis = new THREE.Mesh(chassisGeo, bodyMat);
    chassis.position.set(0, 0.65, -0.2);
    chassis.castShadow = true;
    group.add(chassis);

    const counterweightGeo = new THREE.BoxGeometry(2.3, 1.2, 1.0);
    const counterweight = new THREE.Mesh(counterweightGeo, metalMat);
    counterweight.position.set(0, 0.8, -1.3);
    group.add(counterweight);

    // 4 Industrial Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.3, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 });
    [[-1.2, 0.45, -1.0], [1.2, 0.45, -1.0], [-1.2, 0.45, 1.0], [1.2, 0.45, 1.0]].forEach(([wx, wy, wz]) => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, wy, wz);
      group.add(wheel);
    });

    // Driver Roll Cage Cabin Frame
    const pillarGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.2, 8);
    [[-1.0, -0.8], [1.0, -0.8], [-1.0, 0.6], [1.0, 0.6]].forEach(([px, pz]) => {
      const pillar = new THREE.Mesh(pillarGeo, metalMat);
      pillar.position.set(px, 2.1, pz);
      group.add(pillar);
    });

    // Cabin Roof Guard
    const roofGeo = new THREE.BoxGeometry(2.2, 0.1, 1.6);
    const roof = new THREE.Mesh(roofGeo, metalMat);
    roof.position.set(0, 3.2, -0.1);
    group.add(roof);

    // Roof Rotating Beacon Light (Flashing Orange)
    const beaconGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.3, 12);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff6600 });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(0, 3.4, 0.4);
    group.add(beacon);

    const beaconLight = new THREE.PointLight(0xff6600, 2.0, 15);
    beaconLight.position.set(0, 3.5, 0.4);
    group.add(beaconLight);

    // Vertical Steel Mast Rails (Front of Forklift)
    const mastGeo = new THREE.BoxGeometry(0.15, 3.4, 0.15);
    const mastLeft = new THREE.Mesh(mastGeo, metalMat);
    mastLeft.position.set(-0.8, 1.8, 1.5);
    const mastRight = new THREE.Mesh(mastGeo, metalMat);
    mastRight.position.set(0.8, 1.8, 1.5);
    group.add(mastLeft);
    group.add(mastRight);

    // Elevating Fork Carriage Assembly Group
    const forkCarriage = new THREE.Group();
    forkCarriage.position.set(0, 0.6, 1.55); // Default lowered position

    const crossbarGeo = new THREE.BoxGeometry(1.8, 0.4, 0.1);
    const crossbar = new THREE.Mesh(crossbarGeo, metalMat);
    forkCarriage.add(crossbar);

    // 2 Horizontal Steel Lifting Forks
    const forkGeo = new THREE.BoxGeometry(0.2, 0.08, 1.5);
    const forkL = new THREE.Mesh(forkGeo, metalMat);
    forkL.position.set(-0.55, -0.15, 0.75);
    const forkR = new THREE.Mesh(forkGeo, metalMat);
    forkR.position.set(0.55, -0.15, 0.75);
    forkCarriage.add(forkL);
    forkCarriage.add(forkR);

    // Freight Cargo Pallet & Container on Forks
    const palletGeo = new THREE.BoxGeometry(1.6, 0.18, 1.4);
    const palletMat = new THREE.MeshStandardMaterial({ color: 0x78350f });
    const pallet = new THREE.Mesh(palletGeo, palletMat);
    pallet.position.set(0, 0.0, 0.75);
    pallet.visible = false;
    forkCarriage.add(pallet);

    const cargoGeo = new THREE.BoxGeometry(1.4, 1.1, 1.2);
    const cargoMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.3 });
    const cargo = new THREE.Mesh(cargoGeo, cargoMat);
    cargo.position.set(0, 0.65, 0.75);
    cargo.visible = false;
    forkCarriage.add(cargo);

    group.add(forkCarriage);

    // Dual Headlights
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const hL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.1), lightMat);
    hL.position.set(-0.85, 1.1, 1.42);
    const hR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.1), lightMat);
    hR.position.set(0.85, 1.1, 1.42);
    group.add(hL);
    group.add(hR);

    // Spotlight Light Beams Forward
    const spot = new THREE.SpotLight(0x00f2ff, 3.5, 20, Math.PI / 5, 0.4);
    spot.position.set(0, 1.2, 1.5);
    spot.target.position.set(0, 0, 12);
    group.add(spot);
    group.add(spot.target);

    // Under-chassis Status Halo
    const haloGeo = new THREE.RingGeometry(1.8, 2.4, 24);
    const haloMat = new THREE.MeshBasicMaterial({ color: 0x00f2ff, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.05;
    group.add(halo);

    chassis.userData = { type: 'amr', id: amr.id };

    return {
      group,
      halo,
      haloMat,
      forkCarriage,
      pallet,
      cargo,
      beaconLight,
      targetForkY: 0.6,
      currentForkY: 0.6,
      currentPos: this.mapToWorld(amr.pose.x, amr.pose.y, 0),
      targetPos: this.mapToWorld(amr.pose.x, amr.pose.y, 0),
      currentRot: amr.pose.theta || 0,
      targetRot: amr.pose.theta || 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Create 3D Sub-Chassis Lifter AMR Model
  // ---------------------------------------------------------------------------
  createLifter3DMesh(amr) {
    const group = new THREE.Group();

    // Compact Low-Profile Body
    const chassisGeo = new THREE.BoxGeometry(2.2, 0.6, 2.8);
    const chassisMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8, roughness: 0.2 });
    const chassis = new THREE.Mesh(chassisGeo, chassisMat);
    chassis.position.y = 0.45;
    chassis.castShadow = true;
    group.add(chassis);

    // Glowing Accent Stripe
    const stripeGeo = new THREE.BoxGeometry(2.25, 0.12, 2.6);
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0x00f2ff });
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.position.y = 0.5;
    group.add(stripe);

    // Central Hydraulic Lift Pad
    const padGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.2, 16);
    const padMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.9 });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(0, 0.85, 0);
    group.add(pad);

    // Cargo Freight Box on Lift Pad
    const cargoGeo = new THREE.BoxGeometry(1.6, 1.2, 1.6);
    const cargoMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4 });
    const cargo = new THREE.Mesh(cargoGeo, cargoMat);
    cargo.position.set(0, 1.55, 0);
    cargo.visible = false;
    group.add(cargo);

    // Status Halo
    const haloGeo = new THREE.RingGeometry(1.5, 2.0, 24);
    const haloMat = new THREE.MeshBasicMaterial({ color: 0x00f2ff, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.05;
    group.add(halo);

    chassis.userData = { type: 'amr', id: amr.id };

    return {
      group,
      halo,
      haloMat,
      cargo,
      currentPos: this.mapToWorld(amr.pose.x, amr.pose.y, 0),
      targetPos: this.mapToWorld(amr.pose.x, amr.pose.y, 0),
      currentRot: amr.pose.theta || 0,
      targetRot: amr.pose.theta || 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Vehicle Mesh Factory (Forklift vs Lifter AMR)
  // ---------------------------------------------------------------------------
  createVehicleMesh(amr) {
    const isForklift = amr.model.includes('1000') || amr.model.includes('FL') || amr.id.includes('07') || amr.id.includes('08');
    return isForklift ? this.createForklift3DMesh(amr) : this.createLifter3DMesh(amr);
  }

  // ---------------------------------------------------------------------------
  // Update Loop (Invoked on Simulation Ticks)
  // ---------------------------------------------------------------------------
  update(sim) {
    if (!sim || !sim.graph) return;

    if (this.edgeMeshes.size === 0 && sim.graph.edges.size > 0) {
      this.buildSceneGraph(sim.graph);
    }

    // 1. Update Graph Edges (Blocked / Busy Status)
    for (const [key, obj] of this.edgeMeshes.entries()) {
      const edge = sim.graph.edges.get(key);
      if (!edge) continue;

      const isBlocked = edge.blocked;
      const isOccupied = sim.edgeOccupants(key).size > 0;

      if (isBlocked) {
        obj.mat.color.setHex(0xef4444);
        obj.mat.emissive.setHex(0x990000);
      } else if (isOccupied) {
        obj.mat.color.setHex(0xf59e0b);
        obj.mat.emissive.setHex(0x995500);
      } else {
        obj.mat.color.setHex(0x00f2ff);
        obj.mat.emissive.setHex(0x004466);
      }
    }

    // 2. Update Intersections
    const heldZones = new Set(sim.tokens.snapshot().filter((z) => z.holder).flatMap((z) => z.nodeIds));
    for (const [nodeId, obj] of this.nodeMeshes.entries()) {
      if (obj.mesh && obj.mat) {
        const isHeld = heldZones.has(nodeId);
        obj.mat.color.setHex(isHeld ? 0xef4444 : 0xffa500);
        obj.mat.emissive.setHex(isHeld ? 0xff0000 : 0xff6600);
      }
    }

    // 3. Update AMRs / 3D Forklifts
    const statusColors = {
      moving: 0x00f2ff,
      idle: 0x3b82f6,
      charging: 0x10b981,
      loading: 0xf59e0b,
      unloading: 0xf59e0b,
      waiting_token: 0x8b5cf6,
      waiting_traffic: 0xeab308,
      failed: 0xef4444,
      stopped: 0xef4444,
    };

    const currentAMRIds = new Set(sim.agents.map((a) => a.id));

    for (const [id, record] of this.amrMeshes.entries()) {
      if (!currentAMRIds.has(id)) {
        this.amrGroup.remove(record.group);
        this.amrMeshes.delete(id);
      }
    }

    for (const amr of sim.agents) {
      let record = this.amrMeshes.get(amr.id);
      if (!record) {
        record = this.createVehicleMesh(amr);
        this.amrGroup.add(record.group);
        this.amrMeshes.set(amr.id, record);
      }

      record.targetPos = this.mapToWorld(amr.pose.x, amr.pose.y, 0);
      record.targetRot = amr.pose.theta || 0;

      const col = statusColors[amr.status] || 0x00f2ff;
      record.haloMat.color.setHex(col);

      // Handle Cargo Box & Forklift Mast Elevation
      const isLoaded = !!amr.payload?.isLoaded;
      if (record.forkCarriage) {
        record.pallet.visible = isLoaded;
        record.cargo.visible = isLoaded;
        record.targetForkY = isLoaded ? 1.8 : 0.5;
      } else if (record.cargo) {
        record.cargo.visible = isLoaded;
      }
    }

    // 4. Update Laser P2P Mesh Beams
    this.updateP2PMeshBeams(sim);
  }

  // ---------------------------------------------------------------------------
  // Volumetric P2P Mesh Beams
  // ---------------------------------------------------------------------------
  updateP2PMeshBeams(sim) {
    this.meshGroup.clear();

    const liveAgents = sim.agents.filter((a) => a.status !== 'failed');
    const p2pRange = sim.config.p2pRangeM || 120;

    for (let i = 0; i < liveAgents.length; i++) {
      for (let j = i + 1; j < liveAgents.length; j++) {
        const a1 = liveAgents[i];
        const a2 = liveAgents[j];

        const d = Math.hypot(a1.pose.x - a2.pose.x, a1.pose.y - a2.pose.y);
        if (d <= p2pRange) {
          const p1 = this.mapToWorld(a1.pose.x, a1.pose.y, 1.2);
          const p2 = this.mapToWorld(a2.pose.x, a2.pose.y, 1.2);

          const points = [p1, p2];
          const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
          const signalRatio = Math.max(0.15, 1 - d / p2pRange);
          const lineMat = new THREE.LineBasicMaterial({
            color: 0x00f2ff,
            transparent: true,
            opacity: signalRatio * 0.75,
            linewidth: 2,
          });

          const line = new THREE.Line(lineGeo, lineMat);
          this.meshGroup.add(line);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Smooth 60 FPS Render & Animation Loop
  // ---------------------------------------------------------------------------
  animate() {
    if (!this.isAnimRunning) return;
    requestAnimationFrame(this.animate);

    this.controls.update();

    const time = Date.now() * 0.005;

    for (const record of this.amrMeshes.values()) {
      // Lerp Vehicle Positions
      record.currentPos.lerp(record.targetPos, 0.15);
      record.group.position.copy(record.currentPos);

      // Lerp Rotation
      let diff = record.targetRot - record.currentRot;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      record.currentRot += diff * 0.15;
      record.group.rotation.y = -record.currentRot + Math.PI / 2;

      // Lerp Forklift Mast Height & Pulse Beacon Light
      if (record.forkCarriage) {
        record.currentForkY += (record.targetForkY - record.currentForkY) * 0.1;
        record.forkCarriage.position.y = record.currentForkY;
      }
      if (record.beaconLight) {
        record.beaconLight.intensity = 1.5 + Math.sin(time * 3) * 1.0;
      }
    }

    // Pulse Intersections
    for (const obj of this.nodeMeshes.values()) {
      if (obj.mesh) {
        obj.mesh.rotation.y = time * 0.2;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  // ---------------------------------------------------------------------------
  // Camera View Presets
  // ---------------------------------------------------------------------------
  setCameraPreset(mode) {
    const duration = 800;
    const startPos = this.camera.position.clone();
    const startTarget = this.controls.target.clone();

    let endPos = new THREE.Vector3(0, 95, 90);
    let endTarget = new THREE.Vector3(0, 0, 0);

    if (mode === '2d') {
      endPos.set(0, 140, 0.01);
      endTarget.set(0, 0, 0);
    } else if (mode === 'iso') {
      endPos.set(70, 85, 70);
      endTarget.set(0, 0, 0);
    } else {
      endPos.set(0, 95, 90);
      endTarget.set(0, 0, 0);
    }

    const startTime = performance.now();
    const animateCamera = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const ease = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;

      this.camera.position.lerpVectors(startPos, endPos, ease);
      this.controls.target.lerpVectors(startTarget, endTarget, ease);
      this.controls.update();

      if (progress < 1) {
        requestAnimationFrame(animateCamera);
      }
    };
    requestAnimationFrame(animateCamera);
  }

  // ---------------------------------------------------------------------------
  // Interactivity & Fullscreen Controls
  // ---------------------------------------------------------------------------
  setupInteractivity() {
    const dom = this.renderer.domElement;

    dom.addEventListener('click', (e) => {
      const rect = dom.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(this.raycastGroup.children, true);

      if (intersects.length > 0) {
        const hitData = intersects[0].object.userData;
        if (hitData && hitData.type === 'edge' && this.onEdgeClick) {
          this.onEdgeClick(hitData.a, hitData.b);
        }
      }
    });
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      this.container.requestFullscreen?.().catch((err) => console.error(err));
    } else {
      document.exitFullscreen?.().catch((err) => console.error(err));
    }
  }

  handleResize() {
    if (!this.container) return;
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight || 600;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
  }

  destroy() {
    this.isAnimRunning = false;
    window.removeEventListener('resize', this.handleResize);
    this.controls.dispose();
    this.renderer.dispose();
  }
}
