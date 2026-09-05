// =============================================================================
//  threeMap.js — High-Realism 3D SCADA Digital Twin Engine (Three.js)
//  
//  Renders real-time 3D SCADA warehouse digital twin matching industrial SCADA reference:
//  - Hardware-accelerated WebGL rendering with 360° OrbitControls
//  - 3D Architectural Warehouse Building Enclosure (Cutaway walls, loading dock doors, semi-trucks)
//  - Dense parallel multi-tier industrial storage aisle racks (Aisles A1-C10) with freight boxes
//  - 3D Green AMRs, Blue AGVs & Orange Heavy Forklifts with elevating mast & rotating beacons
//  - Floating 3D World-Space SCADA Vehicle Badges (AMR-204 | EN ROUTE)
//  - Volumetric P2P Laser Mesh links & neon floor directional pathway ribbons
//  - Fullscreen / Widescreen Viewport Expansion
// =============================================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const DEG2RAD = Math.PI / 180;

export class ThreeWarehouseMap {
  constructor(containerElement, onEdgeClick, onObjectSelect) {
    this.container = containerElement;
    this.onEdgeClick = onEdgeClick;
    this.onObjectSelect = onObjectSelect;

    this.width = this.container.clientWidth || 800;
    this.height = this.container.clientHeight || 500;

    // Scene & Renderer Setup — clean light control-room aesthetic
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf8fafc);
    this.scene.fog = new THREE.FogExp2(0xf8fafc, 0.0012);

    this.camera = new THREE.PerspectiveCamera(42, this.width / this.height, 1, 1000);
    this.camera.position.set(0, 110, 115);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.container.replaceChildren(this.renderer.domElement);

    // Floating 3D SCADA Badge Overlay Host
    this.badgeOverlayHost = document.createElement('div');
    this.badgeOverlayHost.className = 'scada-badge-overlay-container';
    this.container.appendChild(this.badgeOverlayHost);

    // Orbit Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controls.minDistance = 15;
    this.controls.maxDistance = 320;
    this.controls.target.set(0, 0, 0);

    // Lighting
    this.initLighting();

    // Scene Groups
    this.floorGroup = new THREE.Group();
    this.buildingGroup = new THREE.Group();
    this.graphGroup = new THREE.Group();
    this.facilityGroup = new THREE.Group();
    this.amrGroup = new THREE.Group();
    this.meshGroup = new THREE.Group();
    this.raycastGroup = new THREE.Group();

    this.scene.add(this.floorGroup);
    this.scene.add(this.buildingGroup);
    this.scene.add(this.graphGroup);
    this.scene.add(this.facilityGroup);
    this.scene.add(this.amrGroup);
    this.scene.add(this.meshGroup);
    this.scene.add(this.raycastGroup);

    // Dynamic Objects Cache
    this.amrMeshes = new Map(); // amrId -> record
    this.edgeMeshes = new Map(); // edgeKey -> record
    this.nodeMeshes = new Map(); // nodeId -> record
    this.badgeElements = new Map(); // amrId -> HTMLElement

    // Interactive Raycaster
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.setupInteractivity();

    // Build Floor, Architectural Walls & Outdoor Docks
    this.buildFloor();
    this.buildWarehouseBuildingEnclosure();

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
    // Bright, clean ambient and directional lighting for light SCADA operations
    const ambient = new THREE.AmbientLight(0xffffff, 1.3);
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xffffff, 0xd1d5db, 0.8);
    this.scene.add(hemi);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(60, 130, 70);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 10;
    dirLight.shadow.camera.far = 320;
    dirLight.shadow.camera.left = -110;
    dirLight.shadow.camera.right = 110;
    dirLight.shadow.camera.top = 80;
    dirLight.shadow.camera.bottom = -80;
    this.scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x0969da, 0.3);
    fillLight.position.set(-80, 60, -70);
    this.scene.add(fillLight);

    const centerPoint = new THREE.PointLight(0x0969da, 0.4, 180);
    centerPoint.position.set(0, 25, 0);
    this.scene.add(centerPoint);
  }

  buildFloor() {
    // Clean light epoxy floor plane (240x180)
    const floorGeo = new THREE.PlaneGeometry(240, 180);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.4,
      metalness: 0.05,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.1;
    floor.receiveShadow = true;
    this.floorGroup.add(floor);

    // Outdoor apron (light)
    const asphaltGeo = new THREE.PlaneGeometry(240, 60);
    const asphaltMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.7, metalness: 0.05 });
    const apron = new THREE.Mesh(asphaltGeo, asphaltMat);
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(0, -0.12, 90);
    this.floorGroup.add(apron);

    // Grid overlay — clean crisp grid lines
    const gridHelper = new THREE.GridHelper(240, 48, 0x0969da, 0xcbd5e1);
    gridHelper.position.y = 0.01;
    gridHelper.material.opacity = 0.45;
    gridHelper.material.transparent = true;
    this.floorGroup.add(gridHelper);

    // Outer facility perimeter line
    const frameGeo = new THREE.BoxGeometry(166, 1.4, 106);
    const frameMat = new THREE.MeshBasicMaterial({ color: 0x0969da, wireframe: true });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.set(0, 0.7, 0);
    this.floorGroup.add(frame);
  }

  // ---------------------------------------------------------------------------
  // Build Architectural Warehouse Building Enclosure & Semi-Truck Trailers
  // ---------------------------------------------------------------------------
  buildWarehouseBuildingEnclosure() {
    this.buildingGroup.clear();

    const wallMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.1, roughness: 0.7 });
    const trimMat = new THREE.MeshBasicMaterial({ color: 0x0969da });

    // Rear Facility Wall (Back Z = -53)
    const rearWallGeo = new THREE.BoxGeometry(168, 18, 1.5);
    const rearWall = new THREE.Mesh(rearWallGeo, wallMat);
    rearWall.position.set(0, 9, -53);
    this.buildingGroup.add(rearWall);

    // Left Facility Wall (Side X = -83)
    const leftWallGeo = new THREE.BoxGeometry(1.5, 18, 108);
    const leftWall = new THREE.Mesh(leftWallGeo, wallMat);
    leftWall.position.set(-83, 9, 0);
    this.buildingGroup.add(leftWall);

    // Front Loading Dock Wall with 4 Dock Door Cutouts (Z = 53)
    const dockWallGeo = new THREE.BoxGeometry(168, 18, 1.5);
    const dockWall = new THREE.Mesh(dockWallGeo, wallMat);
    dockWall.position.set(0, 9, 53);
    this.buildingGroup.add(dockWall);

    // 4 Shipping Dock Door Overhead Rollers & Frames
    [-55, -20, 20, 55].forEach((dx) => {
      const doorGeo = new THREE.BoxGeometry(10, 10, 0.4);
      const doorMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.9, roughness: 0.2 });
      const door = new THREE.Mesh(doorGeo, doorMat);
      door.position.set(dx, 5.0, 52.5);
      this.buildingGroup.add(door);

      // Frame Accent
      const borderGeo = new THREE.BoxGeometry(10.6, 0.4, 0.6);
      const border = new THREE.Mesh(borderGeo, trimMat);
      border.position.set(dx, 10.2, 52.5);
      this.buildingGroup.add(border);

      // Outdoor Semi-Trailer Truck Parked at Loading Bay
      this.createSemiTruckModel(dx, 68);
    });
  }

  createSemiTruckModel(x, z) {
    const truckGroup = new THREE.Group();
    truckGroup.position.set(x, 0, z);

    const cabMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.8, roughness: 0.3 });
    const trailerMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.6, roughness: 0.4 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 });

    // Truck Driver Cab
    const cabGeo = new THREE.BoxGeometry(3.6, 4.2, 4.5);
    const cab = new THREE.Mesh(cabGeo, cabMat);
    cab.position.set(0, 2.1, 7.5);
    truckGroup.add(cab);

    // Long Freight Trailer Box
    const trailerGeo = new THREE.BoxGeometry(3.8, 4.8, 14.0);
    const trailer = new THREE.Mesh(trailerGeo, trailerMat);
    trailer.position.set(0, 2.4, -2.0);
    truckGroup.add(trailer);

    // 8 Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.4, 16);
    [[-1.9, 0.6, 7.5], [1.9, 0.6, 7.5], [-1.9, 0.6, -4.0], [1.9, 0.6, -4.0], [-1.9, 0.6, -7.0], [1.9, 0.6, -7.0]].forEach(([wx, wy, wz]) => {
      const wheel = new THREE.Mesh(wheelGeo, metalMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, wy, wz);
      truckGroup.add(wheel);
    });

    this.buildingGroup.add(truckGroup);
  }

  // ---------------------------------------------------------------------------
  // Build 3D Warehouse Scene Graph (Nodes, Edges, Racks, Stations)
  // ---------------------------------------------------------------------------
  buildSceneGraph(graph) {
    this.graphGroup.clear();
    this.facilityGroup.clear();
    this.raycastGroup.clear();
    this.edgeMeshes.clear();
    this.nodeMeshes.clear();

    // 1. Build Edges (Pathways) with Neon Directional Arrow Markings
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
      const ribbonGeo = new THREE.BoxGeometry(1.1, 0.06, length);
      const ribbonMat = new THREE.MeshStandardMaterial({
        color: 0x00f2ff,
        emissive: 0x004466,
        emissiveIntensity: 0.6,
        roughness: 0.4,
      });

      const ribbon = new THREE.Mesh(ribbonGeo, ribbonMat);
      ribbon.position.copy(midPoint);
      ribbon.lookAt(pB);

      // Raycast Hitbox
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

    // 2. Build Industrial Infrastructure & Multi-Tier Storage Rack Aisles
    for (const node of graph.nodes.values()) {
      const pos = this.mapToWorld(node.x, node.y, 0.2);

      let nodeMesh;
      if (node.type === 'intersection') {
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
        const padGeo = new THREE.BoxGeometry(4.8, 0.2, 4.8);
        const padMat = new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x054f34, emissiveIntensity: 0.5 });
        nodeMesh = new THREE.Mesh(padGeo, padMat);
        nodeMesh.position.copy(pos);

        const pillarGeo = new THREE.BoxGeometry(1.0, 4.5, 1.0);
        const pillarMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.85 });
        const pillar = new THREE.Mesh(pillarGeo, pillarMat);
        pillar.position.set(pos.x, 2.25, pos.z - 2.0);
        this.facilityGroup.add(pillar);
      } else if (node.type === 'storage') {
        // Multi-tier Storage Rack Aisle
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

        // 3 Shelf Levels with Goods Containers
        [1.2, 3.0, 4.8].forEach((lvlY) => {
          const shelfGeo = new THREE.BoxGeometry(4.8, 0.12, 3.4);
          const shelf = new THREE.Mesh(shelfGeo, frameMat);
          shelf.position.set(0, lvlY, 0);
          rackGroup.add(shelf);

          // Pallet & Freight Crate
          const palletGeo = new THREE.BoxGeometry(1.6, 0.2, 1.6);
          const pal1 = new THREE.Mesh(palletGeo, palletMat);
          pal1.position.set(-1.2, lvlY + 0.15, 0);
          const pal2 = new THREE.Mesh(palletGeo, palletMat);
          pal2.position.set(1.2, lvlY + 0.15, 0);
          rackGroup.add(pal1);
          rackGroup.add(pal2);

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
        const geo = new THREE.CylinderGeometry(1.2, 1.2, 0.1, 16);
        const mat = new THREE.MeshStandardMaterial({ color: 0x0284c7, emissive: 0x0284c7, emissiveIntensity: 0.4 });
        nodeMesh = new THREE.Mesh(geo, mat);
        nodeMesh.position.copy(pos);
      }

      this.facilityGroup.add(nodeMesh);
    }
  }

  // ---------------------------------------------------------------------------
  // Vehicle Models (Green AMRs, Blue AGVs, Orange Forklifts)
  // ---------------------------------------------------------------------------
  createForklift3DMesh(amr) {
    const group = new THREE.Group();

    const isAGV = amr.id.includes('AGV');
    const isFL = amr.id.includes('FL') || amr.model.includes('1000');
    const vehicleColor = isFL ? 0xf59e0b : isAGV ? 0x0284c7 : 0x10b981;

    const bodyMat = new THREE.MeshStandardMaterial({ color: vehicleColor, metalness: 0.7, roughness: 0.3 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.2 });

    const chassisGeo = new THREE.BoxGeometry(2.2, 0.9, 3.2);
    const chassis = new THREE.Mesh(chassisGeo, bodyMat);
    chassis.position.set(0, 0.65, -0.2);
    chassis.castShadow = true;
    group.add(chassis);

    const counterweightGeo = new THREE.BoxGeometry(2.3, 1.2, 1.0);
    const counterweight = new THREE.Mesh(counterweightGeo, metalMat);
    counterweight.position.set(0, 0.8, -1.3);
    group.add(counterweight);

    // 4 Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.3, 16);
    [[-1.2, 0.45, -1.0], [1.2, 0.45, -1.0], [-1.2, 0.45, 1.0], [1.2, 0.45, 1.0]].forEach(([wx, wy, wz]) => {
      const wheel = new THREE.Mesh(wheelGeo, metalMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, wy, wz);
      group.add(wheel);
    });

    // Roll Cage
    const pillarGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.2, 8);
    [[-1.0, -0.8], [1.0, -0.8], [-1.0, 0.6], [1.0, 0.6]].forEach(([px, pz]) => {
      const pillar = new THREE.Mesh(pillarGeo, metalMat);
      pillar.position.set(px, 2.1, pz);
      group.add(pillar);
    });

    const roofGeo = new THREE.BoxGeometry(2.2, 0.1, 1.6);
    const roof = new THREE.Mesh(roofGeo, metalMat);
    roof.position.set(0, 3.2, -0.1);
    group.add(roof);

    // Beacon Light
    const beaconMat = new THREE.MeshBasicMaterial({ color: vehicleColor });
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.3, 12), beaconMat);
    beacon.position.set(0, 3.4, 0.4);
    group.add(beacon);

    const beaconLight = new THREE.PointLight(vehicleColor, 2.0, 15);
    beaconLight.position.set(0, 3.5, 0.4);
    group.add(beaconLight);

    // Vertical Mast & Fork Carriage
    const mastGeo = new THREE.BoxGeometry(0.15, 3.4, 0.15);
    const mL = new THREE.Mesh(mastGeo, metalMat);
    mL.position.set(-0.8, 1.8, 1.5);
    const mR = new THREE.Mesh(mastGeo, metalMat);
    mR.position.set(0.8, 1.8, 1.5);
    group.add(mL);
    group.add(mR);

    const forkCarriage = new THREE.Group();
    forkCarriage.position.set(0, 0.6, 1.55);

    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 0.1), metalMat);
    forkCarriage.add(crossbar);

    const forkGeo = new THREE.BoxGeometry(0.2, 0.08, 1.5);
    const fL = new THREE.Mesh(forkGeo, metalMat);
    fL.position.set(-0.55, -0.15, 0.75);
    const fR = new THREE.Mesh(forkGeo, metalMat);
    fR.position.set(0.55, -0.15, 0.75);
    forkCarriage.add(fL);
    forkCarriage.add(fR);

    const pallet = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 1.4), new THREE.MeshStandardMaterial({ color: 0x78350f }));
    pallet.position.set(0, 0.0, 0.75);
    pallet.visible = false;
    forkCarriage.add(pallet);

    const cargo = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 1.2), new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.25, metalness: 0.15 }));
    cargo.position.set(0, 0.65, 0.75);
    cargo.visible = false;
    forkCarriage.add(cargo);

    group.add(forkCarriage);

    // Status Halo
    const haloMat = new THREE.MeshBasicMaterial({ color: vehicleColor, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    const halo = new THREE.Mesh(new THREE.RingGeometry(1.8, 2.4, 24), haloMat);
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.05;
    group.add(halo);

    chassis.userData = { type: 'amr', id: amr.id };

    return {
      group,
      haloMat,
      forkCarriage,
      pallet,
      cargo,
      beaconLight,
      currentForkY: 0.6,
      currentPos: this.mapToWorld(amr.pose.x, amr.pose.y, 0),
      targetPos: this.mapToWorld(amr.pose.x, amr.pose.y, 0),
      currentRot: (amr.pose.headingDeg || 0) * DEG2RAD,
      targetRot: (amr.pose.headingDeg || 0) * DEG2RAD,
      jobPhase: 'idle',
      jobT: 0,
    };
  }

  createVehicleMesh(amr) {
    // All AMRs/vehicles use the 3D Forklift model with animated elevating mast & fork carriage!
    return this.createForklift3DMesh(amr);
  }

  // ---------------------------------------------------------------------------
  // Update Loop (Invoked on Simulation Ticks)
  // ---------------------------------------------------------------------------
  update(sim) {
    if (!sim || !sim.graph) return;

    if (this.edgeMeshes.size === 0 && sim.graph.edges.size > 0) {
      this.buildSceneGraph(sim.graph);
    }

    // 1. Update Graph Edges
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
    const currentAMRIds = new Set(sim.agents.map((a) => a.id));

    for (const [id, record] of this.amrMeshes.entries()) {
      if (!currentAMRIds.has(id)) {
        this.amrGroup.remove(record.group);
        this.amrMeshes.delete(id);
        const badgeEl = this.badgeElements.get(id);
        if (badgeEl) {
          badgeEl.remove();
          this.badgeElements.delete(id);
        }
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
      record.targetRot = (amr.pose.headingDeg || 0) * DEG2RAD;

      // --- Forklift "job" state machine (visible pick / place work) -----------
      // loading  = retrieving a pallet from a rack/pick bay  (fork dips, grabs, lifts)
      // unloading = placing a pallet at a pack/dispatch bay   (fork lowers, drops)
      const isLoaded = !!amr.payload?.isLoaded;
      const status = amr.status;
      if (status === 'loading') record.jobPhase = 'retrieving';
      else if (status === 'unloading') record.jobPhase = 'placing';
      else if (isLoaded) record.jobPhase = 'carrying';
      else record.jobPhase = 'idle';

      if (record.forkCarriage) {
        // Pallet+cargo are visible whenever the forks hold a load, or mid-job.
        const showLoad = isLoaded || status === 'loading' || status === 'unloading';
        record.pallet.visible = showLoad;
        record.cargo.visible = showLoad;
      }
    }

    // 4. Update Laser P2P Mesh Beams
    this.updateP2PMeshBeams(sim);

    // 5. Update Floating 3D World-Space Vehicle Badges
    this.updateVehicleBadges(sim);
  }

  // ---------------------------------------------------------------------------
  // Floating 3D World-Space Vehicle SCADA Badges (AMR-204 | PICKING)
  // ---------------------------------------------------------------------------
  updateVehicleBadges(sim) {
    if (!this.badgeOverlayHost || !this.container) return;

    const rect = this.container.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    for (const amr of sim.agents) {
      const record = this.amrMeshes.get(amr.id);
      if (!record) continue;

      let badge = this.badgeElements.get(amr.id);
      if (!badge) {
        badge = document.createElement('div');
        const vType = amr.id.includes('FL') || amr.model.includes('1000') ? 'fl' : amr.id.includes('AGV') ? 'agv' : 'amr';
        badge.className = `scada-vbadge vbadge-${vType}`;
        this.badgeOverlayHost.appendChild(badge);
        this.badgeElements.set(amr.id, badge);
      }

      // Project 3D world position above vehicle to 2D screen coordinate
      const worldPos = record.currentPos.clone().add(new THREE.Vector3(0, 4.8, 0));
      worldPos.project(this.camera);

      // Check if vehicle is in front of camera
      if (worldPos.z < 1) {
        const screenX = (worldPos.x * 0.5 + 0.5) * width;
        const screenY = (-worldPos.y * 0.5 + 0.5) * height;

        badge.style.display = 'flex';
        badge.style.transform = `translate3d(${screenX}px, ${screenY}px, 0) translate(-50%, -100%)`;

        // Surface the live job the forklift is performing so pick/place work reads.
        let statusTxt;
        if (amr.status === 'loading') statusTxt = 'RETRIEVING';
        else if (amr.status === 'unloading') statusTxt = 'PLACING';
        else if (amr.status === 'moving') statusTxt = amr.payload.isLoaded ? 'DELIVERING' : 'EN ROUTE';
        else if (amr.status === 'charging') statusTxt = 'CHARGING';
        else statusTxt = amr.status.toUpperCase().replace('_', ' ');

        const isLoaded = !!amr.payload?.isLoaded;
        const loadKg = amr.payload?.currentLoadKg || 0;
        const payloadTag = isLoaded
          ? `<span class="vbadge-payload loaded"><i class="fas fa-box"></i> ${loadKg}kg</span>`
          : `<span class="vbadge-payload empty">EMPTY</span>`;

        badge.innerHTML = `<span class="vbadge-id">${amr.id}</span>${payloadTag}<span class="vbadge-status">${statusTxt}</span>`;
      } else {
        badge.style.display = 'none';
      }
    }
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
      record.currentPos.lerp(record.targetPos, 0.15);
      record.group.position.copy(record.currentPos);

      let diff = record.targetRot - record.currentRot;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      record.currentRot += diff * 0.15;
      record.group.rotation.y = -record.currentRot + Math.PI / 2;

      if (record.forkCarriage) {
        // Fork height is driven by the job phase so pick/place work is legible:
        //   idle       – forks parked low
        //   carrying   – forks held at transport height
        //   retrieving – forks dip to the pallet then hoist it (cyclic)
        //   placing    – forks lower to set the pallet down (cyclic)
        const cycle = Math.sin(time * 2) * 0.5 + 0.5; // 0..1
        let ty = 0.5;
        if (record.jobPhase === 'carrying') ty = 1.7;
        else if (record.jobPhase === 'retrieving') ty = 0.2 + cycle * 2.2;
        else if (record.jobPhase === 'placing') ty = 2.2 - cycle * 2.0;
        record.currentForkY += (ty - record.currentForkY) * 0.12;
        record.forkCarriage.position.y = record.currentForkY;
      }
      if (record.beaconLight) {
        // Rotating-beacon effect: brighter while actively working a job.
        const busy = record.jobPhase === 'retrieving' || record.jobPhase === 'placing';
        record.beaconLight.intensity = (busy ? 2.4 : 1.2) + Math.sin(time * 3) * 1.0;
      }
    }

    for (const obj of this.nodeMeshes.values()) {
      if (obj.mesh) {
        obj.mesh.rotation.y = time * 0.2;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  setCameraPreset(mode) {
    const duration = 800;
    const startPos = this.camera.position.clone();
    const startTarget = this.controls.target.clone();

    let endPos = new THREE.Vector3(0, 110, 115);
    let endTarget = new THREE.Vector3(0, 0, 0);

    if (mode === '2d') {
      endPos.set(0, 150, 0.01);
      endTarget.set(0, 0, 0);
    } else if (mode === 'iso') {
      endPos.set(75, 90, 75);
      endTarget.set(0, 0, 0);
    } else {
      endPos.set(0, 110, 115);
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
