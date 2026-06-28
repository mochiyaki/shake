import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Building, Fault, Seismometer, SimulationState } from '../types';
import { SOIL_PROPERTIES } from '../data';
import { Landmark, Shield, AlertTriangle, Radio } from 'lucide-react';

interface ThreeMapProps {
  seismometers: Seismometer[];
  buildings: Building[];
  faults: Fault[];
  simulationState: SimulationState;
  onSelectSensor: (id: string | null) => void;
  selectedSensorId: string | null;
  onAddSeismometer: (x: number, z: number) => void;
  onEpicenterSet: (x: number, z: number) => void;
  onSensorTrigger: (id: string, waveType: 'p' | 's', mmi: number, pga: number) => void;
  onBuildingDamage: (id: string, damage: number, tiltX: number, tiltZ: number) => void;
  onWarningCountdownUpdate: (countdown: number) => void;
}

// 2D projection structure for floating text labels
interface ScreenLabel {
  id: string;
  text: string;
  x: number;
  y: number;
  visible: boolean;
  type: 'landmark' | 'sensor' | 'epicenter';
  status?: string;
  mmi?: number;
}

export default function ThreeMap({
  seismometers,
  buildings,
  faults,
  simulationState,
  onSelectSensor,
  selectedSensorId,
  onAddSeismometer,
  onEpicenterSet,
  onSensorTrigger,
  onBuildingDamage,
  onWarningCountdownUpdate,
}: ThreeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Floating HTML labels state
  const [labels, setLabels] = useState<ScreenLabel[]>([]);
  const [placeSensorMode, setPlaceSensorMode] = useState(false);
  const [soilOverlay, setSoilOverlay] = useState<'none' | 'soil'>('soil');

  // Animation / simulation refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const customSensorsRef = useRef<Seismometer[]>(seismometers);

  // Ref for active debris and dust particles
  const particlesRef = useRef<{
    mesh: THREE.Mesh;
    velocity: THREE.Vector3;
    rotationSpeed: THREE.Vector3;
    life: number;
    maxLife: number;
    type: 'debris' | 'dust';
  }[]>([]);

  // References to meshes for dynamic updates
  const buildingMeshesRef = useRef<{ [key: string]: THREE.Group }>({});
  const sensorMeshesRef = useRef<{ [key: string]: THREE.Mesh | THREE.Group }>({});
  const faultLinesRef = useRef<{ [key: string]: THREE.Line }>({});
  const pWaveMeshRef = useRef<THREE.Mesh | null>(null);
  const sWaveMeshRef = useRef<THREE.Mesh | null>(null);
  const epicenterMeshRef = useRef<THREE.Mesh | null>(null);
  const terrainMeshRef = useRef<THREE.Mesh | null>(null);

  // Track dynamic custom sensors
  useEffect(() => {
    customSensorsRef.current = seismometers;
  }, [seismometers]);

  // Orbital controls state (simple, bulletproof mouse controller)
  const isDraggingRef = useRef(false);
  const prevMouseRef = useRef({ x: 0, y: 0 });
  const cameraAnglesRef = useRef({ theta: Math.PI / 4, phi: Math.PI / 3, radius: 240 });
  const cameraTargetRef = useRef(new THREE.Vector3(0, 5, 0));

  // --- HEIGHT MAP UTILITY ---
  const getTerrainHeight = (x: number, z: number): { height: number; type: 'water' | 'bedrock' | 'sandy-fill' | 'mud' } => {
    // Ocean on the left (West)
    const isOcean = x < -95 && z > -120;
    // Bay on the right (East)
    const isBay = x > 85 && z < 110;
    // Golden Gate Strait
    const isStrait = z < -100 && z > -145 && x < 35 && x > -110;

    if (isOcean || isBay || isStrait) {
      return { height: -3, type: 'water' };
    }

    let height = 1.2; // base land elevation

    // Twin Peaks (Center-South)
    const distTwinPeaks = Math.hypot(x - (-30), z - 10);
    if (distTwinPeaks < 45) {
      height += 24 * Math.pow(1 - distTwinPeaks / 45, 1.8);
    }

    // Nob Hill & Russian Hill (Central North)
    const distNobHill = Math.hypot(x - 25, z - (-80));
    if (distNobHill < 35) {
      height += 13 * Math.pow(1 - distNobHill / 35, 1.5);
    }

    // Telegraph Hill (North East corner)
    const distTelegraph = Math.hypot(x - 48, z - (-115));
    if (distTelegraph < 25) {
      height += 11 * Math.pow(1 - distTelegraph / 25, 1.5);
    }

    // Bernal Heights / Potrero (South East)
    const distBernal = Math.hypot(x - 10, z - 40);
    if (distBernal < 30) {
      height += 9 * Math.pow(1 - distBernal / 30, 1.5);
    }

    // Soil boundaries
    let type: 'bedrock' | 'sandy-fill' | 'mud' = 'bedrock';
    if (x < -55 && z > -80 && z < 40) {
      // Sunset/Richmond sand dunes
      type = 'sandy-fill';
    } else if (z < -95 && x > -50 && x < 80) {
      // Marina district fill
      type = 'sandy-fill';
    } else if (x > 50 && z < -40) {
      // SOMA and Financial landfill
      type = 'sandy-fill';
    } else if (z > -30 && z < 30 && x > -10 && x < 40) {
      // Mission Clay Alluvium
      type = 'mud';
    }

    return { height, type };
  };

  // --- HELPER TO ADD FRACTURE/CRACK WIREFRAMES ---
  const addStressCracks = (targetMesh: THREE.Mesh, colorStr: string = '#f43f5e') => {
    const edgesGeo = new THREE.EdgesGeometry(targetMesh.geometry);
    const edgesMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(colorStr),
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const edges = new THREE.LineSegments(edgesGeo, edgesMat);
    edges.position.set(0, 0, 0);
    edges.rotation.set(0, 0, 0);
    edges.scale.set(1.008, 1.008, 1.008);
    edges.name = 'stress-cracks';
    targetMesh.add(edges);
  };

  // --- HELPER TO SPAWN CRUMBLING DEBRIS & DUST PARTICLES ---
  const spawnParticle = (posX: number, posY: number, posZ: number, type: 'debris' | 'dust') => {
    const scene = sceneRef.current;
    if (!scene) return;

    let geo: THREE.BufferGeometry;
    let mat: THREE.Material;

    if (type === 'debris') {
      const size = 0.15 + Math.random() * 0.25;
      geo = new THREE.BoxGeometry(size, size, size);
      const isConcrete = Math.random() > 0.35;
      mat = new THREE.MeshStandardMaterial({
        color: isConcrete ? '#78716c' : '#38bdf8', // concrete grey or sky blue glass
        roughness: 0.8,
        metalness: isConcrete ? 0.1 : 0.8,
        transparent: true,
      });
    } else {
      const size = 0.5 + Math.random() * 0.7;
      geo = new THREE.SphereGeometry(size, 4, 4);
      mat = new THREE.MeshBasicMaterial({
        color: '#a8a29e', // concrete dust grey
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      });
    }

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      posX + (Math.random() - 0.5) * 3,
      posY,
      posZ + (Math.random() - 0.5) * 3
    );
    scene.add(mesh);

    const velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 1.2,
      type === 'debris' ? (0.8 + Math.random() * 1.5) : (0.4 + Math.random() * 0.8),
      (Math.random() - 0.5) * 1.2
    );

    const rotationSpeed = new THREE.Vector3(
      (Math.random() - 0.5) * 0.2,
      (Math.random() - 0.5) * 0.2,
      (Math.random() - 0.5) * 0.2
    );

    particlesRef.current.push({
      mesh,
      velocity,
      rotationSpeed,
      life: 0,
      maxLife: type === 'debris' ? 50 + Math.random() * 30 : 60 + Math.random() * 40,
      type,
    });
  };

  // --- INITIALIZE THREE.JS SCENE ---
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // 1. Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0f172a'); // Rich dark background
    sceneRef.current = scene;

    // Add deep atmospheric fog
    scene.fog = new THREE.FogExp2('#0f172a', 0.0025);

    // 2. Camera setup
    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 1000);
    cameraRef.current = camera;
    updateCameraPosition();

    // 3. Renderer setup
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      alpha: false,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    rendererRef.current = renderer;

    // 4. Lights
    const ambientLight = new THREE.AmbientLight('#1e293b', 1.8);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight('#cbd5e1', 2.0);
    dirLight.position.set(80, 120, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 10;
    dirLight.shadow.camera.far = 400;
    const d = 150;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    scene.add(dirLight);

    // Minor warm ground/fault glow light
    const pointLight = new THREE.PointLight('#f43f5e', 2, 100);
    pointLight.position.set(0, 5, 0);
    scene.add(pointLight);

    // 5. Draw Terrain Grid with vertex colors representing geology
    const terrainGeo = new THREE.PlaneGeometry(300, 300, 80, 80);
    terrainGeo.rotateX(-Math.PI / 2);

    const positions = terrainGeo.attributes.position;
    const colors: number[] = [];

    for (let i = 0; i < positions.count; i++) {
      const vx = positions.getX(i);
      const vz = positions.getZ(i);

      const geo = getTerrainHeight(vx, vz);
      positions.setY(i, geo.height);

      // Vertex color depending on soil type / water
      let col = new THREE.Color();
      if (geo.height < 0) {
        // Water (deep slate blue)
        col.set('#1d4ed8'); // Water blue
      } else {
        if (soilOverlay === 'soil') {
          if (geo.type === 'sandy-fill') {
            col.set('#eab308'); // Yellow fill
          } else if (geo.type === 'mud') {
            col.set('#a3e635'); // Marshy green
          } else {
            col.set('#475569'); // Solid Slate bedrock
          }
        } else {
          col.set('#334155'); // Flat natural dark grey
        }
      }
      colors.push(col.r, col.g, col.b);
    }

    terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    terrainGeo.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.1,
    });

    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);
    terrainMeshRef.current = terrainMesh;

    // Grid Overlay
    const gridHelper = new THREE.GridHelper(300, 30, '#475569', '#1e293b');
    gridHelper.position.y = 0.1;
    scene.add(gridHelper);

    // 6. Draw Tectonic Fault Lines
    faults.forEach((fault) => {
      const points: THREE.Vector3[] = [];
      fault.coordinates.forEach((coord) => {
        // Sample height to follow terrain
        const h = getTerrainHeight(coord.x, coord.z).height;
        points.push(new THREE.Vector3(coord.x, h + 0.5, coord.z));
      });

      const faultGeo = new THREE.BufferGeometry().setFromPoints(points);
      const faultMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(fault.color),
        linewidth: 4,
      });

      const line = new THREE.Line(faultGeo, faultMat);
      scene.add(line);
      faultLinesRef.current[fault.id] = line;
    });

    // 7. Draw Buildings
    buildings.forEach((building) => {
      const bGroup = new THREE.Group();
      bGroup.position.set(building.x, building.y, building.z);

      // Create main tower structure
      let bMat: THREE.Material;
      if (building.id === 'salesforce-tower') {
        // Salesforce Tower custom tapered model
        const towerGeo = new THREE.CylinderGeometry(building.width * 0.5, building.width * 0.9, building.height, 12, 6);
        bMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(building.color),
          roughness: 0.2,
          metalness: 0.8,
          emissive: new THREE.Color('#1e40af'),
          emissiveIntensity: 0.3,
        });
        const mesh = new THREE.Mesh(towerGeo, bMat);
        mesh.position.y = building.height / 2;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        bGroup.add(mesh);

        // Add a glowing apex beacon
        const beaconGeo = new THREE.SphereGeometry(1.2, 8, 8);
        const beaconMat = new THREE.MeshBasicMaterial({ color: '#60a5fa' });
        const beacon = new THREE.Mesh(beaconGeo, beaconMat);
        beacon.position.y = building.height;
        bGroup.add(beacon);
      } else if (building.id === 'transamerica-pyramid') {
        // Pyramid model
        const pyrGeo = new THREE.ConeGeometry(building.width * 0.9, building.height, 4);
        bMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(building.color),
          roughness: 0.6,
          metalness: 0.2,
        });
        const mesh = new THREE.Mesh(pyrGeo, bMat);
        mesh.rotateY(Math.PI / 4); // Align square cone
        mesh.position.y = building.height / 2;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        bGroup.add(mesh);

        // Side wings of Transamerica
        const wingGeoL = new THREE.BoxGeometry(1.5, building.height * 0.6, 2);
        const wingMeshL = new THREE.Mesh(wingGeoL, bMat);
        wingMeshL.position.set(-building.width * 0.35, building.height * 0.3, 0);
        const wingMeshR = wingMeshL.clone();
        wingMeshR.position.x = building.width * 0.35;
        bGroup.add(wingMeshL, wingMeshR);
      } else if (building.id === 'coit-tower') {
        // Cylinder tower
        const cylinderGeo = new THREE.CylinderGeometry(building.width * 0.6, building.width * 0.6, building.height * 0.8, 12);
        bMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(building.color), roughness: 0.7 });
        const cylinder = new THREE.Mesh(cylinderGeo, bMat);
        cylinder.position.y = (building.height * 0.8) / 2;
        cylinder.castShadow = true;
        cylinder.receiveShadow = true;
        bGroup.add(cylinder);

        const domeGeo = new THREE.SphereGeometry(building.width * 0.5, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2);
        const dome = new THREE.Mesh(domeGeo, bMat);
        dome.position.y = building.height * 0.8;
        bGroup.add(dome);
      } else if (building.id.startsWith('gg-bridge')) {
        // Bridge towers (red suspension pillars)
        const pillarGeo = new THREE.BoxGeometry(building.width, building.height, building.depth);
        bMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(building.color), metalness: 0.3, roughness: 0.4 });
        const pillar = new THREE.Mesh(pillarGeo, bMat);
        pillar.position.y = building.height / 2;
        pillar.castShadow = true;
        pillar.receiveShadow = true;
        bGroup.add(pillar);

        // Crossbars
        const barGeo1 = new THREE.BoxGeometry(building.width * 1.5, 3, building.depth * 0.8);
        const bar1 = new THREE.Mesh(barGeo1, bMat);
        bar1.position.set(0, building.height * 0.4, 0);
        const bar2 = bar1.clone();
        bar2.position.y = building.height * 0.75;
        bGroup.add(bar1, bar2);
      } else {
        // Normal block buildings
        const boxGeo = new THREE.BoxGeometry(building.width, building.height, building.depth);
        
        // Slightly customized materials for variety
        if (building.type === 'commercial') {
          bMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(building.color),
            roughness: 0.2,
            metalness: 0.8,
          });
        } else {
          bMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(building.color),
            roughness: 0.8,
            metalness: 0.05,
          });
        }
        
        const mesh = new THREE.Mesh(boxGeo, bMat);
        mesh.position.y = building.height / 2;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        bGroup.add(mesh);
      }

      // Automatically attach stress-crack wireframe overlays to all meshes in the building group
      const meshesToCrack: THREE.Mesh[] = [];
      bGroup.children.forEach((child) => {
        if (child instanceof THREE.Mesh) {
          meshesToCrack.push(child);
        }
      });
      meshesToCrack.forEach((mesh) => {
        addStressCracks(mesh, '#f43f5e');
      });

      scene.add(bGroup);
      buildingMeshesRef.current[building.id] = bGroup;
    });

    // 8. Place Seismometers
    seismometers.forEach((sensor) => {
      createSensorMesh(sensor);
    });

    // 9. P-Wave & S-Wave visualization disks (hidden initially)
    const waveGeo = new THREE.RingGeometry(1, 1.2, 64);
    waveGeo.rotateX(-Math.PI / 2);

    const pWaveMat = new THREE.MeshBasicMaterial({
      color: '#38bdf8',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
    });
    const pWaveMesh = new THREE.Mesh(waveGeo, pWaveMat);
    pWaveMesh.position.y = 1.0;
    scene.add(pWaveMesh);
    pWaveMeshRef.current = pWaveMesh;

    const sWaveMat = new THREE.MeshBasicMaterial({
      color: '#f43f5e',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
    });
    const sWaveMesh = new THREE.Mesh(waveGeo, sWaveMat);
    sWaveMesh.position.y = 1.1;
    scene.add(sWaveMesh);
    sWaveMeshRef.current = sWaveMesh;

    // 10. Epicenter marker mesh
    const epicGeo = new THREE.RingGeometry(0.1, 4, 32);
    epicGeo.rotateX(-Math.PI / 2);
    const epicMat = new THREE.MeshBasicMaterial({
      color: '#f43f5e',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
    });
    const epicenterMesh = new THREE.Mesh(epicGeo, epicMat);
    epicenterMesh.position.y = 0.5;
    scene.add(epicenterMesh);
    epicenterMeshRef.current = epicenterMesh;

    // 11. Start animation loop
    let animId = requestAnimationFrame(animate);

    // --- RE-SIZE LISTENER ---
    const handleResize = () => {
      if (!canvasRef.current || !containerRef.current || !cameraRef.current || !rendererRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;

      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, []);

  // --- RE-COLOR TERRAIN ON OVERLAY TOGGLE ---
  useEffect(() => {
    if (!terrainMeshRef.current) return;
    const terrainGeo = terrainMeshRef.current.geometry;
    const positions = terrainGeo.attributes.position;
    const colorsAttr = terrainGeo.attributes.color;
    const colors: number[] = [];

    for (let i = 0; i < positions.count; i++) {
      const vx = positions.getX(i);
      const vz = positions.getZ(i);
      const geo = getTerrainHeight(vx, vz);

      let col = new THREE.Color();
      if (geo.height < 0) {
        col.set('#1d4ed8'); // Water
      } else {
        if (soilOverlay === 'soil') {
          if (geo.type === 'sandy-fill') {
            col.set('#eab308'); // Yellow
          } else if (geo.type === 'mud') {
            col.set('#a3e635'); // Green
          } else {
            col.set('#475569'); // Bedrock
          }
        } else {
          col.set('#334155'); // Natural Grey
        }
      }
      colors.push(col.r, col.g, col.b);
    }

    terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    colorsAttr.needsUpdate = true;
  }, [soilOverlay]);

  // --- RE-EVALUATE AND RENDER EPICENTER ---
  useEffect(() => {
    if (!sceneRef.current || !epicenterMeshRef.current) return;

    if (simulationState.epicenter) {
      const { x, z } = simulationState.epicenter;
      const h = getTerrainHeight(x, z).height;
      epicenterMeshRef.current.position.set(x, h + 0.1, z);
      epicenterMeshRef.current.material.opacity = 0.8;
    } else {
      epicenterMeshRef.current.material.opacity = 0;
    }
  }, [simulationState.epicenter]);

  // --- MONITOR DYNAMIC SENSOR RE-CREATIONS (Like custom sensors placed) ---
  useEffect(() => {
    // Clear old custom sensors mesh representation if not in standard list
    Object.keys(sensorMeshesRef.current).forEach((key) => {
      const exists = seismometers.some((s) => s.id === key);
      if (!exists && sceneRef.current) {
        sceneRef.current.remove(sensorMeshesRef.current[key]);
        delete sensorMeshesRef.current[key];
      }
    });

    // Create meshes for new sensors
    seismometers.forEach((sensor) => {
      if (!sensorMeshesRef.current[sensor.id]) {
        createSensorMesh(sensor);
      }
    });
  }, [seismometers]);

  // Method to programmatically construct a 3D sensor pin
  const createSensorMesh = (sensor: Seismometer) => {
    if (!sceneRef.current) return;

    const sensorGroup = new THREE.Group();
    sensorGroup.position.set(sensor.x, sensor.y, sensor.z);

    // Conical sensor antenna base
    const coneGeo = new THREE.CylinderGeometry(0.1, 1.8, 3.5, 8);
    const coneMat = new THREE.MeshStandardMaterial({
      color: sensor.isCustom ? '#ec4899' : '#a8a29e',
      roughness: 0.5,
      metalness: 0.7,
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.y = 1.75;
    cone.castShadow = true;
    sensorGroup.add(cone);

    // Glowing sensor dome on top
    const bulbGeo = new THREE.SphereGeometry(0.8, 8, 8);
    const bulbMat = new THREE.MeshBasicMaterial({ color: '#78716c' });
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.y = 3.5;
    sensorGroup.add(bulb);

    sceneRef.current.add(sensorGroup);
    sensorMeshesRef.current[sensor.id] = sensorGroup;
  };

  // Update Orbit Camera Matrix
  const updateCameraPosition = () => {
    if (!cameraRef.current) return;
    const angles = cameraAnglesRef.current;
    const target = cameraTargetRef.current;

    const x = target.x + angles.radius * Math.sin(angles.phi) * Math.sin(angles.theta);
    const y = target.y + angles.radius * Math.cos(angles.phi);
    const z = target.z + angles.radius * Math.sin(angles.phi) * Math.cos(angles.theta);

    cameraRef.current.position.set(x, y, z);
    cameraRef.current.lookAt(target);
  };

  // --- ORBITAL MOUSE CONTROL HANDLERS ---
  const handleMouseDown = (e: React.MouseEvent) => {
    if (placeSensorMode) {
      handleTerrainPlacementClick(e);
      return;
    }
    isDraggingRef.current = true;
    prevMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const deltaX = e.clientX - prevMouseRef.current.x;
    const deltaY = e.clientY - prevMouseRef.current.y;

    const angles = cameraAnglesRef.current;
    angles.theta -= deltaX * 0.005;
    angles.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, angles.phi - deltaY * 0.005));

    prevMouseRef.current = { x: e.clientX, y: e.clientY };
    updateCameraPosition();
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    const angles = cameraAnglesRef.current;
    angles.radius = Math.max(80, Math.min(450, angles.radius + e.deltaY * 0.15));
    updateCameraPosition();
  };

  // --- TRANSLATE CANVAS CLICK TO 3D GRID COORDINATES ---
  const handleTerrainPlacementClick = (e: React.MouseEvent) => {
    if (!canvasRef.current || !cameraRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), cameraRef.current);

    if (terrainMeshRef.current) {
      const intersects = raycaster.intersectObject(terrainMeshRef.current);
      if (intersects.length > 0) {
        const point = intersects[0].point;
        if (placeSensorMode) {
          onAddSeismometer(point.x, point.z);
          setPlaceSensorMode(false);
        } else {
          onEpicenterSet(point.x, point.z);
        }
      }
    }
  };

  // --- 3D ANIMATION & SIMULATION RENDER LOOP ---
  const animate = (currentTime: number) => {
    requestAnimationFrame(animate);

    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    if (!scene || !camera || !renderer) return;

    // --- UPDATE ACTIVE PARTICLES ---
    const activeParticles = particlesRef.current;
    const remainingParticles: typeof activeParticles = [];

    for (let i = 0; i < activeParticles.length; i++) {
      const p = activeParticles[i];
      p.life++;

      if (p.life >= p.maxLife) {
        scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        if (Array.isArray(p.mesh.material)) {
          p.mesh.material.forEach((m) => m.dispose());
        } else {
          p.mesh.material.dispose();
        }
      } else {
        p.mesh.position.add(p.velocity);

        if (p.type === 'debris') {
          // Gravity
          p.velocity.y -= 0.12;
          
          const currentHeight = getTerrainHeight(p.mesh.position.x, p.mesh.position.z).height;
          if (p.mesh.position.y <= currentHeight) {
            p.mesh.position.y = currentHeight;
            p.velocity.y = -p.velocity.y * 0.28; // bounce decay
            p.velocity.x *= 0.55; // friction
            p.velocity.z *= 0.55;
          }

          p.mesh.rotation.x += p.rotationSpeed.x;
          p.mesh.rotation.y += p.rotationSpeed.y;
          p.mesh.rotation.z += p.rotationSpeed.z;

          const mat = p.mesh.material as THREE.MeshStandardMaterial;
          if (p.life > p.maxLife * 0.7) {
            mat.opacity = Math.max(0, 1 - (p.life - p.maxLife * 0.7) / (p.maxLife * 0.3));
          }
        } else {
          // Dust dispersion
          p.mesh.scale.addScalar(0.012);
          p.velocity.x += (Math.random() - 0.5) * 0.04;
          p.velocity.z += (Math.random() - 0.5) * 0.04;

          const mat = p.mesh.material as THREE.MeshBasicMaterial;
          mat.opacity = Math.max(0, (1 - p.life / p.maxLife) * 0.22);
        }

        remainingParticles.push(p);
      }
    }
    particlesRef.current = remainingParticles;

    // 1. Render Wave Fronts spreading
    if (simulationState.isRuptured && simulationState.triggerTime && simulationState.epicenter) {
      const dtSec = (Date.now() - simulationState.triggerTime) / 1000;
      
      const pRadius = dtSec * simulationState.pWaveSpeed;
      const sRadius = dtSec * simulationState.sWaveSpeed;

      const epic = simulationState.epicenter;

      // Update P-Wave Mesh scaling
      if (pWaveMeshRef.current) {
        const pMesh = pWaveMeshRef.current;
        pMesh.position.set(epic.x, getTerrainHeight(epic.x, epic.z).height + 0.1, epic.z);
        pMesh.scale.set(pRadius, pRadius, 1);
        pMesh.material.opacity = Math.max(0, 1 - pRadius / 250) * 0.45;
      }

      // Update S-Wave Mesh scaling
      if (sWaveMeshRef.current) {
        const sMesh = sWaveMeshRef.current;
        sMesh.position.set(epic.x, getTerrainHeight(epic.x, epic.z).height + 0.15, epic.z);
        sMesh.scale.set(sRadius, sRadius, 1);
        sMesh.material.opacity = Math.max(0, 1 - sRadius / 250) * 0.8;
      }

      // --- SENSOR TRIGGER EVALUATION ---
      customSensorsRef.current.forEach((sensor) => {
        const dist = Math.hypot(sensor.x - epic.x, sensor.z - epic.z);

        // a) Trigger P-Wave
        if (pRadius >= dist && !sensor.pWaveTime) {
          // Calculate PGA based on distance attenuation and soil type
          const basePga = Math.pow(10, 0.5 * simulationState.magnitude - 2.5) * Math.exp(-0.015 * dist);
          const pga = basePga * SOIL_PROPERTIES[getTerrainHeight(sensor.x, sensor.z).type].shakingAmplification;
          
          // MMI estimate
          let mmi = Math.round(3.0 * Math.log10(pga * 980) - 0.5);
          mmi = Math.max(1, Math.min(12, mmi));

          onSensorTrigger(sensor.id, 'p', mmi, pga);

          // Blink sensor bulb yellow
          const sensorMesh = sensorMeshesRef.current[sensor.id];
          if (sensorMesh) {
            const bulb = sensorMesh.children[1] as THREE.Mesh;
            (bulb.material as THREE.MeshBasicMaterial).color.set('#facc15'); // Blinking Yellow
          }
        }

        // b) Trigger S-Wave
        if (sRadius >= dist && !sensor.sWaveTime) {
          // S-wave triggers actual violent shaking metrics
          const basePga = Math.pow(10, 0.55 * simulationState.magnitude - 2.0) * Math.exp(-0.02 * dist);
          const pga = basePga * SOIL_PROPERTIES[getTerrainHeight(sensor.x, sensor.z).type].shakingAmplification;
          let mmi = Math.round(3.0 * Math.log10(pga * 980) - 0.5);
          mmi = Math.max(1, Math.min(12, mmi));

          onSensorTrigger(sensor.id, 's', mmi, pga);

          // Change sensor bulb to rapid flashing red
          const sensorMesh = sensorMeshesRef.current[sensor.id];
          if (sensorMesh) {
            const bulb = sensorMesh.children[1] as THREE.Mesh;
            (bulb.material as THREE.MeshBasicMaterial).color.set('#dc2626'); // Flashing Red
          }
        }
      });

      // Update Downtown S-wave ETA Countdown
      // Downtown SF is roughly at (60, -85)
      const distToDowntown = Math.hypot(60 - epic.x, -85 - epic.z);
      const sWaveTimeToDowntown = distToDowntown / simulationState.sWaveSpeed;
      const warningCountdown = Math.max(0, sWaveTimeToDowntown - dtSec);
      onWarningCountdownUpdate(Math.round(warningCountdown * 10) / 10);

      // --- BUILDING SHAKING & DAMAGE PROGRESSION ---
      buildings.forEach((building) => {
        const dist = Math.hypot(building.x - epic.x, building.z - epic.z);
        const group = buildingMeshesRef.current[building.id];

        if (group) {
          // Dynamic traverse to update structural stress glows & fracture wireframe opacities in real-time
          group.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              const mat = child.material as THREE.MeshStandardMaterial;
              if (mat && mat.emissive) {
                const maxDamageRatio = Math.min(1.0, building.damage / 100);
                // Pulse hot crimson stress color when actively shaking
                let pulse = 1.0;
                if (sRadius >= dist) {
                  pulse = 1.0 + 0.65 * Math.sin(currentTime * 0.05);
                }
                mat.emissive.set('#f43f5e');
                mat.emissiveIntensity = maxDamageRatio * 1.8 * pulse;
              }
            } else if (child instanceof THREE.LineSegments && child.name === 'stress-cracks') {
              const lineMat = child.material as THREE.LineBasicMaterial;
              if (lineMat) {
                const opacity = Math.max(0, Math.min(0.95, (building.damage - 8) / 55));
                lineMat.opacity = opacity;
                if (sRadius >= dist && building.damage > 8) {
                  // Crack lines flicker dynamically with intense tectonic stress during shaking
                  lineMat.opacity = opacity * (0.45 + 0.55 * Math.sin(currentTime * 0.09));
                }
              }
            }
          });

          if (sRadius >= dist) {
            // Shaking active!
            const tS = dtSec - dist / simulationState.sWaveSpeed; // seconds since S-wave hit
            const decay = Math.max(0, 1 - tS / 20) * Math.max(0.1, 75 / (dist + 40));

            const ampRatio = Math.pow(10, simulationState.magnitude - 5.0) / 120;
            const soilAmp = SOIL_PROPERTIES[building.soilType].shakingAmplification;

            // Height-based resonance frequency (taller buildings sway slower, shorter shake faster)
            const freq = 30.0 / Math.sqrt(building.height + 1); 
            
            // Build oscillation
            const swayX = Math.sin(currentTime * 0.006 * freq) * ampRatio * soilAmp * decay * (building.height * 0.18);
            const swayZ = Math.cos(currentTime * 0.007 * freq + Math.PI/4) * ampRatio * soilAmp * decay * (building.height * 0.18);

            // Add sharp high-frequency micro-shudder/jitter proportional to soil resonance and local acceleration
            const jitterFreq = 95.0 + 35.0 * soilAmp;
            const jitterAmp = 0.045 * ampRatio * soilAmp * decay;
            const jitterX = Math.sin(currentTime * jitterFreq) * jitterAmp;
            const jitterZ = Math.cos(currentTime * jitterFreq * 1.15) * jitterAmp;

            // Animate group sway rotation and translate
            const mesh = group.children[0] as THREE.Mesh;
            mesh.rotation.z = swayX * 0.05 + jitterX * 0.32;
            mesh.rotation.x = swayZ * 0.05 + jitterZ * 0.32;

            // Wobble mesh horizontally if foundation is loosening under severe damage
            if (building.damage > 20) {
              const looseWobble = (building.damage / 100) * 0.18 * Math.sin(currentTime * 0.07);
              mesh.position.x = looseWobble;
              mesh.position.z = looseWobble;
            }

            // Spawn crumbling debris and concrete dust particles according to earthquake shaking rate and current damage
            if (building.damage > 8 && Math.random() < 0.15 * soilAmp) {
              const spawnY = getTerrainHeight(building.x, building.z).height + Math.random() * building.height;
              spawnParticle(building.x, spawnY, building.z, 'debris');
            }
            if (building.damage > 18 && Math.random() < 0.22 * soilAmp) {
              const baseH = getTerrainHeight(building.x, building.z).height + 0.3;
              spawnParticle(building.x, baseH, building.z, 'dust');
            }

            // Damage formulation based on peak sways sustained over structural limits
            const force = Math.hypot(swayX, swayZ) * (1 / (building.stories * 0.3 + 1));
            let damageResistance = 1.0;
            if (building.id === 'salesforce-tower' || building.id === 'transamerica-pyramid') {
              damageResistance = 0.1; // extreme resilient skyscrapers
            } else if (building.type === 'infrastructure') {
              damageResistance = 0.25;
            } else if (building.soilType === 'sandy-fill') {
              damageResistance = 1.5; // ground liquefies, amplifying damage
            }

            const frameDamage = Math.max(0, force * 0.18 * damageResistance - 0.02);
            const accumulatedDamage = Math.min(100, building.damage + frameDamage);

            if (accumulatedDamage > building.damage) {
              // Tilt structure permanently and sink if soil is sandy fill (liquefaction)
              let tiltX = 0;
              let tiltZ = 0;
              if (accumulatedDamage > 40) {
                tiltX = (accumulatedDamage / 100) * 0.12 * (Math.random() - 0.5);
                tiltZ = (accumulatedDamage / 100) * 0.12 * (Math.random() - 0.5);
              }
              onBuildingDamage(building.id, accumulatedDamage, tiltX, tiltZ);
            }
          }
        }
      });
    } else {
      // Shaking inactive, reset wave meshes, reset building mesh tilts to current permanent state
      if (pWaveMeshRef.current) pWaveMeshRef.current.material.opacity = 0;
      if (sWaveMeshRef.current) sWaveMeshRef.current.material.opacity = 0;

      buildings.forEach((building) => {
        const group = buildingMeshesRef.current[building.id];
        if (group) {
          const mesh = group.children[0] as THREE.Mesh;
          mesh.rotation.set(building.currentTiltX, 0, building.currentTiltZ);
          mesh.position.x = 0;
          mesh.position.z = 0;

          // Sink building for liquefaction
          if (building.damage > 20 && building.soilType === 'sandy-fill') {
            const sinkAmount = (building.damage / 100) * 3.5;
            mesh.position.y = building.height / 2 - sinkAmount;
          } else {
            mesh.position.y = building.height / 2;
          }

          // Dynamic traverse to keep structural stress glows & fracture wireframe opacities visible statically
          group.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              const mat = child.material as THREE.MeshStandardMaterial;
              if (mat && mat.emissive) {
                const maxDamageRatio = Math.min(1.0, building.damage / 100);
                mat.emissive.set('#f43f5e');
                mat.emissiveIntensity = maxDamageRatio * 1.8;
              }
            } else if (child instanceof THREE.LineSegments && child.name === 'stress-cracks') {
              const lineMat = child.material as THREE.LineBasicMaterial;
              if (lineMat) {
                lineMat.opacity = Math.max(0, Math.min(0.95, (building.damage - 8) / 55));
              }
            }
          });
        }
      });

      // Reset seismometer bulb colors to inactive (unless custom has its own)
      seismometers.forEach((sensor) => {
        const sensorMesh = sensorMeshesRef.current[sensor.id];
        if (sensorMesh) {
          const bulb = sensorMesh.children[1] as THREE.Mesh;
          (bulb.material as THREE.MeshBasicMaterial).color.set(
            sensor.sWaveTime ? '#dc2626' : sensor.pWaveTime ? '#facc15' : '#78716c'
          );
        }
      });
    }

    // 2. PROJECT 3D LABELS ONTO 2D SCREEN SPACE
    const newLabels: ScreenLabel[] = [];

    // Project landmark buildings
    buildings.forEach((b) => {
      if (b.type === 'landmark' || b.id === 'salesforce-tower' || b.id === 'transamerica-pyramid' || b.id === 'coit-tower') {
        const pos = new THREE.Vector3(b.x, b.y + b.height, b.z);
        pos.project(camera);

        const widthHalf = renderer.domElement.clientWidth / 2;
        const heightHalf = renderer.domElement.clientHeight / 2;

        const x = pos.x * widthHalf + widthHalf;
        const y = -pos.y * heightHalf + heightHalf;

        // Check if behind camera
        const visible = pos.z < 1.0;

        newLabels.push({
          id: b.id,
          text: b.name,
          x,
          y,
          visible,
          type: 'landmark',
          status: b.damage > 10 ? `Damage: ${Math.round(b.damage)}%` : undefined,
        });
      }
    });

    // Project seismometers
    seismometers.forEach((s) => {
      const pos = new THREE.Vector3(s.x, s.y + 4.5, s.z);
      pos.project(camera);

      const widthHalf = renderer.domElement.clientWidth / 2;
      const heightHalf = renderer.domElement.clientHeight / 2;

      const x = pos.x * widthHalf + widthHalf;
      const y = -pos.y * heightHalf + heightHalf;
      const visible = pos.z < 1.0;

      newLabels.push({
        id: s.id,
        text: s.isCustom ? 'Custom Seismometer' : s.name.split(' (')[0],
        x,
        y,
        visible,
        type: 'sensor',
        status: s.sWaveTime ? 'S-Wave Hit' : s.pWaveTime ? 'P-Wave Hit' : 'Monitoring',
        mmi: s.mmiMeasured > 1 ? s.mmiMeasured : undefined,
      });
    });

    // Project epicenter if set
    if (simulationState.epicenter) {
      const epic = simulationState.epicenter;
      const pos = new THREE.Vector3(epic.x, getTerrainHeight(epic.x, epic.z).height + 6, epic.z);
      pos.project(camera);

      const widthHalf = renderer.domElement.clientWidth / 2;
      const heightHalf = renderer.domElement.clientHeight / 2;

      const x = pos.x * widthHalf + widthHalf;
      const y = -pos.y * heightHalf + heightHalf;
      const visible = pos.z < 1.0;

      newLabels.push({
        id: 'epicenter-label',
        text: 'EPICENTER',
        x,
        y,
        visible,
        type: 'epicenter',
        status: `Magnitude: M${simulationState.magnitude}`,
      });
    }

    setLabels(newLabels);

    // 3. Render Three scene
    renderer.render(scene, camera);
  };

  return (
    <div className="relative w-full h-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden select-none" ref={containerRef} id="3d-map-container">
      {/* 3D Canvas Rendering Target */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Floating 2D Screen Labels overlay */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {labels.map((label) => {
          if (!label.visible || label.x < 0 || label.y < 0 || label.x > (containerRef.current?.clientWidth || 900) || label.y > (containerRef.current?.clientHeight || 600)) {
            return null;
          }

          let styleClass = '';
          if (label.type === 'epicenter') {
            styleClass = 'bg-rose-600/90 text-white border-rose-400 font-bold animate-pulse text-xs';
          } else if (label.type === 'sensor') {
            if (label.status === 'S-Wave Hit') {
              styleClass = 'bg-red-500 text-white border-red-400 font-semibold text-[10px]';
            } else if (label.status === 'P-Wave Hit') {
              styleClass = 'bg-yellow-500 text-slate-950 border-yellow-300 font-semibold text-[10px] animate-pulse';
            } else {
              styleClass = 'bg-slate-800/80 text-slate-300 border-slate-600 text-[9px]';
            }
          } else {
            // Landmark label
            styleClass = label.status ? 'bg-amber-600 text-white border-amber-400 text-[10px]' : 'bg-slate-950/70 text-slate-300 border-slate-800 text-[10px]';
          }

          return (
            <div
              key={label.id}
              style={{ left: `${label.x}px`, top: `${label.y}px` }}
              className={`absolute -translate-x-1/2 -translate-y-full mb-2 px-2 py-1 rounded border shadow-lg backdrop-blur-[2px] transition-all pointer-events-auto cursor-pointer ${styleClass}`}
              onClick={() => {
                if (label.type === 'sensor') {
                  onSelectSensor(label.id);
                }
              }}
            >
              <div className="flex items-center gap-1">
                {label.type === 'landmark' && <Landmark className="w-3 h-3 text-sky-400" />}
                {label.type === 'sensor' && <Radio className="w-3 h-3 text-amber-400" />}
                {label.type === 'epicenter' && <AlertTriangle className="w-3.5 h-3.5 text-white" />}
                <span>{label.text}</span>
              </div>
              {label.status && <div className="text-[8px] opacity-90 border-t border-white/20 mt-0.5 pt-0.5">{label.status}</div>}
              {label.mmi && (
                <div className="text-[9px] font-bold text-red-400 mt-0.5">
                  MMI: {['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][label.mmi - 1]}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Control overlay on upper-right/left corners */}
      <div className="absolute top-4 left-4 flex flex-col gap-2 pointer-events-auto">
        <button
          onClick={() => setPlaceSensorMode(!placeSensorMode)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold shadow-md transition-all border ${
            placeSensorMode
              ? 'bg-pink-600 text-white border-pink-400 animate-pulse'
              : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
          }`}
        >
          <Radio className="w-4 h-4" />
          {placeSensorMode ? 'Click map to place sensor...' : 'Place Seismometer'}
        </button>

        <div className="bg-slate-900/90 border border-slate-800 backdrop-blur-md rounded-xl p-2.5 flex items-center gap-3 shadow-lg">
          <span className="text-[11px] text-slate-400 font-medium">Map Overlay:</span>
          <div className="flex gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => setSoilOverlay('none')}
              className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all ${
                soilOverlay === 'none' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Natural Map
            </button>
            <button
              onClick={() => setSoilOverlay('soil')}
              className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all ${
                soilOverlay === 'soil' ? 'bg-amber-600/25 text-amber-400 border border-amber-600/30' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Geology Soil Map
            </button>
          </div>
        </div>
      </div>

      {/* Legend showing soil properties overlay details */}
      {soilOverlay === 'soil' && (
        <div className="absolute bottom-4 left-4 bg-slate-950/95 border border-slate-800/90 backdrop-blur-md rounded-2xl p-4 max-w-[280px] shadow-2xl pointer-events-auto">
          <div className="flex items-center gap-1.5 mb-2 border-b border-slate-800 pb-1.5">
            <Shield className="w-3.5 h-3.5 text-sky-400" />
            <h4 className="text-[11px] font-bold text-slate-300 tracking-wider uppercase">Geological Soil Zones</h4>
          </div>
          <div className="space-y-2 text-[10px]">
            <div className="flex items-start gap-2">
              <span className="w-3 h-3 bg-[#475569] rounded mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold text-slate-200">Solid Bedrock (0.8x Shake)</span>
                <p className="text-slate-400 text-[9px] mt-0.5">Metamorphic chert/sandstone. Minimizes wave amplitude.</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-3 h-3 bg-[#eab308] rounded mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold text-amber-400">Sandy Fill (1.8x Shake - Extreme Liquefaction)</span>
                <p className="text-slate-400 text-[9px] mt-0.5">Waterfront landfill/Marina. Liquefies and causes tilting/sinking.</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-3 h-3 bg-[#a3e635] rounded mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold text-lime-400">Bay Mud & Alluvium (1.5x Shake)</span>
                <p className="text-slate-400 text-[9px] mt-0.5">Mission/SoMa silts. Induces slow, jelly-like building resonances.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Helper floating drag guide */}
      <div className="absolute bottom-4 right-4 bg-slate-950/80 border border-slate-800 text-[10px] text-slate-400 px-3 py-1.5 rounded-full backdrop-blur-sm select-none">
        Drag to Orbit | Scroll to Zoom
      </div>
    </div>
  );
}
